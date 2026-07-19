import { describe, it, expect } from "vitest";
import { CURRICULUM, getModuleById, getNextModule, getPrerequisiteChain, isModuleUnlocked } from "./curriculum";

describe("curriculum", () => {
  it("contains all expected core modules", () => {
    const ids = CURRICULUM.map((m) => m.id);
    expect(ids).toContain("lab-1");
    expect(ids).toContain("lab-2");
    expect(ids).toContain("lab-3");
    expect(ids).toContain("lab-4");
    expect(ids).toContain("lab-5");
    expect(ids).toContain("lab-6");
    expect(ids).toContain("lab-7");
    expect(ids).toContain("capstone");
  });

  it("each module has a title, route, estimated duration, and learning outcomes", () => {
    for (const mod of CURRICULUM) {
      expect(mod.id).toBeTruthy();
      expect(mod.title).toBeTruthy();
      expect(mod.href).toMatch(/^\/learn\//);
      expect(mod.duration).toBeGreaterThan(0);
      expect(mod.outcomes.length).toBeGreaterThan(0);
    }
  });

  it("lab-2 has lab-1 as prerequisite", () => {
    const lab2 = getModuleById("lab-2");
    expect(lab2?.prerequisites).toContain("lab-1");
  });

  it("lab-1 has no prerequisites (entry point)", () => {
    const lab1 = getModuleById("lab-1");
    expect(lab1?.prerequisites).toEqual([]);
  });

  it("isModuleUnlocked returns true for lab-1 with empty progress", () => {
    expect(isModuleUnlocked("lab-1", [])).toBe(true);
  });

  it("isModuleUnlocked returns false for lab-2 without lab-1 completed", () => {
    expect(isModuleUnlocked("lab-2", [])).toBe(false);
  });

  it("isModuleUnlocked returns true for lab-2 when lab-1 is completed", () => {
    expect(isModuleUnlocked("lab-2", ["lab-1"])).toBe(true);
  });

  it("getPrerequisiteChain returns all prerequisites recursively", () => {
    const chain = getPrerequisiteChain("lab-3");
    expect(chain).toContain("lab-1");
    expect(chain).toContain("lab-2");
  });

  it("getNextModule returns the first incomplete module", () => {
    expect(getNextModule([])?.id).toBe("lab-1");
    expect(getNextModule(["lab-1"])?.id).toBe("lab-2");
    expect(getNextModule(["lab-1", "lab-2", "lab-3"])?.id).toBe("lab-4");
  });

  it("getNextModule returns null when all modules complete", () => {
    const allIds = CURRICULUM.map((m) => m.id);
    expect(getNextModule(allIds)).toBeNull();
  });

  it("includes lab-8 requiring lab-7", () => {
    const lab8 = CURRICULUM.find((m) => m.id === "lab-8");
    expect(lab8).toBeDefined();
    expect(lab8?.prerequisites).toContain("lab-7");
  });
});
