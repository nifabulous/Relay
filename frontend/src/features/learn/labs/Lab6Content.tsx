import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import type { ExerciseChecker } from "../labTypes";
import { Exercise } from "../components/Exercise";
import { Button } from "../../../design-system/Button";
import { PaymentTimeline } from "../../../features/operate/tracking/PaymentTimeline";
import { apiPost } from "../../../api/client";
import { TrackPaymentResponseSchema } from "../../../api/schemas";
import type { TrackPaymentResponse } from "../../../api/schemas";
import "./LabContent.css";

const DEFAULTS = {
  originator_bic: "BOFAUS3N",
  originator_name: "Bank of America",
  beneficiary_bic: "GTBINGLAXXX",
  beneficiary_name: "GTBank",
  currency: "USD",
  amount: 5000,
};

export function Lab6Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [payment, setPayment] = useState<TrackPaymentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createdRef = useRef(false);

  const createPayment = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPayment(null);

    try {
      const result = await apiPost<TrackPaymentResponse>(
        "/api/track/create",
        {
          ...DEFAULTS,
          charge_code: "SHA",
          intermediary_bics: ["CITIUS33"],
          intermediary_names: ["Citibank"],
          outcome: "credited",
        },
        TrackPaymentResponseSchema,
      );
      setPayment(result);

      if (!createdRef.current) {
        createdRef.current = true;
        onCheckpoint("create-payment");
      }
    } catch {
      setError("Could not create the simulated payment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [onCheckpoint]);

  // Exercise: what was the total fee deduction?
  const checkFeeDeduction: ExerciseChecker = useCallback((answer) => {
    if (!payment) {
      return { correct: false, feedback: "Create a tracked payment first." };
    }

    const expected = payment.total_fees ?? 0;
    const userAnswer = parseFloat(answer);
    if (isNaN(userAnswer)) {
      return { correct: false, feedback: "Enter a number." };
    }
    // Accept within 0.01 tolerance for rounding
    if (Math.abs(userAnswer - expected) < 0.01) {
      return {
        correct: true,
        feedback: `Correct! ${payment.sent_amount} was sent and ${payment.final_amount} arrived — ${expected.toFixed(2)} ${payment.timeline[0]?.currency ?? ""} deducted in fees.`,
      };
    }
    return {
      correct: false,
      feedback: `Not quite. Look at the Sent amount vs the Final amount. The difference is the total fees.`,
    };
  }, [payment]);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>UETR: Tracking payments end-to-end</h2>
        <p className="measure">
          Every SWIFT gpi payment gets a <strong>UETR</strong> (Unique End-to-End Transaction
          Reference) — a 36-character UUID that lets you track the payment as it hops through
          the correspondent chain. This is how banks know where a payment is at any moment.
        </p>
      </section>

      <div className="lab-sim-notice" role="note">
        <strong>Simulation — not a real payment.</strong> All tracking events are illustrative.
      </div>

      {/* Payment creation */}
      <section className="lab-section">
        <h2>Create a tracked payment</h2>
        <p className="measure">
          Click the button to create a simulated payment from Bank of America to GTBank for
          {DEFAULTS.currency} {DEFAULTS.amount.toLocaleString()}.
        </p>
        <Button variant="primary" onClick={createPayment} isLoading={isLoading}>
          Create &amp; track payment
        </Button>

        {error && <div className="lab-error" role="alert">{error}</div>}
      </section>

      {/* Timeline */}
      {payment && (
        <section className="lab-section">
          <h2>Payment timeline</h2>
          <PaymentTimeline payment={payment} />

          <Exercise
            id="ex-fee"
            title="Exercise: What was deducted?"
            prompt="How much was deducted in fees? Compare the Sent amount to the Final amount."
            label="Deduction answer"
            placeholder="e.g. 30"
            hint="Subtract the final amount from the sent amount."
            checkAnswer={checkFeeDeduction}
            onCorrect={() => onCheckpoint("read-fee-deduction")}
          />
        </section>
      )}
    </div>
  );
}
