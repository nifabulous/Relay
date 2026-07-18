import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { ToolIndexPage } from "./ToolIndexPage";
import { FeePage } from "./FeePage";
import { ScreeningPage } from "./ScreeningPage";
import { ValueDatePage } from "./ValueDatePage";
import { StpPage } from "./StpPage";
import { TrackingPage } from "../tracking/TrackingPage";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ToolIndexPage", () => {
  it("lists all available tools with links", () => {
    renderWithProviders(<ToolIndexPage />);
    expect(screen.getByRole("link", { name: /fee calculator/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /sanctions screening/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /value date/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /stp.*checker/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /payment tracking/i })).toBeVisible();
  });
});

describe("FeePage", () => {
  it("renders the fee calculator form with amount, currency, and charge code", () => {
    renderWithProviders(<FeePage />);
    expect(screen.getByLabelText(/amount/i)).toBeVisible();
    expect(screen.getByLabelText(/currency/i)).toBeVisible();
    expect(screen.getByLabelText(/charge code/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /simulate/i })).toBeVisible();
  });
});

describe("ScreeningPage", () => {
  it("renders the screening form with sender and beneficiary name fields", () => {
    renderWithProviders(<ScreeningPage />);
    expect(screen.getByLabelText(/sender name/i)).toBeVisible();
    expect(screen.getByLabelText(/beneficiary name/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /screen/i })).toBeVisible();
  });
});

describe("ValueDatePage", () => {
  it("renders the value date form", () => {
    renderWithProviders(<ValueDatePage />);
    expect(screen.getByLabelText(/send date/i)).toBeVisible();
    expect(screen.getByLabelText(/currency/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /calculate/i })).toBeVisible();
  });
});

describe("StpPage", () => {
  it("renders the STP checker form with MT103 fields", () => {
    renderWithProviders(<StpPage />);
    expect(screen.getByLabelText(/transaction reference/i)).toBeVisible();
    expect(screen.getByLabelText(/value date/i)).toBeVisible();
    expect(screen.getByLabelText(/currency/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /check/i })).toBeVisible();
  });

  it("shows the pacs.008 view when toggled", async () => {
    server.use(
      http.post("/api/message/translate", () =>
        HttpResponse.json({
          mapping: [
            {
              mt_tag: "59",
              mt_label: "Beneficiary Customer",
              iso_path: "Cdtr/Nm",
              iso_label: "Creditor Name",
              value: "Beta Ltd",
            },
          ],
          xml: "<Document/>",
          disclaimer: "primer",
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<StpPage />);
    await user.type(screen.getByLabelText(/transaction reference/i), "REF1");
    await user.type(screen.getByLabelText(/value date/i), "2026-07-20");
    await user.type(screen.getByLabelText(/interbank amount/i), "100000");
    await user.click(screen.getByRole("button", { name: /view as pacs\.008/i }));
    await waitFor(() =>
      expect(screen.getByText(/MT103 → pacs\.008 field mapping/i)).toBeInTheDocument(),
    );
  });
});

describe("TrackingPage", () => {
  it("renders the tracking input with a UETR field", () => {
    renderWithProviders(<TrackingPage />);
    expect(screen.getByLabelText(/uetr/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /track/i })).toBeVisible();
  });

  it("displays the simulation label persistently", () => {
    renderWithProviders(<TrackingPage />);
    expect(screen.getByText(/simulation.*not a real payment/i)).toBeVisible();
  });
});
