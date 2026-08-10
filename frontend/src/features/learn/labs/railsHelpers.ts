/**
 * Illustrative rail helpers for Lab 9. Pure and total — safe for teaching, not
 * production settlement. Amounts are in minor units (cents/pence).
 */

const EFT_WINDOWS = [
  { minutes: 300, label: "05:00 ET" },
  { minutes: 855, label: "14:15 ET" },
  { minutes: 1140, label: "19:00 ET" },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rollToBusinessDay(d: Date): Date {
  const out = new Date(d);
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6) out.setUTCDate(out.getUTCDate() + 1);
  return out;
}

export interface EftSettlement { window: string; sameDay: boolean; valueDate: string; }

export function eftSettlement(submitEtIso: string): EftSettlement {
  const dt = new Date(`${submitEtIso}Z`);
  if (isNaN(dt.getTime())) return { window: "—", sameDay: false, valueDate: "—" };
  const minutes = dt.getUTCHours() * 60 + dt.getUTCMinutes();
  const caught = EFT_WINDOWS.find((w) => minutes <= w.minutes);
  const base = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  if (caught && rollToBusinessDay(base).getTime() === base.getTime()) {
    return { window: caught.label, sameDay: true, valueDate: isoDate(base) };
  }
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + 1);
  return { window: "05:00 ET (next business day)", sameDay: false, valueDate: isoDate(rollToBusinessDay(next)) };
}

export interface LimitVerdict { clears: boolean; breached: "perTransaction" | "perDay" | "perMonth" | null; }

export function limitCheck(
  amountMinor: number,
  limits: { perTransactionMinor: number; perDayMinor: number; perMonthMinor: number },
): LimitVerdict {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return { clears: false, breached: null };
  if (amountMinor > limits.perTransactionMinor) return { clears: false, breached: "perTransaction" };
  if (amountMinor > limits.perDayMinor) return { clears: false, breached: "perDay" };
  if (amountMinor > limits.perMonthMinor) return { clears: false, breached: "perMonth" };
  return { clears: true, breached: null };
}

export interface AppReimbursement { reimbursedMinor: number; senderPspMinor: number; receiverPspMinor: number; cappedAtMinor: number; }

const APP_CAP_MINOR = 8_500_000; // £85,000

export function appReimbursement(amountMinor: number): AppReimbursement {
  const amount = Number.isFinite(amountMinor) && amountMinor > 0 ? amountMinor : 0;
  const reimbursedMinor = Math.min(amount, APP_CAP_MINOR);
  const senderPspMinor = Math.floor(reimbursedMinor / 2);
  return {
    reimbursedMinor,
    senderPspMinor,
    receiverPspMinor: reimbursedMinor - senderPspMinor,
    cappedAtMinor: APP_CAP_MINOR,
  };
}

// ── UK & Eurozone deep-dive helpers ─────────────────────────────

/**
 * Bacs three-day cycle. Day 1: file submitted (cut-off 22:30 London),
 * Day 2: processing at the banks, Day 3: simultaneous debit/credit.
 * Weekend/late submissions roll to the next business day.
 */
export interface BacsCycle {
  submissionDay: string;
  processingDay: string;
  settlementDay: string;
  caughtCutoff: boolean;
}

const BACS_CUTOFF_MINUTES = 22 * 60 + 30; // 22:30

function nextBusinessDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + 1);
  return rollToBusinessDayLocal(out);
}

function rollToBusinessDayLocal(d: Date): Date {
  const out = new Date(d);
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6) out.setUTCDate(out.getUTCDate() + 1);
  return out;
}

export function bacsCycle(submitIso: string): BacsCycle {
  const dt = new Date(`${submitIso}Z`);
  if (isNaN(dt.getTime())) {
    return { submissionDay: "—", processingDay: "—", settlementDay: "—", caughtCutoff: false };
  }
  const minutes = dt.getUTCHours() * 60 + dt.getUTCMinutes();
  let base = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const isBusinessDay = base.getUTCDay() !== 0 && base.getUTCDay() !== 6;
  const caughtCutoff = isBusinessDay && minutes <= BACS_CUTOFF_MINUTES;
  if (!caughtCutoff) {
    // Missed the input window — file enters the next business day's cycle.
    base = nextBusinessDay(base);
  }
  const day2 = nextBusinessDay(base);
  const day3 = nextBusinessDay(day2);
  return {
    submissionDay: base.toISOString().slice(0, 10),
    processingDay: day2.toISOString().slice(0, 10),
    settlementDay: day3.toISOString().slice(0, 10),
    caughtCutoff,
  };
}

/**
 * EUR rail picker. Bank-set SCT Inst limit (the scheme cap was removed under
 * the Instant Payments Regulation), with TARGET2 as the high-value fallback
 * when the payment can't wait for a batch cycle.
 */
export interface EurRailChoice {
  rail: "SCT Inst" | "SCT" | "TARGET2";
  reason: string;
}

export function chooseEurRail(
  amountMinor: number,
  bankInstLimitMinor: number,
  urgent: boolean,
): EurRailChoice {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { rail: "SCT", reason: "Enter a positive amount to compare rails." };
  }
  if (amountMinor <= bankInstLimitMinor) {
    return {
      rail: "SCT Inst",
      reason:
        "Within your bank's instant limit — settles in under 10 seconds, 24/7, at the same price as a standard SCT.",
    };
  }
  if (urgent) {
    return {
      rail: "TARGET2",
      reason:
        "Above the bank's instant limit and it can't wait for a batch cycle — the Eurosystem RTGS settles it the same business day, finally and irrevocably.",
    };
  }
  return {
    rail: "SCT",
    reason:
      "Above the instant limit but not urgent — the standard SEPA Credit Transfer lands next business day at domestic price.",
  };
}

/**
 * CAD rail picker. Interac for small urgent transfers (bank-set cap),
 * Lynx when finality today is non-negotiable, EFT for everything scheduled.
 */
export interface CadRailChoice {
  rail: "Interac e-Transfer" | "Lynx" | "EFT";
  reason: string;
}

export function chooseCadRail(
  amountMinor: number,
  urgent: boolean,
  interacCapMinor: number,
): CadRailChoice {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { rail: "EFT", reason: "Enter a positive amount to compare rails." };
  }
  if (urgent && amountMinor <= interacCapMinor) {
    return {
      rail: "Interac e-Transfer",
      reason:
        "Small and urgent — Interac lands in seconds, 24/7, and stays inside the bank's e-Transfer cap.",
    };
  }
  if (urgent) {
    return {
      rail: "Lynx",
      reason:
        "Too large for Interac and it must be final today — Lynx settles in real time, irrevocably, in central-bank money.",
    };
  }
  return {
    rail: "EFT",
    reason:
      "Not urgent — the ACSS batch rail carries it for cents. Submit before a processing window and it lands in 1-2 business days.",
  };
}
