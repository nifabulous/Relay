import type { ErrorEvent, SpanJSON, TransactionEvent } from "@sentry/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFrontendSentryOptions,
  sanitizeErrorEvent,
  sanitizeSpan,
  sanitizeTransactionEvent,
} from "./observability";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("frontend Sentry observability", () => {
  it("does not configure the SDK when the public DSN is absent", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");

    expect(buildFrontendSentryOptions()).toBeNull();
  });

  it("configures privacy-safe error and trace collection", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "preview");
    vi.stubEnv("VITE_SENTRY_TRACES_SAMPLE_RATE", "0.25");

    const options = buildFrontendSentryOptions();

    expect(options).not.toBeNull();
    expect(options?.dsn).toContain("example.ingest.sentry.io");
    expect(options?.environment).toBe("preview");
    expect(options?.tracesSampleRate).toBe(0.25);
    expect(options?.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    });
    expect(options?.beforeBreadcrumb?.({ category: "fetch" })).toBeNull();
  });

  it("removes request, identity, breadcrumbs, and exception payload data", () => {
    const event: ErrorEvent = {
      type: undefined,
      message: "payment failed for iban GB29NWBK60161331926819",
      transaction: "/app/explore/banks/DEUTDEFF?account=123",
      request: { url: "https://relay.example/app?token=secret" },
      user: { id: "customer-123", email: "person@example.com" },
      breadcrumbs: [{ category: "console", message: "secret input" }],
      extra: { form: { iban: "GB29NWBK60161331926819" } },
      exception: {
        values: [{
          type: "Error",
          value: "secret error detail",
          stacktrace: { frames: [{ filename: "app.js", vars: { iban: "secret" } }] },
        }],
      },
    };

    const sanitized = sanitizeErrorEvent(event);

    expect(sanitized.message).toBe("[REDACTED_ERROR]");
    expect(sanitized.transaction).toBe("[REDACTED_ROUTE]");
    expect(sanitized.request).toBeUndefined();
    expect(sanitized.user).toBeUndefined();
    expect(sanitized.breadcrumbs).toBeUndefined();
    expect(sanitized.extra).toBeUndefined();
    expect(sanitized.exception?.values?.[0]?.value).toBe("[REDACTED_ERROR]");
    expect(sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toBeUndefined();
  });

  it("keeps only safe route and status information in trace events", () => {
    const event: TransactionEvent = {
      type: "transaction",
      transaction: "GET /api/lookup?bic=DEUTDEFF&account=123",
      request: { url: "https://relay.example/api/lookup?bic=DEUTDEFF" },
      user: { id: "customer-123" },
      spans: [{
        trace_id: "trace",
        span_id: "span",
        start_timestamp: 1,
        timestamp: 2,
        data: { "http.method": "GET", "http.status_code": 200, "http.query": "secret" },
        description: "GET https://relay.example/api/lookup?bic=DEUTDEFF",
      }],
    };

    const sanitized = sanitizeTransactionEvent(event);

    expect(sanitized.transaction).toBe("GET /api/lookup");
    expect(sanitized.request).toBeUndefined();
    expect(sanitized.user).toBeUndefined();
    expect(sanitized.spans?.[0]?.description).toBe("GET /api/lookup");
    expect(sanitized.spans?.[0]?.data).toEqual({
      "http.method": "GET",
      "http.status_code": 200,
    });
  });

  it("sanitizes child spans without dropping them", () => {
    const span: SpanJSON = {
      trace_id: "trace",
      span_id: "span",
      start_timestamp: 1,
      timestamp: 2,
      data: { "http.method": "POST", "http.request.body": "secret" },
      description: "POST /api/verify-payee?iban=secret",
    };

    const sanitized = sanitizeSpan(span);

    expect(sanitized).toBe(span);
    expect(sanitized.description).toBe("POST /api/verify-payee");
    expect(sanitized.data).toEqual({ "http.method": "POST" });
  });
});
