import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialCaseSession } from "../../features/learn/cases/caseStore";
import * as caseCatalog from "../../features/learn/cases/caseCatalog";
import type { RelayLearnerExportEnvelope, RelayLearningState } from "./learnerStateTypes";
import { mergeLearningState, validateLearningExport } from "./learnerStateMerge";

const { CASE_CATALOG, supplierCase } = caseCatalog;
const secondCaseId = CASE_CATALOG[1]!.id;

function makeCaseSession(caseId = supplierCase.id, updatedAt = "2026-08-10T10:00:00.000Z") {
  return {
    ...createInitialCaseSession(caseId),
    status: "in_progress" as const,
    phase: "investigate" as const,
    updatedAt,
  };
}

function makeEnvelope(
  overrides: Partial<RelayLearnerExportEnvelope> = {},
): RelayLearnerExportEnvelope {
  return {
    format: "relay-learner-state",
    formatVersion: 1,
    exportedAt: 1_754_821_200_000,
    sourceProfileId: "imported-profile",
    state: {
      progress: {
        schemaVersion: 1,
        completedModuleIds: ["lab-1"],
      },
      practice: {
        schemaVersion: 1,
        streak: 1,
        bestStreak: 1,
        lastPracticeDay: "2026-08-09",
        missed: [{ questionId: "q-1", dueDay: "2026-08-10", misses: 1 }],
        history: [{ day: "2026-08-09", correct: 4, total: 5 }],
      },
      activity: {
        schemaVersion: 1,
        entries: [{ type: "module", label: "Completed Lab 1", at: 1_754_700_000_000 }],
      },
      cases: {
        [supplierCase.id]: makeCaseSession(),
      },
    },
    ...overrides,
  };
}

function makeLocalState(overrides: Partial<RelayLearningState> = {}): RelayLearningState {
  return {
    profile: {
      schemaVersion: 1,
      profileId: "local-profile",
      createdAt: 1_754_600_000_000,
      updatedAt: 1_754_700_000_000,
    },
    progress: {
      schemaVersion: 1,
      completedModuleIds: ["lab-1"],
    },
    practice: {
      schemaVersion: 1,
      streak: 2,
      bestStreak: 2,
      lastPracticeDay: "2026-08-09",
      missed: [{ questionId: "q-1", dueDay: "2026-08-10", misses: 1 }],
      history: [{ day: "2026-08-09", correct: 4, total: 5 }],
    },
    activity: {
      schemaVersion: 1,
      entries: [{ type: "module", label: "Completed Lab 1", at: 1_754_700_000_000 }],
    },
    cases: {
      [supplierCase.id]: makeCaseSession(supplierCase.id, "2026-08-09T10:00:00.000Z"),
    },
    ...overrides,
  };
}

describe("validateLearningExport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a valid export envelope", () => {
    expect(validateLearningExport(makeEnvelope())).toEqual({
      ok: true,
      value: makeEnvelope(),
    });
  });

  it("rejects the wrong format", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      format: "not-relay",
    });

    expect(result).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("rejects an unsupported formatVersion", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      formatVersion: 2,
    });

    expect(result).toMatchObject({ ok: false, reason: "unsupported-version" });
  });

  it("rejects missing state fields", () => {
    const envelope = makeEnvelope();
    const result = validateLearningExport({
      ...envelope,
      state: {
        progress: envelope.state.progress,
        activity: envelope.state.activity,
        cases: envelope.state.cases,
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("rejects unknown module ids", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        progress: {
          schemaVersion: 1,
          completedModuleIds: ["lab-1", "lab-nope"],
        },
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("rejects malformed case sessions", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        cases: {
          [supplierCase.id]: {
            ...makeCaseSession(),
            caseId: secondCaseId,
          },
        },
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("rejects malformed case-session updatedAt timestamps", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        cases: {
          [supplierCase.id]: {
            ...makeCaseSession(),
            updatedAt: "2026-08-10 10:00:00",
          },
        },
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("rejects imported case sessions whose updatedAt is the legacy empty string", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        cases: {
          [supplierCase.id]: {
            ...makeCaseSession(),
            updatedAt: "",
          },
        },
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("preserves valid legacy case-session timestamps by normalizing them for merge ordering", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        cases: {
          [supplierCase.id]: {
            ...makeCaseSession(),
            updatedAt: "2026-08-10T10:00:00Z",
          },
        },
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        ...makeEnvelope(),
        state: {
          ...makeEnvelope().state,
          cases: {
            [supplierCase.id]: {
              ...makeCaseSession(),
              updatedAt: "2026-08-10T10:00:00.000Z",
            },
          },
        },
      },
    });
  });

  it("rejects non-integer practice counters", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        practice: {
          ...makeEnvelope().state.practice,
          streak: 1.5,
        },
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("rejects oversized payloads", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      sourceProfileId: "x".repeat(2_000_000),
    });

    expect(result).toMatchObject({ ok: false, reason: "oversized" });
  });

  it("rejects too many completed module ids", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        progress: {
          schemaVersion: 1,
          completedModuleIds: Array.from({ length: 65 }, (_, index) => `lab-${(index % 9) + 1}`),
        },
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("rejects too many missed practice entries", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        practice: {
          ...makeEnvelope().state.practice,
          missed: Array.from({ length: 101 }, (_, index) => ({
            questionId: `q-${index}`,
            dueDay: "2026-08-10",
            misses: 1,
          })),
        },
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("rejects too many practice history entries", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        practice: {
          ...makeEnvelope().state.practice,
          history: Array.from({ length: 31 }, (_, index) => ({
            day: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
            correct: 4,
            total: 5,
          })),
        },
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("rejects too many activity entries", () => {
    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        activity: {
          schemaVersion: 1,
          entries: Array.from({ length: 21 }, (_, index) => ({
            type: "module" as const,
            label: `Activity ${index}`,
            at: 1_754_700_000_000 + index,
          })),
        },
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("rejects too many cases", () => {
    vi.spyOn(caseCatalog, "getCaseById").mockImplementation((caseId: string) => {
      if (caseId.startsWith("synthetic-case-")) return supplierCase;
      return CASE_CATALOG.find((candidate) => candidate.id === caseId);
    });

    const result = validateLearningExport({
      ...makeEnvelope(),
      state: {
        ...makeEnvelope().state,
        cases: Object.fromEntries(
          Array.from({ length: 33 }, (_, index) => [
            `synthetic-case-${index}`,
            {
              ...makeCaseSession(),
              caseId: `synthetic-case-${index}`,
            },
          ]),
        ),
      },
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid-record" });
  });
});

describe("mergeLearningState", () => {
  it("unions modules and keeps the local profile id", () => {
    const local = makeLocalState();
    const imported = makeEnvelope({
      sourceProfileId: "remote-profile",
      state: {
        ...makeEnvelope().state,
        progress: { schemaVersion: 1, completedModuleIds: ["lab-1", "lab-2", "lab-3"] },
      },
    });

    const merged = mergeLearningState(local, imported);

    expect(merged.state.profile.profileId).toBe("local-profile");
    expect(merged.state.progress.completedModuleIds).toEqual(["lab-1", "lab-2", "lab-3"]);
    expect(merged.report.completedModulesAdded).toBe(2);
  });

  it("keeps the newest case session by updatedAt and reports retained older imports", () => {
    const local = makeLocalState({
      cases: {
        [supplierCase.id]: makeCaseSession(supplierCase.id, "2026-08-10T12:00:00.000Z"),
      },
    });
    const imported = makeEnvelope({
      state: {
        ...makeEnvelope().state,
        cases: {
          [supplierCase.id]: makeCaseSession(supplierCase.id, "2026-08-10T09:00:00.000Z"),
          [secondCaseId]: makeCaseSession(
            secondCaseId,
            "2026-08-10T11:00:00.000Z",
          ),
        },
      },
    });

    const merged = mergeLearningState(local, imported);

    expect(merged.state.cases[supplierCase.id].updatedAt).toBe("2026-08-10T12:00:00.000Z");
    expect(merged.state.cases[secondCaseId].updatedAt).toBe(
      "2026-08-10T11:00:00.000Z",
    );
    expect(merged.report.casesImported).toBe(1);
    expect(merged.report.casesRetained).toBe(1);
    expect(merged.report.ignoredIds).toContain(supplierCase.id);
  });

  it("keeps the local case session when updatedAt values are equal", () => {
    const local = makeLocalState({
      cases: {
        [supplierCase.id]: {
          ...makeCaseSession(supplierCase.id, "2026-08-10T12:00:00.000Z"),
          diagnosis: "keep-local",
        },
      },
    });
    const imported = makeEnvelope({
      state: {
        ...makeEnvelope().state,
        cases: {
          [supplierCase.id]: {
            ...makeCaseSession(supplierCase.id, "2026-08-10T12:00:00.000Z"),
            diagnosis: "imported-loses",
          },
        },
      },
    });

    const merged = mergeLearningState(local, imported);

    expect(merged.state.cases[supplierCase.id].diagnosis).toBe("keep-local");
    expect(merged.report.casesImported).toBe(0);
    expect(merged.report.casesRetained).toBe(1);
    expect(merged.report.ignoredIds).toContain(supplierCase.id);
  });

  it("deduplicates activity exactly and caps the merged log", () => {
    const local = makeLocalState({
      activity: {
        schemaVersion: 1,
        entries: Array.from({ length: 20 }, (_, index) => ({
          type: "module" as const,
          label: `Local ${index}`,
          at: 200 - index,
        })),
      },
    });
    const imported = makeEnvelope({
      state: {
        ...makeEnvelope().state,
        activity: {
          schemaVersion: 1,
          entries: [
            { type: "module", label: "Imported newest", at: 500 },
            { type: "module", label: "Local 0", at: 200 },
            { type: "module", label: "Imported too old", at: 1 },
          ],
        },
      },
    });

    const merged = mergeLearningState(local, imported);

    expect(merged.state.activity.entries).toHaveLength(20);
    expect(merged.state.activity.entries[0]).toEqual({
      type: "module",
      label: "Imported newest",
      at: 500,
    });
    expect(merged.state.activity.entries.some((entry) => entry.label === "Imported too old")).toBe(
      false,
    );
    expect(merged.report.activityEntriesAdded).toBe(1);
  });

  it("deduplicates practice history and resolves missed-question conflicts deterministically", () => {
    const local = makeLocalState({
      practice: {
        schemaVersion: 1,
        streak: 2,
        bestStreak: 2,
        lastPracticeDay: "2026-08-09",
        missed: [
          { questionId: "q-1", dueDay: "2026-08-10", misses: 1 },
          { questionId: "q-2", dueDay: "2026-08-12", misses: 2 },
        ],
        history: [{ day: "2026-08-09", correct: 4, total: 5 }],
      },
    });
    const imported = makeEnvelope({
      state: {
        ...makeEnvelope().state,
        practice: {
          schemaVersion: 1,
          streak: 1,
          bestStreak: 5,
          lastPracticeDay: "2026-08-10",
          missed: [
            { questionId: "q-1", dueDay: "2026-08-13", misses: 2 },
            { questionId: "q-3", dueDay: "2026-08-11", misses: 1 },
          ],
          history: [
            { day: "2026-08-10", correct: 5, total: 5 },
            { day: "2026-08-09", correct: 4, total: 5 },
          ],
        },
      },
    });

    const merged = mergeLearningState(local, imported);

    expect(merged.state.practice.bestStreak).toBe(5);
    expect(merged.state.practice.lastPracticeDay).toBe("2026-08-10");
    expect(merged.state.practice.streak).toBe(1);
    expect(merged.state.practice.history).toEqual([
      { day: "2026-08-10", correct: 5, total: 5 },
      { day: "2026-08-09", correct: 4, total: 5 },
    ]);
    expect(merged.state.practice.missed).toEqual([
      { questionId: "q-1", dueDay: "2026-08-13", misses: 2 },
      { questionId: "q-2", dueDay: "2026-08-12", misses: 2 },
      { questionId: "q-3", dueDay: "2026-08-11", misses: 1 },
    ]);
  });

  it("never lowers the local streak when both practice states have the same lastPracticeDay", () => {
    const local = makeLocalState({
      practice: {
        schemaVersion: 1,
        streak: 5,
        bestStreak: 5,
        lastPracticeDay: "2026-08-10",
        missed: [],
        history: [{ day: "2026-08-10", correct: 5, total: 5 }],
      },
    });
    const imported = makeEnvelope({
      state: {
        ...makeEnvelope().state,
        practice: {
          schemaVersion: 1,
          streak: 2,
          bestStreak: 6,
          lastPracticeDay: "2026-08-10",
          missed: [],
          history: [{ day: "2026-08-10", correct: 4, total: 5 }],
        },
      },
    });

    const merged = mergeLearningState(local, imported);

    expect(merged.state.practice.lastPracticeDay).toBe("2026-08-10");
    expect(merged.state.practice.streak).toBe(5);
    expect(merged.state.practice.bestStreak).toBe(6);
  });
});
