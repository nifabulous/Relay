import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import {
  GlossaryPage,
  BankDirectoryPage,
  SchemesPage,
} from "./ExplorePage";
import { SchemeTabs } from "./SchemeTabs";
import { SchemeDetails } from "./SchemeDetails";
import { SchemeTable } from "./SchemeTable";
import { SCHEME_TAB_ORDER } from "./schemeCatalog";
import { SchemeInfoSchema } from "../../api/schemas";
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
    expect(await screen.findByRole("heading", { name: "Fedwire" })).toBeVisible();
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

    await screen.findByRole("heading", { name: "Fedwire" });
    await user.click(screen.getByRole("tab", { name: "CAD" }));

    expect(await screen.findByRole("heading", { name: "Interac e-Transfer" })).toBeVisible();
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

    await screen.findByRole("heading", { name: "Fedwire" });
    await user.click(screen.getByRole("tab", { name: /international/i }));

    expect(await screen.findByRole("heading", { name: "SWIFT gpi" })).toBeVisible();
    // The SWIFT fixture carries UETR / MT103·pacs.008 in multiple detail
    // sections (how-it-works steps AND features), so scope to the section to
    // keep the assertion unambiguous once the page renders full details.
    const how = screen
      .getByRole("heading", { name: "How it works" })
      .closest("section");
    expect(how).not.toBeNull();
    expect(within(how!).getByText(/UETR \(field 121 \/ pacs\.008\)/i)).toBeVisible();
    expect(within(how!).getByText(/MT103 \/ pacs\.008 messages carry/i)).toBeVisible();
  });

  it("shows a retryable error and recovers through the retry action", async () => {
    queryClient.clear();
    const user = userEvent.setup();
    let attempt = 0;
    server.use(
      http.get("/api/schemes", () => {
        attempt += 1;
        if (attempt === 1) return HttpResponse.json({ detail: "boom" }, { status: 500 });
        return HttpResponse.json({
          currency: "USD",
          country: "Testland",
          countryCode: "US",
          iban: false,
          localIdentifier: "Test identifier",
          verifiedAsof: "2026-07",
          schemes: [usdFedwireRailFixture],
        });
      }),
    );

    renderRelay(
      <MemoryRouter initialEntries={["/app/explore/schemes"]}>
        <SchemesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Fedwire" })).toBeVisible();
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

describe("SchemesPage route", () => {
  it("resolves the existing /app/explore/schemes route to the tabbed catalogue", async () => {
    localStorage.clear();
    // App.tsx uses BrowserRouter with basename="/app"; seed jsdom's URL
    // before importing App so the real route tree mounts the lazy SchemesPage.
    window.history.replaceState({}, "", "/app/explore/schemes");

    const { App } = await import("../../app-shell/App");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Payment Schemes" }),
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: "USD" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The default MSW handler serves the enriched USD rail (Fedwire) — assert
    // it renders end to end through the real route tree.
    expect(await screen.findByRole("heading", { name: "Fedwire" })).toBeVisible();
  });
});

// ─── Catalogue primitives (plan task 3.1) ─────────────────────────────

function renderSchemeTabs(activeId?: string) {
  return render(
    <SchemeTabs
      tabs={SCHEME_TAB_ORDER}
      label="Payment schemes"
      activeId={activeId}
      renderPanel={(tab) => <p>Panel for {tab.label}</p>}
    />,
  );
}

describe("SchemeTabs", () => {
  it("defaults to the USD tab with roving tabindex and panel linkage", () => {
    renderSchemeTabs();

    const tablist = screen.getByRole("tablist", { name: "Payment schemes" });
    const usd = screen.getByRole("tab", { name: "USD" });
    const gbp = screen.getByRole("tab", { name: "GBP" });

    expect(tablist).toBeVisible();
    expect(usd).toHaveAttribute("aria-selected", "true");
    expect(usd).toHaveAttribute("tabindex", "0");
    expect(gbp).not.toHaveAttribute("aria-selected", "true");
    expect(gbp).toHaveAttribute("tabindex", "-1");

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", usd.id);
    expect(usd).toHaveAttribute("aria-controls", panel.id);
    expect(screen.getByText("Panel for USD")).toBeVisible();
  });

  it("orders tabs USD-first with International / SWIFT last", () => {
    renderSchemeTabs();

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("id", "scheme-tab-usd");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "USD", "GBP", "EUR", "CAD", "NGN", "KES", "INR", "AUD", "JPY", "AED",
      "International / SWIFT",
    ]);
  });

  it("moves focus with Arrow keys without changing the selection", async () => {
    const user = userEvent.setup();
    renderSchemeTabs();

    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAttribute("id", "scheme-tab-gbp");
    expect(screen.getByRole("tab", { name: "USD" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toHaveAttribute("id", "scheme-tab-usd");
    expect(screen.getByRole("tab", { name: "USD" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("jumps focus to the first and last tab with Home and End", async () => {
    const user = userEvent.setup();
    renderSchemeTabs();

    await user.tab();
    await user.keyboard("{End}");
    expect(document.activeElement).toHaveAttribute(
      "id",
      "scheme-tab-international",
    );
    expect(screen.getByRole("tab", { name: "USD" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{Home}");
    expect(document.activeElement).toHaveAttribute("id", "scheme-tab-usd");
  });

  it("activates the focused tab with Enter and Space", async () => {
    const user = userEvent.setup();
    renderSchemeTabs();

    await user.tab();
    await user.keyboard("{ArrowRight}"); // focus GBP; USD stays selected
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tab", { name: "GBP" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Panel for GBP")).toBeVisible();

    await user.keyboard("{ArrowRight}"); // focus EUR; GBP stays selected
    await user.keyboard(" ");
    expect(screen.getByRole("tab", { name: "EUR" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Panel for EUR")).toBeVisible();
  });

  it("activates a tab on click and updates panel and roving tabindex", async () => {
    const user = userEvent.setup();
    renderSchemeTabs();

    await user.click(screen.getByRole("tab", { name: "International / SWIFT" }));

    expect(
      screen.getByRole("tab", { name: "International / SWIFT" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: "International / SWIFT" }),
    ).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "USD" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(screen.getByText("Panel for International / SWIFT")).toBeVisible();
  });

  it("points every tab's aria-controls at the rendered panel", () => {
    renderSchemeTabs();

    const panel = screen.getByRole("tabpanel");
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveAttribute("aria-controls", panel.id);
    }
  });
});

describe("SchemeTable", () => {
  it("renders the six summary columns with table semantics", () => {
    render(<SchemeTable schemes={[SchemeInfoSchema.parse(usdFedwireRailFixture)]} />);

    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Rail", "Speed", "Limit", "Cost", "Use case", "Operator"]);

    const row = screen.getByRole("row", { name: /Fedwire/ });
    expect(within(row).getByRole("rowheader")).toBeVisible();
    expect(screen.getByText("Real-time (RTGS)")).toBeVisible();
    expect(screen.getByText("$10-35")).toBeVisible();
    expect(screen.getByText("High-value, wires")).toBeVisible();
    expect(screen.getByText("Federal Reserve")).toBeVisible();
  });

  it("annotates every cell with its column label for the narrow-screen card layout", () => {
    render(<SchemeTable schemes={[SchemeInfoSchema.parse(usdFedwireRailFixture)]} />);

    const row = screen.getByRole("row", { name: /Fedwire/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.getAttribute("data-label")),
    ).toEqual(["Speed", "Limit", "Cost", "Use case", "Operator"]);
  });

  it("shows the International / SWIFT scope label alongside the rail name", () => {
    render(
      <SchemeTable schemes={[SchemeInfoSchema.parse(swiftGpiInternationalFixture)]} />,
    );

    expect(screen.getByRole("rowheader", { name: /SWIFT gpi/ })).toBeVisible();
    expect(screen.getByText("International / SWIFT")).toBeVisible();
  });

  it("renders nothing when the list is empty", () => {
    const { container } = render(<SchemeTable schemes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SchemeDetails", () => {
  it("renders the enriched sections for a rail that carries them", () => {
    render(<SchemeDetails scheme={SchemeInfoSchema.parse(usdFedwireRailFixture)} />);

    expect(screen.getByRole("heading", { name: "Fedwire" })).toBeVisible();

    const how = screen.getByRole("heading", { name: "How it works" }).closest("section");
    expect(how).not.toBeNull();
    expect(within(how!).getByText(/debits its Federal Reserve master account/i)).toBeVisible();
    expect(within(how!).getByText(/Real-time gross settlement in central-bank money/i)).toBeVisible();

    const limits = screen.getByRole("heading", { name: "Limits & timing" }).closest("section");
    expect(limits).not.toBeNull();
    expect(within(limits!).getByText("Per transaction")).toBeVisible();
    expect(within(limits!).getByText("No practical limit")).toBeVisible();
    expect(within(limits!).getByText("09:00-18:00 ET")).toBeVisible();

    expect(screen.getByRole("heading", { name: "Settlement" })).toBeVisible();
    expect(screen.getByText(/Federal Reserve Banks RTGS/)).toBeVisible();

    expect(screen.getByRole("heading", { name: "Protections & reversibility" })).toBeVisible();
    expect(screen.getByText(/Not reversible/)).toBeVisible();
    expect(screen.getByText(/Final and irrevocable on credit/)).toBeVisible();

    const roadmap = screen.getByRole("heading", { name: "Roadmap" }).closest("section");
    expect(roadmap).not.toBeNull();
    expect(within(roadmap!).getByText(/ISO 20022 migration/i)).toBeVisible();

    expect(screen.getByRole("heading", { name: "Sources" })).toBeVisible();
    const source = screen.getByRole("link", { name: /Federal Reserve Financial Services/ });
    expect(source).toHaveAttribute(
      "href",
      "https://www.frbservices.org/financial-services/wires",
    );
  });

  it("labels a reversible rail as reversible", () => {
    render(
      <SchemeDetails
        scheme={SchemeInfoSchema.parse({
          name: "Test rail",
          speed: "s",
          limit: "l",
          cost: "c",
          useCase: "u",
          operator: "o",
          reversible: true,
          protections: ["Claimable while pending"],
        })}
      />,
    );

    expect(screen.getByText(/Reversible/)).toBeVisible();
  });

  it("hides sections whose data is absent instead of rendering empty headings", () => {
    render(
      <SchemeDetails
        scheme={SchemeInfoSchema.parse({
          name: "Minimal rail",
          speed: "s",
          limit: "l",
          cost: "c",
          useCase: "u",
          operator: "o",
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "Minimal rail" })).toBeVisible();
    for (const heading of [
      "How it works",
      "Limits & timing",
      "Settlement",
      "Protections & reversibility",
      "Roadmap",
      "Sources",
      "Product variants",
    ]) {
      expect(screen.queryByRole("heading", { name: heading })).toBeNull();
    }
  });

  it("renders Interac variants under the parent rail as product variants, not separate rails", () => {
    render(<SchemeDetails scheme={SchemeInfoSchema.parse(interacETransferFixture)} />);

    expect(screen.getByRole("heading", { name: "Product variants" })).toBeVisible();
    expect(
      screen.getByText(/product variants of the same Interac e-Transfer rail/i),
    ).toBeVisible();
    expect(screen.getByText(/not separate settlement rails/i)).toBeVisible();

    for (const variant of ["Auto-Deposit", "Request Money", "Standard security-question claim"]) {
      expect(screen.getByText(variant)).toBeVisible();
      expect(screen.queryByRole("heading", { name: variant })).toBeNull();
    }
  });

  it("renders the international scope label from the response", () => {
    render(<SchemeDetails scheme={SchemeInfoSchema.parse(swiftGpiInternationalFixture)} />);

    expect(screen.getByText("International / SWIFT")).toBeVisible();
    expect(screen.getByRole("heading", { name: "SWIFT gpi" })).toBeVisible();
  });
});
