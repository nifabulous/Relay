/**
 * Versioned local persistence for Relay.
 *
 * Every stored object carries schemaVersion: 1. Corrupt or obsolete
 * data is silently discarded and replaced with defaults. Only state
 * that benefits from surviving reloads is persisted: learning progress,
 * recent items, preferences, and explicitly saved payment drafts.
 *
 * Transient UI state (open menus, transient messages, unsaved filters)
 * is NOT persisted here.
 */

import type { PrepareDraft, RelayPreferences } from "../../design-system/types";

const STORAGE_KEYS = {
  preferences: "relay:preferences",
  progress: "relay:progress",
  draft: (id: string) => `relay:draft:${id}`,
  legacyProgress: "swift-lab-progress",
  migrationFlag: "relay:legacy-imported",
  activity: "relay:activity",
} as const;

// ─── Preferences ──────────────────────────────────────────

export const defaultPreferences: RelayPreferences = {
  schemaVersion: 1,
  reducedMotion: false,
  navigationDensity: "comfortable",
  firstRunGuidanceSeen: [],
};

export function loadPreferences(): RelayPreferences {
  return safeLoad(STORAGE_KEYS.preferences, defaultPreferences);
}

export function savePreferences(prefs: RelayPreferences): void {
  safeSave(STORAGE_KEYS.preferences, prefs);
}

// ─── Progress ─────────────────────────────────────────────

export interface RelayProgress {
  schemaVersion: 1;
  completedModuleIds: string[];
}

const defaultProgress: RelayProgress = {
  schemaVersion: 1,
  completedModuleIds: [],
};

export function loadProgress(): RelayProgress {
  return safeLoad(STORAGE_KEYS.progress, defaultProgress);
}

export function saveProgress(progress: RelayProgress): void {
  safeSave(STORAGE_KEYS.progress, progress);
}

// ─── Drafts ──────────────────────────────────────────────

export function loadDraft(id: string): PrepareDraft | null {
  const key = STORAGE_KEYS.draft(id);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== 1) return null;
    return parsed as PrepareDraft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: PrepareDraft): void {
  safeSave(STORAGE_KEYS.draft(draft.id), draft);
}

// ─── Legacy migration ─────────────────────────────────────

export interface MigrationResult {
  completedModuleIds: string[];
  didImport: boolean;
}

export function migrateLegacyProgressOnce(): MigrationResult {
  // Check if already migrated
  if (localStorage.getItem(STORAGE_KEYS.migrationFlag)) {
    return { completedModuleIds: loadProgress().completedModuleIds, didImport: false };
  }

  // Try to read legacy progress
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.legacyProgress);
    if (!raw) {
      // No legacy data — mark as checked so we don't keep looking
      localStorage.setItem(STORAGE_KEYS.migrationFlag, "1");
      return { completedModuleIds: [], didImport: false };
    }

    const legacy = JSON.parse(raw);
    const completed: string[] = Array.isArray(legacy?.completed) ? legacy.completed : [];

    // Merge into current progress
    const current = loadProgress();
    const merged = Array.from(new Set([...current.completedModuleIds, ...completed]));
    saveProgress({ schemaVersion: 1, completedModuleIds: merged });

    // Mark migration complete
    localStorage.setItem(STORAGE_KEYS.migrationFlag, "1");

    return { completedModuleIds: merged, didImport: completed.length > 0 };
  } catch {
    // Corrupt legacy data — mark as checked, don't crash
    localStorage.setItem(STORAGE_KEYS.migrationFlag, "1");
    return { completedModuleIds: [], didImport: false };
  }
}

// ─── Activity log ─────────────────────────────────────────

export interface RelayActivityEntry {
  type: "module" | "tool";
  label: string;
  at: number; // epoch ms
}

export interface RelayActivityLog {
  schemaVersion: 1;
  entries: RelayActivityEntry[]; // newest-first, capped
}

const ACTIVITY_CAP = 20;
const defaultActivity: RelayActivityLog = { schemaVersion: 1, entries: [] };

export function loadActivity(): RelayActivityLog {
  return safeLoad(STORAGE_KEYS.activity, defaultActivity);
}

export function recordActivity(entry: RelayActivityEntry): void {
  const current = loadActivity();
  const entries = [entry, ...current.entries].slice(0, ACTIVITY_CAP);
  safeSave(STORAGE_KEYS.activity, { schemaVersion: 1, entries });
}

// ─── Internal helpers ─────────────────────────────────────

function safeLoad<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== 1) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function safeSave(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage denied, quota exceeded, or private mode — silently ignore.
    // The app continues to work without persistence.
  }
}
