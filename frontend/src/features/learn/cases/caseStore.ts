/**
 * Customer Case Desk — versioned session persistence + pure reducer (Task 2).
 *
 * This module is the state-machine contract for the Case Desk. It is split
 * into two deliberately separate concerns:
 *
 *   1. `caseReducer` — a PURE transition function. Same (session, action) in
 *      always yields the same session out. No localStorage, no clock, no
 *      randomness, no side effects. The Case Desk UI (Task 4) owns the
 *      reducer and dispatches actions.
 *
 *   2. `loadCaseSession` / `saveCaseSession` — the I/O boundary. These wrap
 *      localStorage via the shared versioned primitives in
 *      `lib/persistence/storage`. They are the ONLY place case state touches
 *      storage.
 *
 * Design invariants (verified by caseStore.test.ts):
 *   - The first attempt is IMMUTABLE: once `send-recommendation` snapshots it,
 *     no later action (edit-draft, begin-revision, restart) can mutate it.
 *   - Illegal actions are TRUE no-ops: they return the SAME session object
 *     reference (not a copy) so React/equality checks can cheaply detect that
 *     nothing changed.
 *   - A stale draft never silently resumes: if a stored session's
 *     `caseRevision` does not match the current catalog revision, the draft is
 *     discarded on load while the first attempt is preserved.
 *   - Only MATERIAL decision state is persisted. Transient UI (loading flags,
 *     open sheets, toasts, focus) never reaches this module.
 *
 * Debounce note: the 300ms debounce on `customerExplanation` writes, and the
 * flush-on-blur/exit/restart behaviour described in the plan, live in the
 * Case Desk UI (Task 4). caseStore stays synchronous: `saveCaseSession` is a
 * full-session write and `edit-draft` is a pure reducer action. The UI keeps
 * the in-memory draft authoritative while a debounced write is pending.
 */

import type {
  CaseId,
  CaseOutcome,
  CasePhase,
  RecommendationDraft,
} from "./caseTypes";
import { CASE_REVISION } from "./caseCatalog";
import {
  saveVersioned,
  type SaveResult,
} from "../../../lib/persistence/storage";

// ─── Types (verbatim from the plan) ─────────────────────────────────────────

export interface CaseSession {
  schemaVersion: 1;
  caseId: CaseId;
  caseRevision: string;
  status: "not_started" | "in_progress" | "completed" | "under_review";
  phase: CasePhase;
  requestedFactIds: string[];
  draft: RecommendationDraft;
  // An attempt snapshot is an IMMUTABLE point-in-time record of one
  // recommendation. It intentionally excludes `requestedFactIds`: the outcome
  // is computed at send-time (by the caller, via evaluateRecommendation) from
  // the session-level requestedFactIds, then frozen here. Re-requesting facts
  // during a later revision therefore cannot retroactively mutate a stored
  // attempt — see T10 (caseStore.test.ts).
  firstAttempt: {
    draft: RecommendationDraft;
    outcome: CaseOutcome;
    submittedAt: string;
  } | null;
  revisedAttempt: {
    draft: RecommendationDraft;
    outcome: CaseOutcome;
    submittedAt: string;
  } | null;
  openedReferenceIds: string[];
  // Piece 5c: the outcome the learner produced on the transfer variant. Set by
  // `complete-transfer` so the debrief can render the independent-transfer
  // section alongside the main-case performance. Additive — sessions persisted
  // by Piece 5b lack this field entirely; `loadCaseSession` normalizes a
  // missing value back to null so consumers can branch on `=== null` instead
  // of guarding both null and undefined.
  transferOutcome: CaseOutcome | null;
  // Advanced by the Task 4 UI on material writes (e.g. on saveCaseSession).
  // The reducer itself does not advance this; it preserves whatever value is
  // present. Keeping timestamps out of the reducer preserves purity (no clock
  // calls) — the UI owns the wall-clock and stamps `updatedAt` when it
  // persists. Until then the field is "" (set by createInitialCaseSession /
  // restart) and stays "" through reducer transitions.
  // The learner's reflection on the resolve-phase outcome (design spec L189,
  // Resolve step 4: "diagnose any failure or mismatch"). Captured AFTER the
  // consequence is shown and BEFORE revision. Unscored — it's a reflection
  // step, surfaced in the debrief. Empty string until the learner writes one.
  // Persisted so it survives refresh; normalized to "" by loadCaseSession for
  // older sessions that lack the field.
  diagnosis: string;
  updatedAt: string;
}

export type CaseAction =
  | { type: "start" }
  | { type: "request-facts"; ids: string[] }
  | { type: "edit-draft"; patch: Partial<RecommendationDraft> }
  | { type: "send-recommendation"; outcome: CaseOutcome; submittedAt: string }
  | { type: "begin-revision" }
  | { type: "complete-transfer"; outcome: CaseOutcome }
  | { type: "restart" }
  | { type: "open-reference"; referenceId: string }
  | { type: "set-diagnosis"; diagnosis: string };

// ─── Storage key ────────────────────────────────────────────────────────────

function sessionKey(caseId: CaseId): string {
  return `relay:case-session:${caseId}`;
}

// ─── Empty / initial shells ─────────────────────────────────────────────────

/**
 * The canonical empty recommendation draft. Exported so tests (and the UI)
 * can compare against a single source of truth for "no material input yet".
 */
export const EMPTY_DRAFT: RecommendationDraft = {
  shortlist: [],
  selectedRail: null,
  reasons: [],
  conditions: [],
  priceExpectation: "",
  arrivalExpectation: "",
  trackingExpectation: "",
  customerExplanation: "",
};

/**
 * The very first session state for a case, before the learner has started.
 * `status: not_started`, `phase: brief`. Persisted only after the first
 * material action so we never store a shell with no decisions.
 */
export function createInitialCaseSession(caseId: CaseId): CaseSession {
  return {
    schemaVersion: 1,
    caseId,
    caseRevision: CASE_REVISION,
    status: "not_started",
    phase: "brief",
    requestedFactIds: [],
    draft: { ...EMPTY_DRAFT, shortlist: [], reasons: [], conditions: [] },
    firstAttempt: null,
    revisedAttempt: null,
    openedReferenceIds: [],
    transferOutcome: null,
    diagnosis: "",
    updatedAt: "",
  };
}

// ─── Purity helpers ─────────────────────────────────────────────────────────

/**
 * Deep-clone a session. Exported so the deep-copy contract is directly
 * testable (T14 — the structuredClone fallback path).
 *
 * Used so that snapshot fields (firstAttempt/revisedAttempt) are fully
 * decoupled from the mutable working draft — a later `edit-draft` cannot
 * mutate a snapshot even by accident.
 */
export function cloneSession(session: CaseSession): CaseSession {
  // structuredClone is available in all evergreen browsers (iOS Safari 15.4+,
  // March 2022). Fall back to a JSON round-trip for older WebViews (Safari
  // <15.4 / iOS 15.3 and earlier, and many in-app WebViews) where it is
  // undefined — without the guard, every dispatch would throw a
  // ReferenceError and crash the desk synchronously.
  //
  // The session is plain JSON-serializable data — no Dates, Maps, or
  // `undefined` fields that JSON.stringify would mangle in a way that matters
  // here; the reducer already normalizes `transferOutcome` to null (never
  // undefined), every other field is a string, string[], or a plain object of
  // the same shape. So JSON.parse(JSON.stringify(...)) yields a faithful,
  // fully decoupled copy.
  if (typeof structuredClone === "function") return structuredClone(session);
  return JSON.parse(JSON.stringify(session));
}

/** Merge a draft patch by replacement of each top-level field (no magic). */
function patchDraft(
  draft: RecommendationDraft,
  patch: Partial<RecommendationDraft>,
): RecommendationDraft {
  return { ...draft, ...patch };
}

// ─── The reducer (PURE) ─────────────────────────────────────────────────────

/**
 * Pure state-machine transition for a Case Desk session.
 *
 * Phase model (the only sensible reading of the plan's
 * brief|investigate|recommend|resolve|debrief phases):
 *
 *   brief         — the learner has not started; nothing is legal except
 *                   `start`.
 *   investigate  — gathering facts (request-facts) and forming a draft
 *                   (edit-draft). The learner can also send straight from
 *                   here. Also the terminal re-investigation phase entered
 *                   via `restart` once a revisedAttempt already exists (the
 *                   T2 "review-only" path: request-facts + edit-draft are
 *                   legal; no further send is possible because the case's
 *                   one revision has been used; complete-transfer is the
 *                   forward path).
 *   recommend     — the working recommendation phase. edit-draft and
 *                   send-recommendation are legal; begin-revision returns
 *                   here after a first attempt to revise from the original.
 *                   `restart` with firstAttempt set and revisedAttempt null
 *                   also lands here (T2: route the learner into the revision
 *                   path so they can re-send; the next send creates
 *                   revisedAttempt via the existing revision branch).
 *   resolve       — a recommendation has been submitted; the learner reviews
 *                   the outcome. begin-revision or complete-transfer are the
 *                   forward paths.
 *   debrief       — the case is complete (transfer done).
 *
 * Legality summary (illegal ⇒ return SAME reference, no partial mutation):
 *   start               — legal only in `brief`; idempotent otherwise.
 *   request-facts       — legal in investigate/recommend, INCLUDING during a
 *                         revision (T10). Each attempt's outcome is an
 *                         immutable snapshot frozen at send-time, so re-
 *                         requesting facts during a revision changes only the
 *                         next send's evaluation; it cannot retroactively
 *                         mutate firstAttempt's stored outcome. no-op in
 *                         brief/resolve/debrief.
 *   edit-draft          — legal in investigate/recommend. After a first
 *                         attempt, the working draft is frozen ONLY in the
 *                         resolve/debrief review flow; it becomes editable
 *                         again in recommend (via begin-revision OR via
 *                         restart-with-firstAttempt-set) and in investigate
 *                         (the terminal re-investigation entered via restart-
 *                         with-revisedAttempt-set, T2). no-op in brief and in
 *                         resolve/debrief.
 *   send-recommendation — sets firstAttempt (or revisedAttempt during a
 *                         revision); double-submit is a no-op; no-op in brief.
 *   begin-revision      — legal only when a first attempt exists AND no
 *                         revised attempt has been submitted (one revision
 *                         per case — the Phase-1 contract); idempotent if
 *                         already in the recommend (revising) phase; no-op
 *                         once revisedAttempt is set.
 *   complete-transfer   — legal once a first attempt exists (any phase except
 *                         brief); the forward path out of the T2 terminal
 *                         re-investigation. no-op in brief / before any
 *                         submission.
 *   restart             — always legal; clears the working draft and facts,
 *                         preserves attempt history. T2 two-branch routing:
 *                         firstAttempt set + revisedAttempt null → phase
 *                         "recommend" (revision path); firstAttempt set +
 *                         revisedAttempt set → phase "investigate" (terminal
 *                         re-investigation); otherwise phase "investigate".
 *                         T11: always sets status "in_progress" — clicking
 *                         "Start again" acknowledges any under_review
 *                         recovery and moves the learner past the stale-draft
 *                         state.
 *   open-reference      — legal in investigate/recommend (including the
 *                         recommend phase entered via begin-revision or
 *                         restart); appends the reference id to
 *                         openedReferenceIds, deduped; no-op (same reference)
 *                         if the id is already present, and no-op outside the
 *                         legal phases.
 */
export function caseReducer(session: CaseSession, action: CaseAction): CaseSession {
  switch (action.type) {
    case "start": {
      // Only meaningful from the pre-start state. Once started, this is a
      // no-op (return the SAME reference so callers can detect "nothing
      // changed" cheaply).
      if (session.status !== "not_started" || session.phase !== "brief") {
        return session;
      }
      return {
        ...cloneSession(session),
        status: "in_progress",
        phase: "investigate",
      };
    }

    case "request-facts": {
      // Legal while gathering (investigate) or recommending. T10: request-
      // facts is ALSO legal during a revision (begin-revision re-enters
      // recommend). This is intentional post Group A: each attempt's outcome
      // is an IMMUTABLE snapshot frozen at send-time, so re-requesting facts
      // during a revision changes only the working session's requestedFactIds
      // (which feeds the next send's evaluation) — it cannot retroactively
      // mutate firstAttempt's stored outcome. A revision is a fresh
      // recommendation that may legitimately reconsider the evidence.
      if (session.phase !== "investigate" && session.phase !== "recommend") {
        return session;
      }
      // No-op if the set is unchanged (keeps updatedAt stable on idempotent
      // re-dispatch).
      if (arrayEqual(session.requestedFactIds, action.ids)) {
        return session;
      }
      // Invalidation contract (DESIGN spec §invalidation, lines 204 + 212):
      // editing an upstream/requested fact during the RECOMMEND phase
      // invalidates every dependent shortlist, recommendation, and outcome.
      // We clear the mutable working draft (shortlist, selected rail,
      // reasons, conditions, expectations, explanation) so the learner
      // rebuilds the recommendation against the new evidence. The frozen
      // firstAttempt/revisedAttempt snapshots are untouched (we never read
      // or write them here). During INVESTIGATE the draft is exploratory
      // and not yet tied to a committed recommendation, so it survives —
      // invalidating would destroy in-progress reasoning for no benefit.
      // The live-region announcement + focus restoration live in the Case
      // Desk component (the reducer is pure; it cannot dispatch side
      // effects). The Desk detects invalidation by diffing draft identity.
      const invalidateDraft = session.phase === "recommend";
      return {
        ...cloneSession(session),
        requestedFactIds: [...action.ids],
        ...(invalidateDraft ? { draft: { ...EMPTY_DRAFT } } : {}),
      };
    }

    case "edit-draft": {
      // Legal in the gathering/recommending phases. The blocked cases are
      // brief (case not started), and the post-submit review flow (resolve/
      // debrief — the learner is reviewing an outcome, not editing). The
      // draft is editable in:
      //   - `investigate` (the fresh investigation phase — also the terminal
      //     re-investigation phase entered via restart-when-revisedAttempt-
      //     already-set, T2; the learner can re-request facts and edit the
      //     draft for understanding even though no further send is possible),
      //   - `recommend` (the initial recommend phase OR a revision reached
      //     via begin-revision OR restart-with-firstAttempt-set — T2 routes
      //     the learner into the revision path so they can re-send).
      // The firstAttempt/revisedAttempt snapshots themselves are IMMUTABLE —
      // edit-draft mutates only the working draft; the snapshots are deep-
      // cloned at send-time and never aliased.
      if (session.phase !== "investigate" && session.phase !== "recommend") {
        return session;
      }
      const nextDraft = patchDraft(session.draft, action.patch);
      // No-op if the patch produced no change (referential equality on every
      // field via shallow spread).
      if (draftsEqual(session.draft, nextDraft)) {
        return session;
      }
      return {
        ...cloneSession(session),
        draft: nextDraft,
      };
    }

    case "send-recommendation": {
      // Never legal before start.
      if (session.phase === "brief") {
        return session;
      }

      // Revision path: a second send after begin-revision sets revisedAttempt.
      const isRevising =
        session.firstAttempt !== null && session.phase === "recommend";

      if (isRevising) {
        // Double-submit protection on the revised attempt.
        if (session.revisedAttempt !== null) {
          return session;
        }
        const snapshot = cloneSession(session).draft;
        return {
          ...cloneSession(session),
          revisedAttempt: {
            draft: snapshot,
            outcome: action.outcome,
            submittedAt: action.submittedAt,
          },
          // Stay in the post-submit phase. The learner reviews the revised
          // outcome and may complete the transfer.
          phase: "resolve",
        };
      }

      // First-submit path.
      // Double-submit protection on the first attempt.
      if (session.firstAttempt !== null) {
        return session;
      }
      // Must be in a gather/recommend phase to send the first time.
      if (session.phase !== "investigate" && session.phase !== "recommend") {
        return session;
      }
      const snapshot = cloneSession(session).draft;
      return {
        ...cloneSession(session),
        firstAttempt: {
          draft: snapshot,
          outcome: action.outcome,
          submittedAt: action.submittedAt,
        },
        // Advance to the resolve phase so the learner reviews the outcome.
        phase: "resolve",
      };
    }

    case "begin-revision": {
      // Legal only if a first attempt exists and we are not mid-revision
      // (revisedAttempt === null means no revision has been submitted yet).
      if (session.firstAttempt === null) {
        return session;
      }
      // One revision per case (the Phase-1 contract). Once a revised attempt
      // has been submitted, begin-revision must NOT re-open the recommend
      // phase: doing so would reset the working draft to the first attempt's
      // and strand the learner in `recommend` with a Send that no-ops (the
      // revised-submit branch guards on `revisedAttempt !== null`), producing
      // an unwinnable state. This guard sits ABOVE the idempotency guard
      // because revisedAttempt !== null is the more restrictive condition.
      if (session.revisedAttempt !== null) {
        return session;
      }
      // If already in the recommend (revising) phase, this is idempotent —
      // do NOT wipe in-progress revision edits.
      if (session.phase === "recommend" && session.firstAttempt !== null) {
        return session;
      }
      // Reset the working draft to the first attempt's draft so the learner
      // revises from their original recommendation. The firstAttempt itself
      // is untouched (deep-copied snapshot).
      return {
        ...cloneSession(session),
        draft: cloneSession(session).firstAttempt!.draft,
        phase: "recommend",
      };
    }

    case "complete-transfer": {
      // Never legal before start, and never before at least a first attempt.
      if (session.phase === "brief" || session.firstAttempt === null) {
        return session;
      }
      return {
        ...cloneSession(session),
        status: "completed",
        phase: "debrief",
        // Piece 5c CRITICAL FIX: persist the transfer outcome so the debrief
        // can render the independent-transfer section. Without this the
        // outcome was computed by the CaseOutcome UI, dispatched, and then
        // thrown away — the debrief had no way to recover it.
        transferOutcome: action.outcome,
      };
    }

    case "restart": {
      // Always legal. Clears the WORKING draft and transient investigation
      // state but PRESERVES the attempt history (firstAttempt/revisedAttempt)
      // so the learner's record is never erased by a restart. See the plan's
      // E2E coverage map: "restart confirmation preserves history".
      //
      // T2 — the unwinnable state. Before this fix, restart ALWAYS returned
      // phase: "investigate". But from investigate-with-firstAttempt-set,
      // edit-draft was blocked and send-recommendation was blocked. The
      // begin-revision ACTION is legal from investigate at the reducer level
      // (it falls through all guards), but the UI only surfaced it via
      // <CaseOutcome> in the resolve phase — so from investigate there was no
      // button to reach it. A learner who clicked "Start again" (or landed via
      // stale recovery with the same shape) was stuck with no forward path.
      //
      // The fix routes the learner into a winnable state with a two-branch
      // model:
      //   - firstAttempt set AND revisedAttempt null → phase: "recommend"
      //     (revising from scratch; empty working draft; the next send
      //     creates revisedAttempt via the existing send-recommendation
      //     revision branch). Reuses the begin-revision machinery without
      //     a new state. The learner re-investigates inside the recommend
      //     phase (request-facts + edit-draft are legal there).
      //   - firstAttempt set AND revisedAttempt already set → phase:
      //     "investigate" (terminal re-investigation; one-revision-per-case
      //     is enforced, so no further send is possible). The learner can
      //     re-request facts and edit the draft for understanding; the
      //     forward path is complete-transfer (legal in investigate once
      //     firstAttempt is set). They are never stuck.
      //   - firstAttempt null → phase: "investigate" (unchanged; a fresh
      //     restart before any submission).
      //
      // T11 — restart from under_review. recoverStaleSession sets status
      // "under_review" so CaseEntry can surface the stale-draft context.
      // When the learner clicks "Start again" they have acknowledged the
      // recovery and are actively re-engaging with the current case
      // content — status becomes "in_progress" (correct semantics). The
      // "loss" of the under_review signal is correct: the learner has
      // moved past the stale-draft state.
      const preserved = cloneSession(session);
      const hasFirst = preserved.firstAttempt !== null;
      const hasRevised = preserved.revisedAttempt !== null;
      const nextPhase: CasePhase = hasFirst && !hasRevised ? "recommend" : "investigate";
      return {
        schemaVersion: 1,
        caseId: session.caseId,
        caseRevision: CASE_REVISION,
        status: "in_progress",
        phase: nextPhase,
        requestedFactIds: [],
        draft: { ...EMPTY_DRAFT, shortlist: [], reasons: [], conditions: [] },
        firstAttempt: preserved.firstAttempt,
        revisedAttempt: preserved.revisedAttempt,
        openedReferenceIds: [],
        // The transfer outcome belongs to the prior completed run; a restart
        // begins a fresh run and must NOT carry a stale transfer outcome
        // into the new attempt history. (firstAttempt/revisedAttempt ARE
        // preserved because they are the learner's record; transferOutcome
        // is reset because it represents "this run's transfer".)
        transferOutcome: null,
        diagnosis: "",
        updatedAt: "",
      };
    }

    case "open-reference": {
      // The Task 4 ReferenceSheet UI dispatches this when the learner opens a
      // source/rule reference. Legal during the investigation/recommendation
      // phases — including the recommend phase entered via begin-revision
      // (revising a recommendation still benefits from consulting sources).
      // Illegal elsewhere (brief, resolve/debrief) returns the SAME reference.
      if (session.phase !== "investigate" && session.phase !== "recommend") {
        return session;
      }
      // Dedupe: opening the same reference twice is a TRUE no-op (same
      // reference back), so a rapid re-dispatch is cheap for the UI to ignore.
      if (session.openedReferenceIds.includes(action.referenceId)) {
        return session;
      }
      return {
        ...cloneSession(session),
        openedReferenceIds: [...session.openedReferenceIds, action.referenceId],
      };
    }

    case "set-diagnosis": {
      // The resolve-phase reflection step (design spec L189, Resolve step 4:
      // "diagnose any failure or mismatch"). Legal only in the resolve phase
      // (after the consequence is shown). No-op (same reference) when the text
      // is unchanged so debounced dispatches don't churn persistence.
      if (session.phase !== "resolve") {
        return session;
      }
      if (session.diagnosis === action.diagnosis) {
        return session;
      }
      return {
        ...cloneSession(session),
        diagnosis: action.diagnosis,
      };
    }

    default: {
      // Exhaustiveness: if a new CaseAction variant is added without a case
      // here, TypeScript will fail to compile (the `_action` binding becomes
      // non-`never`). At runtime, unknown actions are no-ops.
      const _action: never = action;
      void _action;
      return session;
    }
  }
}

// ─── I/O boundary ───────────────────────────────────────────────────────────

// ─── Runtime shape guard (T9) ────────────────────────────────────────────────
//
// `loadCaseSession` reads localStorage, the I/O boundary for case state. The
// stored payload is `unknown` until proven otherwise. The pre-fix code cast
// after a 2-field check (`schemaVersion === 1` && `caseId === caseId`), which
// let payloads that passed those two fields but were otherwise broken (missing
// `draft`, `requestedFactIds: null`, a half-formed `firstAttempt`) reach the
// consumer and crash at mount. The guard below validates the full nested
// shape that CaseDesk + its children actually READ at mount and during normal
// flow, so a payload that would crash render returns null instead (fresh
// start) rather than crashing.
//
// Defensiveness bar: validate the crash-class fields. We do NOT deep-validate
// every field of `CaseOutcome` (the outcome is opaque prose + arrays authored
// by the evaluator, and the consumer reads its fields defensively via optional
// chaining / guards in the UI). We DO validate:
//   - top-level scalars (`schemaVersion`, `caseId`, `caseRevision`, `status`,
//     `phase`, `updatedAt`) — these drive switch/derivation logic,
//   - top-level arrays (`requestedFactIds`, `openedReferenceIds`) — `.length`
//     is read on mount,
//   - the working `draft` and the attempt drafts (validated deeply because
//     CaseDesk reads `draft.customerExplanation`, `draft.shortlist`,
//     `draft.reasons`, `draft.selectedRail`, etc. at mount, and CaseOutcome
//     reads `firstAttempt.draft.selectedRail` in the resolve phase),
//   - the attempt shells (`outcome` must be a non-null object with `quality`;
//     `submittedAt` must be a string) — enough to prove "an attempt really
//     lives here" without trying to enforce the evaluator's outcome contract.
//
// What we intentionally leave to runtime reducer guards: a structurally-valid
// but semantically weird payload (e.g. `phase: "debrief"` with
// `firstAttempt: null`) is NOT rejected — it won't crash, it just yields an
// odd state the reducer no-ops on. Focus is the crash-class only.

const SESSION_STATUSES = new Set<string>([
  "not_started",
  "in_progress",
  "completed",
  "under_review",
]);

const SESSION_PHASES = new Set<string>([
  "brief",
  "investigate",
  "recommend",
  "resolve",
  "debrief",
]);

const SESSION_QUALITIES = new Set<string>([
  "invalid",
  "possible",
  "defensible",
  "preferred",
]);

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (typeof item !== "string") return false;
  }
  return true;
}

function isRecommendationDraft(value: unknown): value is RecommendationDraft {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isStringArray(v.shortlist) &&
    (v.selectedRail === null || typeof v.selectedRail === "string") &&
    isStringArray(v.reasons) &&
    isStringArray(v.conditions) &&
    typeof v.priceExpectation === "string" &&
    typeof v.arrivalExpectation === "string" &&
    typeof v.trackingExpectation === "string" &&
    typeof v.customerExplanation === "string"
  );
}

function isCaseOutcomeShallow(value: unknown): boolean {
  // Outcome is opaque prose + arrays authored by the evaluator. We validate
  // the fields the UI reads WITHOUT defensive guards:
  //   - `quality` (enum) — read in StatusChip and consequence framing.
  //   - `soundReasoning` (string[]) — CaseOutcome.tsx and CaseDebrief.tsx call
  //     `outcome.soundReasoning.length` and `.map(...)` directly (no optional
  //     chaining), so a missing/non-array value crashes at render.
  // Other prose fields (`consequence`, `reasoningGap`, `nextAction`,
  // `invalidRailIds`, `missingFactIds`) are read truthily or render-safely as
  // undefined text, so they stay shallow. Deep validation of every prose field
  // is the evaluator's job; this guard only closes the crash-class.
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.quality === "string" &&
    SESSION_QUALITIES.has(v.quality) &&
    isStringArray(v.soundReasoning)
  );
}

function isAttemptSnapshot(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isRecommendationDraft(v.draft) &&
    isCaseOutcomeShallow(v.outcome) &&
    typeof v.submittedAt === "string"
  );
}

/**
 * Runtime type guard for a loaded CaseSession payload. Pure (no side effects).
 *
 * Certifies the payload is a structurally-valid `CaseSession` for the
 * expected `caseId`. Use this before any `as CaseSession` cast at the I/O
 * boundary; the narrowing makes the cast unnecessary.
 */
export function isCaseSession(value: unknown, caseId: CaseId): value is CaseSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === 1 &&
    v.caseId === caseId &&
    typeof v.caseRevision === "string" &&
    typeof v.status === "string" &&
    SESSION_STATUSES.has(v.status) &&
    typeof v.phase === "string" &&
    SESSION_PHASES.has(v.phase) &&
    isStringArray(v.requestedFactIds) &&
    isRecommendationDraft(v.draft) &&
    (v.firstAttempt === null || isAttemptSnapshot(v.firstAttempt)) &&
    (v.revisedAttempt === null || isAttemptSnapshot(v.revisedAttempt)) &&
    isStringArray(v.openedReferenceIds) &&
    // `transferOutcome` is additive (Piece 5c) — older sessions lack it. The
    // guard accepts null, undefined (handled by normalizeTransferOutcome), or
    // an object that looks like an outcome. The deep shape is the evaluator's
    // contract; we only confirm "object-or-nullish" so the consumer's
    // `=== null` branch is safe.
    (v.transferOutcome === null ||
      v.transferOutcome === undefined ||
      isCaseOutcomeShallow(v.transferOutcome)) &&
    // `diagnosis` is additive (the spec-L189 diagnose step). Older sessions
    // lack it; accept undefined and normalize to "" in the loader so consumers
    // can branch on `=== ""` without guarding both null/undefined.
    (v.diagnosis === undefined || typeof v.diagnosis === "string") &&
    typeof v.updatedAt === "string"
  );
}

/**
 * Load a persisted session for a case.
 *
 * Returns `null` when:
 *   - no session is stored,
 *   - the stored payload is corrupt or has the wrong schema version.
 *
 * Returns a RECOVERED session when the stored `caseRevision` does not match
 * the current catalog `CASE_REVISION`. The recovery contract (per the plan's
 * failure-modes table: "Draft marked unrecoverable; first attempt preserved"):
 *   - the working `draft`, `requestedFactIds`, and `openedReferenceIds` are
 *     reset (they were built against stale case content),
 *   - `firstAttempt` is PRESERVED (the learner's first attempt is never lost),
 *   - `caseRevision` is bumped to the current catalog revision so the session
 *     is immediately resumable,
 *   - `status` is set to `under_review` and `phase` to `investigate` so the UI
 *     can surface "your prior draft was invalidated; please re-investigate".
 *
 * If a stale session had no first attempt, the recovery yields an empty shell
 * pinned to the current revision (nothing of value was lost).
 */
export function loadCaseSession(caseId: CaseId): CaseSession | null {
  // We read localStorage directly (rather than via `loadVersioned`) because
  // our contract is "null when absent/corrupt", while `loadVersioned`'s
  // contract is "fallback when absent/corrupt".
  const key = sessionKey(caseId);
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  // T9: validate the FULL nested shape. The pre-fix guard checked only
  // `schemaVersion === 1` and `caseId === caseId` before `parsed as
  // CaseSession`, which let payloads that passed those two fields but
  // omitted nested sub-objects (e.g. `draft` missing, `requestedFactIds:
  // null`, a half-formed `firstAttempt`) reach the consumer and crash at
  // mount (`session.draft.customerExplanation`,
  // `session.requestedFactIds.length`, CaseOutcome's
  // `current.draft.selectedRail`). Reachability is real: any other writer
  // under `relay:case-session:<id>` (a future migration, a partial write
  // interrupted by tab close, a hand-edited localStorage entry, a sibling
  // key from an older build) lands here. The type guard is pure (no side
  // effects) so the I/O boundary contract is preserved.
  if (!isCaseSession(parsed, caseId)) {
    return null;
  }
  const stored = parsed;

  // Revision mismatch: recover without losing the first attempt. The
  // recovery contract (recoverStaleSession) constructs a known-good shape,
  // so a structurally-valid session with a mismatched caseRevision still
  // resumes — it does NOT hit the null-on-corrupt path.
  if (stored.caseRevision !== CASE_REVISION) {
    return recoverStaleSession(caseId, stored);
  }

  // Piece 5c additive-field normalization: `transferOutcome` is new. Sessions
  // persisted by Piece 5b lack the key entirely and would surface
  // `undefined`. Normalize to null here (a single point) so consumers can
  // branch on `=== null` without a second guard for undefined. Purely a
  // read-time coercion — no schema bump, no migration write.
  // Spec-L189 diagnose-step: `diagnosis` is likewise additive — older sessions
  // lack it. Normalize to "" in the same pass.
  return normalizeDiagnosis(normalizeTransferOutcome(stored));
}

/**
 * Build a recovered session from a stale one. Pure (no I/O). Callers reach
 * it via `loadCaseSession`.
 */
function recoverStaleSession(caseId: CaseId, stale: CaseSession): CaseSession {
  return {
    schemaVersion: 1,
    caseId,
    caseRevision: CASE_REVISION,
    status: "under_review",
    phase: "investigate",
    requestedFactIds: [],
    draft: { ...EMPTY_DRAFT, shortlist: [], reasons: [], conditions: [] },
    // The first attempt is preserved even when the draft is invalidated.
    firstAttempt: stale.firstAttempt,
    revisedAttempt: null, // a revised attempt built on stale facts is also stale
    openedReferenceIds: [],
    // The recovered session is back at investigate; there is no transfer
    // outcome for this run yet. Normalize defensively (stale sessions may
    // predate the field) — see loadCaseSession.
    transferOutcome: null,
    diagnosis: "",
    updatedAt: stale.updatedAt,
  };
}

/**
 * Coerce a missing `transferOutcome` to null. The field is additive (Piece
 * 5c); older persisted payloads (Piece 5b and earlier) lack the key. Reading
 * code should only ever see null, never undefined.
 */
function normalizeTransferOutcome(session: CaseSession): CaseSession {
  if (session.transferOutcome === undefined) {
    return { ...session, transferOutcome: null };
  }
  return session;
}

/**
 * Coerce a missing `diagnosis` to "". The field is additive (the spec-L189
 * diagnose step); older persisted payloads lack the key. Reading code should
 * only ever see a string, never undefined.
 */
function normalizeDiagnosis(session: CaseSession): CaseSession {
  if (session.diagnosis === undefined) {
    return { ...session, diagnosis: "" };
  }
  return session;
}

/**
 * Persist a session. Returns a typed result so the UI can surface a
 * recoverable failure (quota / unavailable) instead of silently dropping the
 * write — the caseStore equivalent of the typed `saveVersioned` primitive.
 */
export function saveCaseSession(session: CaseSession): SaveResult {
  return saveVersioned(sessionKey(session.caseId), session);
}

// ─── Internal equality helpers ──────────────────────────────────────────────
// Used so the reducer can return the SAME reference on no-op dispatches,
// which lets the UI cheaply skip re-renders and makes "illegal action ⇒ no
// partial mutation" directly testable via `expect(next).toBe(session)`.

function arrayEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function draftsEqual(a: RecommendationDraft, b: RecommendationDraft): boolean {
  if (a === b) return true;
  if (a.selectedRail !== b.selectedRail) return false;
  if (a.priceExpectation !== b.priceExpectation) return false;
  if (a.arrivalExpectation !== b.arrivalExpectation) return false;
  if (a.trackingExpectation !== b.trackingExpectation) return false;
  if (a.customerExplanation !== b.customerExplanation) return false;
  if (!arrayEqual(a.shortlist, b.shortlist)) return false;
  if (!arrayEqual(a.reasons, b.reasons)) return false;
  if (!arrayEqual(a.conditions, b.conditions)) return false;
  return true;
}
