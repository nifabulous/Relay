import * as Sentry from "@sentry/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFrontendSentryOptions } from "./observability";

afterEach(async () => {
  await Sentry.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("frontend Sentry browser transport", () => {
  it("does not transmit sensitive event fields in a browser Sentry request", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
    const requestBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (typeof init?.body === "string") requestBodies.push(init.body);
        return new Response(null, { status: 200 });
      }),
    );

    const options = buildFrontendSentryOptions();
    expect(options).not.toBeNull();
    Sentry.init(options!);
    Sentry.captureEvent({
      message: "payment failed for IBAN GB29NWBK60161331926819",
      transaction: "/api/lookup?iban=GB29NWBK60161331926819",
      request: {
        url: "https://relay.example/api/lookup?iban=GB29NWBK60161331926819",
        headers: { Cookie: "sid=secret-cookie", Authorization: "Bearer secret-token" },
        data: { iban: "GB29NWBK60161331926819" },
      },
      user: { id: "customer-123", email: "person@example.com" },
      breadcrumbs: [{ category: "console", message: "secret breadcrumb" }],
      extra: { iban: "GB29NWBK60161331926819" },
    });

    expect(await Sentry.flush(2_000)).toBe(true);
    const body = requestBodies.join("\n");
    expect(body).toContain("[REDACTED_ERROR]");
    expect(body).not.toContain("GB29NWBK60161331926819");
    expect(body).not.toContain("secret-cookie");
    expect(body).not.toContain("secret-token");
    expect(body).not.toContain("customer-123");
    expect(body).not.toContain("person@example.com");
    expect(body).not.toContain("secret breadcrumb");
  });
});
