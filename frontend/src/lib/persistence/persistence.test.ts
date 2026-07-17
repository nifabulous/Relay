import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPreferences,
  savePreferences,
  loadProgress,
  saveProgress,
  loadDraft,
  saveDraft,
  migrateLegacyProgressOnce,
  defaultPreferences,
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
