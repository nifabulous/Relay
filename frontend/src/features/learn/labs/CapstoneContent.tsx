import { useReducer, useRef, useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { LabContentProps } from "../labTypes";
import { capstoneReducer, STEP_LABELS, type CapstoneState, type CapstonePaymentInput } from "./capstoneMachine";
import { StepIndicator } from "../components/StepIndicator";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import { CorrespondentOptions } from "../../../design-system/correspondent-options/CorrespondentOptions";
import { PaymentTimeline } from "../../../features/operate/tracking/PaymentTimeline";
import { apiRequest, apiPost } from "../../../api/client";
import { ValidateResponseSchema, VoPResponseSchema, RouteResponseSchema, SSIResponseSchema, PreparePaymentResponseSchema, TrackPaymentResponseSchema } from "../../../api/schemas";
import type { ValidateResponse, VoPResponse, RouteResponse, SSIResponse, PreparePaymentResponse, TrackPaymentResponse } from "../../../api/schemas";
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

/**
 * Shown when the IBAN is valid but no BIC could be derived from it. Every later
 * step needs the beneficiary bank, so ask the learner for its BIC and check it
 * with /api/validate before continuing. Only a valid BIC unblocks the capstone.
 */
function MissingBicPrompt({ onAccept }: { onAccept: (lookup: ValidateResponse) => void }) {
  const [bic, setBic] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The IBAN stays editable while the check runs. If the learner edits it, this
  // prompt unmounts; a late answer was for that old IBAN and must not answer a
  // prompt shown for the new one.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = bic.trim();
    if (!value) {
      setError("Enter the beneficiary bank's BIC.");
      return;
    }
    setChecking(true);
    setError(null);
    let lookup: ValidateResponse;
    try {
      lookup = await apiRequest<ValidateResponse>(
        `/api/validate?value=${encodeURIComponent(value)}`,
        undefined, ValidateResponseSchema,
      );
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "The BIC could not be checked.");
      setChecking(false);
      return;
    }
    if (!mounted.current) return;
    if (lookup.input_type !== "bic") {
      // /api/validate accepts IBANs too; an IBAN here is not a bank identifier.
      setError("Enter a BIC (8 or 11 characters), not an IBAN.");
    } else if (!lookup.valid || !lookup.bic) {
      setError(lookup.errors.join("; ") || "That BIC is not valid.");
    } else {
      onAccept(lookup);
      return;
    }
    setChecking(false);
  };

  return (
    <>
      <div className="lab-capstone-bic" role="alert">
        <p><strong>No BIC derivable.</strong> The IBAN checksum is valid, but its bank code is not in the directory, so the beneficiary bank is unknown.</p>
        <p>Enter the beneficiary BIC to continue, or change the IBAN above.</p>
        <form className="lab-capstone-form" onSubmit={handleSubmit} noValidate>
          <label>
            <span>Beneficiary BIC</span>
            <input
              type="text"
              className="mono"
              aria-label="Beneficiary BIC"
              value={bic}
              onChange={(e) => setBic(e.target.value.toUpperCase())}
              disabled={checking}
            />
          </label>
          <div>
            <Button type="submit" variant="secondary" disabled={checking}>
              {checking ? "Checking BIC…" : "Continue with this BIC"}
            </Button>
          </div>
        </form>
      </div>
      {error && <div className="lab-error" role="alert">{error}</div>}
    </>
  );
}

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
    // The bank every step after Validate addresses: the BIC derived from the
    // IBAN, or — when none could be derived — the one the learner entered.
    const enteredBic: ValidateResponse | undefined = state.results.enteredBic;
    const beneficiaryBic: string | undefined = enteredBic?.bic ?? state.results.validation?.bic;
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
          // A valid IBAN never gets here without a BIC (it stops at needs_bic).
          // An invalid one does, and /api/route then reports the IBAN's errors.
          result = await apiRequest<RouteResponse>(
            `/api/route?bic=${encodeURIComponent(beneficiaryBic ?? input.beneficiary_iban)}&currency=${encodeURIComponent(input.currency)}`,
            undefined, RouteResponseSchema,
          );
          fireCheckpoint("route");
          break;
        }
        case 3: {
          result = await apiRequest<SSIResponse>(
            `/api/ssi?bic=${encodeURIComponent(beneficiaryBic ?? input.beneficiary_iban)}&currency=${encodeURIComponent(input.currency)}`,
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
              // The IBAN derives no BIC here, so pass the learner's, as
              // Operate → Prepare Payment does with its BIC field.
              ...(enteredBic?.bic ? { beneficiary_bic: enteredBic.bic } : {}),
            },
            PreparePaymentResponseSchema,
          );
          fireCheckpoint("decide");
          break;
        }
        case 5: {
          // `beneficiary_name` on TrackPaymentRequest is the receiving BANK's
          // name (app/schemas.py:123) — generate_timeline uses it as the
          // bank_name on the final hop. It is not the payee. Passing
          // input.beneficiary_name here put a person's name in the last row of
          // the timeline, in a lab about which institution holds which leg.
          // Fall back to the BIC, which identifies the bank on its own, rather
          // than to the payee. Never substitute a bank the learner did not
          // choose: with no BIC there is no timeline to draw.
          if (!beneficiaryBic) {
            throw new Error("No beneficiary BIC, so there is no receiving bank to track the payment to.");
          }
          const beneficiaryBankName =
            (enteredBic ?? state.results.validation)?.bank?.bank_name ?? beneficiaryBic;
          result = await apiPost<TrackPaymentResponse>(
            "/api/track/create",
            {
              originator_bic: "TESTORIG",
              originator_name: "Test Sender Bank",
              beneficiary_bic: beneficiaryBic,
              beneficiary_name: beneficiaryBankName,
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

  // Handle submit — dispatch starts the chain; the useEffect runs step 0
  const handleSubmit = useCallback(() => {
    dispatch({ type: "SUBMIT_DETAILS", input: state.paymentInput });
  }, [state.paymentInput]);

  // Auto-advance: the effect owns ALL step execution.
  // SUBMIT_DETAILS sets status to "validating", which triggers this effect for step 0.
  // Each STEP_SUCCESS changes status, triggering the next step.
  // No double-fire: only one execution path.
  useEffect(() => {
    if (state.status === "details" || state.status === "complete" || state.status === "error" || state.status === "blocked" || state.status === "needs_bic") {
      return;
    }
    runStep(state.step, state.paymentInput);
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Editable while waiting for a BIC too, so the learner can change the IBAN
  // instead of supplying one.
  const inputsEditable = state.status === "details" || state.status === "complete" || state.status === "needs_bic";

  const completedSteps = new Set<number>();
  for (let i = 0; i < state.step; i++) completedSteps.add(i);

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
              disabled={!inputsEditable}
            />
          </label>
          <label>
            <span>Name</span>
            <input
              type="text"
              aria-label="Beneficiary name"
              value={state.paymentInput.beneficiary_name}
              onChange={(e) => dispatch({ type: "EDIT_INPUT", input: { ...state.paymentInput, beneficiary_name: e.target.value } })}
              disabled={!inputsEditable}
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
              disabled={!inputsEditable}
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
              disabled={!inputsEditable}
            />
          </label>
        </div>

        {state.status === "details" && (
          <>
            <Button variant="primary" onClick={handleSubmit}>
              Start simulation
            </Button>
            <p className="lab-capstone-hint">
              <strong>Tip:</strong> Change the beneficiary name to something wrong (e.g. "Fraudster") to see how the simulation handles a name mismatch.
            </p>
          </>
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

        {state.status === "needs_bic" && (
          <MissingBicPrompt onAccept={(lookup) => dispatch({ type: "PROVIDE_BIC", lookup })} />
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

      {/* Step results — announced to screen readers via aria-live */}
      <div aria-live="polite" aria-label="Simulation step results">
      {state.results.validation && (
        <section className="lab-section">
          <h3>Step 1: Validate</h3>
          <StatusChip status={state.results.validation.valid ? "passed" : "failed"} />
          {state.results.validation.bic && <p>Derived BIC: <span className="mono">{state.results.validation.bic}</span></p>}
          {state.results.enteredBic?.bic && (
            <p>
              Beneficiary BIC (entered): <span className="mono">{state.results.enteredBic.bic}</span>
              {state.results.enteredBic.bank?.bank_name && <> — {state.results.enteredBic.bank.bank_name}</>}
            </p>
          )}
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
            <CorrespondentOptions
              options={state.results.routing.suggested_intermediaries}
              currency={state.results.routing.inferred_currency ?? state.paymentInput.currency}
              notes="The backend provides ranked candidates, not a confirmed sequence of hops. Your bank's correspondent relationships determine the actual path."
            />
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
          <PaymentTimeline payment={state.results.tracking} />
        </section>
      )}
      </div>

      <p className="measure">
        Prefer the full tool?{" "}
        <Link to="/operate/prepare" className="relay-btn relay-btn--secondary">
          Open Operate → Prepare Payment
        </Link>
      </p>
    </div>
  );
}
