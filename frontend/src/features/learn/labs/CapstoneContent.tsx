import { useReducer, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import type { LabContentProps } from "../labTypes";
import { capstoneReducer, STEP_LABELS, type CapstoneState, type CapstonePaymentInput } from "./capstoneMachine";
import { StepIndicator } from "../components/StepIndicator";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import { PaymentRoute } from "../../../design-system/payment-route/PaymentRoute";
import { PaymentTimeline } from "../../../features/operate/tracking/PaymentTimeline";
import { apiRequest, apiPost } from "../../../api/client";
import { ValidateResponseSchema, VoPResponseSchema, RouteResponseSchema, SSIResponseSchema, PreparePaymentResponseSchema, TrackPaymentResponseSchema } from "../../../api/schemas";
import type { ValidateResponse, VoPResponse, RouteResponse, SSIResponse, PreparePaymentResponse, TrackPaymentResponse } from "../../../api/schemas";
import type { PaymentRouteNode, CheckStatus } from "../../../design-system/types";
import "./LabContent.css";

const DEFAULT_INPUT: CapstonePaymentInput = {
  beneficiary_iban: "GB29NWBK60161331926819",
  beneficiary_name: "John Smith",
  currency: "GBP",
  amount: 5000,
};

const initialState: CapstoneState = {
  step: 0,
  status: "details",
  paymentInput: DEFAULT_INPUT,
  results: {},
};

export function CapstoneContent({ moduleId, onCheckpoint }: LabContentProps) {
  const [state, dispatch] = useReducer(capstoneReducer, initialState);
  const firedCheckpoints = useRef(new Set<string>());

  const fireCheckpoint = useCallback((id: string) => {
    if (!firedCheckpoints.current.has(id)) {
      firedCheckpoints.current.add(id);
      onCheckpoint(id);
    }
  }, [onCheckpoint]);

  // Run the current step's API call
  const runStep = useCallback(async (step: number, input: CapstonePaymentInput) => {
    try {
      let result: unknown;

      switch (step) {
        case 0: {
          result = await apiRequest<ValidateResponse>(
            `/api/validate?value=${encodeURIComponent(input.beneficiary_iban)}`,
            undefined, ValidateResponseSchema,
          );
          fireCheckpoint("validate");
          break;
        }
        case 1: {
          result = await apiPost<VoPResponse>(
            "/api/verify-payee",
            { iban: input.beneficiary_iban, name: input.beneficiary_name },
            VoPResponseSchema,
          );
          fireCheckpoint("verify");
          break;
        }
        case 2: {
          result = await apiRequest<RouteResponse>(
            `/api/route?bic=${encodeURIComponent(state.results.validation?.bic ?? input.beneficiary_iban)}&currency=${encodeURIComponent(input.currency)}`,
            undefined, RouteResponseSchema,
          );
          fireCheckpoint("route");
          break;
        }
        case 3: {
          result = await apiRequest<SSIResponse>(
            `/api/ssi?bic=${encodeURIComponent(state.results.validation?.bic ?? input.beneficiary_iban)}&currency=${encodeURIComponent(input.currency)}`,
            undefined, SSIResponseSchema,
          );
          fireCheckpoint("settle");
          break;
        }
        case 4: {
          result = await apiPost<PreparePaymentResponse>(
            "/api/prepare-payment",
            {
              beneficiary_iban: input.beneficiary_iban,
              beneficiary_name: input.beneficiary_name,
              currency: input.currency,
              amount: input.amount,
            },
            PreparePaymentResponseSchema,
          );
          fireCheckpoint("decide");
          break;
        }
        case 5: {
          result = await apiPost<TrackPaymentResponse>(
            "/api/track/create",
            {
              originator_bic: "TESTORIG",
              originator_name: "Test Sender Bank",
              beneficiary_bic: state.results.validation?.bic ?? "NWBKGB2L",
              beneficiary_name: input.beneficiary_name,
              currency: input.currency,
              amount: input.amount,
              charge_code: "SHA",
              intermediary_bics: [],
              intermediary_names: [],
              outcome: "credited",
            },
            TrackPaymentResponseSchema,
          );
          fireCheckpoint("track");
          break;
        }
      }

      dispatch({ type: "STEP_SUCCESS", step, result });
    } catch (e) {
      dispatch({ type: "STEP_ERROR", error: e instanceof Error ? e.message : "Step failed" });
    }
  }, [state.results, fireCheckpoint]);

  // Handle submit — start the chain
  const handleSubmit = useCallback(() => {
    dispatch({ type: "SUBMIT_DETAILS", input: state.paymentInput });
    runStep(0, state.paymentInput);
  }, [state.paymentInput, runStep]);

  // Auto-advance: when status changes to a new step, run it via useEffect
  // (except details, complete, blocked, and error states).
  // Using useEffect avoids render-time side effects and properly cleans up on unmount.
  useEffect(() => {
    if (state.status === "details" || state.status === "complete" || state.status === "error" || state.status === "blocked") {
      return;
    }
    runStep(state.step, state.paymentInput);
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const completedSteps = new Set<number>();
  for (let i = 0; i < state.step; i++) completedSteps.add(i);

  function buildRouteNodes(): PaymentRouteNode[] {
    const routing = state.results.routing;
    if (!routing) return [];
    const nodes: PaymentRouteNode[] = [{
      id: "origin", kind: "originator", bic: "—", name: "Your bank", status: "passed" as CheckStatus,
    }];
    routing.suggested_intermediaries.forEach((inter, i) => {
      nodes.push({
        id: `inter-${i}`, kind: "intermediary", bic: inter.bic,
        name: String(inter.bank ?? inter.bic), status: "passed" as CheckStatus,
      });
    });
    nodes.push({
      id: "beneficiary", kind: "beneficiary",
      bic: state.results.validation?.bic ?? "—",
      name: "Beneficiary", status: "passed" as CheckStatus,
    });
    return nodes;
  }

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <div className="lab-sim-notice" role="note">
        <strong>Simulation — not a real payment.</strong> All data is illustrative.
      </div>

      <StepIndicator
        steps={STEP_LABELS.map((label, i) => ({ id: `step-${i}`, label }))}
        currentStep={state.step}
        completedSteps={completedSteps}
      />

      {/* Payment input form (always visible for editing) */}
      <section className="lab-section">
        <h2>Payment details</h2>
        <div className="lab-capstone-form">
          <label>
            <span>IBAN</span>
            <input
              type="text"
              className="mono"
              aria-label="IBAN"
              value={state.paymentInput.beneficiary_iban}
              onChange={(e) => dispatch({ type: "EDIT_INPUT", input: { ...state.paymentInput, beneficiary_iban: e.target.value.toUpperCase() } })}
              disabled={state.status !== "details" && state.status !== "complete"}
            />
          </label>
          <label>
            <span>Name</span>
            <input
              type="text"
              aria-label="Beneficiary name"
              value={state.paymentInput.beneficiary_name}
              onChange={(e) => dispatch({ type: "EDIT_INPUT", input: { ...state.paymentInput, beneficiary_name: e.target.value } })}
              disabled={state.status !== "details" && state.status !== "complete"}
            />
          </label>
          <label>
            <span>Currency</span>
            <input
              type="text"
              className="mono"
              aria-label="Currency"
              maxLength={3}
              value={state.paymentInput.currency}
              onChange={(e) => dispatch({ type: "EDIT_INPUT", input: { ...state.paymentInput, currency: e.target.value.toUpperCase() } })}
              disabled={state.status !== "details" && state.status !== "complete"}
            />
          </label>
          <label>
            <span>Amount</span>
            <input
              type="number"
              className="mono"
              aria-label="Amount"
              value={state.paymentInput.amount}
              onChange={(e) => dispatch({ type: "EDIT_INPUT", input: { ...state.paymentInput, amount: Number(e.target.value) } })}
              disabled={state.status !== "details" && state.status !== "complete"}
            />
          </label>
        </div>

        {state.status === "details" && (
          <Button variant="primary" onClick={handleSubmit}>
            Start simulation
          </Button>
        )}

        {state.status === "complete" && (
          <Button variant="primary" onClick={() => dispatch({ type: "RESTART" })}>
            Start another simulation
          </Button>
        )}

        {state.status === "error" && (
          <div>
            <div className="lab-error" role="alert">{state.error}</div>
            <Button variant="secondary" onClick={() => dispatch({ type: "RETRY" })}>Retry</Button>
          </div>
        )}

        {state.status === "blocked" && (
          <div className="lab-vop-danger" role="alert">
            <p><strong>Stop.</strong> The name does not match the account holder.</p>
            <p>In real life you would NOT proceed. For learning, continue to see what happens next.</p>
            <Button variant="secondary" onClick={() => dispatch({ type: "PROCEED_ANYWAY" })}>
              Continue for learning →
            </Button>
          </div>
        )}
      </section>

      {/* Step results */}
      {state.results.validation && (
        <section className="lab-section">
          <h3>Step 1: Validate</h3>
          <StatusChip status={state.results.validation.valid ? "passed" : "failed"} />
          {state.results.validation.bic && <p>Derived BIC: <span className="mono">{state.results.validation.bic}</span></p>}
        </section>
      )}

      {state.results.vop && (
        <section className="lab-section">
          <h3>Step 2: Verify</h3>
          <StatusChip status={state.results.vop.outcome === "MATCH" ? "passed" : state.results.vop.outcome === "CLOSE_MATCH" ? "needs_attention" : "failed"} />
          <p>Outcome: <strong>{state.results.vop.outcome}</strong> — {state.results.vop.advice}</p>
        </section>
      )}

      {state.results.routing && (
        <section className="lab-section">
          <h3>Step 3: Route</h3>
          {state.results.routing.suggested_intermediaries.length > 0 ? (
            <PaymentRoute nodes={buildRouteNodes()} currency={state.paymentInput.currency} />
          ) : (
            <p className="lab-muted">No intermediaries found.</p>
          )}
        </section>
      )}

      {state.results.ssi && (
        <section className="lab-section">
          <h3>Step 4: Settle</h3>
          <p>{state.results.ssi.instructions.length} SSI instruction(s) on file.</p>
        </section>
      )}

      {state.results.recommendation && (
        <section className="lab-section">
          <h3>Step 5: Decide</h3>
          <div className="lab-analyzer__result">
            <StatusChip status={state.results.recommendation.is_blocking ? "failed" : "passed"} />
            <p><strong>{state.results.recommendation.recommendation}</strong></p>
            <p>{state.results.recommendation.reason}</p>
            <p>UETR: <span className="mono">{state.results.recommendation.uetr}</span></p>
          </div>
        </section>
      )}

      {state.results.tracking && (
        <section className="lab-section">
          <h3>Step 6: Track</h3>
          <PaymentTimeline payment={state.results.tracking as TrackPaymentResponse} />
        </section>
      )}

      <p className="measure">
        Prefer the full tool?{" "}
        <Link to="/app/operate/prepare" className="relay-btn relay-btn--secondary">
          Open Operate → Prepare Payment
        </Link>
      </p>
    </div>
  );
}
