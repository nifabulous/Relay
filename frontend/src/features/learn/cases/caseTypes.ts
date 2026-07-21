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

export type CaseId = "canada-us-supplier";
export type CasePhase = "brief" | "investigate" | "recommend" | "resolve" | "debrief";
export type DecisionQuality = "invalid" | "possible" | "defensible" | "preferred";

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
  reasons: string[];
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
  id: "canada-us-supplier-transfer";
  customerRequest: string;
  facts: CaseFact[];
  rails: RailOption[];
}

export interface CaseDefinition {
  id: CaseId;
  title: string;
  customerRequest: string;
  verifiedAt: string;
  reviewBy: string;
  reviewStatus: "current" | "under_review";
  facts: CaseFact[];
  rails: RailOption[];
  transfer: TransferDefinition;
}

export interface RecommendationDraft {
  shortlist: string[];
  selectedRail: string | null;
  reasons: string[];
  conditions: string[];
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
