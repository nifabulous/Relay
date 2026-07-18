import type { LabDefinition, LabContentProps } from "./labTypes";
import { CORE_LAB_PARITY } from "./legacyParity";
import { Lab1Content } from "./labs/Lab1Content";
import { Lab2Content } from "./labs/Lab2Content";
import { Lab3Content } from "./labs/Lab3Content";
import { Lab4Content } from "./labs/Lab4Content";
import { Lab5Content } from "./labs/Lab5Content";
import { Lab6Content } from "./labs/Lab6Content";

/**
 * Temporary placeholder content component.
 * Each lab task replaces one entry with the real content component.
 */
function UnavailableLabContent({ moduleId }: LabContentProps) {
  return (
    <div className="lab-unavailable">
      <p>Interactive content for this module is being developed.</p>
      <p className="lab-unavailable__id mono">{moduleId}</p>
    </div>
  );
}

/**
 * Build a placeholder definition from a parity entry.
 * Replaced one-at-a-time as labs are ported.
 */
function placeholderDef(checkpoints: readonly string[]): LabDefinition {
  return {
    component: UnavailableLabContent,
    requiredCheckpoints: checkpoints,
  };
}

/**
 * The lab registry maps module IDs to their content component
 * and required completion checkpoints.
 *
 * Initially all entries use the placeholder. Each lab task replaces
 * one entry with the real content component.
 */
export const LAB_REGISTRY: Record<string, LabDefinition> = {
  "lab-1": { component: Lab1Content, requiredCheckpoints: CORE_LAB_PARITY["lab-1"].requiredCheckpoints },
  "lab-2": { component: Lab2Content, requiredCheckpoints: CORE_LAB_PARITY["lab-2"].requiredCheckpoints },
  "lab-3": { component: Lab3Content, requiredCheckpoints: CORE_LAB_PARITY["lab-3"].requiredCheckpoints },
  "lab-4": { component: Lab4Content, requiredCheckpoints: CORE_LAB_PARITY["lab-4"].requiredCheckpoints },
  "lab-5": { component: Lab5Content, requiredCheckpoints: CORE_LAB_PARITY["lab-5"].requiredCheckpoints },
  "lab-6": { component: Lab6Content, requiredCheckpoints: CORE_LAB_PARITY["lab-6"].requiredCheckpoints },
  "lab-7": placeholderDef(CORE_LAB_PARITY["lab-7"].requiredCheckpoints),
  "capstone": placeholderDef(CORE_LAB_PARITY["capstone"].requiredCheckpoints),
};

export function getLabDefinition(moduleId: string): LabDefinition | undefined {
  return LAB_REGISTRY[moduleId];
}

/**
 * Replace a lab definition. Used by lab content files as they are ported.
 * Call this at module load time (not inside a component).
 */
export function registerLab(moduleId: string, definition: LabDefinition): void {
  LAB_REGISTRY[moduleId] = definition;
}
