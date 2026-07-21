/**
 * RecommendationSummary — read-only pre-commit review + explicit Send.
 *
 * Renders in the recommend phase BEFORE the learner commits. It presents the
 * current draft as an immutable summary (selected rail, shortlist, reasons,
 * the three expectations, and a truncated preview of the customer-facing
 * explanation) and contains the explicit "Send recommendation" action.
 *
 * CRITICAL INVARIANT: the evaluator's verdict (decision-quality, consequence,
 * reasoning gap, next action) is HIDDEN here. The learner commits to a
 * recommendation before learning how it was scored. The verdict is only
 * revealed in the resolve phase (Piece 5b). This component deliberately never
 * imports `evaluateRecommendation`.
 *
 * Presentational only — the parent (CaseDesk) owns the evaluator call, the
 * dispatch, and the pending state. This keeps RecommendationSummary free of
 * reducer/storage dependencies and easy to test in isolation.
 */
import type { CaseDefinition, RecommendationDraft } from "./caseTypes";
import { Button } from "../../../design-system/Button";

export interface RecommendationSummaryProps {
  definition: CaseDefinition;
  draft: RecommendationDraft;
  /** Invoked when the learner commits their recommendation. */
  onSend: () => void;
  /** While the send is in flight, the button shows pending state + disables. */
  isSending: boolean;
  /**
   * Override the Send button label. During a revision (firstAttempt set +
   * recommend phase), CaseDesk passes "Send revised recommendation" so the
   * learner knows this commit produces the revised attempt, not the first.
   * Defaults to "Send recommendation" for the pre-commit review.
   */
  sendLabel?: string;
  /**
   * Optional eyebrow heading override. Used during revision so the summary
   * reads as "Revising your recommendation" rather than a fresh review.
   */
  eyebrowLabel?: string;
}

// Long explanations are previewed (not fully rendered) so the summary stays
// scannable. The full text is committed verbatim into the firstAttempt.
const PREVIEW_MAX = 140;

export function RecommendationSummary({
  definition,
  draft,
  onSend,
  isSending,
  sendLabel = "Send recommendation",
  eyebrowLabel = "Customer case desk — recommendation",
}: RecommendationSummaryProps) {
  const selectedRail = definition.rails.find((r) => r.id === draft.selectedRail) ?? null;
  const canSend = draft.selectedRail !== null;

  const shortlistNames = draft.shortlist
    .map((id) => definition.rails.find((r) => r.id === id)?.name ?? id)
    .filter((name, idx, arr) => arr.indexOf(name) === idx);

  const nonEmptyReasons = draft.reasons.filter((r) => r.trim().length > 0);

  // Truncate the explanation preview on a word boundary so we never cut mid-word.
  const explanation = draft.customerExplanation.trim();
  let preview = explanation;
  let truncated = false;
  if (explanation.length > PREVIEW_MAX) {
    const slice = explanation.slice(0, PREVIEW_MAX);
    const lastSpace = slice.lastIndexOf(" ");
    preview = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
    truncated = true;
  }

  return (
    <section className="case-desk__recommendation" aria-label="Recommendation summary">
      <header className="case-desk__phase-header">
        <p className="case-desk__eyebrow">{eyebrowLabel}</p>
        <h2 className="case-desk__section-title">Review your recommendation</h2>
      </header>

      {/* Read-only summary of the draft. The learner cannot edit here; edits
          happen in the reasoning fields above. This view is the contract the
          learner commits against. */}
      <dl className="case-desk__recommendation-summary">
        <div className="case-desk__recommendation-row">
          <dt className="case-desk__recommendation-label">Recommended rail</dt>
          <dd className="case-desk__recommendation-value">
            {selectedRail ? selectedRail.name : "No rail selected"}
          </dd>
        </div>

        {shortlistNames.length > 0 && (
          <div className="case-desk__recommendation-row">
            <dt className="case-desk__recommendation-label">Shortlisted</dt>
            <dd className="case-desk__recommendation-value">{shortlistNames.join(", ")}</dd>
          </div>
        )}

        {nonEmptyReasons.length > 0 && (
          <div className="case-desk__recommendation-row">
            <dt className="case-desk__recommendation-label">Reasons</dt>
            <dd className="case-desk__recommendation-value">
              <ul className="case-desk__recommendation-list">
                {nonEmptyReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}

        <div className="case-desk__recommendation-row">
          <dt className="case-desk__recommendation-label">Price expectation</dt>
          <dd className="case-desk__recommendation-value">
            {draft.priceExpectation.trim() || "—"}
          </dd>
        </div>

        <div className="case-desk__recommendation-row">
          <dt className="case-desk__recommendation-label">Arrival expectation</dt>
          <dd className="case-desk__recommendation-value">
            {draft.arrivalExpectation.trim() || "—"}
          </dd>
        </div>

        <div className="case-desk__recommendation-row">
          <dt className="case-desk__recommendation-label">Tracking expectation</dt>
          <dd className="case-desk__recommendation-value">
            {draft.trackingExpectation.trim() || "—"}
          </dd>
        </div>

        <div className="case-desk__recommendation-row">
          <dt className="case-desk__recommendation-label">Customer explanation</dt>
          <dd className="case-desk__recommendation-value">
            {preview ? (
              <>
                {preview}
                {truncated && <span className="case-desk__recommendation-ellipsis">…</span>}
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      {/* Send is the explicit commit. Evaluation is withheld until after
          Send; this button does NOT reveal the verdict. It is only gated on
          a selected rail — the evaluator scores whatever is sent. */}
      <div className="case-desk__recommendation-actions">
        <Button
          variant="primary"
          onClick={onSend}
          isLoading={isSending}
          disabled={!canSend}
        >
          {sendLabel}
        </Button>
        {!canSend && (
          <p className="case-desk__recommendation-hint">
            Select a rail to recommend before sending.
          </p>
        )}
        <p className="case-desk__recommendation-commit-note">
          Sending records your recommendation. You can revise once after seeing the outcome.
        </p>
      </div>
    </section>
  );
}
