import { describe, it, expect } from "vitest";
import { supplierCase } from "./caseCatalog";
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
