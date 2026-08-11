import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const EMPTY_SSI = {
  beneficiary_bic: "GTBINGLAXXX",
  currency: "ALL",
  instructions: [],
  disclaimer: "SIMULATION",
};

const NIGERIA_BANK = {
  bic: "GTBINGLAXXX",
  bank_name: "Guaranty Trust Bank",
  country_code: "NG",
  city: "Lagos",
  country_currency: "NGN",
};

describe("BankDetailRoute heuristic fallback", () => {
  it("shows the heuristic chain when the bank has no published SSI", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "GTBINGLAXXX", found: true, bank: NIGERIA_BANK }),
      ),
      http.get("/api/ssi", () => HttpResponse.json(EMPTY_SSI)),
      http.get("/api/route", () =>
        HttpResponse.json({
          bic: "GTBINGLAXXX",
          bank: null,
          beneficiary_country: "NG",
          currency: "NGN",
          valid: true,
          suggested_intermediaries: [
            { bic: "CITIUS33", bank: "Citibank NY", corridor: "USD-NGN", confidence: "high" },
          ],
          notes: "Heuristic suggestion.",
          source: "curated-corridor-table",
        }),
      ),
    );

    renderBank("GTBINGLAXXX");

    expect(
      await screen.findByRole("heading", { name: "Heuristic correspondent route" }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Published settlement instructions" })).toBeNull();
    expect(await screen.findByText(/high/)).toBeVisible();
    // Suggested chains never wear verified-state visuals: the nodes read
    // "Possible", never "Passed".
    expect((await screen.findAllByText("Possible")).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Passed")).toBeNull();
  });

  it("explains when the suggested chain fails to load", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "GTBINGLAXXX", found: true, bank: NIGERIA_BANK }),
      ),
      http.get("/api/ssi", () => HttpResponse.json(EMPTY_SSI)),
      http.get("/api/route", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    );

    renderBank("GTBINGLAXXX");

    expect(
      await screen.findByRole("heading", { name: "Heuristic correspondent route" }),
    ).toBeVisible();
    expect(
      await screen.findByText(/suggested chain could not be loaded/i),
    ).toBeVisible();
  });

  it("requests the heuristic route in the bank's own country currency", async () => {
    const seen: string[] = [];
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "GTBINGLAXXX", found: true, bank: NIGERIA_BANK }),
      ),
      http.get("/api/ssi", () => HttpResponse.json(EMPTY_SSI)),
      http.get("/api/route", ({ request }) => {
        seen.push(new URL(request.url).searchParams.get("currency") ?? "");
        return HttpResponse.json({
          bic: "GTBINGLAXXX",
          bank: null,
          beneficiary_country: "NG",
          currency: "NGN",
          valid: true,
          suggested_intermediaries: [],
          notes: "No curated corridor rule for currency=NGN country=NG.",
          source: "curated-corridor-table",
        });
      }),
    );

    renderBank("GTBINGLAXXX");

    await screen.findByRole("heading", { name: "Heuristic correspondent route" });
    await waitFor(() => expect(seen).toContain("NGN"));
  });

  it("renders the backend's own explanation when nothing matches", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "GTBINGLAXXX", found: true, bank: NIGERIA_BANK }),
      ),
      http.get("/api/ssi", () => HttpResponse.json(EMPTY_SSI)),
      http.get("/api/route", () =>
        HttpResponse.json({
          bic: "GTBINGLAXXX",
          bank: null,
          beneficiary_country: "NG",
          currency: "NGN",
          valid: true,
          suggested_intermediaries: [],
          notes: "No curated corridor rule for currency=NGN country=NG. Contact originator bank for exact chain.",
          source: "curated-corridor-table",
        }),
      ),
    );

    renderBank("GTBINGLAXXX");

    expect(
      await screen.findByText(/No curated corridor rule for currency=NGN country=NG/),
    ).toBeVisible();
  });

  it("does not claim an absence of SSI when the settlement request fails", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "GTBINGLAXXX", found: true, bank: NIGERIA_BANK }),
      ),
      http.get("/api/ssi", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
      http.get("/api/route", () =>
        HttpResponse.json({
          bic: "GTBINGLAXXX",
          bank: null,
          beneficiary_country: "NG",
          currency: "NGN",
          valid: true,
          suggested_intermediaries: [
            { bic: "CITIUS33", bank: "Citibank NY", corridor: "USD-NGN", confidence: "high" },
          ],
          notes: "Heuristic suggestion.",
          source: "curated-corridor-table",
        }),
      ),
    );

    renderBank("GTBINGLAXXX");

    expect(
      await screen.findByText(/could not be loaded/i),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Heuristic correspondent route" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Published settlement instructions" }),
    ).toBeNull();
  });

  it("keeps the settlement panel when the heuristic route request fails", async () => {
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
      http.get("/api/route", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    );

    renderBank("SBININBBXXX");

    expect(
      await screen.findByRole("heading", { name: "Published settlement instructions" }),
    ).toBeVisible();
  });
});

describe("BankDetailRoute heuristic confidence honesty", () => {
  it("reports the weakest hop's confidence, not the first hop's", async () => {
    // Real corridor chains disagree hop to hop: 122 of the 139 seeded banks that
    // render a heuristic chain contain a hop weaker than the first. Labelling the
    // chain with intermediaries[0] tells the learner the route is more reliable
    // than the curated table actually claims.
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "COBADEFFXXX", found: true, bank: NIGERIA_BANK }),
      ),
      http.get("/api/ssi", () => HttpResponse.json(EMPTY_SSI)),
      http.get("/api/route", () =>
        HttpResponse.json({
          bic: "COBADEFFXXX",
          bank: null,
          beneficiary_country: "DE",
          currency: "EUR",
          valid: true,
          suggested_intermediaries: [
            { bic: "COBADEFFXXX", bank: "Commerzbank", corridor: "EUR-DE", confidence: "high" },
            { bic: "BNPAFRPPXXX", bank: "BNP Paribas", corridor: "EUR-DE", confidence: "high" },
            { bic: "DEUTDEFFXXX", bank: "Deutsche Bank", corridor: "EUR-DE", confidence: "medium" },
          ],
          notes: "Heuristic suggestion.",
          source: "curated-corridor-table",
        }),
      ),
    );

    renderBank("COBADEFFXXX");

    const term = await screen.findByText(/Confidence \(weakest hop\)/i);
    const value = term.nextElementSibling;
    expect(value).toHaveTextContent("medium");
  });

  it("reports that confidence plainly when every hop agrees", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "GTBINGLAXXX", found: true, bank: NIGERIA_BANK }),
      ),
      http.get("/api/ssi", () => HttpResponse.json(EMPTY_SSI)),
      http.get("/api/route", () =>
        HttpResponse.json({
          bic: "GTBINGLAXXX",
          bank: null,
          beneficiary_country: "NG",
          currency: "NGN",
          valid: true,
          suggested_intermediaries: [
            { bic: "CITIUS33", bank: "Citibank NY", corridor: "USD-NGN", confidence: "high" },
            { bic: "DEUTDEFF", bank: "Deutsche Bank", corridor: "USD-NGN", confidence: "high" },
          ],
          notes: "Heuristic suggestion.",
          source: "curated-corridor-table",
        }),
      ),
    );

    renderBank("GTBINGLAXXX");

    const term = await screen.findByText(/Confidence \(weakest hop\)/i);
    expect(term.nextElementSibling).toHaveTextContent("high");
  });
});

describe("BankDetailRoute settlement list keys", () => {
  it("renders two correspondents that share a currency and BIC without a key collision", async () => {
    // /api/import/ssi can add rows, so currency + intermediary_bic is not a
    // guaranteed-unique React key even though the seed data happens to have no
    // collisions today.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const first = ssiRecord("USD", "CITIUS33", "Citibank NY");
    const second = {
      ...ssiRecord("USD", "CITIUS33", "Citibank NY"),
      beneficiary_account: "ACCT-BENE-2",
      intermediary_account: "ACCT-CITIUS33-B",
    };

    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "SBININBBXXX", found: true, bank: INDIA_BANK }),
      ),
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [first, second],
          disclaimer: "SIMULATION — illustrative settlement data.",
        }),
      ),
    );

    renderBank("SBININBBXXX");

    expect(
      await screen.findByRole("heading", { name: "Published settlement instructions" }),
    ).toBeVisible();
    // Both records must survive to the DOM.
    expect(await screen.findByText("ACCT-CITIUS33")).toBeVisible();
    expect(await screen.findByText("ACCT-CITIUS33-B")).toBeVisible();

    const duplicateKeyWarning = errorSpy.mock.calls.some((call) =>
      String(call[0] ?? "").includes("same key"),
    );
    expect(duplicateKeyWarning).toBe(false);
  });
});

describe("BankDetailRoute settlement retry", () => {
  it("lets the learner retry a failed settlement load", async () => {
    let attempt = 0;
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "SBININBBXXX", found: true, bank: INDIA_BANK }),
      ),
      http.get("/api/ssi", () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json({ detail: "boom" }, { status: 500 });
        }
        return HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [ssiRecord("USD", "CITIUS33", "Citibank NY")],
          disclaimer: "SIMULATION — illustrative settlement data.",
        });
      }),
    );

    renderBank("SBININBBXXX");

    const retry = await screen.findByRole("button", { name: /retry settlement instructions/i });
    await userEvent.click(retry);

    expect(
      await screen.findByRole("heading", { name: "Published settlement instructions" }),
    ).toBeVisible();
    expect(await screen.findByText("CITIUS33")).toBeVisible();
  });
});
