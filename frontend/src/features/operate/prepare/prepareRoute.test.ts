import { describe, expect, it } from "vitest";
import type { PreparePaymentResponse } from "../../../api/schemas";
import { prepareRouteStops, prepareRouteSummary } from "./prepareRoute";

const routing = {
  suggested_intermediaries: [
    { bic: "CITIUS33XXX", bank: "Citibank N.A.", corridor: "USD->GB", confidence: "high", basis: "published-ssi" },
  ],
  routing_basis: "published-ssi",
  inferred_currency: "USD",
};

function result(overrides: Record<string, unknown> = {}): PreparePaymentResponse {
  return {
    recommendation: "PROCEED",
    is_blocking: false,
    vop: { outcome: "MATCH", advice: "" },
    routing,
    ...overrides,
  } as unknown as PreparePaymentResponse;
}

const names = { originator: "Harborline Bank", beneficiary: "Northstar Bank" };

describe("prepareRouteStops", () => {
  it("builds sender, correspondent and beneficiary stops", () => {
    const stops = prepareRouteStops(result(), names);
    expect(stops.map((stop) => stop.role)).toEqual(["origin", "correspondent", "beneficiary"]);
    expect(stops[1]).toMatchObject({ name: "Citibank N.A.", detail: "CITIUS33XXX" });
  });

  it("marks a heuristic correspondent as needing attention", () => {
    const heuristic = { ...routing, routing_basis: "corridor-heuristic", suggested_intermediaries: [{ ...routing.suggested_intermediaries[0], basis: "corridor-heuristic" }] };
    expect(prepareRouteStops(result({ routing: heuristic }), names)[1].status).toBe("needs_attention");
  });

  it("returns no stops when there are no candidates", () => {
    expect(prepareRouteStops(result({ routing: { ...routing, suggested_intermediaries: [] } }), names)).toEqual([]);
  });

  it("falls back to the BIC when the bank name is empty", () => {
    const unnamed = { ...routing, suggested_intermediaries: [{ ...routing.suggested_intermediaries[0], bank: "" }] };
    expect(prepareRouteStops(result({ routing: unnamed }), names)[1]).toMatchObject({ name: "CITIUS33XXX", detail: "CITIUS33XXX" });
  });

  // The backend fills routing for every valid IBAN, so a blocked result still carries candidates.
  it.each(["STOP", "BLOCKED", "REJECT"])("draws no route for a blocking %s result", (recommendation) => {
    expect(prepareRouteStops(result({ recommendation, is_blocking: true, vop: { outcome: "NO_MATCH" } }), names)).toEqual([]);
  });

  it("draws no route when is_blocking is set, whatever the recommendation says", () => {
    expect(prepareRouteStops(result({ is_blocking: true }), names)).toEqual([]);
  });

  it("draws no route for an unknown or empty recommendation", () => {
    expect(prepareRouteStops(result({ recommendation: "" }), names)).toEqual([]);
    expect(prepareRouteStops(result({ recommendation: "SOMETHING_NEW" }), names)).toEqual([]);
  });

  it.each(["PROCEED", "PROCEED_WITH_CAUTION", "CAUTION", "REVIEW"])("draws the route for a non-blocking %s result", (recommendation) => {
    expect(prepareRouteStops(result({ recommendation }), names)).toHaveLength(3);
  });

  it.each([
    ["MATCH", "passed"],
    ["CLOSE_MATCH", "needs_attention"],
    ["NOT_CHECKED", "not_checked"],
  ])("derives the beneficiary status from a VoP %s", (outcome, status) => {
    expect(prepareRouteStops(result({ vop: { outcome } }), names)[2].status).toBe(status);
  });

  it("never marks the sender passed: no check covers it", () => {
    expect(prepareRouteStops(result(), names)[0].status).toBe("not_checked");
  });
});

// The candidates are alternatives, not a sequence: only the top one is drawn.
const alternatives = {
  ...routing,
  suggested_intermediaries: [
    routing.suggested_intermediaries[0],
    { bic: "CHASUS33XXX", bank: "JPMorgan Chase", corridor: "USD->GB", confidence: "medium", basis: "published-ssi" },
    { bic: "BOFAUS3NXXX", bank: "Bank of America", corridor: "USD->GB", confidence: "low", basis: "published-ssi" },
  ],
};

describe("prepareRouteSummary", () => {
  it("names the one correspondent when it is the only candidate", () => {
    expect(prepareRouteSummary(result(), "John Smith")).toBe("Route from the sender through Citibank N.A. to John Smith.");
  });

  it("says the route shows the top candidate and counts the others", () => {
    expect(prepareRouteSummary(result({ routing: alternatives }), "John Smith")).toBe(
      "Route from the sender through Citibank N.A. to John Smith. The route shows the top suggested correspondent; 2 other candidates are listed.",
    );
  });

  it("uses the singular for one other candidate", () => {
    const two = { ...alternatives, suggested_intermediaries: alternatives.suggested_intermediaries.slice(0, 2) };
    expect(prepareRouteSummary(result({ routing: two }), "John Smith")).toBe(
      "Route from the sender through Citibank N.A. to John Smith. The route shows the top suggested correspondent; 1 other candidate is listed.",
    );
  });

  it("falls back to the BIC and to 'the beneficiary' when names are empty", () => {
    const unnamed = { ...routing, suggested_intermediaries: [{ ...routing.suggested_intermediaries[0], bank: "" }] };
    expect(prepareRouteSummary(result({ routing: unnamed }), "")).toBe("Route from the sender through CITIUS33XXX to the beneficiary.");
  });

  it("still draws exactly one correspondent when several candidates exist", () => {
    const stops = prepareRouteStops(result({ routing: alternatives }), names);
    expect(stops.filter((stop) => stop.role === "correspondent")).toEqual([
      expect.objectContaining({ name: "Citibank N.A.", detail: "CITIUS33XXX" }),
    ]);
    expect(stops).toHaveLength(3);
  });
});
