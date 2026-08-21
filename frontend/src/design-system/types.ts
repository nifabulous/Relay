/**
 * Shared type definitions consumed across the design system and features.
 * Sourced from the plan's Shared Interfaces section.
 */

// Re-exported so existing imports (`import { ApiProblem } from "./types"`)
// keep working; the canonical definition lives with the transport layer.
export type { ApiProblem } from "../api/problem";

export type AsyncStatus =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "error"
  | "partial"
  | "unavailable";

export type CheckStatus = "passed" | "needs_attention" | "failed" | "unavailable";

/**
 * Statuses a PaymentRouteNode may wear. CheckStatus covers executed routes;
 * DecisionQuality grades like "possible" let suggested/hypothetical chains
 * avoid claiming a verification they never had.
 */
export type RouteNodeStatus = CheckStatus | DecisionQuality;

/**
 * Source-claim statuses used by the Case Desk's evidence layer. A fact's
 * SourceClaim is either verified (current, within its review-by date) or
 * under review (the source material is being refreshed). Distinct from
 * CheckStatus (check pass/fail) and DecisionQuality (recommendation grade).
 */
export type SourceStatus = "verified" | "under_review";

/**
 * Decision-quality grades, reused from the Case Desk domain. Re-exported here
 * so the design-system StatusChip can compose the full status union without a
 * circular dependency on the feature module. The canonical definition stays
 * in features/learn/cases/caseTypes.ts; this is a structural alias.
 */
export type DecisionQuality = "invalid" | "possible" | "defensible" | "preferred";

/**
 * The full union of statuses StatusChip can render. Composed exhaustively:
 * CheckStatus (legacy check pass/fail) + DecisionQuality (recommendation
 * grade) + SourceStatus (evidence provenance). Widening the `status` prop to
 * this union is non-breaking — every existing caller passes a CheckStatus
 * value, which remains a valid member.
 */
export type StatusChipStatus = CheckStatus | DecisionQuality | SourceStatus;

export type Workspace = "overview" | "learn" | "explore" | "operate";

export type RecommendationState = "conclusive" | "incomplete";

export interface PrimaryAction {
  kind: "explore_intro" | "resume_learn" | "resume_operate" | "next_learn" | "prepare_payment";
  href: string;
  label: string;
}

export interface PrepareDraft {
  schemaVersion: 1;
  id: string;
  updatedAt: string;
  beneficiaryIban: string;
  beneficiaryName: string;
  beneficiaryBic?: string;
  currency: string;
  amount: number | null;
  strictness: "lenient" | "standard" | "strict";
}

/**
 * Theme preference. Four states: "system" must stay distinguishable from an
 * explicit "light", because only "system" follows the OS. Collapsing to a
 * boolean would make "explicitly light" and "OS happens to be light"
 * indistinguishable, and the OS-change listener would then flip a user who
 * deliberately chose light. "dark" is the standard dark palette (blue-tinted);
 * "black" is an explicit OLED variant (neutral true-black canvas) — it never
 * follows the OS because no OS offers it.
 */
export type RelayTheme = "system" | "light" | "dark" | "black";

export interface RelayPreferences {
  schemaVersion: 1;
  reducedMotion: boolean;
  navigationDensity: "comfortable" | "compact";
  firstRunGuidanceSeen: string[];
  theme: RelayTheme;
}

export interface PaymentRouteNode {
  id: string;
  kind: "originator" | "intermediary" | "beneficiary";
  bic: string;
  name: string;
  status: RouteNodeStatus;
  amount?: string;
  fee?: string;
  timing?: string;
}
