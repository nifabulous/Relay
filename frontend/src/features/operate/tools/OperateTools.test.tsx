import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
