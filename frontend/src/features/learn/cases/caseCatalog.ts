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
  AuthoredCaseDefinition,
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

function createSimulationClaim(
  source: string,
  jurisdiction: string,
  currency?: string,
): SourceClaim {
  return {
    source,
    owner: "Relay Learn",
    verifiedAt: "2026-08-05",
    reviewBy: "2027-02-05",
    jurisdiction,
    currency,
    scope: "simulation-only",
  };
}

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
    // T1: requestable facts ship `unknown` so the value is NOT visible in the
    // EvidenceRail until the learner requests it. The value above is what gets
    // revealed on request. Shipping `gathered` here was the cosmetic-
    // investigation bug: a learner could read every gathered value without
    // doing anything, then fill four boxes and reach `preferred`.
    state: "unknown",
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
    // T1: see price-sensitivity — ships unknown, revealed on request.
    state: "unknown",
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
    // T1: see price-sensitivity — ships unknown, revealed on request.
    state: "unknown",
    requestable: true,
    claim: OPERATOR_GUIDANCE,
  },
  {
    id: "institution-variation",
    label: "Institution variation",
    value: "Outcome varies by sender bank; Maple Ridge Credit Union wires via a single USD correspondent.",
    // T1: see price-sensitivity — ships unknown, revealed on request.
    state: "unknown",
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
    // Worked explanation revealed in the resolve phase after the learner
    // reviews the consequence (design spec L191). Teaches why this rail fits
    // the CA→US/USD corridor under the disclosed urgency + tracking priorities.
    workedExplanation:
      "SWIFT to Fedwire is the canonical path for urgent USD value to a US supplier: your bank sends a MT103/Fedwire message through its correspondent, the funds settle same-day at the supplier's bank, and the UETR lets you trace the hop and confirm credit — not just dispatch. The fee is justified when a missed deadline would cost more than the wire.",
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
    value: "Supplier can wait up to a week; not time-sensitive.",
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

/**
 * Content revision of the authored case (NOT the session schema version).
 *
 * Bump this whenever the case's authored facts, rails, eligibility text, or
 * disclosed priorities change in a way that would invalidate an in-flight
 * learner draft. The caseStore compares a stored session's `caseRevision`
 * against this constant on load: a mismatch means the stored draft was built
 * against stale case content and must NOT silently resume.
 *
 * Convention: an ISO-ish date tag plus a short slug, e.g. "2026-07-01.r1".
 * The exact format is not load-bearing — only equality is checked — but a
 * human-readable tag makes the bump easy to audit.
 *
 * 2026-07-20.investigation-load-bearing — the four requestable facts
 * (price-sensitivity, tracking-need, intermediary, institution-variation) now
 * ship `state: "unknown"` instead of `gathered`. A stored draft built against
 * the old "gathered" facts assumed their values were visible without
 * investigation; under the new contract the evaluator gates those facts on
 * `requestedFactIds`, so any in-flight draft must be re-investigated.
 */
const SUPPLIER_CASE_CONTENT_REVISION = "2026-07-20.investigation-load-bearing";

export const supplierCase: AuthoredCaseDefinition = {
  id: "canada-us-supplier",
  title: "Canada → US supplier payment",
  summary: "Canadian business paying a US supplier in USD",
  customerRequest:
    "Maple Ridge Outfitters (fictional simulation) needs to pay a US supplier, United-side Mercantile Supply, " +
    "USD 48,000 for a shipment. The supplier needs value within 2 business days to release the goods and wants " +
    "confirmation that the funds arrived. Recommend the right payment rail under these disclosed priorities.",
  contentRevision: SUPPLIER_CASE_CONTENT_REVISION,
  verifiedAt: "2026-02-01",
  reviewBy: "2026-08-01",
  reviewStatus: "current",
  facts: supplierCaseFacts,
  rails: supplierCaseRails,
  recommendation: {
    preferredRailId: "swift-fedwire",
    priorityFactIds: {
      urgency: "urgency",
      tracking: "tracking-need",
      cost: "price-sensitivity",
    },
    corridorLabel: "Canada → United States",
    paymentLabel: "Urgent USD supplier payment",
  },
  transfer: {
    id: "canada-us-supplier-transfer",
    customerRequest:
      "Transfer variant (debrief): a smaller, non-urgent USD payment to a US supplier. Used to confirm the learner " +
      "can apply the same reasoning with less scaffolding.",
    facts: transferFacts,
    rails: transferRails,
  },
};

const ukEurozoneSupplierCaseFacts: CaseFact[] = [
  {
    id: "destination-country",
    label: "Beneficiary country",
    value: "Germany",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay UK→DE case brief (simulation)", "GB→DE", "EUR"),
  },
  {
    id: "destination-currency",
    label: "Invoice currency",
    value: "EUR",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay UK→DE case brief (simulation)", "GB→DE", "EUR"),
  },
  {
    id: "amount",
    label: "Invoice amount",
    value: "EUR 18,500.00",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay UK→DE case brief (simulation)", "GB→DE", "EUR"),
  },
  {
    id: "urgency",
    label: "Timing / urgency",
    value: "Supplier wants value today if possible; next-morning credit is acceptable.",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay UK→DE timing note (simulation)", "GB→DE", "EUR"),
  },
  {
    id: "beneficiary-bank",
    label: "Beneficiary bank",
    value: "Rhein Commerce Bank AG (simulation), SEPA Instant reachable.",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay UK→DE banking setup (simulation)", "GB→DE", "EUR"),
  },
  {
    id: "tracking-need",
    label: "Tracking requirement",
    value: "Buyer wants confirmation when funds hit the supplier account before goods dispatch.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay UK→DE customer preference (simulation)", "GB→DE", "EUR"),
  },
  {
    id: "fee-sensitivity",
    label: "Fee sensitivity",
    value: "Customer accepts a moderate premium for reliability but prefers scheme pricing over correspondent fees.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay UK→DE customer preference (simulation)", "GB→DE", "EUR"),
  },
  {
    id: "beneficiary-reachability",
    label: "Beneficiary reachability",
    value: "Beneficiary bank confirms SCT Inst reachability and can receive instant EUR credits.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay UK→DE reachability note (simulation)", "GB→DE", "EUR"),
  },
];

const ukEurozoneSupplierCaseRails: RailOption[] = [
  {
    id: "sepa-instant",
    name: "SEPA Instant",
    eligibility:
      "EUR payments to reachable eurozone beneficiaries with near-real-time settlement and scheme confirmation.",
    eligibilityRules: [
      { factId: "destination-currency", operator: "equals", value: "EUR", outcome: "eligible" },
      {
        factId: "beneficiary-reachability",
        operator: "includes",
        value: "SCT Inst reachability",
        outcome: "eligible",
      },
    ],
    requiredFacts: [
      "destination-currency",
      "amount",
      "urgency",
      "beneficiary-bank",
      "beneficiary-reachability",
    ],
    reasons: [
      "Fast EUR settlement into the eurozone",
      "Meets same-day supplier release pressure",
    ],
    fitTags: ["urgency", "tracking", "cost"],
    workedExplanation:
      "SEPA Instant fits because the payment is already in EUR, the German beneficiary is reachable, and the case rewards speed without needing a full correspondent-wire path. It gets value to the supplier quickly while avoiding the extra cost and operational drag of a SWIFT EUR payment.",
    source: createSimulationClaim("Relay UK→DE rail matrix (simulation)", "GB→DE", "EUR"),
  },
  {
    id: "swift-eur-shared",
    name: "SWIFT EUR shared-charge wire",
    eligibility:
      "EUR correspondent transfer to Germany with broader bank coverage, but slower settlement and higher fees than SEPA Instant.",
    requiredFacts: ["destination-currency", "amount", "beneficiary-bank", "tracking-need"],
    reasons: ["Broad reach", "Tracking available", "More expensive than scheme rails"],
    fitTags: ["correspondent", "tracked", "fallback-coverage"],
    source: createSimulationClaim("Relay UK→DE rail matrix (simulation)", "GB→DE", "EUR"),
  },
  {
    id: "chaps-gbp-domestic",
    name: "CHAPS domestic GBP",
    eligibility:
      "Domestic GBP settlement within the United Kingdom only. Not a fit for a German beneficiary receiving EUR.",
    eligibilityRules: [
      {
        factId: "destination-country",
        operator: "equals",
        value: "United Kingdom",
        outcome: "eligible",
      },
      {
        factId: "destination-currency",
        operator: "equals",
        value: "GBP",
        outcome: "eligible",
      },
    ],
    requiredFacts: ["destination-country", "destination-currency"],
    reasons: ["Domestic same-day rail", "Not cross-border EUR capable"],
    fitTags: ["domestic-only", "wrong-currency", "ineligible"],
    source: createSimulationClaim("Relay UK domestic rail note (simulation)", "GB", "GBP"),
  },
];

const nigeriaUkContractorCaseFacts: CaseFact[] = [
  {
    id: "destination-country",
    label: "Beneficiary country",
    value: "United Kingdom",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay NG→UK case brief (simulation)", "NG→GB", "GBP"),
  },
  {
    id: "destination-currency",
    label: "Invoice currency",
    value: "GBP",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay NG→UK case brief (simulation)", "NG→GB", "GBP"),
  },
  {
    id: "amount",
    label: "Invoice amount",
    value: "GBP 9,800.00",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay NG→UK case brief (simulation)", "NG→GB", "GBP"),
  },
  {
    id: "urgency",
    label: "Timing / urgency",
    value: "Contractor wants cleared funds this week before payroll close.",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay NG→UK timing note (simulation)", "NG→GB", "GBP"),
  },
  {
    id: "beneficiary-bank",
    label: "Beneficiary bank",
    value: "Northbridge Business Bank plc (simulation), UK domestic GBP account.",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay NG→UK banking setup (simulation)", "NG→GB", "GBP"),
  },
  {
    id: "tracking-need",
    label: "Tracking requirement",
    value: "Finance lead wants a message reference and proof of credit for the contractor file.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay NG→UK customer preference (simulation)", "NG→GB", "GBP"),
  },
  {
    id: "compliance-doc",
    label: "Documentation readiness",
    value: "Underlying invoice and contract packet are already approved for a standard cross-border wire review.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay NG→UK compliance note (simulation)", "NG→GB", "GBP"),
  },
  {
    id: "fee-sensitivity",
    label: "Fee sensitivity",
    value: "Customer prefers predictable fees and accepts a higher cost if it avoids rework or payment delay.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay NG→UK customer preference (simulation)", "NG→GB", "GBP"),
  },
];

const nigeriaUkContractorCaseRails: RailOption[] = [
  {
    id: "swift-gbp",
    name: "SWIFT GBP wire",
    eligibility:
      "Cross-border GBP payment with correspondent delivery into a UK GBP account and message-level tracking.",
    eligibilityRules: [
      { factId: "destination-currency", operator: "equals", value: "GBP", outcome: "eligible" },
      {
        factId: "beneficiary-bank",
        operator: "includes",
        value: "GBP account",
        outcome: "eligible",
      },
    ],
    requiredFacts: [
      "destination-currency",
      "beneficiary-bank",
      "urgency",
      "tracking-need",
      "compliance-doc",
    ],
    reasons: [
      "Direct fit for GBP into the UK",
      "Tracking and proof of payment align with the case priority",
    ],
    fitTags: ["urgency", "tracking", "cost"],
    workedExplanation:
      "SWIFT GBP is the best fit because the contractor needs funds this week, the beneficiary can receive GBP locally, and the sender wants traceable delivery evidence. It avoids forcing a currency conversion path and gives the operations team a clear reference trail if the contractor asks for confirmation.",
    source: createSimulationClaim("Relay NG→UK rail matrix (simulation)", "NG→GB", "GBP"),
  },
  {
    id: "local-collection-gbp",
    name: "GBP local collection via partner",
    eligibility:
      "GBP payout through a UK collection partner. Lower cost, but partner batching can delay same-week certainty.",
    requiredFacts: ["destination-currency", "beneficiary-bank", "fee-sensitivity"],
    reasons: ["Lower cost path", "Less control over exact delivery timing"],
    fitTags: ["partner-payout", "lower-cost", "slower-confirmation"],
    source: createSimulationClaim("Relay NG→UK rail matrix (simulation)", "NG→GB", "GBP"),
  },
  {
    id: "sepa-eur-payout",
    name: "SEPA EUR payout",
    eligibility:
      "EUR-only eurozone settlement rail. Not suitable for a UK GBP contractor payment.",
    eligibilityRules: [
      { factId: "destination-currency", operator: "equals", value: "EUR", outcome: "eligible" },
    ],
    requiredFacts: ["destination-currency", "destination-country"],
    reasons: ["Cheap for EUR in the eurozone", "Wrong currency and corridor here"],
    fitTags: ["wrong-currency", "eurozone-only", "ineligible"],
    source: createSimulationClaim("Relay eurozone fallback note (simulation)", "EU", "EUR"),
  },
];

const usMexicoVendorCaseFacts: CaseFact[] = [
  {
    id: "destination-country",
    label: "Beneficiary country",
    value: "Mexico",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→MX case brief (simulation)", "US→MX", "USD"),
  },
  {
    id: "destination-currency",
    label: "Invoice currency",
    value: "USD",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→MX case brief (simulation)", "US→MX", "USD"),
  },
  {
    id: "amount",
    label: "Invoice amount",
    value: "USD 32,400.00",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→MX case brief (simulation)", "US→MX", "USD"),
  },
  {
    id: "urgency",
    label: "Timing / urgency",
    value: "Vendor needs same-day value in USD to release goods from customs hold.",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→MX timing note (simulation)", "US→MX", "USD"),
  },
  {
    id: "beneficiary-bank",
    label: "Beneficiary bank",
    value: "Banco Costera (simulation), USD credit via US correspondent routing.",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→MX banking setup (simulation)", "US→MX", "USD"),
  },
  {
    id: "tracking-need",
    label: "Tracking requirement",
    value: "Operations wants traceability through final credit because the shipment is at the border now.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay US→MX customer preference (simulation)", "US→MX", "USD"),
  },
  {
    id: "same-day-cutoff",
    label: "Same-day cutoff",
    value: "Sender is still within the correspondent's same-day USD cutoff window.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay US→MX cutoff note (simulation)", "US→MX", "USD"),
  },
  {
    id: "fee-sensitivity",
    label: "Fee sensitivity",
    value: "Customer will pay expedited fees to avoid demurrage and customs delay.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay US→MX customer preference (simulation)", "US→MX", "USD"),
  },
];

const usMexicoVendorCaseRails: RailOption[] = [
  {
    id: "swift-usd-mexico",
    name: "SWIFT USD wire to Mexico",
    eligibility:
      "Urgent USD payment routed through a US correspondent for final credit to a Mexican beneficiary bank.",
    eligibilityRules: [
      { factId: "destination-currency", operator: "equals", value: "USD", outcome: "eligible" },
      {
        factId: "beneficiary-bank",
        operator: "includes",
        value: "USD credit",
        outcome: "eligible",
      },
    ],
    requiredFacts: [
      "destination-currency",
      "beneficiary-bank",
      "urgency",
      "tracking-need",
      "same-day-cutoff",
    ],
    reasons: [
      "Fastest path for same-day USD value",
      "Tracking helps confirm release-critical credit",
    ],
    fitTags: ["urgency", "tracking", "cost"],
    workedExplanation:
      "SWIFT USD to Mexico is the best fit because this case is genuinely time-critical, the beneficiary can accept USD through a correspondent, and the sender is still inside the same-day cutoff. The wire path costs more, but it directly optimizes for customs release and traceable final credit.",
    source: createSimulationClaim("Relay US→MX rail matrix (simulation)", "US→MX", "USD"),
  },
  {
    id: "cross-border-ach-mexico",
    name: "Cross-border ACH to Mexico",
    eligibility:
      "Lower-cost USD payout into Mexico through a partner batch file. Delivery is usually next day or later.",
    requiredFacts: ["destination-currency", "amount", "fee-sensitivity"],
    reasons: ["Lower fees", "Not ideal for same-day release pressure"],
    fitTags: ["batch", "lower-cost", "slower-arrival"],
    source: createSimulationClaim("Relay US→MX rail matrix (simulation)", "US→MX", "USD"),
  },
  {
    id: "fednow-domestic",
    name: "FedNow domestic USD",
    eligibility:
      "US domestic instant payment rail only. Not available for a Mexican beneficiary bank.",
    eligibilityRules: [
      {
        factId: "destination-country",
        operator: "equals",
        value: "United States",
        outcome: "eligible",
      },
    ],
    requiredFacts: ["destination-country", "destination-currency"],
    reasons: ["Domestic instant USD rail", "Cross-border Mexico corridor is out of scope"],
    fitTags: ["domestic-only", "wrong-corridor", "ineligible"],
    source: createSimulationClaim("Relay US domestic rail note (simulation)", "US", "USD"),
  },
];

const ukEurozoneSupplierCase: AuthoredCaseDefinition = {
  id: "uk-eurozone-supplier",
  title: "UK → Eurozone supplier payment",
  summary: "UK buyer paying a German supplier in EUR",
  customerRequest:
    "North Quay Retail (fictional simulation) is paying a German supplier EUR 18,500 for inventory replenishment. The supplier wants funds quickly enough to dispatch today, and the buyer wants confidence the credit lands without paying unnecessary correspondent-wire fees.",
  contentRevision: "2026-08-10.uk-eurozone-supplier-r1",
  verifiedAt: "2026-08-05",
  reviewBy: "2027-02-05",
  reviewStatus: "current",
  facts: ukEurozoneSupplierCaseFacts,
  rails: ukEurozoneSupplierCaseRails,
  recommendation: {
    preferredRailId: "sepa-instant",
    priorityFactIds: {
      urgency: "urgency",
      tracking: "tracking-need",
      cost: "fee-sensitivity",
    },
    corridorLabel: "United Kingdom → Germany",
    paymentLabel: "EUR supplier payment",
  },
  transfer: {
    id: "uk-eurozone-supplier-transfer",
    customerRequest:
      "Transfer variant (debrief): a routine EUR supplier payment to Germany where next-day settlement is acceptable.",
    facts: [
      ukEurozoneSupplierCaseFacts[0],
      ukEurozoneSupplierCaseFacts[1],
      {
        id: "amount",
        label: "Invoice amount",
        value: "EUR 4,250.00",
        state: "supplied",
        requestable: false,
      },
      {
        id: "urgency",
        label: "Timing / urgency",
        value: "Supplier can wait until tomorrow morning.",
        state: "supplied",
        requestable: false,
      },
    ],
    rails: [
      {
        id: "sepa-credit-transfer",
        name: "SEPA Credit Transfer",
        eligibility:
          "Standard EUR transfer into the eurozone with next-day style settlement.",
        requiredFacts: ["destination-currency", "amount"],
        reasons: ["Low-cost routine EUR payment"],
      },
    ],
  },
};

const nigeriaUkContractorCase: AuthoredCaseDefinition = {
  id: "nigeria-uk-contractor",
  title: "Nigeria → UK contractor payment",
  summary: "Nigerian company paying a UK contractor in GBP",
  customerRequest:
    "Lagos Beacon Services (fictional simulation) needs to pay a UK contractor GBP 9,800 for completed project work. The contractor expects funds this week, and the finance lead wants a traceable path that minimizes rework if payment proof is requested.",
  contentRevision: "2026-08-10.nigeria-uk-contractor-r1",
  verifiedAt: "2026-08-05",
  reviewBy: "2027-02-05",
  reviewStatus: "current",
  facts: nigeriaUkContractorCaseFacts,
  rails: nigeriaUkContractorCaseRails,
  recommendation: {
    preferredRailId: "swift-gbp",
    priorityFactIds: {
      urgency: "urgency",
      tracking: "tracking-need",
      cost: "fee-sensitivity",
    },
    corridorLabel: "Nigeria → United Kingdom",
    paymentLabel: "GBP contractor payment",
  },
  transfer: {
    id: "nigeria-uk-contractor-transfer",
    customerRequest:
      "Transfer variant (debrief): a smaller GBP contractor payment where timing matters less than price.",
    facts: [
      nigeriaUkContractorCaseFacts[0],
      nigeriaUkContractorCaseFacts[1],
      {
        id: "amount",
        label: "Invoice amount",
        value: "GBP 2,100.00",
        state: "supplied",
        requestable: false,
      },
      {
        id: "urgency",
        label: "Timing / urgency",
        value: "Funds can land next week.",
        state: "supplied",
        requestable: false,
      },
    ],
    rails: [
      {
        id: "local-collection-gbp",
        name: "GBP local collection via partner",
        eligibility:
          "GBP payout through a UK collection partner when delivery speed is less critical.",
        requiredFacts: ["destination-currency", "amount"],
        reasons: ["Low-cost routine payout"],
      },
    ],
  },
};

const usMexicoVendorCase: AuthoredCaseDefinition = {
  id: "us-mexico-vendor",
  title: "US → Mexico urgent vendor payment",
  summary: "US buyer paying an urgent Mexico vendor in USD",
  customerRequest:
    "Harborline Imports (fictional simulation) needs to send a USD 32,400 payment to a Mexico vendor whose shipment is waiting at customs. The vendor needs same-day value to release the goods, and operations needs traceable confirmation that credit actually landed.",
  contentRevision: "2026-08-10.us-mexico-vendor-r1",
  verifiedAt: "2026-08-05",
  reviewBy: "2027-02-05",
  reviewStatus: "current",
  facts: usMexicoVendorCaseFacts,
  rails: usMexicoVendorCaseRails,
  recommendation: {
    preferredRailId: "swift-usd-mexico",
    priorityFactIds: {
      urgency: "urgency",
      tracking: "tracking-need",
      cost: "fee-sensitivity",
    },
    corridorLabel: "United States → Mexico",
    paymentLabel: "Urgent USD vendor payment",
  },
  transfer: {
    id: "us-mexico-vendor-transfer",
    customerRequest:
      "Transfer variant (debrief): a smaller USD vendor payment to Mexico where next-day arrival is acceptable.",
    facts: [
      usMexicoVendorCaseFacts[0],
      usMexicoVendorCaseFacts[1],
      {
        id: "amount",
        label: "Invoice amount",
        value: "USD 7,600.00",
        state: "supplied",
        requestable: false,
      },
      {
        id: "urgency",
        label: "Timing / urgency",
        value: "Vendor can wait until tomorrow.",
        state: "supplied",
        requestable: false,
      },
    ],
    rails: [
      {
        id: "cross-border-ach-mexico",
        name: "Cross-border ACH to Mexico",
        eligibility:
          "Lower-cost USD payout into Mexico when same-day delivery is not required.",
        requiredFacts: ["destination-currency", "amount"],
        reasons: ["Lower-cost non-urgent payout"],
      },
    ],
  },
};

const usNigeriaFamilyCaseFacts: CaseFact[] = [
  {
    id: "destination-country",
    label: "Beneficiary country",
    value: "Nigeria",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→NG case brief (simulation)", "US→NG", "NGN"),
  },
  {
    id: "destination-currency",
    label: "Payout currency",
    value: "NGN",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→NG case brief (simulation)", "US→NG", "NGN"),
  },
  {
    id: "amount",
    label: "Send amount",
    value: "USD 1,200.00 (paid out in NGN)",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→NG case brief (simulation)", "US→NG", "NGN"),
  },
  {
    id: "sender-location",
    label: "Sender location",
    value: "United States",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→NG case brief (simulation)", "US→NG", "NGN"),
  },
  {
    id: "urgency",
    label: "Timing / urgency",
    value: "Family needs the naira today for a medical deposit.",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→NG timing note (simulation)", "US→NG", "NGN"),
  },
  {
    id: "beneficiary-bank",
    label: "Beneficiary bank",
    value: "Zenith Trust Bank (simulation), NGN account, NIP reachable.",
    state: "supplied",
    requestable: false,
    claim: createSimulationClaim("Relay US→NG banking setup (simulation)", "US→NG", "NGN"),
  },
  {
    id: "tracking-need",
    label: "Confirmation requirement",
    value: "Sender wants a receipt confirming the naira actually landed in the family account.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay US→NG customer preference (simulation)", "US→NG", "NGN"),
  },
  {
    id: "fx-transparency",
    label: "FX transparency",
    value: "Sender compares providers on the NGN rate and wants the margin disclosed before sending.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay US→NG customer preference (simulation)", "US→NG", "NGN"),
  },
  {
    id: "fee-sensitivity",
    label: "Fee sensitivity",
    value: "Highly fee-sensitive: every dollar of fees comes out of the family's support.",
    state: "unknown",
    requestable: true,
    claim: createSimulationClaim("Relay US→NG customer preference (simulation)", "US→NG", "NGN"),
  },
];

const usNigeriaFamilyCaseRails: RailOption[] = [
  {
    id: "imto-ngn-payout",
    name: "Licensed IMTO NGN payout",
    eligibility:
      "USD funded in the US and paid out in NGN to a Nigerian bank account through a licensed money-transfer operator riding NIP. Minutes-fast payout with the FX margin disclosed upfront.",
    eligibilityRules: [
      { factId: "destination-currency", operator: "equals", value: "NGN", outcome: "eligible" },
      {
        factId: "beneficiary-bank",
        operator: "includes",
        value: "NIP reachable",
        outcome: "eligible",
      },
    ],
    requiredFacts: [
      "destination-currency",
      "amount",
      "urgency",
      "tracking-need",
      "fx-transparency",
    ],
    reasons: [
      "NGN lands in minutes via NIP payout",
      "Disclosed FX margin and payout receipt fit the sender's priorities",
    ],
    fitTags: ["urgency", "tracking", "cost"],
    workedExplanation:
      "The IMTO payout fits because the family needs naira, not dollars: funding in the US and paying out in NGN over NIP gets value to the account in minutes, the payout receipt answers the confirmation need, and the disclosed FX margin lets a fee-sensitive sender compare the true cost. A correspondent wire would cost more, take days, and still leave the conversion problem unsolved.",
    source: createSimulationClaim("Relay US→NG rail matrix (simulation)", "US→NG", "NGN"),
  },
  {
    id: "swift-usd-domiciliary",
    name: "SWIFT USD wire to a domiciliary account",
    eligibility:
      "USD correspondent wire into a Nigerian domiciliary (USD) account. Broad coverage and tracking, but days of correspondent time, lift fees on the way, and the family still has to convert to NGN themselves.",
    requiredFacts: ["amount", "beneficiary-bank", "fee-sensitivity"],
    reasons: [
      "Works even where payout partners don't reach",
      "Tracked end to end, but slower and more expensive for a small remittance",
    ],
    fitTags: ["correspondent", "tracked", "fallback-coverage"],
    source: createSimulationClaim("Relay US→NG rail matrix (simulation)", "US→NG", "NGN"),
  },
  {
    id: "nip-domestic",
    name: "NIP domestic transfer",
    eligibility:
      "NGN instant transfers between Nigerian bank accounts only. The sender is funding from the United States, so a purely domestic NIP transfer is not available to them.",
    eligibilityRules: [
      {
        factId: "sender-location",
        operator: "equals",
        value: "Nigeria",
        outcome: "eligible",
      },
    ],
    requiredFacts: ["sender-location", "destination-currency"],
    reasons: ["Instant and near-free inside Nigeria", "No cross-border funding leg"],
    fitTags: ["domestic-only", "wrong-corridor", "ineligible"],
    source: createSimulationClaim("Relay NG domestic rail note (simulation)", "NG", "NGN"),
  },
];

const usNigeriaFamilyCase: AuthoredCaseDefinition = {
  id: "us-nigeria-family-support",
  title: "US → Nigeria family support",
  summary: "US sender paying family support into an NGN account",
  customerRequest:
    "Chinwe A. (fictional simulation) is sending USD 1,200 from the United States to family in Lagos for a medical deposit. The family needs naira in their Zenith Trust Bank account today, the sender wants proof the money landed, and every dollar of fees matters. Recommend the right payment rail under these disclosed priorities.",
  contentRevision: "2026-08-11.us-nigeria-family-support-r1",
  verifiedAt: "2026-08-11",
  reviewBy: "2027-02-11",
  reviewStatus: "current",
  facts: usNigeriaFamilyCaseFacts,
  rails: usNigeriaFamilyCaseRails,
  recommendation: {
    preferredRailId: "imto-ngn-payout",
    priorityFactIds: {
      urgency: "urgency",
      tracking: "tracking-need",
      cost: "fee-sensitivity",
    },
    corridorLabel: "United States → Nigeria",
    paymentLabel: "NGN family-support payout",
  },
  transfer: {
    id: "us-nigeria-family-support-transfer",
    customerRequest:
      "Transfer variant (debrief): a routine monthly NGN allowance to the same family where arrival can slip a day or two.",
    facts: [
      usNigeriaFamilyCaseFacts[0],
      usNigeriaFamilyCaseFacts[1],
      {
        id: "amount",
        label: "Send amount",
        value: "USD 300.00 (paid out in NGN)",
        state: "supplied",
        requestable: false,
      },
      {
        id: "urgency",
        label: "Timing / urgency",
        value: "The family can wait until later in the week.",
        state: "supplied",
        requestable: false,
      },
    ],
    rails: [
      {
        id: "imto-ngn-payout",
        name: "Licensed IMTO NGN payout",
        eligibility:
          "Standard NGN payout for a routine remittance when arrival timing is flexible.",
        requiredFacts: ["destination-currency", "amount"],
        reasons: ["Low-cost routine NGN payout"],
      },
    ],
  },
};

export const CASE_CATALOG: readonly AuthoredCaseDefinition[] = [
  supplierCase,
  ukEurozoneSupplierCase,
  nigeriaUkContractorCase,
  usMexicoVendorCase,
  usNigeriaFamilyCase,
];

export function getCaseById(caseId: string): AuthoredCaseDefinition | undefined {
  return CASE_CATALOG.find((definition) => definition.id === caseId);
}

export const CASE_REVISION = supplierCase.contentRevision;
