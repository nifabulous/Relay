/**
 * Legacy parity contract — the behavioral inventory that must be satisfied
 * before the legacy vanilla-JS labs can be retired.
 *
 * Each entry records what the legacy lab teaches, which API endpoints it calls,
 * and which checkpoints the Relay replacement must emit to mark the module complete.
 */

export interface LabParityEntry {
  /** Module title (matches curriculum.ts) */
  title: string;
  /** Legacy source files that define the original behavior */
  legacySources: string[];
  /** API endpoints the lab calls */
  apiEndpoints: string[];
  /** Interactive elements the lab provides */
  interactions: string[];
  /** Checkpoints that must all fire to mark the lab complete */
  requiredCheckpoints: readonly string[];
}

export const CORE_LAB_PARITY: Record<string, LabParityEntry> = {
  "lab-1": {
    title: "Who's Who: BICs & IBANs",
    legacySources: ["app/static/js/learn-labs.js"],
    apiEndpoints: ["/api/validate", "/api/lookup"],
    interactions: [
      "Static BIC decomposition (CITIUS33XXX → bank/country/location/branch)",
      "Static IBAN decomposition (GB29NWBK60161331926819 → country/checksum/bank/BBAN)",
      "Live analyzer: input → validate API → decompose + bank lookup",
      "Exercise 1: identify country from BIC GTBINGLAXXX",
      "Exercise 2: identify bank from IBAN GB29NWBK60161331926819",
    ],
    requiredCheckpoints: ["analyze-identifier", "identify-country", "identify-bank"],
  },

  "lab-2": {
    title: "Is It Real? Checksums",
    legacySources: ["app/static/js/learn-labs-2-3.js"],
    apiEndpoints: ["/api/validate"],
    interactions: [
      "Pre-filled valid IBAN demo with Check button",
      "Break-it interactive: edit IBAN → see checksum fail",
      "Find-the-typo exercise: choose valid vs invalid IBAN",
      "Client-side MOD-97 steps for education",
    ],
    requiredCheckpoints: ["validate-original", "break-checksum", "find-valid-iban"],
  },

  "lab-3": {
    title: "Right Person? Verification of Payee",
    legacySources: ["app/static/js/learn-labs-2-3.js"],
    apiEndpoints: ["/api/verify-payee"],
    interactions: [
      "Outcome reference table (MATCH/CLOSE_MATCH/NO_MATCH/NOT_CHECKED)",
      "Demo form with quick-scenario buttons (John Smith / Jon Smyth / Fraudster)",
      "Score bar visualization",
      "Close-match exercise: find a name scoring 0.75–0.90",
    ],
    requiredCheckpoints: ["run-match", "run-close-match", "identify-fraud-risk"],
  },

  "lab-4": {
    title: "How Money Moves: Correspondent Routing",
    legacySources: ["app/static/js/learn-labs-4-6.js", "app/static/js/visualizers.js"],
    apiEndpoints: ["/api/route"],
    interactions: [
      "Route demo: BIC + currency → find intermediaries",
      "Payment route visualization (animated chain)",
      "Nostro/Vostro accounting diagram",
      "Route-to-Japan exercise: enter intermediary count for BOTKJPJTXXX/USD",
    ],
    requiredCheckpoints: ["route-demo", "route-japan"],
  },

  "lab-5": {
    title: "Where to Send: Settlement Instructions",
    legacySources: ["app/static/js/learn-labs-4-6.js"],
    apiEndpoints: ["/api/ssi"],
    interactions: [
      "SSI lookup: BIC + currency → instructions table",
      "Charge code explainer (OUR/SHA/BEN)",
      "Placeholder account warning",
      "Find-correspondent exercise: identify Emirates NBD's USD correspondent",
    ],
    requiredCheckpoints: ["lookup-ssi", "identify-correspondent"],
  },

  "lab-6": {
    title: "Did It Arrive? Tracking with UETR",
    legacySources: ["app/static/js/learn-labs-4-6.js", "app/static/js/visualizers.js"],
    apiEndpoints: ["/api/track/create"],
    interactions: [
      "Payment creation form (8 fields, defaults BOFA→GTBank)",
      "UETR banner with 36-char UUID",
      "Timeline visualization with status events",
      "Fee-reading exercise: enter total deducted",
    ],
    requiredCheckpoints: ["create-payment", "read-fee-deduction"],
  },

  "lab-7": {
    title: "Which Rail? Payment Schemes",
    legacySources: ["app/static/js/learn-lab-schemes.js"],
    apiEndpoints: ["/api/schemes"],
    interactions: [
      "Currency picker (10 pill buttons)",
      "Scheme card grid from API",
      "7 scenario quizzes (payroll, dinner, treasury, street vendor, farmer, SEPA, salaries)",
    ],
    requiredCheckpoints: ["load-schemes", "complete-seven-scenarios"],
  },

  "lab-8": {
    title: "Message Standards: MT103 → ISO 20022",
    legacySources: [],
    apiEndpoints: ["/api/message/translate", "/api/message/pacs008-check"],
    interactions: [
      "Decompose a sample MT103",
      "Field-mapping quiz (MT tag → pacs.008 element)",
      "Side-by-side MT vs pacs.008 XML via /api/message/translate",
      "Coexistence timeline (2023 start · 22 Nov 2025 MT retired · Nov 2026 structured address)",
      "Structured-address fat-finger: country-only address → REPAIRABLE hold",
    ],
    requiredCheckpoints: ["map-fields", "translate-message", "flag-address"],
  },

  "capstone": {
    title: "Capstone: Full Payment Simulation",
    legacySources: ["app/static/js/learn-capstone.js"],
    apiEndpoints: [
      "/api/validate", "/api/verify-payee", "/api/route",
      "/api/ssi", "/api/prepare-payment", "/api/track/create",
    ],
    interactions: [
      "6-step wizard: Validate → Verify → Route → Settle → Decide → Track",
      "Step indicator with progress",
      "Per-step results with branching (MATCH proceeds, CLOSE_MATCH reviews, NO_MATCH stops)",
      "Recommendation display with reason and UETR",
      "Tracking timeline on final step",
    ],
    requiredCheckpoints: ["validate", "verify", "route", "settle", "decide", "track"],
  },
};
