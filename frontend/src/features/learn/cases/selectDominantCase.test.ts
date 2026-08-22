import { describe, expect, it } from "vitest";
import { CASE_CATALOG } from "./caseCatalog";
import { createInitialCaseSession, type CaseSession } from "./caseStore";
import { selectDominantCase, type CaseEntrySnapshot } from "./selectDominantCase";

const [firstDefinition, secondDefinition, thirdDefinition] = CASE_CATALOG;

function entry(
  definition = firstDefinition,
  session: CaseSession | null = null,
  index = 0,
): CaseEntrySnapshot {
  return { definition, session, index };
}

function session(
  caseId: string,
  status: CaseSession["status"],
  updatedAt: string,
): CaseSession {
  return { ...createInitialCaseSession(caseId), status, updatedAt };
}

describe("selectDominantCase", () => {
  it("selects the newest in-progress session", () => {
    const entries = [
      entry(firstDefinition, session(firstDefinition.id, "in_progress", "2026-08-20T10:00:00Z"), 0),
      entry(secondDefinition, session(secondDefinition.id, "in_progress", "2026-08-21T10:00:00Z"), 1),
    ];

    expect(selectDominantCase(entries)).toBe(entries[1]);
  });

  it("treats missing and invalid timestamps as older than valid timestamps", () => {
    const runtimeMissingTimestamp = Object.fromEntries(
      Object.entries(session(firstDefinition.id, "in_progress", "")).filter(
        ([key]) => key !== "updatedAt",
      ),
    ) as CaseSession;
    const entries = [
      entry(firstDefinition, runtimeMissingTimestamp, 0),
      entry(secondDefinition, session(secondDefinition.id, "in_progress", ""), 1),
      entry(thirdDefinition, session(thirdDefinition.id, "in_progress", "2026-08-19T10:00:00Z"), 2),
    ];

    expect(selectDominantCase(entries)).toBe(entries[2]);
  });

  it("preserves catalog order when in-progress timestamps are equal or unavailable", () => {
    const equalTimestampEntries = [
      entry(secondDefinition, session(secondDefinition.id, "in_progress", "2026-08-20T10:00:00Z"), 1),
      entry(firstDefinition, session(firstDefinition.id, "in_progress", "2026-08-20T10:00:00Z"), 0),
    ];
    const unavailableTimestampEntries = [
      entry(firstDefinition, session(firstDefinition.id, "in_progress", ""), 0),
      entry(secondDefinition, session(secondDefinition.id, "in_progress", "invalid"), 1),
    ];

    expect(selectDominantCase(equalTimestampEntries)).toBe(equalTimestampEntries[1]);
    expect(selectDominantCase(unavailableTimestampEntries)).toBe(unavailableTimestampEntries[0]);
  });

  it("falls back to the first fresh entry in catalog order", () => {
    const entries = [
      entry(secondDefinition, session(secondDefinition.id, "not_started", ""), 1),
      entry(firstDefinition, null, 0),
    ];

    expect(selectDominantCase(entries)).toBe(entries[1]);
  });

  it("does not let a catalog-level under-review in-progress case dominate fresh work", () => {
    const underReview = { ...firstDefinition, reviewStatus: "under_review" as const };
    const entries = [
      entry(underReview, session(firstDefinition.id, "in_progress", "2026-08-22T10:00:00Z"), 0),
      entry(secondDefinition, null, 1),
    ];

    expect(selectDominantCase(entries)).toBe(entries[1]);
  });

  it("excludes catalog-level under-review entries from fresh fallback", () => {
    const underReview = { ...firstDefinition, reviewStatus: "under_review" as const };
    const entries = [entry(underReview, null, 0), entry(secondDefinition, null, 1)];

    expect(selectDominantCase(entries)).toBe(entries[1]);
  });

  it("falls back to the newest completed session for review", () => {
    const entries = [
      entry(firstDefinition, session(firstDefinition.id, "completed", "2026-08-18T10:00:00Z"), 0),
      entry(secondDefinition, session(secondDefinition.id, "completed", "2026-08-21T10:00:00Z"), 1),
    ];

    expect(selectDominantCase(entries)).toBe(entries[1]);
  });

  it("returns null for empty input or when all entries are unavailable", () => {
    const underReview = { ...firstDefinition, reviewStatus: "under_review" as const };

    expect(selectDominantCase([])).toBeNull();
    expect(selectDominantCase([entry(underReview, null, 0)])).toBeNull();
  });
});
