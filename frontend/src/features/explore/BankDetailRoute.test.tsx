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