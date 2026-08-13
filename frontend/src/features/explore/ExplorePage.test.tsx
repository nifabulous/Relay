import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { GlossaryPage, BankDirectoryPage } from "./ExplorePage";
import { renderRelay, queryClient } from "../../test/render";
import { server } from "../../test/server";

function renderGlossary(path = "/app/explore/glossary") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GlossaryPage />
    </MemoryRouter>,
  );
}

describe("GlossaryPage", () => {
  it("groups terms into scan-friendly reference sections", () => {
    renderGlossary();

    expect(screen.getByRole("heading", { name: "Identifiers" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Correspondent banking" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Tracking & messaging" })).toBeVisible();
    expect(screen.getByText("BIC", { selector: "dt" })).toBeVisible();
  });

  it("shows the filtered result count and a no-results state", async () => {
    const user = userEvent.setup();
    renderGlossary();
    const filter = screen.getByRole("searchbox", { name: "Filter glossary terms" });

    await user.type(filter, "MOD-97");
    expect(screen.getByText("1 term", { selector: "span.glossary-toolbar__count" })).toBeVisible();
    expect(screen.getByText("MOD-97", { selector: "dt" })).toBeVisible();

    await user.clear(filter);
    await user.type(filter, "does-not-exist");
    expect(screen.getByText(/No terms match/i)).toBeVisible();
  });

  it("highlights a term addressed by the search deep link", () => {
    renderGlossary("/app/explore/glossary?term=IBAN");
    expect(screen.getByText("IBAN", { selector: "dt" }).closest(".glossary-entry"))
      .toHaveClass("glossary-entry--highlighted");
  });
});

describe("BankDirectoryPage", () => {
  it("shows guidance with example BICs before any search", async () => {
    queryClient.clear();
    renderRelay(
      <MemoryRouter initialEntries={["/explore/banks"]}>
        <BankDirectoryPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/Find a bank to see its settlement instructions/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /GTBINGLAXXX/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /MASHAEADXXX/i })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Prepare a payment/i })).toBeNull();
  });

  it("runs the lookup when an example BIC is clicked", async () => {
    queryClient.clear();
    const user = userEvent.setup();
    renderRelay(
      <MemoryRouter initialEntries={["/explore/banks"]}>
        <BankDirectoryPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /MASHAEADXXX/i }));

    const link = await screen.findByRole("link", { name: /Prepare a payment/i });
    expect(link).toHaveAttribute("href", "/operate/prepare?bic=MASHAEADXXX");
  });

  it("links a found bank to payment preparation, pre-filled with its BIC", async () => {
    queryClient.clear();
    const user = userEvent.setup();

    renderRelay(
      <MemoryRouter initialEntries={["/explore/banks"]}>
        <BankDirectoryPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("BIC to look up"), "CITIUS33");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    const link = await screen.findByRole("link", { name: /Prepare a payment/i });
    expect(link).toHaveAttribute("href", "/operate/prepare?bic=CITIUS33");
  });

  it("shows the settlement details inline on the result card — no click-through", async () => {
    queryClient.clear();
    const user = userEvent.setup();
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
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [
            {
              beneficiary_bic: "SBININBBXXX",
              beneficiary_bank_name: "State Bank of India",
              currency: "EUR",
              intermediary_bic: "DEUTDEFFXXX",
              intermediary_bank_name: "Deutsche Bank Frankfurt",
              intermediary_account: "ACCT-EUR-1",
              beneficiary_account: "ACCT-BENE",
              charge_code: "SHA",
              value_date: "spot",
            },
            {
              beneficiary_bic: "SBININBBXXX",
              beneficiary_bank_name: "State Bank of India",
              currency: "USD",
              intermediary_bic: "CITIUS33XXX",
              intermediary_bank_name: "Citibank New York",
              intermediary_account: "ACCT-USD-1",
              beneficiary_account: "ACCT-BENE",
              charge_code: "SHA",
              value_date: "spot",
            },
          ],
          disclaimer: "SIMULATION",
        }),
      ),
    );

    renderRelay(
      <MemoryRouter initialEntries={["/explore/banks"]}>
        <BankDirectoryPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("BIC to look up"), "SBININBB");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    // The full settlement section renders on the result card itself.
    expect(
      await screen.findByRole("heading", { name: "Published settlement instructions" }),
    ).toBeVisible();
    // Importance order: USD leads over EUR.
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["USD1", "EUR1"]);
    // The active (USD) table is visible.
    expect(screen.getByText("Citibank New York")).toBeVisible();
    expect(screen.getByText("ACCT-USD-1")).toBeVisible();
  });
});
