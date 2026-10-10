import { describe, expect, it } from "vitest";
import type { TrackPaymentResponse } from "../../../api/schemas";
import { trackingRouteStops } from "./trackingRoute";

/*
 * Fixtures follow app/services/tracking.py: the originator emits INITIATED; each
 * intermediary emits ACCEPTED, IN_PROGRESS and FORWARDED (or ACCEPTED then
 * REJECTED when it refuses); the beneficiary emits ACCEPTED then CREDITED or
 * REJECTED. So one bank carries several events.
 */
type Event = { status: string; bank_bic: string; bank_name: string };

const ORIGIN: Event[] = [{ status: "INITIATED", bank_bic: "CITIUS33XXX", bank_name: "Citibank N.A." }];
const INTERMEDIARY = (bic: string, name: string): Event[] => [
  { status: "ACCEPTED", bank_bic: bic, bank_name: name },
  { status: "IN_PROGRESS", bank_bic: bic, bank_name: name },
  { status: "FORWARDED", bank_bic: bic, bank_name: name },
];
const BENEFICIARY_CREDITED: Event[] = [
  { status: "ACCEPTED", bank_bic: "GTBINGLAXXX", bank_name: "Guaranty Trust Bank" },
  { status: "CREDITED", bank_bic: "GTBINGLAXXX", bank_name: "Guaranty Trust Bank" },
];

function payment(events: Event[], isTerminal: boolean): TrackPaymentResponse {
  const last = events[events.length - 1];
  return {
    uetr: "uetr-1",
    current_status: last?.status ?? "",
    is_terminal: isTerminal,
    event_count: events.length,
    last_updated: "",
    disclaimer: "",
    timeline: events.map((event, hop) => ({ ...event, hop, timestamp: `t${hop}` })),
  } as TrackPaymentResponse;
}

describe("trackingRouteStops", () => {
  it("groups the three events of a direct credited payment into two banks", () => {
    // The e2e payment: INITIATED at CITIUS33, ACCEPTED and CREDITED at GTBINGLA.
    const stops = trackingRouteStops(payment([...ORIGIN, ...BENEFICIARY_CREDITED], true));
    expect(stops.map((stop) => stop.detail)).toEqual(["CITIUS33XXX", "GTBINGLAXXX"]);
    expect(stops.map((stop) => stop.role)).toEqual(["origin", "beneficiary"]);
    expect(stops.map((stop) => stop.status)).toEqual(["passed", "passed"]);
  });

  it("groups nine events across two intermediaries into four banks, in order of first appearance", () => {
    const events = [
      ...ORIGIN,
      ...INTERMEDIARY("CHASUS33XXX", "JPMorgan Chase"),
      ...INTERMEDIARY("BARCGB22XXX", "Barclays"),
      ...BENEFICIARY_CREDITED,
    ];
    expect(events).toHaveLength(9);
    const stops = trackingRouteStops(payment(events, true));
    expect(stops.map((stop) => stop.name)).toEqual(["Citibank N.A.", "JPMorgan Chase", "Barclays", "Guaranty Trust Bank"]);
    expect(stops.map((stop) => stop.role)).toEqual(["origin", "correspondent", "correspondent", "beneficiary"]);
    expect(stops.every((stop) => stop.status === "passed")).toBe(true);
  });

  it("does not call the last revealed bank the beneficiary while the payment is in flight", () => {
    const events = [...ORIGIN, ...INTERMEDIARY("CHASUS33XXX", "JPMorgan Chase").slice(0, 2)];
    const stops = trackingRouteStops(payment(events, false));
    expect(stops.map((stop) => stop.role)).toEqual(["origin", "correspondent"]);
  });

  it("shows unconfirmed banks as not checked, never passed, while the payment is in flight", () => {
    const events = [...ORIGIN, ...INTERMEDIARY("CHASUS33XXX", "JPMorgan Chase")];
    const stops = trackingRouteStops(payment(events, false));
    expect(stops.map((stop) => stop.status)).toEqual(["not_checked", "not_checked"]);
  });

  it("marks the bank that rejected as failed", () => {
    const events = [
      ...ORIGIN,
      { status: "ACCEPTED", bank_bic: "CHASUS33XXX", bank_name: "JPMorgan Chase" },
      { status: "REJECTED", bank_bic: "CHASUS33XXX", bank_name: "JPMorgan Chase" },
    ];
    const stops = trackingRouteStops(payment(events, true));
    expect(stops).toHaveLength(2);
    expect(stops[1].status).toBe("failed");
    expect(stops[1].role).toBe("correspondent");
    expect(stops[0].status).toBe("not_checked");
  });

  it("marks a returned bank as failed", () => {
    const events = [...ORIGIN, { status: "RETURNED", bank_bic: "GTBINGLAXXX", bank_name: "Guaranty Trust Bank" }];
    expect(trackingRouteStops(payment(events, true))[1].status).toBe("failed");
  });

  it("returns no stops when fewer than two banks are revealed", () => {
    expect(trackingRouteStops(payment([], false))).toEqual([]);
    expect(trackingRouteStops(payment(ORIGIN, false))).toEqual([]);
    expect(trackingRouteStops(payment(INTERMEDIARY("CHASUS33XXX", "JPMorgan Chase"), false))).toEqual([]);
  });

  it("falls back to the BIC when a bank has an empty name", () => {
    const events = [{ ...ORIGIN[0], bank_name: "" }, ...BENEFICIARY_CREDITED];
    expect(trackingRouteStops(payment(events, true))[0].name).toBe("CITIUS33XXX");
  });
});
