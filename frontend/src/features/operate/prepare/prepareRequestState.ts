import type { PreparePaymentResponse } from "../../../api/schemas";

export type PrepareRequestState =
  | "idle"
  | "validating"
  | "checking"
  | "success"
  | "partial"
  | "error"
  | "stale";

export type PrepareStage = "Payment details" | "Run checks" | "Review route";

export interface PrepareRequestStateInput {
  isValidating?: boolean;
  isRequestActive?: boolean;
  requestError?: unknown | null;
  result?: PreparePaymentResponse | null;
  isStale?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExplicitUnavailable(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  return normalized === "unavailable" || normalized === "not_checked";
}

/**
 * Detect only an explicit sub-check status. Empty arrays and absent optional
 * evidence are deliberately not partial results.
 */
export function hasExplicitUnavailableOrNotChecked(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return [value.validation, value.vop, value.routing, value.ssi].some((subResult) => {
    if (!isRecord(subResult)) return false;
    return isExplicitUnavailable(subResult.status) || isExplicitUnavailable(subResult.outcome);
  });
}

/** Derive transport/presentation state in the required precedence order. */
export function derivePrepareRequestState({
  isValidating = false,
  isRequestActive = false,
  requestError = null,
  result = null,
  isStale = false,
}: PrepareRequestStateInput): PrepareRequestState {
  if (isValidating) return "validating";
  if (isRequestActive) return "checking";
  if (requestError) return "error";
  if (result && isStale) return "stale";
  if (!result) return "idle";
  if (hasExplicitUnavailableOrNotChecked(result)) return "partial";
  return "success";
}

export function getPrepareStage(state: PrepareRequestState): PrepareStage {
  switch (state) {
    case "idle":
      return "Payment details";
    case "validating":
    case "checking":
    case "error":
      return "Run checks";
    case "success":
    case "partial":
    case "stale":
      return "Review route";
  }
}

export const stageForPrepareRequestState = getPrepareStage;
