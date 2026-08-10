import type { RecommendationDraft } from "./caseTypes";

/**
 * Return the canonical expectation text for a draft.
 *
 * New drafts use customerExpectation. Older persisted drafts used separate
 * price, arrival, tracking, and customer-explanation fields, so those values
 * are joined as a read-only compatibility fallback.
 */
export function customerExpectationFor(draft: RecommendationDraft): string {
  const direct = draft.customerExpectation?.trim();
  if (direct) return direct;

  return [
    draft.priceExpectation.trim() && `Price: ${draft.priceExpectation.trim()}`,
    draft.arrivalExpectation.trim() && `Arrival: ${draft.arrivalExpectation.trim()}`,
    draft.trackingExpectation.trim() && `Tracking: ${draft.trackingExpectation.trim()}`,
    draft.customerExplanation.trim() && `Customer explanation: ${draft.customerExplanation.trim()}`,
  ].filter(Boolean).join("\n");
}
