import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import type { ExerciseChecker } from "../labTypes";
import { Exercise } from "../components/Exercise";
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

export function Lab5Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [bic, setBic] = useState("EBILAEADXXX");
  const [currency, setCurrency] = useState("USD");
  const [ssi, setSsi] = useState<SSIResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookupFired = useRef(false);
  const lastInstructions = useRef<SSIResponse["instructions"]>([]);

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
          When a bank wants to send a payment in a foreign currency, it needs to know which
          correspondent bank holds its Nostro account. <strong>Standard Settlement Instructions
          (SSI)</strong> are the published list of which intermediary to use for each currency,
          along with the Nostro account number and charge code.
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

      {/* Placeholder warning */}
      <div className="lab-sim-notice" role="note">
        <strong>Account numbers are illustrative placeholders.</strong> Never initiate a real payment with this data.
      </div>

      {/* SSI lookup */}
      <section className="lab-section">
        <h2>Look up real SSI data</h2>
        <p className="measure">
          Emirates NBD (EBILAEADXXX) is a UAE bank with published correspondent relationships.
          Look up their USD settlement instructions.
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
    </div>
  );
}
