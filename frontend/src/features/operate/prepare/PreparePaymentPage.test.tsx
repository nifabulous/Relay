import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { PreparePaymentPage } from "./PreparePaymentPage";

function renderPage(options: { basename?: string; initialEntries?: string[] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter basename={options.basename} initialEntries={options.initialEntries}>
        <PreparePaymentPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user, ...utils };
}

describe("PreparePaymentPage form accessibility", () => {
  it("separates accepted currency input from rail and SSI coverage", () => {
    renderPage();

    const note = screen.getByRole("note", { name: "Payment coverage" });
    expect(note).toHaveTextContent("Currency entry validation");
    expect(note).toHaveTextContent("Domestic rail catalogue");
    expect(note).toHaveTextContent("International / SWIFT");
    expect(note).toHaveTextContent(/bank-published settlement instructions/i);
  });

  it("associates validation errors with fields via aria-describedby", async () => {
    const { user } = renderPage();

    // Submit without filling anything — triggers validation
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    // IBAN field should be invalid and described
    const ibanInput = screen.getByLabelText(/beneficiary iban/i);
    expect(ibanInput).toHaveAttribute("aria-invalid", "true");
    expect(ibanInput).toHaveAttribute("aria-describedby");

    // The describedby id should point to the error message
    const errorId = ibanInput.getAttribute("aria-describedby");
    const errorEl = document.getElementById(errorId!);
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toBeTruthy();
  });

  it("focuses the first invalid field on submit", async () => {
    const { user } = renderPage();

    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    // The first field (IBAN) should be focused
    const ibanInput = screen.getByLabelText(/beneficiary iban/i);
    expect(ibanInput).toHaveFocus();
  });

  it("associates name field error with aria-describedby", async () => {
    const { user } = renderPage();

    // Submit without filling anything
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    const nameInput = screen.getByLabelText(/beneficiary name/i);
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-describedby");
  });

  it("labels heuristic routing suggestions as candidates instead of a confirmed chain", async () => {
    server.use(
      http.post("/api/prepare-payment", () => HttpResponse.json({
        recommendation: "PROCEED_WITH_CAUTION",
        reason: "Illustrative result",
        is_blocking: false,
        uetr: "test-uetr",
        validation: { valid: true, bic: "NWBKGB2LXXX", errors: [] },
        vop: { outcome: "MATCH", score: 1, advice: "Matches" },
        routing: {
          beneficiary_country: "GB",
          inferred_currency: "GBP",
          suggested_intermediaries: [
            { bic: "BARCGB22XXX", bank: "Barclays", corridor: "GBP->GB", confidence: "high" },
          ],
        },
        ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
        warnings: ["Simulation"],
        blocks: [],
      })),
    );

    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary iban/i), "GB29NWBK60161331926819");
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /possible correspondent options/i })).toBeVisible();
    });
    expect(screen.getByText(/candidates, not a confirmed chain/i)).toBeVisible();
    expect(screen.queryByRole("img", { name: /Payment from Your bank/i })).toBeNull();
    expect(screen.getByText("Correspondent Routing (heuristic)")).toBeVisible();
    expect(screen.getByText("Needs attention")).toBeVisible();
  });

  it("labels published SSI correspondents as published, not as heuristic guesses", async () => {
    // Regression: prepare-payment used to discard the routing basis, so a
    // bank's own published correspondents rendered under a "heuristic"
    // heading as "possible options" — the opposite of what they are.
    server.use(
      http.post("/api/prepare-payment", () => HttpResponse.json({
        recommendation: "PROCEED",
        reason: "Illustrative result",
        is_blocking: false,
        uetr: "test-uetr",
        validation: { valid: true, bic: "SBININBBXXX", errors: [] },
        vop: { outcome: "MATCH", score: 1, advice: "Matches" },
        routing: {
          beneficiary_country: "IN",
          inferred_currency: "INR",
          routing_basis: "published-ssi",
          suggested_intermediaries: [
            { bic: "CITIUS33XXX", bank: "Citibank", corridor: "USD->IN", confidence: "high", basis: "published-ssi" },
            { bic: "CHASUS33XXX", bank: "JPMorgan", corridor: "USD->IN", confidence: "high", basis: "published-ssi" },
            { bic: "BOFAUS3NXXX", bank: "Bank of America", corridor: "USD->IN", confidence: "high", basis: "published-ssi" },
            { bic: "BKTRUS33XXX", bank: "Deutsche Bank Trust", corridor: "USD->IN", confidence: "high", basis: "published-ssi" },
            { bic: "SCBLUS33XXX", bank: "Standard Chartered", corridor: "USD->IN", confidence: "high", basis: "published-ssi" },
            { bic: "IRVTUS3NXXX", bank: "BNY Mellon", corridor: "USD->IN", confidence: "high", basis: "published-ssi" },
          ],
        },
        ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
        warnings: ["Simulation"],
        blocks: [],
      })),
    );

    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary iban/i), "GB29NWBK60161331926819");
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    await waitFor(() => {
      expect(screen.getByText("Correspondent Routing (published)")).toBeVisible();
    });
    expect(screen.getByText(/published correspondent\(s\) from the beneficiary bank/i)).toBeVisible();
    expect(screen.queryByText("Correspondent Routing (heuristic)")).toBeNull();
    expect(screen.queryByRole("heading", { name: /possible correspondent options/i })).toBeNull();
    expect(screen.getByRole("heading", { name: /published correspondent details/i })).toBeVisible();
    // All six render — the old five-item cap silently dropped published rows.
    const list = document.querySelector(".prepare-payment__intermediaries");
    expect(list?.querySelectorAll("li")).toHaveLength(6);
    expect(list?.textContent).toContain("IRVTUS3NXXX");
  });
});

describe("PreparePaymentPage result cross-links", () => {
  // The router mounts with basename="/app" (app-shell/App.tsx), so React Router
  // prefixes it itself. A `to` value that also carries /app renders /app/app/...,
  // which matches no route and paints an empty page.
  it("renders footer links under a single /app prefix when the router has basename='/app'", async () => {
    server.use(
      http.post("/api/prepare-payment", () => HttpResponse.json({
        recommendation: "PROCEED",
        reason: "Illustrative result",
        is_blocking: false,
        uetr: "abc-123",
        validation: { valid: true, bic: "NWBKGB2LXXX", errors: [] },
        vop: { outcome: "MATCH", score: 1, advice: "Matches" },
        routing: {
          beneficiary_country: "GB",
          inferred_currency: "GBP",
          suggested_intermediaries: [],
        },
        ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
        warnings: ["Simulation"],
        blocks: [],
      })),
    );

    const { user } = renderPage({ basename: "/app", initialEntries: ["/app/operate/prepare"] });
    await user.type(screen.getByLabelText(/beneficiary iban/i), "GB29NWBK60161331926819");
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    const trackLink = await screen.findByRole("link", { name: /view simulated tracking/i });
    expect(trackLink).toHaveAttribute("href", "/app/operate/tracking?uetr=abc-123");

    expect(screen.getByRole("link", { name: /explore corridor details/i }))
      .toHaveAttribute("href", "/app/explore");
  });

  it("does not link a blocked recommendation to a credited tracking timeline", async () => {
    server.use(
      http.post("/api/prepare-payment", () => HttpResponse.json({
        recommendation: "STOP",
        reason: "Do not proceed",
        is_blocking: true,
        uetr: "blocked-uetr",
        validation: { valid: true, bic: "NWBKGB2LXXX", errors: [] },
        vop: { outcome: "NO_MATCH", score: 0, advice: "Do not proceed" },
        routing: { beneficiary_country: "GB", inferred_currency: "GBP", suggested_intermediaries: [] },
        ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
        warnings: [],
        blocks: ["Name does not match"],
      })),
    );

    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary iban/i), "GB29NWBK60161331926819");
    await user.type(screen.getByLabelText(/beneficiary name/i), "Wrong Name");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    await screen.findByText("Stop");
    expect(screen.queryByRole("link", { name: /view simulated tracking/i })).toBeNull();
  });

  it("does not link a review recommendation before confirmation", async () => {
    server.use(
      http.post("/api/prepare-payment", () => HttpResponse.json({
        recommendation: "REVIEW",
        reason: "Confirm before sending",
        is_blocking: false,
        uetr: "review-uetr",
        validation: { valid: true, bic: "NWBKGB2LXXX", errors: [] },
        vop: { outcome: "CLOSE_MATCH", score: 0.9, advice: "Confirm" },
        routing: { beneficiary_country: "GB", inferred_currency: "GBP", suggested_intermediaries: [] },
        ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
        warnings: ["Confirm"],
        blocks: [],
      })),
    );

    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary iban/i), "GB29NWBK60161331926819");
    await user.type(screen.getByLabelText(/beneficiary name/i), "Jon Smyth");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    await screen.findByText("Review needed");
    expect(screen.queryByRole("link", { name: /view simulated tracking/i })).toBeNull();
  });
});

describe("PreparePaymentPage currency selection", () => {
  it("renders currency as a styled combobox, not a free-text input", async () => {
    renderPage();
    const currency = screen.getByRole("combobox", { name: /currency/i });
    expect(currency).toBeVisible();
    expect(currency.tagName).toBe("BUTTON");
    expect(currency).toHaveAttribute("aria-haspopup", "listbox");

    const user = userEvent.setup();
    await user.click(currency);
    expect(screen.getByRole("listbox", { name: /currency/i })).toBeVisible();
  });

  it("offers the bank's published settlement currencies as clickable picks", async () => {
    server.use(
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "MASHAEADXXX",
          currency: "ALL",
          instructions: [
            { beneficiary_bic: "MASHAEADXXX", beneficiary_bank_name: "Mashreq", currency: "USD", intermediary_bic: "MSHQUS33XXX", intermediary_bank_name: "Mashreq NY", intermediary_account: "ACCT-1", beneficiary_account: "ACCT-2", charge_code: "SHA", value_date: "spot" },
            { beneficiary_bic: "MASHAEADXXX", beneficiary_bank_name: "Mashreq", currency: "EUR", intermediary_bic: "BARCDEFFXXX", intermediary_bank_name: "Barclays Frankfurt", intermediary_account: "ACCT-3", beneficiary_account: "ACCT-2", charge_code: "SHA", value_date: "spot" },
            { beneficiary_bic: "MASHAEADXXX", beneficiary_bank_name: "Mashreq", currency: "GBP", intermediary_bic: "BARCGB22XXX", intermediary_bank_name: "Barclays London", intermediary_account: "ACCT-4", beneficiary_account: "ACCT-2", charge_code: "SHA", value_date: "spot" },
          ],
          disclaimer: "SIMULATION",
        }),
      ),
    );

    const { user } = renderPage({ initialEntries: ["/operate/prepare?bic=MASHAEADXXX"] });

    // The published currencies appear as clickable picks, USD first.
    const picks = await screen.findAllByRole("button", { name: /^[A-Z]{3}$/ });
    expect(picks.map((p) => p.textContent)).toEqual(["USD", "EUR", "GBP"]);

    // The picker is limited to the bank's published currencies; it must not
    // expose the broad no-BIC fallback once a SWIFT bank is selected.
    const currency = screen.getByRole("combobox", { name: /currency/i });
    await user.click(currency);
    const currencyOptions = within(screen.getByRole("listbox", { name: /currency/i }));
    expect(
      currencyOptions.getAllByRole("option").map((option) => option.getAttribute("data-value")),
    ).toEqual(["USD", "EUR", "GBP"]);

    // USD is the default selection (importance-ordered first published).
    expect(currency).toHaveValue("USD");

    // Clicking a published-currency pick populates the combobox; the user can
    // change it from either affordance.
    await user.click(screen.getByRole("button", { name: /^EUR$/ }));
    expect(currency).toHaveValue("EUR");
    await user.click(currency);
    await user.click(screen.getByRole("option", { name: "GBP" }));
    expect(currency).toHaveValue("GBP");
  });

  it("filters unsupported currencies out of bank-published picks", async () => {
    server.use(
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "MASHAEADXXX",
          currency: "ALL",
          instructions: [
            { beneficiary_bic: "MASHAEADXXX", beneficiary_bank_name: "Mashreq", currency: "ZZZ", intermediary_bic: "MSHQUS33XXX", intermediary_bank_name: "Mashreq NY", intermediary_account: "ACCT-1", beneficiary_account: "ACCT-2", charge_code: "SHA", value_date: "spot" },
            { beneficiary_bic: "MASHAEADXXX", beneficiary_bank_name: "Mashreq", currency: " usd ", intermediary_bic: "MSHQUS33XXX", intermediary_bank_name: "Mashreq NY", intermediary_account: "ACCT-3", beneficiary_account: "ACCT-2", charge_code: "SHA", value_date: "spot" },
          ],
          disclaimer: "SIMULATION",
        }),
      ),
    );

    const { user } = renderPage({ initialEntries: ["/operate/prepare?bic=MASHAEADXXX"] });
    const currency = screen.getByRole("combobox", { name: /currency/i });
    await waitFor(() => expect(currency).toHaveValue("USD"));
    await user.click(currency);

    const options = within(screen.getByRole("listbox", { name: /currency/i })).getAllByRole("option");
    expect(options.map((option) => option.getAttribute("data-value"))).toEqual(["USD"]);
  });

  it("marks payment results stale when the currency picker changes", async () => {
    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary iban/i), "GB29NWBK60161331926819");
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    await screen.findByRole("heading", { name: /check results/i });
    const currency = screen.getByRole("combobox", { name: /currency/i });
    await user.click(currency);
    await user.click(screen.getByRole("option", { name: "EUR" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/results below are stale/i);
  });

  it("keeps a fallback currency picker usable when SSI has no instructions", async () => {
    server.use(
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "COBADEFFXXX",
          currency: "ALL",
          instructions: [],
          disclaimer: "SIMULATION",
        }),
      ),
    );

    const { user } = renderPage({ initialEntries: ["/operate/prepare?bic=COBADEFFXXX"] });
    expect(
      await screen.findByRole("status", { name: /settlement currency coverage/i }),
    ).toHaveTextContent(/not confirmed/i);

    const currency = screen.getByRole("combobox", { name: /currency/i });
    await user.click(currency);
    expect(screen.getByRole("option", { name: "USD" })).toBeVisible();
  });

  it("falls back when a bank publishes no supported currencies", async () => {
    server.use(
      http.get("/api/ssi", ({ request }) => {
        const bic = new URL(request.url).searchParams.get("bic");
        if (bic === "MASHAEADXXX") {
          return HttpResponse.json({
            beneficiary_bic: bic,
            currency: "ALL",
            instructions: [
              { beneficiary_bic: bic, beneficiary_bank_name: "Mashreq", currency: "XAF", intermediary_bic: "MSHQUS33XXX", intermediary_bank_name: "Mashreq NY", intermediary_account: "ACCT-1", beneficiary_account: "ACCT-2", charge_code: "SHA", value_date: "spot" },
            ],
            disclaimer: "SIMULATION",
          });
        }
        return HttpResponse.json({
          beneficiary_bic: bic ?? "COBADEFFXXX",
          currency: "ALL",
          instructions: [],
          disclaimer: "SIMULATION",
        });
      }),
    );

    const { user } = renderPage({ initialEntries: ["/operate/prepare?bic=MASHAEADXXX"] });
    const currency = screen.getByRole("combobox", { name: /currency/i });
    await waitFor(() => expect(currency).toHaveValue("GBP"));

    const bic = screen.getByLabelText(/beneficiary bic/i);
    await user.clear(bic);
    await user.type(bic, "COBADEFFXXX");

    await waitFor(() => {
      expect(screen.getByRole("status", { name: /settlement currency coverage/i })).toHaveTextContent(/not confirmed/i);
    });
    expect(currency).toHaveValue("GBP");
  });

  it("explains SSI failures and offers a scoped retry", async () => {
    let attempts = 0;
    server.use(
      http.get("/api/ssi", () => {
        attempts += 1;
        return HttpResponse.json({ detail: "SSI unavailable" }, { status: 503 });
      }),
    );

    const { user } = renderPage({ initialEntries: ["/operate/prepare?bic=COBADEFFXXX"] });
    const status = await screen.findByRole("status", { name: /settlement currency coverage/i });
    expect(status).toHaveTextContent(/could not be loaded/i);
    expect(status).toHaveTextContent(/simulation choices/i);

    await user.click(within(status).getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(attempts).toBe(2));
  });

  it("closes the currency listbox when focus leaves with Tab", async () => {
    const { user } = renderPage();
    const currency = screen.getByRole("combobox", { name: /currency/i });
    await user.click(currency);
    expect(screen.getByRole("listbox", { name: /currency/i })).toBeVisible();

    await user.tab();

    expect(screen.queryByRole("listbox", { name: /currency/i })).toBeNull();
    expect(screen.getByLabelText(/amount/i)).toHaveFocus();
  });

});

describe("PreparePaymentPage IBAN flexibility", () => {
  it("requires an IBAN or account number when no BIC is given", async () => {
    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    expect(document.getElementById("prepare-validation-summary"))
      .toHaveTextContent(/enter a beneficiary iban or account number/i);
  });

  it("allows a payment with only a BIC (no IBAN/account)", async () => {
    server.use(
      http.post("/api/prepare-payment", () =>
        HttpResponse.json({
          recommendation: "PROCEED",
          reason: "Illustrative result",
          is_blocking: false,
          uetr: "test-uetr",
          validation: { valid: true, bic: "MASHAEADXXX", errors: [] },
          vop: { outcome: "NOT_CHECKED", score: null, advice: "No account to check" },
          routing: {
            beneficiary_country: "AE",
            inferred_currency: "AED",
            routing_basis: "published-ssi",
            suggested_intermediaries: [],
          },
          ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
          warnings: ["Simulation"],
          blocks: [],
        }),
      ),
    );

    const { user } = renderPage({ initialEntries: ["/operate/prepare?bic=MASHAEADXXX"] });
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    expect(await screen.findByText(/PROCEED/i)).toBeVisible();
    expect(screen.queryByText(/enter a beneficiary iban or account number/i)).toBeNull();
  });
});

describe("PreparePaymentPage guided stages", () => {
  it("uses the approved page copy and marks payment details as current initially", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Prepare a payment" })).toBeVisible();
    expect(screen.getByText("Prepare, validate, and understand a simulated payment.")).toBeVisible();

    const stages = screen.getByRole("navigation", { name: /payment preparation stages/i });
    expect(within(stages).getAllByRole("listitem")).toHaveLength(3);
    expect(within(stages).getByText("Payment details").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("status")).toHaveTextContent(/stage: payment details/i);
  });

  it("shows checking as the current stage while one request is active", async () => {
    server.use(
      http.post("/api/prepare-payment", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          recommendation: "PROCEED",
          reason: "Illustrative result",
          is_blocking: false,
          uetr: "checking-uetr",
          validation: { valid: true, bic: "NWBKGB2LXXX", errors: [] },
          vop: { outcome: "MATCH", score: 1, advice: "Matches" },
          routing: { beneficiary_country: "GB", inferred_currency: "GBP", suggested_intermediaries: [] },
          ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
          warnings: ["Simulation"],
          blocks: [],
        });
      }),
    );

    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary iban/i), "GB29NWBK60161331926819");
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/stage: run checks/i);
    expect(screen.getByText(/running simulated checks/i)).toBeVisible();
    await screen.findByRole("heading", { name: /check results/i });
  });

  it("labels an explicit not-checked response partial and keeps it on review route", async () => {
    server.use(
      http.post("/api/prepare-payment", () => HttpResponse.json({
        recommendation: "PROCEED",
        reason: "Illustrative result",
        is_blocking: false,
        uetr: "partial-uetr",
        validation: { valid: true, bic: "MASHAEADXXX", errors: [] },
        vop: { outcome: "NOT_CHECKED", score: null, advice: "No account to check" },
        routing: { beneficiary_country: "AE", inferred_currency: "AED", suggested_intermediaries: [] },
        ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
        warnings: ["Simulation"],
        blocks: [],
      })),
    );

    const { user } = renderPage({ initialEntries: ["/operate/prepare?bic=MASHAEADXXX"] });
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    const results = await screen.findByRole("heading", { name: /check results/i });
    expect(results.parentElement).toHaveAttribute("data-request-state", "partial");
    expect(screen.getByText(/some evidence was not available/i)).toBeVisible();
    expect(document.querySelector(".prepare-payment__live-status"))
      .toHaveTextContent(/stage: review route/i);
  });

  it("returns to payment details when a stale result is followed by an invalid submit", async () => {
    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary iban/i), "GB29NWBK60161331926819");
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));
    await screen.findByRole("heading", { name: /check results/i });

    // Editing a completed form makes the previous result stale. Submitting
    // invalid details must make the validation stage current again.
    await user.clear(screen.getByLabelText(/beneficiary iban/i));
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    expect(document.getElementById("prepare-validation-summary")).toBeVisible();
    expect(document.querySelector('[data-stage="Payment details"]')).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("status")).toHaveTextContent(/stage: payment details/i);
  });

  it("keeps a failed request retryable and returns to review after retry", async () => {
    let attempts = 0;
    server.use(
      http.post("/api/prepare-payment", () => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.json({ detail: "Temporary failure" }, { status: 503 });
        return HttpResponse.json({
          recommendation: "PROCEED",
          reason: "Illustrative result",
          is_blocking: false,
          uetr: "retry-uetr",
          validation: { valid: true, bic: "NWBKGB2LXXX", errors: [] },
          vop: { outcome: "MATCH", score: 1, advice: "Matches" },
          routing: { beneficiary_country: "GB", inferred_currency: "GBP", suggested_intermediaries: [] },
          ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
          warnings: ["Simulation"],
          blocks: [],
        });
      }),
    );

    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary iban/i), "GB29NWBK60161331926819");
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    const error = await screen.findByRole("alert", { name: "" });
    expect(error).toHaveTextContent(/temporary failure/i);
    expect(screen.getByRole("status")).toHaveTextContent(/stage: run checks/i);
    await user.click(within(error).getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: /check results/i });
    expect(attempts).toBe(2);
  });

  it("debounces SSI lookup until a BIC settles", async () => {
    let calls = 0;
    server.use(
      http.get("/api/ssi", () => {
        calls += 1;
        return HttpResponse.json({ beneficiary_bic: "MASHAEADXXX", currency: "ALL", instructions: [], disclaimer: "SIMULATION" });
      }),
    );

    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary bic/i), "MASHAEADXXX");
    await waitFor(() => expect(calls).toBe(1), { timeout: 1500 });
  });
});
