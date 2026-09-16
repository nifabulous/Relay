import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { atlasLayerDescriptors, AtlasMap } from "./AtlasMap";
import type { AtlasTopology } from "./atlasTopology";

const topology: AtlasTopology = {
  type: "Topology",
  objects: {
    countries: {
      type: "GeometryCollection",
      geometries: [{ type: "Polygon", id: "840", arcs: [[0]] }],
    },
  },
  arcs: [[[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]],
};

describe("atlas layer seam", () => {
  it("keeps layer attribution extensible without changing the shipped layers", () => {
    const layers = atlasLayerDescriptors("spoke", "1–5", 10, [
      { id: "future-scale", label: "Future scale · source: licensed data" },
    ]);

    expect(layers.map((layer) => layer.id)).toEqual(["coverage", "measure", "evidence", "future-scale"]);
    expect(layers.map((layer) => layer.label)).toContain("Future scale · source: licensed data");
    expect(layers.find((layer) => layer.id === "measure")?.label).toContain("not more correspondent banking");
  });

  it("does not render spoke evidence on the hub map", () => {
    const { container } = render(
      <AtlasMap
        topology={topology}
        data={[{ iso2: "US", value: 2 }]}
        spokes={[{
          iso2: "US",
          beneficiary_banks: 1,
          rows: 4,
          evidence: [{ status: "archived", bic_only: false, count: 4 }],
        }]}
        view="hub"
        selected={null}
        denominator={2}
        onSelect={() => undefined}
      />,
    );

    expect(container.querySelector('[data-layer="evidence"]')).toBeNull();
    expect(container.querySelector(".atlas-map__country--hatch-heavy")).toBeNull();
  });
});
