import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SSIRecord } from "../../api/schemas";
import { SettlementInstructions } from "./SettlementInstructions";

function record(overrides: Partial<SSIRecord> = {}): SSIRecord {
  return {
    beneficiary_bic: "BOPIPHMMXXX",
    beneficiary_bank_name: "Bank of the Philippine Islands",
    currency: "USD",
    intermediary_bic: "CITIUS33XXX",
    intermediary_bank_name: "Citibank N.A.",
    intermediary_account: "ACCT-91000701",
    beneficiary_account: "ACCT-91000702",
    charge_code: "SHA",
    value_date: "spot",
    notes: undefined,
    as_of: undefined,
    status: "published",
    ...overrides,
  } as SSIRecord;
}

describe("SettlementInstructions provenance", () => {
  it("warns on an instruction read from an archived snapshot", () => {
    render(
      <SettlementInstructions
        groups={[
          {
            currency: "USD",
            records: [record({ status: "archived", as_of: "2007-12-13" })],
          },
        ]}
      />,
    );
    expect(screen.getByText(/Archived 2007-12-13/)).toBeInTheDocument();
  });

  it("leaves a live published instruction unbadged", () => {
    render(
      <SettlementInstructions groups={[{ currency: "USD", records: [record()] }]} />,
    );
    expect(screen.queryByText(/Archived/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Illustrative/)).not.toBeInTheDocument();
  });
});
