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
  duration: number; // minutes
  prerequisites: string[];
  outcomes: string[];
  category: "core" | "tool" | "capstone";
}

export const CURRICULUM: CurriculumModule[] = [
  {
    id: "lab-1",
    title: "Identifiers: BICs & IBANs",
    subtitle: "The two codes that identify banks and accounts worldwide",
    href: "/learn/lab-1",
    duration: 10,
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
    duration: 15,
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
    duration: 12,
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
    duration: 15,
    prerequisites: ["lab-1"],
    outcomes: [
      "Trace a payment from sender to beneficiary through correspondents",
      "Explain Nostro and Vostro accounting relationships",
      "Understand confidence levels in routing suggestions",
    ],
    category: "core",
  },
  {
    id: "lab-5",
    title: "Where to Send: Standard Settlement Instructions",
    subtitle: "How banks publish which correspondent to use per currency",
    href: "/learn/lab-5",
    duration: 12,
    prerequisites: ["lab-1", "lab-4"],
    outcomes: [
      "Read an SSI record and identify the Nostro account",
      "Explain charge codes (OUR, SHA, BEN) in settlement",
      "Understand value dates and settlement timing",
    ],
    category: "core",
  },
  {
    id: "lab-6",
    title: "Did It Arrive? Tracking with UETR",
    subtitle: "SWIFT gpi tracking and the UETR",
    href: "/learn/lab-6",
    duration: 10,
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
    duration: 12,
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
    duration: 15,
    prerequisites: ["lab-7"],
    outcomes: [
      "Map MT103 fields to their pacs.008 elements",
      "Explain why and when SWIFT retired MT103 for cross-border",
      "Spot a structured-address failure that holds a payment",
    ],
    category: "core",
  },
  {
    id: "capstone",
    title: "Capstone: Full Payment Simulation",
    subtitle: "Apply everything: validate, verify, route, and track a payment",
    href: "/learn/capstone",
    duration: 20,
    prerequisites: ["lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6", "lab-7"],
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
