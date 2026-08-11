import { describe, it, expect } from "vitest";
import { capstoneReducer, type CapstoneState } from "./capstoneMachine";

const initialState: CapstoneState = {
  step: 0,
  status: "details",
  paymentInput: {
    beneficiary_iban: "GB29NWBK60161331926819",
    beneficiary_name: "John Smith",
    currency: "GBP",
    amount: 5000,
  },
  results: {},
};

describe("capstoneReducer", () => {
  it("starts at step 0 (details)", () => {
    expect(initialState.step).toBe(0);
    expect(initialState.status).toBe("details");
  });

  it("advances from details to validating", () => {
    const next = capstoneReducer(initialState, { type: "SUBMIT_DETAILS", input: initialState.paymentInput });
    expect(next.status).toBe("validating");
    expect(next.paymentInput).toEqual(initialState.paymentInput);
  });

  it("stores validation result and advances to verifying", () => {
    const validating: CapstoneState = { ...initialState, status: "validating" };
    const next = capstoneReducer(validating, {
      type: "STEP_SUCCESS",
      step: 0,
      result: { valid: true, bic: "NWBKGB2L", errors: [] },
    });
    expect(next.status).toBe("verifying");
    expect(next.results.validation).toEqual({ valid: true, bic: "NWBKGB2L", errors: [] });
    expect(next.step).toBe(1);
  });

  it("goes to error state on validation failure", () => {
    const validating: CapstoneState = { ...initialState, status: "validating" };
    const next = capstoneReducer(validating, {
      type: "STEP_ERROR",
      error: "Invalid IBAN",
    });
    expect(next.status).toBe("error");
    expect(next.error).toBe("Invalid IBAN");
  });

  it("clears downstream results when payment input changes", () => {
    const advanced: CapstoneState = {
      ...initialState,
      step: 3,
      status: "settling",
      results: {
        validation: { valid: true, bic: "NWBKGB2L", errors: [] },
        vop: { outcome: "MATCH", advice: "ok" },
        routing: { suggested_intermediaries: [{ bic: "CITIUS33", bank: "Citibank", corridor: "USD", confidence: "high" }] },
      },
    };
    const next = capstoneReducer(advanced, { type: "EDIT_INPUT", input: { ...initialState.paymentInput, amount: 3000 } });
    // Should reset to step 0 and clear all results
    expect(next.step).toBe(0);
    expect(next.status).toBe("details");
    expect(next.results).toEqual({});
  });

  it("supports retry from error state", () => {
    const errored: CapstoneState = { ...initialState, status: "error", step: 1, error: "VoP failed" };
    const next = capstoneReducer(errored, { type: "RETRY" });
    expect(next.status).toBe("verifying");
    expect(next.error).toBeUndefined();
  });

  it("reaches complete after all 6 steps", () => {
    const deciding: CapstoneState = {
      ...initialState,
      step: 5,
      status: "deciding",
      results: {
        validation: { valid: true, bic: "NWBKGB2L", errors: [] },
        vop: { outcome: "MATCH", advice: "ok" },
        routing: { suggested_intermediaries: [] },
        ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: true },
        recommendation: { recommendation: "PROCEED", reason: "ok", is_blocking: false, uetr: "test", warnings: [], blocks: [] },
      },
    };
    const next = capstoneReducer(deciding, {
      type: "STEP_SUCCESS",
      step: 5,
      result: { uetr: "test-uetr", current_status: "CREDITED", is_terminal: true, timeline: [] },
    });
    expect(next.status).toBe("complete");
  });

  it("resets to initial state on RESTART", () => {
    const complete: CapstoneState = { ...initialState, status: "complete", step: 6 };
    const next = capstoneReducer(complete, { type: "RESTART" });
    expect(next.status).toBe("details");
    expect(next.step).toBe(0);
    expect(next.results).toEqual({});
  });

  it("pauses at verify step on NO_MATCH (does not auto-advance)", () => {
    const verifying: CapstoneState = { ...initialState, step: 1, status: "verifying" };
    const next = capstoneReducer(verifying, {
      type: "STEP_SUCCESS",
      step: 1,
      result: { outcome: "NO_MATCH", score: 0.1, advice: "Name does not match." },
    });
    // Should store the result but NOT advance to routing
    expect(next.results.vop).toBeDefined();
    expect(next.results.vop?.outcome).toBe("NO_MATCH");
    // Should pause — stay at step 1, status should be "blocked" not "routing"
    expect(next.step).toBe(1);
    expect(next.status).toBe("blocked");
  });

  it("can proceed past NO_MATCH when the learner acknowledges it", () => {
    const blocked: CapstoneState = {
      ...initialState,
      step: 1,
      status: "blocked",
      results: { vop: { outcome: "NO_MATCH", score: 0.1, advice: "Name does not match." } },
    };
    const next = capstoneReducer(blocked, { type: "PROCEED_ANYWAY" });
    expect(next.status).toBe("routing");
    expect(next.step).toBe(2);
  });

  it("advances normally on MATCH", () => {
    const verifying: CapstoneState = { ...initialState, step: 1, status: "verifying" };
    const next = capstoneReducer(verifying, {
      type: "STEP_SUCCESS",
      step: 1,
      result: { outcome: "MATCH", score: 1.0, advice: "Name matches." },
    });
    expect(next.status).toBe("routing");
    expect(next.step).toBe(2);
  });

  it("advances normally on CLOSE_MATCH", () => {
    const verifying: CapstoneState = { ...initialState, step: 1, status: "verifying" };
    const next = capstoneReducer(verifying, {
      type: "STEP_SUCCESS",
      step: 1,
      result: { outcome: "CLOSE_MATCH", score: 0.82, account_holder_name: "John Smith", advice: "Close match." },
    });
    expect(next.status).toBe("routing");
    expect(next.step).toBe(2);
  });
});
