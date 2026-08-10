/**
 * RecommendationSummary — read-only pre-commit review + explicit Send.
 *
 * Renders in the recommend phase BEFORE the learner commits. It presents the
 * current draft as an immutable summary (selected rail, reasons, and one
 * consolidated customer expectation) and contains the explicit "Send
 * recommendation" action.
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
import { customerExpectationFor } from "./caseDraft";
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

// Long expectations are previewed (not fully rendered) so the summary stays
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

  const nonEmptyReasons = draft.reasons.filter((r) => r.trim().length > 0);

  // Truncate the customer expectation preview on a word boundary so we never
  // cut mid-word. Legacy drafts are projected into this same summary shape.
  const expectation = customerExpectationFor(draft);
  let preview = expectation;
  let truncated = false;
  if (expectation.length > PREVIEW_MAX) {
    const slice = expectation.slice(0, PREVIEW_MAX);
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
          <dt className="case-desk__recommendation-label">Customer expectation</dt>
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
          Send; this button does NOT reveal the verdict. The validation
          error-summary (spec L213) lives in the Case Desk, not here: Send is
          always clickable, and on an incomplete recommendation the handler
          surfaces a linked error summary at the start of the primary task
          rather than hard-disabling the button (which gave zero feedback). */}
      <div className="case-desk__recommendation-actions">
        <Button
          variant="primary"
          onClick={onSend}
          isLoading={isSending}
          disabled={isSending}
        >
          {sendLabel}
        </Button>
        <p className="case-desk__recommendation-commit-note">
          Gather the facts required by your selected rail before sending. You
          can revise once after seeing the outcome.
        </p>
      </div>
    </section>
  );
}
