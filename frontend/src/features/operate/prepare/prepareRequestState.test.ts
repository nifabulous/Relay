import { describe, expect, it } from "vitest";
import type { PreparePaymentResponse } from "../../../api/schemas";
import {
  derivePrepareRequestState,
  getPrepareStage,
  hasExplicitUnavailableOrNotChecked,
  type PrepareRequestState,
} from "./prepareRequestState";

function result(overrides: Partial<PreparePaymentResponse> = {}): PreparePaymentResponse {
  return {
    recommendation: "PROCEED",
    reason: "Illustrative result",
    is_blocking: false,
    uetr: "uetr-1",
    validation: { valid: true, bic: "NWBKGB2LXXX", errors: [] },
    vop: { outcome: "MATCH", score: 1, account_holder_name: undefined, advice: "Matches" },
    routing: {
      beneficiary_country: "GB",
      inferred_currency: "GBP",
      suggested_intermediaries: [],
      routing_basis: "corridor-heuristic",
    },
    ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
    warnings: [],
    blocks: [],
    ...overrides,
  };
}

function state(input: Parameters<typeof derivePrepareRequestState>[0]): PrepareRequestState {
  return derivePrepareRequestState(input);
}

describe("prepare request state", () => {
  it("uses validating before every other state", () => {
    expect(state({ isValidating: true, isRequestActive: true, isStale: true })).toBe("validating");
  });

  it("uses checking for an active request even when an old result is stale", () => {
    expect(state({ isRequestActive: true, isStale: true, result: result() })).toBe("checking");
  });

  it("uses error for a request error even when an old result exists", () => {
    expect(state({ requestError: new Error("server"), isStale: true, result: result() })).toBe("error");
  });

  it("uses stale when an old result exists without an active request", () => {
    expect(state({ isStale: true, result: result() })).toBe("stale");
  });

  it("uses idle when there is no result", () => {
    expect(state({})).toBe("idle");
  });

  it("uses partial only when a sub-result is explicitly unavailable or not checked", () => {
    const notChecked = result({
      vop: { outcome: "NOT_CHECKED", score: undefined, account_holder_name: undefined, advice: "Unavailable" },
    });
    expect(hasExplicitUnavailableOrNotChecked(notChecked)).toBe(true);
    expect(state({ result: notChecked })).toBe("partial");
  });

  it("does not call empty optional result arrays partial", () => {
    expect(hasExplicitUnavailableOrNotChecked(result())).toBe(false);
    expect(state({ result: result() })).toBe("success");
  });
});

describe("prepare request stages", () => {
  it.each([
    ["idle", "Payment details"],
    ["validating", "Run checks"],
    ["checking", "Run checks"],
    ["error", "Run checks"],
    ["success", "Review route"],
    ["partial", "Review route"],
    ["stale", "Review route"],
  ] as const)("maps %s to %s", (requestState, expectedStage) => {
    expect(getPrepareStage(requestState)).toBe(expectedStage);
  });

  it("maps a completed validation error to payment details without changing stale state semantics", () => {
    expect(getPrepareStage("validating", { hasValidationError: true })).toBe("Run checks");
    expect(getPrepareStage("stale", { hasValidationError: true })).toBe("Payment details");
    expect(getPrepareStage("stale")).toBe("Review route");
  });
});
