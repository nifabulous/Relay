import { describe, it, expect } from "vitest";
import { CASE_CATALOG, getCaseById, supplierCase } from "./caseCatalog";
import { disclosedPriorities, bestFitRailId } from "./caseEvaluator";
import type { SourceClaim } from "./caseTypes";

// ─── supplierCase: identity & review ────────────────────────────────────────

describe("supplierCase identity", () => {
  it("uses the fixed CaseId", () => {
    expect(supplierCase.id).toBe("canada-us-supplier");
  });

  it("is marked current (not under review)", () => {
    expect(supplierCase.reviewStatus).toBe("current");
  });

  it("has verifiedAt and reviewBy ISO dates with reviewBy later than verifiedAt", () => {
    expect(supplierCase.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(supplierCase.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(new Date(supplierCase.reviewBy).getTime()).toBeGreaterThan(
      new Date(supplierCase.verifiedAt).getTime(),
    );
  });

  it("has a human-readable customer request that mentions the supplier payment", () => {
    expect(supplierCase.customerRequest.length).toBeGreaterThan(0);
    expect(supplierCase.customerRequest.toLowerCase()).toContain("supplier");
  });
});

// ─── supplierCase: facts cover the investigation surface ────────────────────

describe("supplierCase facts", () => {
  const requiredFactIds = [
    "destination-country",
    "destination-currency",
    "amount",
    "urgency",
    "price-sensitivity",
    "arrival-expectation",
    "tracking-need",
    "intermediary",
    "institution-variation",
    "beneficiary-bank",
  ];

  it.each(requiredFactIds)("includes the %s fact", (id) => {
    expect(supplierCase.facts.map((f) => f.id)).toContain(id);
  });

  it("marks the destination as United States and currency as USD", () => {
    const dest = supplierCase.facts.find((f) => f.id === "destination-country");
    expect(dest?.value).toMatch(/united states|u\.?s\.?/i);
    const ccy = supplierCase.facts.find((f) => f.id === "destination-currency");
    expect(ccy?.value).toMatch(/usd|u\.?s\.? dollar/i);
  });

  it("marks supplied facts with state 'supplied' and requestable facts with a non-supplied state", () => {
    const supplied = supplierCase.facts.filter((f) => f.state === "supplied");
    const requestable = supplierCase.facts.filter((f) => f.state !== "supplied");
    expect(supplied.length).toBeGreaterThan(0);
    expect(requestable.length).toBeGreaterThan(0);
    expect(requestable.every((f) => f.requestable === true)).toBe(true);
  });

  // ─── T1 regression guard: the investigation must be load-bearing ───────────
  // The four requestable facts (price-sensitivity, tracking-need, intermediary,
  // institution-variation) MUST ship `state: "unknown"` so their VALUES are not
  // visible in the EvidenceRail before the learner requests them. If a future
  // edit flips them back to "gathered", the investigation becomes cosmetic: a
  // learner can read every gathered value without doing anything. These four
  // tests prevent re-introducing the cosmetic-investigation bug.
  it.each([
    "price-sensitivity",
    "tracking-need",
    "intermediary",
    "institution-variation",
  ])(`ships the requestable fact %s as state "unknown" (T1 regression guard)`, (id) => {
    const fact = supplierCase.facts.find((f) => f.id === id);
    expect(fact).toBeDefined();
    expect(fact!.requestable).toBe(true);
    expect(fact!.state).toBe("unknown");
  });

  it("ships every requestable fact as unknown and every non-requestable fact as supplied (T1 invariant)", () => {
    // The clean partition: requestable facts are the investigation surface, so
    // they ship unknown. Non-requestable facts are the given context, so they
    // ship supplied. No fact should sit in the in-between "gathered" state at
    // author time — that state is a runtime transition (Group B owns it).
    for (const fact of supplierCase.facts) {
      if (fact.requestable) {
        expect(fact.state).toBe("unknown");
      } else {
        expect(fact.state).toBe("supplied");
      }
    }
  });

  it("every fact has a non-empty label and value", () => {
    for (const f of supplierCase.facts) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.value.length).toBeGreaterThan(0);
    }
  });
});

// ─── supplierCase: rails create a learning gradient ─────────────────────────

describe("supplierCase rails", () => {
  const rails = supplierCase.rails;

  it("includes at least three rails", () => {
    expect(rails.length).toBeGreaterThanOrEqual(3);
  });

  it("has at least one domestic-only (ineligible) rail", () => {
    expect(
      rails.some((r) =>
        /domestic|canada only|within canada|cad only/i.test(r.eligibility + " " + r.name),
      ),
    ).toBe(true);
  });

  it("has at least one USD rail that mentions Fedwire, ACH, or SWIFT", () => {
    expect(
      rails.some((r) => /\b(fedwire|ach|swift)\b/i.test(r.eligibility + " " + r.name)),
    ).toBe(true);
  });

  it("every rail lists required facts (non-empty) and at least one reason", () => {
    for (const r of rails) {
      expect(Array.isArray(r.requiredFacts)).toBe(true);
      expect(r.requiredFacts.length).toBeGreaterThan(0);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });

  it("each rail's requiredFacts reference fact ids that exist on the case", () => {
    const known = new Set(supplierCase.facts.map((f) => f.id));
    for (const r of rails) {
      for (const id of r.requiredFacts) {
        expect(known.has(id)).toBe(true);
      }
    }
  });
});

// ─── supplierCase: transfer fixture is a close, simpler variant ─────────────

describe("supplierCase transfer", () => {
  const transfer = supplierCase.transfer;

  it("uses the fixed TransferDefinition id", () => {
    expect(transfer.id).toBe("canada-us-supplier-transfer");
  });

  it("is simpler than the main case: fewer facts and fewer rails", () => {
    expect(transfer.facts.length).toBeLessThan(supplierCase.facts.length);
    expect(transfer.rails.length).toBeLessThan(supplierCase.rails.length);
  });

  it("has a customer request and at least one rail", () => {
    expect(transfer.customerRequest.length).toBeGreaterThan(0);
    expect(transfer.rails.length).toBeGreaterThanOrEqual(1);
  });

  it("does not recurse into another CaseDefinition", () => {
    // The transfer is plain data, not a routable nested case.
    expect(transfer).not.toHaveProperty("verifiedAt");
    expect(transfer).not.toHaveProperty("reviewStatus");
  });
});

// ─── source-claim hygiene across the catalog ────────────────────────────────

describe("source-claim hygiene", () => {
  function collectClaims(): SourceClaim[] {
    const out: SourceClaim[] = [];
    // Case-level claims attached to facts and rails.
    for (const f of supplierCase.facts) if (f.claim) out.push(f.claim);
    for (const r of supplierCase.rails) if (r.source) out.push(r.source);
    return out;
  }

  it("attaches source claims to key material (facts and rails)", () => {
    const claims = collectClaims();
    expect(claims.length).toBeGreaterThan(0);
  });

  it("every source claim has source, owner, verifiedAt, reviewBy, jurisdiction, and scope", () => {
    for (const c of collectClaims()) {
      expect(c.source.length).toBeGreaterThan(0);
      expect(c.owner.length).toBeGreaterThan(0);
      expect(c.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(c.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(c.jurisdiction.length).toBeGreaterThan(0);
      expect(c.scope).toBeTruthy();
    }
  });

  it("every source claim's reviewBy is strictly later than its verifiedAt", () => {
    for (const c of collectClaims()) {
      expect(new Date(c.reviewBy).getTime()).toBeGreaterThan(
        new Date(c.verifiedAt).getTime(),
      );
    }
  });

  it("uses simulation/example scope tags (never live customer data)", () => {
    for (const c of collectClaims()) {
      expect(["scheme-rule", "operator-guidance", "institution-config", "example-assumption", "simulation-only"])
        .toContain(c.scope);
    }
  });
});

// ─── synthetic-data safety ──────────────────────────────────────────────────

describe("supplierCase synthetic-data safety", () => {
  it("uses obviously-fictional names (no real customer/account data)", () => {
    const blob = JSON.stringify(supplierCase).toLowerCase();
    // Guard against accidental real-data leakage.
    expect(blob).not.toMatch(/\biban\s*[A-Z]{2}\d{2}\b/);
    expect(blob).not.toMatch(/account\s*number/i);
    // Author must flag the content as simulation/example.
    expect(blob).toMatch(/simulat|fictional|example|training/);
  });
});

// ─── catalog ↔ evaluator contract (direct, not end-to-end) ──────────────────
// Enforces the keyword contract the module docstring promises. If a future edit
// weakens the catalog's rail cues or fact wording, these fail directly rather
// than silently flipping a tier label.

describe("supplierCase ↔ evaluator contract", () => {
  // The investigation is load-bearing (T1): requestable facts ship unknown, so
  // the tracking + cost priorities (derived from requestable facts) only fire
  // once the learner has REQUESTED them. Urgency is non-requestable, so it
  // fires from the supplied fact alone. A learner who skips the investigation
  // gets only the urgency priority and cannot reach `preferred`.
  const ALL_REQUESTABLE_FACT_IDS = [
    "price-sensitivity",
    "tracking-need",
    "intermediary",
    "institution-variation",
  ];

  it("discloses ONLY urgency before any facts are requested (investigation is load-bearing)", () => {
    const priorities = disclosedPriorities(supplierCase, new Set());
    expect(priorities.has("urgency")).toBe(true);
    expect(priorities.has("tracking")).toBe(false);
    expect(priorities.has("cost")).toBe(false);
  });

  it("discloses urgency, tracking, and cost once the relevant facts are requested", () => {
    const priorities = disclosedPriorities(
      supplierCase,
      new Set(ALL_REQUESTABLE_FACT_IDS),
    );
    expect(priorities.has("urgency")).toBe(true);
    expect(priorities.has("tracking")).toBe(true);
    expect(priorities.has("cost")).toBe(true);
  });

  it("identifies swift-fedwire as the unique best-fit rail once the investigation is complete", () => {
    expect(bestFitRailId(supplierCase, new Set(ALL_REQUESTABLE_FACT_IDS))).toBe("swift-fedwire");
  });

  it("discloses only the urgency priority before the investigation (tracking + cost need requesting)", () => {
    // The investigation-gating contract at the priorities level: urgency
    // (non-requestable, supplied) fires regardless; tracking + cost (derived
    // from requestable facts) only fire once requested. A learner who skips the
    // investigation therefore cannot unlock the full priority set the best-fit
    // matcher uses to distinguish swift-fedwire on tracking+cost.
    const before = disclosedPriorities(supplierCase, new Set());
    expect(before.has("urgency")).toBe(true);
    expect(before.has("tracking")).toBe(false);
    expect(before.has("cost")).toBe(false);
    expect(before.size).toBe(1);
  });

  it("the transfer fixture does NOT disclose urgency (no keyword false-positive)", () => {
    // The transfer urgency text must avoid the evaluator's urgency trigger words
    // (e.g. "time-critical", "business day") so it cannot be mis-scored if the
    // debrief ever runs it through the evaluator.
    const transferUrgency = supplierCase.transfer.facts.find((f) => f.id === "urgency");
    expect(transferUrgency).toBeDefined();
    const value = (transferUrgency?.value ?? "").toLowerCase();
    expect(value).not.toMatch(/time-critical|business day|asap|urgent|deadline|within \d/);
  });
});

describe("case catalog registry", () => {
  it("exports the ordered authored registry", () => {
    expect(CASE_CATALOG.map((c) => c.id)).toEqual([
      "canada-us-supplier",
      "uk-eurozone-supplier",
      "nigeria-uk-contractor",
      "us-mexico-vendor",
    ]);
  });

  it("looks up a case by id and returns undefined for unknown cases", () => {
    expect(getCaseById("us-mexico-vendor")?.title).toContain("Mexico");
    expect(getCaseById("missing-case")).toBeUndefined();
  });

  it("keeps registry ids unique", () => {
    expect(new Set(CASE_CATALOG.map((c) => c.id)).size).toBe(CASE_CATALOG.length);
  });

  it("ships revision and recommendation metadata for every case", () => {
    for (const definition of CASE_CATALOG) {
      expect(definition.contentRevision.length).toBeGreaterThan(0);
      expect(definition.recommendation.preferredRailId).toEqual(
        expect.stringMatching(/.+/),
      );
      expect(definition.rails.map((rail) => rail.id)).toContain(
        definition.recommendation.preferredRailId,
      );
    }
  });

  it("maps every authored priority fact id to a fact that exists on the case", () => {
    for (const definition of CASE_CATALOG) {
      for (const factId of Object.values(definition.recommendation.priorityFactIds)) {
        if (!factId) continue;
        expect(definition.facts.some((fact) => fact.id === factId)).toBe(true);
      }
    }
  });

  it("uses the authored preferredRailId as the best-fit rail once all requestable facts are gathered", () => {
    for (const definition of CASE_CATALOG) {
      const requestedFactIds = new Set(
        definition.facts.filter((fact) => fact.requestable).map((fact) => fact.id),
      );
      expect(bestFitRailId(definition, requestedFactIds)).toBe(
        definition.recommendation.preferredRailId,
      );
    }
  });
});
