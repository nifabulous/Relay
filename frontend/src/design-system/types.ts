/**
 * Shared type definitions consumed across the design system and features.
 * Sourced from the plan's Shared Interfaces section.
 */

export type AsyncStatus =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "error"
  | "partial"
  | "unavailable";

export type CheckStatus = "passed" | "needs_attention" | "failed" | "unavailable";

export type Workspace = "overview" | "learn" | "explore" | "operate";

export type RecommendationState = "conclusive" | "incomplete";

export interface ApiProblem {
  status: number;
  title: string;
  detail: string;
  fieldErrors: Record<string, string[]>;
  retryable: boolean;
}

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

export interface RelayPreferences {
  schemaVersion: 1;
  reducedMotion: boolean;
  navigationDensity: "comfortable" | "compact";
  firstRunGuidanceSeen: string[];
}

export interface PaymentRouteNode {
  id: string;
  kind: "originator" | "intermediary" | "beneficiary";
  bic: string;
  name: string;
  status: CheckStatus;
  amount?: string;
  fee?: string;
  timing?: string;
}
