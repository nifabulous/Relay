/**
 * CaseOutcome — the resolve-phase feedback surface (Task 5b).
 *
 * Renders AFTER the learner commits a recommendation (phase `resolve`). It is
 * the consequence-first view of how the recommendation scored, with two
 * forward affordances: revise once, or finish with a transfer case.
 *
 * INVARIANTS under test:
 *   - CONSEQUENCE FIRST: the real-world `outcome.consequence` text renders
 *     BEFORE the decision-quality chip in DOM order. Consequence is the
 *     load-bearing signal; the quality chip is a scannable summary that
 *     follows it. (Piece 5b test asserts this via compareDocumentPosition.)
 *   - ONE revision per case: "Revise recommendation" is disabled once a
 *     revised attempt exists. The reducer (`begin-revision`) is the ultimate
 *     guard; the UI mirrors it so the control reads honestly.
 *   - The most-recent attempt wins: if `revisedAttempt` is set, its outcome
 *     is shown (and the first attempt is preserved/immutable for comparison).
 *
 * Presentational only. CaseDesk owns the handlers (begin-revision,
 * complete-transfer) and computes the transfer outcome. This keeps the
 * component free of reducer/storage/evaluator dependencies.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  CaseDefinition,
  CaseId,
  CaseOutcome as CaseOutcomeData,
  RecommendationDraft,
  TransferDefinition,
} from "./caseTypes";
import type { CaseSession } from "./caseStore";
import { evaluateRecommendation } from "./caseEvaluator";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";

export interface CaseOutcomeProps {
  definition: CaseDefinition;
  session: CaseSession;
  phaseHeadingRef: RefObject<HTMLHeadingElement | null>;
  /** Begin a one-shot revision (phase → recommend). */
  onBeginRevision: () => void;
  /** Finish the case by completing the transfer. Receives the computed
   * transfer outcome so CaseDesk dispatches `complete-transfer { outcome }`. */
  onCompleteTransfer: (outcome: CaseOutcomeData) => void;
}

export function CaseOutcome({
  definition,
  session,
  phaseHeadingRef,
  onBeginRevision,
  onCompleteTransfer,
}: CaseOutcomeProps) {
  // The most-recent attempt wins. Both attempts are immutable snapshots; we
  // never read the working draft here.
  const revised = session.revisedAttempt;
  const current = revised ?? session.firstAttempt;
  const first = session.firstAttempt;

  if (!current || !first) {
    // Defensive: the resolve phase is only reached with a firstAttempt, but
    // guard so the component never crashes on a malformed session.
    return (
      <section className="case-desk__resolve" aria-label="Case outcome">
        <header className="case-desk__phase-header">
          <p className="case-desk__eyebrow">Customer case desk — outcome</p>
          <h2 ref={phaseHeadingRef} className="case-desk__phase-title">
            Recommendation submitted
          </h2>
        </header>
        <p className="case-desk__phase-note">
          Your recommendation could not be loaded. Start again to retry.
        </p>
      </section>
    );
  }

  const outcome = current.outcome;
  const selectedRailName =
    definition.rails.find((r) => r.id === current.draft.selectedRail)?.name ??
    null;

  const canRevise = revised === null;

  const [transferOpen, setTransferOpen] = useState(false);

  return (
    <section className="case-desk__resolve" aria-label="Case outcome">
      <header className="case-desk__phase-header">
        <p className="case-desk__eyebrow">Customer case desk — outcome</p>
        <h2 ref={phaseHeadingRef} className="case-desk__phase-title">
          {revised ? "Revised recommendation submitted" : "Recommendation submitted"}
        </h2>
      </header>

      {/* CONSEQUENCE FIRST. The real-world impact text precedes the
          decision-quality chip in DOM order — a plan invariant asserted in
          Piece 5b's "consequence precedes classification" test. */}
      <div className="case-desk__outcome">
        {/* aria-live="polite" so a screen-reader user hears the consequence
            announced when the outcome renders after Send. The phase-heading
            focus move lands them on "Recommendation submitted"; this live
            region announces the consequence itself. Polite (not assertive)
            because the consequence is informational, not an error. */}
        <p className="case-desk__outcome-consequence" aria-live="polite">
          {outcome.consequence}
        </p>
        <div className="case-desk__outcome-quality">
          <StatusChip status={outcome.quality} />
        </div>
      </div>

      {selectedRailName && (
        <p className="case-desk__resolve-summary">
          You recommended <strong>{selectedRailName}</strong>.
        </p>
      )}

      {/* Reasoning gap: the single most important thing to fix. Rendered
          prominently when present. Preferred outcomes have no gap → a
          positive note instead. */}
      {outcome.reasoningGap ? (
        <aside className="case-desk__outcome-gap" aria-label="Reasoning gap">
          <h3 className="case-desk__section-title">One thing to strengthen</h3>
          <p className="case-desk__outcome-gap-text">{outcome.reasoningGap}</p>
        </aside>
      ) : (
        <aside className="case-desk__outcome-gap case-desk__outcome-gap--positive" aria-label="Reasoning gap">
          <h3 className="case-desk__section-title">No gaps</h3>
          <p className="case-desk__outcome-gap-text">
            All priorities covered — your reasoning matched the case’s disclosed
            urgency and tracking needs.
          </p>
        </aside>
      )}

      {/* Sound reasoning: the supportive list of what the learner got right. */}
      {outcome.soundReasoning.length > 0 && (
        <section className="case-desk__outcome-sound" aria-label="What you reasoned well">
          <h3 className="case-desk__section-title">What you reasoned well</h3>
          <ul className="case-desk__outcome-sound-list">
            {outcome.soundReasoning.map((item, i) => (
              <li key={i} className="case-desk__outcome-sound-item">{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Worked explanation (design spec L191, Resolve step 6): revealed AFTER
          the learner has reviewed the consequence, sound reasoning, and gap.
          Teaches why the selected rail fits the corridor — independent of the
          learner's score. Only eligible rails carry one; ineligible selections
          get null and this section is omitted. */}
      {outcome.workedExplanation && (
        <section className="case-desk__outcome-worked" aria-label="Worked explanation">
          <h3 className="case-desk__section-title">How this rail works here</h3>
          <p className="case-desk__outcome-worked-text">{outcome.workedExplanation}</p>
        </section>
      )}

      {/* When a revised attempt exists, surface that the first attempt is
          preserved and immutable (kept simple — a short note rather than a
          full collapsed comparison view). */}
      {revised && (
        <p className="case-desk__phase-note">
          This is your revised outcome. Your first attempt is preserved unchanged.
        </p>
      )}

      {/* Forward affordances. Revise is the one-shot do-over; complete-transfer
          finishes the experience by applying the same reasoning to a simpler,
          less-scaffolded variant. */}
      <div className="case-desk__outcome-actions">
        <Button
          variant="secondary"
          onClick={onBeginRevision}
          disabled={!canRevise}
        >
          {canRevise ? "Revise recommendation" : "Revision used"}
        </Button>
        <Button
          variant="primary"
          onClick={() => setTransferOpen((v) => !v)}
          aria-expanded={transferOpen}
          aria-controls="case-transfer-step"
        >
          Complete transfer
        </Button>
      </div>
      {!canRevise && (
        <p className="case-desk__phase-note">
          You can revise once per case. Finish with the transfer to complete.
        </p>
      )}

      {transferOpen && (
        <TransferStep
          id="case-transfer-step"
          transfer={definition.transfer}
          onConfirm={(draft) => {
            // Compute the transfer outcome via the pure evaluator against the
            // transfer's facts/rails (adapted into a CaseDefinition-like
            // shape). CaseDesk dispatches complete-transfer with this outcome.
            //
            // T1 (requestedFactIds handling for the transfer): the transfer
            // variant has NO requestable facts — every transfer fact ships
            // `supplied` (destination-currency, amount, urgency). So the
            // investigation-gating can never block: supplied facts are always
            // gathered regardless of the requestedFactIds set. We pass the
            // transfer's own fact ids as "requested" to make the intent
            // explicit and future-proof: if a future transfer ever adds a
            // requestable fact, this call would surface the gate instead of
            // silently passing. (Group D owns making the transfer a real
            // investigation decision; here we only keep the call WORKING.)
            const transferDefinition = transferAsDefinition(definition, definition.transfer);
            const transferRequestedFactIds = new Set(
              definition.transfer.facts.map((f) => f.id),
            );
            const outcome = evaluateRecommendation(
              transferDefinition,
              draft,
              transferRequestedFactIds,
            );
            onCompleteTransfer(outcome);
          }}
        />
      )}
    </section>
  );
}

// ─── Transfer sub-step ──────────────────────────────────────────────────────

interface TransferStepProps {
  id: string;
  transfer: TransferDefinition;
  onConfirm: (draft: RecommendationDraft) => void;
}

/**
 * A MINIMAL transfer UI. The transfer is a close, simpler variant of the case
 * used to confirm the learner can apply the same reasoning with LESS
 * scaffolding. The learner reads the customer request and the (read-only)
 * facts, picks a rail from the transfer's rails, and confirms. We do NOT
 * re-build the full investigate flow here — just enough to score the pick.
 *
 * The transfer draft is minimal: `selectedRail` plus an empty reasons array is
 * enough for the evaluator to score eligibility and surface a consequence.
 */
function TransferStep({ id, transfer, onConfirm }: TransferStepProps) {
  const [selectedRail, setSelectedRail] = useState<string | null>(null);
  // Ref to the transfer fieldset so focus moves into the new region on open.
  // When the learner clicks "Complete transfer", the TransferStep mounts and
  // this effect runs once, moving focus to the fieldset (tabindex=-1) so a
  // screen-reader user lands in the newly-revealed region instead of being
  // stranded on the toggle button. The aria-expanded/aria-controls wiring on
  // the button is already correct; this adds the focus move.
  const fieldsetRef = useRef<HTMLFieldSetElement | null>(null);
  useEffect(() => {
    fieldsetRef.current?.focus();
  }, []);

  return (
    <section
      id={id}
      className="case-desk__transfer"
      aria-label="Transfer case — apply your reasoning with less scaffolding"
    >
      <header className="case-desk__phase-header">
        <p className="case-desk__eyebrow">Transfer variant</p>
        <h3 className="case-desk__section-title">{transfer.customerRequest}</h3>
      </header>

      <dl className="case-desk__transfer-facts">
        {transfer.facts.map((fact) => (
          <div className="case-desk__transfer-fact" key={fact.id}>
            <dt className="case-desk__transfer-fact-label">{fact.label}</dt>
            <dd className="case-desk__transfer-fact-value">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <fieldset
        ref={fieldsetRef}
        tabIndex={-1}
        className="case-desk__transfer-rails"
      >
        <legend className="case-desk__transfer-rails-legend">Pick a rail</legend>
        {transfer.rails.map((rail) => (
          <label key={rail.id} className="case-desk__transfer-rail">
            <input
              type="radio"
              name="transfer-rail"
              value={rail.id}
              checked={selectedRail === rail.id}
              onChange={() => setSelectedRail(rail.id)}
            />
            <span className="case-desk__transfer-rail-name">{rail.name}</span>
            <span className="case-desk__transfer-rail-eligibility">{rail.eligibility}</span>
          </label>
        ))}
      </fieldset>

      <div className="case-desk__transfer-actions">
        <Button
          variant="primary"
          disabled={selectedRail === null}
          onClick={() => {
            if (selectedRail === null) return;
            onConfirm({
              shortlist: [selectedRail],
              selectedRail,
              reasons: [],
              conditions: [],
              priceExpectation: "",
              arrivalExpectation: "",
              trackingExpectation: "",
              customerExplanation: "",
            });
          }}
        >
          Confirm transfer recommendation
        </Button>
        {selectedRail === null && (
          <p className="case-desk__phase-note">Select a rail to confirm the transfer.</p>
        )}
      </div>
    </section>
  );
}

// ─── Transfer → CaseDefinition adapter for the evaluator ────────────────────

/**
 * The pure evaluator reads `definition.facts`, `definition.rails`, and
 * `definition.id`. A `TransferDefinition` carries facts + rails but is its own
 * shape (no top-level id/title/...). This adapter builds a CaseDefinition-like
 * view so the transfer can be scored by the SAME logic, without duplicating
 * the evaluator.
 *
 * The `id` is sourced from the transfer (not the parent case) so any future
 * evaluator error message references the transfer, not the parent case (e.g.
 * "Choose a rail defined for the canada-us-supplier-transfer case."). The
 * cast is necessary because `CaseDefinition.id` is typed as the parent-case
 * `CaseId` literal, but the evaluator only reads `id` for error prose — it
 * does not type-narrow on it. The title is carry-over cosmetic (the evaluator
 * never reads it for grading).
 */
function transferAsDefinition(
  parent: CaseDefinition,
  transfer: TransferDefinition,
): CaseDefinition {
  return {
    ...parent,
    id: transfer.id as CaseId,
    title: parent.title,
    customerRequest: transfer.customerRequest,
    facts: transfer.facts,
    rails: transfer.rails,
    // transfer is already the transfer — drop the nested copy to avoid
    // confusion (the evaluator never reads it).
    transfer,
  };
}
