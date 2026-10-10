import { afterEach, describe, expect, it } from "vitest";
import { defaultPreferences, loadPreferences } from "../../lib/persistence/storage";
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, storedTheme, writeTheme, type PreferenceStorage } from "./preferences";

afterEach(() => localStorage.clear());

const FULL = {
  schemaVersion: 1,
  reducedMotion: true,
  navigationDensity: "compact",
  firstRunGuidanceSeen: ["prepare"],
  theme: "system",
};

function stored(): unknown {
  return JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null");
}

describe("landing theme writer", () => {
  it("keeps its default record equal to the app's", () => {
    expect(DEFAULT_PREFERENCES).toEqual(defaultPreferences);
  });

  it("merges only the theme into a full v1 record", () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(FULL));
    expect(writeTheme(localStorage, "dark")).toBe(true);
    expect(stored()).toEqual({ ...FULL, theme: "dark" });
    expect(loadPreferences()).toEqual({ ...FULL, theme: "dark" });
  });

  it("leaves missing fields missing in a partial v1 record", () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, reducedMotion: true }));
    writeTheme(localStorage, "light");
    expect(stored()).toEqual({ schemaVersion: 1, reducedMotion: true, theme: "light" });
  });

  it("writes the complete default record when nothing is stored", () => {
    expect(writeTheme(localStorage, "black")).toBe(true);
    expect(stored()).toEqual({ ...defaultPreferences, theme: "black" });
    expect(loadPreferences()).toEqual({ ...defaultPreferences, theme: "black" });
  });

  it.each([
    ["another schemaVersion", JSON.stringify({ schemaVersion: 2, theme: "light", extra: 1 })],
    ["corrupt JSON", "{not json"],
    ["a JSON number", "42"],
    ["a JSON array", "[1,2]"],
    ["JSON null", "null"],
  ])("never overwrites %s", (_label, raw) => {
    localStorage.setItem(PREFERENCES_KEY, raw);
    expect(writeTheme(localStorage, "dark")).toBe(false);
    expect(localStorage.getItem(PREFERENCES_KEY)).toBe(raw);
  });

  it("reports no write when storage throws on read or write", () => {
    const readFails: PreferenceStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => undefined,
    };
    const writeFails: PreferenceStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    expect(writeTheme(readFails, "dark")).toBe(false);
    expect(writeTheme(writeFails, "dark")).toBe(false);
    expect(writeTheme(null, "dark")).toBe(false);
    expect(storedTheme(readFails)).toBe("system");
  });

  it("reads the theme only from a valid v1 record", () => {
    expect(storedTheme(localStorage)).toBe("system");
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...FULL, theme: "black" }));
    expect(storedTheme(localStorage)).toBe("black");
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 2, theme: "black" }));
    expect(storedTheme(localStorage)).toBe("system");
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, theme: "neon" }));
    expect(storedTheme(localStorage)).toBe("system");
  });
});
