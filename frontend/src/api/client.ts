/**
 * Typed HTTP transport for the Relay backend.
 *
 * Contract:
 *  - Always sends `Accept: application/json`.
 *  - Forwards `init.signal` (AbortSignal) untouched so callers can cancel.
 *  - Parses the response body as JSON exactly once.
 *  - On a non-2xx response, normalizes the failure via `normalizeError` and
 *    throws an {@link ApiProblem} (never a raw `Error`).
 *  - On a 2xx response, if a schema is provided the body is validated with
 *    `schema.parse()` (which may throw a ZodError); otherwise the raw parsed
 *    body is returned.
 *  - Network errors and malformed JSON are converted to an {@link ApiProblem}.
 *
 * Any value thrown from these helpers is therefore either an `ApiProblem`
 * (transport/server/validation-at-HTTP-layer failure) or a `ZodError`
 * (response-shape mismatch on a 2xx body).
 */

import type { ZodType } from "zod";
import { normalizeError, type ApiProblem } from "./problem";

/** Merge headers without mutating the caller's object. */
function withJsonHeaders(init: RequestInit | undefined): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  return { ...init, headers };
}

/** True for any 2xx status code. */
function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/** True when an error originated from an `AbortSignal` being aborted. */
function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

/**
 * Issue a request and return a parsed, optionally-validated body.
 *
 * @typeParam T   The expected response shape (inferred from `schema` when given).
 * @param path    Absolute or relative URL to fetch.
 * @param init    Standard `RequestInit` (method, headers, signal, body, ...).
 * @param schema  Optional Zod schema used to validate a 2xx body.
 */
export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  schema?: ZodType<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, withJsonHeaders(init));
  } catch (error) {
    // Honor AbortSignal rejections with a distinct, retryable problem so the
    // caller can treat cancellation uniformly if it chooses to.
    if (isAbortError(error)) {
      throw {
        status: 0,
        title: "Request canceled",
        detail: "The request was canceled before it could complete.",
        fieldErrors: {},
        retryable: true,
      } satisfies ApiProblem;
    }
    throw {
      status: 0,
      title: "Network error",
      detail:
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Could not reach the server. Check your connection and try again.",
      fieldErrors: {},
      retryable: true,
    } satisfies ApiProblem;
  }

  // Parse the body once. An empty body (204 / empty string) becomes `null`.
  let body: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      throw normalizeError(response.status, {
        detail: "The server returned a malformed response.",
      });
    }
  }

  if (!isOkStatus(response.status)) {
    throw normalizeError(response.status, body);
  }

  if (schema) {
    // `parse()` may throw a ZodError — that is intentional and documented.
    return schema.parse(body);
  }

  return body as T;
}

/**
 * POST a JSON body and return a parsed, optionally-validated response.
 *
 * Sets `Content-Type: application/json`, serializes `body` with
 * `JSON.stringify`, and delegates to {@link apiRequest} for headers, signal,
 * error handling, and schema validation.
 *
 * @typeParam T    The expected response shape.
 * @typeParam Body The request payload type (defaults to `unknown`).
 */
export async function apiPost<T, Body = unknown>(
  path: string,
  body: Body,
  schema?: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  return apiRequest<T>(path, {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, schema);
}

export type { ApiProblem };
