import { useState, useCallback } from "react";
import type { LabContentProps, ExerciseChecker } from "../labTypes";
import { Exercise } from "../components/Exercise";
import { MultipleChoice } from "../components/MultipleChoice";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import { apiPost } from "../../../api/client";
import { STPCheckResponseSchema } from "../../../api/schemas";
import type { STPCheckResponse } from "../../../api/schemas";
import "./LabContent.css";

/**
 * Ops Desk lab: STP repair + Nostro reconciliation.
 *
 * The two workflows that fill a payment-operations day: fixing messages that
 * failed straight-through processing (via /api/message/stp-check), and
 * matching the Nostro statement against the ledger to find breaks.
 */

/** Tomorrow in YYYY-MM-DD, so the demo payment's value date is never stale. */
function demoValueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface QueueItem {
  transaction_reference: string;
  bank_op_code: string;
  currency: string;
  interbank_amount: number;
  charge_code: string;
  ordering: { account: string; name: string; bic: string };
  beneficiary: { account: string; name: string; bic: string };
  uetr: string | null;
}

/** The broken payment sitting in the repair queue. Field 59's account is empty. */
const BROKEN_PAYMENT: QueueItem = {
  transaction_reference: "INV-2026-0812",
  bank_op_code: "CRED",
  currency: "USD",
  interbank_amount: 12500.0,
  charge_code: "SHA",
  ordering: { account: "ACCT-10001", name: "Acme Manufacturing Inc", bic: "BOFAUS3N" },
  beneficiary: { account: "", name: "Lagos Textiles Ltd", bic: "GTBINGLAXXX" },
  uetr: null,
};

const REPAIRED_PAYMENT: QueueItem = {
  ...BROKEN_PAYMENT,
  beneficiary: { account: "ACCT-20734", name: "Lagos Textiles Ltd", bic: "GTBINGLAXXX" },
  uetr: "97ed4827-7b6f-4491-a06f-b548d5a7512d",
};

const REPAIR_QUESTION = {
  question:
    "The checker flags field 59 with STP-BENEFICIARY-MISSING. Which repair clears this payment for processing?",
  options: [
    {
      id: "resend",
      label: "Ask the sender to cancel and submit a brand-new payment",
      correct: false,
      explanation:
        "That works, but it's the slowest possible path — the whole point of a repair desk is fixing what can be fixed without a round trip to the customer.",
    },
    {
      id: "add-account",
      label: "Source the beneficiary account number and complete field 59",
      correct: true,
      explanation:
        "Correct. Field 59 needs both name and account. The analyst pulls the account from the customer's standing instructions or an RFI, completes the field, and resubmits. This single fix is among the most common repairs in correspondent banking.",
    },
    {
      id: "drop-name",
      label: "Delete the beneficiary name so the field validates as empty",
      correct: false,
      explanation:
        "Removing information never repairs a payment — an empty field 59 is a harder failure than a partial one.",
    },
    {
      id: "change-code",
      label: "Change the charge code from SHA to OUR",
      correct: false,
      explanation:
        "The charge code is fine. Repairs target the specific field the finding names.",
    },
  ],
};

/**
 * Nostro reconciliation walkthrough data. Our ledger (what we expect on the
 * Nostro) vs the correspondent's statement (what actually happened).
 */
const LEDGER_ROWS = [
  { ref: "OUT-4471", desc: "Payment to Hamburg supplier", amount: "-25,000.00", note: "" },
  { ref: "OUT-4472", desc: "Payment to Lyon supplier", amount: "-8,200.00", note: "" },
  { ref: "IN-0913", desc: "Expected customer receipt", amount: "+40,000.00", note: "" },
];

const STATEMENT_ROWS = [
  { ref: "OUT-4471", desc: "Debit — transfer executed", amount: "-25,000.00", match: "Matches ledger" },
  { ref: "OUT-4472", desc: "Debit — transfer executed", amount: "-8,200.00", match: "Matches ledger" },
  { ref: "IN-0913", desc: "Credit received", amount: "+39,972.00", match: "≠ ledger +40,000.00" },
  { ref: "CHG-2210", desc: "Correspondent service charge", amount: "-12.00", match: "Not on ledger" },
];

const BREAK_QUESTION = {
  question:
    "Line IN-0913: the ledger expected +40,000.00 but the statement shows +39,972.00. What kind of reconciliation break is this, most likely?",
  options: [
    {
      id: "fraud",
      label: "Fraud — someone skimmed the difference",
      correct: false,
      explanation:
        "A small, round-ish shortfall on an inbound cross-border credit has a far more boring everyday explanation. Escalate patterns, not single small breaks.",
    },
    {
      id: "lift-fee",
      label: "An amount break — intermediaries deducted lift fees in flight (SHA)",
      correct: true,
      explanation:
        "Correct. Under SHA, correspondents lift their fees from the amount in flight (Fees & FX module) — the classic cause of received-less-than-expected. The analyst confirms against disclosed charges and books the difference to fees.",
    },
    {
      id: "fx",
      label: "An FX conversion difference",
      correct: false,
      explanation:
        "Both sides are in the same currency here — no conversion happened. FX breaks show up when the statement currency differs from the instructed one.",
    },
    {
      id: "not-break",
      label: "Not a break — statements are always right, so update the ledger silently",
      correct: false,
      explanation:
        "Every difference is a break until it's explained. The statement usually IS right about what happened, but reconciliation requires knowing WHY before adjusting anything.",
    },
  ],
};

export function OpsRepairContent({ moduleId, onCheckpoint }: LabContentProps) {
  const [checkResult, setCheckResult] = useState<STPCheckResponse | null>(null);
  const [repairedResult, setRepairedResult] = useState<STPCheckResponse | null>(null);
  const [repairChosen, setRepairChosen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(
    async (payment: QueueItem, repaired: boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiPost<STPCheckResponse>(
          "/api/message/stp-check",
          { ...payment, value_date: demoValueDate() },
          STPCheckResponseSchema,
        );
        if (repaired) {
          setRepairedResult(res);
          if (res.stp_passes) {
            onCheckpoint("rerun-clean");
          }
        } else {
          setCheckResult(res);
          setRepairedResult(null);
          onCheckpoint("run-stp-check");
        }
      } catch {
        setError("Could not run the STP check. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [onCheckpoint],
  );

  // Exercise: how much of IN-0913 is unexplained until fees are booked?
  const checkBreakAmount: ExerciseChecker = useCallback((answer) => {
    const cleaned = answer.replace(/[$,\s]/g, "");
    const value = Number.parseFloat(cleaned);
    if (Number.isNaN(value)) {
      return { correct: false, feedback: "Enter the difference as a number." };
    }
    if (Math.abs(value - 28) < 0.01) {
      return {
        correct: true,
        feedback:
          "Correct: 40,000.00 − 39,972.00 = 28.00. The analyst confirms it against disclosed charges (say, two lift fees of 15.00 and 13.00), books it to the fees account, and the break closes.",
      };
    }
    if (Math.abs(value - 12) < 0.01) {
      return {
        correct: false,
        feedback:
          "12.00 is the OTHER break — the correspondent's service charge (CHG-2210). This question asks about the shortfall on the inbound credit IN-0913.",
      };
    }
    if (Math.abs(value - 40) < 0.01) {
      return {
        correct: false,
        feedback:
          "Close — you may have added the two breaks together. Each break is investigated and booked separately; IN-0913's shortfall alone is what's asked.",
      };
    }
    return {
      correct: false,
      feedback: "Compare IN-0913 on the two tables: expected amount minus received amount.",
    };
  }, []);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>The desk where payments get fixed</h2>
        <p className="measure">
          Most payments process straight through — no human touches them. The rest land in
          an operations queue, and a payment-ops analyst works them one by one. This
          module puts you at that desk for its two core workflows:{" "}
          <strong>STP repair</strong> (a message failed validation — fix it and resubmit)
          and <strong>Nostro reconciliation</strong> (the correspondent's statement and
          our ledger disagree — find out why).
        </p>
      </section>

      <section className="lab-section">
        <h2>Workflow 1: The repair queue</h2>
        <p className="measure">
          This payment failed straight-through processing and is waiting in your queue.
          Run the STP check to see exactly what's wrong with it.
        </p>
        <table className="lab-table">
          <thead>
            <tr>
              <th>MT field</th>
              <th>Content</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="mono">20 Reference</td><td className="mono">{BROKEN_PAYMENT.transaction_reference}</td></tr>
            <tr><td className="mono">32A Amount</td><td className="mono">USD {BROKEN_PAYMENT.interbank_amount.toLocaleString()}</td></tr>
            <tr><td className="mono">50K Ordering</td><td>{BROKEN_PAYMENT.ordering.name} · <span className="mono">{BROKEN_PAYMENT.ordering.account}</span></td></tr>
            <tr><td className="mono">59 Beneficiary</td><td>{BROKEN_PAYMENT.beneficiary.name} · <span className="mono lab-muted">account: (empty)</span></td></tr>
            <tr><td className="mono">71A Charges</td><td className="mono">{BROKEN_PAYMENT.charge_code}</td></tr>
          </tbody>
        </table>
        <Button
          variant="primary"
          onClick={() => runCheck(BROKEN_PAYMENT, false)}
          isLoading={isLoading && !checkResult}
        >
          Run STP check
        </Button>

        {error && <div className="lab-error" role="alert">{error}</div>}

        {checkResult && (
          <div className="lab-ssi-result" aria-live="polite">
            <p>
              Verdict:{" "}
              <StatusChip
                status={
                  checkResult.verdict === "CLEAN"
                    ? "passed"
                    : checkResult.verdict === "REPAIRABLE"
                      ? "needs_attention"
                      : "failed"
                }
              />{" "}
              <strong>{checkResult.verdict}</strong>
            </p>
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Severity</th>
                  <th>Finding</th>
                  <th>Suggested repair</th>
                </tr>
              </thead>
              <tbody>
                {checkResult.findings.map((f, i) => (
                  <tr key={`${f.code}-${i}`}>
                    <td className="mono">{f.field}</td>
                    <td>{f.severity}</td>
                    <td>{f.message}</td>
                    <td>{f.repair ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {checkResult && (
        <section className="lab-section">
          <h2>Choose the repair</h2>
          <MultipleChoice
            question={REPAIR_QUESTION.question}
            options={REPAIR_QUESTION.options}
            onCorrect={() => {
              setRepairChosen(true);
              onCheckpoint("choose-repair");
            }}
          />
          {repairChosen && (
            <>
              <p className="measure">
                Field 59 now reads{" "}
                <span className="mono">ACCT-20734 · Lagos Textiles Ltd</span> and a UETR
                has been assigned. Resubmit the repaired payment:
              </p>
              <Button
                variant="primary"
                onClick={() => runCheck(REPAIRED_PAYMENT, true)}
                isLoading={isLoading && repairChosen}
              >
                Re-run STP check
              </Button>
              {repairedResult && (
                <p aria-live="polite">
                  Verdict:{" "}
                  <StatusChip status={repairedResult.stp_passes ? "passed" : "failed"} />{" "}
                  <strong>{repairedResult.verdict}</strong>
                  {repairedResult.stp_passes &&
                    " — the payment leaves your queue and processes straight through."}
                </p>
              )}
            </>
          )}
        </section>
      )}

      <section className="lab-section">
        <h2>Workflow 2: Nostro reconciliation</h2>
        <p className="measure">
          Your bank's USD Nostro sits at a New York correspondent (Lab 4). Every day the
          correspondent sends a statement — in ISO 20022 terms, a{" "}
          <span className="mono">camt.053</span> — and your job is to match every line
          against the ledger. Anything that doesn't match is a <strong>break</strong>,
          and every break must be explained, not just adjusted away.
        </p>
        <h3>Our ledger (what we expect)</h3>
        <table className="lab-table">
          <thead>
            <tr><th>Ref</th><th>Description</th><th>Amount (USD)</th></tr>
          </thead>
          <tbody>
            {LEDGER_ROWS.map((r) => (
              <tr key={r.ref}>
                <td className="mono">{r.ref}</td>
                <td>{r.desc}</td>
                <td className="mono">{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Correspondent statement (what happened)</h3>
        <table className="lab-table">
          <thead>
            <tr><th>Ref</th><th>Description</th><th>Amount (USD)</th><th>Reconciliation</th></tr>
          </thead>
          <tbody>
            {STATEMENT_ROWS.map((r) => (
              <tr key={r.ref}>
                <td className="mono">{r.ref}</td>
                <td>{r.desc}</td>
                <td className="mono">{r.amount}</td>
                <td className={r.match.startsWith("Match") ? "lab-muted" : ""}>{r.match}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="measure lab-muted">
          Two lines match cleanly. Two don't: an inbound credit arrived short, and a
          charge appeared that the ledger never anticipated. Those are today's breaks.
        </p>
        <MultipleChoice
          question={BREAK_QUESTION.question}
          options={BREAK_QUESTION.options}
          onCorrect={() => onCheckpoint("spot-break")}
        />
        <Exercise
          id="ex-break-amount"
          title="Exercise: Size the break"
          prompt="How many USD are unexplained on line IN-0913 until the fee investigation closes?"
          label="Break amount"
          placeholder="e.g. 100.00"
          hint="Expected amount on the ledger minus the amount actually credited on the statement."
          checkAnswer={checkBreakAmount}
          onCorrect={() => onCheckpoint("size-break")}
        />
      </section>

      <section className="lab-section">
        <h2>Why these two workflows matter together</h2>
        <p className="measure">
          They are the two halves of operational trust. STP repair keeps payments moving
          when messages are imperfect; reconciliation proves, every single day, that the
          money the messages describe actually moved. A repair error shows up hours later
          as somebody's exception; a reconciliation break left unexplained becomes an
          audit finding — or worse, cover for a real loss.
        </p>
      </section>

      <section className="lab-section">
        <h2>Where you'll use this next</h2>
        <p className="measure">
          The Operate workspace's STP checker is the same tool with free inputs — try
          breaking different fields and predicting the findings before you run it. And
          the returns you studied in Exceptions &amp; Returns are exactly what lands on
          tomorrow's Nostro statement as unexpected credits: reconciliation is where
          returned payments come home.
        </p>
      </section>
    </div>
  );
}
