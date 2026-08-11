import { lazy } from "react";
import type { LabDefinition } from "./labTypes";
import { CORE_LAB_PARITY } from "./legacyParity";

// Lazy-load lab components so only the active lab's code is downloaded
const Lab1Content = lazy(() => import("./labs/Lab1Content").then(m => ({ default: m.Lab1Content })));
const Lab2Content = lazy(() => import("./labs/Lab2Content").then(m => ({ default: m.Lab2Content })));
const Lab3Content = lazy(() => import("./labs/Lab3Content").then(m => ({ default: m.Lab3Content })));
const Lab4Content = lazy(() => import("./labs/Lab4Content").then(m => ({ default: m.Lab4Content })));
const Lab5Content = lazy(() => import("./labs/Lab5Content").then(m => ({ default: m.Lab5Content })));
const Lab6Content = lazy(() => import("./labs/Lab6Content").then(m => ({ default: m.Lab6Content })));
const Lab7Content = lazy(() => import("./labs/Lab7Content").then(m => ({ default: m.Lab7Content })));
const Lab8Content = lazy(() => import("./labs/Lab8Content").then(m => ({ default: m.Lab8Content })));
const Lab9Content = lazy(() => import("./labs/Lab9Content").then(m => ({ default: m.Lab9Content })));
const GbpEurRailsContent = lazy(() => import("./labs/GbpEurRailsContent").then(m => ({ default: m.GbpEurRailsContent })));
const CadRailsContent = lazy(() => import("./labs/CadRailsContent").then(m => ({ default: m.CadRailsContent })));
const FeesFxContent = lazy(() => import("./labs/FeesFxContent").then(m => ({ default: m.FeesFxContent })));
const SanctionsContent = lazy(() => import("./labs/SanctionsContent").then(m => ({ default: m.SanctionsContent })));
const ExceptionsReturnsContent = lazy(() => import("./labs/ExceptionsReturnsContent").then(m => ({ default: m.ExceptionsReturnsContent })));
const OpsRepairContent = lazy(() => import("./labs/OpsRepairContent").then(m => ({ default: m.OpsRepairContent })));
const CapstoneContent = lazy(() => import("./labs/CapstoneContent").then(m => ({ default: m.CapstoneContent })));

export const LAB_REGISTRY: Record<string, LabDefinition> = {
  "lab-1": { component: Lab1Content, requiredCheckpoints: CORE_LAB_PARITY["lab-1"].requiredCheckpoints },
  "lab-2": { component: Lab2Content, requiredCheckpoints: CORE_LAB_PARITY["lab-2"].requiredCheckpoints },
  "lab-3": { component: Lab3Content, requiredCheckpoints: CORE_LAB_PARITY["lab-3"].requiredCheckpoints },
  "lab-4": { component: Lab4Content, requiredCheckpoints: CORE_LAB_PARITY["lab-4"].requiredCheckpoints },
  "lab-5": { component: Lab5Content, requiredCheckpoints: CORE_LAB_PARITY["lab-5"].requiredCheckpoints },
  "lab-6": { component: Lab6Content, requiredCheckpoints: CORE_LAB_PARITY["lab-6"].requiredCheckpoints },
  "lab-7": { component: Lab7Content, requiredCheckpoints: CORE_LAB_PARITY["lab-7"].requiredCheckpoints },
  "lab-8": { component: Lab8Content, requiredCheckpoints: CORE_LAB_PARITY["lab-8"].requiredCheckpoints },
  "lab-9": { component: Lab9Content, requiredCheckpoints: CORE_LAB_PARITY["lab-9"].requiredCheckpoints },
  "gbp-eur-rails": { component: GbpEurRailsContent, requiredCheckpoints: CORE_LAB_PARITY["gbp-eur-rails"].requiredCheckpoints },
  "cad-rails": { component: CadRailsContent, requiredCheckpoints: CORE_LAB_PARITY["cad-rails"].requiredCheckpoints },
  "fees-fx": { component: FeesFxContent, requiredCheckpoints: CORE_LAB_PARITY["fees-fx"].requiredCheckpoints },
  "sanctions": { component: SanctionsContent, requiredCheckpoints: CORE_LAB_PARITY["sanctions"].requiredCheckpoints },
  "exceptions-returns": { component: ExceptionsReturnsContent, requiredCheckpoints: CORE_LAB_PARITY["exceptions-returns"].requiredCheckpoints },
  "ops-repair": { component: OpsRepairContent, requiredCheckpoints: CORE_LAB_PARITY["ops-repair"].requiredCheckpoints },
  "capstone": { component: CapstoneContent, requiredCheckpoints: CORE_LAB_PARITY["capstone"].requiredCheckpoints },
};

export function getLabDefinition(moduleId: string): LabDefinition | undefined {
  return LAB_REGISTRY[moduleId];
}
