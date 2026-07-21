/**
 * ReferenceSheet — the source-details modal for a single CaseFact.
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
 *   - The heading names the sheet: "<Fact label> reference".
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
  fact: CaseFact;
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

export function ReferenceSheet({ fact, open, onClose, returnFocusRef }: ReferenceSheetProps) {
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

  const claim = fact.claim;

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
            {fact.label} reference
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
          <dl className="reference-sheet__fact">
            <dt className="reference-sheet__term">{fact.label}</dt>
            <dd className="reference-sheet__value">{fact.value}</dd>
          </dl>

          {claim && (
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
          )}

          {!claim && (
            <p className="reference-sheet__no-claim">
              No source attribution is recorded for this fact.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
