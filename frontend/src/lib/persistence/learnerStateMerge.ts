import { getLabDefinition } from "../../features/learn/labRegistry";
import { parseImportedCaseSessionPayload } from "../../features/learn/cases/caseStore";
import { getCaseById } from "../../features/learn/cases/caseCatalog";
import type { CaseSession } from "../../features/learn/cases/caseStore";
import type { DrillRecord, MissedEntry, PracticeState } from "../../features/learn/practice/practiceStore";
import type { RelayActivityEntry, RelayActivityLog, RelayProgress } from "./storage";
import type {
  ImportValidation,
  MergeReport,
  RelayLearnerExportEnvelope,
  RelayLearningState,
} from "./learnerStateTypes";

type ImportValidationFailure = Extract<ImportValidation, { ok: false }>;

export const RELAY_LEARNER_EXPORT_MAX_BYTES = 1_000_000;
const ACTIVITY_CAP = 20;
const PRACTICE_HISTORY_CAP = 30;
const MAX_COMPLETED_MODULE_IDS = 64;
const MAX_MISSED_QUESTIONS = 100;
const MAX_CASE_SESSIONS = 32;
const MAX_SOURCE_PROFILE_ID_LENGTH = 200;
const MAX_ACTIVITY_LABEL_LENGTH = 200;

export function validateLearningExport(input: unknown): ImportValidation {
  const bytes = estimateImportBytes(input);
  if (bytes === null) {
    return invalid("malformed", "Import payload must be JSON-serializable.");
  }
  if (bytes > RELAY_LEARNER_EXPORT_MAX_BYTES) {
    return invalid("oversized", "Import payload exceeds the Relay learner backup size limit.");
  }
  if (!isPlainObject(input)) {
    return invalid("malformed", "Import payload must be a plain object.");
  }

  if (input.format !== "relay-learner-state") {
    return invalid("malformed", "Import payload has an unknown format.");
  }
  if (input.formatVersion !== 1) {
    return invalid("unsupported-version", "Import payload formatVersion is not supported.");
  }
  if (!isFiniteNumber(input.exportedAt)) {
    return invalid("malformed", "Import payload must include a numeric exportedAt.");
  }
  if (!isBoundedString(input.sourceProfileId, MAX_SOURCE_PROFILE_ID_LENGTH)) {
    return invalid("malformed", "Import payload must include a bounded sourceProfileId.");
  }
  if (!isPlainObject(input.state)) {
    return invalid("malformed", "Import payload must include a state object.");
  }

  const progress = validateProgress(input.state.progress);
  if (!progress.ok) return progress;

  const practice = validatePractice(input.state.practice);
  if (!practice.ok) return practice;

  const activity = validateActivity(input.state.activity);
  if (!activity.ok) return activity;

  const cases = validateCases(input.state.cases);
  if (!cases.ok) return cases;

  return {
    ok: true,
    value: {
      format: "relay-learner-state",
      formatVersion: 1,
      exportedAt: input.exportedAt,
      sourceProfileId: input.sourceProfileId,
      state: {
        progress: progress.value,
        practice: practice.value,
        activity: activity.value,
        cases: cases.value,
      },
    },
  };
}

export function mergeLearningState(
  local: RelayLearningState,
  imported: RelayLearnerExportEnvelope,
): { state: RelayLearningState; report: MergeReport } {
  const progress = mergeProgress(local.progress, imported.state.progress);
  const practice = mergePractice(local.practice, imported.state.practice);
  const activity = mergeActivity(local.activity, imported.state.activity);
  const cases = mergeCases(local.cases, imported.state.cases);

  return {
    state: {
      profile: { ...local.profile },
      progress: progress.state,
      practice,
      activity: activity.state,
      cases: cases.state,
    },
    report: {
      completedModulesAdded: progress.completedModulesAdded,
      casesImported: cases.casesImported,
      casesRetained: cases.casesRetained,
      activityEntriesAdded: activity.activityEntriesAdded,
      ignoredIds: cases.ignoredIds,
    },
  };
}

function validateProgress(value: unknown):
  | { ok: true; value: RelayProgress }
  | { ok: false; reason: ImportValidationFailure["reason"]; message: string } {
  if (!isPlainObject(value)) {
    return invalid("malformed", "Progress must be an object.");
  }
  if (value.schemaVersion !== 1 || !Array.isArray(value.completedModuleIds)) {
    return invalid("malformed", "Progress must include schemaVersion 1 and completedModuleIds.");
  }
  if (value.completedModuleIds.length > MAX_COMPLETED_MODULE_IDS) {
    return invalid("invalid-record", "Import payload includes too many completed module ids.");
  }

  const completedModuleIds: string[] = [];
  for (const moduleId of value.completedModuleIds) {
    if (!isBoundedString(moduleId, 64)) {
      return invalid("invalid-record", "Progress contains an invalid module id.");
    }
    if (!getLabDefinition(moduleId)) {
      return invalid("invalid-record", `Unknown module id: ${moduleId}`);
    }
    completedModuleIds.push(moduleId);
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      completedModuleIds,
    },
  };
}

function validatePractice(value: unknown):
  | { ok: true; value: PracticeState }
  | { ok: false; reason: ImportValidationFailure["reason"]; message: string } {
  if (!isPlainObject(value)) {
    return invalid("malformed", "Practice state must be an object.");
  }
  if (
    value.schemaVersion !== 1 ||
    !isNonNegativeInteger(value.streak) ||
    !isNonNegativeInteger(value.bestStreak) ||
    !(value.lastPracticeDay === null || isDayString(value.lastPracticeDay)) ||
    !Array.isArray(value.missed) ||
    !Array.isArray(value.history)
  ) {
    return invalid("malformed", "Practice state is missing required fields.");
  }
  if (value.missed.length > MAX_MISSED_QUESTIONS) {
    return invalid("invalid-record", "Import payload includes too many missed practice entries.");
  }
  if (value.history.length > PRACTICE_HISTORY_CAP) {
    return invalid("invalid-record", "Import payload includes too much practice history.");
  }

  const missed: MissedEntry[] = [];
  for (const entry of value.missed) {
    if (!isPlainObject(entry)) {
      return invalid("invalid-record", "Practice missed entries must be objects.");
    }
    if (
      !isBoundedString(entry.questionId, 200) ||
      !isDayString(entry.dueDay) ||
      !isNonNegativeInteger(entry.misses)
    ) {
      return invalid("invalid-record", "Practice missed entries must be well formed.");
    }
    missed.push({
      questionId: entry.questionId,
      dueDay: entry.dueDay,
      misses: entry.misses,
    });
  }

  const history: DrillRecord[] = [];
  for (const entry of value.history) {
    if (!isPlainObject(entry)) {
      return invalid("invalid-record", "Practice history entries must be objects.");
    }
    if (
      !isDayString(entry.day) ||
      !isNonNegativeInteger(entry.correct) ||
      !isNonNegativeInteger(entry.total) ||
      entry.correct > entry.total
    ) {
      return invalid("invalid-record", "Practice history entries must be well formed.");
    }
    history.push({
      day: entry.day,
      correct: entry.correct,
      total: entry.total,
    });
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      streak: value.streak,
      bestStreak: value.bestStreak,
      lastPracticeDay: value.lastPracticeDay,
      missed,
      history,
    },
  };
}

function validateActivity(value: unknown):
  | { ok: true; value: RelayActivityLog }
  | { ok: false; reason: ImportValidationFailure["reason"]; message: string } {
  if (!isPlainObject(value)) {
    return invalid("malformed", "Activity log must be an object.");
  }
  if (value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    return invalid("malformed", "Activity log must include schemaVersion 1 and entries.");
  }
  if (value.entries.length > ACTIVITY_CAP) {
    return invalid("invalid-record", "Import payload includes too many activity entries.");
  }

  const entries: RelayActivityEntry[] = [];
  for (const entry of value.entries) {
    if (!isPlainObject(entry)) {
      return invalid("invalid-record", "Activity entries must be objects.");
    }
    if (
      (entry.type !== "module" && entry.type !== "tool") ||
      !isBoundedString(entry.label, MAX_ACTIVITY_LABEL_LENGTH) ||
      !isFiniteNumber(entry.at)
    ) {
      return invalid("invalid-record", "Activity entries must be well formed.");
    }
    entries.push({
      type: entry.type,
      label: entry.label,
      at: entry.at,
    });
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      entries,
    },
  };
}

function validateCases(value: unknown):
  | { ok: true; value: Record<string, CaseSession> }
  | { ok: false; reason: ImportValidationFailure["reason"]; message: string } {
  if (!isPlainObject(value)) {
    return invalid("malformed", "Cases must be an object.");
  }
  if (Object.keys(value).length > MAX_CASE_SESSIONS) {
    return invalid("invalid-record", "Import payload includes too many case sessions.");
  }

  const cases: Record<string, CaseSession> = {};
  for (const [caseId, payload] of Object.entries(value)) {
    if (!isBoundedString(caseId, 200) || !getCaseById(caseId)) {
      return invalid("invalid-record", `Unknown case id: ${caseId}`);
    }
    const parsed = parseImportedCaseSessionPayload(caseId, payload);
    if (!parsed) {
      return invalid("invalid-record", `Invalid case session for ${caseId}.`);
    }
    cases[caseId] = parsed;
  }

  return { ok: true, value: cases };
}

function mergeProgress(local: RelayProgress, imported: RelayProgress) {
  const seen = new Set(local.completedModuleIds);
  const completedModuleIds = [...local.completedModuleIds];
  let completedModulesAdded = 0;

  for (const moduleId of imported.completedModuleIds) {
    if (seen.has(moduleId)) continue;
    seen.add(moduleId);
    completedModuleIds.push(moduleId);
    completedModulesAdded += 1;
  }

  return {
    state: {
      schemaVersion: 1 as const,
      completedModuleIds,
    },
    completedModulesAdded,
  };
}

function mergePractice(local: PracticeState, imported: PracticeState): PracticeState {
  const historyMap = new Map<string, DrillRecord>();
  for (const entry of [...local.history, ...imported.history]) {
    historyMap.set(historyKey(entry), entry);
  }
  const history = Array.from(historyMap.values())
    .sort((left, right) => right.day.localeCompare(left.day))
    .slice(0, PRACTICE_HISTORY_CAP);

  const missedMap = new Map<string, MissedEntry>();
  for (const entry of [...local.missed, ...imported.missed]) {
    const current = missedMap.get(entry.questionId);
    if (!current || compareMissedEntry(entry, current) > 0) {
      missedMap.set(entry.questionId, { ...entry });
    }
  }
  const missed = Array.from(missedMap.values()).sort((left, right) =>
    left.questionId.localeCompare(right.questionId),
  );

  const lastPracticeDay = laterDay(local.lastPracticeDay, imported.lastPracticeDay);
  const streak =
    lastPracticeDay === null
      ? Math.max(local.streak, imported.streak)
      : local.lastPracticeDay === imported.lastPracticeDay &&
          imported.lastPracticeDay === lastPracticeDay
        ? Math.max(local.streak, imported.streak)
        : lastPracticeDay === imported.lastPracticeDay
          ? imported.streak
        : local.streak;

  return {
    schemaVersion: 1,
    streak,
    bestStreak: Math.max(local.bestStreak, imported.bestStreak),
    lastPracticeDay,
    missed,
    history,
  };
}

function mergeActivity(local: RelayActivityLog, imported: RelayActivityLog) {
  const localKeys = new Set(local.entries.map(activityKey));
  const seen = new Set<string>();
  const combined: Array<{ entry: RelayActivityEntry; fromImport: boolean }> = [];

  for (const entry of local.entries) {
    const key = activityKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push({ entry, fromImport: false });
  }

  for (const entry of imported.entries) {
    const key = activityKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push({ entry, fromImport: !localKeys.has(key) });
  }

  const entries = combined
    .sort((left, right) => {
      if (right.entry.at !== left.entry.at) {
        return right.entry.at - left.entry.at;
      }
      return activityKey(left.entry).localeCompare(activityKey(right.entry));
    })
    .slice(0, ACTIVITY_CAP);

  return {
    state: {
      schemaVersion: 1 as const,
      entries: entries.map(({ entry }) => entry),
    },
    activityEntriesAdded: entries.filter(({ fromImport }) => fromImport).length,
  };
}

function mergeCases(
  local: Record<string, CaseSession>,
  imported: Record<string, CaseSession>,
): {
  state: Record<string, CaseSession>;
  casesImported: number;
  casesRetained: number;
  ignoredIds: string[];
} {
  const state: Record<string, CaseSession> = { ...local };
  let casesImported = 0;
  let casesRetained = 0;
  const ignoredIds: string[] = [];

  for (const [caseId, importedSession] of Object.entries(imported)) {
    const localSession = state[caseId];
    if (!localSession) {
      state[caseId] = importedSession;
      casesImported += 1;
      continue;
    }
    if (importedSession.updatedAt > localSession.updatedAt) {
      state[caseId] = importedSession;
      casesImported += 1;
      continue;
    }
    casesRetained += 1;
    ignoredIds.push(caseId);
  }

  return { state, casesImported, casesRetained, ignoredIds };
}

function estimateImportBytes(input: unknown): number | null {
  try {
    return JSON.stringify(input)?.length ?? null;
  } catch {
    return null;
  }
}

function compareMissedEntry(left: MissedEntry, right: MissedEntry): number {
  if (left.misses !== right.misses) {
    return left.misses - right.misses;
  }
  if (left.dueDay !== right.dueDay) {
    return left.dueDay.localeCompare(right.dueDay);
  }
  return left.questionId.localeCompare(right.questionId);
}

function laterDay(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

function historyKey(entry: DrillRecord): string {
  return `${entry.day}\u0000${entry.correct}\u0000${entry.total}`;
}

function activityKey(entry: RelayActivityEntry): string {
  return `${entry.type}\u0000${entry.label}\u0000${entry.at}`;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isDayString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function invalid(
  reason: "malformed" | "unsupported-version" | "invalid-record" | "oversized",
  message: string,
): Extract<ImportValidation, { ok: false }> {
  return { ok: false, reason, message };
}
