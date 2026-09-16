import { describe, expect, it } from "vitest";
import { atlasLayerDescriptors } from "./AtlasMap";

describe("atlas layer seam", () => {
  it("keeps layer attribution extensible without changing the shipped layers", () => {
    const layers = atlasLayerDescriptors("spoke", "1–5", 10, [
      { id: "future-scale", label: "Future scale · source: licensed data" },
    ]);

    expect(layers.map((layer) => layer.id)).toEqual(["coverage", "measure", "evidence", "future-scale"]);
    expect(layers.map((layer) => layer.label)).toContain("Future scale · source: licensed data");
    expect(layers.find((layer) => layer.id === "measure")?.label).toContain("not more correspondent banking");
  });
});
