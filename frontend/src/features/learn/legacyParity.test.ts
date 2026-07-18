import { describe, it, expect } from "vitest";
import { CORE_LAB_PARITY } from "./legacyParity";

describe("CORE_LAB_PARITY", () => {
  it("defines behavior parity for all eight core learning modules", () => {
    expect(Object.keys(CORE_LAB_PARITY)).toEqual([
      "lab-1", "lab-2", "lab-3", "lab-4",
      "lab-5", "lab-6", "lab-7", "capstone",
    ]);
  });

  it("each entry has interactions, checkpoints, and legacy sources", () => {
    for (const entry of Object.values(CORE_LAB_PARITY)) {
      expect(entry.interactions.length).toBeGreaterThan(0);
      expect(entry.requiredCheckpoints.length).toBeGreaterThan(0);
      expect(entry.legacySources.length).toBeGreaterThan(0);
    }
  });

  it("lab-1 has the correct checkpoints", () => {
    expect(CORE_LAB_PARITY["lab-1"].requiredCheckpoints).toEqual([
      "analyze-identifier", "identify-country", "identify-bank",
    ]);
  });

  it("lab-2 has the correct checkpoints", () => {
    expect(CORE_LAB_PARITY["lab-2"].requiredCheckpoints).toEqual([
      "validate-original", "break-checksum", "find-valid-iban",
    ]);
  });

  it("capstone has six step checkpoints", () => {
    expect(CORE_LAB_PARITY["capstone"].requiredCheckpoints).toEqual([
      "validate", "verify", "route", "settle", "decide", "track",
    ]);
  });
});
