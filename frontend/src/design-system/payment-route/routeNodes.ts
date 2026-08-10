import type { PaymentRouteNode, CheckStatus } from "../types";

interface IntermediaryLike {
  bic: string;
  bank?: string;
}

/**
 * Build PaymentRouteNode[] from a list of intermediaries.
 *
 * Lives beside PaymentRoute because it exists to feed it. Its `IntermediaryLike`
 * shape matches the API's SuggestedIntermediary, so a /api/route response can be
 * rendered without an adapter.
 */
export function buildRouteNodes(
  intermediaries: IntermediaryLike[],
  beneficiaryBic: string,
): PaymentRouteNode[] {
  const passed: CheckStatus = "passed";
  const nodes: PaymentRouteNode[] = [
    { id: "origin", kind: "originator", bic: "—", name: "Your bank", status: passed },
  ];

  intermediaries.forEach((inter, i) => {
    nodes.push({
      id: `inter-${i}`,
      kind: "intermediary",
      bic: inter.bic,
      name: String(inter.bank ?? inter.bic),
      status: passed,
    });
  });

  nodes.push({
    id: "beneficiary",
    kind: "beneficiary",
    bic: beneficiaryBic,
    name: "Beneficiary bank",
    status: passed,
  });

  return nodes;
}
