import type { PaymentRouteNode } from "../types";

/**
 * Build a concise screen-reader summary of a payment route.
 *
 * Format: "Payment from {origin} through {intermediaries} to {beneficiary},
 * {currency} {amount}. {outcome}."
 *
 * Reject and incomplete paths state where movement stopped and why.
 */
export function routeSummary(
  nodes: PaymentRouteNode[],
  currency?: string,
  amount?: string,
): string {
  if (nodes.length === 0) return "No payment route data to show.";

  const originator = nodes.find((n) => n.kind === "originator");
  const beneficiary = nodes.find((n) => n.kind === "beneficiary");
  const intermediaries = nodes.filter((n) => n.kind === "intermediary");

  const parts: string[] = [];

  parts.push(`Payment from ${originator?.name ?? "originator"}`);

  if (intermediaries.length > 0) {
    const names = intermediaries.map((n) => n.name).join(", then ");
    parts.push(`through ${names}`);
  }

  parts.push(`to ${beneficiary?.name ?? "beneficiary"}`);

  if (currency && amount) {
    parts.push(`${currency} ${amount}`);
  }

  // Outcome — based on node statuses
  const failed = nodes.find((n) => n.status === "failed");
  const unavailable = nodes.find((n) => n.status === "unavailable");

  if (failed) {
    parts.push(`Stopped at ${failed.name}. Payment failed.`);
  } else if (unavailable) {
    parts.push(`Status unavailable at ${unavailable.name}.`);
  } else {
    const allPassed = nodes.every((n) => n.status === "passed");
    if (allPassed) {
      parts.push("All institutions passed.");
    }
  }

  return parts.join(", ") + ".";
}
