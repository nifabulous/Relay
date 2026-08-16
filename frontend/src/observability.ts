import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import type { ErrorEvent, Exception, SpanJSON, StackFrame, TransactionEvent } from "@sentry/core";
import type { BrowserOptions } from "@sentry/react";

const REDACTED_ERROR = "[REDACTED_ERROR]";
const REDACTED_ROUTE = "[REDACTED_ROUTE]";
const SAFE_SPAN_DATA_KEYS = new Set([
  "http.method",
  "http.status_code",
  "http.response.status_code",
]);
const SAFE_CONTEXT_FIELDS: Record<string, readonly string[]> = {
  app: ["app_name", "app_version", "app_build", "app_start_time"],
  browser: ["name", "version", "type"],
  device: ["family", "model", "brand", "type", "architecture"],
  os: ["name", "version", "build", "kernel_version", "type"],
  runtime: ["name", "version", "type", "build"],
  trace: ["trace_id", "span_id", "op", "status", "origin"],
};
const STATIC_RELAY_PATHS = new Set([
  "/",
  "/app",
  "/app/learn",
  "/app/learn/practice",
  "/app/explore",
  "/app/explore/banks",
  "/app/explore/schemes",
  "/app/explore/glossary",
  "/app/operate",
  "/app/operate/prepare",
  "/app/operate/tools",
  "/app/operate/fees",
  "/app/operate/screening",
  "/app/operate/value-date",
  "/app/operate/stp",
  "/app/operate/tracking",
  "/app/settings",
  "/api/health",
  "/api/validate",
  "/api/lookup",
  "/api/route",
  "/api/us-bank",
  "/api/ssi",
  "/api/verify-payee",
  "/api/track/create",
  "/api/schemes",
  "/api/schemes/international",
  "/api/prepare-payment",
  "/api/fees/simulate",
  "/api/screen",
  "/api/value-date",
  "/api/message/translate",
  "/api/message/pacs008-check",
  "/api/message/stp-check",
  "/api/progress",
  "/api/tutor/chat",
  "/api/import/fedwire",
  "/api/import/fedach",
  "/api/import/ssi",
]);

function sampleRate(rawValue: string | undefined, fallback: number): number {
  if (!rawValue?.trim()) return fallback;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "[invalid]";
  }
}

function canonicalizeRelayPath(pathname: string): string {
  const segments = pathname.split("/").map(decodePathSegment);
  const routeSegments = segments.slice(1).filter(Boolean);
  const normalizedPath = routeSegments.length > 0 ? `/${routeSegments.join("/")}` : "/";

  if (STATIC_RELAY_PATHS.has(normalizedPath)) return normalizedPath;

  if (
    routeSegments.length === 4 &&
    routeSegments[0] === "app" &&
    routeSegments[1] === "explore" &&
    routeSegments[2] === "banks"
  ) {
    return "/app/explore/banks/:bic";
  }

  if (
    routeSegments.length === 4 &&
    routeSegments[0] === "app" &&
    routeSegments[1] === "learn" &&
    routeSegments[2] === "cases"
  ) {
    return "/app/learn/cases/:caseId";
  }

  if (routeSegments.length === 3 && routeSegments[0] === "app" && routeSegments[1] === "learn") {
    return "/app/learn/:moduleId";
  }

  if (
    (routeSegments.length === 3 || routeSegments.length === 4) &&
    routeSegments[0] === "api" &&
    routeSegments[1] === "track"
  ) {
    return routeSegments.length === 4 && ["skip", "complete"].includes(routeSegments[3])
      ? `/api/track/:uetr/${routeSegments[3]}`
      : "/api/track/:uetr";
  }

  if (routeSegments[0] === "api") return "/api/[REDACTED_PATH]";
  if (routeSegments[0] === "app") return "/app/[REDACTED_PATH]";
  return "/[REDACTED_PATH]";
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

  pathname = canonicalizeRelayPath(pathname);

  return method ? `${method} ${pathname}` : pathname;
}

function sanitizeContexts(contexts: ErrorEvent["contexts"]): ErrorEvent["contexts"] {
  if (!contexts) return undefined;

  const sanitizedContexts: Record<string, Record<string, string | number | boolean>> = {};

  for (const [contextName, contextValue] of Object.entries(contexts)) {
    const allowedFields = SAFE_CONTEXT_FIELDS[contextName];
    if (!allowedFields || !contextValue || typeof contextValue !== "object" || Array.isArray(contextValue)) {
      continue;
    }

    const source = contextValue as Record<string, unknown>;
    const safeFields: Record<string, string | number | boolean> = {};
    for (const field of allowedFields) {
      const value = source[field];
      if (
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
      ) {
        safeFields[field] = value;
      }
    }

    if (Object.keys(safeFields).length > 0) sanitizedContexts[contextName] = safeFields;
  }

  return Object.keys(sanitizedContexts).length > 0 ? sanitizedContexts : undefined;
}

function safeIdentifier(value: string | undefined, maxLength = 128): string | undefined {
  if (!value || value.length > maxLength || !/^[A-Za-z0-9._:@/-]+$/.test(value)) return undefined;
  return value;
}

function sanitizeAssetPath(value: string | undefined): string | undefined {
  if (!value) return undefined;

  let pathname: string;
  try {
    pathname = new URL(value, "http://relay.invalid").pathname;
  } catch {
    return undefined;
  }

  return /^\/(?:app\/)?assets\/[A-Za-z0-9._-]+\.m?js$/.test(pathname) ? pathname : undefined;
}

function sanitizeStackFrame(frame: StackFrame): StackFrame {
  const sanitized: StackFrame = {};
  const filename = sanitizeAssetPath(frame.filename);
  const absPath = sanitizeAssetPath(frame.abs_path);
  if (filename) sanitized.filename = filename;
  if (absPath) sanitized.abs_path = absPath;
  if (typeof frame.function === "string" && frame.function.length <= 200) sanitized.function = frame.function;
  if (typeof frame.module === "string" && frame.module.length <= 200) sanitized.module = frame.module;
  if (typeof frame.platform === "string" && frame.platform.length <= 32) sanitized.platform = frame.platform;
  if (typeof frame.lineno === "number" && Number.isFinite(frame.lineno)) sanitized.lineno = frame.lineno;
  if (typeof frame.colno === "number" && Number.isFinite(frame.colno)) sanitized.colno = frame.colno;
  if (typeof frame.in_app === "boolean") sanitized.in_app = frame.in_app;
  if (typeof frame.instruction_addr === "string") sanitized.instruction_addr = safeIdentifier(frame.instruction_addr, 64);
  if (typeof frame.addr_mode === "string") sanitized.addr_mode = safeIdentifier(frame.addr_mode, 32);
  if (typeof frame.debug_id === "string") sanitized.debug_id = safeIdentifier(frame.debug_id, 64);
  return sanitized;
}

function sanitizeStacktrace(stacktrace: NonNullable<Exception["stacktrace"]>): Exception["stacktrace"] {
  return {
    frames: stacktrace.frames?.map(sanitizeStackFrame),
    frames_omitted:
      stacktrace.frames_omitted &&
      stacktrace.frames_omitted.every((value) => Number.isInteger(value) && value >= 0)
        ? stacktrace.frames_omitted
        : undefined,
  };
}

function sanitizeExceptionValues(event: ErrorEvent): ErrorEvent["exception"] {
  if (!event.exception?.values) return undefined;

  return {
    values: event.exception.values.map((exception) => ({
      type: safeIdentifier(exception.type, 64),
      value: REDACTED_ERROR,
      stacktrace: exception.stacktrace ? sanitizeStacktrace(exception.stacktrace) : undefined,
    })),
  };
}

function sanitizeDebugMeta(debugMeta: ErrorEvent["debug_meta"]): ErrorEvent["debug_meta"] {
  const images = debugMeta?.images?.flatMap((image) => {
    if (image.type !== "sourcemap") return [];
    const codeFile = sanitizeAssetPath(image.code_file);
    const debugId = safeIdentifier(image.debug_id, 64);
    return codeFile && debugId ? [{ type: "sourcemap" as const, code_file: codeFile, debug_id: debugId }] : [];
  });

  return images && images.length > 0 ? { images } : undefined;
}

function sanitizeEventMetadata(event: ErrorEvent | TransactionEvent) {
  return {
    event_id: safeIdentifier(event.event_id, 64),
    timestamp: typeof event.timestamp === "number" && Number.isFinite(event.timestamp) ? event.timestamp : undefined,
    start_timestamp:
      typeof event.start_timestamp === "number" && Number.isFinite(event.start_timestamp)
        ? event.start_timestamp
        : undefined,
    level: event.level,
    platform: event.platform === "javascript" ? event.platform : undefined,
    logger: safeIdentifier(event.logger, 128),
    release: safeIdentifier(event.release, 128),
    dist: safeIdentifier(event.dist, 128),
    environment: safeIdentifier(event.environment, 64),
    debug_meta: sanitizeDebugMeta(event.debug_meta),
  };
}

/** Remove payloads and identity fields before an error reaches Sentry. */
export function sanitizeErrorEvent(event: ErrorEvent): ErrorEvent {
  return {
    ...sanitizeEventMetadata(event),
    type: undefined,
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
  const safeData = Object.fromEntries(
    Object.entries(span.data ?? {}).filter(([key, value]) => {
      if (!SAFE_SPAN_DATA_KEYS.has(key)) return false;
      if (key === "http.method") return typeof value === "string" && /^[A-Z]{3,10}$/.test(value);
      return typeof value === "number" && Number.isFinite(value);
    }),
  );

  const sanitized: SpanJSON = {
    trace_id: span.trace_id,
    span_id: span.span_id,
    start_timestamp: span.start_timestamp,
    data: safeData,
    description: sanitizePathLike(span.description),
  };

  if (span.timestamp !== undefined) sanitized.timestamp = span.timestamp;
  if (span.parent_span_id !== undefined) sanitized.parent_span_id = span.parent_span_id;
  if (span.status !== undefined && /^[a-z0-9_.-]{1,64}$/i.test(span.status)) sanitized.status = span.status;
  if (span.op !== undefined && /^[a-z0-9_.-]{1,64}$/i.test(span.op)) sanitized.op = span.op;
  if (span.origin !== undefined) sanitized.origin = span.origin;
  if (span.is_segment !== undefined) sanitized.is_segment = span.is_segment;
  if (span.segment_id !== undefined) sanitized.segment_id = span.segment_id;

  return sanitized;
}

/** Remove request data from transactions while preserving route and status shape. */
export function sanitizeTransactionEvent(event: TransactionEvent): TransactionEvent {
  return {
    ...sanitizeEventMetadata(event),
    type: "transaction",
    transaction: sanitizePathLike(event.transaction),
    contexts: sanitizeContexts(event.contexts),
    spans: event.spans?.map(sanitizeSpan),
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
    // Relay uses relative same-origin API requests. Never propagate tracing
    // headers to arbitrary absolute URLs or third-party hosts.
    tracePropagationTargets: [/^\/api\//],
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
