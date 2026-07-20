/**
 * CaseEntry — the dominant "case-first" action at the top of the Learn index.
 *
 * This is the learner's entry point to the Customer Case Desk (Task 3). The
 * card sits ABOVE the legacy technical labs and outweighs them visually so a
 * learner's eye lands on the synthetic supplier case first.
 *
 * STATE DERIVATION (documented precedence):
 *
 *   1. `caseDef.reviewStatus === "under_review"`  → UNDER_REVIEW (catalog).
 *      The source material is being updated. Show the last verification
 *      date, DISABLE Start/Resume (a disabled button occupies the slot so
 *      AT users still see the affordance), PRESERVE any existing draft
 *      (the entry is purely visual — it never writes to storage), and
 *      offer exactly one topically-relevant technical lab as an
 *      alternative.
 *
 *   2. `session === null` OR `session.status === "not_started"`
 *      → FRESH. Show "Start case".
 *
 *   3. `session.status === "in_progress"`         → RESUME. Show "Resume case".
 *
 *   4. `session.status === "completed"`           → COMPLETED. The experience
 *      is finished (NOT passed/mastered/certified). Show a "Completed" label
 *      and a "Review case" link so the learner can revisit the case desk.
 *
 *   5. `session.status === "under_review"`        → STALE_DRAFT (session-level).
 *      Reached only via caseStore's revision-mismatch recovery: the catalog
 *      revision changed under the learner and `recoverStaleSession` reset
 *      their draft. Render the same disabled-entry surface as catalog-level
 *      under_review, but with the message focused on the stale draft.
 *
 * Completion = "the case was finished", never mastery/certification/credential.
 * No score, badge, or gamified language anywhere.
 *
 * Testability: `CaseEntry` is pure presentation — it takes `caseDef` and
 * `session` as props and never touches storage or globals. Production wires
 * `supplierCase` + `loadCaseSession(...)`; tests inject overrides (e.g. an
 * under_review case) directly.
 */

import { Link } from "react-router-dom";
import type { CaseDefinition } from "./caseTypes";
import type { CaseSession } from "./caseStore";
import "../LearnPage.css";

// ─── Visible entry state ───────────────────────────────────────────────────

export type CaseEntryState =
  | "fresh"
  | "resume"
  | "completed"
  | "under_review_catalog"
  | "under_review_stale";

/**
 * Derive the visible entry state from the catalog review status and the
 * stored session. Pure — safe to call in render.
 *
 * Precedence: catalog-level under_review beats everything (the source
 * material is being updated, so no Start/Resume regardless of draft state).
 * Session-level under_review (from caseStore's revision-mismatch recovery)
 * is distinct so the message can name the stale draft.
 */
export function deriveCaseEntryState(
  caseDef: CaseDefinition,
  session: CaseSession | null,
): CaseEntryState {
  if (caseDef.reviewStatus === "under_review") {
    return "under_review_catalog";
  }
  if (session === null || session.status === "not_started") {
    return "fresh";
  }
  if (session.status === "in_progress") {
    return "resume";
  }
  if (session.status === "completed") {
    return "completed";
  }
  // session.status === "under_review" — revision-mismatch recovery path.
  return "under_review_stale";
}

const CASE_HREF = (caseId: string) => `/learn/cases/${caseId}`;

// The single topically-relevant technical lab offered when the case is under
// review. lab-7 ("Which Rail? Payment Schemes") directly exercises rail
// selection, which is what the supplier case teaches. Using a single,
// well-known lab id keeps the "one verified reference or technical lab"
// contract honest (no choice overload).
const ALTERNATIVE_LAB = {
  href: "/learn/lab-7",
  label: "Which Rail? Payment Schemes",
} as const;

// ─── Component ─────────────────────────────────────────────────────────────

interface CaseEntryProps {
  caseDef: CaseDefinition;
  session: CaseSession | null;
}

export function CaseEntry({ caseDef, session }: CaseEntryProps) {
  const state = deriveCaseEntryState(caseDef, session);
  const href = CASE_HREF(caseDef.id);

  return (
    <section
      className={[
        "case-entry",
        state === "under_review_catalog" && "case-entry--under-review",
        state === "under_review_stale" && "case-entry--under-review",
        state === "completed" && "case-entry--completed",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby="case-entry__title"
    >
      <div className="case-entry__header">
        <p className="case-entry__eyebrow">Customer case desk</p>
        <h2 id="case-entry__title" className="case-entry__title">
          {caseDef.title}
        </h2>
        <p className="case-entry__subtitle">
          A guided scenario: gather the facts, weigh the rails, and recommend
          the right payment path for a real-feeling supplier payment.
        </p>
      </div>

      <div className="case-entry__body">
        {state === "fresh" && (
          <Link to={href} className="relay-btn relay-btn--primary case-entry__action">
            Start case
          </Link>
        )}

        {state === "resume" && (
          <Link to={href} className="relay-btn relay-btn--primary case-entry__action">
            Resume case
          </Link>
        )}

        {state === "completed" && (
          <div className="case-entry__completed">
            <span className="case-entry__status-label">Completed</span>
            <p className="case-entry__status-note">
              You finished this case. Revisit it any time to refresh your
              reasoning.
            </p>
            <Link
              to={href}
              className="relay-btn relay-btn--secondary case-entry__action"
            >
              Review case
            </Link>
          </div>
        )}

        {(state === "under_review_catalog" ||
          state === "under_review_stale") && (
          <div className="case-entry__under-review">
            <p className="case-entry__status-label">
              Under review — last verified {caseDef.verifiedAt}
            </p>
            <p className="case-entry__status-note">
              {state === "under_review_catalog"
                ? "This case is under review. Start is paused while we update the source material."
                : "Your saved draft was based on older case material. Start is paused until the update lands."}
            </p>
            {/* Disabled button (not a link) so the affordance is visible to
                AT users but cannot be followed. The learner's draft (if any)
                is preserved in storage — this component never writes.
                Label is always "Start case" (entry is paused; we do not
                advertise Resume for content that is being updated). */}
            <button
              type="button"
              className="relay-btn relay-btn--primary case-entry__action"
              disabled
            >
              Start case
            </button>
            <p className="case-entry__alternative-label">
              In the meantime, work through a topically-related lab:
            </p>
            <Link
              to={ALTERNATIVE_LAB.href}
              className="relay-btn relay-btn--secondary case-entry__alternative"
            >
              {ALTERNATIVE_LAB.label}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
