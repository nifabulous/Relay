/**
 * Capstone state machine — a 6-step payment simulation.
 *
 * Steps: details → validating → verifying → routing → settling → deciding → tracking → complete
 * Each step calls one API, stores the result, and advances to the next.
 * Editing payment input resets to step 0 and clears all results.
 */

export interface CapstonePaymentInput {
  beneficiary_iban: string;
  beneficiary_name: string;
  currency: string;
  amount: number;
}

export interface CapstoneResults {
  validation?: { valid: boolean; bic?: string; errors: string[] };
  vop?: { outcome: string; score?: number; account_holder_name?: string | null; advice: string };
  routing?: { beneficiary_country?: string; inferred_currency?: string; suggested_intermediaries: Array<{ bic: string; bank: string; corridor?: string; confidence: string }> };
  ssi?: { instructions: unknown[]; has_real_accounts: boolean; has_placeholders_only: boolean };
  recommendation?: { recommendation: string; reason: string; is_blocking: boolean; uetr: string; warnings: string[]; blocks: string[] };
  tracking?: { uetr: string; current_status: string; is_terminal: boolean; timeline: unknown[] };
}

export type CapstoneStepStatus =
  | "details"
  | "validating"
  | "verifying"
  | "routing"
  | "settling"
  | "deciding"
  | "tracking"
  | "complete"
  | "blocked"
  | "error";

export interface CapstoneState {
  step: number; // 0-5 (0=validate, 1=verify, 2=route, 3=settle, 4=decide, 5=track)
  status: CapstoneStepStatus;
  paymentInput: CapstonePaymentInput;
  results: CapstoneResults;
  error?: string;
}

export type CapstoneAction =
  | { type: "SUBMIT_DETAILS"; input: CapstonePaymentInput }
  | { type: "EDIT_INPUT"; input: CapstonePaymentInput }
  | { type: "STEP_SUCCESS"; step: number; result: unknown }
  | { type: "STEP_ERROR"; error: string }
  | { type: "RETRY" }
  | { type: "RESTART" }
  | { type: "PROCEED_ANYWAY" };

const STEP_STATUS_MAP: CapstoneStepStatus[] = [
  "validating", "verifying", "routing", "settling", "deciding", "tracking",
];

const RESULT_KEYS: (keyof CapstoneResults)[] = [
  "validation", "vop", "routing", "ssi", "recommendation", "tracking",
];

export function capstoneReducer(state: CapstoneState, action: CapstoneAction): CapstoneState {
  switch (action.type) {
    case "SUBMIT_DETAILS":
      return { ...state, paymentInput: action.input, status: "validating", step: 0, error: undefined };

    case "EDIT_INPUT":
      // Editing input invalidates all downstream results
      return {
        paymentInput: action.input,
        step: 0,
        status: "details",
        results: {},
      };

    case "STEP_SUCCESS": {
      const resultKey = RESULT_KEYS[action.step];
      const nextStep = action.step + 1;
      const isLastStep = action.step === 5;

      // Branch on VoP NO_MATCH — pause and force the learner to acknowledge
      if (action.step === 1 && action.result && typeof action.result === "object" && "outcome" in action.result && action.result.outcome === "NO_MATCH") {
        return {
          ...state,
          results: { ...state.results, [resultKey]: action.result },
          step: action.step, // Stay at verify step
          status: "blocked",
          error: undefined,
        };
      }

      return {
        ...state,
        results: { ...state.results, [resultKey]: action.result },
        step: isLastStep ? state.step : nextStep,
        status: isLastStep ? "complete" : STEP_STATUS_MAP[nextStep],
        error: undefined,
      };
    }

    case "STEP_ERROR":
      return { ...state, status: "error", error: action.error };

    case "RETRY":
      return { ...state, status: STEP_STATUS_MAP[state.step], error: undefined };

    case "PROCEED_ANYWAY": {
      // Learner acknowledges the NO_MATCH and chooses to continue for learning
      const nextStep = state.step + 1;
      return {
        ...state,
        step: nextStep,
        status: STEP_STATUS_MAP[nextStep] ?? "complete",
        error: undefined,
      };
    }

    case "RESTART":
      return {
        step: 0,
        status: "details",
        paymentInput: state.paymentInput,
        results: {},
      };

    default:
      return state;
  }
}

export const STEP_LABELS = ["Validate", "Verify", "Route", "Settle", "Decide", "Track"];
