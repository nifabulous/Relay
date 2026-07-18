import { describe, it, expect } from "vitest";
import { LAB_REGISTRY, getLabDefinition } from "./labRegistry";
import { CURRICULUM } from "./curriculum";
import { CORE_LAB_PARITY } from "./legacyParity";

describe("LAB_REGISTRY", () => {
  it("has an entry for every curriculum module", () => {
    for (const mod of CURRICULUM) {
      expect(LAB_REGISTRY[mod.id]).toBeDefined();
    }
  });

  it("has no extra entries beyond the curriculum", () => {
    const curriculumIds = new Set(CURRICULUM.map((m) => m.id));
    for (const id of Object.keys(LAB_REGISTRY)) {
      expect(curriculumIds.has(id)).toBe(true);
    }
  });

  it("checkpoint lists match the parity contract", () => {
    for (const [id, entry] of Object.entries(LAB_REGISTRY)) {
      const parity = CORE_LAB_PARITY[id];
      expect(parity).toBeDefined();
      expect(entry.requiredCheckpoints).toEqual(parity.requiredCheckpoints);
    }
  });
});

describe("getLabDefinition", () => {
  it("returns the definition for a known module", () => {
    const def = getLabDefinition("lab-1");
    expect(def).toBeDefined();
    expect(def?.requiredCheckpoints).toEqual(["analyze-identifier", "identify-country", "identify-bank"]);
  });

  it("returns undefined for an unknown module", () => {
    expect(getLabDefinition("nonexistent")).toBeUndefined();
  });
});
