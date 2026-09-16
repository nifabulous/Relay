import { describe, expect, it } from "vitest";
import { AtlasHubSchema, AtlasNetworkSchema } from "./atlasSchemas";

describe("atlas schemas", () => {
  it("rejects evidence accidentally attached to a hub", () => {
    expect(() => AtlasHubSchema.parse({
      bic: "CITIUS33XXX", name: "Citibank", iso2: "US", banks_served: 2, currencies: 1,
      evidence: [],
    })).toThrow();
  });

  it("requires every network section", () => {
    expect(() => AtlasNetworkSchema.parse({ scope: "all", totals: {
      ssi_rows: 1, beneficiary_banks: 1, correspondents: 1, currencies: 1,
    }, spokes: [], hub_countries: [], hubs: [], disclaimer: "x" })).toThrow();
  });
});
