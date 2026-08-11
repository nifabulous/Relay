import type { PaymentRouteNode, RouteNodeStatus } from "../types";

interface IntermediaryLike {
  bic: string;
  bank?: string;
}

/**
 * Build PaymentRouteNode[] from a list of intermediaries.
 *
 * Lives beside PaymentRoute because it exists to feed it. Its `IntermediaryLike`
 * shape matches the API's SuggestedIntermediary, so a /api/route response can be
 * rendered without an adapter. Nodes default to "passed" for executed routes;
 * suggested chains pass "possible" so they never claim a verification.
 */
export function buildRouteNodes(
  intermediaries: IntermediaryLike[],
  beneficiaryBic: string,
  status: RouteNodeStatus = "passed",
): PaymentRouteNode[] {
  const nodes: PaymentRouteNode[] = [
    { id: "origin", kind: "originator", bic: "—", name: "Your bank", status },
  ];

  intermediaries.forEach((inter, i) => {
    nodes.push({
      id: `inter-${i}`,
      kind: "intermediary",
      bic: inter.bic,
      name: String(inter.bank ?? inter.bic),
      status,
    });
  });

  nodes.push({
    id: "beneficiary",
    kind: "beneficiary",
    bic: beneficiaryBic,
    name: "Beneficiary bank",
    status,
  });

  return nodes;
}
