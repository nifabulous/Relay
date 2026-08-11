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
});
