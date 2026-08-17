import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

    const trackLink = await screen.findByRole("link", { name: /track this payment/i });
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
    expect(screen.queryByRole("link", { name: /track this payment/i })).toBeNull();
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
    expect(screen.queryByRole("link", { name: /track this payment/i })).toBeNull();
  });
});

describe("PreparePaymentPage currency selection", () => {
  it("renders currency as a dropdown, not a free-text input", () => {
    renderPage();
    const currency = screen.getByRole("combobox", { name: /currency/i });
    expect(currency).toBeVisible();
    expect(currency.tagName).toBe("SELECT");
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

    // The dropdown is limited to the bank's published currencies; it must not
    // expose the broad no-BIC fallback once a SWIFT bank is selected.
    const currency = screen.getByRole("combobox", { name: /currency/i });
    expect(Array.from(currency.querySelectorAll("option")).map((option) => option.value)).toEqual([
      "USD",
      "EUR",
      "GBP",
    ]);

    // USD is the default selection (importance-ordered first published).
    expect(currency).toHaveValue("USD");

    // Clicking a pick populates the dropdown; the user can change it after.
    await user.click(screen.getByRole("button", { name: /^EUR$/ }));
    expect(currency).toHaveValue("EUR");
    await user.selectOptions(currency, "GBP");
    expect(currency).toHaveValue("GBP");
  });
});

describe("PreparePaymentPage IBAN flexibility", () => {
  it("requires an IBAN or account number when no BIC is given", async () => {
    const { user } = renderPage();
    await user.type(screen.getByLabelText(/beneficiary name/i), "John Smith");
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /run payment checks/i }));

    expect(screen.getByText(/enter a beneficiary iban or account number/i)).toBeVisible();
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
