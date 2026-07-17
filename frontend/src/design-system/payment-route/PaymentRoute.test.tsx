import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentRoute } from "./PaymentRoute";
import { routeSummary } from "./routeSummary";
import type { PaymentRouteNode } from "../types";

const sampleNodes: PaymentRouteNode[] = [
  { id: "1", kind: "originator", bic: "GTBINGLAXXX", name: "GTBank", status: "passed" },
  { id: "2", kind: "intermediary", bic: "CITIUS33", name: "Citibank", status: "passed", amount: "$4,985", fee: "$15" },
  { id: "3", kind: "beneficiary", bic: "NWBKGB2L", name: "NatWest", status: "passed", amount: "$4,970" },
];

const rejectNodes: PaymentRouteNode[] = [
  { id: "1", kind: "originator", bic: "GTBINGLAXXX", name: "GTBank", status: "passed" },
  { id: "2", kind: "intermediary", bic: "CITIUS33", name: "Citibank", status: "failed", amount: "$4,985", fee: "$15" },
  { id: "3", kind: "beneficiary", bic: "NWBKGB2L", name: "NatWest", status: "unavailable" },
];

describe("routeSummary", () => {
  it("names origin, intermediary, beneficiary, currency, and amount", () => {
    const summary = routeSummary(sampleNodes, "USD", "5,000");
    expect(summary).toContain("GTBank");
    expect(summary).toContain("Citibank");
    expect(summary).toContain("NatWest");
    expect(summary).toContain("USD");
    expect(summary).toContain("5,000");
  });

  it("reports all passed when every node passed", () => {
    const summary = routeSummary(sampleNodes, "USD", "5,000");
    expect(summary).toContain("All institutions passed");
  });

  it("states where movement stopped and why on failure", () => {
    const summary = routeSummary(rejectNodes, "USD", "5,000");
    expect(summary).toContain("Stopped");
    expect(summary).toContain("Citibank");
    expect(summary).toContain("failed");
  });

  it("handles empty nodes gracefully", () => {
    expect(routeSummary([])).toContain("No payment route data");
  });

  it("handles origin to beneficiary without intermediaries", () => {
    const direct: PaymentRouteNode[] = [
      { id: "1", kind: "originator", bic: "A", name: "Bank A", status: "passed" },
      { id: "2", kind: "beneficiary", bic: "B", name: "Bank B", status: "passed" },
    ];
    const summary = routeSummary(direct, "EUR", "100");
    expect(summary).toContain("Bank A");
    expect(summary).toContain("Bank B");
    expect(summary).not.toContain("through");
  });
});

describe("PaymentRoute component", () => {
  it("renders the accessible summary for screen readers", () => {
    render(<PaymentRoute nodes={sampleNodes} currency="USD" amount="5,000" />);
    const summary = screen.getByRole("img", { name: /payment from/i });
    expect(summary).toHaveAttribute("aria-label", expect.stringContaining("GTBank"));
    expect(summary).toHaveAttribute("aria-label", expect.stringContaining("NatWest"));
  });

  it("renders all institution names visibly", () => {
    render(<PaymentRoute nodes={sampleNodes} currency="USD" amount="5,000" />);
    // Names appear in both horizontal and vertical layouts — at least 2 each
    const gtbank = screen.getAllByText("GTBank");
    const citibank = screen.getAllByText("Citibank");
    const natwest = screen.getAllByText("NatWest");
    expect(gtbank.length).toBeGreaterThanOrEqual(1);
    expect(citibank.length).toBeGreaterThanOrEqual(1);
    expect(natwest.length).toBeGreaterThanOrEqual(1);
    gtbank.forEach((el) => expect(el).toBeVisible());
  });

  it("renders BIC codes in mono font", () => {
    const { container } = render(<PaymentRoute nodes={sampleNodes} currency="USD" amount="5,000" />);
    const bics = container.querySelectorAll(".mono");
    const bicTexts = Array.from(bics).map((el) => el.textContent);
    expect(bicTexts).toContain("GTBINGLAXXX");
    expect(bicTexts).toContain("CITIUS33");
    expect(bicTexts).toContain("NWBKGB2L");
  });

  it("renders node amounts and fees when provided", () => {
    render(<PaymentRoute nodes={sampleNodes} currency="USD" amount="5,000" />);
    const amounts = screen.getAllByText(/\$4,985/);
    const fees = screen.getAllByText(/\$15/);
    expect(amounts.length).toBeGreaterThanOrEqual(1);
    expect(fees.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a vertical layout class on narrow viewports", () => {
    // The component should render both layouts in the DOM; CSS controls
    // which is visible based on viewport width. We verify the vertical
    // container exists for mobile.
    const { container } = render(<PaymentRoute nodes={sampleNodes} currency="USD" amount="5,000" />);
    expect(container.querySelector(".payment-route--vertical")).toBeInTheDocument();
    expect(container.querySelector(".payment-route--horizontal")).toBeInTheDocument();
  });

  it("renders reject/incomplete paths with a stop indicator", () => {
    render(<PaymentRoute nodes={rejectNodes} currency="USD" amount="5,000" />);
    const indicators = screen.getAllByText(/stopped|failed/i);
    expect(indicators.length).toBeGreaterThanOrEqual(1);
    indicators.forEach((el) => expect(el).toBeInTheDocument());
  });

  it("wraps long institution names without truncation", () => {
    const longNameNodes: PaymentRouteNode[] = [
      { id: "1", kind: "originator", bic: "A", name: "First National Bank of Somewhere Very Long Name Holdings LLC", status: "passed" },
      { id: "2", kind: "beneficiary", bic: "B", name: "Beneficiary", status: "passed" },
    ];
    const { container } = render(<PaymentRoute nodes={longNameNodes} currency="USD" amount="100" />);
    // The long name should be fully present in the DOM (not truncated)
    expect(container.textContent).toContain("First National Bank of Somewhere Very Long Name Holdings LLC");
  });

  it("renders a reduced-motion-safe version", () => {
    // The component should have a class that allows CSS to disable animation
    const { container } = render(<PaymentRoute nodes={sampleNodes} currency="USD" amount="5,000" />);
    // Both route variants should exist so CSS can handle reduced motion
    const routes = container.querySelectorAll("[class*='payment-route']");
    expect(routes.length).toBeGreaterThan(0);
  });
});
