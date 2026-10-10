import { describe, expect, it } from "vitest";
import { prepareRouteStops } from "./prepareRoute";

const routing = {
  suggested_intermediaries: [
    { bic: "CITIUS33XXX", bank: "Citibank N.A.", corridor: "USD->GB", confidence: "high", basis: "published-ssi" },
  ],
  routing_basis: "published-ssi",
  inferred_currency: "USD",
};

describe("prepareRouteStops", () => {
  it("builds sender, correspondent and beneficiary stops", () => {
    const stops = prepareRouteStops(routing as never, { originator: "Harborline Bank", beneficiary: "Northstar Bank" });
    expect(stops.map((stop) => stop.role)).toEqual(["origin", "correspondent", "beneficiary"]);
    expect(stops[1]).toMatchObject({ name: "Citibank N.A.", detail: "CITIUS33XXX" });
  });

  it("marks a heuristic correspondent as needing attention", () => {
    const heuristic = { ...routing, routing_basis: "corridor-heuristic", suggested_intermediaries: [{ ...routing.suggested_intermediaries[0], basis: "corridor-heuristic" }] };
    const stops = prepareRouteStops(heuristic as never, { originator: "A", beneficiary: "B" });
    expect(stops[1].status).toBe("needs_attention");
  });

  it("returns no stops when there are no candidates", () => {
    expect(prepareRouteStops({ ...routing, suggested_intermediaries: [] } as never, { originator: "A", beneficiary: "B" })).toEqual([]);
  });

  it("falls back to the BIC when the bank name is empty", () => {
    const unnamed = { ...routing, suggested_intermediaries: [{ ...routing.suggested_intermediaries[0], bank: "" }] };
    const stops = prepareRouteStops(unnamed as never, { originator: "A", beneficiary: "B" });
    expect(stops[1]).toMatchObject({ name: "CITIUS33XXX", detail: "CITIUS33XXX" });
  });
});
