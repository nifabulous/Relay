import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinesRoute } from "./LinesRoute";
import type { RouteStop } from "./routeStops";

const stops: RouteStop[] = [
  { role: "origin", name: "Harborline Bank", detail: "Lagos", status: "passed" },
  { role: "correspondent", name: "Meridian Clearing", detail: "London", status: "needs_attention" },
  { role: "beneficiary", name: "Northstar Bank", detail: "UK", status: "not_checked" },
];

describe("LinesRoute", () => {
  it("renders the stops in order as the stepper", () => {
    render(<LinesRoute stops={stops} summary="GBP route" ariaLabel="Payment route" />);
    const steps = within(screen.getByRole("list", { name: "Payment route" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Harborline Bank"), expect.stringContaining("Northstar Bank")]),
    );
    expect(steps).toHaveLength(3);
  });

  it("states each status as text, not colour alone", () => {
    render(<LinesRoute stops={stops} summary="GBP route" ariaLabel="Payment route" />);
    expect(screen.getByText("passed")).toBeInTheDocument();
    expect(screen.getByText("needs attention")).toBeInTheDocument();
    expect(screen.getByText("not checked")).toBeInTheDocument();
  });

  it("exposes the summary for screen readers", () => {
    render(<LinesRoute stops={stops} summary="GBP route from Harborline Bank" ariaLabel="Payment route" />);
    expect(screen.getByText("GBP route from Harborline Bank", { selector: ".sr" })).toBeInTheDocument();
  });

  it("never shows a not-checked stop as passed", () => {
    render(<LinesRoute stops={stops} summary="s" ariaLabel="Payment route" />);
    const beneficiary = screen.getByText("Northstar Bank").closest("li")!;
    expect(beneficiary.textContent).not.toContain("passed");
  });
});
