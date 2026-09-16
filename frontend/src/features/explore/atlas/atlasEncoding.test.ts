import { describe, expect, it } from "vitest";
import { archivedBand, coverageState, denominatorText, coverageCounts } from "./atlasEncoding";
import { numericIdForIso2 } from "./isoNumeric";

describe("atlas encodings", () => {
  it("keeps leading zeroes in ISO numeric topology keys", () => {
    expect(numericIdForIso2("AU")).toBe("036");
    expect(numericIdForIso2("BH")).toBe("048");
  });

  it("uses the reviewed three-band archived treatment", () => {
    expect(archivedBand(0, 10)).toBe("none");
    expect(archivedBand(3, 10)).toBe("light");
    expect(archivedBand(8, 10)).toBe("heavy");
  });

  it("keeps denominators in readable derived values", () => {
    expect(denominatorText(24, 451, "collected beneficiary banks")).toBe("24 of 451 collected beneficiary banks");
    expect(coverageState(false, 0, "settleable")).toBe("never-collected");
    expect(coverageState(true, 0, "settleable")).toBe("out-of-scope");
  });

  it("separates never-collected, out-of-scope, in-scope, and unmapped codes", () => {
    expect(coverageCounts(
      ["CA", "FR", "BQ", "ZZ"],
      [{ iso2: "CA", value: 0 }, { iso2: "FR", value: 4 }, { iso2: "BQ", value: 3 }],
      new Set(["CA", "FR"]),
    )).toEqual({
      neverCollected: 0,
      outOfScope: 1,
      inScope: 1,
      unmapped: ["BQ", "ZZ"],
      outOfScopeCodes: ["CA"],
    });
  });
});
