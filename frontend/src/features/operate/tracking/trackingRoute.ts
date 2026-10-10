import type { RouteStop } from "../../../design-system/payment-route/routeStops";
import type { TrackPaymentResponse } from "../../../api/schemas";

/**
 * Maps the revealed timeline to route stops. The backend reveals hops in order,
 * so the first revealed hop is the origin and the last is the beneficiary. Only
 * revealed hops are drawn: the payload has no total hop count.
 */
export function trackingRouteStops(payment: TrackPaymentResponse): RouteStop[] {
  const hops = payment.timeline;
  return hops.map((hop, index) => {
    const role = index === 0 ? "origin" : index === hops.length - 1 ? "beneficiary" : "correspondent";
    const failed = hop.status === "REJECTED" || hop.status === "RETURNED";
    return {
      role,
      name: hop.bank_name || hop.bank_bic,
      detail: hop.bank_bic,
      status: failed ? "failed" : "passed",
    };
  });
}
