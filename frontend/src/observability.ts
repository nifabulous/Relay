import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import type { ErrorEvent, SpanJSON, TransactionEvent } from "@sentry/core";
import type { BrowserOptions } from "@sentry/react";

const REDACTED_ERROR = "[REDACTED_ERROR]";
const REDACTED_ROUTE = "[REDACTED_ROUTE]";
const SAFE_SPAN_DATA_KEYS = new Set([
  "http.method",
  "http.status_code",
  "http.response.status_code",
]);
const SAFE_CONTEXT_KEYS = new Set(["app", "browser", "device", "os", "runtime", "trace"]);

function sampleRate(rawValue: string | undefined, fallback: number): number {
  if (!rawValue?.trim()) return fallback;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function sanitizePathLike(value: string | undefined): string | undefined {
  if (!value) return value;

  const trimmed = value.trim();
  const methodMatch = trimmed.match(/^([A-Z]+)\s+(.+)$/);
  const method = methodMatch?.[1];
  const target = methodMatch?.[2] ?? trimmed;
  let pathname: string;

  try {
    pathname = new URL(target, "http://relay.invalid").pathname;
  } catch {
    pathname = target.split(/[?#]/, 1)[0] ?? "/";
  }

  // Keep useful endpoint names while masking identifier-like path segments.
  pathname = pathname.replace(
    /\/(?:[A-Z]{4}[A-Z0-9]{2}[A-Z0-9]{3}|[0-9a-f]{8,}(?:-[0-9a-f-]{4,}){0,4}|[A-Za-z0-9_-]{16,})(?=\/|$)/g,
    "/:param",
  );

  return method ? `${method} ${pathname}` : pathname;
}

function sanitizeContexts(contexts: ErrorEvent["contexts"]): ErrorEvent["contexts"] {
  if (!contexts) return undefined;

  return Object.fromEntries(
    Object.entries(contexts).filter(([key]) => SAFE_CONTEXT_KEYS.has(key)),
  );
}

function sanitizeExceptionValues(event: ErrorEvent): ErrorEvent["exception"] {
  if (!event.exception?.values) return undefined;

  return {
    values: event.exception.values.map((exception) => ({
      type: exception.type,
      value: REDACTED_ERROR,
      stacktrace: exception.stacktrace
        ? {
            ...exception.stacktrace,
            frames: exception.stacktrace.frames?.map((frame) => {
              const { vars: _vars, context_line: _contextLine, pre_context: _preContext, post_context: _postContext, ...safeFrame } = frame;
              return safeFrame;
            }),
          }
        : undefined,
    })),
  };
}

/** Remove payloads and identity fields before an error reaches Sentry. */
export function sanitizeErrorEvent(event: ErrorEvent): ErrorEvent {
  return {
    ...event,
    message: event.message ? REDACTED_ERROR : undefined,
    transaction: event.transaction ? REDACTED_ROUTE : undefined,
    contexts: sanitizeContexts(event.contexts),
    exception: sanitizeExceptionValues(event),
    request: undefined,
    user: undefined,
    breadcrumbs: undefined,
    extra: undefined,
    tags: undefined,
    logentry: undefined,
  };
}

/** Keep only a small allowlist of non-sensitive HTTP status metadata. */
export function sanitizeSpan(span: SpanJSON): SpanJSON {
  span.description = sanitizePathLike(span.description);
  span.data = Object.fromEntries(
    Object.entries(span.data ?? {}).filter(([key, value]) => {
      if (!SAFE_SPAN_DATA_KEYS.has(key)) return false;
      if (key === "http.method") return typeof value === "string" && /^[A-Z]{3,10}$/.test(value);
      return typeof value === "number" && Number.isFinite(value);
    }),
  );
  return span;
}

/** Remove request data from transactions while preserving route and status shape. */
export function sanitizeTransactionEvent(event: TransactionEvent): TransactionEvent {
  return {
    ...event,
    transaction: sanitizePathLike(event.transaction),
    contexts: sanitizeContexts(event.contexts),
    request: undefined,
    user: undefined,
    breadcrumbs: undefined,
    extra: undefined,
    tags: undefined,
    logentry: undefined,
    spans: event.spans?.map((span) => sanitizeSpan({ ...span, data: { ...span.data } })),
  };
}

export function buildFrontendSentryOptions(): BrowserOptions | null {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return null;

  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || import.meta.env.MODE;
  const defaultTraceRate = environment === "development" ? 1 : 0.1;
  const release = import.meta.env.VITE_SENTRY_RELEASE?.trim();

  return {
    dsn,
    environment,
    release: release || undefined,
    integrations: [
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
        stripBasename: true,
      }),
    ],
    tracesSampleRate: sampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, defaultTraceRate),
    tracePropagationTargets: [/^\/api\//, /^https?:\/\/[^/]+\/api\//, "localhost"],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    beforeBreadcrumb: () => null,
    beforeSend: sanitizeErrorEvent,
    beforeSendSpan: sanitizeSpan,
    beforeSendTransaction: sanitizeTransactionEvent,
  };
}

export function initFrontendSentry(): boolean {
  const options = buildFrontendSentryOptions();
  if (!options) return false;

  Sentry.init(options);
  return true;
}
