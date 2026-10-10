import { describe, expect, it } from "vitest";
import { CASE_CATALOG } from "../../features/learn/cases/caseCatalog";
import { CURRICULUM } from "../../features/learn/curriculum";
import { QUESTION_BANK } from "../../features/learn/practice/questionBank";
import { appHref, learnSummary, orderedRails, RAIL_TAB_ORDER, railHighlights } from "./content";
import fixture from "./facts.fixture.json";
import { parseLandingFacts } from "./facts";
import { formatAmount, formatCount, formatHours, pad2 } from "./format";

const facts = parseLandingFacts(fixture);

describe("landing facts contract", () => {
  it("accepts the committed fixture and rejects drift", () => {
    expect(() => parseLandingFacts({ ...fixture, extra: 1 })).toThrow();
    expect(() => parseLandingFacts({ ...fixture, schemaVersion: 2 })).toThrow();
    expect(() => parseLandingFacts({ ...fixture, corridors: [] })).toThrow();
    expect(() => parseLandingFacts({ ...fixture, directory: { banks: -1, countries: 1 } })).toThrow();
  });
});

describe("content derived from the frontend's data modules", () => {
  const learn = learnSummary();

  it("lists every curriculum entry, in order, as an /app link", () => {
    expect(learn.modules.map((m) => m.title)).toEqual(CURRICULUM.map((m) => m.title));
    expect(learn.modules.map((m) => m.href)).toEqual(CURRICULUM.map((m) => `/app${m.href}`));
    expect(learn.modules.at(-1)!.kind).toBe("capstone");
    expect(learn.coreCount).toBe(CURRICULUM.filter((m) => m.category === "core").length);
  });

  it("counts questions, practice modules and cases from their sources", () => {
    expect(learn.questionCount).toBe(QUESTION_BANK.length);
    expect(learn.practiceModuleCount).toBe(new Set(QUESTION_BANK.map((q) => q.moduleId)).size);
    expect(learn.caseCount).toBe(CASE_CATALOG.length);
    expect(learn.caseCorridors).toEqual(CASE_CATALOG.map((c) => c.recommendation.corridorLabel));
    expect(learn.firstCaseHref).toBe(`/app/learn/cases/${CASE_CATALOG[0].id}`);
  });

  it("refuses an href that is not an absolute SPA path", () => {
    expect(appHref("/learn/lab-1")).toBe("/app/learn/lab-1");
    expect(() => appHref("learn/lab-1")).toThrow();
  });

  it("keeps the rail tab order a permutation of the scheme data", () => {
    expect([...RAIL_TAB_ORDER].sort()).toEqual(facts.rails.currencies.map((c) => c.code).sort());
    expect(orderedRails(facts).map((c) => c.code)).toEqual(RAIL_TAB_ORDER);
    const missing = { ...facts, rails: { ...facts.rails, currencies: facts.rails.currencies.slice(1) } };
    expect(() => orderedRails(missing)).toThrow(/out of step/);
  });

  it("looks the lede's scheme names up in the data", () => {
    expect(railHighlights(facts).map((h) => h.code)).toEqual(["CAD", "GBP", "GBP", "KES", "INR"]);
    const noInterac = {
      ...facts,
      rails: {
        ...facts.rails,
        currencies: facts.rails.currencies.map((c) => (c.code === "CAD" ? { ...c, schemes: c.schemes.filter((s) => !s.name.startsWith("Interac")) } : c)),
      },
    };
    expect(() => railHighlights(noInterac)).toThrow(/Interac/);
  });

  it("formats numbers one way", () => {
    expect(formatCount(12196)).toBe("12,196");
    expect(formatAmount(25000)).toBe("25,000.00");
    expect(formatHours(270)).toBe("4.5");
    expect(formatHours(360)).toBe("6");
    expect(pad2(7)).toBe("07");
  });
});
