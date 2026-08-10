/**
 * Customer Case Desk — type definitions (Task 1 foundation).
 *
 * These types describe the synthetic supplier case, its facts and rails, the
 * learner's recommendation draft, and the evaluator's outcome. They are
 * consumed by every later task (persistence, UI, E2E) so they are defined here
 * VERBATIM from the Phase 1 plan — no speculative fields (YAGNI).
 *
 * This module is types-only: no runtime values, no logic.
 */

export type CaseId = string;
export type CasePhase = "brief" | "investigate" | "recommend" | "resolve" | "debrief";
export type DecisionQuality = "invalid" | "possible" | "defensible" | "preferred";

export interface CaseRecommendationProfile {
  preferredRailId: string;
  priorityFactIds: {
    urgency?: string;
    tracking?: string;
    cost?: string;
  };
  corridorLabel: string;
  paymentLabel: string;
}

export interface RailEligibilityRule {
  factId: string;
  operator: "equals" | "includes";
  value: string;
  outcome: "eligible" | "ineligible";
}

export interface SourceClaim {
  source: string;
  owner: string;
  verifiedAt: string;
  reviewBy: string;
  jurisdiction: string;
  currency?: string;
  scope:
    | "scheme-rule"
    | "operator-guidance"
    | "institution-config"
    | "example-assumption"
    | "simulation-only";
}

export interface CaseFact {
  id: string;
  label: string;
  value: string;
  state: "supplied" | "gathered" | "assumption" | "unknown";
  requestable: boolean;
  claim?: SourceClaim;
}

export interface RailOption {
  id: string;
  name: string;
  eligibility: string;
  requiredFacts: string[];
  eligibilityRules?: RailEligibilityRule[];
  reasons: string[];
  fitTags?: string[];
  source?: SourceClaim;
  /**
   * Optional concise worked explanation revealed in the resolve phase after
   * the learner reviews the consequence (design spec L191). Surfaced onto
   * `CaseOutcome.workedExplanation` for eligible rails only. Optional because
   * not every rail warrants a worked example (e.g. a close-transfer variant).
   */
  workedExplanation?: string;
}

export interface TransferDefinition {
  id: string;
  customerRequest: string;
  facts: CaseFact[];
  rails: RailOption[];
}

export interface CaseDefinition {
  id: CaseId;
  title: string;
  summary?: string;
  customerRequest: string;
  contentRevision?: string;
  verifiedAt: string;
  reviewBy: string;
  reviewStatus: "current" | "under_review";
  facts: CaseFact[];
  rails: RailOption[];
  recommendation?: CaseRecommendationProfile;
  transfer: TransferDefinition;
}

/**
 * Authored catalog entries keep the metadata required. The looser
 * CaseDefinition shape exists only as a compatibility boundary for legacy
 * fixtures and consumers that intentionally omit those fields.
 */
export type AuthoredCaseDefinition = CaseDefinition & Required<
  Pick<CaseDefinition, "summary" | "contentRevision" | "recommendation">
>;

export interface RecommendationDraft {
  shortlist: string[];
  selectedRail: string | null;
  reasons: string[];
  conditions: string[];
  /** Consolidated learner-facing expectation for cost, timing, tracking, and explanation. */
  customerExpectation?: string;
  /** Legacy fields retained so persisted drafts and old attempts remain readable. */
  priceExpectation: string;
  arrivalExpectation: string;
  trackingExpectation: string;
  customerExplanation: string;
}

export interface CaseOutcome {
  quality: DecisionQuality;
  consequence: string;
  soundReasoning: string[];
  reasoningGap: string | null;
  nextAction: string;
  invalidRailIds: string[];
  missingFactIds: string[];
  /**
   * A concise worked explanation revealed in the resolve phase AFTER the
   * learner has reviewed the consequence (design spec L191, Resolve step 6).
   * Authored per-rail (`RailOption.workedExplanation`) and surfaced only for
   * eligible rails — an ineligible rail has no worked example to show. Null
   * when the rail authors none or the selection is ineligible/invalid.
   */
  workedExplanation: string | null;
}

export type EnrichmentState = "idle" | "loading" | "success" | "unavailable" | "error";

export interface CaseEnrichment {
  state: EnrichmentState;
  facts: CaseFact[];
  message?: string;
  retry?: () => void;
}
