import { describe, expect, it } from "vitest";
import { trackingRouteStops } from "./trackingRoute";

const payment = {
  is_terminal: false,
  timeline: [
    { status: "INITIATED", bank_bic: "AAAAGB2LXXX", bank_name: "Harborline Bank", hop: 0, timestamp: "t0" },
    { status: "FORWARDED", bank_bic: "CITIUS33XXX", bank_name: "Citibank N.A.", hop: 1, timestamp: "t1" },
    { status: "CREDITED", bank_bic: "BBBBGB2LXXX", bank_name: "Northstar Bank", hop: 2, timestamp: "t2" },
  ],
} as never;

describe("trackingRouteStops", () => {
  it("maps each revealed hop to a stop with its bank", () => {
    const stops = trackingRouteStops(payment);
    expect(stops.map((stop) => stop.name)).toEqual(["Harborline Bank", "Citibank N.A.", "Northstar Bank"]);
    expect(stops.map((stop) => stop.role)).toEqual(["origin", "correspondent", "beneficiary"]);
  });

  it("marks a rejected or returned hop as failed", () => {
    const rejected = { ...(payment as any), timeline: [{ ...(payment as any).timeline[0], status: "REJECTED" }] } as never;
    expect(trackingRouteStops(rejected)[0].status).toBe("failed");
  });

  it("treats a revealed credited hop as passed", () => {
    expect(trackingRouteStops(payment)[2].status).toBe("passed");
  });
});
