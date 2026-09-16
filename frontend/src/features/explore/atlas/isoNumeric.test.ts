import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ISO_NUMERIC, KNOWN_UNRESOLVABLE, iso2ForNumericId } from "./isoNumeric";

const assetPath = resolve(process.cwd(), "src/features/explore/atlas/assets/countries-50m.json");

describe("atlas topology provenance", () => {
  it("matches the recorded source hash", () => {
    const bytes = readFileSync(assetPath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "04342cdc1e3016bcd7db1630de95684d67b79fe3c8c460321e87aef469502394",
    );
  });

  it("has a topology feature for every observed-code mapping", async () => {
    const topology = JSON.parse(readFileSync(assetPath, "utf8")) as {
      objects: { countries: { geometries: Array<{ id?: string | number }> } };
    };
    const featureIds = new Set(topology.objects.countries.geometries.map((item) => String(item.id).padStart(3, "0")));
    const unresolved = Object.entries(ISO_NUMERIC).filter(([iso2, numeric]) => !featureIds.has(numeric) && !(iso2 in KNOWN_UNRESOLVABLE));
    expect(unresolved).toEqual([]);
  });

  it("reverses zero-padded topology ids without losing ISO2 identity", () => {
    expect(iso2ForNumericId("036")).toBe("AU");
    expect(iso2ForNumericId(840)).toBe("US");
    expect(iso2ForNumericId("999")).toBeUndefined();
  });
});
