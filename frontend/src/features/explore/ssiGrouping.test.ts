import { describe, expect, it } from "vitest";
import { groupByCurrency } from "./ssiGrouping";
import type { SSIRecord } from "../../api/schemas";

function record(currency: string, intermediaryBic: string): SSIRecord {
  return {
    beneficiary_bic: "SBININBBXXX",
    beneficiary_bank_name: "State Bank of India",
    currency,
    intermediary_bic: intermediaryBic,
    intermediary_bank_name: `${intermediaryBic} Bank`,
    intermediary_account: "ACCT-0001",
    beneficiary_account: "ACCT-0002",
    charge_code: "SHA",
    value_date: "spot",
    notes: undefined,
    as_of: undefined,
    status: "published",
  };
}

describe("groupByCurrency", () => {
  it("nests every intermediary for a currency under one group", () => {
    const groups = groupByCurrency([
      record("USD", "BOFAUS3N"),
      record("USD", "CHASUS33"),
      record("USD", "CITIUS33"),
      record("EUR", "DEUTDEFF"),
    ]);

    expect(groups.map((g) => g.currency)).toEqual(["USD", "EUR"]);
    const usd = groups.find((g) => g.currency === "USD")!;
    expect(usd.records.map((r) => r.intermediary_bic)).toEqual([
      "BOFAUS3N",
      "CHASUS33",
      "CITIUS33",
    ]);
  });

  it("orders currencies by settlement importance, then alphabetically", () => {
    const groups = groupByCurrency([
      record("USD", "CITIUS33"),
      record("AED", "EBILAEAD"),
      record("GBP", "BARCGB22"),
      record("EUR", "DEUTDEFF"),
    ]);

    // USD, EUR, GBP are majors and lead; AED sorts after them alphabetically.
    expect(groups.map((g) => g.currency)).toEqual(["USD", "EUR", "GBP", "AED"]);
  });

  it("keeps non-major currencies alphabetical when no majors are present", () => {
    const groups = groupByCurrency([
      record("AED", "EBILAEAD"),
      record("BHD", "NBOBBHBM"),
      record("CUC", "CITIUS33"),
    ]);

    expect(groups.map((g) => g.currency)).toEqual(["AED", "BHD", "CUC"]);
  });

  it("preserves source order of intermediaries within a currency", () => {
    const groups = groupByCurrency([
      record("USD", "ZZZZUS33"),
      record("USD", "AAAAUS33"),
    ]);

    expect(groups[0].records.map((r) => r.intermediary_bic)).toEqual([
      "ZZZZUS33",
      "AAAAUS33",
    ]);
  });

  it("returns an empty array for no records", () => {
    expect(groupByCurrency([])).toEqual([]);
  });

  it("ignores records with a blank currency rather than making a blank group", () => {
    const groups = groupByCurrency([record("", "CITIUS33"), record("USD", "BOFAUS3N")]);

    expect(groups.map((g) => g.currency)).toEqual(["USD"]);
  });
});
