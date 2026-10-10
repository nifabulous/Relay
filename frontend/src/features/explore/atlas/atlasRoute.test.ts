import { describe, expect, it } from "vitest";
import { atlasRouteStops } from "./atlasRoute";

const selected = {
  iso2: "KE",
  correspondents: [
    { bic: "CITIUS33XXX", name: "Citibank N.A.", iso2: "US", beneficiary_banks: 9, currencies: ["USD"], disclosures: [] },
    { bic: "SCBLUS33XXX", name: "Standard Chartered NY", iso2: "US", beneficiary_banks: 3, currencies: ["USD"], disclosures: [] },
  ],
} as never;

describe("atlasRouteStops", () => {
  it("draws hub, the top correspondent, then the selected country", () => {
    const stops = atlasRouteStops("GB", selected);
    expect(stops.map((stop) => stop.role)).toEqual(["origin", "correspondent", "beneficiary"]);
    expect(stops[1]).toMatchObject({ name: "Citibank N.A.", detail: "CITIUS33XXX" });
  });

  it("returns no route when the selected country has no correspondent", () => {
    expect(atlasRouteStops("GB", { iso2: "KE", correspondents: [] } as never)).toEqual([]);
  });
});
