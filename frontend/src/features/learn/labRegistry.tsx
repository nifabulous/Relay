import type { LabDefinition } from "./labTypes";
import { CORE_LAB_PARITY } from "./legacyParity";
import { Lab1Content } from "./labs/Lab1Content";
import { Lab2Content } from "./labs/Lab2Content";
import { Lab3Content } from "./labs/Lab3Content";
import { Lab4Content } from "./labs/Lab4Content";
import { Lab5Content } from "./labs/Lab5Content";
import { Lab6Content } from "./labs/Lab6Content";
import { Lab7Content } from "./labs/Lab7Content";
import { CapstoneContent } from "./labs/CapstoneContent";

/**
 * The lab registry maps module IDs to their content component
 * and required completion checkpoints.
 *
 * All 8 modules now have real interactive content.
 */
export const LAB_REGISTRY: Record<string, LabDefinition> = {
  "lab-1": { component: Lab1Content, requiredCheckpoints: CORE_LAB_PARITY["lab-1"].requiredCheckpoints },
  "lab-2": { component: Lab2Content, requiredCheckpoints: CORE_LAB_PARITY["lab-2"].requiredCheckpoints },
  "lab-3": { component: Lab3Content, requiredCheckpoints: CORE_LAB_PARITY["lab-3"].requiredCheckpoints },
  "lab-4": { component: Lab4Content, requiredCheckpoints: CORE_LAB_PARITY["lab-4"].requiredCheckpoints },
  "lab-5": { component: Lab5Content, requiredCheckpoints: CORE_LAB_PARITY["lab-5"].requiredCheckpoints },
  "lab-6": { component: Lab6Content, requiredCheckpoints: CORE_LAB_PARITY["lab-6"].requiredCheckpoints },
  "lab-7": { component: Lab7Content, requiredCheckpoints: CORE_LAB_PARITY["lab-7"].requiredCheckpoints },
  "capstone": { component: CapstoneContent, requiredCheckpoints: CORE_LAB_PARITY["capstone"].requiredCheckpoints },
};

export function getLabDefinition(moduleId: string): LabDefinition | undefined {
  return LAB_REGISTRY[moduleId];
}
