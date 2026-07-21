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

// ─── Generic versioned primitives ───────────────────────────────────────────
// Exported so the Customer Case Desk (caseStore.ts) can persist sessions via
// the SAME versioned path as preferences/progress, while still surfacing a
// recoverable save failure to the UI instead of silently dropping the write.
//
// Contract:
//   - Every persisted object carries `schemaVersion: 1` (the only version in
//     Phase 1). `loadVersioned` returns the fallback for: absent key, corrupt
//     JSON, missing schemaVersion, or any non-1 schemaVersion. (When a future
//     phase introduces schemaVersion: 2 for a different payload, generalize
//     this guard then — YAGNI for now.)
//   - `saveVersioned` distinguishes `quota` (QuotaExceededError) from
//     `unavailable` (SecurityError / private mode / anything else) so callers
//     can show a targeted recovery affordance instead of a generic "saved".

export function loadVersioned<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // Strict schema-version guard: only schemaVersion === 1 is accepted. This
    // matches the prior private `safeLoad` exactly, so all existing callers
    // (preferences/progress/activity) keep their behaviour, and the caseStore
    // re-validates caseRevision on top of this structural check.
    if (parsed?.schemaVersion !== 1) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: "unavailable" | "quota" };

export function saveVersioned<T>(key: string, value: T): SaveResult {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err: unknown) {
    // Real browsers throw a DOMException with .name set; some environments
    // (and some test doubles) throw a plain object with only .name. Sniff by
    // name so both paths classify correctly.
    const name = (err as { name?: string } | null)?.name;
    if (name === "QuotaExceededError") {
      return { ok: false, reason: "quota" };
    }
    // SecurityError (private mode / denied), unknown errors, or anything else
    // the browser might throw when storage is unavailable.
    return { ok: false, reason: "unavailable" };
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage denied / unavailable — nothing to remove, nothing to surface.
  }
}

// ─── Internal helpers ─────────────────────────────────────
// Thin non-throwing wrappers that delegate to the exported primitives. Kept
// private so existing callers (preferences/progress/activity) retain their
// exact current behaviour: silently ignore ALL storage failures, never throw,
// never return a typed result.

function safeLoad<T>(key: string, fallback: T): T {
  return loadVersioned<T>(key, fallback);
}

function safeSave(key: string, value: unknown): void {
  // Intentionally discard the typed result: existing callers were written
  // against a void-returning helper and must not change behaviour.
  saveVersioned(key, value);
}
