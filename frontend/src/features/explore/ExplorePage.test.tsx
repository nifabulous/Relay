import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import {
  GlossaryPage,
  BankDirectoryPage,
  SchemesPage,
} from "./ExplorePage";
import { renderRelay, queryClient } from "../../test/render";
import { server } from "../../test/server";
import {
  usdFedwireRailFixture,
  interacETransferFixture,
  swiftGpiInternationalFixture,
} from "./schemeFixtures";

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

  it("shows an SSI error with retry instead of silently omitting instructions", async () => {
    queryClient.clear();
    const user = userEvent.setup();
    let attempt = 0;
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
      http.get("/api/ssi", () => {
        attempt += 1;
        if (attempt === 1) return HttpResponse.json({ detail: "boom" }, { status: 500 });
        return HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [
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
        });
      }),
    );

    renderRelay(
      <MemoryRouter initialEntries={["/explore/banks"]}>
        <BankDirectoryPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("BIC to look up"), "SBININBB");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(
      await screen.findByText(/Published settlement instructions could not be loaded/i),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /retry settlement instructions/i }));
    expect(await screen.findByText("Citibank New York")).toBeVisible();
  });
});

// ─── Payment Schemes catalogue (RED phase, plan task 0.1) ────────────────────
//
// Acceptance matrix — schemes redesign (implementation in plan tasks 3.1/3.2):
//
//   FE-1  schemeFixtures parse under the current scheme shapes
//                                                       → covered indirectly here + schemas.test.ts (task 0.2)
//   FE-2a SchemesPage defaults to the USD tab and      → describe("SchemesPage red phase").it("selects USD by
//        fetches USD on first load, no pill click         default and fetches USD schemes on first load")
//   FE-2b switching currencies replaces content        → it("switches currencies without stale rows")
//   FE-2c International / SWIFT tab fetches and        → it("fetches and renders the SWIFT gpi catalogue from
//        renders /api/schemes/international                /api/schemes/international")
//   FE-2d sources render as links from fixtures        → it("renders source references with official URLs")
//
// These tests fail today: the page renders an idle state with aria-pressed
// pills and no sources. Plan task 3.2 replaces it with a USD-defaulting,
// tabbed catalogue.

function currencySchemesHandler(
  byCurrency: Record<string, unknown[]>,
  options: { international?: () => Response } = {},
) {
  if (options.international) {
    server.use(http.get("/api/schemes/international", options.international));
  }
  return http.get("/api/schemes", ({ request }) => {
    const url = new URL(request.url);
    const currency = url.searchParams.get("currency") ?? "USD";
    return HttpResponse.json({
      currency,
      country: "Testland",
      countryCode: currency.slice(0, 2),
      iban: false,
      localIdentifier: "Test identifier",
      verifiedAsof: "2026-07",
      schemes: byCurrency[currency] ?? [],
    });
  });
}

describe("SchemesPage red phase", () => {
  it("selects USD by default and fetches USD schemes on first load", async () => {
    queryClient.clear();
    server.use(
      currencySchemesHandler({
        USD: [usdFedwireRailFixture],
        CAD: [interacETransferFixture],
      }),
    );

    renderRelay(
      <MemoryRouter initialEntries={["/app/explore/schemes"]}>
        <SchemesPage />
      </MemoryRouter>,
    );

    // The catalogue must render immediately — no pill click to trigger it.
    expect(await screen.findByText("Fedwire")).toBeVisible();
    expect(screen.getByRole("tab", { name: "USD" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "CAD" })).not.toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("switches currencies without stale rows", async () => {
    queryClient.clear();
    const user = userEvent.setup();
    server.use(
      currencySchemesHandler({
        USD: [usdFedwireRailFixture],
        CAD: [interacETransferFixture],
      }),
    );

    renderRelay(
      <MemoryRouter initialEntries={["/app/explore/schemes"]}>
        <SchemesPage />
      </MemoryRouter>,
    );

    await screen.findByText("Fedwire");
    await user.click(screen.getByRole("tab", { name: "CAD" }));

    expect(await screen.findByText("Interac e-Transfer")).toBeVisible();
    expect(screen.queryByText("Fedwire")).toBeNull();
  });

  it("fetches and renders the SWIFT gpi catalogue from /api/schemes/international", async () => {
    queryClient.clear();
    const user = userEvent.setup();
    server.use(
      currencySchemesHandler(
        {
          USD: [usdFedwireRailFixture],
          CAD: [interacETransferFixture],
        },
        { international: () => HttpResponse.json(swiftGpiInternationalFixture) },
      ),
    );

    renderRelay(
      <MemoryRouter initialEntries={["/app/explore/schemes"]}>
        <SchemesPage />
      </MemoryRouter>,
    );

    await screen.findByText("Fedwire");
    await user.click(screen.getByRole("tab", { name: /international/i }));

    expect(await screen.findByText("SWIFT gpi")).toBeVisible();
    expect(screen.getByText(/UETR/i)).toBeVisible();
    expect(screen.getByText(/MT103|pacs\.008/i)).toBeVisible();
  });

  it("renders source references with official URLs", async () => {
    queryClient.clear();
    server.use(
      currencySchemesHandler({
        USD: [usdFedwireRailFixture],
        CAD: [interacETransferFixture],
      }),
    );

    renderRelay(
      <MemoryRouter initialEntries={["/app/explore/schemes"]}>
        <SchemesPage />
      </MemoryRouter>,
    );

    const source = await screen.findByRole("link", {
      name: /Federal Reserve Financial Services/,
    });
    expect(source).toHaveAttribute(
      "href",
      "https://www.frbservices.org/financial-services/wires",
    );
  });
});
