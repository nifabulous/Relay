import { describe, it, expect } from "vitest";
import type {
  CaseDefinition,
  CaseFact,
  RailOption,
  RecommendationDraft,
  SourceClaim,
} from "./caseTypes";
import {
  validateShortlist,
  evaluateRecommendation,
} from "./caseEvaluator";
import { supplierCase } from "./caseCatalog";

// ─── Test fixtures ──────────────────────────────────────────────────────────
// A minimal, realistic Canada→US supplier case used to exercise the evaluator
// in isolation. The same rail/fact ids appear in the real catalog so the
// keyword contract (urgency/tracking/cost) is documented here.

const sim: SourceClaim = {
  source: "Relay scheme reference (simulation)",
  owner: "Relay Learn",
  verifiedAt: "2026-02-01",
  reviewBy: "2026-08-01",
  jurisdiction: "CA→US",
  currency: "USD",
  scope: "simulation-only",
};

function fact(
  id: string,
  value: string,
  state: CaseFact["state"] = "supplied",
): CaseFact {
  return { id, label: id, value, state, requestable: state !== "supplied" };
}

const RAILS: RailOption[] = [
  {
    id: "interac-etransfer",
    name: "Interac e-Transfer",
    eligibility: "Domestic CAD transfers within Canada only.",
    requiredFacts: ["destination-country", "destination-currency"],
    reasons: ["Instant CAD settlement"],
    source: sim,
  },
  {
    id: "cross-border-ach",
    name: "Cross-border ACH",
    eligibility: "USD payments to the United States via ACH; low cost.",
    requiredFacts: ["beneficiary-bank", "destination-currency", "amount", "price-sensitivity"],
    reasons: ["Low fees", "Batch settlement, slower arrival"],
    source: sim,
  },
  {
    id: "swift-fedwire",
    name: "SWIFT wire to Fedwire",
    eligibility: "USD payments to the United States via Fedwire; fast and tracked.",
    requiredFacts: ["beneficiary-bank", "destination-currency", "amount", "urgency", "tracking-need"],
    reasons: ["Fast same-day USD value", "Full UETR tracking confirmation"],
    source: sim,
  },
];

function makeCase(overrides: Partial<CaseDefinition> = {}): CaseDefinition {
  return {
    id: "canada-us-supplier",
    title: "Supplier payment (test)",
    customerRequest: "Pay a US supplier in USD.",
    verifiedAt: "2026-02-01",
    reviewBy: "2026-08-01",
    reviewStatus: "current",
    facts: [
      fact("destination-country", "United States"),
      fact("destination-currency", "USD"),
      fact("amount", "USD 48000"),
      fact("urgency", "Needed within 2 business days"),
      fact("price-sensitivity", "Fee-conscious", "gathered"),
      fact("tracking-need", "Wants tracking", "gathered"),
      fact("beneficiary-bank", "US bank, FW routing"),
      fact("arrival-expectation", "Arrive within 2 business days"),
      fact("intermediary", "Via BNY Mellon (simulation)", "gathered"),
      fact("institution-variation", "Outcome varies by sender bank", "gathered"),
    ],
    rails: RAILS,
    transfer: {
      id: "canada-us-supplier-transfer",
      customerRequest: "Close transfer variant.",
      facts: [fact("destination-currency", "USD"), fact("amount", "USD 12000")],
      rails: [RAILS[2]],
    },
    ...overrides,
  };
}

/** A fully-reasoned draft picking the given rail. */
function fullDraft(railId: string): RecommendationDraft {
  return {
    shortlist: [railId],
    selectedRail: railId,
    reasons: [
      `${railId} meets the 2-business-day urgency because it is fast`,
      "UETR tracking satisfies the customer's tracking need",
      "USD wire avoids CAD conversion at the domestic rail",
    ],
    conditions: ["Confirm beneficiary FW routing before release"],
    priceExpectation: "Sender-pays correspondent fee of roughly USD 25-40 plus FX spread.",
    arrivalExpectation: "Value to beneficiary within 1-2 business days.",
    trackingExpectation: "UETR issued; confirmation of credit available via gpi tracking.",
    customerExplanation: "We will wire USD via Fedwire so the supplier is credited before the deadline.",
  };
}

// ─── validateShortlist ──────────────────────────────────────────────────────

describe("validateShortlist", () => {
  it("flags an ineligible domestic rail as invalid", () => {
    const result = validateShortlist(makeCase(), {
      ...fullDraft("interac-etransfer"),
      shortlist: ["interac-etransfer"],
      selectedRail: "interac-etransfer",
    });
    expect(result.invalidRailIds).toContain("interac-etransfer");
  });

  it("reports no invalid rails when only eligible rails are shortlisted", () => {
    const result = validateShortlist(makeCase(), {
      ...fullDraft("swift-fedwire"),
      shortlist: ["cross-border-ach", "swift-fedwire"],
      selectedRail: "swift-fedwire",
    });
    expect(result.invalidRailIds).toEqual([]);
  });

  it("reports required facts still unknown for a shortlisted rail", () => {
    const definition = makeCase({
      facts: makeCase().facts.map((f) =>
        f.id === "tracking-need" || f.id === "urgency" ? { ...f, state: "unknown" } : f,
      ),
    });
    const result = validateShortlist(definition, {
      ...fullDraft("swift-fedwire"),
      shortlist: ["swift-fedwire"],
      selectedRail: "swift-fedwire",
    });
    expect(result.invalidRailIds).toEqual([]);
    expect(result.missingFactIds).toEqual(expect.arrayContaining(["urgency", "tracking-need"]));
  });

  it("returns empty lists for an empty shortlist", () => {
    const result = validateShortlist(makeCase(), {
      shortlist: [],
      selectedRail: null,
      reasons: [],
      conditions: [],
      priceExpectation: "",
      arrivalExpectation: "",
      trackingExpectation: "",
      customerExplanation: "",
    });
    expect(result.invalidRailIds).toEqual([]);
    expect(result.missingFactIds).toEqual([]);
  });
});

// ─── evaluateRecommendation — quality tiers ─────────────────────────────────

describe("evaluateRecommendation quality tiers", () => {
  it("rates an ineligible selected rail as invalid", () => {
    const outcome = evaluateRecommendation(makeCase(), {
      ...fullDraft("interac-etransfer"),
      shortlist: ["interac-etransfer"],
      selectedRail: "interac-etransfer",
    });
    expect(outcome.quality).toBe("invalid");
    expect(outcome.invalidRailIds).toContain("interac-etransfer");
  });

  it("rates an eligible rail with thin reasoning as possible", () => {
    const thin: RecommendationDraft = {
      shortlist: ["swift-fedwire"],
      selectedRail: "swift-fedwire",
      reasons: [],
      conditions: [],
      priceExpectation: "",
      arrivalExpectation: "",
      trackingExpectation: "",
      customerExplanation: "wire it",
    };
    const outcome = evaluateRecommendation(makeCase(), thin);
    expect(outcome.quality).toBe("possible");
    expect(outcome.reasoningGap).not.toBeNull();
  });

  it("rates an eligible, fully-reasoned but non-best-fit rail as defensible", () => {
    const outcome = evaluateRecommendation(
      makeCase(),
      fullDraft("cross-border-ach"),
    );
    expect(outcome.quality).toBe("defensible");
    expect(outcome.missingFactIds).toEqual([]);
  });

  it("rates the best-fit rail under disclosed priorities as preferred", () => {
    const outcome = evaluateRecommendation(makeCase(), fullDraft("swift-fedwire"));
    expect(outcome.quality).toBe("preferred");
    expect(outcome.soundReasoning.length).toBeGreaterThan(0);
    expect(outcome.reasoningGap).toBeNull();
  });

  it("rates an empty shortlist as invalid with a no-selection consequence", () => {
    const outcome = evaluateRecommendation(makeCase(), {
      shortlist: [],
      selectedRail: null,
      reasons: [],
      conditions: [],
      priceExpectation: "",
      arrivalExpectation: "",
      trackingExpectation: "",
      customerExplanation: "",
    });
    expect(outcome.quality).toBe("invalid");
    expect(outcome.invalidRailIds).toEqual([]);
    expect(outcome.missingFactIds).toEqual([]);
    expect(outcome.consequence.toLowerCase()).toContain("no rail");
  });

  it("rates a selected rail whose required facts are unknown as invalid", () => {
    const definition = makeCase({
      facts: makeCase().facts.map((f) =>
        f.id === "tracking-need" ? { ...f, state: "unknown" } : f,
      ),
    });
    const outcome = evaluateRecommendation(definition, fullDraft("swift-fedwire"));
    expect(outcome.quality).toBe("invalid");
    expect(outcome.missingFactIds).toContain("tracking-need");
  });
});

// ─── evaluateRecommendation — multiple defensible alternatives ───────────────

describe("evaluateRecommendation with multiple shortlisted alternatives", () => {
  const draft = (selected: string): RecommendationDraft => ({
    shortlist: ["cross-border-ach", "swift-fedwire"],
    selectedRail: selected,
    reasons: fullDraft(selected).reasons,
    conditions: ["Confirm beneficiary FW routing before release"],
    priceExpectation: "Sender-pays correspondent fee plus FX spread.",
    arrivalExpectation: "Value within 1-2 business days.",
    trackingExpectation: "UETR issued; gpi tracking available.",
    customerExplanation: "We will move USD cross-border to meet the deadline.",
  });

  it("selecting the best-fit rail among several yields preferred", () => {
    const outcome = evaluateRecommendation(makeCase(), draft("swift-fedwire"));
    expect(outcome.quality).toBe("preferred");
  });

  it("selecting a viable-but-suboptimal rail among several yields defensible (not preferred)", () => {
    const outcome = evaluateRecommendation(makeCase(), draft("cross-border-ach"));
    expect(outcome.quality).toBe("defensible");
  });
});

// ─── evaluateRecommendation — structure & purity ────────────────────────────

describe("evaluateRecommendation outcome shape", () => {
  it("returns a complete CaseOutcome object for a preferred decision", () => {
    const outcome = evaluateRecommendation(makeCase(), fullDraft("swift-fedwire"));
    expect(outcome).toHaveProperty("quality");
    expect(outcome).toHaveProperty("consequence");
    expect(outcome).toHaveProperty("soundReasoning");
    expect(outcome).toHaveProperty("reasoningGap");
    expect(outcome).toHaveProperty("nextAction");
    expect(outcome).toHaveProperty("invalidRailIds");
    expect(outcome).toHaveProperty("missingFactIds");
    expect(Array.isArray(outcome.soundReasoning)).toBe(true);
    expect(Array.isArray(outcome.invalidRailIds)).toBe(true);
    expect(Array.isArray(outcome.missingFactIds)).toBe(true);
  });

  it("is deterministic: same inputs produce identical outputs", () => {
    const draft = fullDraft("swift-fedwire");
    const a = evaluateRecommendation(makeCase(), draft);
    const b = evaluateRecommendation(makeCase(), draft);
    expect(a).toEqual(b);
  });

  it("evaluates the real supplierCase catalog entry without throwing", () => {
    const outcome = evaluateRecommendation(supplierCase, fullDraft("swift-fedwire"));
    expect(["invalid", "possible", "defensible", "preferred"]).toContain(outcome.quality);
  });
});
