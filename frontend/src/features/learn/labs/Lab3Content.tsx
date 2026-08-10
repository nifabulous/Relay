import { useState, useRef, useCallback, type FormEvent } from "react";
import type { LabContentProps } from "../labTypes";
import { ScoreBar } from "../components/ScoreBar";
import { MultipleChoice } from "../components/MultipleChoice";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import { apiPost } from "../../../api/client";
import { VoPResponseSchema } from "../../../api/schemas";
import type { VoPResponse } from "../../../api/schemas";
import "./LabContent.css";

const DEMO_IBAN = "GB29NWBK60161331926819";

const SCENARIOS = [
  { id: "match", label: "Use exact match", name: "John Smith", description: "Fills John Smith" },
  { id: "close", label: "Use close match", name: "Jon Smyth", description: "Fills Jon Smyth" },
  { id: "fraud", label: "Use fraud example", name: "Fraudster McScam", description: "Fills a different name" },
] as const;

const DECISION_QUESTIONS = [
  {
    id: "close-match-decision",
    question:
      "CLOSE_MATCH: The account holder is \"Jonathan Smythe\"; you entered \"John Smith\" for a £40,000 payment. What should you do before sending?",
    options: [
      {
        id: "a",
        label: "Send it — 0.81 is a high score, so it's the same person",
        correct: false,
        explanation:
          "A CLOSE_MATCH means the names are similar but not the same. High similarity alone doesn't prove identity — typos and different people can both score 0.81.",
      },
      {
        id: "b",
        label: "Pause and confirm the account holder name with the payee before sending",
        correct: true,
        explanation:
          "Correct. CLOSE_MATCH returns the real account holder name precisely so you can confirm with your payee through a channel you trust before releasing funds.",
      },
      {
        id: "c",
        label: "Cancel the payment and report the payee for fraud",
        correct: false,
        explanation:
          "Too strong. CLOSE_MATCH usually means a typo or name variation, not fraud. NO_MATCH is the outcome that signals likely fraud.",
      },
      {
        id: "d",
        label: "Re-run the check until it returns MATCH",
        correct: false,
        explanation:
          "Re-running the same check gives the same answer. The mismatch is in the data, not the check.",
      },
    ],
  },
  {
    id: "not-checked-decision",
    question:
      "NOT_CHECKED: The beneficiary bank does not participate in VoP. What does that mean?",
    options: [
      {
        id: "a",
        label: "The name matched, so no check was needed",
        correct: false,
        explanation:
          "NOT_CHECKED says nothing about the name at all — no comparison happened.",
      },
      {
        id: "b",
        label: "The payment will be rejected by the beneficiary bank",
        correct: false,
        explanation:
          "NOT_CHECKED doesn't block the payment. It just means you carry the misdirection risk yourself.",
      },
      {
        id: "c",
        label: "The bank doesn't participate in VoP, so the name was never compared",
        correct: true,
        explanation:
          "Correct. The beneficiary bank doesn't offer VoP, so you proceed at your own risk — double-check details through another channel for high-value payments.",
      },
      {
        id: "d",
        label: "The IBAN failed its checksum",
        correct: false,
        explanation:
          "A checksum failure would reject the request outright (that's Lab 2 territory), not return NOT_CHECKED.",
      },
    ],
  },
] as const;

const OUTCOME_TABLE = [
  { outcome: "MATCH", meaning: "Name matches the account holder", action: "Proceed with payment", status: "passed" as const },
  { outcome: "CLOSE_MATCH", meaning: "Name is similar but not exact", action: "Review — the real name is returned for comparison", status: "needs_attention" as const },
  { outcome: "NO_MATCH", meaning: "Name does not match", action: "Do not proceed — possible fraud", status: "failed" as const },
  { outcome: "NOT_CHECKED", meaning: "Bank doesn't participate in VoP", action: "Proceed at your own risk", status: "unavailable" as const },
];

export function Lab3Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [iban, setIban] = useState(DEMO_IBAN);
  const [name, setName] = useState("");
  const [result, setResult] = useState<VoPResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firedCheckpoints = useRef(new Set<string>());
  const correctDecisions = useRef(new Set<string>());

  const handleDecisionCorrect = useCallback((questionId: string) => {
    correctDecisions.current.add(questionId);
    if (
      !firedCheckpoints.current.has("decide-outcome") &&
      correctDecisions.current.size === DECISION_QUESTIONS.length
    ) {
      firedCheckpoints.current.add("decide-outcome");
      onCheckpoint("decide-outcome");
    }
  }, [onCheckpoint]);

  const runCheck = useCallback(async (submittedIban: string, submittedName: string) => {
    const effectiveIban = submittedIban.trim();
    const effectiveName = submittedName.trim();
    if (!effectiveIban || !effectiveName) {
      setError("Enter an IBAN and payee name before verifying.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiPost<VoPResponse>(
        "/api/verify-payee",
        { iban: effectiveIban, name: effectiveName },
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
  }, [onCheckpoint]);

  function handleScenario(scenario: typeof SCENARIOS[number]) {
    setName(scenario.name);
    setResult(null);
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runCheck(iban, name);
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
      <section className="lab-section lab-vop-section">
        <h2>Try it: Verify a payee</h2>
        <p className="measure">
          Enter the IBAN and payee name, then submit to see how the match outcome changes.
        </p>

        <form className="lab-vop-form" onSubmit={handleSubmit}>
          <div className="lab-vop-form__fields">
            <label className="lab-vop-form__field">
              <span>IBAN</span>
              <input
                type="text"
                name="iban"
                className="lab-vop-form__input"
                aria-label="IBAN"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="lab-vop-form__field">
              <span>Payee name</span>
              <input
                type="text"
                name="payeeName"
                className="lab-vop-form__input"
                aria-label="Payee name"
                placeholder="e.g. John Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Verify payee
          </Button>
        </form>

        {/* Quick scenario buttons */}
        <div className="lab-vop-scenarios">
          <p className="lab-vop-scenarios__label">Try a prepared example</p>
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
          <div className="lab-vop-result lab-analyzer__result" role="status">
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

      {/* Decision check — completion requires getting these right */}
      <section className="lab-section lab-vop-section lab-vop-decision-section">
        <h2>Choose the safest next step</h2>
        <p className="measure">
          Use each VoP result to decide what should happen next. Answer both correctly
          to complete the lab.
        </p>
        {DECISION_QUESTIONS.map((q) => (
          <MultipleChoice
            key={q.id}
            question={q.question}
            options={[...q.options]}
            onCorrect={() => handleDecisionCorrect(q.id)}
          />
        ))}
      </section>
    </div>
  );
}
