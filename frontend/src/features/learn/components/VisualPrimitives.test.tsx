import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Decompose } from "./Decompose";
import { ScoreBar } from "./ScoreBar";
import { StepIndicator } from "./StepIndicator";

describe("Decompose", () => {
  it("renders segments with values and labels", () => {
    render(
      <Decompose segments={[
        { value: "GB", tone: "accent", label: "Country" },
        { value: "29", tone: "warning", label: "Checksum" },
        { value: "NWBK", tone: "info", label: "Bank" },
      ]} />,
    );
    expect(screen.getByText("GB")).toBeVisible();
    expect(screen.getByText("29")).toBeVisible();
    expect(screen.getByText("NWBK")).toBeVisible();
    expect(screen.getByText("Country")).toBeVisible();
    expect(screen.getByText("Checksum")).toBeVisible();
    expect(screen.getByText("Bank")).toBeVisible();
  });

  it("renders as a semantic dl with associated terms", () => {
    const { container } = render(
      <Decompose segments={[{ value: "GB", tone: "accent", label: "Country" }]} />,
    );
    expect(container.querySelector("dl")).toBeInTheDocument();
    expect(container.querySelector("dd")).toBeInTheDocument();
    expect(container.querySelector("dt")).toBeInTheDocument();
  });
});

describe("ScoreBar", () => {
  it("renders the percentage and label", () => {
    render(<ScoreBar score={0.85} label="Match score" />);
    expect(screen.getByText("Match score")).toBeVisible();
    expect(screen.getByText("85%")).toBeVisible();
  });

  it("includes a hidden meter element for screen readers", () => {
    const { container } = render(<ScoreBar score={0.5} />);
    const meter = container.querySelector("meter");
    expect(meter).toBeInTheDocument();
    expect(meter).toHaveAttribute("min", "0");
    expect(meter).toHaveAttribute("max", "1");
    expect(meter).toHaveAttribute("value", "0.5");
  });

  it("clamps values outside 0-1 range", () => {
    const { container } = render(<ScoreBar score={1.5} />);
    const meter = container.querySelector("meter");
    expect(meter).toHaveAttribute("value", "1");
  });
});

describe("StepIndicator", () => {
  it("renders all steps with numbers", () => {
    render(
      <StepIndicator
        steps={[
          { id: "a", label: "Validate" },
          { id: "b", label: "Verify" },
          { id: "c", label: "Route" },
        ]}
        currentStep={1}
        completedSteps={new Set([0])}
      />,
    );
    expect(screen.getByText("Validate")).toBeVisible();
    expect(screen.getByText("Verify")).toBeVisible();
    expect(screen.getByText("Route")).toBeVisible();
  });

  it("marks the current step with aria-current=step", () => {
    render(
      <StepIndicator
        steps={[{ id: "a", label: "Step 1" }, { id: "b", label: "Step 2" }]}
        currentStep={1}
        completedSteps={new Set()}
      />,
    );
    const step2 = screen.getByText("Step 2").closest("li");
    expect(step2).toHaveAttribute("aria-current", "step");
  });

  it("shows checkmark for completed steps", () => {
    render(
      <StepIndicator
        steps={[{ id: "a", label: "Done" }, { id: "b", label: "Current" }]}
        currentStep={1}
        completedSteps={new Set([0])}
      />,
    );
    expect(screen.getByText("✓")).toBeVisible();
  });
});
