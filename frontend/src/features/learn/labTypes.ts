import type { ComponentType } from "react";

export type LabCheckpointId = string;

export interface LabContentProps {
  moduleId: string;
  isComplete: boolean;
  onCheckpoint: (checkpointId: LabCheckpointId) => void;
}

export interface LabDefinition {
  component: ComponentType<LabContentProps>;
  requiredCheckpoints: readonly LabCheckpointId[];
}

export interface ExerciseResult {
  correct: boolean;
  feedback: string;
}

export type ExerciseChecker = (
  input: string,
  signal: AbortSignal,
) => ExerciseResult | Promise<ExerciseResult>;

export interface SchemeInfo {
  name: string;
  speed: string;
  limit: string;
  cost: string;
  useCase: string;
  operator: string;
}

export interface SchemesResponse {
  currency: string;
  country: string;
  countryCode: string;
  iban: boolean;
  localIdentifier: string;
  schemes: SchemeInfo[];
}

export interface TrackCreateRequest {
  originator_bic: string;
  originator_name: string;
  beneficiary_bic: string;
  beneficiary_name: string;
  currency: string;
  amount: number;
  charge_code: "OUR" | "SHA" | "BEN";
  intermediary_bics: string[];
  intermediary_names: string[];
  outcome: "credited" | "rejected";
}
