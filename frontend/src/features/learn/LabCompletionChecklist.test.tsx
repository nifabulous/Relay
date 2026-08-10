import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LabCompletionChecklist } from "./LabCompletionChecklist";

describe("LabCompletionChecklist", () => {
  it("explains the required actions and shows progress", () => {
    render(
      <LabCompletionChecklist
        required={["validate-original", "break-checksum", "find-valid-iban"]}
        completed={new Set(["validate-original"])}
        isComplete={false}
      />,
    );

    expect(screen.getByRole("heading", { name: /complete this lab/i })).toBeVisible();
    expect(screen.getByText("1 of 3 complete")).toBeVisible();
    expect(screen.getByText("Check the valid IBAN")).toHaveAttribute("data-state", "complete");
    expect(screen.getByText("Change a digit and check the broken IBAN")).toHaveAttribute(
      "data-state",
      "pending",
    );
    expect(screen.getByText("Choose the valid IBAN")).toHaveAttribute("data-state", "pending");
  });

  it("shows a clear completion state once the lab is complete", () => {
    render(
      <LabCompletionChecklist
        required={["validate-original", "break-checksum"]}
        completed={new Set()}
        isComplete
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/complete/i);
    expect(screen.getByText("2 of 2 complete")).toBeVisible();
  });
});
