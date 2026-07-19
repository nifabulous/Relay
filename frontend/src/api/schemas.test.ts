import { describe, it, expect } from "vitest";
import { SuggestedIntermediarySchema, RouteResponseSchema, PreparePaymentResponseSchema, SchemesResponseSchema, SchemeInfoSchema } from "./schemas";
import {
  TranslateResponseSchema,
  Pacs008CheckResponseSchema,
} from "./schemas";

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
});
