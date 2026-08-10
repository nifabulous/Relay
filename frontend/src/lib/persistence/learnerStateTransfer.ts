import { getCaseById } from "../../features/learn/cases/caseCatalog";
import {
  loadCaseSession,
  saveCaseSession,
  type CaseSession,
} from "../../features/learn/cases/caseStore";
import { loadPracticeState } from "../../features/learn/practice/practiceStore";
import {
  mergeLearningState,
  RELAY_LEARNER_EXPORT_MAX_BYTES,
  validateLearningExport,
} from "./learnerStateMerge";
import type {
  LoadedLearningState,
  MergeReport,
  RelayLearnerExportEnvelope,
  RelayLearningState,
} from "./learnerStateTypes";
import {
  listLearningStorageKeys,
  loadActivity,
  loadOrCreateLocalProfile,
  loadProgress,
  restoreLearningStorage,
  saveVersioned,
  snapshotLearningStorage,
  type SaveResult,
} from "./storage";

type SaveFailureReason = Extract<SaveResult, { ok: false }>["reason"];

const PROFILE_KEY = "relay:profile";
const PROGRESS_KEY = "relay:progress";
const PRACTICE_KEY = "relay:practice";
const ACTIVITY_KEY = "relay:activity";
const CASE_SESSION_PREFIX = "relay:case-session:";

export type TransferResult =
  | { ok: true; report: MergeReport }
  | { ok: false; phase: "read" | "validate" | "write" | "rollback"; message: string };

export { RELAY_LEARNER_EXPORT_MAX_BYTES, validateLearningExport };

export function loadLearningState(): LoadedLearningState {
  const profileResult = loadOrCreateLocalProfile();
  const warnings: string[] = [];
  const cases: Record<string, CaseSession> = {};

  for (const key of listLearningStorageKeys()) {
    if (!key.startsWith(CASE_SESSION_PREFIX)) {
      continue;
    }

    const caseId = key.slice(CASE_SESSION_PREFIX.length);
    if (!caseId) {
      continue;
    }
    if (!getCaseById(caseId)) {
      warnings.push(`Ignored unknown case-session key: ${caseId}.`);
      continue;
    }

    const session = loadCaseSession(caseId);
    if (!session) {
      warnings.push(`Ignored unreadable case-session key: ${caseId}.`);
      continue;
    }
    cases[caseId] = session;
  }

  return {
    state: {
      profile: profileResult.profile,
      progress: loadProgress(),
      practice: loadPracticeState(),
      activity: loadActivity(),
      cases,
    },
    persistence: profileResult.persistence,
    warnings,
  };
}

export function createLearningExport(now = Date.now()): RelayLearnerExportEnvelope {
  const loaded = loadLearningState();
  return {
    format: "relay-learner-state",
    formatVersion: 1,
    exportedAt: now,
    sourceProfileId: loaded.state.profile.profileId,
    state: {
      progress: loaded.state.progress,
      practice: loaded.state.practice,
      activity: loaded.state.activity,
      cases: loaded.state.cases,
    },
  };
}

export function importLearningExport(input: unknown): TransferResult {
  const validated = validateLearningExport(input);
  if (!validated.ok) {
    return {
      ok: false,
      phase: "validate",
      message: validated.message,
    };
  }

  try {
    const current = loadLearningState();
    const snapshot = snapshotLearningStorage(caseKeysForSnapshot(validated.value));
    const merged = mergeLearningState(current.state, validated.value);
    const writeResult = writeLearningState({
      ...merged.state,
      profile: {
        ...merged.state.profile,
        updatedAt: Date.now(),
      },
    });

    if (writeResult.ok) {
      return { ok: true, report: merged.report };
    }

    return rollbackAfterWriteFailure(snapshot, writeResult.reason);
  } catch {
    return {
      ok: false,
      phase: "read",
      message: "Relay could not load the current learning state.",
    };
  }
}

function caseKeysForSnapshot(envelope: RelayLearnerExportEnvelope): string[] {
  return Object.keys(envelope.state.cases).map((caseId) => `${CASE_SESSION_PREFIX}${caseId}`);
}

function writeLearningState(state: RelayLearningState): SaveResult {
  const fixedWrites: Array<[key: string, value: unknown]> = [
    [PROGRESS_KEY, state.progress],
    [PRACTICE_KEY, state.practice],
    [ACTIVITY_KEY, state.activity],
  ];

  for (const [key, value] of fixedWrites) {
    const result = saveVersioned(key, value);
    if (!result.ok) {
      return result;
    }
  }

  for (const session of Object.values(state.cases)) {
    const result = saveCaseSession(session);
    if (!result.ok) {
      return result;
    }
  }

  return saveVersioned(PROFILE_KEY, state.profile);
}

function rollbackAfterWriteFailure(
  snapshot: ReturnType<typeof snapshotLearningStorage>,
  reason: SaveFailureReason,
): TransferResult {
  const restored = restoreLearningStorage(snapshot);
  if (!restored.ok) {
    return {
      ok: false,
      phase: "rollback",
      message:
        "Import failed while writing learning state, and Relay could not fully restore the previous snapshot.",
    };
  }

  return {
    ok: false,
    phase: "write",
    message: `Import failed while writing learning state (${reason}), but Relay restored the previous learning snapshot.`,
  };
}
