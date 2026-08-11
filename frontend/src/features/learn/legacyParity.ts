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
      "Decision drill: two multiple-choice judgment calls (CLOSE_MATCH and NOT_CHECKED)",
    ],
    requiredCheckpoints: ["run-match", "run-close-match", "identify-fraud-risk", "decide-outcome"],
  },

  "lab-4": {
    title: "How Money Moves: Correspondent Routing",
    legacySources: ["app/static/js/learn-labs-4-6.js", "app/static/js/visualizers.js"],
    apiEndpoints: ["/api/route"],
    interactions: [
      "Route demo: BIC + currency → published SSI correspondents or heuristic candidates, labeled by basis",
      "Settlement IDs on candidates (CHIPS participant number + ABA routing number)",
      "Payment route visualization (animated chain)",
      "Nostro/Vostro accounting diagram",
      "CHIPS vs Fedwire settlement-layer table + decision drill",
      "Serial vs cover payment decision drill",
      "Route-to-Japan exercise: enter intermediary count for BOTKJPJTXXX/USD",
    ],
    requiredCheckpoints: ["route-demo", "settlement-system", "serial-cover", "route-japan"],
  },

  "lab-5": {
    title: "Where to Send: Settlement Instructions",
    legacySources: ["app/static/js/learn-labs-4-6.js"],
    apiEndpoints: ["/api/ssi"],
    interactions: [
      "Worked example: annotated field-by-field read of one SSI record",
      "SSI lookup: BIC + currency → instructions table",
      "Charge code explainer (OUR/SHA/BEN)",
      "Decision points: charge-code choice and wrong-correspondent consequence (MC)",
      "Placeholder account warning",
      "Find-correspondent exercise: identify Emirates NBD's USD correspondent",
      "Forward link to the capstone Settle step",
    ],
    requiredCheckpoints: ["lookup-ssi", "choose-charge-code", "identify-correspondent"],
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

  "lab-9": {
    title: "Rails Deep-Dive: Canada & UK",
    legacySources: [],
    apiEndpoints: ["/api/schemes", "/api/verify-payee", "/api/message/pacs008-check"],
    interactions: [
      "Enriched CAD/GBP rail detail from /api/schemes",
      "Interac Autodeposit ↔ VoP name reveal",
      "CHAPS → pacs.008 structured-address hold",
      "EFT window simulator, layered-limit checker, APP 'who pays' panel",
      "Rail-chooser scenarios",
    ],
    requiredCheckpoints: ["autodeposit-vop", "chaps-pacs008", "eft-window", "limit-check", "rail-chooser", "app-reimbursement"],
  },

  "gbp-eur-rails": {
    title: "Rails Deep-Dive: UK & Eurozone",
    legacySources: [],
    apiEndpoints: ["/api/schemes"],
    interactions: [
      "Enriched GBP/EUR rail detail from /api/schemes",
      "CHAPS attribute table (RTGS, finality, hours, ISO 20022 mandates)",
      "Bacs three-day-cycle simulator with cut-off and weekend rolls",
      "Faster Payments limits + protections panel",
      "GBP rail-chooser scenarios (payroll / completion / Sunday night)",
      "SEPA + TARGET2 explainer with Instant Payments Regulation timeline",
      "EUR rail picker: amount + urgency → SCT Inst / SCT / TARGET2",
      "EUR rail-chooser scenarios (Friday evening / treasury)",
    ],
    requiredCheckpoints: ["gbp-rail-detail", "bacs-cycle", "gbp-rail-chooser", "eur-rail-detail", "sct-inst-limit", "eur-rail-chooser"],
  },

  "cad-rails": {
    title: "Rails Deep-Dive: Canada",
    legacySources: [],
    apiEndpoints: ["/api/schemes"],
    interactions: [
      "Enriched CAD rail detail from /api/schemes",
      "Three-layer stack table (Lynx / EFT via ACSS / Interac)",
      "CAD rail picker: amount + urgency → Interac / Lynx / EFT",
      "RTR roadmap multiple-choice",
      "CAD rail-chooser scenarios (acquisition / vendor run)",
    ],
    requiredCheckpoints: ["cad-rail-detail", "lynx-vs-eft", "rtr-roadmap", "cad-rail-chooser"],
  },

  "fees-fx": {
    title: "Follow the Money: Fees & FX",
    legacySources: ["app/static/js/learn.js (fees + fx hash modules)"],
    apiEndpoints: ["/api/fees/simulate"],
    interactions: [
      "Currency picker: USD, CAD, GBP, EUR — each with its own correspondent chain",
      "Fee chain simulator: amount + charge code → per-hop deduction table",
      "Charge-code comparison: run OUR and SHA on the same payment",
      "Predict-the-received exercise (per currency) before running the simulation",
      "FX margin panel: mid-market vs offered rate, hidden cost calculation",
      "FX margin multiple-choice: spot the real cost of the spread",
    ],
    requiredCheckpoints: ["simulate-fees", "predict-received", "spot-fx-margin"],
  },

  "sanctions": {
    title: "Stopped at the Border: Sanctions Screening",
    legacySources: ["app/static/js/learn.js (sanctions hash module)"],
    apiEndpoints: ["/api/screen"],
    interactions: [
      "Decision-band reference table (CLEAR / POSSIBLE_HIT / HARD_HIT)",
      "Live screening demo with quick scenarios (clean / possible hit / hard hit)",
      "Per-hop screening table showing every bank re-screening the chain",
      "Threshold judgment multiple-choice (0.82 score)",
      "Find-the-grey-zone exercise: craft a name scoring 0.75–0.90 against the live API",
      "Escalation and false-positive decision drills",
    ],
    requiredCheckpoints: [
      "screen-scenarios", "judge-threshold", "find-possible-hit",
      "escalation-decision", "false-positive",
    ],
  },

  "exceptions-returns": {
    title: "When Payments Fail: Exceptions & Returns",
    legacySources: [],
    apiEndpoints: ["/api/track/create"],
    interactions: [
      "Exception taxonomy table (reject / return / recall with ISO 20022 messages)",
      "Doomed-payment demo: create a rejected payment and read its timeline",
      "Where-did-it-die exercise against the live timeline",
      "Return reason code table (AC01, AC04, AC06, AM05, CUST, FOCR, FRAD) + drill",
      "Recall-reality decision (camt.056 is a request, not a command)",
      "NO_MATCH aftermath decision drill",
    ],
    requiredCheckpoints: [
      "simulate-rejection", "read-rejection", "map-return-code",
      "recall-reality", "misdirected-aftermath",
    ],
  },

  "ops-repair": {
    title: "The Ops Desk: STP Repair & Nostro Recon",
    legacySources: [],
    apiEndpoints: ["/api/message/stp-check"],
    interactions: [
      "Repair queue: broken MT103-shaped payment with an empty field 59",
      "Live STP check with findings and suggested repairs",
      "Choose-the-repair decision drill, then repaired re-run to CLEAN",
      "Nostro ledger vs correspondent statement (camt.053) comparison tables",
      "Break-classification decision (lift-fee amount break)",
      "Size-the-break exercise (expected minus received)",
    ],
    requiredCheckpoints: [
      "run-stp-check", "choose-repair", "rerun-clean",
      "spot-break", "size-break",
    ],
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
