/**
 * Synthetic supplier case catalog (Task 1).
 *
 * This file holds AUTHOR-TIME data only — no runtime logic beyond the export.
 * All names and values are obviously fictional and clearly labelled as a
 * simulation/training scenario. NEVER put real customer, account, beneficiary,
 * or transaction data here.
 *
 * The single case (`canada-us-supplier`) is a researchable scenario where a
 * Canadian business pays a US supplier in USD. The rails are designed to create
 * a learning gradient: one domestic-only rail is ineligible, one cross-border
 * rail is eligible but slower/cheaper, and one USD wire rail is the best fit
 * under the case's disclosed urgency + tracking priorities.
 *
 * The `transfer` is a close-but-simpler variant used in the debrief phase to
 * test independent transfer of skill. It is plain data (NOT a separate,
 * routable CaseDefinition).
 */

import type {
  CaseDefinition,
  CaseFact,
  RailOption,
  SourceClaim,
} from "./caseTypes";

// ─── Shared source claims ───────────────────────────────────────────────────
// Realistic-but-fictional source attribution. All material claims carry a
// source, owner, verification date, jurisdiction/currency, scope, and a
// review-by date that is strictly later than the verification date.

const SCHEME_REF: SourceClaim = {
  source: "Relay scheme reference (simulation)",
  owner: "Relay Learn",
  verifiedAt: "2026-02-01",
  reviewBy: "2026-08-01",
  jurisdiction: "CA→US",
  currency: "USD",
  scope: "scheme-rule",
};

const OPERATOR_GUIDANCE: SourceClaim = {
  source: "Relay operations bulletin (simulation)",
  owner: "Relay Learn",
  verifiedAt: "2026-02-01",
  reviewBy: "2026-08-01",
  jurisdiction: "CA→US",
  currency: "USD",
  scope: "operator-guidance",
};

const INSTITUTION_CONFIG: SourceClaim = {
  source: "Maple Ridge Credit Union (simulation)",
  owner: "Relay Learn",
  verifiedAt: "2026-02-01",
  reviewBy: "2026-08-01",
  jurisdiction: "CA",
  scope: "institution-config",
};

const SCENARIO_ASSUMPTION: SourceClaim = {
  source: "Relay Learn scenario brief (fictional training example)",
  owner: "Relay Learn",
  verifiedAt: "2026-02-01",
  reviewBy: "2026-08-01",
  jurisdiction: "CA→US",
  currency: "USD",
  scope: "example-assumption",
};

// ─── Facts ──────────────────────────────────────────────────────────────────

const supplierCaseFacts: CaseFact[] = [
  {
    id: "destination-country",
    label: "Beneficiary country",
    value: "United States",
    state: "supplied",
    requestable: false,
    claim: SCENARIO_ASSUMPTION,
  },
  {
    id: "destination-currency",
    label: "Invoice currency",
    value: "USD",
    state: "supplied",
    requestable: false,
    claim: SCENARIO_ASSUMPTION,
  },
  {
    id: "amount",
    label: "Invoice amount",
    value: "USD 48,000.00",
    state: "supplied",
    requestable: false,
    claim: SCENARIO_ASSUMPTION,
  },
  {
    id: "urgency",
    label: "Timing / urgency",
    value: "Supplier needs value within 2 business days to release the shipment.",
    state: "supplied",
    requestable: false,
    claim: SCENARIO_ASSUMPTION,
  },
  {
    id: "price-sensitivity",
    label: "Fee sensitivity",
    value: "Customer is fee-conscious; willing to pay more only if it protects the deadline.",
    state: "gathered",
    requestable: true,
    claim: OPERATOR_GUIDANCE,
  },
  {
    id: "arrival-expectation",
    label: "Expected arrival",
    value: "Value must arrive at the supplier within 2 business days.",
    state: "supplied",
    requestable: false,
    claim: SCENARIO_ASSUMPTION,
  },
  {
    id: "tracking-need",
    label: "Tracking requirement",
    value: "Customer wants end-to-end tracking and confirmation of credit.",
    state: "gathered",
    requestable: true,
    claim: OPERATOR_GUIDANCE,
  },
  {
    id: "beneficiary-bank",
    label: "Beneficiary bank",
    value: "United-side Mercantile Bank NA (simulation), FW routing present.",
    state: "supplied",
    requestable: false,
    claim: SCENARIO_ASSUMPTION,
  },
  {
    id: "intermediary",
    label: "Intermediary correspondent",
    value: "USD routed via BNY Mellon (simulation) for Fedwire credit.",
    state: "gathered",
    requestable: true,
    claim: OPERATOR_GUIDANCE,
  },
  {
    id: "institution-variation",
    label: "Institution variation",
    value: "Outcome varies by sender bank; Maple Ridge Credit Union wires via a single USD correspondent.",
    state: "gathered",
    requestable: true,
    claim: INSTITUTION_CONFIG,
  },
];

// ─── Rails ──────────────────────────────────────────────────────────────────

const supplierCaseRails: RailOption[] = [
  {
    id: "interac-etransfer",
    name: "Interac e-Transfer",
    eligibility: "Domestic CAD transfers within Canada only. Not available for USD cross-border.",
    requiredFacts: ["destination-country", "destination-currency"],
    reasons: ["Instant CAD settlement", "Very low fees"],
    source: SCHEME_REF,
  },
  {
    id: "cross-border-ach",
    name: "Cross-border ACH",
    eligibility:
      "USD payments to the United States via ACH. Low cost but batch settlement; arrival is typically 1-3 business days.",
    requiredFacts: [
      "beneficiary-bank",
      "destination-currency",
      "amount",
      "price-sensitivity",
    ],
    reasons: ["Low fees", "Batch settlement, slower arrival"],
    source: SCHEME_REF,
  },
  {
    id: "swift-fedwire",
    name: "SWIFT wire to Fedwire",
    eligibility:
      "USD payments to the United States via Fedwire. Fast same-day USD value with full UETR tracking.",
    requiredFacts: [
      "beneficiary-bank",
      "destination-currency",
      "amount",
      "urgency",
      "tracking-need",
    ],
    reasons: ["Fast same-day USD value", "Full UETR tracking confirmation"],
    source: SCHEME_REF,
  },
];

// ─── Transfer (close, simpler variant for debrief) ──────────────────────────

const transferFacts: CaseFact[] = [
  {
    id: "destination-country",
    label: "Beneficiary country",
    value: "United States",
    state: "supplied",
    requestable: false,
  },
  {
    id: "destination-currency",
    label: "Invoice currency",
    value: "USD",
    state: "supplied",
    requestable: false,
  },
  {
    id: "amount",
    label: "Invoice amount",
    value: "USD 12,000.00",
    state: "supplied",
    requestable: false,
  },
  {
    id: "urgency",
    label: "Timing / urgency",
    value: "Supplier can wait up to a week; not time-critical.",
    state: "supplied",
    requestable: false,
  },
];

const transferRails: RailOption[] = [
  {
    id: "cross-border-ach",
    name: "Cross-border ACH",
    eligibility:
      "USD payments to the United States via ACH. Low cost, arrival within a few business days.",
    requiredFacts: ["destination-currency", "amount"],
    reasons: ["Low fees", "Suits non-urgent supplier payments"],
  },
];

// ─── The case ───────────────────────────────────────────────────────────────

export const supplierCase: CaseDefinition = {
  id: "canada-us-supplier",
  title: "Canada → US supplier payment",
  customerRequest:
    "Maple Ridge Outfitters (fictional simulation) needs to pay a US supplier, United-side Mercantile Supply, " +
    "USD 48,000 for a shipment. The supplier needs value within 2 business days to release the goods and wants " +
    "confirmation that the funds arrived. Recommend the right payment rail under these disclosed priorities.",
  verifiedAt: "2026-02-01",
  reviewBy: "2026-08-01",
  reviewStatus: "current",
  facts: supplierCaseFacts,
  rails: supplierCaseRails,
  transfer: {
    id: "canada-us-supplier-transfer",
    customerRequest:
      "Transfer variant (debrief): a smaller, non-urgent USD payment to a US supplier. Used to confirm the learner " +
      "can apply the same reasoning with less scaffolding.",
    facts: transferFacts,
    rails: transferRails,
  },
};
