import { describe, it, expect } from "vitest";
import { eftSettlement, limitCheck, appReimbursement } from "./railsHelpers";

describe("eftSettlement", () => {
  it("catches window 1 same-day before 05:00 ET on a weekday", () => {
    const s = eftSettlement("2026-07-20T04:30:00"); // Monday
    expect(s.window).toContain("05:00");
    expect(s.sameDay).toBe(true);
    expect(s.valueDate).toBe("2026-07-20");
  });
  it("rolls to next business day after the last window", () => {
    const s = eftSettlement("2026-07-20T20:00:00"); // Monday 20:00
    expect(s.sameDay).toBe(false);
    expect(s.valueDate).toBe("2026-07-21"); // Tuesday
  });
  it("rolls a Friday evening to Monday", () => {
    const s = eftSettlement("2026-07-24T20:00:00"); // Friday 20:00
    expect(s.valueDate).toBe("2026-07-27"); // Monday
  });
});

describe("limitCheck", () => {
  const limits = { perTransactionMinor: 300_000, perDayMinor: 1_000_000, perMonthMinor: 3_000_000 };
  it("clears under all caps", () => {
    expect(limitCheck(250_000, limits)).toEqual({ clears: true, breached: null });
  });
  it("breaches per-transaction first", () => {
    expect(limitCheck(400_000, limits)).toEqual({ clears: false, breached: "perTransaction" });
  });
  it("treats zero / NaN as non-clearing without throwing", () => {
    expect(limitCheck(NaN, limits).clears).toBe(false);
  });
});

describe("appReimbursement", () => {
  it("reimburses in full under the cap, split 50/50", () => {
    const r = appReimbursement(2_000_000); // £20,000
    expect(r.reimbursedMinor).toBe(2_000_000);
    expect(r.senderPspMinor + r.receiverPspMinor).toBe(2_000_000);
  });
  it("caps at £85,000", () => {
    const r = appReimbursement(20_000_000); // £200,000
    expect(r.reimbursedMinor).toBe(8_500_000);
    expect(r.cappedAtMinor).toBe(8_500_000);
  });
});
