/**
 * CaseDesk — the orchestrator for the evidence-led supplier case workspace.
 *
 * Owns the reducer (`useReducer(caseReducer, …)`), persistence
 * (`saveCaseSession`), the debounced customerExplanation write, the optional
 * injected enrichment adapter (rendered through AsyncRegion), focus
 * management across phase transitions, and the polite live region for
 * evidence changes.
 *
 * Phase rendering (Phase-1 scope):
 *   brief        → the customer request + a Start action.
 *   investigate  → the EvidenceRail + FactRequest + RailShortlist + Reference
 *                  Sheet. This is the heart of Task 4.
 *   recommend    → light scaffolding (the same evidence + a note that the full
 *                  recommendation flow is Task 5). The rail/draft controls are
 *                  already usable from investigate.
 *   resolve/debrief → minimal placeholders; Task 5 (recommendation summary,
 *                  case outcome, debrief) fleshes these out.
 *
 * Persistence + debounce:
 *   - Material actions (start, request-facts, edit-draft, open-reference)
 *     dispatch AND persist the resulting session.
 *   - customerExplanation writes are DEBOUNCED 300ms after the last edit and
 *     flushed on blur, Exit case, and Start again. The in-memory draft is
 *     authoritative while a write is pending (the ref holds the latest text).
 *
 * Enrichment:
 *   The optional `enrichment?: CaseEnrichment` prop is an injected adapter.
 *   EnrichmentState → AsyncStatus mapping is centralised in
 *   `enrichmentStatus()`. CRITICAL: authored facts + deterministic evaluation
 *   remain USABLE in every enrichment state. Enrichment only ADDS facts; it
 *   never replaces unknown data with invented values, and on
 *   unavailable/error the learner proceeds with the authored facts.
 */
import { useEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import type {
  CaseDefinition,
  CaseEnrichment,
  CaseFact,
  CaseOutcome as CaseOutcomeData,
  EnrichmentState,
} from "./caseTypes";
import {
  caseReducer,
  createInitialCaseSession,
  loadCaseSession,
  saveCaseSession,
  type CaseSession,
} from "./caseStore";
import { supplierCase } from "./caseCatalog";
import { evaluateRecommendation } from "./caseEvaluator";
import { CaseOutcome } from "./CaseOutcome";
import { CaseDebrief } from "./CaseDebrief";
import { EvidenceRail } from "./EvidenceRail";
import { FactRequest } from "./FactRequest";
import { RailShortlist } from "./RailShortlist";
import { RecommendationSummary } from "./RecommendationSummary";
import { ReferenceSheet } from "./ReferenceSheet";
import { AsyncRegion } from "../../../design-system/AsyncRegion";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import type { AsyncStatus } from "../../../design-system/types";
import "./CaseDesk.css";

export interface CaseDeskProps {
  caseId: CaseDefinition["id"];
  enrichment?: CaseEnrichment;
}

// ─── Enrichment → AsyncStatus mapping ────────────────────────────────────────
// Centralised so the contract is testable and explicit. EnrichmentState is a
// domain enum; AsyncStatus is the design-system region contract. The mapping:
//   idle        → loading   (the adapter is mounted but hasn't resolved yet;
//                            rendered as the skeleton so the learner sees the
//                            affordance exists. Authored facts stay usable.)
//   loading     → loading
//   success     → success   (render enrichment facts)
//   unavailable → unavailable
//   error       → error     (offer retry if enrichment.retry is wired)
function enrichmentStatus(state: EnrichmentState): AsyncStatus {
  switch (state) {
    case "idle":
    case "loading":
      return "loading";
    case "success":
      return "success";
    case "unavailable":
      return "unavailable";
    case "error":
      return "error";
    default: {
      const _: never = state;
      void _;
      return "loading";
    }
  }
}

// The known-cases lookup. In Phase 1 there is a single case; keeping the map
// explicit makes a future second case a single edit point and lets the route
// pass through any caseId without a special case here.
const KNOWN_CASES: ReadonlyArray<CaseDefinition> = [supplierCase];

function findCase(caseId: string): CaseDefinition | null {
  return KNOWN_CASES.find((c) => c.id === caseId) ?? null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CaseDesk({ caseId, enrichment }: CaseDeskProps) {
  const definition = findCase(caseId);
  // Lazy initializer: if a stored session exists, resume from it; else start
  // fresh. loadCaseSession returns null when absent/corrupt and a recovered
  // session on revision mismatch — both are handled by passing the result
  // straight to the reducer's initial state.
  const [session, dispatch] = useReducer(
    caseReducer,
    caseId,
    (id) => loadCaseSession(id) ?? createInitialCaseSession(id),
  );

  // Reference-sheet state lives in the Case Desk (not the reducer) because it
  // is transient UI: opening/closing the sheet is not a material decision and
  // must not be persisted. The reducer's `open-reference` action still records
  // that a reference was opened (for analytics / the debrief), but the sheet's
  // open/close is purely local.
  const [openReferenceFactId, setOpenReferenceFactId] = useState<string | null>(null);
  // The opener button for the currently-open sheet, used to restore focus.
  const referenceOpenerRef = useRef<HTMLButtonElement | null>(null);

  // Polite live region content for evidence changes (e.g. "2 new facts
  // available"). Updated when the requested-fact set changes.
  // T18: the dependency is the array IDENTITY (session.requestedFactIds),
  // not its length. A same-length swap (uncheck A + check B in the same
  // Request action) changes the evidence content without changing the count;
  // the live region must still announce it. Tracking the previous ids (not
  // just the previous count) lets us phrase the message precisely.
  const [evidenceAnnouncement, setEvidenceAnnouncement] = useState("");
  const prevRequestedIdsRef = useRef<string[]>(session.requestedFactIds);

  // Invalidation announcement (DESIGN spec §invalidation): when the learner
  // changes the requested-fact set during the recommend phase, the reducer
  // clears the dependent working draft. This event carries that signal from
  // the request-facts handler to a focus+announce effect.
  //
  // Why an event object, not a string: a second sequential invalidation
  // would produce the SAME announcement text, and React's useState setter
  // short-circuits when the new value === the old — so neither the live
  // region nor the focus effect would re-fire. Each invalidation mints a
  // new object with an incrementing id, so React always sees a new
  // reference and the effect re-runs every time. The effect clears the
  // event (sets null) after focusing, so the live region text is spoken
  // once and then empties — ready for the next announcement to register
  // as a distinct change.
  const [invalidationEvent, setInvalidationEvent] = useState<
    { id: number; message: string } | null
  >(null);
  const invalidationIdRef = useRef(0);
  const invalidationClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortlistHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // The phase heading ref — focus moves here on phase transition.
  const phaseHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // ── customerExplanation debounce ──────────────────────────────────────────
  // The in-memory draft is authoritative during a pending write: the text box
  // is controlled by `explanationText` (local state), and a debounced
  // edit-draft action persists it. We flush on blur, Exit case, and Start
  // again. 300ms matches the plan.
  const [explanationText, setExplanationText] = useState(session.draft.customerExplanation);
  const explanationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingExplanationRef = useRef(session.draft.customerExplanation);

  // Always-current view of the session so async callbacks (the debounce
  // timer, the unmount cleanup) never close over a stale session snapshot.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Keep the local text in sync if the session's customerExplanation changes
  // out from under us (e.g. restart, revision reset). We only adopt the
  // session value when nothing is pending so we never clobber an unsaved edit.
  useEffect(() => {
    if (explanationTimerRef.current === null) {
      setExplanationText(session.draft.customerExplanation);
      pendingExplanationRef.current = session.draft.customerExplanation;
    }
  }, [session.draft.customerExplanation]);

  // Cleanup: flush any pending write on unmount so an Exit mid-debounce does
  // not lose the last keystrokes. Reads sessionRef so it persists the LATEST
  // session, not the one captured at mount (which could be many renders stale
  // after a long investigation session).
  //
  // T17 Part A: the unmount-time flush is BEST-EFFORT. The component is
  // leaving the tree, so dispatching a state update or surfacing a save
  // error is pointless (the learner is gone and the in-memory draft was
  // authoritative). The cleanup writes directly to localStorage via the
  // write-only `persistToDisk` helper (a try/catch around saveCaseSession
  // that swallows any failure) instead of going through `persist` (which
  // dispatches + setSaveError). This avoids both:
  //   - state updates on an unmounted component (semantically wrong, and
  //     older React logged a warning), and
  //   - any unhandled throw escaping the unmount path (saveVersioned already
  //     catches, but a future regression — e.g. a stray throw before the
  //     catch — would propagate without this guard).
  useEffect(() => {
    return () => {
      if (explanationTimerRef.current !== null) {
        clearTimeout(explanationTimerRef.current);
        explanationTimerRef.current = null;
        flushExplanationToDisk(pendingExplanationRef.current);
      }
      // T4: also flush any pending debounced reasoning-field persist on
      // unmount, so the latest free-text edits reach storage. Best-effort
      // write-only path (same shape as flushExplanationToDisk): never
      // dispatches, never calls setSaveError, swallows any failure.
      if (draftPersistTimerRef.current !== null) {
        clearTimeout(draftPersistTimerRef.current);
        draftPersistTimerRef.current = null;
        const pending = pendingDraftPersistRef.current;
        pendingDraftPersistRef.current = null;
        if (pending !== null) {
          const stamped = { ...pending, updatedAt: new Date().toISOString() };
          try {
            saveCaseSession(stamped);
          } catch {
            // Best-effort unmount-time write; see flushExplanationToDisk.
          }
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flushExplanation(text: string) {
    const current = sessionRef.current;
    if (text !== current.draft.customerExplanation) {
      const next = caseReducer(current, { type: "edit-draft", patch: { customerExplanation: text } });
      if (next !== current) {
        dispatch({ type: "edit-draft", patch: { customerExplanation: text } });
        persist(next);
      }
    }
  }

  // T17 Part A: write-only flush used by the unmount cleanup. Stamps the
  // session with a fresh updatedAt and writes it via saveCaseSession, then
  // swallows any failure (the write is best-effort; the in-memory draft was
  // authoritative and the learner is leaving). Never dispatches, never calls
  // setSaveError — those are pointless on an unmounted component.
  function flushExplanationToDisk(text: string) {
    const current = sessionRef.current;
    if (text === current.draft.customerExplanation) return;
    const next = caseReducer(current, { type: "edit-draft", patch: { customerExplanation: text } });
    if (next === current) return;
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    try {
      saveCaseSession(stamped);
    } catch {
      // Best-effort: a failed unmount-time write is not recoverable (the
      // learner is leaving) and not actionable (the in-memory draft was
      // authoritative while the component was mounted). Swallow.
    }
  }

  function scheduleExplanationPersist(text: string) {
    pendingExplanationRef.current = text;
    if (explanationTimerRef.current !== null) {
      clearTimeout(explanationTimerRef.current);
    }
    explanationTimerRef.current = setTimeout(() => {
      explanationTimerRef.current = null;
      flushExplanation(pendingExplanationRef.current);
    }, 300);
  }

  // ── Persistence wrapper ───────────────────────────────────────────────────
  // The reducer is pure; we persist the NEXT session after a material action.
  // Save failures are surfaced (not swallowed) but the in-memory draft is
  // never lost.
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Recovery notice ───────────────────────────────────────────────────────
  // When loadCaseSession returns a recovered session (status "under_review"),
  // the case content changed under the learner: their draft was wiped and the
  // preserved firstAttempt is kept. We must not silently show an empty draft —
  // the plan's failure-modes table promises "Restart explanation and safe
  // action" / "your prior draft was invalidated." This notice is shown on mount
  // for recovered sessions and is dismissible; the dismissal is local (it is
  // not a material decision and should not be persisted).
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const showRecoveryNotice =
    session.status === "under_review" && !recoveryDismissed;
  function persist(next: CaseSession) {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    const result = saveCaseSession(stamped);
    if (!result.ok) {
      setSaveError(
        result.reason === "quota"
          ? "We couldn't save your progress — this browser's storage is full. Your work in this tab is kept, but won't persist if you leave."
          : "We couldn't save your progress — this browser may be blocking storage. Your work in this tab is kept, but won't persist if you leave.",
      );
    } else {
      // T15: clear any prior transient save-failure alert once a later write
      // succeeds. Without this, a one-time quota failure leaves the alert
      // visible forever, even after every subsequent write succeeds.
      setSaveError(null);
    }
  }

  // ── Debounced free-text draft persist (T4) ─────────────────────────────────
  // The reasoning free-text fields (primary reason, conditions, price / arrival
  // / tracking expectations) used to persist synchronously on every keystroke.
  // Each keystroke ran structuredClone + JSON.stringify + setItem for the
  // whole session — wasteful for a few-KB payload. Debounce the persist (NOT
  // the dispatch — the UI stays responsive) to 300ms after the last edit,
  // with flush on blur / send / restart / unmount. customerExplanation has
  // its own debounce machinery above (it has its own pending-text ref so the
  // dispatch can be deferred too); this debounce wraps only the persist.
  //
  // The pending session ref always holds the LATEST next-session computed by
  // handleDraftPatch, so coalescing rapid edits persists only the final value
  // (matching the customerExplanation behaviour).
  const draftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftPersistRef = useRef<CaseSession | null>(null);

  function scheduleDraftPersist(next: CaseSession) {
    pendingDraftPersistRef.current = next;
    if (draftPersistTimerRef.current !== null) {
      clearTimeout(draftPersistTimerRef.current);
    }
    draftPersistTimerRef.current = setTimeout(() => {
      draftPersistTimerRef.current = null;
      const pending = pendingDraftPersistRef.current;
      pendingDraftPersistRef.current = null;
      if (pending !== null) {
        persist(pending);
      }
    }, 300);
  }

  // Flush a pending debounced persist immediately. Called on blur (per
  // field), Send, Restart, and unmount. Idempotent: a no-op when nothing is
  // pending.
  function flushDraftPersist() {
    if (draftPersistTimerRef.current !== null) {
      clearTimeout(draftPersistTimerRef.current);
      draftPersistTimerRef.current = null;
      const pending = pendingDraftPersistRef.current;
      pendingDraftPersistRef.current = null;
      if (pending !== null) {
        persist(pending);
      }
    }
  }

  // ── Focus management on phase transition ──────────────────────────────────
  // Move focus to the new phase heading after a transition. Respects reduced
  // motion (the heading focus is instant; tokens already zero durations under
  // prefers-reduced-motion, and we don't animate the focus move itself).
  const prevPhaseRef = useRef(session.phase);
  useEffect(() => {
    if (prevPhaseRef.current !== session.phase) {
      prevPhaseRef.current = session.phase;
      const heading = phaseHeadingRef.current;
      if (heading) {
        // tabindex=-1 lets a heading receive programmatic focus.
        heading.setAttribute("tabindex", "-1");
        heading.focus();
      }
    }
  }, [session.phase]);

  // ── Focus restoration after the reference sheet closes ───────────────────
  // The ReferenceSheet is conditionally rendered (`referenceFact && <Sheet/>`),
  // so when it closes it UNMOUNTS rather than re-rendering with open=false.
  // Its own close-effect (which calls returnFocusRef.current.focus()) never
  // fires because the component is gone. CaseDesk owns the close transition
  // and restores focus to the opener here. The opener button was captured on
  // open via referenceOpenerRef; if no opener was captured the ref falls back
  // to the hidden sentinel, which is harmless.
  const prevOpenReferenceRef = useRef(openReferenceFactId);
  useEffect(() => {
    const prev = prevOpenReferenceRef.current;
    const curr = openReferenceFactId;
    prevOpenReferenceRef.current = curr;
    // Transition from open (non-null) → closed (null): restore focus.
    if (prev !== null && curr === null) {
      const opener = referenceOpenerRef.current;
      if (opener) opener.focus();
    }
  }, [openReferenceFactId]);

  // ── Evidence live region ──────────────────────────────────────────────────
  // Announce when the requested-fact set changes. T18: announce on the array
  // IDENTITY change (which fires for both count growth AND same-length swaps),
  // not just on count growth. The reducer's arrayEqual guard produces a new
  // reference only when content differs, so depending on the array itself
  // captures every material change.
  useEffect(() => {
    const prev = prevRequestedIdsRef.current;
    const curr = session.requestedFactIds;
    // No-op if the reference is unchanged (the reducer returns the SAME
    // reference for an identical set).
    if (prev === curr) {
      return;
    }
    const prevSet = new Set(prev);
    const currSet = new Set(curr);
    // Diff the sets so the announcement is precise: "added", "removed", or
    // "updated" (a swap where some were added AND some were removed).
    let added = 0;
    let removed = 0;
    for (const id of currSet) if (!prevSet.has(id)) added++;
    for (const id of prevSet) if (!currSet.has(id)) removed++;
    if (added > 0 && removed === 0) {
      setEvidenceAnnouncement(
        added === 1
          ? "1 new fact available in your evidence."
          : `${added} new facts available in your evidence.`,
      );
    } else if (added === 0 && removed > 0) {
      // Pure removal (rare in the Phase 1 UI but the contract must hold).
      setEvidenceAnnouncement("");
    } else if (added > 0 && removed > 0) {
      // Same-length swap or a mixed change. Phrase as "updated" so the
      // learner knows the evidence changed even though the count may be the
      // same.
      setEvidenceAnnouncement(
        added === 1 && removed === 1
          ? "Evidence updated: 1 fact changed."
          : `Evidence updated: ${added} added, ${removed} removed.`,
      );
    } else {
      // No diff (shouldn't happen — the reference differed — but be safe).
      setEvidenceAnnouncement("");
    }
    prevRequestedIdsRef.current = curr;
  }, [session.requestedFactIds]);

  // ── Action handlers ───────────────────────────────────────────────────────
  function handleStart() {
    const next = caseReducer(session, { type: "start" });
    if (next !== session) {
      dispatch({ type: "start" });
      persist(next);
    }
  }

  function handleRestart() {
    // Flush any pending explanation first so the in-memory draft isn't lost.
    if (explanationTimerRef.current !== null) {
      clearTimeout(explanationTimerRef.current);
      explanationTimerRef.current = null;
      flushExplanation(pendingExplanationRef.current);
    }
    // T4: flush any pending debounced reasoning-field persist too, so the
    // latest free-text edits reach storage before the restart wipes the
    // working draft. (The persisted session is then overwritten by the
    // restart persist below; the point is to NOT lose edits that were still
    // in the 300ms window.)
    flushDraftPersist();
    const next = caseReducer(session, { type: "restart" });
    if (next !== session) {
      dispatch({ type: "restart" });
      persist(next);
    }
  }

  // ── Send recommendation ──────────────────────────────────────────────────
  // The commit. CRITICAL ORDERING: fold any pending customerExplanation write
  // into the snapshot FIRST so the immutable firstAttempt captures the latest
  // typed text. We compute the flushed session LOCALLY (not via sessionRef)
  // because flushExplanation's edit-draft dispatch is batched by React and
  // sessionRef.current would still hold the pre-flush draft at this point.
  //
  // The reducer's double-submit protection handles rapid double-clicks: once
  // firstAttempt is set, a second send returns the SAME session reference and
  // the `next !== flushedSession` guard skips a redundant dispatch/persist.
  //
  // `isSending` is transient UI (not persisted): it gates the Send button's
  // pending state. The evaluator is pure and synchronous, so the pending
  // window is the time spent in persist()/storage I/O. Save failures surface
  // through the existing saveError affordance — the in-memory snapshot is
  // never lost.
  const [isSending, setIsSending] = useState(false);

  // Validation error-summary (design spec L213, Focus & Announcement Contract):
  // when the learner clicks Send with an incomplete recommendation, a concise
  // error summary renders at the start of the primary task, each message
  // linked to its control, and focus moves to the summary. Null when there
  // are no errors (the resting state). Any draft edit clears it so the
  // summary never goes stale.
  //
  // Each error carries a `controlId` — the DOM id of the control the learner
  // must interact with to resolve it. The summary renders each message as a
  // fragment anchor (`<a href="#{controlId}">`) so a learner can jump to fix
  // it, and the target control carries `aria-describedby` pointing back.
  interface ValidationEntry {
    message: string;
    controlId: string;
  }
  const [validationErrors, setValidationErrors] = useState<ValidationEntry[] | null>(null);
  const validationSummaryRef = useRef<HTMLDivElement | null>(null);

  // Focus the validation summary when it appears (spec L213). A new array
  // reference each validation failure re-fires this even if the message text
  // repeats (mirrors the invalidation-announcement nonce pattern).
  useEffect(() => {
    if (validationErrors === null) return;
    validationSummaryRef.current?.focus();
  }, [validationErrors]);

  function handleSendRecommendation() {
    // 0) Validation gate (spec L213). Before flushing/evaluating/snapshotting,
    //    validate the recommendation is complete enough to commit. If not,
    //    surface a linked error summary and abort the send (no evaluator call,
    //    no firstAttempt). Validation rules mirror the evaluator's
    //    pre-conditions: a rail must be selected, and the primary reason must
    //    be substantive (T1b threshold). Expectations are NOT validated here —
    //    the evaluator scores `possible` for thin expectations rather than
    //    blocking the commit, and a learner may legitimately send a partial
    //    recommendation to see the consequence.
    let flushedText = session.draft.customerExplanation;
    if (explanationTimerRef.current !== null) {
      clearTimeout(explanationTimerRef.current);
      explanationTimerRef.current = null;
      flushedText = pendingExplanationRef.current;
    }
    // Reset the pending ref to the flushed value so a second Send during the
    // window before React commits the send-recommendation dispatch cannot
    // re-flush a stale (pre-edit) value. Matches flushExplanation's canonical
    // post-clear behaviour. The reducer's double-submit guard already makes a
    // true double-Submit a no-op; this hardens the invariant for the revision
    // path, where Send is legal again.
    pendingExplanationRef.current = flushedText;
    // T4: cancel any pending debounced reasoning-field persist so it cannot
    // fire AFTER the send-recommendation persist and overwrite the snapshot
    // with a stale pre-send session. The reasoning edits themselves are
    // already in `session` (the dispatch was immediate) and are folded into
    // the send's persist via the snapshot. Cancelling the timer here means
    // the debounced persist's stale write can't race with the snapshot.
    if (draftPersistTimerRef.current !== null) {
      clearTimeout(draftPersistTimerRef.current);
      draftPersistTimerRef.current = null;
      // Drop the pending payload WITHOUT persisting — the send-recommendation
      // persist below will persist the same edits (plus the snapshot) in the
      // correct order.
      pendingDraftPersistRef.current = null;
    }

    // 2) Compute the flushed session locally by folding the pending text into
    //    the draft. If nothing was pending, this is a no-op (same reference).
    const flushedSession =
      flushedText === session.draft.customerExplanation
        ? session
        : caseReducer(session, { type: "edit-draft", patch: { customerExplanation: flushedText } });

    // 2b) Validate the flushed draft (spec L213). Build the error list against
    //     the FLUSHED draft so a pending rail selection just before Send counts.
    //     On any error, surface the linked summary and abort — no evaluator,
    //     no snapshot, no phase change.
    //
    //     Validation scope: STRUCTURAL incompleteness only (no rail selected).
    //     Reasoning QUALITY (filler reasons, thin expectations) is NOT validated
    //     here — the evaluator scores those `possible` after commit, and the
    //     Resolve phase is explicitly designed to show the learner the
    //     consequence of thin reasoning (spec L188-192). Blocking filler at
    //     the gate would deny the learner that learning signal.
    const errors: ValidationEntry[] = [];
    if (flushedSession.draft.selectedRail === null) {
      // The rail-selection fieldset is the control the learner must interact
      // with. Its id is set on the RailShortlist's fieldset element.
      errors.push({ message: "Select a rail to recommend.", controlId: "case-desk-rail-shortlist" });
    }
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSending(true);
    try {
      // 3) Evaluate the FLUSHED draft and snapshot it. The evaluator is pure
      //    and deterministic — the same draft always yields the same outcome.
      //    T1: pass the set of facts the learner actually requested so the
      //    investigation is load-bearing (a requestable fact not requested is
      //    treated as unknown for scoring). flushedSession derives from
      //    session (only customerExplanation may differ), so it carries the
      //    same requestedFactIds.
      if (!definition) return;
      const outcome = evaluateRecommendation(
        definition,
        flushedSession.draft,
        new Set(flushedSession.requestedFactIds),
      );
      const submittedAt = new Date().toISOString();
      const next = caseReducer(flushedSession, {
        type: "send-recommendation",
        outcome,
        submittedAt,
      });
      // 4) Legal dispatch (not a double-submit no-op): replay the edit-draft
      //    (when text was pending) then send-recommendation so React's
      //    in-memory state matches the persisted snapshot. The reducer is
      //    deterministic, so re-running it from the same inputs yields `next`.
      if (next !== flushedSession) {
        if (flushedSession !== session) {
          dispatch({ type: "edit-draft", patch: { customerExplanation: flushedText } });
        }
        dispatch({ type: "send-recommendation", outcome, submittedAt });
        persist(next);
      }
    } finally {
      setIsSending(false);
    }
  }

  // ── Begin revision ────────────────────────────────────────────────────────
  // The one-shot do-over. The reducer's begin-revision branch is the ultimate
  // guard for the one-revision-per-case contract: it returns the SAME session
  // reference when firstAttempt is null OR revisedAttempt is already set, so a
  // stale click (e.g. after a rapid double-tap on Revise) is a cheap no-op.
  // We persist only when the reducer actually advanced (next !== session).
  function handleBeginRevision() {
    const next = caseReducer(session, { type: "begin-revision" });
    if (next !== session) {
      dispatch({ type: "begin-revision" });
      persist(next);
    }
  }

  // ── Complete transfer ────────────────────────────────────────────────────
  // Finishes the experience. CaseOutcome computes the transfer outcome via the
  // pure evaluator against the transfer's facts/rails (adapted into a
  // CaseDefinition-like shape) and hands it here. We dispatch
  // `complete-transfer { outcome }`; the reducer sets status `completed` and
  // phase `debrief`. The debrief UI is Piece 5c — we render a minimal
  // placeholder for it below.
  function handleCompleteTransfer(outcome: CaseOutcomeData) {
    // The `next !== session` guard is defensive: from the resolve phase,
    // complete-transfer always advances (the reducer only no-ops when the
    // session is still in `brief` or `firstAttempt === null`, neither of
    // which is reachable once we render CaseOutcome). The guard mirrors the
    // other handlers' pattern for consistency.
    const next = caseReducer(session, { type: "complete-transfer", outcome });
    if (next !== session) {
      dispatch({ type: "complete-transfer", outcome });
      persist(next);
    }
  }

  // Local mirror of the in-flight checkbox selection (before "Request facts"
  // commits it). Keeps FactRequest's checkboxes responsive without a dispatch
  // per toggle. Re-synced from the session whenever the committed requested
  // set changes out from under us (e.g. restart, resume from storage) so the
  // checkboxes never desync from persisted state.
  const [pendingRequestedIds, setPendingRequestedIds] = useState<string[]>(session.requestedFactIds);
  useEffect(() => {
    setPendingRequestedIds(session.requestedFactIds);
  }, [session.requestedFactIds]);

  function handleRequestedFactChange(ids: string[]) {
    // Local checkbox state is reflected via FactRequest's controlled value
    // (the Case Desk passes pendingRequestedIds down). No dispatch here — only
    // on the explicit Request action. This keeps the pending selection in the
    // component tree via the local mirror.
    setPendingRequestedIds(ids);
  }

  function handleRequestFacts(ids: string[]) {
    const next = caseReducer(session, { type: "request-facts", ids });
    if (next !== session) {
      dispatch({ type: "request-facts", ids });
      persist(next);
      // Invalidation contract (DESIGN spec §invalidation): during the
      // recommend phase, an evidence change clears the dependent working
      // draft. The reducer applies this conditionally on phase === "recommend"
      // (investigate leaves the draft intact). We mirror that exact condition
      // here to arm the announcement + focus effect — comparing draft
      // references would be wrong because cloneSession always produces a new
      // draft reference even when content is unchanged.
      if (session.phase === "recommend") {
        // Mint a new event object (new reference) so a second sequential
        // invalidation with the same message text still triggers the
        // effect below.
        invalidationIdRef.current += 1;
        setInvalidationEvent({
          id: invalidationIdRef.current,
          message:
            "Evidence changed — your rail shortlist, selected rail, and reasoning have been cleared. Rebuild your recommendation against the new evidence.",
        });
      }
    }
  }

  // Invalidation focus + announce. Fires when a new invalidation event is
  // set, moves focus to the shortlist heading (the first affected decision),
  // then schedules a clear so the live region text is spoken once and then
  // empties. Clearing (rather than leaving the text) is what lets a
  // subsequent invalidation register as a distinct change even if its
  // message text is identical. The heading carries tabIndex={-1} so it is
  // a valid programmatic-focus target without joining the tab order.
  //
  // The clear runs after a short delay rather than synchronously: React
  // batches synchronous setState in the same effect, which would wipe the
  // message before it ever reached the DOM (defeating the announcement).
  // The delay is long enough for AT to read the polite region and short
  // enough that the region is empty well before any plausible second
  // invalidation.
  useEffect(() => {
    if (!invalidationEvent) return;
    shortlistHeadingRef.current?.focus();
    if (invalidationClearTimerRef.current) {
      clearTimeout(invalidationClearTimerRef.current);
    }
    invalidationClearTimerRef.current = setTimeout(() => {
      setInvalidationEvent(null);
    }, 1000);
    return () => {
      if (invalidationClearTimerRef.current) {
        clearTimeout(invalidationClearTimerRef.current);
      }
    };
  }, [invalidationEvent]);

  function handleDraftPatch(patch: Partial<CaseSession["draft"]>) {
    const next = caseReducer(session, { type: "edit-draft", patch });
    if (next !== session) {
      dispatch({ type: "edit-draft", patch });
      // Clear any pending validation error-summary (spec L213): the summary
      // is stale the moment the learner edits the draft. It re-surfaces only
      // if they re-send and the draft is still invalid.
      setValidationErrors(null);
      // T4: debounce the persist (not the dispatch). The UI reflects the edit
      // immediately via the synchronous dispatch; the localStorage write is
      // coalesced across rapid keystrokes and flushed on blur / send /
      // restart / unmount. This avoids structuredClone + JSON.stringify +
      // setItem per keystroke for the reasoning free-text fields.
      scheduleDraftPersist(next);
    }
  }

  // ── Diagnosis (spec L189 resolve-phase reflection) ────────────────────────
  // The diagnosis textarea in the resolve phase captures the learner's
  // reflection. Dispatch is immediate (pure, cheap) so the UI reflects the
  // edit at once; the persist is debounced 300ms (same cadence as the
  // reasoning fields, T4) and flushed on blur / send / restart / unmount.
  const diagnosisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleDiagnosisChange(diagnosis: string) {
    const next = caseReducer(session, { type: "set-diagnosis", diagnosis });
    if (next !== session) {
      dispatch({ type: "set-diagnosis", diagnosis });
      scheduleDiagnosisPersist(next);
    }
  }

  // ── Baseline (spec L171 ungraded starting view) ───────────────────────────
  // The baseline rail + confidence are captured at the start of investigate,
  // before any facts are requested. Dispatch is immediate + persist immediate
  // (the baseline is a one-shot capture, not free text — no debounce needed).
  function handleSetBaseline(railId: string | null, confidence: "low" | "medium" | "high" | null) {
    const next = caseReducer(session, { type: "set-baseline", railId, confidence });
    if (next !== session) {
      dispatch({ type: "set-baseline", railId, confidence });
      persist(next);
    }
  }

  function scheduleDiagnosisPersist(next: CaseSession) {
    if (diagnosisTimerRef.current !== null) {
      clearTimeout(diagnosisTimerRef.current);
    }
    diagnosisTimerRef.current = setTimeout(() => {
      persist(next);
      diagnosisTimerRef.current = null;
    }, 300);
  }

  function flushDiagnosisToDisk() {
    if (diagnosisTimerRef.current !== null) {
      clearTimeout(diagnosisTimerRef.current);
      diagnosisTimerRef.current = null;
      persist(sessionRef.current);
    }
  }

  function handleOpenReference(factId: string, opener?: HTMLButtonElement | null) {
    const next = caseReducer(session, { type: "open-reference", referenceId: factId });
    if (next !== session) {
      dispatch({ type: "open-reference", referenceId: factId });
      persist(next);
    }
    // Capture the actual opener button so focus is restored to it on close.
    // Falls back to whatever the ref currently points at (the hidden sentinel)
    // so the ReferenceSheet's returnFocusRef contract always resolves.
    if (opener) referenceOpenerRef.current = opener;
    setOpenReferenceFactId(factId);
  }

  function handleCloseReference() {
    setOpenReferenceFactId(null);
  }

  // ── Enrichment: build an extended definition by APPENDING enrichment facts ─
  // CRITICAL: enrichment only ADDS facts. Authored facts are never replaced.
  // If enrichment is in an error/unavailable state, the authored definition is
  // used unchanged — the learner proceeds with what they have.
  const enrichmentFacts: CaseFact[] = useMemo(() => {
    if (!enrichment) return [];
    if (enrichment.state === "success") return enrichment.facts;
    return [];
  }, [enrichment]);

  const effectiveDefinition: CaseDefinition | null = useMemo(() => {
    if (!definition) return null;
    if (enrichmentFacts.length === 0) return definition;
    // Append enrichment facts that are NOT already present by id (defensive:
    // an enrichment adapter should never echo an authored fact, but we guard
    // against replacing authored data with an invented value).
    const authoredIds = new Set(definition.facts.map((f) => f.id));
    const additions = enrichmentFacts.filter((f) => !authoredIds.has(f.id));
    return { ...definition, facts: [...definition.facts, ...additions] };
  }, [definition, enrichmentFacts]);

  // The fact currently shown in the ReferenceSheet (if any).
  const referenceFact =
    openReferenceFactId && effectiveDefinition
      ? effectiveDefinition.facts.find((f) => f.id === openReferenceFactId) ?? null
      : null;

  // Unknown-case guard: if the route passed an id we don't know, render a
  // minimal honest state. (The route already guards this, but the Case Desk is
  // defensive — it can be rendered directly in tests.)
  if (!definition) {
    return (
      <div className="case-desk case-desk--missing">
        <p>This case could not be found.</p>
        <Link to="/learn" className="relay-btn relay-btn--secondary">Back to Learn</Link>
      </div>
    );
  }

  // After the guard, both definition and effectiveDefinition are non-null. TS
  // can't narrow effectiveDefinition (it's a useMemo result), so we rebind to
  // a non-null const for the render below.
  const view = effectiveDefinition ?? definition;

  return (
    <div className="case-desk">
      {/* Linked error summary for save failures (validation issues share this
          affordance). */}
      {saveError && (
        <div className="case-desk__error-summary" role="alert">
          <h2 className="case-desk__error-title">Couldn't save your progress</h2>
          <p className="case-desk__error-detail">{saveError}</p>
          <Button variant="secondary" onClick={() => setSaveError(null)}>Dismiss</Button>
        </div>
      )}

      {/* Polite live region for evidence changes. */}
      <div className="case-desk__live" aria-live="polite">
        {evidenceAnnouncement}
      </div>

      {/* Polite live region for invalidation announcements (DESIGN spec
          §invalidation). Separate from the evidence region so a screen reader
          delivers both the "evidence changed" and "decisions cleared" messages
          distinctly. Cleared after focus moves to the shortlist. */}
      <div className="case-desk__live" aria-live="polite">
        {invalidationEvent?.message}
      </div>

      {showRecoveryNotice && (
        <RecoveryNotice
          hasSubmittedAttempt={session.firstAttempt !== null}
          onDismiss={() => setRecoveryDismissed(true)}
        />
      )}

      {session.phase === "brief" && (
        <BriefPhase
          definition={definition}
          onStart={handleStart}
          phaseHeadingRef={phaseHeadingRef}
        />
      )}

      {(session.phase === "investigate" || session.phase === "recommend") && (
        <InvestigatePhase
          definition={view}
          session={session}
          enrichment={enrichment}
          pendingRequestedIds={pendingRequestedIds}
          phaseKey={session.phase}
          phaseHeadingRef={phaseHeadingRef}
          shortlistHeadingRef={shortlistHeadingRef}
          onRequestedFactChange={handleRequestedFactChange}
          onRequestFacts={handleRequestFacts}
          onDraftPatch={handleDraftPatch}
          onDraftFieldBlur={flushDraftPersist}
          onOpenReference={handleOpenReference}
          onCloseReference={handleCloseReference}
          referenceFact={referenceFact}
          referenceOpenerRef={referenceOpenerRef}
          explanationText={explanationText}
          onExplanationChange={(text) => {
            setExplanationText(text);
            scheduleExplanationPersist(text);
          }}
          onExplanationBlur={() => {
            if (explanationTimerRef.current !== null) {
              clearTimeout(explanationTimerRef.current);
              explanationTimerRef.current = null;
            }
            flushExplanation(pendingExplanationRef.current);
          }}
          onRestart={handleRestart}
          onSendRecommendation={handleSendRecommendation}
          isSending={isSending}
          validationErrors={validationErrors}
          validationSummaryRef={validationSummaryRef}
          onSetBaseline={handleSetBaseline}
        />
      )}

      {session.phase === "resolve" && (
        // Piece 5b: the resolve phase is driven by <CaseOutcome> —
        // consequence-first feedback, decision-quality chip, the prioritized
        // reasoning gap, the sound-reasoning list, and the revise/transfer
        // affordances. CaseDesk owns the handlers.
        <CaseOutcome
          definition={definition}
          session={session}
          phaseHeadingRef={phaseHeadingRef}
          onBeginRevision={handleBeginRevision}
          onCompleteTransfer={handleCompleteTransfer}
          onDiagnosisChange={handleDiagnosisChange}
          onDiagnosisBlur={flushDiagnosisToDisk}
        />
      )}

      {session.phase === "debrief" && (
        // Piece 5c: the finish. Renders the supported-performance section
        // (main case, full scaffolding) and the independent-transfer section
        // (transfer variant, less scaffolding) as DISTINCT regions, plus the
        // synthetic-data disclosure and Back-to-Learn / Start-again.
        <CaseDebrief
          definition={definition}
          session={session}
          phaseHeadingRef={phaseHeadingRef}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}

// ─── Brief phase ─────────────────────────────────────────────────────────────

interface BriefPhaseProps {
  definition: CaseDefinition;
  onStart: () => void;
  phaseHeadingRef: RefObject<HTMLHeadingElement | null>;
}

function BriefPhase({ definition, onStart, phaseHeadingRef }: BriefPhaseProps) {
  return (
    <section className="case-desk__brief" aria-label="Case brief">
      <header className="case-desk__phase-header">
        <p className="case-desk__eyebrow">Customer case desk</p>
        <h1 ref={phaseHeadingRef} className="case-desk__phase-title">{definition.title}</h1>
      </header>
      <section className="case-desk__customer-request" aria-label="Customer request">
        <h2 className="case-desk__section-title">Customer request</h2>
        <p className="case-desk__customer-request-text">{definition.customerRequest}</p>
      </section>
      <dl className="case-desk__meta">
        <div className="case-desk__meta-row">
          <dt>Last verified</dt>
          <dd>{definition.verifiedAt}</dd>
        </div>
        <div className="case-desk__meta-row">
          <dt>Review by</dt>
          <dd>{definition.reviewBy}</dd>
        </div>
      </dl>
      <p className="case-desk__simulation-note">
        This is a fictional training simulation. All names, amounts, and banks
        are invented.
      </p>
      <Button variant="primary" onClick={onStart} className="case-desk__primary-action">
        Start investigation
      </Button>
    </section>
  );
}

// ─── Recovery notice (under_review sessions) ────────────────────────────────

interface RecoveryNoticeProps {
  hasSubmittedAttempt: boolean;
  onDismiss: () => void;
}

/**
 * Dismissible, accessible announcement shown when a recovered session resumes.
 * A recovered session (status "under_review") means the case content changed
 * under the learner: their in-progress draft was invalidated and reset to the
 * current case material, while their submitted first attempt is preserved.
 *
 * Uses role="status" (a polite announcement) rather than role="alert" (which
 * would be interruptive) — this is an informative recovery state, not an
 * error. The warning styling + StatusChip("under_review") make it visually
 * distinct from the body content and the save-error alert.
 */
function RecoveryNotice({ hasSubmittedAttempt, onDismiss }: RecoveryNoticeProps) {
  return (
    <section
      className="case-desk__recovery"
      aria-label="Case updated"
      role="status"
    >
      <div className="case-desk__recovery-heading">
        <StatusChip status="under_review" />
        <h2 className="case-desk__recovery-title">This case was updated since your last visit</h2>
      </div>
      <p className="case-desk__recovery-detail">
        Your in-progress draft was reset to the current case material —
        re-investigate to continue.
        {hasSubmittedAttempt &&
          " Your submitted attempt is preserved."}
      </p>
      <Button variant="secondary" onClick={onDismiss}>
        Got it
      </Button>
    </section>
  );
}

// ─── Investigate phase (the heart of Task 4) ────────────────────────────────

interface InvestigatePhaseProps {
  definition: CaseDefinition;
  session: CaseSession;
  enrichment?: CaseEnrichment;
  pendingRequestedIds: string[];
  phaseKey: string;
  phaseHeadingRef: RefObject<HTMLHeadingElement | null>;
  // Focus target for the invalidation announcement (DESIGN spec §invalidation).
  shortlistHeadingRef: RefObject<HTMLHeadingElement | null>;
  onRequestedFactChange: (ids: string[]) => void;
  onRequestFacts: (ids: string[]) => void;
  onDraftPatch: (patch: Partial<CaseSession["draft"]>) => void;
  // T4: blur flush for the reasoning free-text fields. Fired by each reasoning
  // input's onBlur so a pending debounced persist writes to localStorage at
  // once when the learner leaves the field.
  onDraftFieldBlur: () => void;
  onOpenReference: (factId: string, opener?: HTMLButtonElement | null) => void;
  onCloseReference: () => void;
  referenceFact: CaseFact | null;
  referenceOpenerRef: RefObject<HTMLButtonElement | null>;
  explanationText: string;
  onExplanationChange: (text: string) => void;
  onExplanationBlur: () => void;
  onRestart: () => void;
  onSendRecommendation: () => void;
  isSending: boolean;
  /** Validation error-summary (spec L213). Null when no validation failure. */
  validationErrors: { message: string; controlId: string }[] | null;
  validationSummaryRef: RefObject<HTMLDivElement | null>;
  /** Baseline rail + confidence capture (spec L171). */
  onSetBaseline: (railId: string | null, confidence: "low" | "medium" | "high" | null) => void;
}

// The customerExplanation 1,000-char ceiling. Enforced by maxLength on the
// textarea AND clamped in the change handler so a paste can't sneak past the
// native cap. Exported for tests/consistency.
export const CUSTOMER_EXPLANATION_MAX = 1000;

function InvestigatePhase(props: InvestigatePhaseProps) {
  const {
    definition,
    session,
    enrichment,
    pendingRequestedIds,
    phaseKey,
    phaseHeadingRef,
    shortlistHeadingRef,
    onRequestedFactChange,
    onRequestFacts,
    onDraftPatch,
    onDraftFieldBlur,
    onOpenReference,
    onCloseReference,
    referenceFact,
    referenceOpenerRef,
    explanationText,
    onExplanationChange,
    onExplanationBlur,
    onRestart,
    onSendRecommendation,
    isSending,
    validationErrors,
    validationSummaryRef,
    onSetBaseline,
  } = props;

  const enrichmentAsyncStatus = enrichment ? enrichmentStatus(enrichment.state) : undefined;
  const isRecommendPhase = phaseKey === "recommend";
  // Pre-commit review renders whenever the learner has NOT yet submitted a
  // first attempt — in either the investigate OR recommend phase. The reducer
  // has no investigate→recommend transition on a first pass (the recommend
  // phase is only entered via begin-revision after a first submit), so the
  // Send button MUST be reachable from investigate. The reducer's
  // send-recommendation action explicitly accepts phase "investigate".
  const isPreCommitReview = session.firstAttempt === null;

  // Remaining characters for the customerExplanation. Clamped at 0 (never
  // negative) so the counter doesn't read "-3 characters left".
  const remaining = Math.max(0, CUSTOMER_EXPLANATION_MAX - explanationText.length);
  const isCounterLow = remaining === 0;

  return (
    <section className="case-desk__investigate" aria-label="Investigate the case">
      <header className="case-desk__phase-header">
        <p className="case-desk__eyebrow">Customer case desk — investigation</p>
        <h2 ref={phaseHeadingRef} className="case-desk__phase-title">
          Gather evidence and weigh the rails
        </h2>
      </header>

      {/* Baseline + confidence capture (design spec L171, Investigate step 2).
          Shown ONLY in the investigate phase before any facts are requested —
          this is the learner's ungraded starting view. Once they request their
          first fact, the baseline is frozen (the reducer rejects set-baseline
          after that point) and this panel disappears. Explicitly labelled
          "not scored" so the learner gives an honest first instinct. */}
      {phaseKey === "investigate" && session.requestedFactIds.length === 0 && (
        <section className="case-desk__baseline" aria-label="Baseline starting view">
          <h3 className="case-desk__section-title">Your starting view</h3>
          <p className="case-desk__baseline-note">
            Before you investigate: which rail would you lean toward, and how confident are you?
            This captures your starting view; it is <strong>not scored</strong>.
          </p>
          <div className="case-desk__baseline-controls">
            <fieldset className="case-desk__baseline-rails">
              <legend className="case-desk__baseline-legend">If you had to pick now</legend>
              {definition.rails.map((rail) => (
                <label key={rail.id} className="case-desk__baseline-rail">
                  <input
                    type="radio"
                    name="baseline-rail"
                    value={rail.id}
                    checked={session.baselineRailId === rail.id}
                    onChange={() => onSetBaseline(rail.id, session.baselineConfidence)}
                  />
                  <span className="case-desk__baseline-rail-name">{rail.name}</span>
                </label>
              ))}
              <label className="case-desk__baseline-rail">
                <input
                  type="radio"
                  name="baseline-rail"
                  value=""
                  checked={session.baselineRailId === null}
                  onChange={() => onSetBaseline(null, session.baselineConfidence)}
                />
                <span className="case-desk__baseline-rail-name">Not sure yet</span>
              </label>
            </fieldset>
            <fieldset className="case-desk__baseline-confidence">
              <legend className="case-desk__baseline-legend">Confidence</legend>
              {(["low", "medium", "high"] as const).map((level) => (
                <label key={level} className="case-desk__baseline-confidence-option">
                  <input
                    type="radio"
                    name="baseline-confidence"
                    value={level}
                    checked={session.baselineConfidence === level}
                    onChange={() => onSetBaseline(session.baselineRailId, level)}
                  />
                  <span className="case-desk__baseline-confidence-label">
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        </section>
      )}

      <div className="case-desk__split">
        {/* The task column: fact request + rail shortlist. On wide screens this
            sits beside the evidence rail; on narrow screens the evidence sheet
            stacks below (labelled so AT can navigate it). */}
        <div className="case-desk__task">
          {/* Validation error-summary (design spec L213): on Send with an
              incomplete recommendation, a concise summary renders at the start
              of the primary task. role="alert" so AT announces it; tabIndex=-1
              so the focus effect can land on it. Each message is a fragment
              anchor linking to the control the learner must fix (spec L213:
              "link each message to its control"). */}
          {validationErrors && validationErrors.length > 0 && (
            <div
              ref={validationSummaryRef}
              className="case-desk__validation-summary"
              role="alert"
              tabIndex={-1}
              aria-label="Fix these issues before sending"
            >
              <h3 className="case-desk__validation-title">
                Fix these issues before sending
              </h3>
              <ul className="case-desk__validation-list">
                {validationErrors.map((entry, i) => (
                  <li key={i} className="case-desk__validation-item">
                    <a
                      className="case-desk__validation-link"
                      href={`#${entry.controlId}`}
                      // A bare fragment anchor only scrolls in many browsers;
                      // programmatic focus reliably lands the learner on the
                      // target control (spec L213: "move focus to ... its
                      // control"). preventDefault keeps the browser from
                      // fighting the focus move with its own scroll handling.
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(entry.controlId)?.focus();
                      }}
                    >
                      {entry.message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <FactRequest
            definition={definition}
            requestedFactIds={pendingRequestedIds}
            onChange={onRequestedFactChange}
            onRequest={onRequestFacts}
          />
          <RailShortlist
            definition={definition}
            draft={session.draft}
            onChange={onDraftPatch}
            headingRef={shortlistHeadingRef}
          />
          {/* Light recommend-phase scaffolding: the draft fields the evaluator
              needs are usable here so the learner can compose a reasoning
              draft. Task 5 adds the recommendation summary + outcome + debrief
              flow on top of these controls. */}
          <section className="case-desk__reasoning" aria-labelledby="case-desk-reasoning-title">
            <h2 id="case-desk-reasoning-title" className="case-desk__section-title">
              Reasoning
            </h2>
            <label className="case-desk__field">
              <span className="case-desk__field-label">Primary reason</span>
              <input
                type="text"
                className="case-desk__input"
                // `reasons` is an array; the UI surfaces a single primary reason
                // (Phase 1 scope). The evaluator requires at least one non-empty
                // reason to reach `defensible` or `preferred`, so this input is
                // the learner's path to those tiers.
                value={session.draft.reasons[0] ?? ""}
                onChange={(e) => onDraftPatch({ reasons: [e.target.value] })}
                // T4: blur flushes the debounced reasoning-field persist.
                onBlur={onDraftFieldBlur}
              />
            </label>
            <label className="case-desk__field">
              <span className="case-desk__field-label">Conditions / risks</span>
              <input
                type="text"
                className="case-desk__input"
                value={session.draft.conditions[0] ?? ""}
                onChange={(e) => onDraftPatch({ conditions: e.target.value ? [e.target.value] : [] })}
                onBlur={onDraftFieldBlur}
              />
            </label>
            <label className="case-desk__field">
              <span className="case-desk__field-label">Price expectation</span>
              <input
                type="text"
                className="case-desk__input"
                value={session.draft.priceExpectation}
                onChange={(e) => onDraftPatch({ priceExpectation: e.target.value })}
                onBlur={onDraftFieldBlur}
              />
            </label>
            <label className="case-desk__field">
              <span className="case-desk__field-label">Arrival expectation</span>
              <input
                type="text"
                className="case-desk__input"
                value={session.draft.arrivalExpectation}
                onChange={(e) => onDraftPatch({ arrivalExpectation: e.target.value })}
                onBlur={onDraftFieldBlur}
              />
            </label>
            <label className="case-desk__field">
              <span className="case-desk__field-label">Tracking expectation</span>
              <input
                type="text"
                className="case-desk__input"
                value={session.draft.trackingExpectation}
                onChange={(e) => onDraftPatch({ trackingExpectation: e.target.value })}
                onBlur={onDraftFieldBlur}
              />
            </label>
            <label className="case-desk__field">
              <span className="case-desk__field-label">Explanation for the customer</span>
              <textarea
                className="case-desk__textarea"
                rows={4}
                maxLength={CUSTOMER_EXPLANATION_MAX}
                value={explanationText}
                onChange={(e) => {
                  // Defensive clamp: maxLength is enforced by the browser, but a
                  // programmatic value or an autofill could exceed it. Clamp so
                  // the persisted draft can NEVER exceed the 1,000-char ceiling.
                  const clamped = e.target.value.slice(0, CUSTOMER_EXPLANATION_MAX);
                  onExplanationChange(clamped);
                }}
                onBlur={onExplanationBlur}
              />
              <span className="case-desk__field-meta">
                <span className="case-desk__field-helper">
                  Use synthetic details only — no real customer or account data.
                </span>
                <span
                  className={[
                    "case-desk__field-counter",
                    isCounterLow ? "case-desk__field-counter--low" : "",
                  ].filter(Boolean).join(" ")}
                  aria-live="polite"
                >
                  {remaining} characters left
                </span>
              </span>
            </label>
            {isRecommendPhase && !isPreCommitReview && (
              /* During a revision (firstAttempt set + recommend phase), the
                 learner re-reviews their working draft before re-sending. The
                 outcome is still HIDDEN — the revised commit produces the
                 revised outcome. The label differs so the learner knows this
                 Send produces the revised attempt, not the first. */
              <p className="case-desk__phase-note">
                You’re revising your recommendation. Your first attempt is preserved.
              </p>
            )}
          </section>

          {/* The pre-commit review + Send (first attempt). Renders ONLY in the
              recommend phase BEFORE the first attempt — the outcome is HIDDEN
              until Send. */}
          {isPreCommitReview && (
            <RecommendationSummary
              definition={definition}
              draft={session.draft}
              onSend={onSendRecommendation}
              isSending={isSending}
            />
          )}

          {/* The revision review + re-Send. Renders when the learner has begun
              a revision (firstAttempt set + recommend phase + no revised
              attempt yet). Reuses RecommendationSummary with the revised label
              so the learner commits the revised draft knowingly. */}
          {isRecommendPhase &&
            session.firstAttempt !== null &&
            session.revisedAttempt === null && (
              <RecommendationSummary
                definition={definition}
                draft={session.draft}
                onSend={onSendRecommendation}
                isSending={isSending}
                sendLabel="Send revised recommendation"
                eyebrowLabel="Customer case desk — revision"
              />
            )}
        </div>

        {/* The evidence column. */}
        <div className="case-desk__evidence">
          <EvidenceRail
            definition={definition}
            requestedFactIds={session.requestedFactIds}
            onOpenReference={(factId, opener) => {
              // Capture the opener button so focus is restored to it on close.
              onOpenReference(factId, opener);
            }}
          />

          {/* Enrichment region — rendered through AsyncRegion. Authored facts
              sit ABOVE this region and remain usable in every state. */}
          {enrichment && enrichmentAsyncStatus && (
            <section className="case-desk__enrichment" aria-label="Live enrichment">
              <h3 className="case-desk__section-title">Live enrichment</h3>
              <AsyncRegion
                status={enrichmentAsyncStatus}
                loadingLabel="Loading live enrichment"
                onRetry={enrichment.retry}
                error={
                  enrichment.state === "error"
                    ? {
                        status: 0,
                        title: "Live enrichment is unavailable",
                        detail: enrichment.message ?? "We couldn't load the live enrichment data.",
                        fieldErrors: {},
                        retryable: Boolean(enrichment.retry),
                      }
                    : null
                }
              >
                {enrichment.state === "success" && enrichment.facts.length > 0 && (
                  <ul className="case-desk__enrichment-facts">
                    {enrichment.facts.map((fact) => (
                      <li key={fact.id} className="case-desk__enrichment-fact">
                        <span className="case-desk__enrichment-label">{fact.label}</span>
                        <span className="case-desk__enrichment-value">{fact.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {enrichment.state === "success" && enrichment.facts.length === 0 && (
                  <p className="case-desk__enrichment-empty">No additional live data available.</p>
                )}
              </AsyncRegion>
            </section>
          )}
        </div>
      </div>

      <div className="case-desk__nav">
        <button
          ref={referenceOpenerRef}
          type="button"
          className="relay-btn relay-btn--secondary"
          // Hidden helper that exists only to give the reference-opener ref a
          // stable home when no fact-specific button has been clicked. The
          // actual opener (the EvidenceRail's "Open reference" button) is
          // captured on click via captureOpener below. This fallback keeps the
          // ref non-null for the ReferenceSheet contract.
          aria-hidden="true"
          tabIndex={-1}
          style={{ position: "absolute", left: "-9999px" }}
        >
          {/* no label — purely a focus-restore fallback */}
        </button>
        <Button variant="secondary" onClick={onRestart}>Start again</Button>
        <Link to="/learn" className="relay-btn relay-btn--secondary">Exit case</Link>
      </div>

      {referenceFact && (
        <ReferenceSheet
          fact={referenceFact}
          open={true}
          onClose={onCloseReference}
          returnFocusRef={referenceOpenerRef}
        />
      )}
    </section>
  );
}
