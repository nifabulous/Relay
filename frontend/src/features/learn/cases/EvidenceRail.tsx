/**
 * EvidenceRail — the evidence ledger for the Case Desk.
 *
 * Groups the case's facts by their `state`:
 *
 *   supplied   — given up front by the customer / scenario
 *   gathered   — the learner requested these (they are now in evidence)
 *   assumption — an explicitly-disclosed modelling assumption
 *   unknown    — present in the case but not yet gathered
 *
 * Each fact shows its label, value, and a compact source status chip:
 *   - `verified`     for facts whose SourceClaim is current
 *   - `under_review` for facts whose source is being refreshed
 *
 * The rail offers one consolidated reference action for all currently
 * available claim-bearing facts. Requestable unknown values remain excluded
 * until the learner gathers them, so the sheet never discloses an answer early.
 *
 * The rail is purely presentational: it takes the definition, the set of
 * requested fact ids, and a consolidated-reference callback. It never writes
 * state.
 */
import type { CaseDefinition, CaseFact } from "./caseTypes";
import { StatusChip } from "../../../design-system/StatusChip";
import { Button } from "../../../design-system/Button";
import "./EvidenceRail.css";

export interface EvidenceRailProps {
  definition: CaseDefinition;
  requestedFactIds: string[];
  /** Open one consolidated sheet for all currently available references. */
  onOpenAllReferences?: (opener?: HTMLButtonElement | null) => void;
}

export function CustomerRequestAnchor({ request }: { request: string }) {
  return (
    <section className="evidence-rail__customer-request" aria-label="Customer request">
      <h2 className="evidence-rail__section-title">Customer request</h2>
      <p className="evidence-rail__customer-request-text">{request}</p>
    </section>
  );
}

type FactState = CaseFact["state"];

// Section ordering + headings. The order is the natural investigation order:
// what you were given → what you gathered → what is assumed → what is unknown.
const SECTIONS: ReadonlyArray<{
  state: FactState;
  heading: string;
  description: string;
}> = [
  { state: "supplied", heading: "Supplied", description: "Given by the customer and scenario." },
  { state: "gathered", heading: "Gathered", description: "You requested these facts; they are now in evidence." },
  { state: "assumption", heading: "Assumption", description: "A disclosed modelling assumption — treat as a caveat." },
  { state: "unknown", heading: "Unknown", description: "Not yet gathered. Request these to close the gaps." },
];

function factsByState(facts: CaseFact[], state: FactState): CaseFact[] {
  return facts.filter((f) => f.state === state);
}

/**
 * Map the case's review provenance to the compact source status chip.
 *
 * In Phase 1 every authored fact shares the case's `reviewStatus`: when the
 * case is `current`, claims are `verified`; when the case is `under_review`,
 * claims are `under_review`. We derive from the definition rather than a
 * per-fact flag because the catalog models review at the case level.
 */
function sourceStatus(definition: CaseDefinition): "verified" | "under_review" {
  return definition.reviewStatus === "under_review" ? "under_review" : "verified";
}

export function EvidenceRail({
  definition,
  requestedFactIds,
  onOpenAllReferences,
}: EvidenceRailProps) {
  const requestedSet = new Set(requestedFactIds);
  const factStatus = sourceStatus(definition);
  const referenceableFacts = definition.facts.filter((fact) => {
    const valueHidden = fact.requestable && fact.state === "unknown" && !requestedSet.has(fact.id);
    return Boolean(fact.claim) && !valueHidden;
  });

  return (
    <aside className="evidence-rail" aria-label="Evidence">
      {onOpenAllReferences && referenceableFacts.length > 0 && (
        <Button
          variant="secondary"
          className="evidence-rail__all-references"
          onClick={(e) => onOpenAllReferences(e.currentTarget)}
        >
          Open all references ({referenceableFacts.length})
        </Button>
      )}

      {SECTIONS.map(({ state, heading, description }) => {
        const facts = factsByState(definition.facts, state);
        if (facts.length === 0) return null;
        return (
          <section
            key={state}
            className="evidence-rail__section"
            aria-label={heading}
          >
            <header className="evidence-rail__section-header">
              <h3 className="evidence-rail__section-title">{heading}</h3>
              <p className="evidence-rail__section-desc">{description}</p>
            </header>
            <ul className="evidence-rail__facts">
              {facts.map((fact) => {
                const requested = requestedSet.has(fact.id);
                // T1 UI: a requestable fact that ships `unknown` must not
                // disclose its VALUE (the answer) until the learner actually
                // requests it. The LABEL stays visible so the learner knows the
                // fact exists and can request it via FactRequest. Non-requestable
                // facts (supplied context) always show their value.
                const valueHidden =
                  fact.requestable && fact.state === "unknown" && !requested;
                return (
                  <li key={fact.id} className="evidence-rail__fact">
                    <div className="evidence-rail__fact-head">
                      <span className="evidence-rail__fact-label">{fact.label}</span>
                      {/* The source-status chip ("Verified" / "Under review")
                          asserts the fact's claim has been checked. That is
                          only true for the learner once they have requested
                          the fact — rendering it next to a "Not yet requested"
                          value is a contradiction (the claim hasn't been
                          verified *for them* yet). Suppress the chip while the
                          value is hidden; the value text carries the state. */}
                      {fact.claim && !valueHidden && (
                        <StatusChip
                          status={factStatus}
                          className="evidence-rail__fact-status"
                        />
                      )}
                      {requested && (
                        <span className="evidence-rail__fact-tag" aria-label="Requested">
                          Requested
                        </span>
                      )}
                    </div>
                    {valueHidden ? (
                      <p className="evidence-rail__fact-value evidence-rail__fact-value--hidden">
                        Not yet requested
                      </p>
                    ) : (
                      <p className="evidence-rail__fact-value">{fact.value}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </aside>
  );
}
