import type { RecommendationState } from "../../../design-system/types";
import "./PreparePaymentPage.css";

interface RecommendationProps {
  state: RecommendationState;
  recommendation: string;
  reason: string;
  isBlocking: boolean;
  warnings: string[];
  blocks: string[];
  missingEvidence?: string[];
}

const RECOMMENDATION_LABELS: Record<string, { label: string; variant: string }> = {
  PROCEED: { label: "Proceed", variant: "rec--proceed" },
  PROCEED_WITH_CAUTION: { label: "Proceed with caution", variant: "rec--caution" },
  REVIEW: { label: "Review needed", variant: "rec--review" },
  CAUTION: { label: "Caution", variant: "rec--caution" },
  STOP: { label: "Stop", variant: "rec--stop" },
  BLOCKED: { label: "Blocked", variant: "rec--stop" },
  REJECT: { label: "Reject", variant: "rec--stop" },
  INCOMPLETE: { label: "Incomplete", variant: "rec--incomplete" },
};

export function Recommendation({
  state,
  recommendation,
  reason,
  isBlocking,
  warnings,
  blocks,
  missingEvidence = [],
}: RecommendationProps) {
  const displayLabel =
    state === "incomplete" ? "Incomplete" : recommendation;
  const meta = RECOMMENDATION_LABELS[displayLabel] ?? { label: displayLabel, variant: "rec--review" };

  return (
    <div className={`recommendation ${meta.variant}`} role="status" aria-live="polite">
      <div className="recommendation__header">
        <span className="recommendation__badge">{meta.label}</span>
        {isBlocking && <span className="recommendation__blocking">Blocking</span>}
      </div>
      <p className="recommendation__reason">{reason}</p>

      {state === "incomplete" && missingEvidence.length > 0 && (
        <div className="recommendation__missing">
          <p className="recommendation__missing-title">
            Missing evidence prevents a conclusive recommendation:
          </p>
          <ul>
            {missingEvidence.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="recommendation__warnings">
          <p className="recommendation__warnings-title">Warnings:</p>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {blocks.length > 0 && (
        <div className="recommendation__blocks">
          <p className="recommendation__blocks-title">Blocking issues:</p>
          <ul>
            {blocks.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
