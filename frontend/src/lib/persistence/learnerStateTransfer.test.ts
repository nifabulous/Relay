import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialCaseSession, saveCaseSession } from "../../features/learn/cases/caseStore";
import * as caseCatalog from "../../features/learn/cases/caseCatalog";
import { savePracticeState } from "../../features/learn/practice/practiceStore";
import type { RelayLearnerExportEnvelope, RelayLocalProfile } from "./learnerStateTypes";
import {
  createLearningExport,
  importLearningExport,
  loadLearningState,
} from "./learnerStateTransfer";
import {
  loadOrCreateLocalProfile,
  restoreLearningStorage,
  saveProgress,
  snapshotLearningStorage,
} from "./storage";

const { CASE_CATALOG, supplierCase } = caseCatalog;
const secondCaseId = CASE_CATALOG[1]!.id;

beforeEach(() => {
  localStorage.clear();
});

function makeProfile(overrides: Partial<RelayLocalProfile> = {}): RelayLocalProfile {
  return {
    schemaVersion: 1,
    profileId: "local-profile",
    createdAt: 1_754_600_000_000,
    updatedAt: 1_754_700_000_000,
    ...overrides,
  };
}

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
        completedModuleIds: ["lab-1", "lab-2"],
      },
      practice: {
        schemaVersion: 1,
        streak: 4,
        bestStreak: 5,
        lastPracticeDay: "2026-08-10",
        missed: [{ questionId: "q-import", dueDay: "2026-08-11", misses: 2 }],
        history: [{ day: "2026-08-10", correct: 5, total: 6 }],
      },
      activity: {
        schemaVersion: 1,
        entries: [{ type: "module", label: "Completed Lab 2", at: 1_754_800_000_000 }],
      },
      cases: {
        [supplierCase.id]: makeCaseSession(supplierCase.id, "2026-08-10T10:00:00.000Z"),
        [secondCaseId]: makeCaseSession(secondCaseId, "2026-08-10T12:00:00.000Z"),
      },
    },
    ...overrides,
  };
}

function seedLocalLearningState() {
  localStorage.setItem("relay:profile", JSON.stringify(makeProfile()));
  saveProgress({
    schemaVersion: 1,
    completedModuleIds: ["lab-1"],
  });
  savePracticeState({
    schemaVersion: 1,
    streak: 2,
    bestStreak: 2,
    lastPracticeDay: "2026-08-09",
    missed: [{ questionId: "q-local", dueDay: "2026-08-10", misses: 1 }],
    history: [{ day: "2026-08-09", correct: 4, total: 5 }],
  });
  localStorage.setItem(
    "relay:activity",
    JSON.stringify({
      schemaVersion: 1,
      entries: [{ type: "module", label: "Completed Lab 1", at: 1_754_700_000_000 }],
    }),
  );
  saveCaseSession(makeCaseSession(supplierCase.id, "2026-08-09T10:00:00.000Z"));
}

describe("learner state transfer primitives", () => {
  it("creates one anonymous profile and does not regenerate it", () => {
    const first = loadOrCreateLocalProfile();
    const second = loadOrCreateLocalProfile();

    expect(first.profile.profileId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(second.profile.profileId).toBe(first.profile.profileId);
  });

  it("keeps a session-only profile id stable within the open tab when persistence is unavailable", () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === "relay:profile") {
        throw { name: "SecurityError" };
      }
      return setItem.call(this, key, value);
    });

    const first = loadOrCreateLocalProfile();
    const second = loadOrCreateLocalProfile();

    expect(first.persistence).toBe("session-only");
    expect(second.persistence).toBe("session-only");
    expect(second.profile.profileId).toBe(first.profile.profileId);
  });

  it("snapshots missing keys as null", () => {
    localStorage.setItem(
      "relay:progress",
      JSON.stringify({ schemaVersion: 1, completedModuleIds: ["lab-1"] }),
    );

    const snapshot = snapshotLearningStorage();

    expect(snapshot.entries).toContainEqual({
      key: "relay:practice",
      rawValue: null,
    });
  });

  it("preserves an existing relay:progress raw string in the snapshot", () => {
    const progressRaw =
      '{"schemaVersion":1,"completedModuleIds":["lab-1"],"note":"keep me verbatim"}';
    localStorage.setItem("relay:progress", progressRaw);

    const snapshot = snapshotLearningStorage();

    expect(snapshot.entries).toContainEqual({
      key: "relay:progress",
      rawValue: progressRaw,
    });
  });

  it("ignores disallowed snapshot keys during restore", () => {
    localStorage.setItem("relay:preferences", '{"schemaVersion":1,"reducedMotion":false}');

    const result = restoreLearningStorage({
      entries: [
        { key: "relay:preferences", rawValue: '{"schemaVersion":1,"reducedMotion":true}' },
        { key: "relay:draft:abc", rawValue: '{"schemaVersion":1,"id":"abc"}' },
        { key: "relay:custom", rawValue: "should not be written" },
        { key: "relay:progress", rawValue: '{"schemaVersion":1,"completedModuleIds":["lab-2"]}' },
      ],
    });

    expect(result).toEqual({ ok: true });
    expect(localStorage.getItem("relay:preferences")).toBe(
      '{"schemaVersion":1,"reducedMotion":false}',
    );
    expect(localStorage.getItem("relay:draft:abc")).toBeNull();
    expect(localStorage.getItem("relay:custom")).toBeNull();
    expect(localStorage.getItem("relay:progress")).toBe(
      '{"schemaVersion":1,"completedModuleIds":["lab-2"]}',
    );
  });

  it("loads only portable learning state and warns about unknown or corrupt case keys", () => {
    seedLocalLearningState();
    localStorage.setItem("relay:preferences", '{"schemaVersion":1,"reducedMotion":true}');
    localStorage.setItem("relay:draft:payment-1", '{"schemaVersion":1,"id":"payment-1"}');
    localStorage.setItem(
      "relay:case-session:unknown-case",
      JSON.stringify({
        ...makeCaseSession(supplierCase.id, "2026-08-08T10:00:00.000Z"),
        caseId: "unknown-case",
      }),
    );
    localStorage.setItem(`relay:case-session:${secondCaseId}`, "{nope");

    const loaded = loadLearningState();

    expect(loaded.persistence).toBe("persistent");
    expect(loaded.state.profile.profileId).toBe("local-profile");
    expect(Object.keys(loaded.state.cases)).toEqual([supplierCase.id]);
    expect(loaded.warnings).toEqual([
      "Ignored unknown case-session key: unknown-case.",
      `Ignored unreadable case-session key: ${secondCaseId}.`,
    ]);
  });

  it("creates an export with only the portable learning domains", () => {
    seedLocalLearningState();
    localStorage.setItem("relay:preferences", '{"schemaVersion":1,"reducedMotion":true}');
    localStorage.setItem(
      "relay:draft:payment-1",
      '{"schemaVersion":1,"id":"payment-1","amount":"100.00"}',
    );

    const envelope = createLearningExport(1_754_900_000_000);
    const serialized = JSON.stringify(envelope);

    expect(envelope).toEqual({
      format: "relay-learner-state",
      formatVersion: 1,
      exportedAt: 1_754_900_000_000,
      sourceProfileId: "local-profile",
      state: {
        progress: {
          schemaVersion: 1,
          completedModuleIds: ["lab-1"],
        },
        practice: {
          schemaVersion: 1,
          streak: 2,
          bestStreak: 2,
          lastPracticeDay: "2026-08-09",
          missed: [{ questionId: "q-local", dueDay: "2026-08-10", misses: 1 }],
          history: [{ day: "2026-08-09", correct: 4, total: 5 }],
        },
        activity: {
          schemaVersion: 1,
          entries: [{ type: "module", label: "Completed Lab 1", at: 1_754_700_000_000 }],
        },
        cases: {
          [supplierCase.id]: makeCaseSession(supplierCase.id, "2026-08-09T10:00:00.000Z"),
        },
      },
    });
    expect(serialized).not.toContain("reducedMotion");
    expect(serialized).not.toContain("payment-1");
    expect(serialized).not.toContain("100.00");
  });

  it("rejects an invalid import before writing to browser storage", () => {
    seedLocalLearningState();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const result = importLearningExport([]);

    expect(result).toEqual({
      ok: false,
      phase: "validate",
      message: "Import payload must be a plain object.",
    });
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("merges a same-profile import, adds completions, creates missing cases, and refreshes updatedAt", () => {
    seedLocalLearningState();
    const localProfile = makeProfile();
    const envelope = makeEnvelope({ sourceProfileId: localProfile.profileId });

    const result = importLearningExport(envelope);

    expect(result).toEqual({
      ok: true,
      report: {
        completedModulesAdded: 1,
        casesImported: 2,
        casesRetained: 0,
        activityEntriesAdded: 1,
        ignoredIds: [],
      },
    });
    expect(JSON.parse(localStorage.getItem("relay:progress") ?? "null")).toEqual({
      schemaVersion: 1,
      completedModuleIds: ["lab-1", "lab-2"],
    });
    expect(JSON.parse(localStorage.getItem("relay:activity") ?? "null")).toEqual({
      schemaVersion: 1,
      entries: [
        { type: "module", label: "Completed Lab 2", at: 1_754_800_000_000 },
        { type: "module", label: "Completed Lab 1", at: 1_754_700_000_000 },
      ],
    });
    expect(localStorage.getItem(`relay:case-session:${secondCaseId}`)).not.toBeNull();
    const profile = JSON.parse(localStorage.getItem("relay:profile") ?? "null");
    expect(profile.profileId).toBe(localProfile.profileId);
    expect(profile.updatedAt).toBeGreaterThan(localProfile.updatedAt);
  });

  it("restores the exact raw learning snapshot when a write fails after an earlier write succeeds", () => {
    seedLocalLearningState();
    const originalProgress =
      '{"schemaVersion":1,"completedModuleIds":["lab-1"],"note":"keep me verbatim"}';
    localStorage.setItem("relay:progress", originalProgress);
    const setItem = Storage.prototype.setItem;
    let practiceWriteAttempts = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === "relay:practice") {
        practiceWriteAttempts += 1;
        if (practiceWriteAttempts === 1) {
          throw { name: "QuotaExceededError" };
        }
      }
      return setItem.call(this, key, value);
    });

    const result = importLearningExport(makeEnvelope());

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      phase: "write",
      message: expect.stringContaining("restored"),
    });
    expect(localStorage.getItem("relay:progress")).toBe(originalProgress);
    expect(localStorage.getItem(`relay:case-session:${secondCaseId}`)).toBeNull();
  });

  it("reports rollback when restoration cannot rewrite the original snapshot", () => {
    seedLocalLearningState();
    const setItem = Storage.prototype.setItem;
    let practiceWriteAttempts = 0;
    let progressWriteAttempts = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === "relay:practice") {
        practiceWriteAttempts += 1;
        if (practiceWriteAttempts === 1) {
          throw { name: "QuotaExceededError" };
        }
      }
      if (key === "relay:progress") {
        progressWriteAttempts += 1;
        if (progressWriteAttempts === 2) {
          throw { name: "SecurityError" };
        }
      }
      return setItem.call(this, key, value);
    });

    const result = importLearningExport(makeEnvelope());

    expect(result).toEqual({
      ok: false,
      phase: "rollback",
      message: "Import failed while writing learning state, and Relay could not fully restore the previous snapshot.",
    });
  });
});
