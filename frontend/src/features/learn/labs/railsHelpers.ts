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
