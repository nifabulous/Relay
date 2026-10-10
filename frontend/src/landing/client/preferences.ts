/**
 * The landing page's only write to the app's storage: the theme.
 *
 * The app's loader (lib/persistence/storage.ts loadVersioned) does not merge
 * defaults, so a partial record would reach the app as-is. This writer:
 *   - re-reads storage at the moment of the write;
 *   - merges only `theme` into a valid schemaVersion 1 record, never adding,
 *     removing or repairing other fields;
 *   - writes the complete default record when nothing is stored;
 *   - never overwrites a record that is corrupt, is not an object, or has
 *     another schemaVersion. Then, and whenever storage throws, the theme
 *     changes for the current page only.
 * preferences.test.ts round-trips every case through the app's loadPreferences().
 */
export const PREFERENCES_KEY = "relay:preferences";

export type ThemeChoice = "system" | "light" | "dark" | "black";
export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark", "black"];

/** Must equal defaultPreferences in lib/persistence/storage.ts (pinned by a test). */
export const DEFAULT_PREFERENCES = {
  schemaVersion: 1,
  reducedMotion: false,
  navigationDensity: "comfortable",
  firstRunGuidanceSeen: [] as string[],
  theme: "system" as ThemeChoice,
};

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

type Stored =
  | { kind: "empty" }
  | { kind: "v1"; record: Record<string, unknown> }
  | { kind: "foreign" };

function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice);
}

function readStored(storage: PreferenceStorage): Stored {
  const raw = storage.getItem(PREFERENCES_KEY);
  if (raw === null || raw === "") return { kind: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "foreign" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { kind: "foreign" };
  const record = parsed as Record<string, unknown>;
  return record.schemaVersion === 1 ? { kind: "v1", record } : { kind: "foreign" };
}

/** The stored theme, or "system" for anything absent, unreadable or foreign. */
export function storedTheme(storage: PreferenceStorage | null): ThemeChoice {
  if (!storage) return "system";
  try {
    const stored = readStored(storage);
    return stored.kind === "v1" && isThemeChoice(stored.record.theme) ? stored.record.theme : "system";
  } catch {
    return "system";
  }
}

/** Persist the theme if the stored record allows it. Returns whether it was written. */
export function writeTheme(storage: PreferenceStorage | null, theme: ThemeChoice): boolean {
  if (!storage) return false;
  try {
    const stored = readStored(storage);
    if (stored.kind === "foreign") return false;
    const next = stored.kind === "v1" ? { ...stored.record, theme } : { ...DEFAULT_PREFERENCES, theme };
    storage.setItem(PREFERENCES_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** localStorage, or null where reading the property itself throws (blocked storage). */
export function pageStorage(): PreferenceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
