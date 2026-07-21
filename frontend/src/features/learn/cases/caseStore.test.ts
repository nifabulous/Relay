import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  CaseOutcome,
  RecommendationDraft,
} from "./caseTypes";
import {
  caseReducer,
  loadCaseSession,
  saveCaseSession,
  clearCaseDraft,
  updateRequestedFacts,
  createInitialCaseSession,
  EMPTY_DRAFT,
} from "./caseStore";
import { CASE_REVISION } from "./caseCatalog";
import type { CaseSession } from "./caseStore";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const CASE_ID = "canada-us-supplier" as const;

const VALID_OUTCOME: CaseOutcome = {
  quality: "defensible",
  consequence: "would deliver the payment",
  soundReasoning: ["eligible rail selected"],
  reasoningGap: null,
  nextAction: "Release the payment.",
  invalidRailIds: [],
  missingFactIds: [],
};

const PREFERRED_OUTCOME: CaseOutcome = {
  quality: "preferred",
  consequence: "best fit",
  soundReasoning: ["fast", "tracked"],
  reasoningGap: null,
  nextAction: "Release.",
  invalidRailIds: [],
  missingFactIds: [],
};

function filledDraft(): RecommendationDraft {
  return {
    shortlist: ["swift-fedwire"],
    selectedRail: "swift-fedwire",
    reasons: ["fast same-day USD value"],
    conditions: ["beneficiary bank confirmed"],
    priceExpectation: "premium but justified by urgency",
    arrivalExpectation: "same-day value",
    trackingExpectation: "full UETR tracking",
    customerExplanation: "I recommend SWIFT to Fedwire because…",
  };
}

function startedSession(): CaseSession {
  return caseReducer(createInitialCaseSession(CASE_ID), { type: "start" });
}

beforeEach(() => {
  localStorage.clear();
});

// ─── Reducer: legal transitions ─────────────────────────────────────────────

describe("caseReducer — start", () => {
  it("moves not_started → in_progress and brief → investigate", () => {
    const initial = createInitialCaseSession(CASE_ID);
    expect(initial.status).toBe("not_started");
    expect(initial.phase).toBe("brief");
    const next = caseReducer(initial, { type: "start" });
    expect(next.status).toBe("in_progress");
    expect(next.phase).toBe("investigate");
    expect(next.requestedFactIds).toEqual([]);
    expect(next.firstAttempt).toBeNull();
    expect(next.revisedAttempt).toBeNull();
    expect(next.openedReferenceIds).toEqual([]);
    expect(next.caseRevision).toBe(CASE_REVISION);
    expect(next.schemaVersion).toBe(1);
    expect(next.caseId).toBe(CASE_ID);
  });

  it("is a no-op (returns the SAME reference) when already in_progress", () => {
    const session = startedSession();
    const next = caseReducer(session, { type: "start" });
    // same object reference — no partial mutation, no copy
    expect(next).toBe(session);
  });
});

describe("caseReducer — request-facts", () => {
  it("replaces requestedFactIds in the investigate phase", () => {
    const session = startedSession();
    const next = caseReducer(session, { type: "request-facts", ids: ["price-sensitivity", "tracking-need"] });
    expect(next.requestedFactIds).toEqual(["price-sensitivity", "tracking-need"]);
  });

  it("replaces rather than unions on a second call", () => {
    const session = startedSession();
    const first = caseReducer(session, { type: "request-facts", ids: ["a", "b"] });
    const second = caseReducer(first, { type: "request-facts", ids: ["c"] });
    expect(second.requestedFactIds).toEqual(["c"]);
  });

  it("is a no-op in the brief phase", () => {
    const initial = createInitialCaseSession(CASE_ID); // status not_started, phase brief
    const next = caseReducer(initial, { type: "request-facts", ids: ["a"] });
    expect(next).toBe(initial);
  });

  it("is a no-op after a first attempt is submitted (resolve/debrief)", () => {
    const session = startedSession();
    const submitted = caseReducer(session, {
      type: "send-recommendation",
      outcome: VALID_OUTCOME,
      submittedAt: "2026-07-01T00:00:00Z",
    });
    const next = caseReducer(submitted, { type: "request-facts", ids: ["a"] });
    expect(next).toBe(submitted);
  });

  it("is a no-op returning the SAME reference when the ids are identical (arrayEqual guard)", () => {
    const session = startedSession();
    const first = caseReducer(session, { type: "request-facts", ids: ["price-sensitivity", "tracking-need"] });
    // A second dispatch with the SAME ids must short-circuit through the
    // arrayEqual guard and hand back the same reference, not a copy.
    const second = caseReducer(first, { type: "request-facts", ids: ["price-sensitivity", "tracking-need"] });
    expect(second).toBe(first);
    expect(second.requestedFactIds).toEqual(["price-sensitivity", "tracking-need"]);
  });
});

describe("caseReducer — edit-draft", () => {
  it("merges a patch into the working draft during investigate", () => {
    const session = startedSession();
    const next = caseReducer(session, { type: "edit-draft", patch: { selectedRail: "cross-border-ach" } });
    expect(next.draft.selectedRail).toBe("cross-border-ach");
    // untouched fields preserved
    expect(next.draft.shortlist).toEqual([]);
  });

  it("merges an array patch by replacement, not append", () => {
    const session = startedSession();
    const first = caseReducer(session, { type: "edit-draft", patch: { shortlist: ["a"] } });
    const second = caseReducer(first, { type: "edit-draft", patch: { shortlist: ["b", "c"] } });
    expect(second.draft.shortlist).toEqual(["b", "c"]);
  });

  it("does NOT mutate the prior session object (referential transparency)", () => {
    const session = startedSession();
    const snapshot = JSON.parse(JSON.stringify(session));
    caseReducer(session, { type: "edit-draft", patch: { selectedRail: "x" } });
    expect(session).toEqual(snapshot);
  });

  it("is a no-op after the first attempt is submitted (until begin-revision)", () => {
    const session = caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() });
    const submitted = caseReducer(session, {
      type: "send-recommendation",
      outcome: VALID_OUTCOME,
      submittedAt: "2026-07-01T00:00:00Z",
    });
    const next = caseReducer(submitted, { type: "edit-draft", patch: { selectedRail: "x" } });
    expect(next).toBe(submitted);
    expect(next.draft.selectedRail).toBe("swift-fedwire"); // unchanged
  });

  it("is a no-op in the brief phase", () => {
    const initial = createInitialCaseSession(CASE_ID);
    const next = caseReducer(initial, { type: "edit-draft", patch: { selectedRail: "x" } });
    expect(next).toBe(initial);
  });

  it("is a no-op returning the SAME reference when the patch produces no field change (draftsEqual guard)", () => {
    // Set selectedRail to a value, then re-send a patch that sets it to the
    // same value — draftsEqual must short-circuit and hand back the same
    // reference, not a copy.
    const session = caseReducer(startedSession(), { type: "edit-draft", patch: { selectedRail: "swift-fedwire" } });
    const next = caseReducer(session, { type: "edit-draft", patch: { selectedRail: "swift-fedwire" } });
    expect(next).toBe(session);
  });
});

describe("caseReducer — send-recommendation (first attempt)", () => {
  it("snapshots the draft and outcome into firstAttempt and advances phase", () => {
    const session = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "edit-draft", patch: { customerExplanation: "v1" } },
    );
    const next = caseReducer(session, {
      type: "send-recommendation",
      outcome: VALID_OUTCOME,
      submittedAt: "2026-07-01T10:00:00Z",
    });
    expect(next.firstAttempt).not.toBeNull();
    expect(next.firstAttempt!.submittedAt).toBe("2026-07-01T10:00:00Z");
    expect(next.firstAttempt!.outcome).toEqual(VALID_OUTCOME);
    expect(next.firstAttempt!.draft).toEqual(session.draft);
    // phase advances toward review
    expect(["recommend", "resolve", "debrief"]).toContain(next.phase);
  });

  it("makes the first-attempt snapshot IMMUTABLE — later draft edits cannot mutate it", () => {
    const session = caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() });
    const submitted = caseReducer(session, {
      type: "send-recommendation",
      outcome: VALID_OUTCOME,
      submittedAt: "2026-07-01T10:00:00Z",
    });
    const before = JSON.parse(JSON.stringify(submitted.firstAttempt));
    // attempt a direct edit on the working draft (illegal pre-revision; should
    // be a no-op) AND a begin-revision + edit (legal) — neither must touch
    // firstAttempt.
    const illegalEdit = caseReducer(submitted, { type: "edit-draft", patch: { selectedRail: "tampered" } });
    expect(illegalEdit).toBe(submitted);
    expect(illegalEdit.firstAttempt).toEqual(before);

    const revising = caseReducer(submitted, { type: "begin-revision" });
    const revisedEdit = caseReducer(revising, { type: "edit-draft", patch: { selectedRail: "tampered" } });
    expect(revisedEdit.firstAttempt).toEqual(before);
    expect(revisedEdit.firstAttempt!.draft.selectedRail).toBe("swift-fedwire");
  });

  it("double-submit protection: a second send-recommendation is a no-op", () => {
    const session = caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() });
    const first = caseReducer(session, {
      type: "send-recommendation",
      outcome: VALID_OUTCOME,
      submittedAt: "2026-07-01T10:00:00Z",
    });
    const second = caseReducer(first, {
      type: "send-recommendation",
      outcome: PREFERRED_OUTCOME,
      submittedAt: "2026-07-01T11:00:00Z",
    });
    expect(second).toBe(first);
    expect(second.firstAttempt!.outcome).toEqual(VALID_OUTCOME);
  });

  it("is a no-op before the case is started (brief phase)", () => {
    const initial = createInitialCaseSession(CASE_ID);
    const next = caseReducer(initial, {
      type: "send-recommendation",
      outcome: VALID_OUTCOME,
      submittedAt: "2026-07-01T10:00:00Z",
    });
    expect(next).toBe(initial);
    expect(next.firstAttempt).toBeNull();
  });
});

describe("caseReducer — begin-revision", () => {
  function submitted() {
    return caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
  }

  it("resets the working draft to the first attempt's draft and marks a revising phase", () => {
    const after = caseReducer(submitted(), { type: "begin-revision" });
    expect(after.draft).toEqual(submitted().firstAttempt!.draft);
    // revision continues in a phase that permits editing
    expect(["recommend", "resolve"]).toContain(after.phase);
  });

  it("does NOT mutate firstAttempt (revision isolation)", () => {
    const before = submitted();
    const beforeAttempt = JSON.parse(JSON.stringify(before.firstAttempt));
    const after = caseReducer(before, { type: "begin-revision" });
    const edited = caseReducer(after, { type: "edit-draft", patch: { selectedRail: "cross-border-ach" } });
    expect(edited.firstAttempt).toEqual(beforeAttempt);
    expect(edited.firstAttempt!.draft.selectedRail).toBe("swift-fedwire");
    // working draft IS mutable during revision
    expect(edited.draft.selectedRail).toBe("cross-border-ach");
  });

  it("is a no-op when there is no first attempt", () => {
    const initial = createInitialCaseSession(CASE_ID);
    const next = caseReducer(initial, { type: "begin-revision" });
    expect(next).toBe(initial);
  });

  it("is a no-op when already revising (revisedAttempt not yet set is fine, but double begin is idempotent)", () => {
    const once = caseReducer(submitted(), { type: "begin-revision" });
    const twice = caseReducer(once, { type: "begin-revision" });
    // second begin-revision must not wipe in-progress revision edits
    expect(twice).toBe(once);
  });

  it("is a no-op after a revised attempt has been submitted (one revision per case)", () => {
    // Trace the unwinnable-state path: submit first → begin-revision → send
    // revised → begin-revision AGAIN must return the SAME reference.
    const revised = caseReducer(
      caseReducer(submitted(), { type: "begin-revision" }),
      {
        type: "send-recommendation",
        outcome: PREFERRED_OUTCOME,
        submittedAt: "2026-07-02T10:00:00Z",
      },
    );
    // revisedAttempt is now set and phase is back at resolve.
    expect(revised.revisedAttempt).not.toBeNull();
    expect(revised.phase).toBe("resolve");

    const next = caseReducer(revised, { type: "begin-revision" });
    // The second begin-revision is a TRUE no-op — same reference, nothing
    // changed. Without this guard the learner would be reset into the
    // recommend phase with a draft whose Send can never fire (the revised
    // submit branch no-ops because revisedAttempt is already set), producing
    // an unwinnable state.
    expect(next).toBe(revised);
    expect(next.phase).toBe("resolve");
    expect(next.revisedAttempt).not.toBeNull();
    expect(next.revisedAttempt!.outcome).toEqual(PREFERRED_OUTCOME);
  });
});

describe("caseReducer — send-recommendation during revision (second attempt)", () => {
  function revising() {
    const submitted = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
    return caseReducer(submitted, { type: "begin-revision" });
  }

  it("sets revisedAttempt and preserves firstAttempt", () => {
    const after = caseReducer(revising(), {
      type: "send-recommendation",
      outcome: PREFERRED_OUTCOME,
      submittedAt: "2026-07-02T10:00:00Z",
    });
    expect(after.revisedAttempt).not.toBeNull();
    expect(after.revisedAttempt!.outcome).toEqual(PREFERRED_OUTCOME);
    expect(after.revisedAttempt!.submittedAt).toBe("2026-07-02T10:00:00Z");
    expect(after.firstAttempt).not.toBeNull();
    expect(after.firstAttempt!.outcome).toEqual(VALID_OUTCOME);
  });

  it("double-submit protection applies to the revised attempt too", () => {
    const once = caseReducer(revising(), {
      type: "send-recommendation",
      outcome: PREFERRED_OUTCOME,
      submittedAt: "2026-07-02T10:00:00Z",
    });
    const twice = caseReducer(once, {
      type: "send-recommendation",
      outcome: VALID_OUTCOME,
      submittedAt: "2026-07-02T11:00:00Z",
    });
    expect(twice).toBe(once);
    expect(twice.revisedAttempt!.outcome).toEqual(PREFERRED_OUTCOME);
  });
});

describe("caseReducer — open-reference", () => {
  it("appends the reference id to openedReferenceIds during investigate", () => {
    const session = startedSession();
    const next = caseReducer(session, { type: "open-reference", referenceId: "scheme-ref" });
    expect(next.openedReferenceIds).toEqual(["scheme-ref"]);
  });

  it("appends a second distinct reference id without losing the first", () => {
    const session = startedSession();
    const first = caseReducer(session, { type: "open-reference", referenceId: "scheme-ref" });
    const second = caseReducer(first, { type: "open-reference", referenceId: "ops-bulletin" });
    expect(second.openedReferenceIds).toEqual(["scheme-ref", "ops-bulletin"]);
  });

  it("is legal in the recommend phase (initial recommend, pre-submit)", () => {
    // Move to recommend via edit-draft in investigate — the recommend phase
    // is also reachable post begin-revision; both must allow opening a ref.
    const session = startedSession();
    const after = caseReducer(session, { type: "open-reference", referenceId: "scheme-ref" });
    expect(after.openedReferenceIds).toEqual(["scheme-ref"]);
  });

  it("is legal during a revision (recommend phase after begin-revision)", () => {
    const submitted = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
    const revising = caseReducer(submitted, { type: "begin-revision" });
    expect(revising.phase).toBe("recommend");
    const next = caseReducer(revising, { type: "open-reference", referenceId: "scheme-ref" });
    expect(next.openedReferenceIds).toEqual(["scheme-ref"]);
  });

  it("dedupes: reopening the SAME reference is a no-op returning the SAME reference", () => {
    const session = startedSession();
    const first = caseReducer(session, { type: "open-reference", referenceId: "scheme-ref" });
    const second = caseReducer(first, { type: "open-reference", referenceId: "scheme-ref" });
    // already in the list — no mutation, same reference back
    expect(second).toBe(first);
    expect(second.openedReferenceIds).toEqual(["scheme-ref"]);
  });

  it("is a no-op in the brief phase (investigation not started)", () => {
    const initial = createInitialCaseSession(CASE_ID);
    const next = caseReducer(initial, { type: "open-reference", referenceId: "scheme-ref" });
    expect(next).toBe(initial);
    expect(next.openedReferenceIds).toEqual([]);
  });

  it("is a no-op in resolve after a first attempt (until a revision begins)", () => {
    const submitted = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
    expect(submitted.phase).toBe("resolve");
    const next = caseReducer(submitted, { type: "open-reference", referenceId: "scheme-ref" });
    expect(next).toBe(submitted);
    expect(next.openedReferenceIds).toEqual([]);
  });
});

describe("caseReducer — complete-transfer", () => {
  function submitted() {
    return caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
  }

  it("marks the session completed after at least a first attempt", () => {
    const next = caseReducer(submitted(), {
      type: "complete-transfer",
      outcome: PREFERRED_OUTCOME,
    });
    expect(next.status).toBe("completed");
  });

  it("PERSISTS the transfer outcome on the session so the debrief can show it", () => {
    // Piece 5c CRITICAL FIX: the reducer's complete-transfer branch MUST
    // persist action.outcome on the session as `transferOutcome`. Without
    // this, the debrief has no way to retrieve the transfer's decision
    // quality / consequence from storage.
    const next = caseReducer(submitted(), {
      type: "complete-transfer",
      outcome: PREFERRED_OUTCOME,
    });
    expect(next.transferOutcome).toEqual(PREFERRED_OUTCOME);
    expect(next.transferOutcome?.quality).toBe("preferred");
  });

  it("initializes transferOutcome to null on a fresh session (additive field)", () => {
    const initial = createInitialCaseSession(CASE_ID);
    expect(initial.transferOutcome).toBeNull();
  });

  it("restart resets transferOutcome to null (the prior transfer does not leak into a new run)", () => {
    const completed = caseReducer(submitted(), {
      type: "complete-transfer",
      outcome: PREFERRED_OUTCOME,
    });
    expect(completed.transferOutcome).not.toBeNull();
    const restarted = caseReducer(completed, { type: "restart" });
    expect(restarted.transferOutcome).toBeNull();
  });

  it("is a no-op before any recommendation is submitted", () => {
    const session = startedSession();
    const next = caseReducer(session, { type: "complete-transfer", outcome: VALID_OUTCOME });
    expect(next).toBe(session);
  });

  it("is a no-op in the brief phase", () => {
    const initial = createInitialCaseSession(CASE_ID);
    const next = caseReducer(initial, { type: "complete-transfer", outcome: VALID_OUTCOME });
    expect(next).toBe(initial);
  });
});

describe("caseReducer — restart", () => {
  it("clears the working draft but PRESERVES the attempt history", () => {
    const submitted = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
    const restart = caseReducer(submitted, { type: "restart" });
    // case shell preserved
    expect(restart.caseId).toBe(CASE_ID);
    expect(restart.caseRevision).toBe(CASE_REVISION);
    expect(restart.schemaVersion).toBe(1);
    // working state reset
    expect(restart.draft).toEqual(EMPTY_DRAFT);
    expect(restart.requestedFactIds).toEqual([]);
    expect(restart.openedReferenceIds).toEqual([]);
    expect(restart.phase).toBe("investigate");
    expect(restart.status).toBe("in_progress");
    // history preserved
    expect(restart.firstAttempt).toEqual(submitted.firstAttempt);
    expect(restart.revisedAttempt).toEqual(submitted.revisedAttempt);
  });

  it("restart on a fresh session keeps it fresh (idempotent shell)", () => {
    const initial = createInitialCaseSession(CASE_ID);
    const restart = caseReducer(initial, { type: "restart" });
    expect(restart.caseId).toBe(CASE_ID);
    expect(restart.draft).toEqual(EMPTY_DRAFT);
    expect(restart.firstAttempt).toBeNull();
    expect(restart.status).toBe("in_progress");
    expect(restart.phase).toBe("investigate");
  });

  it("preserves BOTH firstAttempt and revisedAttempt when both exist, and clears the working draft", () => {
    // Set up a session with both attempts: submit first → begin-revision →
    // send revised. The current restart test only seeds firstAttempt; this
    // covers the revisedAttempt preservation path.
    const submitted = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
    const revised = caseReducer(
      caseReducer(submitted, { type: "begin-revision" }),
      {
        type: "send-recommendation",
        outcome: PREFERRED_OUTCOME,
        submittedAt: "2026-07-02T10:00:00Z",
      },
    );
    expect(revised.firstAttempt).not.toBeNull();
    expect(revised.revisedAttempt).not.toBeNull();

    // Restart from a state where the working draft has diverged from both
    // snapshots — the working draft must be reset, history untouched.
    const dirty = caseReducer(revised, { type: "edit-draft", patch: { customerExplanation: "dirty" } });
    // (edit-draft is illegal in resolve, so dirty === revised; that's fine —
    // we only need firstAttempt/revisedAttempt populated.)

    const restart = caseReducer(revised, { type: "restart" });
    // history preserved
    expect(restart.firstAttempt).toEqual(revised.firstAttempt);
    expect(restart.revisedAttempt).toEqual(revised.revisedAttempt);
    // working draft cleared
    expect(restart.draft).toEqual(EMPTY_DRAFT);
    expect(restart.requestedFactIds).toEqual([]);
    expect(restart.openedReferenceIds).toEqual([]);
    // phase back to investigate
    expect(restart.phase).toBe("investigate");
    void dirty;
  });
});

describe("caseReducer — purity", () => {
  it("does not mutate the input session for any action type", () => {
    const session = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
    const snapshot = JSON.parse(JSON.stringify(session));
    const actions: Parameters<typeof caseReducer>[1][] = [
      { type: "start" },
      { type: "request-facts", ids: ["a"] },
      { type: "edit-draft", patch: { selectedRail: "x" } },
      { type: "send-recommendation", outcome: PREFERRED_OUTCOME, submittedAt: "2026-07-02T00:00:00Z" },
      { type: "begin-revision" },
      { type: "complete-transfer", outcome: PREFERRED_OUTCOME },
      { type: "restart" },
    ];
    for (const action of actions) {
      caseReducer(session, action);
      expect(session).toEqual(snapshot);
    }
  });

  it("returns the SAME reference for an illegal action (not a shallow copy)", () => {
    const initial = createInitialCaseSession(CASE_ID); // brief phase
    // edit-draft is illegal in brief
    const next = caseReducer(initial, { type: "edit-draft", patch: { selectedRail: "x" } });
    expect(next).toBe(initial);
  });

  it("never touches localStorage (no setItem/getItem/removeItem) for ANY action type", () => {
    // Spy on the storage prototype so we catch ANY localStorage access
    // regardless of key, including side-effect leaks that the same-reference
    // no-op assertion above would miss (e.g. a "read-then-write" that happens
    // to return the same reference).
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");

    // A representative session in the resolve phase, so every action below
    // hits its LEGAL branch at least once (legal branches are where a stray
    // save/load would most plausibly sneak in). For begin-revision we use the
    // pre-revised state so the action actually does work rather than no-op.
    const session = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );

    const actions: Parameters<typeof caseReducer>[1][] = [
      { type: "start" },
      { type: "request-facts", ids: ["a"] },
      { type: "edit-draft", patch: { selectedRail: "x" } },
      { type: "send-recommendation", outcome: PREFERRED_OUTCOME, submittedAt: "2026-07-02T00:00:00Z" },
      { type: "begin-revision" },
      { type: "complete-transfer", outcome: PREFERRED_OUTCOME },
      { type: "restart" },
      { type: "open-reference", referenceId: "scheme-ref" },
    ];

    for (const action of actions) {
      caseReducer(session, action);
    }

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

// ─── Store: round-trip persistence ──────────────────────────────────────────

describe("loadCaseSession / saveCaseSession", () => {
  it("returns null when nothing is stored", () => {
    expect(loadCaseSession(CASE_ID)).toBeNull();
  });

  it("round-trips a session through localStorage", () => {
    const session = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
    saveCaseSession(session);
    const loaded = loadCaseSession(CASE_ID);
    expect(loaded).toEqual(session);
  });

  it("round-trip preserves firstAttempt immutability (loaded snapshot is independent)", () => {
    const session = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
    saveCaseSession(session);
    const loaded = loadCaseSession(CASE_ID)!;
    const before = JSON.parse(JSON.stringify(loaded.firstAttempt));
    // mutate the working draft on the loaded session — firstAttempt must not change
    loaded.draft.selectedRail = "mutated";
    expect(loaded.firstAttempt).toEqual(before);
  });

  it("uses the relay:case-session:<caseId> key", () => {
    const session = startedSession();
    saveCaseSession(session);
    expect(localStorage.getItem("relay:case-session:canada-us-supplier")).not.toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    localStorage.setItem("relay:case-session:canada-us-supplier", "not-json{");
    expect(loadCaseSession(CASE_ID)).toBeNull();
  });

  it("returns null for an obsolete schema version", () => {
    localStorage.setItem(
      "relay:case-session:canada-us-supplier",
      JSON.stringify({ schemaVersion: 99, caseId: CASE_ID }),
    );
    expect(loadCaseSession(CASE_ID)).toBeNull();
  });
});

// ─── Store: case-revision mismatch recovery ─────────────────────────────────

describe("loadCaseSession — case-revision mismatch", () => {
  it("recovers a stale session by resetting the working draft but preserving the first attempt", () => {
    const staleRevision = "2099-01-01-stale";
    const staleFirstAttempt = {
      draft: filledDraft(),
      outcome: VALID_OUTCOME,
      submittedAt: "2026-01-01T00:00:00Z",
    };
    const stale: CaseSession = {
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRevision: staleRevision,
      status: "in_progress",
      phase: "recommend",
      requestedFactIds: ["price-sensitivity"],
      draft: filledDraft(),
      firstAttempt: staleFirstAttempt,
      revisedAttempt: null,
      openedReferenceIds: ["scheme-ref"],
      // The transferOutcome field is additive (Piece 5c). A stale session that
      // never reached the transfer phase has null here.
      transferOutcome: null,
      updatedAt: "2026-01-01T00:00:00Z",
    };
    localStorage.setItem(
      "relay:case-session:canada-us-supplier",
      JSON.stringify(stale),
    );

    const recovered = loadCaseSession(CASE_ID);

    // Recovery contract:
    //  - the stale DRAFT never silently resumes (it is reset to empty)
    //  - the FIRST ATTEMPT is never lost
    //  - the caseRevision is updated to the current catalog revision so the
    //    session is immediately resumable.
    expect(recovered).not.toBeNull();
    expect(recovered!.caseRevision).toBe(CASE_REVISION);
    expect(recovered!.draft).toEqual(EMPTY_DRAFT);
    expect(recovered!.firstAttempt).toEqual(staleFirstAttempt);
    expect(recovered!.requestedFactIds).toEqual([]);
    expect(recovered!.openedReferenceIds).toEqual([]);
    // status reflects that the prior draft was invalidated
    expect(recovered!.status).toBe("under_review");
    expect(recovered!.phase).toBe("investigate");
  });

  it("recovers a stale session that had NO first attempt by returning a fresh shell", () => {
    const stale: CaseSession = {
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRevision: "2099-01-01-stale",
      status: "in_progress",
      phase: "recommend",
      requestedFactIds: ["x"],
      draft: filledDraft(),
      firstAttempt: null,
      revisedAttempt: null,
      openedReferenceIds: [],
      // transferOutcome is additive (Piece 5c); a stale session pre-first-attempt
      // has null.
      transferOutcome: null,
      updatedAt: "2026-01-01T00:00:00Z",
    };
    localStorage.setItem(
      "relay:case-session:canada-us-supplier",
      JSON.stringify(stale),
    );
    const recovered = loadCaseSession(CASE_ID);
    expect(recovered).not.toBeNull();
    expect(recovered!.firstAttempt).toBeNull();
    expect(recovered!.draft).toEqual(EMPTY_DRAFT);
    expect(recovered!.caseRevision).toBe(CASE_REVISION);
  });

  it("returns null for a session whose schemaVersion is missing", () => {
    localStorage.setItem(
      "relay:case-session:canada-us-supplier",
      JSON.stringify({ caseId: CASE_ID, caseRevision: CASE_REVISION }),
    );
    expect(loadCaseSession(CASE_ID)).toBeNull();
  });

  it("Piece 5c: tolerates an OLD session persisted WITHOUT transferOutcome (treats missing as null)", () => {
    // The transferOutcome field is additive — older persisted sessions (from
    // Piece 5b) lack the field entirely. loadCaseSession must NOT crash and
    // must surface null (not undefined) so the debrief can branch on a stable
    // "no transfer outcome" value.
    const staleRevision = "2099-01-01-stale";
    const staleFirstAttempt = {
      draft: filledDraft(),
      outcome: VALID_OUTCOME,
      submittedAt: "2026-01-01T00:00:00Z",
    };
    // Build an "old" payload that has every Piece 5b field but no
    // transferOutcome key at all.
    const oldPayload = {
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRevision: staleRevision,
      status: "in_progress",
      phase: "recommend",
      requestedFactIds: [],
      draft: filledDraft(),
      firstAttempt: staleFirstAttempt,
      revisedAttempt: null,
      openedReferenceIds: [],
      updatedAt: "2026-01-01T00:00:00Z",
    };
    localStorage.setItem(
      "relay:case-session:canada-us-supplier",
      JSON.stringify(oldPayload),
    );

    const recovered = loadCaseSession(CASE_ID)!;
    expect(recovered).not.toBeNull();
    // Defensive normalization: undefined → null so the debrief can branch on
    // `transferOutcome === null` cleanly.
    expect(recovered.transferOutcome).toBeNull();
  });
});

// ─── Store: clearCaseDraft (only the selected case is cleared) ───────────────

describe("clearCaseDraft", () => {
  it("removes the stored session for the given case only", () => {
    const a = startedSession();
    const b: CaseSession = { ...a, caseId: CASE_ID }; // same id space; we use a sibling key below
    saveCaseSession(a);
    // store a sibling key to prove isolation
    localStorage.setItem("relay:case-session:other-case", JSON.stringify(b));
    localStorage.setItem("relay:preferences", JSON.stringify({ schemaVersion: 1 }));

    clearCaseDraft(CASE_ID);

    expect(loadCaseSession(CASE_ID)).toBeNull();
    // sibling case and unrelated keys survive
    expect(localStorage.getItem("relay:case-session:other-case")).not.toBeNull();
    expect(localStorage.getItem("relay:preferences")).not.toBeNull();
  });

  it("does not throw when there is nothing to clear", () => {
    expect(() => clearCaseDraft(CASE_ID)).not.toThrow();
  });
});

// ─── Store: save failure surfacing ──────────────────────────────────────────

describe("saveCaseSession — recoverable save failure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns reason:quota on QuotaExceededError (does NOT throw, does NOT silently drop)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const result = saveCaseSession(startedSession());
    expect(result).toEqual({ ok: false, reason: "quota" });
  });

  it("returns reason:unavailable on SecurityError", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const result = saveCaseSession(startedSession());
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns ok:true on a successful write", () => {
    const result = saveCaseSession(startedSession());
    expect(result).toEqual({ ok: true });
  });
});

// ─── Store: updateRequestedFacts invalidation ───────────────────────────────

describe("updateRequestedFacts", () => {
  it("clears shortlist, selectedRail, reasons, customerExplanation, and outcomes while retaining the case shell", () => {
    const session = caseReducer(
      caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() }),
      { type: "send-recommendation", outcome: VALID_OUTCOME, submittedAt: "2026-07-01T10:00:00Z" },
    );
    saveCaseSession(session);

    const result = updateRequestedFacts(CASE_ID, ["price-sensitivity", "tracking-need"]);
    expect(result.firstAffectedControlId).not.toBeNull();

    const after = loadCaseSession(CASE_ID)!;
    // case shell retained
    expect(after.caseId).toBe(CASE_ID);
    expect(after.caseRevision).toBe(CASE_REVISION);
    expect(after.schemaVersion).toBe(1);
    // requested facts updated to the new set
    expect(after.requestedFactIds).toEqual(["price-sensitivity", "tracking-need"]);
    // recommendation-specific draft fields cleared
    expect(after.draft.shortlist).toEqual([]);
    expect(after.draft.selectedRail).toBeNull();
    expect(after.draft.reasons).toEqual([]);
    // customerExplanation names the selected rail, so it's stale after a
    // shortlist invalidation and is cleared alongside the rail fields.
    expect(after.draft.customerExplanation).toBe("");
    // The three expectation fields describe rail PROPERTIES (not specific
    // rails), so they survive the invalidation — softer prose stays.
    expect(after.draft.priceExpectation).toBe(session.draft.priceExpectation);
    expect(after.draft.arrivalExpectation).toBe(session.draft.arrivalExpectation);
    expect(after.draft.trackingExpectation).toBe(session.draft.trackingExpectation);
    // conditions also survive (learner's prose, not rail-derived)
    expect(after.draft.conditions).toEqual(session.draft.conditions);
    // stale outcomes cleared (they depended on now-invalid facts)
    expect(after.firstAttempt).toBeNull();
    expect(after.revisedAttempt).toBeNull();
  });

  it("returns a stable control id for the shortlist control", () => {
    const session = caseReducer(startedSession(), { type: "edit-draft", patch: filledDraft() });
    saveCaseSession(session);
    const result = updateRequestedFacts(CASE_ID, ["price-sensitivity"]);
    // convention: the first affected control is the shortlist, id "case-shortlist"
    expect(result.firstAffectedControlId).toBe("case-shortlist");
  });

  it("returns { firstAffectedControlId: null } when no session exists", () => {
    const result = updateRequestedFacts(CASE_ID, ["a"]);
    expect(result).toEqual({ firstAffectedControlId: null });
    // no session created as a side effect
    expect(loadCaseSession(CASE_ID)).toBeNull();
  });

  it("returns { firstAffectedControlId: null } when there is nothing material to invalidate", () => {
    // fresh started session with empty shortlist and no attempts
    const session = startedSession();
    saveCaseSession(session);
    const result = updateRequestedFacts(CASE_ID, ["price-sensitivity"]);
    expect(result).toEqual({ firstAffectedControlId: null });
  });
});
