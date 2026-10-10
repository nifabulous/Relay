/**
 * Content the renderer derives from the frontend's own data modules. These are
 * pure data with no CSS, DOM, environment or network access, so the build-time
 * renderer can import them (scripts/check-landing-boundary.mjs enforces the list).
 */
import { CASE_CATALOG } from "../../features/learn/cases/caseCatalog";
import { CURRICULUM } from "../../features/learn/curriculum";
import { QUESTION_BANK } from "../../features/learn/practice/questionBank";
import { DRILL_SIZE } from "../../features/learn/practice/selectDaily";
import type { LandingFacts, RailCurrency } from "./facts";
import { pad2 } from "./format";

export interface ModuleLink {
  number: string;
  title: string;
  href: string;
  kind: "lab" | "capstone";
}

export interface LearnSummary {
  modules: ModuleLink[];
  coreCount: number;
  labCount: number;
  questionCount: number;
  practiceModuleCount: number;
  drillSize: number;
  caseCount: number;
  caseCorridors: string[];
  firstCaseHref: string;
  firstModuleHref: string;
  minutes: { min: number; max: number };
}

/** Curriculum hrefs are relative to the SPA basename (/app). */
export function appHref(href: string): string {
  if (!href.startsWith("/")) throw new Error(`expected an absolute SPA path, got ${href}`);
  return `/app${href}`;
}

export function learnSummary(): LearnSummary {
  const modules = CURRICULUM.map((module, index): ModuleLink => ({
    number: pad2(index + 1),
    title: module.title,
    href: appHref(module.href),
    kind: module.category === "capstone" ? "capstone" : "lab",
  }));
  const first = CASE_CATALOG[0];
  if (!first) throw new Error("the Case Desk catalog is empty");
  return {
    modules,
    coreCount: CURRICULUM.filter((module) => module.category === "core").length,
    // labRegistry.test.ts pins one lab per curriculum entry.
    labCount: CURRICULUM.length,
    questionCount: QUESTION_BANK.length,
    practiceModuleCount: new Set(QUESTION_BANK.map((question) => question.moduleId)).size,
    drillSize: DRILL_SIZE,
    caseCount: CASE_CATALOG.length,
    caseCorridors: CASE_CATALOG.map((entry) => entry.recommendation.corridorLabel),
    firstCaseHref: `/app/learn/cases/${first.id}`,
    firstModuleHref: modules[0].href,
    minutes: {
      min: CURRICULUM.reduce((sum, module) => sum + module.duration.min, 0),
      max: CURRICULUM.reduce((sum, module) => sum + module.duration.max, 0),
    },
  };
}

/** Tab order for section 03: the demonstration currency first, then CAD for Interac. */
export const RAIL_TAB_ORDER = ["GBP", "CAD", "USD", "EUR", "NGN", "KES", "INR", "AUD", "JPY", "AED"];

export function orderedRails(facts: LandingFacts): RailCurrency[] {
  const byCode = new Map(facts.rails.currencies.map((currency) => [currency.code, currency]));
  const missing = facts.rails.currencies.filter((c) => !RAIL_TAB_ORDER.includes(c.code));
  if (missing.length > 0 || byCode.size !== RAIL_TAB_ORDER.length) {
    throw new Error(
      `RAIL_TAB_ORDER is out of step with the scheme data: ${facts.rails.currencies.map((c) => c.code).join(", ")}`,
    );
  }
  return RAIL_TAB_ORDER.map((code) => byCode.get(code)!);
}

/** Scheme names quoted in the section 03 lede, looked up in the data so they cannot drift. */
const HIGHLIGHTS: Array<[string, string]> = [
  ["CAD", "Interac"],
  ["GBP", "Faster Payments"],
  ["GBP", "CHAPS"],
  ["KES", "M-Pesa"],
  ["INR", "UPI"],
];

export function railHighlights(facts: LandingFacts): Array<{ code: string; scheme: string }> {
  return HIGHLIGHTS.map(([code, prefix]) => {
    const currency = facts.rails.currencies.find((c) => c.code === code);
    const scheme = currency?.schemes.find((s) => s.name.startsWith(prefix));
    if (!scheme) throw new Error(`no ${prefix} scheme for ${code} in the scheme data`);
    return { code, scheme: scheme.name };
  });
}
