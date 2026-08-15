import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadPreferences,
  savePreferences,
  loadProgress,
  saveProgress,
  loadDraft,
  saveDraft,
  migrateLegacyProgressOnce,
  defaultPreferences,
  loadVersioned,
  saveVersioned,
  removeStored,
} from "./storage";

beforeEach(() => {
  localStorage.clear();
});

describe("preferences", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadPreferences()).toEqual(defaultPreferences);
  });

  it("discards corrupt persisted preferences", () => {
    localStorage.setItem("relay:preferences", "not-json");
    expect(loadPreferences()).toEqual(defaultPreferences);
  });

  it("round-trips valid preferences", () => {
    const prefs = { ...defaultPreferences, navigationDensity: "compact" as const };
    savePreferences(prefs);
    expect(loadPreferences()).toEqual(prefs);
  });

  it("discards data with wrong schema version", () => {
    localStorage.setItem("relay:preferences", JSON.stringify({ schemaVersion: 99 }));
    expect(loadPreferences()).toEqual(defaultPreferences);
  });

  it("defaults theme to system", () => {
    expect(loadPreferences().theme).toBe("system");
  });

  // The single most important preference test. `loadVersioned` does
  // `return parsed as T` with NO merge against defaults, so a preferences
  // object written by a build that predates the theme key deserialises with
  // `theme === undefined` while TypeScript insists it is a RelayTheme.
  // Coercing at the read boundary must NOT disturb the fields that are there.
  it("loads a pre-theme preferences object as system, keeping the other fields intact", () => {
    localStorage.setItem(
      "relay:preferences",
      JSON.stringify({
        schemaVersion: 1,
        reducedMotion: true,
        navigationDensity: "compact",
        firstRunGuidanceSeen: ["overview", "operate"],
      }),
    );

    const loaded = loadPreferences();

    expect(loaded.theme).toBe("system");
    expect(loaded.reducedMotion).toBe(true);
    expect(loaded.navigationDensity).toBe("compact");
    expect(loaded.firstRunGuidanceSeen).toEqual(["overview", "operate"]);
  });

  it("coerces an unrecognised or non-string persisted theme to system", () => {
    localStorage.setItem(
      "relay:preferences",
      JSON.stringify({ ...defaultPreferences, theme: "midnight-neon" }),
    );
    expect(loadPreferences().theme).toBe("system");

    localStorage.setItem("relay:preferences", JSON.stringify({ ...defaultPreferences, theme: 7 }));
    expect(loadPreferences().theme).toBe("system");
  });

  // Guards the coercion above from over-reaching: an explicit choice is a
  // recognised value and must survive the read boundary unchanged. "light"
  // matters as much as "dark" — it is the value that must stay distinct from
  // "system" so the OS listener leaves it alone.
  it("round-trips an explicit theme choice in both directions", () => {
    savePreferences({ ...defaultPreferences, theme: "dark" });
    expect(loadPreferences().theme).toBe("dark");

    savePreferences({ ...defaultPreferences, theme: "light" });
    expect(loadPreferences().theme).toBe("light");

    savePreferences({ ...defaultPreferences, theme: "system" });
    expect(loadPreferences().theme).toBe("system");
  });
});

describe("progress", () => {
  it("returns empty progress by default", () => {
    const p = loadProgress();
    expect(p.completedModuleIds).toEqual([]);
    expect(p.schemaVersion).toBe(1);
  });

  it("round-trips completed modules", () => {
    saveProgress({ schemaVersion: 1, completedModuleIds: ["lab-1", "lab-2"] });
    const p = loadProgress();
    expect(p.completedModuleIds).toEqual(["lab-1", "lab-2"]);
  });

  it("discards corrupt progress", () => {
    localStorage.setItem("relay:progress", "garbage");
    expect(loadProgress().completedModuleIds).toEqual([]);
  });
});

describe("drafts", () => {
  it("round-trips a payment draft", () => {
    const draft = {
      schemaVersion: 1 as const,
      id: "draft-1",
      updatedAt: "2026-01-01T00:00:00",
      beneficiaryIban: "GB29NWBK60161331926819",
      beneficiaryName: "Test User",
      currency: "GBP",
      amount: 500,
      strictness: "standard" as const,
    };
    saveDraft(draft);
    const loaded = loadDraft("draft-1");
    expect(loaded).toEqual(draft);
  });

  it("returns null for unknown draft id", () => {
    expect(loadDraft("nonexistent")).toBeNull();
  });
});

describe("legacy migration", () => {
  it("imports legacy progress once", () => {
    localStorage.setItem("swift-lab-progress", JSON.stringify({ completed: ["lab-1", "lab-3"] }));
    const result = migrateLegacyProgressOnce();
    expect(result.completedModuleIds).toContain("lab-1");
    expect(result.completedModuleIds).toContain("lab-3");
    expect(result.didImport).toBe(true);
  });

  it("does not import again on second call", () => {
    localStorage.setItem("swift-lab-progress", JSON.stringify({ completed: ["lab-1"] }));
    migrateLegacyProgressOnce();
    const result = migrateLegacyProgressOnce();
    expect(result.didImport).toBe(false);
  });

  it("handles missing legacy key gracefully", () => {
    const result = migrateLegacyProgressOnce();
    expect(result.completedModuleIds).toEqual([]);
    expect(result.didImport).toBe(false);
  });

  it("handles corrupt legacy data", () => {
    localStorage.setItem("swift-lab-progress", "corrupt");
    const result = migrateLegacyProgressOnce();
    expect(result.completedModuleIds).toEqual([]);
  });
});

// ─── Generic versioned primitives ───────────────────────────────────────────
// New in Task 2: caseStore consumes these directly so it can surface a
// recoverable save failure to the UI (instead of silently swallowing it, as
// the existing wrappers do for preferences/progress/drafts).

describe("loadVersioned", () => {
  it("returns the stored value when it has schemaVersion", () => {
    interface Shape {
      schemaVersion: 1;
      name: string;
    }
    const value: Shape = { schemaVersion: 1, name: "round-trip" };
    localStorage.setItem("relay:test:load", JSON.stringify(value));
    expect(loadVersioned<Shape>("relay:test:load", { schemaVersion: 1, name: "fallback" })).toEqual(value);
  });

  it("returns fallback when the key is absent", () => {
    const fallback = { schemaVersion: 1, n: 42 };
    expect(loadVersioned("relay:test:absent", fallback)).toBe(fallback);
  });

  it("returns fallback for corrupt JSON", () => {
    localStorage.setItem("relay:test:corrupt", "not-json{");
    const fallback = { schemaVersion: 1, n: 0 };
    expect(loadVersioned("relay:test:corrupt", fallback)).toEqual(fallback);
  });

  it("returns fallback when schemaVersion is missing", () => {
    localStorage.setItem("relay:test:no-version", JSON.stringify({ name: "no-version" }));
    const fallback = { schemaVersion: 1, n: 0 };
    expect(loadVersioned("relay:test:no-version", fallback)).toEqual(fallback);
  });

  it("returns fallback when schemaVersion is the wrong version", () => {
    localStorage.setItem(
      "relay:test:wrong-version",
      JSON.stringify({ schemaVersion: 99, name: "obsolete" }),
    );
    const fallback = { schemaVersion: 1, n: 0 };
    expect(loadVersioned("relay:test:wrong-version", fallback)).toEqual(fallback);
  });
});

describe("saveVersioned", () => {
  it("returns ok:true and persists a versioned value", () => {
    interface Shape {
      schemaVersion: 1;
      name: string;
    }
    const value: Shape = { schemaVersion: 1, name: "saved" };
    const result = saveVersioned<Shape>("relay:test:save", value);
    expect(result).toEqual({ ok: true });
    expect(JSON.parse(localStorage.getItem("relay:test:save")!)).toEqual(value);
  });

  it("returns reason:quota on QuotaExceededError", () => {
    const original = localStorage.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const err = new DOMException("quota exceeded", "QuotaExceededError");
      throw err;
    });
    try {
      const result = saveVersioned("relay:test:quota", { schemaVersion: 1, x: 1 });
      expect(result).toEqual({ ok: false, reason: "quota" });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      // sanity: storage behaviour restored
      expect(typeof original).toBe("function");
    }
  });

  it("returns reason:unavailable on SecurityError", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const err = new DOMException("security denied", "SecurityError");
      throw err;
    });
    try {
      const result = saveVersioned("relay:test:security", { schemaVersion: 1, x: 1 });
      expect(result).toEqual({ ok: false, reason: "unavailable" });
    } finally {
      spy.mockRestore();
    }
  });

  it("returns reason:unavailable on a generic unexpected throw", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private mode / unknown");
    });
    try {
      const result = saveVersioned("relay:test:generic", { schemaVersion: 1, x: 1 });
      expect(result).toEqual({ ok: false, reason: "unavailable" });
    } finally {
      spy.mockRestore();
    }
  });

  it("treats a QuotaExceededError-shaped object (.name only) as quota", () => {
    // Some environments throw a plain object instead of a real DOMException.
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw { name: "QuotaExceededError", message: "fake quota" };
    });
    try {
      const result = saveVersioned("relay:test:quota-shape", { schemaVersion: 1, x: 1 });
      expect(result).toEqual({ ok: false, reason: "quota" });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("removeStored", () => {
  it("removes a stored key", () => {
    localStorage.setItem("relay:test:remove", JSON.stringify({ schemaVersion: 1 }));
    expect(localStorage.getItem("relay:test:remove")).not.toBeNull();
    removeStored("relay:test:remove");
    expect(localStorage.getItem("relay:test:remove")).toBeNull();
  });

  it("does not throw when the key is absent", () => {
    expect(() => removeStored("relay:test:never-was")).not.toThrow();
  });

  it("does not throw when removeItem fails", () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      expect(() => removeStored("relay:test:denied")).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

// ensure `vi` is referenced for the spies above (vitest globals are enabled
// but importing explicitly keeps the test file self-documenting).
describe("regression: existing wrappers still non-throwing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("savePreferences silently ignores a quota failure (does not throw)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => savePreferences(defaultPreferences)).not.toThrow();
  });
});
