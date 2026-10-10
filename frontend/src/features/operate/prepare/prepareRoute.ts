import type { RouteStop, RouteStopStatus } from "../../../design-system/payment-route/routeStops";
import type { PreparePaymentResponse } from "../../../api/schemas";

/**
 * Recommendations after which the checks let the payment continue. The backend
 * fills routing for every valid IBAN, so a STOP, BLOCKED or REJECT result still
 * carries candidates; the route is shown only once the checks clear the payment.
 * PROCEED_WITH_CAUTION and CAUTION are the PROCEED family (sendable with a
 * caveat); REVIEW is non-blocking pending payer confirmation.
 */
const ROUTE_RECOMMENDATIONS = new Set(["PROCEED", "PROCEED_WITH_CAUTION", "CAUTION", "REVIEW"]);

const VOP_STATUS: Record<string, RouteStopStatus> = {
  MATCH: "passed",
  CLOSE_MATCH: "needs_attention",
  NO_MATCH: "failed",
};

/**
 * Maps the Prepare result to route stops, or none when the checks have not
 * cleared the payment. Heuristic candidates are marked as needing attention:
 * the backend ranks them, it does not confirm the hops. The beneficiary status
 * comes from the VoP outcome; the sender has no check behind it.
 */
export function prepareRouteStops(
  result: PreparePaymentResponse,
  names: { originator: string; beneficiary: string },
): RouteStop[] {
  if (result.is_blocking || !ROUTE_RECOMMENDATIONS.has(result.recommendation)) return [];
  const correspondent = result.routing.suggested_intermediaries[0];
  if (!correspondent) return [];
  const status = correspondent.basis === "published-ssi" ? "passed" : "needs_attention";
  return [
    { role: "origin", name: names.originator, status: "not_checked" },
    // The schema coerces a missing bank name to "", so fall back to the BIC.
    { role: "correspondent", name: correspondent.bank || correspondent.bic, detail: correspondent.bic, status },
    { role: "beneficiary", name: names.beneficiary, status: VOP_STATUS[result.vop?.outcome ?? ""] ?? "not_checked" },
  ];
}
