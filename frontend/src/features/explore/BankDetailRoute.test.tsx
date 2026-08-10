import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { renderRelay, queryClient } from "../../test/render";
import { BankDetailRoute } from "./BankDetailRoute";

function renderBank(bic: string) {
  queryClient.clear();
  return renderRelay(
    <MemoryRouter initialEntries={[`/explore/banks/${bic}`]}>
      <Routes>
        <Route path="explore/banks/:bic" element={<BankDetailRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BankDetailRoute identity", () => {
  it("renders the bank's name and identity fields", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({
          bic: "SBININBBXXX",
          found: true,
          bank: {
            bic: "SBININBBXXX",
            bank_name: "State Bank of India",
            country_code: "IN",
            city: "Mumbai",
            country_currency: "INR",
          },
        }),
      ),
    );

    renderBank("SBININBBXXX");

    expect(
      await screen.findByRole("heading", { name: "State Bank of India" }),
    ).toBeVisible();
    const grid = screen.getByText("BIC").closest("dl")!;
    expect(within(grid).getByText("SBININBBXXX")).toBeVisible();
    expect(within(grid).getByText("Mumbai")).toBeVisible();
  });

  it("shows a not-found state with a way back when the BIC is unknown", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "ZZZZZZ99XXX", found: false, bank: null }),
      ),
    );

    renderBank("ZZZZZZ99XXX");

    expect(
      await screen.findByRole("heading", { name: "Bank not found" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to Bank Directory" }),
    ).toBeVisible();
  });

  it("discloses institution-level resolution when the resolved BIC differs", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({
          bic: "SBININBB123",
          found: true,
          bank: {
            bic: "SBININBBXXX",
            bank_name: "State Bank of India",
            country_code: "IN",
            city: "Mumbai",
            country_currency: "INR",
          },
        }),
      ),
    );

    renderBank("SBININBB123");

    const resolution = await screen.findByText(
      /Showing institution-level records for/i,
    );
    expect(resolution).toBeVisible();
    expect(resolution.textContent).toContain("SBININBBXXX");
  });

  it("does not disclose institution-level resolution on an exact match", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({
          bic: "SBININBBXXX",
          found: true,
          bank: {
            bic: "SBININBBXXX",
            bank_name: "State Bank of India",
            country_code: "IN",
            city: "Mumbai",
            country_currency: "INR",
          },
        }),
      ),
    );

    renderBank("SBININBBXXX");

    await screen.findByRole("heading", { name: "State Bank of India" });
    await waitFor(() => {
      expect(screen.queryByText(/institution-level records/i)).toBeNull();
    });
  });
});

const INDIA_BANK = {
  bic: "SBININBBXXX",
  bank_name: "State Bank of India",
  country_code: "IN",
  city: "Mumbai",
  country_currency: "INR",
};

function ssiRecord(currency: string, intermediaryBic: string, name: string) {
  return {
    beneficiary_bic: "SBININBBXXX",
    beneficiary_bank_name: "State Bank of India",
    currency,
    intermediary_bic: intermediaryBic,
    intermediary_bank_name: name,
    intermediary_account: `ACCT-${intermediaryBic}`,
    beneficiary_account: "ACCT-BENE-1",
    charge_code: "SHA",
    value_date: "spot",
    notes: undefined,
  };
}

describe("BankDetailRoute settlement instructions", () => {
  it("groups intermediaries under their currency and shows account details", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "SBININBBXXX", found: true, bank: INDIA_BANK }),
      ),
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [
            ssiRecord("USD", "BOFAUS3N", "Bank of America New York"),
            ssiRecord("USD", "CHASUS33", "JP Morgan Chase NY"),
            ssiRecord("EUR", "DEUTDEFF", "Deutsche Bank Frankfurt"),
          ],
          disclaimer: "SIMULATION — illustrative placeholder accounts.",
        }),
      ),
    );

    renderBank("SBININBBXXX");

    expect(
      await screen.findByRole("heading", { name: "Published settlement instructions" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "USD" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "EUR" })).toBeVisible();
    expect(screen.getByText("Bank of America New York")).toBeVisible();
    expect(screen.getByText("JP Morgan Chase NY")).toBeVisible();
    expect(screen.getByText("ACCT-BOFAUS3N")).toBeVisible();
  });

  it("renders the simulation disclaimer alongside settlement data", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "SBININBBXXX", found: true, bank: INDIA_BANK }),
      ),
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [ssiRecord("USD", "BOFAUS3N", "Bank of America New York")],
          disclaimer: "SIMULATION — illustrative placeholder accounts.",
        }),
      ),
    );

    renderBank("SBININBBXXX");

    expect(
      await screen.findByText(/SIMULATION — illustrative placeholder accounts\./),
    ).toBeVisible();
  });

  it("never renders the ALL sentinel as a currency heading", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "SBININBBXXX", found: true, bank: INDIA_BANK }),
      ),
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [ssiRecord("USD", "BOFAUS3N", "Bank of America New York")],
          disclaimer: "SIMULATION",
        }),
      ),
    );

    renderBank("SBININBBXXX");

    await screen.findByRole("heading", { name: "USD" });
    expect(screen.queryByRole("heading", { name: "ALL" })).toBeNull();
  });
});