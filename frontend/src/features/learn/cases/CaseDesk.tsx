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
import { EvidenceRail } from "./EvidenceRail";
import { FactRequest } from "./FactRequest";
import { RailShortlist } from "./RailShortlist";
import { ReferenceSheet } from "./ReferenceSheet";
import { AsyncRegion } from "../../../design-system/AsyncRegion";
import { Button } from "../../../design-system/Button";
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
  // available"). Updated when the requested-fact set grows.
  const [evidenceAnnouncement, setEvidenceAnnouncement] = useState("");
  const prevRequestedCountRef = useRef(session.requestedFactIds.length);

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
  useEffect(() => {
    return () => {
      if (explanationTimerRef.current !== null) {
        clearTimeout(explanationTimerRef.current);
        explanationTimerRef.current = null;
        flushExplanation(pendingExplanationRef.current);
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
  function persist(next: CaseSession) {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    const result = saveCaseSession(stamped);
    if (!result.ok) {
      setSaveError(
        result.reason === "quota"
          ? "We couldn't save your progress — this browser's storage is full. Your work in this tab is kept, but won't persist if you leave."
          : "We couldn't save your progress — this browser may be blocking storage. Your work in this tab is kept, but won't persist if you leave.",
      );
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

  // ── Evidence live region ──────────────────────────────────────────────────
  // Announce when the requested-fact set grows (facts became available).
  useEffect(() => {
    const prev = prevRequestedCountRef.current;
    const curr = session.requestedFactIds.length;
    if (curr > prev) {
      const delta = curr - prev;
      setEvidenceAnnouncement(
        delta === 1
          ? "1 new fact available in your evidence."
          : `${delta} new facts available in your evidence.`,
      );
    } else if (curr < prev) {
      setEvidenceAnnouncement("");
    }
    prevRequestedCountRef.current = curr;
  }, [session.requestedFactIds.length]);

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
    const next = caseReducer(session, { type: "restart" });
    if (next !== session) {
      dispatch({ type: "restart" });
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
    }
  }

  function handleDraftPatch(patch: Partial<CaseSession["draft"]>) {
    const next = caseReducer(session, { type: "edit-draft", patch });
    if (next !== session) {
      dispatch({ type: "edit-draft", patch });
      persist(next);
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
          onRequestedFactChange={handleRequestedFactChange}
          onRequestFacts={handleRequestFacts}
          onDraftPatch={handleDraftPatch}
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
        />
      )}

      {(session.phase === "resolve" || session.phase === "debrief") && (
        // Task-5 scaffolding: the full recommendation summary, outcome, and
        // debrief live in Task 5. Here we render an honest placeholder so the
        // phase resolves to SOMETHING usable; the rail selection the learner
        // made is preserved in the session and will be picked up by Task 5.
        <ResolvePhase
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

// ─── Investigate phase (the heart of Task 4) ────────────────────────────────

interface InvestigatePhaseProps {
  definition: CaseDefinition;
  session: CaseSession;
  enrichment?: CaseEnrichment;
  pendingRequestedIds: string[];
  phaseKey: string;
  phaseHeadingRef: RefObject<HTMLHeadingElement | null>;
  onRequestedFactChange: (ids: string[]) => void;
  onRequestFacts: (ids: string[]) => void;
  onDraftPatch: (patch: Partial<CaseSession["draft"]>) => void;
  onOpenReference: (factId: string, opener?: HTMLButtonElement | null) => void;
  onCloseReference: () => void;
  referenceFact: CaseFact | null;
  referenceOpenerRef: RefObject<HTMLButtonElement | null>;
  explanationText: string;
  onExplanationChange: (text: string) => void;
  onExplanationBlur: () => void;
  onRestart: () => void;
}

function InvestigatePhase(props: InvestigatePhaseProps) {
  const {
    definition,
    session,
    enrichment,
    pendingRequestedIds,
    phaseKey,
    phaseHeadingRef,
    onRequestedFactChange,
    onRequestFacts,
    onDraftPatch,
    onOpenReference,
    onCloseReference,
    referenceFact,
    referenceOpenerRef,
    explanationText,
    onExplanationChange,
    onExplanationBlur,
    onRestart,
  } = props;

  const enrichmentAsyncStatus = enrichment ? enrichmentStatus(enrichment.state) : undefined;
  const isRecommendPhase = phaseKey === "recommend";

  return (
    <section className="case-desk__investigate" aria-label="Investigate the case">
      <header className="case-desk__phase-header">
        <p className="case-desk__eyebrow">Customer case desk — investigation</p>
        <h2 ref={phaseHeadingRef} className="case-desk__phase-title">
          Gather evidence and weigh the rails
        </h2>
      </header>

      <div className="case-desk__split">
        {/* The task column: fact request + rail shortlist. On wide screens this
            sits beside the evidence rail; on narrow screens the evidence sheet
            stacks below (labelled so AT can navigate it). */}
        <div className="case-desk__task">
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
              <span className="case-desk__field-label">Price expectation</span>
              <input
                type="text"
                className="case-desk__input"
                value={session.draft.priceExpectation}
                onChange={(e) => onDraftPatch({ priceExpectation: e.target.value })}
              />
            </label>
            <label className="case-desk__field">
              <span className="case-desk__field-label">Arrival expectation</span>
              <input
                type="text"
                className="case-desk__input"
                value={session.draft.arrivalExpectation}
                onChange={(e) => onDraftPatch({ arrivalExpectation: e.target.value })}
              />
            </label>
            <label className="case-desk__field">
              <span className="case-desk__field-label">Tracking expectation</span>
              <input
                type="text"
                className="case-desk__input"
                value={session.draft.trackingExpectation}
                onChange={(e) => onDraftPatch({ trackingExpectation: e.target.value })}
              />
            </label>
            <label className="case-desk__field">
              <span className="case-desk__field-label">Explanation for the customer</span>
              <textarea
                className="case-desk__textarea"
                rows={4}
                value={explanationText}
                onChange={(e) => onExplanationChange(e.target.value)}
                onBlur={onExplanationBlur}
              />
            </label>
            {isRecommendPhase && (
              <p className="case-desk__phase-note">
                The recommendation summary and outcome are part of the next step.
              </p>
            )}
          </section>
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
          ref={referenceOpenerRef as never}
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

// ─── Resolve/debrief (Task-5 scaffolding) ───────────────────────────────────

interface ResolvePhaseProps {
  definition: CaseDefinition;
  session: CaseSession;
  phaseHeadingRef: RefObject<HTMLHeadingElement | null>;
  onRestart: () => void;
}

function ResolvePhase({ definition, session, phaseHeadingRef, onRestart }: ResolvePhaseProps) {
  const railName =
    session.draft.selectedRail &&
    definition.rails.find((r) => r.id === session.draft.selectedRail)?.name;

  return (
    <section className="case-desk__resolve" aria-label="Case outcome">
      <header className="case-desk__phase-header">
        <p className="case-desk__eyebrow">Customer case desk — outcome</p>
        <h2 ref={phaseHeadingRef} className="case-desk__phase-title">
          {session.phase === "debrief" ? "Case complete" : "Recommendation submitted"}
        </h2>
      </header>
      {railName && (
        <p className="case-desk__resolve-summary">
          You recommended <strong>{railName}</strong>.
        </p>
      )}
      <p className="case-desk__phase-note">
        The recommendation summary, consequence, and debrief are part of the
        next step in this experience.
      </p>
      <div className="case-desk__nav">
        <Button variant="secondary" onClick={onRestart}>Start again</Button>
        <Link to="/learn" className="relay-btn relay-btn--secondary">Back to Learn</Link>
      </div>
    </section>
  );
}
