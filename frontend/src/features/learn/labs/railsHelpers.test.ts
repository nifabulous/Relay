import { describe, it, expect } from "vitest";
import { eftSettlement, limitCheck, appReimbursement, bacsCycle, chooseEurRail, chooseCadRail } from "./railsHelpers";

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

describe("bacsCycle", () => {
  it("Monday morning submission settles Wednesday", () => {
    // 2026-07-20 is a Monday
    const c = bacsCycle("2026-07-20T09:00:00");
    expect(c.caughtCutoff).toBe(true);
    expect(c.submissionDay).toBe("2026-07-20");
    expect(c.processingDay).toBe("2026-07-21");
    expect(c.settlementDay).toBe("2026-07-22");
  });

  it("submission after the 22:30 cut-off rolls to the next cycle", () => {
    const c = bacsCycle("2026-07-20T23:00:00");
    expect(c.caughtCutoff).toBe(false);
    expect(c.submissionDay).toBe("2026-07-21");
    expect(c.settlementDay).toBe("2026-07-23");
  });

  it("Friday submission settles Tuesday (weekend skipped)", () => {
    // 2026-07-24 is a Friday
    const c = bacsCycle("2026-07-24T15:00:00");
    expect(c.caughtCutoff).toBe(true);
    expect(c.submissionDay).toBe("2026-07-24");
    expect(c.processingDay).toBe("2026-07-27");
    expect(c.settlementDay).toBe("2026-07-28");
  });

  it("Saturday submission enters Monday's cycle", () => {
    // 2026-07-25 is a Saturday
    const c = bacsCycle("2026-07-25T10:00:00");
    expect(c.caughtCutoff).toBe(false);
    expect(c.submissionDay).toBe("2026-07-27");
    expect(c.settlementDay).toBe("2026-07-29");
  });

  it("handles invalid input", () => {
    const c = bacsCycle("not-a-date");
    expect(c.submissionDay).toBe("—");
    expect(c.caughtCutoff).toBe(false);
  });
});

describe("chooseEurRail", () => {
  it("recommends SCT Inst within the bank limit", () => {
    const c = chooseEurRail(1_500_000, 10_000_000, false); // €15k vs €100k limit
    expect(c.rail).toBe("SCT Inst");
  });

  it("recommends TARGET2 above the limit when urgent", () => {
    const c = chooseEurRail(25_000_000, 10_000_000, true); // €250k urgent
    expect(c.rail).toBe("TARGET2");
  });

  it("recommends SCT above the limit when not urgent", () => {
    const c = chooseEurRail(25_000_000, 10_000_000, false);
    expect(c.rail).toBe("SCT");
  });

  it("rejects non-positive amounts", () => {
    expect(chooseEurRail(0, 10_000_000, true).rail).toBe("SCT");
    expect(chooseEurRail(NaN, 10_000_000, true).rail).toBe("SCT");
  });
});

describe("chooseCadRail", () => {
  const CAP = 1_000_000; // C$10,000

  it("recommends Interac for small urgent transfers", () => {
    expect(chooseCadRail(500_000, true, CAP).rail).toBe("Interac e-Transfer");
  });

  it("recommends Lynx for large urgent transfers", () => {
    expect(chooseCadRail(85_000_000, true, CAP).rail).toBe("Lynx");
  });

  it("recommends EFT when not urgent, regardless of size", () => {
    expect(chooseCadRail(85_000_000, false, CAP).rail).toBe("EFT");
    expect(chooseCadRail(500_000, false, CAP).rail).toBe("EFT");
  });

  it("rejects non-positive amounts", () => {
    expect(chooseCadRail(0, true, CAP).rail).toBe("EFT");
  });
});
