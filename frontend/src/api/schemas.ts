/**
 * Zod v4 response schemas for the Relay backend (FastAPI / Pydantic).
 *
 * Parsing policy: be liberal. The backend may add fields or tweak optionality,
 * so top-level objects use `.passthrough()` (unknown keys are kept, not rejected)
 * and fragile optional fields use `.catch()` so a single malformed field never
 * fails an entire response. Required-but-risky fields are still validated
 * strictly where it matters (enums, primitive types).
 *
 * Inferred TypeScript types are exported alongside each schema.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Shared primitives
 * ------------------------------------------------------------------ */

/** A non-empty trimmed string; empty input coerces to undefined for optionals. */
const optionalString = z
  .string()
  .nullish()
  .transform((v) => (v == null ? undefined : v));

/** A string field that may be null/missing and should never throw. */
const safeOptionalString = optionalString.catch(undefined);

/** A float that tolerates null/missing and never throws. */
const safeOptionalNumber = z.coerce
  .number()
  .nullish()
  .catch(undefined)
  .transform((v) => (v == null ? undefined : v));

/** Confidence ranking for a suggested intermediary. */
const confidenceSchema = z.enum(["high", "medium", "low"]).catch("low");

export const SettlementIdsSchema = z
  .object({
    chips_uid: safeOptionalString,
    aba: safeOptionalString,
  })
  .passthrough();

export type SettlementIds = z.infer<typeof SettlementIdsSchema>;


/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

export const HealthResponseSchema = z
  .object({
    status: z.string().catch("unknown"),
    banks: z.coerce.number().int().catch(0),
    corridor_rules: z.coerce.number().int().catch(0),
    fedwire_banks: z.coerce.number().int().catch(0),
    fedach_banks: z.coerce.number().int().catch(0),
    ssi_records: z.coerce.number().int().catch(0),
  })
  .passthrough();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/* ------------------------------------------------------------------ *
 * BankInfo (shared)
 * ------------------------------------------------------------------ */

export const BankInfoSchema = z
  .object({
    bic: z.string().catch(""),
    bank_name: z.string().catch(""),
    country_code: z.string().catch(""),
    city: safeOptionalString,
    country_currency: safeOptionalString,
  })
  .passthrough();

export type BankInfo = z.infer<typeof BankInfoSchema>;

/* ------------------------------------------------------------------ *
 * Validate
 * ------------------------------------------------------------------ */

export const ValidateResponseSchema = z
  .object({
    input: z.string().catch(""),
    input_type: z.enum(["iban", "bic"]).catch("iban"),
    valid: z.coerce.boolean().catch(false),
    bic: safeOptionalString,
    bank: BankInfoSchema.nullish().catch(null),
    errors: z.array(z.string()).catch([]),
  })
  .passthrough();

export type ValidateResponse = z.infer<typeof ValidateResponseSchema>;

/* ------------------------------------------------------------------ *
 * Lookup
 * ------------------------------------------------------------------ */

export const LookupResponseSchema = z
  .object({
    bic: z.string().catch(""),
    bank: BankInfoSchema.nullish().catch(null),
    found: z.coerce.boolean().catch(false),
    settlement: SettlementIdsSchema.nullish().catch(null),
  })
  .passthrough();

export type LookupResponse = z.infer<typeof LookupResponseSchema>;

/* ------------------------------------------------------------------ *
 * Route
 * ------------------------------------------------------------------ */

export const SuggestedIntermediarySchema = z
  .object({
    bic: z.string().catch(""),
    // Pydantic IntermediarySuggestion.bank is a str (bank name), not a BankInfo object
    bank: z.string().catch(""),
    corridor: z.string().catch(""),
    confidence: confidenceSchema,
    basis: z.enum(["published-ssi", "corridor-heuristic"]).catch("corridor-heuristic"),
    settlement: SettlementIdsSchema.nullish().catch(null),
  })
  .passthrough();

export type SuggestedIntermediary = z.infer<typeof SuggestedIntermediarySchema>;

export const RouteResponseSchema = z
  .object({
    bic: z.string().catch(""),
    bank: BankInfoSchema.nullish().catch(null),
    beneficiary_country: safeOptionalString,
    currency: z.string().catch(""),
    valid: z.coerce.boolean().catch(false),
    suggested_intermediaries: z.array(SuggestedIntermediarySchema).catch([]),
    notes: z.string().catch(""),
    source: z.string().catch(""),
  })
  .passthrough();

export type RouteResponse = z.infer<typeof RouteResponseSchema>;

/* ------------------------------------------------------------------ *
 * SSI
 * ------------------------------------------------------------------ */

export const SSIRecordSchema = z
  .object({
    beneficiary_bic: z.string().catch(""),
    beneficiary_bank_name: safeOptionalString,
    currency: z.string().catch(""),
    intermediary_bic: z.string().catch(""),
    intermediary_bank_name: safeOptionalString,
    intermediary_account: safeOptionalString,
    beneficiary_account: safeOptionalString,
    charge_code: z.string().catch(""),
    value_date: z.string().catch(""),
    notes: safeOptionalString,
    // Provenance. An older backend sends no status; that is precisely the
    // "we do not know" case, so it falls back to "unverified" rather than
    // "published" — the fallback must not assert currency either.
    as_of: safeOptionalString,
    status: z.string().catch("unverified"),
    intermediary_settlement: SettlementIdsSchema.nullish().catch(null),
  })
  .passthrough();

export type SSIRecord = z.infer<typeof SSIRecordSchema>;

export const SSIResponseSchema = z
  .object({
    beneficiary_bic: z.string().catch(""),
    currency: z.string().catch(""),
    instructions: z.array(SSIRecordSchema).catch([]),
    disclaimer: z.string().catch(""),
  })
  .passthrough();

export type SSIResponse = z.infer<typeof SSIResponseSchema>;

/* ------------------------------------------------------------------ *
 * Verification of Payee (VoP)
 * ------------------------------------------------------------------ */

export const VoPResponseSchema = z
  .object({
    iban: z.string().catch(""),
    submitted_name: z.string().catch(""),
    outcome: z
      .enum(["MATCH", "CLOSE_MATCH", "NO_MATCH", "NOT_CHECKED"])
      .catch("NOT_CHECKED"),
    score: safeOptionalNumber,
    account_holder_name: safeOptionalString,
    account_type: safeOptionalString,
    advice: z.string().catch(""),
  })
  .passthrough();

export type VoPResponse = z.infer<typeof VoPResponseSchema>;

/* ------------------------------------------------------------------ *
 * Prepare payment (composite)
 * ------------------------------------------------------------------ */

const PrepareValidationSchema = z
  .object({
    valid: z.coerce.boolean().catch(false),
    bic: safeOptionalString,
    errors: z.array(z.string()).catch([]),
  })
  .passthrough();

const PrepareVoPSchema = z
  .object({
    outcome: z
      .enum(["MATCH", "CLOSE_MATCH", "NO_MATCH", "NOT_CHECKED"])
      .catch("NOT_CHECKED"),
    score: safeOptionalNumber,
    account_holder_name: safeOptionalString,
    advice: z.string().catch(""),
  })
  .passthrough();

const PrepareRoutingSchema = z
  .object({
    beneficiary_country: safeOptionalString,
    inferred_currency: safeOptionalString,
    suggested_intermediaries: z.array(SuggestedIntermediarySchema).catch([]),
    routing_basis: z
      .enum(["published-ssi", "corridor-heuristic"])
      .catch("corridor-heuristic"),
  })
  .passthrough();

const PrepareSSISchema = z
  .object({
    instructions: z.array(SSIRecordSchema).catch([]),
    has_real_accounts: z.coerce.boolean().catch(false),
    has_placeholders_only: z.coerce.boolean().catch(false),
  })
  .passthrough();

export const PreparePaymentResponseSchema = z
  .object({
    recommendation: z.string().catch(""),
    reason: z.string().catch(""),
    is_blocking: z.coerce.boolean().catch(false),
    uetr: z.string().catch(""),
    validation: PrepareValidationSchema.catch({
      valid: false,
      bic: undefined,
      errors: [],
    }),
    vop: PrepareVoPSchema.catch({
      outcome: "NOT_CHECKED",
      score: undefined,
      account_holder_name: undefined,
      advice: "",
    }),
    routing: PrepareRoutingSchema.catch({
      beneficiary_country: undefined,
      inferred_currency: undefined,
      suggested_intermediaries: [],
      // Fall back to the weaker claim: an unparseable response must never be
      // presented as the bank's published instruction.
      routing_basis: "corridor-heuristic",
    }),
    ssi: PrepareSSISchema.catch({
      instructions: [],
      has_real_accounts: false,
      has_placeholders_only: false,
    }),
    warnings: z.array(z.string()).catch([]),
    blocks: z.array(z.string()).catch([]),
  })
  .passthrough();

export type PreparePaymentResponse = z.infer<typeof PreparePaymentResponseSchema>;

/* ------------------------------------------------------------------ *
 * Fee simulate
 * ------------------------------------------------------------------ */

const FeeHopSchema = z
  .object({
    bic: z.string().catch(""),
    bank_name: z.string().catch(""),
    fee: z.coerce.number().catch(0),
    amount_in: z.coerce.number().catch(0),
    amount_out: z.coerce.number().catch(0),
    cumulative_fees: z.coerce.number().catch(0),
  })
  .passthrough();

export type FeeHop = z.infer<typeof FeeHopSchema>;

export const FeeSimulateResponseSchema = z
  .object({
    charge_code: z.string().catch(""),
    currency: z.string().catch(""),
    sent_amount: z.coerce.number().catch(0),
    received_amount: z.coerce.number().catch(0),
    total_fees: z.coerce.number().catch(0),
    sender_pays_extra: z.coerce.number().catch(0),
    hops: z.array(FeeHopSchema).catch([]),
    fee_breakdown: z.string().catch(""),
  })
  .passthrough();

export type FeeSimulateResponse = z.infer<typeof FeeSimulateResponseSchema>;

/* ------------------------------------------------------------------ *
 * Sanctions / screening
 * ------------------------------------------------------------------ */

const ScreenPartySchema = z
  .object({
    party: z.string().catch(""),
    name: z.string().catch(""),
    hit: z.coerce.boolean().catch(false),
    score: safeOptionalNumber,
    recommendation: z.enum(["CLEAR", "REVIEW", "REJECT"]).catch("CLEAR"),
    matched_entry: safeOptionalString,
  })
  .passthrough();

const ScreenHopSchema = z
  .object({
    hop: z.coerce.number().int().catch(0),
    bic: z.string().catch(""),
    bank_name: z.string().catch(""),
    decision: z.enum(["CLEAR", "POSSIBLE_HIT", "HARD_HIT"]).catch("CLEAR"),
    action: z.enum(["PASS", "HOLD", "REJECT"]).catch("PASS"),
    delay_hours: z.coerce.number().catch(0),
    notes: safeOptionalString,
  })
  .passthrough();

export const ScreenResponseSchema = z
  .object({
    sender: ScreenPartySchema.catch({
      party: "sender",
      name: "",
      hit: false,
      score: undefined,
      recommendation: "CLEAR",
      matched_entry: undefined,
    }),
    beneficiary: ScreenPartySchema.catch({
      party: "beneficiary",
      name: "",
      hit: false,
      score: undefined,
      recommendation: "CLEAR",
      matched_entry: undefined,
    }),
    hops: z.array(ScreenHopSchema).catch([]),
    overall_recommendation: z.enum(["CLEAR", "REVIEW", "BLOCKED"]).catch("CLEAR"),
    blocked: z.coerce.boolean().catch(false),
    blocked_at_hop: z.coerce.number().int().nullish().catch(null),
    total_delay_hours: z.coerce.number().catch(0),
    disclaimer: z.string().catch(""),
  })
  .passthrough();

export type ScreenResponse = z.infer<typeof ScreenResponseSchema>;

/* ------------------------------------------------------------------ *
 * Track payment
 * ------------------------------------------------------------------ */

const TrackTimelineEntrySchema = z
  .object({
    status: z.string().catch(""),
    bank_bic: z.string().catch(""),
    bank_name: safeOptionalString,
    hop: z.coerce.number().int().catch(0),
    timestamp: z.string().catch(""),
    amount: safeOptionalString,
    currency: safeOptionalString,
    message: safeOptionalString,
    instructing_bic: safeOptionalString,
    instructed_bic: safeOptionalString,
  })
  .passthrough();

export type TrackTimelineEntry = z.infer<typeof TrackTimelineEntrySchema>;

export const TrackPaymentResponseSchema = z
  .object({
    uetr: z.string().catch(""),
    current_status: z.string().catch(""),
    is_terminal: z.coerce.boolean().catch(false),
    event_count: z.coerce.number().int().catch(0),
    sent_amount: safeOptionalString,
    final_amount: safeOptionalString,
    total_fees: safeOptionalNumber,
    last_updated: z.string().catch(""),
    timeline: z.array(TrackTimelineEntrySchema).catch([]),
    disclaimer: z.string().catch(""),
  })
  .passthrough();

export type TrackPaymentResponse = z.infer<typeof TrackPaymentResponseSchema>;

/* ------------------------------------------------------------------ *
 * Badges / progress
 * ------------------------------------------------------------------ */

const BadgeSchema = z
  .object({
    id: z.string().catch(""),
    name: z.string().catch(""),
    description: z.string().catch(""),
    requirement: z.string().catch(""),
    earned: z.coerce.boolean().catch(false),
  })
  .passthrough();

export type Badge = z.infer<typeof BadgeSchema>;

/* ------------------------------------------------------------------ *
 * Value Date
 * ------------------------------------------------------------------ */

export const ValueDateResponseSchema = z
  .object({
    trade_date: z.string().catch(""),
    cut_off_local: z.string().catch(""),
    cut_off_tz: z.string().catch(""),
    cut_off_note: z.string().catch(""),
    missed_cut_off: z.coerce.boolean().catch(false),
    value_date: z.string().catch(""),
    settlement_type: z.string().catch(""),
    business_days: z.coerce.number().int().catch(0),
    skipped_holidays: z.array(z.string()).catch([]),
    explanation: z.string().catch(""),
    disclaimer: z.string().catch(""),
  })
  .passthrough();

export type ValueDateResponse = z.infer<typeof ValueDateResponseSchema>;

/* ------------------------------------------------------------------ *
 * STP Checker (MT103)
 * ------------------------------------------------------------------ */

const safeOptionalStringForCatch = z.string().nullish().catch(null);

export const STPFindingSchema = z
  .object({
    field: z.string().catch(""),
    field_name: z.string().catch(""),
    severity: z.string().catch("info"),
    code: z.string().catch(""),
    message: z.string().catch(""),
    repair: safeOptionalStringForCatch,
  })
  .passthrough();

export type STPFinding = z.infer<typeof STPFindingSchema>;

export const STPCheckResponseSchema = z
  .object({
    verdict: z.string().catch("REPAIRABLE"),
    stp_passes: z.coerce.boolean().catch(false),
    findings: z.array(STPFindingSchema).catch([]),
    field_summary: z.array(z.record(z.string(), z.unknown())).catch([]),
    disclaimer: z.string().catch(""),
  })
  .passthrough();

export type STPCheckResponse = z.infer<typeof STPCheckResponseSchema>;

/* ------------------------------------------------------------------ *
 * ISO 20022 (pacs.008) translation & checker
 * ------------------------------------------------------------------ */

export const Pacs008MappingEntrySchema = z
  .object({
    mt_tag: z.string().catch(""),
    mt_label: z.string().catch(""),
    iso_path: z.string().catch(""),
    iso_label: z.string().catch(""),
    value: z.string().catch(""),
  })
  .passthrough();

export type Pacs008MappingEntry = z.infer<typeof Pacs008MappingEntrySchema>;

export const TranslateResponseSchema = z
  .object({
    mapping: z.array(Pacs008MappingEntrySchema).catch([]),
    xml: z.string().catch(""),
    disclaimer: z.string().catch(""),
  })
  .passthrough();

export type TranslateResponse = z.infer<typeof TranslateResponseSchema>;

export const Pacs008FindingSchema = z
  .object({
    field: z.string().catch(""),
    field_name: z.string().catch(""),
    severity: z.string().catch("info"),
    code: z.string().catch(""),
    message: z.string().catch(""),
    repair: z.string().nullish().catch(null),
  })
  .passthrough();

export type Pacs008Finding = z.infer<typeof Pacs008FindingSchema>;

export const Pacs008CheckResponseSchema = z
  .object({
    verdict: z.string().catch("REPAIRABLE"),
    passes: z.coerce.boolean().catch(false),
    findings: z.array(Pacs008FindingSchema).catch([]),
    disclaimer: z.string().catch(""),
  })
  .passthrough();

export type Pacs008CheckResponse = z.infer<typeof Pacs008CheckResponseSchema>;

export const ProgressResponseSchema = z
  .object({
    completed_count: z.coerce.number().int().catch(0),
    total_count: z.coerce.number().int().catch(0),
    percentage: z.coerce.number().int().min(0).max(100).catch(0),
    earned_badges: z.array(BadgeSchema).catch([]),
    next_recommended: z.string().nullish().catch(null),
    all_badges: z.array(BadgeSchema).catch([]),
  })
  .passthrough();

export type ProgressResponse = z.infer<typeof ProgressResponseSchema>;

/* ------------------------------------------------------------------ *
 * Payment Schemes
 * ------------------------------------------------------------------ */

const SchemeLimitsSchema = z
  .object({
    perTransaction: z.string().catch(""),
    perDay: z.string().catch(""),
    perMonth: z.string().catch(""),
    receiving: z.string().catch(""),
    note: z.string().catch(""),
  })
  .partial()
  .passthrough();

export const SchemeSourceSchema = z
  .object({
    name: z.string().catch(""),
    label: z.string().catch(""),
    url: z.string().catch(""),
  })
  .passthrough();

export type SchemeSource = z.infer<typeof SchemeSourceSchema>;

export const SchemeVariantSchema = z
  .object({
    name: z.string().catch(""),
    description: z.string().catch(""),
  })
  .passthrough();

export type SchemeVariant = z.infer<typeof SchemeVariantSchema>;

export const SchemeInfoSchema = z
  .object({
    name: z.string().catch(""),
    speed: z.string().catch(""),
    limit: z.string().catch(""),
    cost: z.string().catch(""),
    useCase: z.string().catch(""),
    operator: z.string().catch(""),
    howItWorks: z.array(z.string()).nullish().catch(null),
    features: z.array(z.string()).nullish().catch(null),
    limits: SchemeLimitsSchema.nullish().catch(null),
    processingWindows: z.array(z.string()).nullish().catch(null),
    settlement: z.string().nullish().catch(null),
    reversible: z.boolean().nullish().catch(null),
    protections: z.array(z.string()).nullish().catch(null),
    roadmap: z.array(z.string()).nullish().catch(null),
    family: z.string().nullish().catch(null),
    variants: z.array(SchemeVariantSchema).nullish().catch(null),
    sources: z.array(SchemeSourceSchema).nullish().catch(null),
  })
  .passthrough();

export type SchemeInfo = z.infer<typeof SchemeInfoSchema>;

export const SchemesResponseSchema = z
  .object({
    currency: z.string().catch(""),
    country: z.string().catch(""),
    countryCode: z.string().catch(""),
    iban: z.coerce.boolean().catch(false),
    localIdentifier: z.string().catch(""),
    schemes: z.array(SchemeInfoSchema).catch([]),
    verifiedAsof: z.string().nullish().catch(null),
  })
  .passthrough();

export type SchemesResponse = z.infer<typeof SchemesResponseSchema>;

/* ------------------------------------------------------------------ *
 * Payment Schemes — international catalogue entry
 * ------------------------------------------------------------------ */

/**
 * The /api/schemes/international entry (SWIFT gpi). Extends the enriched
 * domestic rail shape so the same detail component renders it, adding the
 * explicit "International / SWIFT" scope label, a verification date, and the
 * SIMULATION disclaimer.
 */
export const InternationalSchemesResponseSchema = SchemeInfoSchema.extend({
  scope: z.string().catch(""),
  verifiedAsof: z.string().nullish().catch(null),
  disclaimer: z.string().catch(""),
});

export type InternationalSchemesResponse = z.infer<
  typeof InternationalSchemesResponseSchema
>;

/* ------------------------------------------------------------------ *
 * AI Tutor
 * ------------------------------------------------------------------ */

export const TutorAvailabilitySchema = z.object({
  available: z.boolean(),
});

export type TutorAvailability = z.infer<typeof TutorAvailabilitySchema>;

/**
 * Mirrors `app/tutor/schemas.py`.
 *
 * Parsing policy differs by direction, on purpose. The REQUEST is authored by
 * Relay itself, so a bad field is a bug we want surfaced — no `.catch()`.
 * The RESPONSE is inbound, but its optional fields still enforce the same
 * bounds as Pydantic. A malformed or oversized value must fail loudly rather
 * than be silently coerced into a different response shape.
 */
export const TutorModeSchema = z.enum(["chat", "explain", "hint", "quiz"]);

export type TutorMode = z.infer<typeof TutorModeSchema>;

export const TutorSurfaceSchema = z.enum([
  "global",
  "lesson",
  "scheme",
  "tracking",
  "tool",
  "case",
]);

export type TutorSurface = z.infer<typeof TutorSurfaceSchema>;

export const TutorContextSchema = z
  .object({
    surface: TutorSurfaceSchema,
    module_id: z.string().max(100).nullish(),
    module_title: z.string().max(200).nullish(),
    topic: z.string().max(120).nullish(),
    currency: z.string().max(20).nullish(),
    rail_name: z.string().max(120).nullish(),
    tool_name: z.string().max(120).nullish(),
    case_id: z.string().max(120).nullish(),
    resource_ref: z.string().max(160).nullish(),
    result_summary: z.string().max(4000).nullish(),
  })
  .passthrough();

export type TutorContext = z.infer<typeof TutorContextSchema>;

export const TutorTurnSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    // 6000, mirroring TutorTurn.content. A lower cap here would make the
    // panel reject its own prior answers before they ever reached the API.
    content: z.string().min(1).max(6000),
  })
  .passthrough();

export type TutorTurn = z.infer<typeof TutorTurnSchema>;

export const TutorRequestSchema = z
  .object({
    message: z.string().min(1).max(2000),
    mode: TutorModeSchema.default("chat"),
    context: TutorContextSchema,
    history: z.array(TutorTurnSchema).max(8).default([]),
  })
  .passthrough();

export type TutorRequest = z.infer<typeof TutorRequestSchema>;

function isSafeTutorCitationUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export const TutorCitationUrlSchema = z
  .string()
  .max(500)
  .refine(isSafeTutorCitationUrl, "Citation URL must use http or https")
  .nullish();

export const TutorCitationSchema = z
  .object({
    source_id: z.string().min(1).max(160),
    title: z.string().min(1).max(240),
    url: TutorCitationUrlSchema,
    evidence: z.string().min(1).max(500),
  })
  .passthrough();

export type TutorCitation = z.infer<typeof TutorCitationSchema>;

export const TutorResponseSchema = z
  .object({
    answer: z.string().min(1).max(6000),
    mode: TutorModeSchema,
    grounded: z.boolean(),
    turn_id: z.string().min(1),
    citations: z.array(TutorCitationSchema).max(8),
    follow_up: z.string().max(500).nullish(),
    needs_clarification: z.boolean(),
    safety_notice: z.string().max(500).nullish(),
  })
  .passthrough();

export type TutorResponse = z.infer<typeof TutorResponseSchema>;
