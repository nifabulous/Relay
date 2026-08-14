/**
 * Shared Payment Schemes fixtures (plan task 0.1 — RED phase fixtures).
 *
 * UI tests reuse these instead of duplicating large inline JSON: one enriched
 * USD rail, one Interac parent with its three mandate variants, and one
 * SWIFT gpi international response.
 *
 * Shapes are deliberately aligned with the *planned* Task 0.2 types so those
 * types can parse them later without rework:
 *   - SchemeSource:  { name, label, url }
 *   - SchemeVariant: { name, description }
 *   - InternationalSchemesResponse: a SchemeInfo-shaped object carrying
 *     `sources`, `verifiedAsof`, `howItWorks`, `features`, `settlement`,
 *     `reversible`, `protections` and `roadmap` alongside the summary fields.
 *
 * URLs are the official operator/regulator pages recorded during plan
 * review; the source-cited catalogue contract requires primary sources.
 */

export interface SchemeSourceFixture {
  name: string;
  label: string;
  url: string;
}

export interface SchemeVariantFixture {
  name: string;
  description: string;
}

export interface EnrichedSchemeFixture {
  name: string;
  speed: string;
  limit: string;
  cost: string;
  useCase: string;
  operator: string;
  howItWorks: string[];
  features: string[];
  limits: Record<string, string>;
  processingWindows?: string[];
  settlement: string;
  reversible: boolean;
  protections: string[];
  roadmap: string[];
  sources: SchemeSourceFixture[];
  family?: string;
  variants?: SchemeVariantFixture[];
}

/** One enriched USD rail: Fedwire, the high-value RTGS wire service. */
export const usdFedwireRailFixture: EnrichedSchemeFixture = {
  name: "Fedwire",
  speed: "Real-time (RTGS)",
  limit: "No practical limit",
  cost: "$10-35",
  useCase: "High-value, wires",
  operator: "Federal Reserve",
  howItWorks: [
    "The sender's bank debits its Federal Reserve master account and credits the receiving bank's master account in real time",
    "Final and irrevocable once credited — there is no clawback",
    "Runs same-day from 21:00 ET the prior day until 18:00 ET, funds transfer windows 09:00-18:00 ET (21:00-17:00 ET extensions)",
  ],
  features: [
    "Real-time gross settlement in central-bank money",
    "Finality of payment on credit to the receiver's master account",
    "ISO 20022 migration in progress across the Fedwire Funds Service",
  ],
  limits: {
    perTransaction: "No practical limit",
    perDay: "No published cap",
    perMonth: "No published cap",
    receiving: "No cap",
    note: "The service has no fixed transaction limit; bank-set controls apply",
  },
  processingWindows: ["09:00-18:00 ET", "21:00-17:00 ET (extension)"],
  settlement: "Federal Reserve Banks RTGS (central-bank money, final)",
  reversible: false,
  protections: ["Final and irrevocable on credit", "Fedwire Funds Service participants screened by the FRB"],
  roadmap: ["ISO 20022 migration for Fedwire Funds Service (announced timeline)"],
  sources: [
    {
      name: "Federal Reserve Financial Services",
      label: "Fedwire Funds Service — official",
      url: "https://www.frbservices.org/financial-services/wires",
    },
  ],
};

/** One Interac parent with the three plan-mandated variants under one family. */
export const interacETransferFixture: EnrichedSchemeFixture = {
  name: "Interac e-Transfer",
  speed: "Instant (<30s)",
  limit: "$3,000/txn, $10,000/day, $30,000/month",
  cost: "Free",
  useCase: "P2P, retail, small business",
  operator: "Interac Corp.",
  family: "Interac e-Transfer",
  howItWorks: [
    "The sender picks the recipient by email or phone (alias)",
    "Money moves over existing bank rails — the alias only carries the notification/deposit instructions",
    "Funds land in seconds after routine interbank fraud checks",
  ],
  features: [
    "Alias-based delivery (email or mobile number)",
    "Funds move over existing bank rails; the alias carries instructions",
  ],
  limits: {
    perTransaction: "$3,000 (typical consumer; bank-set)",
    perDay: "$10,000",
    perMonth: "$30,000",
    receiving: "Up to $25,000",
    note: "Network ceiling $3,000/txn; banks set their own caps",
  },
  settlement: "Existing bank rails today; Real-Time Rail (RTR) targeted for real-time clearing",
  reversible: false,
  protections: [
    "Autodeposit shows the sender the recipient's registered legal name",
    "Cancellable while pending; irreversible once claimed or autodeposited",
  ],
  roadmap: ["Real-Time Rail (RTR) ISO 20022 settlement targeted Q3 2026"],
  sources: [
    {
      name: "Interac Corp.",
      label: "Interac e-Transfer — official product page",
      url: "https://www.interac.ca/en/payments/personal/send-receive-money-with-interac-e-transfer/",
    },
  ],
  variants: [
    {
      name: "Auto-Deposit",
      description:
        "Recipient registers their alias for automatic deposit; the sender sees the recipient's registered legal name before sending — a Confirmation-of-Payee-like check.",
    },
    {
      name: "Request Money",
      description:
        "A pull flow: the sender asks a recipient for money, and the recipient approves and pays from their own online banking.",
    },
    {
      name: "Standard security-question claim",
      description:
        "The recipient claims the transfer by answering a security question; the answer must not be guessable or travel on the same channel as the transfer.",
    },
  ],
};

/** One International / SWIFT catalogue response for /api/schemes/international. */
export const swiftGpiInternationalFixture = {
  scope: "International / SWIFT",
  name: "SWIFT gpi",
  speed: "Same-day to 1-3 business days (corridor- and cut-off-dependent)",
  limit: "Bank/correspondent-set",
  cost: "Bank/correspondent-set",
  useCase: "Cross-border correspondent payments (MT103 / pacs.008)",
  operator: "SWIFT",
  howItWorks: [
    "The originator bank routes the payment through its correspondent network, hop by hop, to the beneficiary's bank",
    "Each hop is tracked in near real time via the SWIFT gpi tracker, and the UETR (field 121 / pacs.008) identifies the payment end to end",
    "Finality depends on the corridor — the beneficiary bank's credit is the point of no return, and intervening stops (compliance holds, cut-offs) can add days",
  ],
  features: [
    "UETR end-to-end tracking across the chain",
    "Fee and status transparency (well-known scheme amount, tracking events)",
    "MT103 / pacs.008 messages carry the payment",
  ],
  limits: {
    perTransaction: "Correspondent-set",
    perDay: "Correspondent-set",
    perMonth: "Correspondent-set",
    receiving: "Correspondent-set",
    note: "Limits and fees are set by each bank/correspondent in the chain",
  },
  settlement: "Correspondent banking — nostro/vostro balances settled between banks, not a central FX rail",
  reversible: false,
  protections: [
    "gpi tracking events give all parties a shared view of progress",
    "Errors are returned/recalled through the correspondent chain, not reversed unilaterally",
  ],
  roadmap: [
    "CBPR+: ISO 20022 translation for cross-border payments in progress",
    "The eventual direction of travel is MT103 usage declining under ISO 20022 migration — roadmap, not current behaviour",
  ],
  sources: [
    {
      name: "SWIFT",
      label: "SWIFT gpi — official",
      url: "https://www.swift.com/products/swift-gpi",
    },
  ],
  verifiedAsof: "2026-08",
  disclaimer:
    "SIMULATION — educational data. Always check the operator's current rules for production routing.",
};