import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import type { ExerciseChecker } from "../labTypes";
import { Exercise } from "../components/Exercise";
import { MultipleChoice } from "../components/MultipleChoice";
import { Button } from "../../../design-system/Button";
import { apiRequest } from "../../../api/client";
import { SSIResponseSchema } from "../../../api/schemas";
import type { SSIResponse } from "../../../api/schemas";
import "./LabContent.css";

const CHARGE_CODES = [
  { code: "OUR", meaning: "Sender pays all fees", example: "You pay $15 extra on top of the $500" },
  { code: "SHA", meaning: "Fees shared between sender and beneficiary", example: "Intermediary fees deducted from the payment" },
  { code: "BEN", meaning: "Beneficiary pays all fees", example: "Beneficiary receives $485 from a $500 send" },
];

/**
 * The worked example record. Field values are deliberately rendered with
 * suffixes ("SHA — shared") so they never collide with the exact-text
 * charge-code reference table above.
 */
const WORKED_EXAMPLE_STEPS = [
  {
    field: "Beneficiary bank",
    value: "EBILAEADXXX · Emirates NBD",
    reading: "The bank your client's supplier uses. This is who you looked up.",
  },
  {
    field: "Currency",
    value: "USD",
    reading: "Each currency has its own instruction — the same bank uses different correspondents for USD, EUR, and GBP.",
  },
  {
    field: "Correspondent (intermediary)",
    value: "CITIUS33XXX · Citibank N.A.",
    reading: "Emirates NBD's chosen USD correspondent. Your USD must arrive here, not at Emirates NBD directly.",
  },
  {
    field: "Nostro account",
    value: "ACCT-0480291 (simulated)",
    reading: "Emirates NBD's USD account held at Citibank. Crediting this account IS paying Emirates NBD.",
  },
  {
    field: "Charge code",
    value: "SHA — shared",
    reading: "Who pays the fees along the way. This changes what the beneficiary actually receives.",
  },
  {
    field: "Value date",
    value: "spot (T+2)",
    reading: "When funds become usable. 'Spot' means two business days after execution.",
  },
];

const CHARGE_DECISIONS = [
  {
    id: "exact-amount",
    question:
      "Your client is paying a $50,000 supplier invoice and the contract says the supplier must receive exactly $50,000. Which charge code do you put in the instruction?",
    options: [
      {
        id: "sha",
        label: "SHA — it's the market default, so it's always safest",
        correct: false,
        explanation:
          "Under SHA each intermediary deducts its fee from the payment, so the supplier would receive less than $50,000 and the invoice stays technically unpaid.",
      },
      {
        id: "our",
        label: "OUR — the sender covers every fee so the full amount arrives",
        correct: true,
        explanation:
          "Correct. With OUR, intermediary fees are billed back to the sender and the beneficiary receives the full $50,000. That's why contracts with exact-amount clauses need OUR.",
      },
      {
        id: "ben",
        label: "BEN — the beneficiary agreed to pay the invoice fees",
        correct: false,
        explanation:
          "BEN deducts everything, including the sender bank's own outgoing fee, from the amount. The supplier receives the least of all three options.",
      },
    ],
  },
  {
    id: "wrong-correspondent",
    question:
      "A colleague sends USD for Emirates NBD to a correspondent that is NOT the one in the SSI. What happens to the payment?",
    options: [
      {
        id: "arrives",
        label: "It arrives anyway — any large USD bank can pass it on",
        correct: false,
        explanation:
          "It may eventually get there, but not cleanly: the receiving bank has no instruction linking those funds to Emirates NBD.",
      },
      {
        id: "repair",
        label: "It likely stalls in manual repair, gets delayed, and may incur investigation fees",
        correct: true,
        explanation:
          "Correct. Ignoring the published SSI is a classic cause of delayed payments: the funds land somewhere Emirates NBD holds no Nostro, and humans have to reroute them.",
      },
      {
        id: "bounce",
        label: "It's automatically rejected within seconds",
        correct: false,
        explanation:
          "Correspondent banking has no instant global rejection. Misrouted payments linger — that's exactly why SSIs are published.",
      },
    ],
  },
];

export function Lab5Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [bic, setBic] = useState("EBILAEADXXX");
  const [currency, setCurrency] = useState("USD");
  const [ssi, setSsi] = useState<SSIResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookupFired = useRef(false);
  const chargeFired = useRef(false);
  const correctDecisions = useRef(new Set<string>());
  const lastInstructions = useRef<SSIResponse["instructions"]>([]);

  const handleChargeDecision = useCallback((questionId: string) => {
    correctDecisions.current.add(questionId);
    if (!chargeFired.current && correctDecisions.current.size === CHARGE_DECISIONS.length) {
      chargeFired.current = true;
      onCheckpoint("choose-charge-code");
    }
  }, [onCheckpoint]);

  const lookupSsi = useCallback(async () => {
    const effectiveBic = bic.trim();
    if (!effectiveBic) return;

    setIsLoading(true);
    setError(null);
    setSsi(null);

    try {
      const result = await apiRequest<SSIResponse>(
        `/api/ssi?bic=${encodeURIComponent(effectiveBic)}&currency=${encodeURIComponent(currency.trim())}`,
        undefined,
        SSIResponseSchema,
      );
      setSsi(result);
      lastInstructions.current = result.instructions;

      if (!lookupFired.current && result.instructions.length > 0) {
        lookupFired.current = true;
        onCheckpoint("lookup-ssi");
      }
    } catch {
      setError("Could not look up settlement instructions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [bic, currency, onCheckpoint]);

  // Exercise: identify the correspondent bank from the SSI data
  const checkCorrespondent: ExerciseChecker = useCallback((answer) => {
    const normalized = answer.toLowerCase().trim();
    const instructions = lastInstructions.current;

    if (instructions.length === 0) {
      return { correct: false, feedback: "Look up SSI instructions first, then identify the correspondent bank." };
    }

    // Check against all intermediary bank names
    for (const inst of instructions) {
      const bankName = String(inst.intermediary_bank_name ?? "").toLowerCase();
      const bic = String(inst.intermediary_bic ?? "").toLowerCase();
      if (bankName && (bankName.includes(normalized) || normalized.includes(bankName))) {
        return { correct: true, feedback: `Correct! ${inst.intermediary_bank_name} (${inst.intermediary_bic}) is the correspondent for ${inst.currency}.` };
      }
      if (bic && bic.includes(normalized)) {
        return { correct: true, feedback: `Correct! That BIC belongs to ${inst.intermediary_bank_name ?? "the correspondent"}.` };
      }
    }

    return { correct: false, feedback: "That doesn't match the correspondent bank in the SSI data. Check the intermediary bank name column." };
  }, []);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>What are Settlement Instructions (SSI)?</h2>
        <p className="measure">
          Put yourself in the chair: you're the payments analyst at a UK bank, and a client
          needs to pay a supplier who banks with Emirates NBD in Dubai — in US dollars.
          Your bank doesn't hold a dollar account at Emirates NBD. So where exactly do you
          send the money?
        </p>
        <p className="measure">
          The answer is published in <strong>Standard Settlement Instructions (SSI)</strong>:
          each bank's list of which correspondent bank to route each currency through, which
          Nostro account to credit there, and which charge code applies. In Lab 4 you saw
          <em> why</em> payments hop through correspondents; the SSI is the table that tells
          you <em>which</em> correspondent — per bank, per currency.
        </p>
      </section>

      {/* Worked example — read one record together */}
      <section className="lab-section">
        <h2>Worked example: Read one SSI record</h2>
        <p className="measure">
          Here is the record you'd pull for USD payments to Emirates NBD, read field by field
          the way an analyst reads it:
        </p>
        <table className="lab-table">
          <thead>
            <tr><th>Field</th><th>Value</th><th>How to read it</th></tr>
          </thead>
          <tbody>
            {WORKED_EXAMPLE_STEPS.map((step) => (
              <tr key={step.field}>
                <td><strong>{step.field}</strong></td>
                <td className="mono">{step.value}</td>
                <td className="lab-muted">{step.reading}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="measure">
          The practical takeaway: to pay Emirates NBD in USD, your dollars go to
          Citibank in New York, into the account Citibank holds <em>for</em> Emirates NBD.
          Send them anywhere else and the payment stalls.
        </p>
      </section>

      {/* Charge code definitions */}
      <section className="lab-section">
        <h2>Charge codes: Who pays the fees?</h2>
        <table className="lab-table">
          <thead>
            <tr><th>Code</th><th>Meaning</th><th>Example</th></tr>
          </thead>
          <tbody>
            {CHARGE_CODES.map((cc) => (
              <tr key={cc.code}>
                <td><strong>{cc.code}</strong></td>
                <td>{cc.meaning}</td>
                <td className="lab-muted">{cc.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Decision points — completion requires getting these right */}
      <section className="lab-section">
        <h2>Decision points: You're the analyst</h2>
        <p className="measure">
          Two calls you'd make on a real desk. Answer both correctly to progress.
        </p>
        {CHARGE_DECISIONS.map((q) => (
          <MultipleChoice
            key={q.id}
            question={q.question}
            options={q.options}
            onCorrect={() => handleChargeDecision(q.id)}
          />
        ))}
      </section>

      {/* Placeholder warning */}
      <div className="lab-sim-notice" role="note">
        <strong>Account numbers are illustrative placeholders.</strong> Never initiate a real payment with this data.
      </div>

      {/* SSI lookup */}
      <section className="lab-section">
        <h2>Look up simulated SSI data</h2>
        <p className="measure">
          Pull the seeded training record yourself. Emirates NBD (EBILAEADXXX) is a UAE
          bank with published correspondent relationships. Fetch the simulated USD
          settlement record — then try GBP or EUR and watch the illustrative correspondent change.
        </p>
        <div className="lab-analyzer">
          <input
            type="text"
            className="lab-analyzer__input mono"
            aria-label="Beneficiary BIC"
            placeholder="EBILAEADXXX"
            value={bic}
            onChange={(e) => { setBic(e.target.value.toUpperCase()); setSsi(null); }}
          />
          <input
            type="text"
            className="lab-analyzer__input mono"
            aria-label="Currency"
            placeholder="USD"
            value={currency}
            maxLength={3}
            onChange={(e) => { setCurrency(e.target.value.toUpperCase()); setSsi(null); }}
            style={{ maxWidth: "80px" }}
          />
          <Button variant="primary" onClick={lookupSsi} isLoading={isLoading}>
            Show instructions
          </Button>
        </div>

        {error && <div className="lab-error" role="alert">{error}</div>}

        {ssi && (
          <div className="lab-ssi-result">
            {ssi.instructions.length > 0 ? (
              <>
                <p>{ssi.instructions.length} instruction(s) on file:</p>
                <table className="lab-table">
                  <thead>
                    <tr>
                      <th>Intermediary</th>
                      <th>BIC</th>
                      <th>Nostro Account</th>
                      <th>Charge</th>
                      <th>Value Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ssi.instructions.map((inst, i) => (
                      <tr key={i}>
                        <td>{String(inst.intermediary_bank_name ?? inst.intermediary_bic)}</td>
                        <td className="mono">{inst.intermediary_bic}</td>
                        <td className="mono">{inst.intermediary_account ?? "—"}</td>
                        <td>{inst.charge_code}</td>
                        <td>{inst.value_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="lab-muted">No settlement instructions on file for this bank/currency.</p>
            )}
          </div>
        )}
      </section>

      {/* Exercise */}
      <Exercise
        id="ex-correspondent"
        title="Exercise: Identify the correspondent"
        prompt="Which bank is the USD correspondent for Emirates NBD? Look at the SSI table above."
        label="Correspondent answer"
        placeholder="Bank name or BIC"
        hint="The intermediary bank name is in the first column of the SSI table."
        checkAnswer={checkCorrespondent}
        onCorrect={() => onCheckpoint("identify-correspondent")}
      />

      {/* Forward link to the capstone */}
      <section className="lab-section">
        <h2>Where you'll use this next</h2>
        <p className="measure">
          In the capstone's <strong>Settle</strong> step you'll pull an SSI exactly like this
          one, mid-payment, to decide where the money physically goes. The fee consequences of
          the charge code you just chose are the subject of the Fees &amp; FX module.
        </p>
      </section>
    </div>
  );
}
