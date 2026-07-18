import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import { ScoreBar } from "../components/ScoreBar";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import { apiPost } from "../../../api/client";
import { VoPResponseSchema } from "../../../api/schemas";
import type { VoPResponse } from "../../../api/schemas";
import "./LabContent.css";

const DEMO_IBAN = "GB29NWBK60161331926819";

const SCENARIOS = [
  { id: "match", label: "Match scenario", name: "John Smith", description: "Exact name match" },
  { id: "close", label: "Close match scenario", name: "Jon Smyth", description: "Typo in name" },
  { id: "fraud", label: "Fraud scenario", name: "Fraudster McScam", description: "Wrong person" },
] as const;

const OUTCOME_TABLE = [
  { outcome: "MATCH", meaning: "Name matches the account holder", action: "Proceed with payment", status: "passed" as const },
  { outcome: "CLOSE_MATCH", meaning: "Name is similar but not exact", action: "Review — the real name is returned for comparison", status: "needs_attention" as const },
  { outcome: "NO_MATCH", meaning: "Name does not match", action: "Do not proceed — possible fraud", status: "failed" as const },
  { outcome: "NOT_CHECKED", meaning: "Bank doesn't participate in VoP", action: "Proceed at your own risk", status: "unavailable" as const },
];

export function Lab3Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [name, setName] = useState("");
  const [result, setResult] = useState<VoPResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firedCheckpoints = useRef(new Set<string>());

  const runCheck = useCallback(async (scenarioName?: string) => {
    const effectiveName = (scenarioName ?? name).trim();
    if (!effectiveName) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiPost<VoPResponse>(
        "/api/verify-payee",
        { iban: DEMO_IBAN, name: effectiveName },
        VoPResponseSchema,
      );
      setResult(res);

      // Emit checkpoints based on outcome
      if (!firedCheckpoints.current.has("run-match") && res.outcome === "MATCH") {
        firedCheckpoints.current.add("run-match");
        onCheckpoint("run-match");
      }
      if (!firedCheckpoints.current.has("run-close-match") && res.outcome === "CLOSE_MATCH") {
        firedCheckpoints.current.add("run-close-match");
        onCheckpoint("run-close-match");
      }
      if (!firedCheckpoints.current.has("identify-fraud-risk") && res.outcome === "NO_MATCH") {
        firedCheckpoints.current.add("identify-fraud-risk");
        onCheckpoint("identify-fraud-risk");
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [name, onCheckpoint]);

  function handleScenario(scenario: typeof SCENARIOS[number]) {
    setName(scenario.name);
    runCheck(scenario.name);
  }

  const resultStatus = result
    ? result.outcome === "MATCH" ? "passed" as const
    : result.outcome === "CLOSE_MATCH" ? "needs_attention" as const
    : result.outcome === "NO_MATCH" ? "failed" as const
    : "unavailable" as const
    : null;

  return (
    <div className="lab-content" data-module-id={moduleId}>
      {/* Outcome reference table */}
      <section className="lab-section">
        <h2>The four VoP outcomes</h2>
        <p className="measure">
          Verification of Payee (VoP) checks whether the name you entered matches the actual
          account holder. This prevents misdirected payments and detects fraud.
        </p>
        <table className="lab-table">
          <thead>
            <tr><th>Outcome</th><th>Meaning</th><th>Action</th></tr>
          </thead>
          <tbody>
            {OUTCOME_TABLE.map((row) => (
              <tr key={row.outcome}>
                <td><strong>{row.outcome}</strong></td>
                <td>{row.meaning}</td>
                <td><StatusChip status={row.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Demo form */}
      <section className="lab-section">
        <h2>Try it: Verify a payee</h2>
        <p className="measure">
          The IBAN <span className="mono">{DEMO_IBAN}</span> belongs to "John Smith".
          Try different names to see how the match score changes.
        </p>

        <div className="lab-analyzer">
          <input
            type="text"
            className="lab-analyzer__input mono"
            aria-label="IBAN"
            value={DEMO_IBAN}
            readOnly
          />
        </div>
        <div className="lab-analyzer">
          <input
            type="text"
            className="lab-analyzer__input"
            aria-label="Payee name"
            placeholder="Enter the payee name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button variant="primary" onClick={() => runCheck()} isLoading={isLoading}>
            Verify
          </Button>
        </div>

        {/* Quick scenario buttons */}
        <div className="lab-vop-scenarios">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className="lab-vop-scenario-btn"
              onClick={() => handleScenario(scenario)}
              disabled={isLoading}
            >
              {scenario.label}
              <span className="lab-vop-scenario-desc">{scenario.description}</span>
            </button>
          ))}
        </div>

        {error && <div className="lab-error" role="alert">{error}</div>}

        {/* Result */}
        {result && resultStatus && (
          <div className="lab-analyzer__result">
            <div className="lab-vop-result-header">
              <StatusChip status={resultStatus} />
              <strong>{result.outcome}</strong>
            </div>

            {result.score !== null && result.score !== undefined && (
              <ScoreBar score={result.score} label="Name match score" />
            )}

            <p>{result.advice}</p>

            {/* Close match: show real name for comparison */}
            {result.outcome === "CLOSE_MATCH" && result.account_holder_name && (
              <div className="lab-vop-compare">
                <p>You entered: <strong>{result.submitted_name}</strong></p>
                <p>Account holder: <strong className="mono">{result.account_holder_name}</strong></p>
              </div>
            )}

            {/* No match: emphasize the risk */}
            {result.outcome === "NO_MATCH" && (
              <div className="lab-vop-danger" role="alert">
                <strong>Stop.</strong> The name does not match the account holder.
                Sending this payment would likely result in fraud or a misdirected transfer.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
