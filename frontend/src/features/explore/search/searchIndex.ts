/**
 * Static search index for Relay Explore.
 *
 * This data is bundled so client-side search is instant. Bank lookups
 * go through /api/lookup (server-side by BIC). Everything else — glossary
 * terms, lesson modules, schemes, and tools — is searchable here.
 */

import type { SearchResult } from "./searchTypes";

// ─── Glossary terms ──────────────────────────────────────

const GLOSSARY_TERMS: Array<[string, string]> = [
  ["BIC", "Bank Identifier Code — a unique 8-11 character code identifying a bank globally"],
  ["SWIFT code", "Same as a BIC. Standardized bank identifier for routing SWIFT payments"],
  ["IBAN", "International Bank Account Number — up to 34 chars, starts with country code + checksum"],
  ["MOD-97", "The checksum algorithm used to validate IBANs"],
  ["Nostro", "'Our' account held at another bank, usually in that bank's local currency"],
  ["Vostro", "'Your' account — another bank's account held at our bank"],
  ["Correspondent bank", "Intermediary bank providing services across borders, holds a Nostro account"],
  ["Intermediary bank", "A bank in the payment chain between sender and beneficiary"],
  ["SSI", "Standard Settlement Instructions — which correspondent to use per currency"],
  ["UETR", "Unique End-to-End Transaction Reference — 36-char UUID for SWIFT gpi tracking"],
  ["gpi", "Global Payments Innovation — SWIFT's faster, transparent cross-border initiative"],
  ["MT103", "SWIFT message type for customer credit transfers — the most common cross-border message"],
  ["pacs.008", "ISO 20022 equivalent of MT103 — customer credit transfer with richer data"],
  ["VoP", "Verification of Payee — checks payee name matches account holder before sending"],
  ["CoP", "Confirmation of Payee — the UK's version of VoP for Faster Payments and CHAPS"],
  ["Fedwire", "US Federal Reserve RTGS for USD wire transfers"],
  ["FedACH", "US Fed batch ACH for electronic payments"],
  ["CHIPS", "Clearing House Interbank Payments System — private USD clearing in New York"],
  ["RTGS", "Real-Time Gross Settlement — individual immediate settlement, not batched"],
  ["CHAPS", "UK RTGS for same-day GBP high-value payments"],
  ["TARGET2", "Eurosystem RTGS platform for EUR payments"],
  ["SEPA", "Single Euro Payments Area — standardized euro payments across 36 countries"],
  ["ABA", "American Bankers Association routing number — 9-digit US bank identifier"],
  ["Routing number", "Same as ABA — 9-digit code for US payment routing"],
  ["Value date", "The date funds become available for use — settlement date, not send date"],
  ["Charge code", "OUR, SHA, or BEN — who pays the fees in a cross-border payment"],
  ["STP", "Straight-Through Processing — a payment processed automatically without repair"],
  ["Sanctions screening", "Checking payment parties against watchlists before sending"],
  ["Cut-off time", "The deadline for submitting a payment to settle that business day"],
  ["Corridor", "A payment route between two currencies or countries, e.g. USD→NGN"],
];

// ─── Lesson modules ──────────────────────────────────────

const LESSON_MODULES: Array<[string, string, string]> = [
  ["lab-1", "Who's Who: BICs & IBANs", "/app/learn/lab-1"],
  ["lab-2", "Is It Real? IBAN Checksums", "/app/learn/lab-2"],
  ["lab-3", "Right Person? Verification of Payee", "/app/learn/lab-3"],
  ["lab-4", "How Money Moves: Correspondent Routing", "/app/learn/lab-4"],
  ["lab-5", "Where to Send: Standard Settlement Instructions", "/app/learn/lab-5"],
  ["lab-6", "Did It Arrive? Tracking with UETR", "/app/learn/lab-6"],
  ["lab-7", "Which Rail? Payment Schemes", "/app/learn/lab-7"],
  ["capstone", "Capstone: Full Payment Simulation", "/app/learn/capstone"],
];

// ─── Payment schemes ─────────────────────────────────────

const PAYMENT_SCHEMES: Array<[string, string]> = [
  ["Faster Payments", "UK instant GBP retail payments (sub-seconds)"],
  ["CHAPS", "UK same-day high-value GBP RTGS"],
  ["BACS", "UK batch Direct Credit and Direct Debit"],
  ["SEPA Instant", "Eurozone instant credit transfer (10 seconds)"],
  ["SEPA SCT", "Standard SEPA Credit Transfer (1 business day)"],
  ["SEPA SDD", "SEPA Direct Debit"],
  ["TARGET2", "Eurozone RTGS for high-value EUR"],
  ["Fedwire", "US RTGS for high-value USD wire transfers"],
  ["FedACH", "US batch ACH for electronic payments"],
  ["CHIPS", "Private USD clearing system in New York"],
  ["SWIFT gpi", "Cross-border payment tracking and transparency"],
  ["RTP", "US Real-Time Payments (The Clearing House)"],
];

// ─── Tools (Operate workspace) ───────────────────────────

const TOOLS: Array<[string, string, string]> = [
  ["prepare", "Prepare Payment", "/app/operate/prepare"],
  ["fees", "Fee Calculator", "/app/operate/fees"],
  ["screening", "Sanctions Screening", "/app/operate/screening"],
  ["value-date", "Value Date Calculator", "/app/operate/value-date"],
  ["stp", "MT103 STP Checker", "/app/operate/stp"],
  ["tracking", "Payment Tracking", "/app/operate/tracking"],
];

// ─── Build the flat index ────────────────────────────────

export const searchIndex: SearchResult[] = [
  ...GLOSSARY_TERMS.map(([term, def]): SearchResult => ({
    id: `glossary:${term}`,
    type: "glossary" as const,
    label: term,
    subtitle: def,
    href: `/app/explore/glossary?term=${encodeURIComponent(term)}`,
  })),
  ...LESSON_MODULES.map(([id, title, href]): SearchResult => ({
    id: `lesson:${id}`,
    type: "lesson" as const,
    label: title,
    subtitle: "Learning module",
    href,
  })),
  ...PAYMENT_SCHEMES.map(([name, desc]): SearchResult => ({
    id: `scheme:${name}`,
    type: "scheme" as const,
    label: name,
    subtitle: desc,
    href: `/app/explore/schemes?name=${encodeURIComponent(name)}`,
  })),
  ...TOOLS.map(([id, label, href]): SearchResult => ({
    id: `tool:${id}`,
    type: "tool" as const,
    label,
    subtitle: "Operate tool",
    href,
  })),
];

/**
 * Client-side filter across the bundled index.
 * Matches label (higher weight) and subtitle (lower weight).
 * Results are flat — grouping happens in the CommandSearch component.
 */
export function searchStatic(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const terms = q.split(/\s+/);
  const scored: Array<{ result: SearchResult; score: number }> = [];

  for (const result of searchIndex) {
    const label = result.label.toLowerCase();
    const subtitle = result.subtitle.toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (label.includes(term)) score += 2;
      if (label.startsWith(term)) score += 3;
      if (subtitle.includes(term)) score += 1;
    }

    if (score > 0) {
      scored.push({ result, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.result);
}
