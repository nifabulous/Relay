/**
 * CaseDebrief — the finish (Task 5c).
 *
 * Renders AFTER the learner completes the transfer (phase `debrief`, status
 * `completed`). The debrief is the close of the experience — neutrally framed
 * as "you've completed this case", never as success/mastery/certification.
 *
 * THE KEY INVARIANT (plan): "the debrief separates supported performance from
 * independent transfer." Two DISTINCT `<section>`s, never blended into a single
 * score:
 *
 *   1. SUPPORTED PERFORMANCE — how the learner did on the MAIN case. They had
 *      full scaffolding: all authored facts, the full reasoning fields
 *      (price/arrival/tracking/customerExplanation), and the rail shortlist.
 *      The most-recent attempt (revisedAttempt if present, else firstAttempt)
 *      is the load-bearing outcome. If they revised, both attempts are
 *      acknowledged factually without framing either as better.
 *
 *   2. INDEPENDENT TRANSFER — how they did on the TRANSFER variant. They had
 *      LESS scaffolding: only the transfer's minimal facts and a rail pick
 *      (no full reasoning fields). Framed as "independent application" — a
 *      DIFFERENT condition, not a comparison. Not better/worse, just less
 *      scaffolding.
 *
 * SYNTHETIC-DATA DISCLOSURE (global constraint): a prominent, ARIA-labelled
 * callout (role="note") discloses that the case used synthetic (fictional)
 * data and no real customer/account/transaction information was used. This
 * is unmissable — a bordered callout at the top of the debrief, not buried
 * fine print.
 *
 * Completion framing: the experience is FINISHED. No credential, badge, or
 * mastery language. The two affordances are "Back to Learn" (Link to /learn)
 * and "Start again" (restart — clears the working draft, preserves attempt
 * history per the reducer).
 *
 * Presentational only. Reads firstAttempt/revisedAttempt/transferOutcome from
 * the session; CaseDesk owns the restart handler.
 */
import { type RefObject } from "react";
import { Link } from "react-router-dom";
import type {
  CaseDefinition,
  CaseOutcome,
} from "./caseTypes";
import type { CaseSession } from "./caseStore";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";

export interface CaseDebriefProps {
  definition: CaseDefinition;
  session: CaseSession;
  /** Ref for the phase heading so CaseDesk can move focus on transition. */
  phaseHeadingRef: RefObject<HTMLHeadingElement | null>;
  /** Restart — clears the working draft, preserves attempt history. */
  onRestart: () => void;
}

export function CaseDebrief({
  definition,
  session,
  phaseHeadingRef,
  onRestart,
}: CaseDebriefProps) {
  const first = session.firstAttempt;
  const revised = session.revisedAttempt;
  const transfer = session.transferOutcome;

  // Defensive: the debrief is only reached after complete-transfer (which
  // requires a firstAttempt), but a malformed session must never crash the
  // surface. Surface an honest, recoverable state instead.
  if (!first) {
    return (
      <section className="case-desk__debrief" aria-label="Case debrief">
        <header className="case-desk__phase-header">
          <p className="case-desk__eyebrow">Customer case desk — debrief</p>
          <h2 ref={phaseHeadingRef} className="case-desk__phase-title">
            Case complete
          </h2>
        </header>
        <p className="case-desk__phase-note">
          Your debrief could not be loaded. Start again to retry.
        </p>
        <div className="case-desk__nav">
          <Button variant="secondary" onClick={onRestart}>Start again</Button>
          <Link to="/learn" className="relay-btn relay-btn--secondary">Back to Learn</Link>
        </div>
      </section>
    );
  }

  // The most-recent main-case attempt wins for the "supported performance"
  // section. If the learner revised, the revised outcome is the headline;
  // the first attempt is acknowledged factually (it is preserved/immutable).
  const currentMain = revised ?? first;
  const didRevise = revised !== null;

  return (
    <section className="case-desk__debrief" aria-label="Case debrief">
      <header className="case-desk__phase-header">
        <p className="case-desk__eyebrow">Customer case desk — debrief</p>
        <h2 ref={phaseHeadingRef} className="case-desk__phase-title">
          You’ve completed this case
        </h2>
      </header>

      {/* SYNTHETIC-DATA DISCLOSURE — unmissable, ARIA-labelled. The global
          constraint: every Relay Learn case is synthetic. The debrief is the
          last surface the learner sees, so the disclosure reinforces it here
          one final time before they leave. role="note" so AT announces the
          callout as a note (not an alert — it is informational, not
          interruptive). */}
      <aside
        className="case-desk__debrief-disclosure"
        role="note"
        aria-label="Synthetic data disclosure"
      >
        <h3 className="case-desk__debrief-disclosure-title">
          This case used synthetic (fictional) data
        </h3>
        <p className="case-desk__debrief-disclosure-text">
          All names, amounts, banks, and transactions in this case are invented
          for training. No real customer, account, or transaction information
          was used.
        </p>
      </aside>

      {/* ── SECTION 1: SUPPORTED PERFORMANCE ────────────────────────────────
          The main case. Full scaffolding (all authored facts, full reasoning
          fields, the rail shortlist). The most-recent attempt wins; if the
          learner revised, both attempts are acknowledged factually — never
          framed as better/worse. The heading is the section-distinct label
          ("Supported performance") so AT and the plan's "distinct headings"
          invariant are satisfied; the subtitle carries the framing. */}
      <section
        className="case-desk__debrief-supported"
        aria-labelledby="case-debrief-supported-title"
        aria-label="Supported performance on the main case"
      >
        <header className="case-desk__debrief-section-header">
          <h3 id="case-debrief-supported-title" className="case-desk__section-title">
            Supported performance
          </h3>
          <p className="case-desk__debrief-subtitle">Main case — with full scaffolding</p>
        </header>
        <p className="case-desk__debrief-framing">
          You had all the authored facts and the full reasoning fields. Here’s
          how your recommendation landed.
        </p>
        <PerformanceCard
          definition={definition}
          outcome={currentMain.outcome}
          selectedRailId={currentMain.draft.selectedRail}
        />
        {didRevise && (
          <p className="case-desk__phase-note">
            You revised your recommendation. Your first attempt is preserved
            unchanged in your record.
          </p>
        )}
      </section>

      {/* ── SECTION 2: INDEPENDENT TRANSFER ─────────────────────────────────
          The transfer variant. LESS scaffolding (only the transfer's minimal
          facts and a rail pick). Framed as a DIFFERENT CONDITION — independent
          application — never as a comparison to the main case. The heading is
          the section-distinct label so the two sections read as DISTINCT
          regions, never blended.

          T12 — HONEST TRANSFER (Group D): in Phase 1 the transfer is a SINGLE
          rail (cross-border-ach) with all facts supplied — there is no
          investigation surface and no alternative to pick between. The
          transfer draft is built with empty reasons + empty expectations, so
          the evaluator structurally always returns `possible`. Surfacing that
          constant as a StatusChip would be misleading (it reads as a graded
          "Possible" when it is in fact a constant). The plan's T7 defers
          "add a second rail + reasoning capture" to Phase 2.

          So in Phase 1 the transfer is reframed as COMPLETION: the learner
          applied the same reasoning to a simpler variant and completed it.
          The PerformanceCard for the transfer uses variant="completion",
          which suppresses the decision-quality chip and the reasoning-gap
          callout (both are main-case grading artifacts). The consequence text
          IS still surfaced — it's informative (what would happen with this
          rail on this corridor) and not a grade. Phase 2 (T7) makes the
          transfer a real multi-rail decision; this card will then switch
          back to variant="graded". */}
      <section
        className="case-desk__debrief-transfer"
        aria-labelledby="case-debrief-transfer-title"
        aria-label="Independent transfer"
      >
        <header className="case-desk__debrief-section-header">
          <h3 id="case-debrief-transfer-title" className="case-desk__section-title">
            Independent transfer
          </h3>
          <p className="case-desk__debrief-subtitle">Transfer variant — completed</p>
        </header>
        <p className="case-desk__debrief-framing">
          You applied the same reasoning with fewer facts and picked the rail
          for a simpler variant. This is a different condition, not a
          comparison — a check on independent application. You completed the
          transfer case.
        </p>
        {transfer ? (
          <PerformanceCard
            definition={definition}
            outcome={transfer}
            selectedRailId={null}
            // The transfer rail id space is the transfer's own rails. Look up
            // by id against the transfer's rails so the name resolves.
            railPool={definition.transfer.rails}
            // T12: the transfer is reframed as completion (see the section
            // comment above). variant="completion" suppresses the
            // decision-quality chip and the reasoning-gap callout — both are
            // main-case grading artifacts that don't apply to the single-rail
            // transfer.
            variant="completion"
          />
        ) : (
          // Defensive: complete-transfer persists the outcome (Piece 5c CRITICAL
          // FIX), and loadCaseSession normalizes a missing field to null. If
          // the outcome is somehow absent (e.g. an old session resumed into
          // debrief), surface an honest state rather than crashing.
          <p className="case-desk__phase-note">
            The transfer outcome is not available for this run.
          </p>
        )}
      </section>

      {/* Closing affordances. Completion is neutral — no credential/badge. */}
      <div className="case-desk__nav">
        <Button variant="secondary" onClick={onRestart}>Start again</Button>
        <Link to="/learn" className="relay-btn relay-btn--secondary">Back to Learn</Link>
      </div>
    </section>
  );
}

// ─── Performance card ──────────────────────────────────────────────────────

interface PerformanceCardProps {
  definition: CaseDefinition;
  outcome: CaseOutcome;
  selectedRailId: string | null;
  /** When looking up a transfer rail, search the transfer's own rail pool. */
  railPool?: CaseDefinition["rails"];
  /**
   * T12 (Group D): the card's framing.
   * - `"graded"` (default): the main-case view. Surfaces the decision-quality
   *   StatusChip, the sound-reasoning list, and the reasoning-gap callout.
   *   This is the load-bearing graded outcome.
   * - `"completion"`: the Phase-1 transfer view. The transfer is a single
   *   rail with no investigation surface; its evaluator outcome is
   *   structurally `possible` (empty reasons + empty expectations by
   *   construction). Surfacing that constant as a chip would be misleading,
   *   so the completion variant suppresses the quality chip and the
   *   reasoning-gap callout. The consequence text IS still surfaced — it's
   *   informative, not a grade. Phase 2 (T7) makes the transfer a real
   *   multi-rail decision; this card will then switch back to "graded".
   */
  variant?: "graded" | "completion";
}

/**
 * A compact performance summary for one condition (main case OR transfer).
 * Consequence-first (the real-world impact), followed by the decision-quality
 * chip (in the graded variant). Mirrors the resolve-phase ordering so the
 * learner sees a consistent "what happened, then how it scored" rhythm across
 * phases.
 *
 * The card is intentionally NEUTRAL: it surfaces the outcome factually. It
 * does NOT frame a "preferred" outcome as mastery or an "invalid" outcome as
 * failure — both are just how the recommendation landed under that
 * condition's disclosed priorities.
 */
function PerformanceCard({
  definition,
  outcome,
  selectedRailId,
  railPool,
  variant = "graded",
}: PerformanceCardProps) {
  const pool = railPool ?? definition.rails;
  const selectedRailName = selectedRailId
    ? pool.find((r) => r.id === selectedRailId)?.name ?? null
    : null;
  // T12: the completion variant (Phase-1 transfer) suppresses the
  // decision-quality chip and the reasoning-gap callout. The graded variant
  // (main case) keeps both — they are load-bearing grading artifacts.
  const isCompletion = variant === "completion";

  return (
    <div className="case-desk__debrief-card">
      <p className="case-desk__debrief-card-consequence">{outcome.consequence}</p>
      {!isCompletion && (
        <div className="case-desk__debrief-card-quality">
          <StatusChip status={outcome.quality} />
        </div>
      )}
      {selectedRailName && (
        <p className="case-desk__debrief-card-rail">
          You recommended <strong>{selectedRailName}</strong>.
        </p>
      )}
      {/* Sound reasoning surfaced as the supportive list. Kept compact (the
          full resolve-phase view is the deep dive; the debrief summarizes).
          T12: the completion variant still surfaces "what you reasoned well"
          when present — it's supportive, not a grade. (In Phase 1 the
          transfer's draft has empty reasons, so this list is empty for the
          transfer; the guard keeps it future-proof for Phase 2.) */}
      {outcome.soundReasoning.length > 0 && (
        <details className="case-desk__debrief-card-details">
          <summary className="case-desk__debrief-card-summary">
            What you reasoned well ({outcome.soundReasoning.length})
          </summary>
          <ul className="case-desk__debrief-card-list">
            {outcome.soundReasoning.map((item, i) => (
              <li key={i} className="case-desk__debrief-card-list-item">{item}</li>
            ))}
          </ul>
        </details>
      )}
      {/* Reasoning gap (if any) — surfaced factually, not as a "you failed".
          T12: suppressed in the completion variant. The Phase-1 transfer's
          `possible`-tier reasoning gap is a main-case-shaped instruction
          ("state a substantive primary reason... give a price expectation...")
          that doesn't apply to the single-rail transfer; surfacing it would
          be busywork and would contradict the completion framing. */}
      {!isCompletion && outcome.reasoningGap && (
        <details className="case-desk__debrief-card-details">
          <summary className="case-desk__debrief-card-summary">
            One thing to strengthen
          </summary>
          <p className="case-desk__debrief-card-gap">{outcome.reasoningGap}</p>
        </details>
      )}
    </div>
  );
}
