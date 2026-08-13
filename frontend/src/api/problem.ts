/**
 * API error normalization.
 *
 * FastAPI emits validation errors as:
 *   { detail: [{ loc: ["body", "field"], msg: "...", type: "..." }, ...] }
 * and other errors as:
 *   { detail: "human readable string" }
 *
 * `normalizeError` converts either shape into a structured {@link ApiProblem}
 * that the UI can render generically (title + detail + per-field messages)
 * and that retry logic can inspect via `retryable`.
 */

/** A normalized, UI-ready representation of an API failure. */
export interface ApiProblem {
  status: number;
  title: string;
  detail: string;
  fieldErrors: Record<string, string[]>;
  retryable: boolean;
}

/**
 * Shape of a single FastAPI validation error entry.
 * `loc` is a path array whose first element is usually "body", "query", etc.
 */
interface FastApiDetailEntry {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
}

/** Any plausible FastAPI error body. */
type FastApiErrorBody = unknown;

/** HTTP statuses that are safe to retry automatically. */
const RETRYABLE_STATUSES = new Set<number>([408, 429, 500, 502, 503, 504]);

function isObject(value: FastApiErrorBody): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/**
 * Derive a short, human-facing title for an HTTP status.
 * Falls back to a generic "Request failed" message.
 */
function titleForStatus(status: number): string {
  switch (status) {
    case 400:
      return "Bad request";
    case 401:
      return "Authentication required";
    case 403:
      return "Not allowed";
    case 404:
      return "Not found";
    case 408:
      return "Request timed out";
    case 409:
      return "Conflict";
    case 422:
      return "Validation failed";
    case 429:
      return "Too many requests";
    default:
      if (status >= 500) return "Server error";
      if (status >= 400) return "Request failed";
      return "Request failed";
  }
}

/**
 * Convert a FastAPI validation `detail` array into a per-field error map.
 * The `loc` path beyond the first segment (e.g. "body") is joined with "."
 * to form the field key; when no usable field is present the entry is placed
 * under a synthetic "_form" key so the message is never lost.
 */
function extractFieldErrors(detail: unknown): Record<string, string[]> {
  if (!Array.isArray(detail)) return {};

  const fieldErrors: Record<string, string[]> = {};

  for (const entry of detail) {
    if (!isObject(entry)) continue;

    const message =
      typeof entry.msg === "string" && entry.msg.trim().length > 0
        ? entry.msg
        : typeof entry.type === "string" && entry.type.trim().length > 0
          ? entry.type
          : "Invalid value";

    const loc = Array.isArray(entry.loc) ? entry.loc : [];
    // Drop the leading scope segment ("body", "query", "path") when present.
    const pathSegments = loc.slice(1).map((seg) => String(seg));
    const fieldKey =
      pathSegments.length > 0 ? pathSegments.join(".") : "_form";

    (fieldErrors[fieldKey] ??= []).push(message);
  }

  return fieldErrors;
}

/**
 * Convert a human-facing detail string from the response body.
 *
 * - FastAPI string `detail` is used directly.
 * - A `detail` array with validation entries is summarized into a single line.
 * - A `detail` object with an `errors` array (the BIC/IBAN validators return
 *   `{ detail: { errors: [...] } }`) is joined into a single line.
 * - Falls back to a status-appropriate message when the body is unhelpful.
 */
function extractDetail(body: FastApiErrorBody, status: number): string {
  if (isObject(body) && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;

    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail.trim();
    }

    if (Array.isArray(detail) && detail.length > 0) {
      const count = detail.length;
      return count === 1
        ? "1 validation error"
        : `${count} validation errors`;
    }

    if (isObject(detail) && Array.isArray(detail.errors) && detail.errors.length > 0) {
      return detail.errors
        .filter((message): message is string => typeof message === "string")
        .join(" ");
    }
  }

  return status >= 500
    ? "The server could not complete the request. Please try again."
    : "The request could not be completed.";
}

/**
 * Normalize a non-2xx HTTP response into an {@link ApiProblem}.
 *
 * @param status HTTP status code from the response.
 * @param body   Parsed JSON body (may be anything; unhelpful shapes degrade gracefully).
 */
export function normalizeError(status: number, body: FastApiErrorBody): ApiProblem {
  const safeStatus = Number.isFinite(status) ? status : 0;

  const fieldErrors =
    isObject(body) && "detail" in body && Array.isArray((body as { detail: unknown }).detail)
      ? extractFieldErrors((body as { detail: unknown }).detail)
      : {};

  return {
    status: safeStatus,
    title: titleForStatus(safeStatus),
    detail: extractDetail(body, safeStatus),
    fieldErrors,
    retryable: isRetryableStatus(safeStatus),
  };
}

/**
 * Type guard narrowing an unknown thrown value to an {@link ApiProblem}.
 * Useful for consumers that want to distinguish transport errors from others
 * (e.g. a ZodError).
 */
export function isApiProblem(value: unknown): value is ApiProblem {
  return (
    isObject(value) &&
    typeof value.status === "number" &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    typeof value.retryable === "boolean" &&
    (value.fieldErrors === undefined ||
      (isObject(value.fieldErrors) &&
        Object.values(value.fieldErrors).every(
          (arr) => Array.isArray(arr) && arr.every((v) => typeof v === "string"),
        )))
  );
}

/** Re-exported so callers can use the FastAPI detail-entry type if needed. */
export type { FastApiDetailEntry };
