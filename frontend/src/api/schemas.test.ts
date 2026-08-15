import { describe, it, expect } from "vitest";
import { SuggestedIntermediarySchema, RouteResponseSchema, PreparePaymentResponseSchema, SchemesResponseSchema, SchemeInfoSchema, InternationalSchemesResponseSchema } from "./schemas";
import {
  TranslateResponseSchema,
  Pacs008CheckResponseSchema,
} from "./schemas";
import { TutorRequestSchema, TutorResponseSchema } from "./schemas";
import { usdFedwireRailFixture, interacETransferFixture, swiftGpiInternationalFixture } from "../features/explore/schemeFixtures";

describe("SuggestedIntermediary schema", () => {
  it("parses bank as a string (matches Pydantic IntermediarySuggestion.bank: str)", () => {
    const data = {
      bic: "CITIUS33",
      bank: "Citibank",
      corridor: "USD-NGN",
      confidence: "high",
    };
    const result = SuggestedIntermediarySchema.parse(data);
    expect(result.bank).toBe("Citibank");
    expect(typeof result.bank).toBe("string");
  });

  it("preserves bank name through RouteResponseSchema", () => {
    const data = {
      bic: "GTBINGLAXXX",
      currency: "NGN",
      valid: true,
      beneficiary_country: "NG",
      suggested_intermediaries: [
        { bic: "CITIUS33", bank: "Citibank", corridor: "USD-NGN", confidence: "high" },
        { bic: "BARCGB22", bank: "Barclays", corridor: "GBP-NGN", confidence: "medium" },
      ],
      notes: "Test",
      source: "curated-corridor-table",
    };
    const result = RouteResponseSchema.parse(data);
    expect(result.suggested_intermediaries[0].bank).toBe("Citibank");
    expect(result.suggested_intermediaries[1].bank).toBe("Barclays");
  });

  it("preserves bank name through PreparePaymentResponseSchema routing", () => {
    const data = {
      recommendation: "PROCEED",
      reason: "ok",
      is_blocking: false,
      uetr: "test-uetr",
      validation: { valid: true, errors: [] },
      vop: { outcome: "MATCH", advice: "ok" },
      routing: {
        beneficiary_country: "GB",
        inferred_currency: "GBP",
        suggested_intermediaries: [
          { bic: "BARCGB22", bank: "Barclays", corridor: "GBP-GB", confidence: "high" },
        ],
      },
      ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: true },
      warnings: [],
      blocks: [],
    };
    const result = PreparePaymentResponseSchema.parse(data);
    expect(result.routing.suggested_intermediaries[0].bank).toBe("Barclays");
  });

  it("defaults bank to empty string on malformed data, not null", () => {
    const data = {
      bic: "CITIUS33",
      bank: null,
      corridor: "USD-NGN",
      confidence: "high",
    };
    const result = SuggestedIntermediarySchema.parse(data);
    // bank should be a string (empty), never null or undefined
    expect(typeof result.bank).toBe("string");
    expect(result.bank).not.toBeNull();
  });
});

describe("SchemesResponse schema", () => {
  it("parses a valid schemes response", () => {
    const data = {
      currency: "GBP",
      country: "United Kingdom",
      countryCode: "GB",
      iban: true,
      localIdentifier: "Sort code",
      schemes: [
        { name: "Faster Payments", speed: "instant", limit: "£1M", cost: "Free", useCase: "Retail", operator: "Pay.UK" },
        { name: "CHAPS", speed: "same-day", limit: "No limit", cost: "£25", useCase: "High value", operator: "BoE" },
      ],
    };
    const result = SchemesResponseSchema.parse(data);
    expect(result.currency).toBe("GBP");
    expect(result.iban).toBe(true);
    expect(result.schemes.length).toBe(2);
    expect(result.schemes[0].name).toBe("Faster Payments");
  });

  it("keeps verifiedAsof when present", () => {
    const r = SchemesResponseSchema.parse({
      currency: "KES", country: "Kenya", countryCode: "KE",
      iban: false, localIdentifier: "x", schemes: [], verifiedAsof: "2026-07",
    });
    expect(r.verifiedAsof).toBe("2026-07");
  });
});

describe("ISO 20022 schemas", () => {
  it("parses a translate response", () => {
    const r = TranslateResponseSchema.parse({
      mapping: [{ mt_tag: "59", mt_label: "Beneficiary", iso_path: "Cdtr/Nm", iso_label: "Creditor Name", value: "Beta Ltd" }],
      xml: "<Document/>",
      disclaimer: "primer",
    });
    expect(r.mapping[0].iso_path).toBe("Cdtr/Nm");
  });

  it("parses a pacs008 check response", () => {
    const r = Pacs008CheckResponseSchema.parse({
      verdict: "REPAIRABLE",
      passes: true,
      findings: [{ field: "Cdtr/PstlAdr", field_name: "Creditor Postal Address", severity: "warning", code: "PACS-ADDR-UNSTRUCTURED", message: "x", repair: "y" }],
      disclaimer: "primer",
    });
    expect(r.findings[0].code).toBe("PACS-ADDR-UNSTRUCTURED");
  });
});

describe("SchemeInfoSchema enriched fields", () => {
  it("SchemeInfoSchema keeps enriched fields and still parses without them", () => {
    const rich = SchemeInfoSchema.parse({
      name: "Interac e-Transfer", speed: "Instant", limit: "x", cost: "y", useCase: "z", operator: "Interac",
      features: ["Autodeposit"], limits: { perMonth: "$30,000" }, reversible: false, roadmap: ["RTR Q3 2026"],
    });
    expect(rich.features?.[0]).toBe("Autodeposit");
    expect(rich.limits?.perMonth).toBe("$30,000");
    const plain = SchemeInfoSchema.parse({ name: "Fedwire", speed: "RTGS", limit: "x", cost: "y", useCase: "z", operator: "Fed" });
    expect(plain.roadmap ?? null).toBeNull();
  });

  it("parses a legacy minimal scheme with no source/family/variant fields", () => {
    const legacy = SchemeInfoSchema.parse({
      name: "Bacs Direct Credit", speed: "3 business days", limit: "No limit",
      cost: "~£0.50", useCase: "Payroll", operator: "Pay.UK",
    });
    expect(legacy.sources ?? null).toBeNull();
    expect(legacy.family ?? null).toBeNull();
    expect(legacy.variants ?? null).toBeNull();
  });

  it("parses the enriched USD Fedwire rail carrying source references", () => {
    const fedwire = SchemeInfoSchema.parse(usdFedwireRailFixture);
    expect(fedwire.sources?.length).toBeGreaterThan(0);
    expect(fedwire.sources?.[0]).toEqual({
      name: "Federal Reserve Financial Services",
      label: "Fedwire Funds Service — official",
      url: "https://www.frbservices.org/financial-services/wires",
    });
    expect(fedwire.settlement).toContain("RTGS");
  });

  it("parses the Interac parent with family and its three mandated variants", () => {
    const interac = SchemeInfoSchema.parse(interacETransferFixture);
    expect(interac.family).toBe("Interac e-Transfer");
    expect(interac.variants).toHaveLength(3);
    expect(interac.variants?.map((v) => v.name)).toEqual([
      "Auto-Deposit",
      "Request Money",
      "Standard security-question claim",
    ]);
    expect(interac.variants?.every((v) => v.description.length > 0)).toBe(true);
  });
});

describe("TutorRequest schema", () => {
  it("parses a valid request for each tutor mode", () => {
    for (const mode of ["chat", "explain", "hint", "quiz"] as const) {
      const parsed = TutorRequestSchema.parse({
        message: "How does a correspondent bank settle a USD payment?",
        mode,
        context: { surface: "lesson", module_id: "mod-07" },
        history: [{ role: "user", content: "what is a nostro?" }],
      });
      expect(parsed.mode).toBe(mode);
      expect(parsed.context.surface).toBe("lesson");
      expect(parsed.history[0].role).toBe("user");
    }
  });

  it("defaults mode to chat and history to empty, mirroring TutorRequest", () => {
    const parsed = TutorRequestSchema.parse({
      message: "hi",
      context: { surface: "global" },
    });
    expect(parsed.mode).toBe("chat");
    expect(parsed.history).toEqual([]);
  });

  it("enforces the same bounds as the Pydantic request", () => {
    const context = { surface: "global" };
    const turn = { role: "user", content: "x" };
    const nineTurns = Array.from({ length: 9 }, () => turn);

    expect(() => TutorRequestSchema.parse({ message: "", context })).toThrow();
    expect(() => TutorRequestSchema.parse({ message: "m".repeat(2001), context })).toThrow();
    expect(() =>
      TutorRequestSchema.parse({ message: "hi", context, history: nineTurns }),
    ).toThrow();
    expect(() =>
      TutorRequestSchema.parse({
        message: "hi",
        context,
        history: [{ role: "user", content: "c".repeat(3001) }],
      }),
    ).toThrow();

    const atLimit = TutorRequestSchema.parse({
      message: "m".repeat(2000),
      context,
      history: nineTurns.slice(0, 8),
    });
    expect(atLimit.message).toHaveLength(2000);
    expect(atLimit.history).toHaveLength(8);
  });

  it("enforces Pydantic's context field bounds", () => {
    const limits: Record<string, number> = {
      module_id: 100,
      module_title: 200,
      topic: 120,
      currency: 20,
      rail_name: 120,
      tool_name: 120,
      case_id: 120,
      resource_ref: 160,
      result_summary: 4000,
    };

    for (const [field, limit] of Object.entries(limits)) {
      expect(
        () =>
          TutorRequestSchema.parse({
            message: "hi",
            context: { surface: "lesson", [field]: "x".repeat(limit + 1) },
          }),
        `${field} must be capped at ${limit} characters`,
      ).toThrow();
    }
  });
});

const tutorResponseFixture = {
  answer: "A nostro is the account you hold with your correspondent bank.",
  citations: [
    {
      source_id: "lesson-07",
      title: "Correspondent banking",
      url: "https://relay.example/lesson-07",
      evidence: "Nostro accounts are held with the correspondent.",
    },
  ],
  follow_up: "Want the vostro side?",
  needs_clarification: false,
  mode: "explain",
  grounded: true,
  safety_notice: null,
  turn_id: "3f1d5b6c-8a2e-4f7b-9c1d-2e3f4a5b6c7d",
};

describe("TutorResponse schema", () => {
  it("parses a full response including the server-owned fields", () => {
    const parsed = TutorResponseSchema.parse(tutorResponseFixture);
    expect(parsed.answer).toContain("nostro");
    expect(parsed.citations[0].source_id).toBe("lesson-07");
    expect(parsed.mode).toBe("explain");
    expect(parsed.grounded).toBe(true);
    expect(parsed.turn_id).toBe("3f1d5b6c-8a2e-4f7b-9c1d-2e3f4a5b6c7d");
    expect(parsed.needs_clarification).toBe(false);
  });

  it("rejects a response missing answer, mode, grounded, or turn_id", () => {
    for (const field of ["answer", "mode", "grounded", "turn_id"] as const) {
      const payload: Record<string, unknown> = { ...tutorResponseFixture };
      delete payload[field];
      expect(
        () => TutorResponseSchema.parse(payload),
        `a response missing "${field}" must not parse`,
      ).toThrow();
    }
  });

  it("tolerates null for follow_up, safety_notice, and citation url", () => {
    const parsed = TutorResponseSchema.parse({
      ...tutorResponseFixture,
      follow_up: null,
      safety_notice: null,
      citations: [
        {
          source_id: "lesson-07",
          title: "Correspondent banking",
          url: null,
          evidence: "Nostro accounts are held with the correspondent.",
        },
      ],
    });
    expect(parsed.follow_up ?? null).toBeNull();
    expect(parsed.safety_notice ?? null).toBeNull();
    expect(parsed.citations[0].url ?? null).toBeNull();
    expect(parsed.answer).toContain("nostro");
  });

  it("enforces Pydantic's response and citation bounds", () => {
    for (const [field, limit] of [
      ["answer", 6000],
      ["follow_up", 500],
      ["safety_notice", 500],
    ] as const) {
      expect(
        () => TutorResponseSchema.parse({ ...tutorResponseFixture, [field]: "x".repeat(limit + 1) }),
        `${field} must be capped at ${limit} characters`,
      ).toThrow();
    }

    for (const [field, limit] of [
      ["source_id", 160],
      ["title", 240],
      ["url", 500],
      ["evidence", 500],
    ] as const) {
      const citation = { ...tutorResponseFixture.citations[0], [field]: "x".repeat(limit + 1) };
      expect(
        () => TutorResponseSchema.parse({ ...tutorResponseFixture, citations: [citation] }),
        `citation ${field} must be capped at ${limit} characters`,
      ).toThrow();
    }

    expect(() =>
      TutorResponseSchema.parse({
        ...tutorResponseFixture,
        citations: [{ ...tutorResponseFixture.citations[0], source_id: "" }],
      }),
    ).toThrow();
  });
});

describe("InternationalSchemesResponse schema", () => {
  it("parses the SWIFT gpi international catalogue response", () => {
    const r = InternationalSchemesResponseSchema.parse(swiftGpiInternationalFixture);
    expect(r.scope).toBe("International / SWIFT");
    expect(r.name).toBe("SWIFT gpi");
    expect(r.operator).toBe("SWIFT");
    expect(r.howItWorks?.join(" ")).toContain("UETR");
    expect(r.reversible).toBe(false);
    expect(r.verifiedAsof).toBe("2026-08");
    expect(r.sources?.[0]?.name).toBe("SWIFT");
    expect(r.roadmap?.join(" ")).toContain("CBPR+");
  });

  it("tolerates a stripped international payload with defensive defaults", () => {
    const r = InternationalSchemesResponseSchema.parse({ name: "SWIFT gpi" });
    expect(r.scope).toBe("");
    expect(r.howItWorks ?? []).toEqual([]);
    expect(r.sources ?? null).toBeNull();
    expect(r.verifiedAsof ?? null).toBeNull();
  });
});
