import type { PracticeState } from "../../features/learn/practice/practiceStore";
import type { RelayProgress, RelayActivityLog } from "./storage";
import type { CaseSession } from "../../features/learn/cases/caseStore";

export interface RelayLocalProfile {
  schemaVersion: 1;
  profileId: string;
  createdAt: number;
  updatedAt: number;
}

export interface RelayLearningState {
  profile: RelayLocalProfile;
  progress: RelayProgress;
  practice: PracticeState;
  activity: RelayActivityLog;
  cases: Record<string, CaseSession>;
}

export interface RelayLearnerExportEnvelope {
  format: "relay-learner-state";
  formatVersion: 1;
  exportedAt: number;
  sourceProfileId: string;
  state: Omit<RelayLearningState, "profile">;
}

export interface RawStorageSnapshot {
  entries: Array<{ key: string; rawValue: string | null }>;
}

export type ProfilePersistence = "persistent" | "session-only";

export interface LocalProfileResult {
  profile: RelayLocalProfile;
  persistence: ProfilePersistence;
}

export interface LoadedLearningState {
  state: RelayLearningState;
  persistence: ProfilePersistence;
  warnings: string[];
}

export type ImportValidation =
  | { ok: true; value: RelayLearnerExportEnvelope }
  | {
      ok: false;
      reason: "malformed" | "unsupported-version" | "invalid-record" | "oversized";
      message: string;
    };

export interface MergeReport {
  completedModulesAdded: number;
  casesImported: number;
  casesRetained: number;
  activityEntriesAdded: number;
  ignoredIds: string[];
}
