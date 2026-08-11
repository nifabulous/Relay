import { http, HttpResponse } from "msw";

import { CURRICULUM } from "../features/learn/curriculum";

/**
 * Default MSW handlers for the Relay API.
 *
 * These represent the DEFAULT success responses used in tests. Individual
 * tests can override any of them with `server.use(...)` to assert on error
 * states, loading edge cases, or alternate payloads.
 *
 * Query/path parameter values are echoed into identifier fields where the
 * route is parameterized (e.g. `:value`, `:bic`); everything else returns a
 * stable, realistic success payload.
 */
export const handlers = [
  http.get("/api/health", () =>
    HttpResponse.json({
      status: "ok",
      banks: 150,
      corridor_rules: 40,
      fedwire_banks: 0,
      fedach_banks: 0,
      ssi_records: 470,
    }),
  ),

  http.get("/api/validate", ({ request }) => {
    const url = new URL(request.url);
    const value = url.searchParams.get("value") ?? "GB29NWBK60161331926819";
    return HttpResponse.json({
      input: value,
      input_type: "iban",
      valid: true,
      bic: "NWBKGB2L",
      bank: {
        bic: "NWBKGB2L",
        bank_name: "NatWest",
        country_code: "GB",
      },
      errors: [],
    });
  }),

  http.get("/api/lookup", ({ request }) => {
    const url = new URL(request.url);
    const bic = url.searchParams.get("bic") ?? "GTBINGLAXXX";
    return HttpResponse.json({
      bic,
      found: true,
      bank: {
        bic,
        bank_name: "Guaranty Trust Bank",
        country_code: "NG",
      },
    });
  }),

  http.get("/api/route", ({ request }) => {
    const url = new URL(request.url);
    const bic = url.searchParams.get("bic") ?? "GTBINGLAXXX";
    const currency = url.searchParams.get("currency") ?? "NGN";
    return HttpResponse.json({
      bic,
      currency,
      valid: true,
      bank: null,
      beneficiary_country: "NG",
      suggested_intermediaries: [
        {
          bic: "CITIUS33",
          bank: "Citibank",
          corridor: "USD-NGN",
          confidence: "high",
        },
      ],
      notes: "Test route",
      source: "curated-corridor-table",
    });
  }),

  http.get("/api/ssi", ({ request }) => {
    const url = new URL(request.url);
    const bic = url.searchParams.get("bic") ?? "GTBINGLAXXX";
    const currency = url.searchParams.get("currency") ?? "NGN";
    return HttpResponse.json({
      beneficiary_bic: bic,
      currency,
      instructions: [],
      disclaimer: "SIMULATION",
    });
  }),

  http.post("/api/verify-payee", () =>
    HttpResponse.json({
      iban: "...",
      submitted_name: "Test",
      outcome: "MATCH",
      score: 1.0,
      advice: "Names match",
    }),
  ),

  http.post("/api/prepare-payment", () =>
    HttpResponse.json({
      recommendation: "PROCEED",
      reason: "All checks passed",
      is_blocking: false,
      uetr: "test-uetr-123",
      validation: {
        valid: true,
        bic: "NWBKGB2L",
        errors: [],
      },
      vop: {
        outcome: "MATCH",
        score: 1.0,
        advice: "Match",
      },
      routing: {
        beneficiary_country: "GB",
        inferred_currency: "GBP",
        suggested_intermediaries: [],
      },
      ssi: {
        instructions: [],
        has_real_accounts: false,
        has_placeholders_only: true,
      },
      warnings: [],
      blocks: [],
    }),
  ),

  http.get("/api/track/:uetr", () =>
    HttpResponse.json({
      uetr: "test",
      current_status: "credited",
      is_terminal: true,
      event_count: 1,
      sent_amount: "1000.00",
      final_amount: "1000.00",
      total_fees: 0,
      last_updated: "2026-01-01T00:00:00",
      timeline: [
        {
          status: "credited",
          bank_bic: "GTBINGLAXXX",
          bank_name: "GTBank",
          hop: 1,
          timestamp: "2026-01-01T00:00:00",
        },
      ],
      disclaimer: "SIMULATION",
    }),
  ),

  // `total_count` is derived from CURRICULUM rather than hardcoded so the mock
  // cannot drift out of sync with the backend catalogue (app/services/progress.py
  // keeps ALL_MODULE_IDS aligned with the same list) when modules are added.
  http.get("/api/progress", () =>
    HttpResponse.json({
      completed_count: 0,
      total_count: CURRICULUM.length,
      percentage: 0,
      earned_badges: [],
      next_recommended: "lab-1",
      all_badges: [],
    }),
  ),

  http.get("/api/schemes", ({ request }) => {
    const url = new URL(request.url);
    const currency = url.searchParams.get("currency") ?? "GBP";
    return HttpResponse.json({
      currency,
      country: "United Kingdom",
      countryCode: "GB",
      iban: true,
      localIdentifier: "Sort Code",
      schemes: [
        { name: "Faster Payments", speed: "Instant", limit: "£1M", cost: "Free", useCase: "Retail", operator: "Pay.UK" },
        { name: "CHAPS", speed: "Same-day", limit: "No limit", cost: "£25", useCase: "High-value", operator: "BoE" },
      ],
    });
  }),
];
