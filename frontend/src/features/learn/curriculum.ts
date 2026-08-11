/**
 * Relay Learn curriculum definition.
 *
 * Typed module list with prerequisite chains, learning outcomes, and
 * estimated durations. Source material comes from the legacy
 * app/static/js/learn-labs*.js modules.
 */

export interface CurriculumModule {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  duration: DurationRange;
  prerequisites: string[];
  outcomes: string[];
  category: "core" | "tool" | "capstone";
}

export interface DurationRange {
  min: number;
  max: number;
}

export function formatDuration(range: DurationRange): string {
  return range.min === range.max
    ? `${range.min} min`
    : `${range.min}–${range.max} min`;
}

export function formatDurationAriaLabel(range: DurationRange): string {
  return range.min === range.max
    ? `Estimated time: ${range.min} minutes`
    : `Estimated time: ${range.min} to ${range.max} minutes`;
}

export const CURRICULUM: CurriculumModule[] = [
  {
    id: "lab-1",
    title: "Identifiers: BICs & IBANs",
    subtitle: "The two codes that identify banks and accounts worldwide",
    href: "/learn/lab-1",
    duration: { min: 10, max: 15 },
    prerequisites: [],
    outcomes: [
      "Decode a BIC into bank, country, and location",
      "Decompose an IBAN into country, checksum, bank, and account",
      "Distinguish BIC from IBAN and when each is used",
    ],
    category: "core",
  },
  {
    id: "lab-2",
    title: "Is It Real? IBAN Checksums",
    subtitle: "Validate IBANs using the MOD-97 algorithm",
    href: "/learn/lab-2",
    duration: { min: 15, max: 20 },
    prerequisites: ["lab-1"],
    outcomes: [
      "Explain how the MOD-97 checksum protects against typos",
      "Validate an IBAN manually step-by-step",
      "Identify common IBAN formatting errors",
    ],
    category: "core",
  },
  {
    id: "lab-3",
    title: "Right Person? Verification of Payee",
    subtitle: "Check that the payee name matches the account holder",
    href: "/learn/lab-3",
    duration: { min: 15, max: 20 },
    prerequisites: ["lab-1", "lab-2"],
    outcomes: [
      "Understand MATCH, CLOSE_MATCH, NO_MATCH, and NOT_CHECKED outcomes",
      "Explain why VoP reduces misdirected payments",
      "Apply strictness levels to close matches",
    ],
    category: "core",
  },
  {
    id: "lab-4",
    title: "How Money Moves: Correspondent Routing",
    subtitle: "Why a payment hops through intermediary banks",
    href: "/learn/lab-4",
    duration: { min: 15, max: 20 },
    prerequisites: ["lab-1"],
    outcomes: [
      "Trace a payment from sender to beneficiary through correspondents",
      "Explain Nostro and Vostro accounting relationships",
      "Distinguish a bank's published correspondents from heuristic candidates",
      "Place CHIPS and Fedwire under the USD leg and read CHIPS/ABA identifiers",
      "Contrast serial and cover payment message patterns",
    ],
    category: "core",
  },
  {
    id: "lab-5",
    title: "Where to Send: Standard Settlement Instructions",
    subtitle: "How banks publish which correspondent to use per currency",
    href: "/learn/lab-5",
    duration: { min: 15, max: 20 },
    prerequisites: ["lab-1", "lab-4"],
    outcomes: [
      "Read an SSI record field-by-field and identify the Nostro account",
      "Choose the right charge code (OUR, SHA, BEN) for a given payment",
      "Predict what happens when a payment ignores the published SSI",
      "Understand value dates and settlement timing",
    ],
    category: "core",
  },
  {
    id: "lab-6",
    title: "Did It Arrive? Tracking with UETR",
    subtitle: "SWIFT gpi tracking and the UETR",
    href: "/learn/lab-6",
    duration: { min: 10, max: 15 },
    prerequisites: ["lab-1", "lab-4"],
    outcomes: [
      "Explain the UETR and its role in SWIFT gpi",
      "Read a payment tracking timeline",
      "Understand terminal vs in-progress statuses",
    ],
    category: "core",
  },
  {
    id: "lab-7",
    title: "Which Rail? Payment Schemes",
    subtitle: "Compare Faster Payments, SEPA, Fedwire, CHAPS, and more",
    href: "/learn/lab-7",
    duration: { min: 15, max: 20 },
    prerequisites: ["lab-1"],
    outcomes: [
      "Compare payment schemes by speed, cost, and currency",
      "Choose the right rail for a given payment",
      "Understand RTGS vs batch settlement",
    ],
    category: "core",
  },
  {
    id: "lab-8",
    title: "Message Standards: MT103 → ISO 20022",
    subtitle: "How the correspondent-banking message changed in 2025",
    href: "/learn/lab-8",
    duration: { min: 15, max: 20 },
    prerequisites: ["lab-7"],
    outcomes: [
      "Map MT103 fields to their pacs.008 elements",
      "Explain why and when SWIFT retired MT103 for cross-border",
      "Spot a structured-address failure that holds a payment",
    ],
    category: "core",
  },
  {
    id: "lab-9",
    title: "Rails Deep-Dive: Canada & UK",
    subtitle: "Interac, EFT, CHAPS, Faster Payments — in depth",
    href: "/learn/lab-9",
    duration: { min: 25, max: 35 },
    prerequisites: ["lab-7", "lab-8"],
    outcomes: [
      "Explain Interac Autodeposit, Request Money, limits, and the RTR roadmap",
      "Read EFT processing windows and CHAPS's ISO 20022 structured-address mandate",
      "Compare UK Confirmation of Payee and APP-scam reimbursement",
    ],
    category: "core",
  },
  {
    id: "gbp-eur-rails",
    title: "Rails Deep-Dive: UK & Eurozone",
    subtitle: "CHAPS, Bacs, Faster Payments, TARGET2, SEPA — in depth",
    href: "/learn/gbp-eur-rails",
    duration: { min: 25, max: 35 },
    prerequisites: ["lab-7", "lab-9"],
    outcomes: [
      "Choose between CHAPS, Bacs, and Faster Payments by speed, cost, and ceiling",
      "Walk a Bacs file through its three-day cycle, cut-offs and weekends included",
      "Explain how the Instant Payments Regulation reshaped SCT Inst limits and pricing",
      "Route a euro payment across SCT, SCT Inst, and TARGET2",
    ],
    category: "core",
  },
  {
    id: "cad-rails",
    title: "Rails Deep-Dive: Canada",
    subtitle: "Lynx, EFT/ACSS, Interac, and the Real-Time Rail",
    href: "/learn/cad-rails",
    duration: { min: 20, max: 25 },
    prerequisites: ["lab-7", "lab-9"],
    outcomes: [
      "Place Lynx, EFT, and Interac in Canada's three-layer rail stack",
      "Explain ACSS netting and why EFT value-dates in business days",
      "Pick the right CAD rail for a payment's size and urgency",
      "Describe what the Real-Time Rail changes for Interac settlement",
    ],
    category: "core",
  },
  {
    id: "fees-fx",
    title: "Follow the Money: Fees & FX",
    subtitle: "Why the beneficiary receives less than you sent",
    href: "/learn/fees-fx",
    duration: { min: 15, max: 20 },
    prerequisites: ["lab-5", "lab-6"],
    outcomes: [
      "Simulate how lift fees erode a payment hop by hop in USD, CAD, GBP, and EUR",
      "Predict what a beneficiary receives under OUR, SHA, and BEN",
      "Expose the hidden cost of an FX margin versus the visible wire fee",
    ],
    category: "core",
  },
  {
    id: "sanctions",
    title: "Stopped at the Border: Sanctions Screening",
    subtitle: "Why payments get frozen, held, and rejected",
    href: "/learn/sanctions",
    duration: { min: 15, max: 20 },
    prerequisites: ["lab-3", "lab-4"],
    outcomes: [
      "Explain what sanctions watchlists are and why banks screen every payment",
      "Sort fuzzy match scores into CLEAR, POSSIBLE_HIT, and HARD_HIT bands",
      "Predict what a compliance hold means for a payment and its sender",
      "Explain why most screening hits are false positives",
    ],
    category: "core",
  },
  {
    id: "exceptions-returns",
    title: "When Payments Fail: Exceptions & Returns",
    subtitle: "Rejects, returns, recalls — and getting money back",
    href: "/learn/exceptions-returns",
    duration: { min: 15, max: 20 },
    prerequisites: ["lab-3", "lab-6", "lab-8"],
    outcomes: [
      "Distinguish a reject (pacs.002) from a return (pacs.004) and a recall (camt.056)",
      "Read a rejected payment's tracking timeline and locate the failure",
      "Map common return reason codes (AC01, AC04, AM05, FRAD) to their stories",
      "Explain why recovering a settled misdirected payment is never guaranteed",
    ],
    category: "core",
  },
  {
    id: "ops-repair",
    title: "The Ops Desk: STP Repair & Nostro Recon",
    subtitle: "Fix broken payments and prove the money moved",
    href: "/learn/ops-repair",
    duration: { min: 20, max: 25 },
    prerequisites: ["lab-4", "lab-5", "lab-8"],
    outcomes: [
      "Run an STP check, read its findings, and repair the failing field",
      "Explain why repairs target the named field instead of resubmitting from scratch",
      "Match a Nostro statement against the ledger and identify the breaks",
      "Classify amount breaks (lift fees) and unexpected charges before adjusting",
    ],
    category: "core",
  },
  {
    id: "capstone",
    title: "Capstone: Full Payment Simulation",
    subtitle: "Apply everything: validate, verify, route, and track a payment",
    href: "/learn/capstone",
    duration: { min: 30, max: 45 },
    prerequisites: ["lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6", "lab-7", "lab-8", "lab-9"],
    outcomes: [
      "Execute a complete cross-border payment simulation",
      "Interpret a combined recommendation across all checks",
      "Track the payment end-to-end via UETR",
    ],
    category: "capstone",
  },
];

export function getModuleById(id: string): CurriculumModule | undefined {
  return CURRICULUM.find((m) => m.id === id);
}

/**
 * Get all prerequisites for a module, recursively (transitive closure).
 */
export function getPrerequisiteChain(moduleId: string): string[] {
  const mod = getModuleById(moduleId);
  if (!mod) return [];

  const chain = new Set<string>();
  function visit(id: string) {
    const m = getModuleById(id);
    if (!m) return;
    for (const prereq of m.prerequisites) {
      chain.add(prereq);
      visit(prereq);
    }
  }
  visit(moduleId);
  return Array.from(chain);
}

/**
 * Check if a module is unlocked given the completed module IDs.
 */
export function isModuleUnlocked(moduleId: string, completedIds: string[]): boolean {
  const mod = getModuleById(moduleId);
  if (!mod) return false;
  return mod.prerequisites.every((prereq) => completedIds.includes(prereq));
}

/**
 * Get the next incomplete module (first in order that isn't done and is unlocked).
 */
export function getNextModule(completedIds: string[]): CurriculumModule | null {
  for (const mod of CURRICULUM) {
    if (!completedIds.includes(mod.id)) {
      return mod;
    }
  }
  return null;
}

// ─── Progress ────────────────────────────────────────────

export interface ProgressStats {
  completedCount: number;
  totalCount: number;
  percentage: number;
  nextModuleId: string | null;
}

/**
 * Derive progress from the local list of completed module ids. Local storage
 * is the single source of truth; this is a pure function over CURRICULUM.
 */
export function computeProgress(completedIds: string[]): ProgressStats {
  const totalCount = CURRICULUM.length;
  const completedCount = CURRICULUM.filter((m) => completedIds.includes(m.id)).length;
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const nextModuleId = getNextModule(completedIds)?.id ?? null;
  return { completedCount, totalCount, percentage, nextModuleId };
}
