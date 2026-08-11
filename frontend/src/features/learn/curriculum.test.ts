import { describe, it, expect } from "vitest";
import {
  CURRICULUM,
  computeProgress,
  formatDuration,
  formatDurationAriaLabel,
  getModuleById,
  getNextModule,
  getPrerequisiteChain,
  isModuleUnlocked,
} from "./curriculum";

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

  it("each module has a title, route, approved duration range, and learning outcomes", () => {
    const approvedRanges: Record<string, { min: number; max: number }> = {
      "lab-1": { min: 10, max: 15 },
      "lab-2": { min: 15, max: 20 },
      "lab-3": { min: 15, max: 20 },
      "lab-4": { min: 15, max: 20 },
      "lab-5": { min: 15, max: 20 },
      "lab-6": { min: 10, max: 15 },
      "lab-7": { min: 15, max: 20 },
      "lab-8": { min: 15, max: 20 },
      "lab-9": { min: 25, max: 35 },
      "gbp-eur-rails": { min: 25, max: 35 },
      "cad-rails": { min: 20, max: 25 },
      "fees-fx": { min: 15, max: 20 },
      sanctions: { min: 15, max: 20 },
      "exceptions-returns": { min: 15, max: 20 },
      "ops-repair": { min: 20, max: 25 },
      capstone: { min: 30, max: 45 },
    };

    for (const mod of CURRICULUM) {
      const expected = approvedRanges[mod.id];
      expect(mod.id).toBeTruthy();
      expect(mod.title).toBeTruthy();
      expect(mod.href).toMatch(/^\/learn\//);
      expect(expected).toBeDefined();
      expect(mod.duration).toEqual(expected);
      expect(mod.duration.min).toBeGreaterThan(0);
      expect(mod.duration.max).toBeGreaterThan(0);
      expect(mod.duration.max).toBeGreaterThanOrEqual(mod.duration.min);
      expect(Number.isInteger(mod.duration.min)).toBe(true);
      expect(Number.isInteger(mod.duration.max)).toBe(true);
      expect(mod.outcomes.length).toBeGreaterThan(0);
    }
  });

  it("formats duration ranges for display and aria labels", () => {
    expect(formatDuration({ min: 15, max: 20 })).toBe("15–20 min");
    expect(formatDuration({ min: 15, max: 15 })).toBe("15 min");
    expect(formatDurationAriaLabel({ min: 15, max: 20 })).toBe(
      "Estimated time: 15 to 20 minutes",
    );
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

  it("includes lab-9 requiring lab-7 and lab-8", () => {
    const lab9 = CURRICULUM.find((m) => m.id === "lab-9");
    expect(lab9).toBeDefined();
    expect(lab9?.prerequisites).toEqual(expect.arrayContaining(["lab-7", "lab-8"]));
  });

  it("capstone requires all nine technical labs (8 and 9 included)", () => {
    const capstone = getModuleById("capstone");
    expect(capstone?.prerequisites).toEqual(
      expect.arrayContaining([
        "lab-1", "lab-2", "lab-3", "lab-4", "lab-5",
        "lab-6", "lab-7", "lab-8", "lab-9",
      ]),
    );
  });

  it("includes the sanctions module requiring labs 3 and 4", () => {
    const sanctions = getModuleById("sanctions");
    expect(sanctions).toBeDefined();
    expect(sanctions?.prerequisites).toEqual(expect.arrayContaining(["lab-3", "lab-4"]));
  });

  it("includes exceptions-returns requiring tracking and ISO 20022 context", () => {
    const mod = getModuleById("exceptions-returns");
    expect(mod).toBeDefined();
    expect(mod?.prerequisites).toEqual(expect.arrayContaining(["lab-3", "lab-6", "lab-8"]));
  });

  it("includes ops-repair requiring routing, SSI, and message context", () => {
    const mod = getModuleById("ops-repair");
    expect(mod).toBeDefined();
    expect(mod?.prerequisites).toEqual(expect.arrayContaining(["lab-4", "lab-5", "lab-8"]));
  });

  it("orders the new modules after fees-fx and before the capstone", () => {
    const ids = CURRICULUM.map((m) => m.id);
    const feesIdx = ids.indexOf("fees-fx");
    const capIdx = ids.indexOf("capstone");
    for (const id of ["sanctions", "exceptions-returns", "ops-repair"]) {
      const idx = ids.indexOf(id);
      expect(idx).toBeGreaterThan(feesIdx);
      expect(idx).toBeLessThan(capIdx);
    }
  });

  it("capstone stays locked until labs 8 and 9 are complete", () => {
    const throughSeven = ["lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6", "lab-7"];
    expect(isModuleUnlocked("capstone", throughSeven)).toBe(false);
    expect(isModuleUnlocked("capstone", [...throughSeven, "lab-8", "lab-9"])).toBe(true);
  });
});

describe("computeProgress", () => {
  it("reports 0% for a fresh learner and points at lab-1", () => {
    const s = computeProgress([]);
    expect(s.completedCount).toBe(0);
    expect(s.totalCount).toBe(CURRICULUM.length);
    expect(s.percentage).toBe(0);
    expect(s.nextModuleId).toBe("lab-1");
  });

  it("counts completed modules including lab-8 and ignores unknown ids", () => {
    const s = computeProgress(["lab-1", "lab-2", "lab-8", "bogus"]);
    expect(s.completedCount).toBe(3);
    expect(s.percentage).toBe(Math.round((3 / CURRICULUM.length) * 100));
  });

  it("reaches 100% when every module is complete", () => {
    const all = CURRICULUM.map((m) => m.id);
    const s = computeProgress(all);
    expect(s.completedCount).toBe(CURRICULUM.length);
    expect(s.percentage).toBe(100);
    expect(s.nextModuleId).toBeNull();
  });
});
