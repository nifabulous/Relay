import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { apiRequest, apiPost } from "./client";
import { HealthResponseSchema } from "./schemas";
import type { ApiProblem } from "./problem";

describe("apiRequest", () => {
  describe("success", () => {
    it("parses a valid response with schema", async () => {
      server.use(
        http.get("/api/health", () =>
          HttpResponse.json({
            status: "ok",
            banks: 150,
            corridor_rules: 40,
            fedwire_banks: 0,
            fedach_banks: 0,
            ssi_records: 470,
          }),
        ),
      );

      const result = await apiRequest("/api/health", undefined, HealthResponseSchema);
      expect(result.status).toBe("ok");
      expect(result.banks).toBe(150);
    });

    it("returns raw body when no schema provided", async () => {
      server.use(
        http.get("/api/health", () =>
          HttpResponse.json({ custom: "data" }),
        ),
      );

      const result = await apiRequest("/api/health");
      expect(result).toEqual({ custom: "data" });
    });
  });

  describe("error normalization", () => {
    it("normalizes a FastAPI 422 validation error into ApiProblem with fieldErrors", async () => {
      server.use(
        http.post("/api/prepare-payment", () =>
          HttpResponse.json(
            {
              detail: [
                { loc: ["body", "currency"], msg: "invalid currency", type: "value_error" },
                { loc: ["body", "amount"], msg: "must be positive", type: "value_error" },
              ],
            },
            { status: 422 },
          ),
        ),
      );

      try {
        await apiPost("/api/prepare-payment", { currency: "XYZ", amount: -1 });
        expect.fail("Should have thrown");
      } catch (e) {
        const problem = e as ApiProblem;
        expect(problem.status).toBe(422);
        expect(problem.fieldErrors.currency).toEqual(["invalid currency"]);
        expect(problem.fieldErrors.amount).toEqual(["must be positive"]);
        expect(problem.retryable).toBe(false);
      }
    });

    it("marks 500 errors as retryable", async () => {
      server.use(
        http.get("/api/health", () =>
          HttpResponse.json({ detail: "Internal server error" }, { status: 500 }),
        ),
      );

      try {
        await apiRequest("/api/health");
        expect.fail("Should have thrown");
      } catch (e) {
        const problem = e as ApiProblem;
        expect(problem.status).toBe(500);
        expect(problem.retryable).toBe(true);
      }
    });

    it("marks 429 rate-limit as retryable", async () => {
      server.use(
        http.get("/api/health", () =>
          HttpResponse.json({ detail: "Too many requests" }, { status: 429 }),
        ),
      );

      try {
        await apiRequest("/api/health");
        expect.fail("Should have thrown");
      } catch (e) {
        const problem = e as ApiProblem;
        expect(problem.status).toBe(429);
        expect(problem.retryable).toBe(true);
      }
    });

    it("marks 400 as not retryable", async () => {
      server.use(
        http.get("/api/health", () =>
          HttpResponse.json({ detail: "Bad request" }, { status: 400 }),
        ),
      );

      try {
        await apiRequest("/api/health");
        expect.fail("Should have thrown");
      } catch (e) {
        const problem = e as ApiProblem;
        expect(problem.status).toBe(400);
        expect(problem.retryable).toBe(false);
      }
    });

    it("surfaces the backend's BIC guidance for an invalid BIC", async () => {
      // /api/lookup returns { detail: { errors: [...] } } for a malformed BIC.
      server.use(
        http.get("/api/health", () =>
          HttpResponse.json(
            { detail: { errors: ["Enter a valid SWIFT BIC — it must be 8 or 11 characters (you entered 4)."] } },
            { status: 400 },
          ),
        ),
      );

      try {
        await apiRequest("/api/health");
        expect.fail("Should have thrown");
      } catch (e) {
        const problem = e as ApiProblem;
        expect(problem.status).toBe(400);
        expect(problem.detail).toContain("8 or 11 characters");
        expect(problem.retryable).toBe(false);
      }
    });

    it("handles non-JSON error responses", async () => {
      server.use(
        http.get("/api/health", () =>
          new HttpResponse("Service Unavailable", { status: 503 }),
        ),
      );

      try {
        await apiRequest("/api/health");
        expect.fail("Should have thrown");
      } catch (e) {
        const problem = e as ApiProblem;
        expect(problem.status).toBe(503);
        expect(problem.retryable).toBe(true);
        expect(problem.title).toBeTruthy();
      }
    });

    it("handles string detail format", async () => {
      server.use(
        http.get("/api/health", () =>
          HttpResponse.json({ detail: "Something failed" }, { status: 403 }),
        ),
      );

      try {
        await apiRequest("/api/health");
        expect.fail("Should have thrown");
      } catch (e) {
        const problem = e as ApiProblem;
        expect(problem.status).toBe(403);
        expect(problem.detail).toContain("Something failed");
        expect(problem.retryable).toBe(false);
      }
    });
  });

  describe("cancellation", () => {
    it("converts AbortError to retryable ApiProblem", async () => {
      const controller = new AbortController();

      server.use(
        http.get("/api/health", async () => {
          await new Promise((r) => setTimeout(r, 1000));
          return HttpResponse.json({ status: "ok", banks: 1, corridor_rules: 1 });
        }),
      );

      const promise = apiRequest("/api/health", { signal: controller.signal });
      controller.abort();

      try {
        await promise;
        expect.fail("Should have thrown");
      } catch (e) {
        const problem = e as ApiProblem;
        expect(problem.status).toBe(0);
        expect(problem.retryable).toBe(true);
        expect(problem.title).toMatch(/cancel/i);
      }
    });
  });

  describe("network errors", () => {
    it("converts network failure to retryable ApiProblem", async () => {
      server.use(
        http.get("/api/health", () => HttpResponse.error()),
      );

      try {
        await apiRequest("/api/health");
        expect.fail("Should have thrown");
      } catch (e) {
        const problem = e as ApiProblem;
        expect(problem.retryable).toBe(true);
      }
    });
  });
});

describe("apiPost", () => {
  it("sends JSON body with Content-Type header", async () => {
    let capturedBody: unknown = null;
    let capturedContentType: string | null = null;

    server.use(
      http.post("/api/test", async ({ request }) => {
        capturedBody = await request.json();
        capturedContentType = request.headers.get("content-type");
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiPost("/api/test", { foo: "bar" });
    expect(capturedBody).toEqual({ foo: "bar" });
    expect(capturedContentType).toContain("application/json");
  });

  it("parses response with schema", async () => {
    server.use(
      http.post("/api/health-check", () =>
        HttpResponse.json({
          status: "ok",
          banks: 1,
          corridor_rules: 1,
        }),
      ),
    );

    const result = await apiPost("/api/health-check", {}, HealthResponseSchema);
    expect(result.status).toBe("ok");
  });
});
