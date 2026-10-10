import type { RouteStop } from "../../../design-system/payment-route/routeStops";
import type { PreparePaymentResponse } from "../../../api/schemas";

type Routing = PreparePaymentResponse["routing"];

/**
 * Maps the Prepare result's routing evidence to route stops. Heuristic
 * candidates are marked as needing attention: the backend ranks them, it does
 * not confirm the hops.
 */
export function prepareRouteStops(
  routing: Routing,
  names: { originator: string; beneficiary: string },
): RouteStop[] {
  const correspondent = routing.suggested_intermediaries[0];
  if (!correspondent) return [];
  const status = correspondent.basis === "published-ssi" ? "passed" : "needs_attention";
  return [
    { role: "origin", name: names.originator, status: "not_checked" },
    // The schema coerces a missing bank name to "", so fall back to the BIC.
    { role: "correspondent", name: correspondent.bank || correspondent.bic, detail: correspondent.bic, status },
    { role: "beneficiary", name: names.beneficiary, status: "not_checked" },
  ];
}
