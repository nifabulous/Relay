import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
    const steps = within(screen.getByRole("figure", { name: "Payment route" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Harborline Bank"), expect.stringContaining("Northstar Bank")]),
    );
    expect(steps).toHaveLength(3);
  });

  it("names the route once: on the figure, not again on its list", () => {
    const { container } = render(<LinesRoute stops={stops} summary="s" ariaLabel="Payment route" />);
    expect(container.querySelectorAll('[aria-label="Payment route"]')).toHaveLength(1);
    expect(screen.getByRole("figure", { name: "Payment route" })).toBeInTheDocument();
    // role="list" stays: Safari drops list semantics when list-style is none.
    expect(within(screen.getByRole("figure")).getByRole("list")).toHaveAttribute("role", "list");
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

  it("gives each status an aria-hidden icon before the status text", () => {
    render(<LinesRoute stops={stops} summary="s" ariaLabel="Payment route" />);
    const rows = document.querySelectorAll(".lines-route__status");
    expect(rows).toHaveLength(3);
    rows.forEach((row) => {
      const icon = row.querySelector(".lines-route__icon");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(row.firstElementChild).toBe(icon);
      expect(row.textContent?.trim().length).toBeGreaterThan(0);
    });
  });
});

describe("LinesRoute summary visually hidden", () => {
  it("defines a .lines-route .sr rule that hides the summary visually", () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "LinesRoute.css"), "utf8");
    const match = css.match(/\.lines-route \.sr\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    const body = match![1];
    for (const decl of [
      "position: absolute",
      "width: 1px",
      "height: 1px",
      "overflow: hidden",
      "clip: rect(0 0 0 0)",
      "white-space: nowrap",
    ]) {
      expect(body).toContain(decl);
    }
  });
});
