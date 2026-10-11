import { describe, expect, it } from "vitest";
import { atlasRouteStops, routeCountryFor, topCorrespondent } from "./atlasRoute";

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

  it("marks every stop not checked: the atlas reports published data, it runs no check", () => {
    expect(atlasRouteStops("GB", selected).map((stop) => stop.status)).toEqual(["not_checked", "not_checked", "not_checked"]);
  });

  it("returns no route when the selected country has no correspondent", () => {
    expect(atlasRouteStops("GB", { iso2: "KE", correspondents: [] } as never)).toEqual([]);
  });

  it("returns no route when the hub is the selected country", () => {
    expect(atlasRouteStops("KE", selected)).toEqual([]);
  });
});

const bank = (bic: string, beneficiary_banks: number) => ({ bic, name: bic, iso2: "US", beneficiary_banks, currencies: [], disclosures: [] });

describe("topCorrespondent", () => {
  it("picks the highest beneficiary_banks, not the first in the array", () => {
    const country = { iso2: "KE", correspondents: [bank("LOW", 1), bank("HIGH", 7), bank("MID", 4)] } as never;
    expect(topCorrespondent(country)?.bic).toBe("HIGH");
  });

  it("keeps the first in input order on a tie", () => {
    const country = { iso2: "KE", correspondents: [bank("FIRST", 5), bank("SECOND", 5), bank("LOW", 1)] } as never;
    expect(topCorrespondent(country)?.bic).toBe("FIRST");
  });

  it("does not reorder the input", () => {
    const list = [bank("LOW", 1), bank("HIGH", 7)];
    topCorrespondent({ iso2: "KE", correspondents: list } as never);
    expect(list.map((b) => b.bic)).toEqual(["LOW", "HIGH"]);
  });

  it("is undefined without correspondents", () => {
    expect(topCorrespondent({ iso2: "KE", correspondents: [] } as never)).toBeUndefined();
  });
});

describe("routeCountryFor", () => {
  it("returns the data only when it belongs to the current selection", () => {
    expect(routeCountryFor("KE", selected)).toBe(selected);
  });

  it("ignores stale data from a previous selection", () => {
    expect(routeCountryFor("NG", selected)).toBeUndefined();
  });

  it("is undefined with no selection or no data", () => {
    expect(routeCountryFor(undefined, selected)).toBeUndefined();
    expect(routeCountryFor("KE", undefined)).toBeUndefined();
  });
});
