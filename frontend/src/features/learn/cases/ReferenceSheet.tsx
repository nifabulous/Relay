/**
 * ReferenceSheet — the source-details modal for one or more CaseFacts.
 *
 * A pure overlay: opening it never mutates the learner's draft, and closing it
 * restores focus to the element that opened it. Built on a role="dialog" div
 * with aria-modal="true" rather than the native <dialog> element so the focus
 * trap, Escape handling, and focus restoration behave identically across the
 * jsdom test environment and evergreen browsers (the native <dialog>'s
 * showModal() focus-management is inconsistent in jsdom).
 *
 * Accessibility contract (the test pins each of these):
 *   - role="dialog" + aria-modal="true" + aria-labelledby={heading id}
 *   - The heading names the sheet: "<Fact label> reference" in targeted mode
 *     or "Evidence references (N)" in consolidated mode.
 *   - Escape closes.
 *   - Tab cycles within the dialog (focus trap) — Tab from the last focusable
 *     element wraps to the first; Shift+Tab from the first wraps to the last.
 *   - On close, focus moves to `returnFocusRef.current`.
 *
 * The sheet renders the full SourceClaim when present. A fact without a claim
 * still opens (the rail/source may be authored without one) and shows the fact
 * value + label alone.
 */
import { useEffect, useId, useRef } from "react";
import type { CaseFact, SourceClaim } from "./caseTypes";
import { Button } from "../../../design-system/Button";
import "./ReferenceSheet.css";

interface ReferenceSheetProps {
  /** Single-fact mode, retained for direct consumers and tests. */
  fact?: CaseFact;
  /** Consolidated mode: render every currently available reference together. */
  facts?: CaseFact[];
  open: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}

// Human-readable scope labels. The SourceClaim.scope enum is author-facing
// ("scheme-rule", "operator-guidance", …); the sheet shows a friendlier phrase
// while keeping the meaning intact. Centralised so a new scope is a single
// edit point.
const SCOPE_LABEL: Record<SourceClaim["scope"], string> = {
  "scheme-rule": "Scheme rule",
  "operator-guidance": "Operator guidance",
  "institution-config": "Institution configuration",
  "example-assumption": "Scenario assumption",
  "simulation-only": "Simulation only",
};

interface ReferenceGroup {
  facts: CaseFact[];
  claim: SourceClaim | null;
}

function claimKey(claim?: SourceClaim): string {
  if (!claim) return "no-claim";
  return JSON.stringify([
    claim.source,
    claim.owner,
    claim.verifiedAt,
    claim.reviewBy,
    claim.jurisdiction,
    claim.currency ?? null,
    claim.scope,
  ]);
}

function groupReferenceFacts(facts: CaseFact[]): ReferenceGroup[] {
  const groups: ReferenceGroup[] = [];
  const groupByKey = new Map<string, ReferenceGroup>();

  for (const fact of facts) {
    const key = claimKey(fact.claim);
    let group = groupByKey.get(key);
    if (!group) {
      group = { facts: [], claim: fact.claim ?? null };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.facts.push(fact);
  }

  return groups;
}

function ClaimDetails({ claim }: { claim: SourceClaim }) {
  return (
    <dl className="reference-sheet__claim">
      <div className="reference-sheet__row">
        <dt>Source</dt>
        <dd>{claim.source}</dd>
      </div>
      <div className="reference-sheet__row">
        <dt>Owner</dt>
        <dd>{claim.owner}</dd>
      </div>
      <div className="reference-sheet__row">
        <dt>Verified</dt>
        <dd>{claim.verifiedAt}</dd>
      </div>
      <div className="reference-sheet__row">
        <dt>Review by</dt>
        <dd>{claim.reviewBy}</dd>
      </div>
      <div className="reference-sheet__row">
        <dt>Jurisdiction</dt>
        <dd>{claim.jurisdiction}</dd>
      </div>
      {claim.currency && (
        <div className="reference-sheet__row">
          <dt>Currency</dt>
          <dd>{claim.currency}</dd>
        </div>
      )}
      <div className="reference-sheet__row">
        <dt>Scope</dt>
        <dd>{SCOPE_LABEL[claim.scope]}</dd>
      </div>
    </dl>
  );
}

export function ReferenceSheet({ fact, facts, open, onClose, returnFocusRef }: ReferenceSheetProps) {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  // Track the elements we focus-trap between. Recomputed on each open so a
  // DOM change between opens (rare) stays correct.
  const firstFocusableRef = useRef<HTMLElement | null>(null);
  const lastFocusableRef = useRef<HTMLElement | null>(null);

  // Open: move focus into the dialog (to the close button) and snapshot the
  // focusable bounds for the trap. Also register a document-level Escape
  // listener so the sheet closes on Escape regardless of where focus has
  // landed (a robust modal closes on Escape even if focus is momentarily
  // outside the panel — e.g. an external field grabs focus via an autofocus).
  useEffect(() => {
    if (!open) return;
    // Compute focusable elements inside the panel.
    const panel = panelRef.current;
    if (panel) {
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      firstFocusableRef.current = focusable[0] ?? null;
      lastFocusableRef.current = focusable[focusable.length - 1] ?? null;
      // Move focus to the close button (the first predictable control). Falls
      // back to the panel if there is none.
      const target = closeBtnRef.current ?? panel;
      target.focus();
    }

    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [open, onClose]);

  // Close: restore focus to the opener. This runs whenever `open` flips to
  // false, matching the test's "Escape then assert focus on opener" flow.
  useEffect(() => {
    if (open) return;
    const opener = returnFocusRef.current;
    if (opener) opener.focus();
  }, [open, returnFocusRef]);

  // Tab-trap on the panel. Escape is handled by the document-level listener
  // registered in the open effect (so the sheet closes on Escape even if focus
  // has momentarily left the panel). Tab/Shift+Tab at the bounds wraps focus
  // back inside so a keyboard user cannot escape into the draft underneath.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const first = firstFocusableRef.current;
    const last = lastFocusableRef.current;
    if (!first || !last) return;
    if (first === last) {
      // Only one focusable element — keep focus there.
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey) {
      // Shift+Tab from the first element wraps to the last.
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      // Tab from the last element wraps to the first.
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  if (!open) return null;

  const referenceFacts = facts && facts.length > 0 ? facts : fact ? [fact] : [];
  if (referenceFacts.length === 0) return null;
  const isCollection = referenceFacts.length > 1;
  const referenceGroups = isCollection ? groupReferenceFacts(referenceFacts) : [];

  return (
    <div className="reference-sheet__overlay" data-open={open}>
      {/* The panel is the dialog. aria-modal tells AT to treat the rest of the
          page as inert; we additionally trap Tab so a keyboard user cannot
          escape into the draft underneath. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="reference-sheet"
        onKeyDown={handleKeyDown}
        // tabIndex=-1 lets the panel receive programmatic focus as a fallback.
        tabIndex={-1}
      >
        <div className="reference-sheet__header">
          <h2 id={headingId} className="reference-sheet__title">
            {isCollection ? `Evidence references (${referenceFacts.length})` : `${referenceFacts[0].label} reference`}
          </h2>
          <Button
            ref={closeBtnRef}
            variant="secondary"
            onClick={onClose}
            aria-label="Close reference"
            className="reference-sheet__close"
          >
            Close
          </Button>
        </div>

        <div className="reference-sheet__body">
          {isCollection ? (
            <>
              <section className="reference-sheet__group" aria-labelledby={`${headingId}-facts`}>
                <h3 id={`${headingId}-facts`} className="reference-sheet__group-title">
                  Facts reviewed
                </h3>
                <ul className="reference-sheet__fact-list">
                  {referenceFacts.map((currentFact) => (
                    <li key={currentFact.id} className="reference-sheet__fact-item">
                      <span className="reference-sheet__fact-item-label">{currentFact.label}</span>
                      <span className="reference-sheet__fact-item-value">{currentFact.value}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {referenceGroups.map((group, index) => (
                <section
                  key={claimKey(group.claim ?? undefined)}
                  className="reference-sheet__group"
                  aria-labelledby={`${headingId}-source-${index}`}
                >
                  <h3 id={`${headingId}-source-${index}`} className="reference-sheet__group-title">
                    {referenceGroups.length > 1 ? `Source details ${index + 1}` : "Source details"}
                  </h3>
                  <p className="reference-sheet__group-facts">
                    Applies to: {group.facts.map((currentFact) => currentFact.label).join(", ")}
                  </p>
                  {group.claim ? (
                    <ClaimDetails claim={group.claim} />
                  ) : (
                    <p className="reference-sheet__no-claim">
                      No source attribution is recorded for these facts.
                    </p>
                  )}
                </section>
              ))}
            </>
          ) : (
            <section className="reference-sheet__entry">
              <dl className="reference-sheet__fact">
                <dt className="reference-sheet__term">{referenceFacts[0].label}</dt>
                <dd className="reference-sheet__value">{referenceFacts[0].value}</dd>
              </dl>

              {referenceFacts[0].claim ? (
                <ClaimDetails claim={referenceFacts[0].claim} />
              ) : (
                <p className="reference-sheet__no-claim">
                  No source attribution is recorded for this fact.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
