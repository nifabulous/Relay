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
  isSubstantiveReason,
  MIN_REASON_CHARS,
  MIN_REASON_WORDS,
} from "./caseEvaluator";
import { supplierCase } from "./caseCatalog";

// ─── Test fixtures ──────────────────────────────────────────────────────────
// A minimal, realistic Canada→US supplier case used to exercise the evaluator
// in isolation. The same rail/fact ids appear in the real catalog so the
// keyword contract (urgency/tracking/cost) is documented here.
//
// T1: the four requestable facts ship `state: "unknown"` — exactly like the
// real catalog — so the evaluator's requestedFactIds gating is exercised. A
// helper `requested(...)` builds the requestedFacts set the way the UI does.

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

/**
 * The four requestable fact ids (mirrors the real catalog). Shipped as unknown
 * in makeCase() so the evaluator gates them on requestedFactIds, exactly as in
 * production.
 */
const REQUESTABLE_FACT_IDS = [
  "price-sensitivity",
  "tracking-need",
  "intermediary",
  "institution-variation",
] as const;

/** Default "fully investigated" set: every requestable fact was requested. */
function requestedAll(): Set<string> {
  return new Set(REQUESTABLE_FACT_IDS);
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
      // T1: requestable facts ship `unknown`. The evaluator treats them as
      // gathered ONLY when their id is in the passed requestedFactIds set.
      fact("price-sensitivity", "Fee-conscious", "unknown"),
      fact("tracking-need", "Wants tracking", "unknown"),
      fact("beneficiary-bank", "US bank, FW routing"),
      fact("arrival-expectation", "Arrive within 2 business days"),
      fact("intermediary", "Via BNY Mellon (simulation)", "unknown"),
      fact("institution-variation", "Outcome varies by sender bank", "unknown"),
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
    const result = validateShortlist(
      makeCase(),
      {
        ...fullDraft("interac-etransfer"),
        shortlist: ["interac-etransfer"],
        selectedRail: "interac-etransfer",
      },
      requestedAll(),
    );
    expect(result.invalidRailIds).toContain("interac-etransfer");
  });

  it("reports no invalid rails when only eligible rails are shortlisted", () => {
    const result = validateShortlist(
      makeCase(),
      {
        ...fullDraft("swift-fedwire"),
        shortlist: ["cross-border-ach", "swift-fedwire"],
        selectedRail: "swift-fedwire",
      },
      requestedAll(),
    );
    expect(result.invalidRailIds).toEqual([]);
  });

  it("reports required facts still unknown for a shortlisted rail when the learner did not request them", () => {
    // T1: tracking-need ships unknown in makeCase(); urgency is supplied. The
    // learner did NOT request tracking-need (empty requestedFactIds set), so
    // it is missing. urgency is supplied and counts as gathered regardless.
    const result = validateShortlist(
      makeCase(),
      {
        ...fullDraft("swift-fedwire"),
        shortlist: ["swift-fedwire"],
        selectedRail: "swift-fedwire",
      },
      // requestedFactIds intentionally EMPTY: tracking-need was never requested.
      new Set(),
    );
    expect(result.invalidRailIds).toEqual([]);
    expect(result.missingFactIds).toEqual(expect.arrayContaining(["tracking-need"]));
    // urgency is a supplied (non-requestable) fact: never missing.
    expect(result.missingFactIds).not.toContain("urgency");
  });

  it("returns empty lists for an empty shortlist", () => {
    const result = validateShortlist(
      makeCase(),
      {
        shortlist: [],
        selectedRail: null,
        reasons: [],
        conditions: [],
        priceExpectation: "",
        arrivalExpectation: "",
        trackingExpectation: "",
        customerExplanation: "",
      },
      requestedAll(),
    );
    expect(result.invalidRailIds).toEqual([]);
    expect(result.missingFactIds).toEqual([]);
  });
});

// ─── evaluateRecommendation — quality tiers ─────────────────────────────────

describe("evaluateRecommendation quality tiers", () => {
  it("rates an ineligible selected rail as invalid", () => {
    const outcome = evaluateRecommendation(
      makeCase(),
      {
        ...fullDraft("interac-etransfer"),
        shortlist: ["interac-etransfer"],
        selectedRail: "interac-etransfer",
      },
      requestedAll(),
    );
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
    const outcome = evaluateRecommendation(makeCase(), thin, requestedAll());
    expect(outcome.quality).toBe("possible");
    expect(outcome.reasoningGap).not.toBeNull();
  });

  it("rates an eligible, fully-reasoned but non-best-fit rail as defensible", () => {
    const outcome = evaluateRecommendation(
      makeCase(),
      fullDraft("cross-border-ach"),
      requestedAll(),
    );
    expect(outcome.quality).toBe("defensible");
    expect(outcome.missingFactIds).toEqual([]);
  });

  it("rates the best-fit rail under disclosed priorities as preferred", () => {
    const outcome = evaluateRecommendation(
      makeCase(),
      fullDraft("swift-fedwire"),
      requestedAll(),
    );
    expect(outcome.quality).toBe("preferred");
    expect(outcome.soundReasoning.length).toBeGreaterThan(0);
    expect(outcome.reasoningGap).toBeNull();
  });

  it("rates an empty shortlist as invalid with a no-selection consequence", () => {
    const outcome = evaluateRecommendation(
      makeCase(),
      {
        shortlist: [],
        selectedRail: null,
        reasons: [],
        conditions: [],
        priceExpectation: "",
        arrivalExpectation: "",
        trackingExpectation: "",
        customerExplanation: "",
      },
      requestedAll(),
    );
    expect(outcome.quality).toBe("invalid");
    expect(outcome.invalidRailIds).toEqual([]);
    expect(outcome.missingFactIds).toEqual([]);
    expect(outcome.consequence.toLowerCase()).toContain("no rail");
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
    const outcome = evaluateRecommendation(
      makeCase(),
      draft("swift-fedwire"),
      requestedAll(),
    );
    expect(outcome.quality).toBe("preferred");
  });

  it("selecting a viable-but-suboptimal rail among several yields defensible (not preferred)", () => {
    const outcome = evaluateRecommendation(
      makeCase(),
      draft("cross-border-ach"),
      requestedAll(),
    );
    expect(outcome.quality).toBe("defensible");
    // Lock the bestFitRailId differentiator: the gap must name the better-fit rail.
    // This is the most regression-prone boundary between `defensible` and `preferred`.
    expect(outcome.reasoningGap).not.toBeNull();
    expect(outcome.reasoningGap).toContain("SWIFT wire to Fedwire");
  });

  it("tolerates duplicate rail ids in the shortlist without duplicate invalid ids", () => {
    // Shortlist is advisory; duplicates must not produce duplicate invalid entries.
    const result = validateShortlist(
      makeCase(),
      {
        ...fullDraft("interac-etransfer"),
        shortlist: ["interac-etransfer", "interac-etransfer"],
        selectedRail: "interac-etransfer",
      },
      requestedAll(),
    );
    expect(result.invalidRailIds).toEqual(["interac-etransfer"]);
  });
});

// ─── evaluateRecommendation — structure & purity ────────────────────────────

describe("evaluateRecommendation outcome shape", () => {
  it("returns a complete CaseOutcome object for a preferred decision", () => {
    const outcome = evaluateRecommendation(
      makeCase(),
      fullDraft("swift-fedwire"),
      requestedAll(),
    );
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
    const a = evaluateRecommendation(makeCase(), draft, requestedAll());
    const b = evaluateRecommendation(makeCase(), draft, requestedAll());
    expect(a).toEqual(b);
  });

  it("evaluates the real supplierCase catalog entry without throwing", () => {
    const outcome = evaluateRecommendation(
      supplierCase,
      fullDraft("swift-fedwire"),
      requestedAll(),
    );
    expect(["invalid", "possible", "defensible", "preferred"]).toContain(outcome.quality);
  });

  it("locks the catalog↔evaluator contract: swift-fedwire is preferred against the real catalog", () => {
    // Canary for every future edit to caseCatalog.ts OR caseEvaluator.ts: the
    // authored priorities and rail cues must keep producing `preferred` here —
    // but ONLY when the learner has actually requested the relevant facts.
    const outcome = evaluateRecommendation(
      supplierCase,
      fullDraft("swift-fedwire"),
      requestedAll(),
    );
    expect(outcome.quality).toBe("preferred");
    expect(outcome.reasoningGap).toBeNull();
  });

  it("locks the catalog↔evaluator contract: cross-border-ach is defensible against the real catalog", () => {
    const outcome = evaluateRecommendation(
      supplierCase,
      fullDraft("cross-border-ach"),
      requestedAll(),
    );
    expect(outcome.quality).toBe("defensible");
    expect(outcome.reasoningGap).not.toBeNull();
  });
});

// =============================================================================
// T1 — the investigation is load-bearing (gating on requestedFactIds).
// A learner who skips the investigation cannot reach `preferred` (or even
// `defensible`/`possible` for a rail whose requiredFacts include un-requested
// requestable facts). The evaluator must treat a requestable fact as "unknown
// for scoring purposes" if its id is NOT in the requestedFactIds set, even
// though its authored value is present in the catalog.
// =============================================================================

describe("evaluateRecommendation — T1 investigation gating (requestedFactIds)", () => {
  it("reaches `preferred` when all swift-fedwire required facts are requested + substantive reason + full expectations", () => {
    // The acceptance contract: a fully-investigated learner who requests the
    // facts swift-fedwire requires (urgency is supplied; tracking-need is
    // requestable), picks swift-fedwire, types a substantive reason, and fills
    // the three expectations reaches `preferred`.
    const outcome = evaluateRecommendation(
      supplierCase,
      fullDraft("swift-fedwire"),
      requestedAll(),
    );
    expect(outcome.quality).toBe("preferred");
    expect(outcome.missingFactIds).toEqual([]);
  });

  it("returns `invalid` (missing required facts) when swift-fedwire is selected but tracking-need was NOT requested", () => {
    // tracking-need ships unknown in the catalog and is required by swift-fedwire.
    // A learner who skipped it cannot responsibly recommend swift-fedwire: the
    // evaluator must fail with `invalid` and name tracking-need as missing.
    const outcome = evaluateRecommendation(
      supplierCase,
      fullDraft("swift-fedwire"),
      // Every requestable fact EXCEPT tracking-need was requested.
      new Set(["price-sensitivity", "intermediary", "institution-variation"]),
    );
    expect(outcome.quality).toBe("invalid");
    expect(outcome.missingFactIds).toContain("tracking-need");
  });

  it("returns `invalid` when NO requestable facts were requested (the whole investigation was skipped)", () => {
    // The most important regression: a learner who skips the investigation
    // entirely cannot reach `preferred` by filling four boxes + selecting
    // swift-fedwire. The evaluator must block at `invalid`.
    const outcome = evaluateRecommendation(
      supplierCase,
      fullDraft("swift-fedwire"),
      new Set(),
    );
    expect(outcome.quality).toBe("invalid");
    expect(outcome.missingFactIds).toEqual(expect.arrayContaining(["tracking-need"]));
  });

  it("treats a supplied (non-requestable) required fact as always gathered (urgency, beneficiary-bank, amount, destination-currency)", () => {
    // Sanity: the gating only affects REQUESTABLE facts. Supplied facts (urgency,
    // beneficiary-bank, amount, destination-currency) are always gathered, so a
    // learner who requests ONLY tracking-need (the only requestable required
    // fact for swift-fedwire) still has all of swift-fedwire's required facts.
    const outcome = evaluateRecommendation(
      supplierCase,
      fullDraft("swift-fedwire"),
      new Set(["tracking-need"]),
    );
    // Not preferred (tracking + cost priorities only partially disclosed), but
    // NOT invalid for missing facts either — all required facts are gathered.
    expect(outcome.quality).not.toBe("invalid");
    expect(outcome.missingFactIds).toEqual([]);
  });

  it("cannot reach `preferred` when tracking-need was not requested (no tracking priority → no best-fit)", () => {
    // Best-fit selection needs the disclosed tracking priority, which only
    // fires once tracking-need is requested. Even if the learner requests
    // price-sensitivity (cost) and the other facts, without tracking-need the
    // best-fit rail is undefined → swift-fedwire cannot be `preferred`.
    const outcome = evaluateRecommendation(
      supplierCase,
      fullDraft("swift-fedwire"),
      new Set(["price-sensitivity", "intermediary", "institution-variation"]),
    );
    // Either invalid (tracking-need is required by swift-fedwire) or, if all
    // required facts happen to be gathered, defensible — but never preferred.
    expect(outcome.quality).not.toBe("preferred");
  });
});

// =============================================================================
// T1b — the reasoning check is more than `isNonEmpty`.
// A learner who requests every fact cheaply AND types filler ("x", "asdf",
// "fast") in the Primary reason field must NOT reach `preferred` (or
// `defensible`). The reason must clear a minimum substantive threshold
// (length + word count). Genuine one-sentence reasons pass; filler does not.
// =============================================================================

describe("evaluateRecommendation — T1b substantive-reason threshold", () => {
  it("exposes the threshold constants so they are tunable and documented", () => {
    expect(typeof MIN_REASON_CHARS).toBe("number");
    expect(MIN_REASON_CHARS).toBeGreaterThan(0);
    expect(typeof MIN_REASON_WORDS).toBe("number");
    expect(MIN_REASON_WORDS).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["x"],
    ["asdf"],
    ["fast"],
    ["reason"],
    ["a b"],
  ])("rejects filler reason %q via isSubstantiveReason", (filler) => {
    expect(isSubstantiveReason(filler)).toBe(false);
  });

  it.each([
    // The exact real sentence the existing RecommendationFlow test types — must
    // still pass so the UI reachability test stays green.
    ["Fast same-day USD value protects the 2-business-day deadline."],
    // Other genuine one-sentence reasons.
    ["UETR tracking confirms credit before the shipment deadline."],
    ["The wire fee is justified by the two-day release window."],
  ])("accepts a genuine reason: %q", (reason) => {
    expect(isSubstantiveReason(reason)).toBe(true);
  });

  it("returns `possible` (NOT defensible/preferred) when the reason is filler, even with full investigation + expectations", () => {
    // The acceptance contract: filler in the Primary reason field blocks the
    // defensible/preferred tiers. The learner did everything else right.
    const fillerDraft: RecommendationDraft = {
      ...fullDraft("swift-fedwire"),
      reasons: ["x"],
    };
    const outcome = evaluateRecommendation(
      supplierCase,
      fillerDraft,
      requestedAll(),
    );
    expect(outcome.quality).toBe("possible");
    expect(outcome.reasoningGap).not.toBeNull();
  });

  it.each([
    ["x"],
    ["asdf"],
    ["fast"],
  ])("returns `possible` for filler reason %q with full investigation", (filler) => {
    const fillerDraft: RecommendationDraft = {
      ...fullDraft("swift-fedwire"),
      reasons: [filler],
    };
    const outcome = evaluateRecommendation(
      supplierCase,
      fillerDraft,
      requestedAll(),
    );
    // Filler never reaches defensible/preferred.
    expect(["invalid", "possible"]).toContain(outcome.quality);
    expect(outcome.quality).not.toBe("defensible");
    expect(outcome.quality).not.toBe("preferred");
  });

  it("reaches `preferred` with a substantive (≥ threshold) primary reason", () => {
    const outcome = evaluateRecommendation(
      supplierCase,
      fullDraft("swift-fedwire"),
      requestedAll(),
    );
    expect(outcome.quality).toBe("preferred");
  });

  it("a substantive reason in ANY reasons slot satisfies the gate (not just slot 0)", () => {
    // The reasons array is the contract; slot position is not. A learner who
    // leaves the Primary input empty but types a real reason in a later slot
    // still clears the bar. (Phase 1 UI surfaces one input, but the evaluator
    // is array-shaped — keep the contract honest.)
    const draft: RecommendationDraft = {
      ...fullDraft("swift-fedwire"),
      reasons: ["", "Fast same-day USD value protects the 2-business-day deadline."],
    };
    const outcome = evaluateRecommendation(supplierCase, draft, requestedAll());
    expect(outcome.quality).toBe("preferred");
  });
});
