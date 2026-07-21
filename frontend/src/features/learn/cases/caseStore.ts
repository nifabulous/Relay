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
 *   2. `loadCaseSession` / `saveCaseSession` / `clearCaseDraft` /
 *      `updateRequestedFacts` — the I/O boundary. These wrap localStorage via
 *      the shared versioned primitives in `lib/persistence/storage`. They are
 *      the ONLY place case state touches storage.
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
  removeStored,
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
  | { type: "open-reference"; referenceId: string };

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
    updatedAt: "",
  };
}

// ─── Purity helpers ─────────────────────────────────────────────────────────

/**
 * Deep-clone a session using the runtime's structured-clone. Used so that
 * snapshot fields (firstAttempt/revisedAttempt) are fully decoupled from the
 * mutable working draft — a later `edit-draft` cannot mutate a snapshot even
 * by accident.
 */
function cloneSession(session: CaseSession): CaseSession {
  // structuredClone is available in all evergreen browsers and in Node 17+;
  // it preserves Dates/arrays/plain objects and throws on functions (which a
  // CaseSession never contains). This keeps the reducer free of `JSON.parse(
  // JSON.stringify(...))` round-tripping quirks (e.g. `undefined` fields).
  return structuredClone(session);
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
 *                   here.
 *   recommend     — the working recommendation phase. edit-draft and
 *                   send-recommendation are legal; begin-revision returns
 *                   here after a first attempt to revise from the original.
 *   resolve       — a recommendation has been submitted; the learner reviews
 *                   the outcome. begin-revision or complete-transfer are the
 *                   forward paths.
 *   debrief       — the case is complete (transfer done).
 *
 * Legality summary (illegal ⇒ return SAME reference, no partial mutation):
 *   start               — legal only in `brief`; idempotent otherwise.
 *   request-facts       — legal in investigate/recommend; no-op elsewhere.
 *   edit-draft          — legal in investigate/recommend (and after
 *                         begin-revision); no-op after a first attempt until
 *                         begin-revision, and no-op in brief.
 *   send-recommendation — sets firstAttempt (or revisedAttempt during a
 *                         revision); double-submit is a no-op; no-op in brief.
 *   begin-revision      — legal only when a first attempt exists AND no
 *                         revised attempt has been submitted (one revision
 *                         per case — the Phase-1 contract); idempotent if
 *                         already in the recommend (revising) phase; no-op
 *                         once revisedAttempt is set.
 *   complete-transfer   — legal only after at least a first attempt (resolve
 *                         or later); no-op in brief/investigate.
 *   restart             — always legal; clears the working draft and facts,
 *                         preserves attempt history, returns to investigate.
 *   open-reference      — legal in investigate/recommend (including the
 *                         recommend phase entered via begin-revision); appends
 *                         the reference id to openedReferenceIds, deduped;
 *                         no-op (same reference) if the id is already present,
 *                         and no-op outside the legal phases.
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
      // Legal only while gathering/recommending. After submission the facts
      // are fixed (a revision re-requests its own facts via edit-draft).
      if (session.phase !== "investigate" && session.phase !== "recommend") {
        return session;
      }
      // No-op if the set is unchanged (keeps updatedAt stable on idempotent
      // re-dispatch).
      if (arrayEqual(session.requestedFactIds, action.ids)) {
        return session;
      }
      return {
        ...cloneSession(session),
        requestedFactIds: [...action.ids],
      };
    }

    case "edit-draft": {
      // Illegal before the case is started, or after a first attempt has been
      // submitted (the first attempt is immutable; revision begins via
      // begin-revision which re-opens the draft).
      const inRevisablePhase =
        session.phase === "investigate" || session.phase === "recommend";
      if (!inRevisablePhase) {
        return session;
      }
      // After a first attempt, the working draft is frozen until the learner
      // explicitly begins a revision. We detect "first attempt submitted but
      // not yet revising" as: firstAttempt !== null AND the session is still
      // in the post-submit resolve/debrief flow OR the working draft still
      // matches the frozen snapshot. The simplest invariant: once
      // firstAttempt is set, edit-draft is only legal in the `recommend`
      // phase (which begin-revision puts us back into).
      if (session.firstAttempt !== null && session.phase !== "recommend") {
        return session;
      }
      // If we're in `recommend` but have NOT begun a revision (i.e. this is
      // the initial recommend phase before any submission), editing is fine.
      // If we ARE revising (firstAttempt set + phase recommend via
      // begin-revision), editing is also fine. The only blocked case is
      // `resolve`/`debrief`, handled above.
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
      const preserved = cloneSession(session);
      return {
        schemaVersion: 1,
        caseId: session.caseId,
        caseRevision: CASE_REVISION,
        status: "in_progress",
        phase: "investigate",
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
  // contract is "fallback when absent/corrupt". We still apply the same
  // structural schema guard `loadVersioned` does (schemaVersion === 1), then
  // add the caseId match and the caseRevision recovery on top.
  const key = sessionKey(caseId);
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  // Structural/schema guard: only schemaVersion === 1 with a matching caseId
  // is a real session for THIS case.
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    (parsed as { caseId?: unknown }).caseId !== caseId
  ) {
    return null;
  }
  const stored = parsed as CaseSession;

  // Revision mismatch: recover without losing the first attempt.
  if (stored.caseRevision !== CASE_REVISION) {
    return recoverStaleSession(caseId, stored);
  }

  // Piece 5c additive-field normalization: `transferOutcome` is new. Sessions
  // persisted by Piece 5b lack the key entirely and would surface
  // `undefined`. Normalize to null here (a single point) so consumers can
  // branch on `=== null` without a second guard for undefined. Purely a
  // read-time coercion — no schema bump, no migration write.
  return normalizeTransferOutcome(stored);
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
 * Persist a session. Returns a typed result so the UI can surface a
 * recoverable failure (quota / unavailable) instead of silently dropping the
 * write — the caseStore equivalent of the typed `saveVersioned` primitive.
 */
export function saveCaseSession(session: CaseSession): SaveResult {
  return saveVersioned(sessionKey(session.caseId), session);
}

/**
 * Remove the stored session for a case. Used by "discard draft" affordances.
 * Only the selected case's key is touched; sibling cases and unrelated keys
 * are untouched.
 */
export function clearCaseDraft(caseId: CaseId): void {
  removeStored(sessionKey(caseId));
}

// ─── Invalidation ───────────────────────────────────────────────────────────

/**
 * DOM id of the first UI control the learner should refocus on after an
 * upstream-fact change invalidates their in-progress recommendation. The
 * shortlist is always the first recommendation-specific control, so a single
 * stable constant suffices for Phase 1. (If a later phase adds per-rail
 * controls, generalize to `rail-${id}` then — YAGNI now.)
 */
export const FIRST_AFFECTED_CONTROL_ID = "case-shortlist";

/**
 * Apply an upstream-fact change to a stored session.
 *
 * Per the plan's invalidation rule: "changing an upstream fact clears
 * shortlist, recommendation, and outcomes while retaining the case shell and
 * returning the first affected control id."
 *
 * Specifically this clears:
 *   - `draft.shortlist`, `draft.selectedRail`, `draft.reasons`
 *     (the recommendation-specific fields the learner built against the old
 *     facts),
 *   - `draft.customerExplanation` (it typically NAMES the selected rail, so it
 *     is stale once the shortlist is invalidated; the prose that justifies a
 *     specific rail no longer applies),
 *   - `firstAttempt` and `revisedAttempt` (their outcomes were scored against
 *     the old facts and are now stale),
 * and KEEPS:
 *   - the case shell (`caseId`, `caseRevision`, `schemaVersion`),
 *   - `status`, `phase` (the learner stays where they are),
 *   - `requestedFactIds` is UPDATED to the new ids (the caller is telling us
 *     the new fact set),
 *   - the remaining draft fields (conditions, and the three expectation
 *     fields price/arrival/tracking) — these describe rail PROPERTIES rather
 *     than specific rails and are softer prose, so they survive the
 *     invalidation. (If a future case makes them rail-specific, narrow this.)
 *
 * Returns `{ firstAffectedControlId }` so the UI can move focus to the
 * shortlist control after invalidation, or `{ firstAffectedControlId: null }`
 * when nothing material was invalidated (no session, or a session with no
 * recommendation-specific state to clear).
 */
export function updateRequestedFacts(
  caseId: CaseId,
  ids: string[],
): { firstAffectedControlId: string | null } {
  const session = loadCaseSession(caseId);
  if (session === null) {
    // Nothing to invalidate.
    return { firstAffectedControlId: null };
  }

  const hadShortlist = session.draft.shortlist.length > 0;
  const hadSelectedRail = session.draft.selectedRail !== null;
  const hadReasons = session.draft.reasons.length > 0;
  const hadAttempts = session.firstAttempt !== null || session.revisedAttempt !== null;

  if (!hadShortlist && !hadSelectedRail && !hadReasons && !hadAttempts) {
    // Nothing recommendation-specific to invalidate. Still record the new
    // requested fact set so the session reflects the upstream change, but do
    // not claim a control to refocus.
    const next: CaseSession = {
      ...session,
      requestedFactIds: [...ids],
    };
    saveCaseSession(next);
    return { firstAffectedControlId: null };
  }

  const nextDraft: RecommendationDraft = {
    ...session.draft,
    shortlist: [],
    selectedRail: null,
    reasons: [],
    // The customer explanation typically names the selected rail ("I recommend
    // SWIFT-to-Fedwire because..."), so it is stale after a shortlist
    // invalidation. The three expectation fields below describe rail
    // PROPERTIES (price/arrival/tracking) rather than specific rails, so they
    // are softer and survive — they stay in `...session.draft` via spread.
    customerExplanation: "",
  };

  const next: CaseSession = {
    ...session,
    requestedFactIds: [...ids],
    draft: nextDraft,
    firstAttempt: null,
    revisedAttempt: null,
  };
  saveCaseSession(next);

  return { firstAffectedControlId: FIRST_AFFECTED_CONTROL_ID };
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
