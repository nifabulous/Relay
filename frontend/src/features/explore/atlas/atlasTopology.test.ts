import { describe, expect, it } from "vitest";
import { parseAtlasTopology } from "./atlasTopology";

describe("parseAtlasTopology", () => {
  it("rejects a countries object without geometry members", () => {
    expect(() => parseAtlasTopology({
      type: "Topology",
      objects: { countries: {} },
      arcs: [],
    })).toThrow(/countries topology/i);
  });

  it("accepts the required topology envelope", () => {
    expect(parseAtlasTopology({
      type: "Topology",
      objects: { countries: { type: "GeometryCollection", geometries: [] } },
      arcs: [],
    }).objects.countries.geometries).toEqual([]);
  });
});
