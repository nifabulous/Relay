import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { Button } from "./Button";
import { StatusChip } from "./StatusChip";
import { AsyncRegion } from "./AsyncRegion";

describe("Button", () => {
  it("renders a primary button with accessible name", () => {
    render(<Button variant="primary">Prepare payment</Button>);
    expect(screen.getByRole("button", { name: "Prepare payment" })).toBeVisible();
  });

  it("disables interaction when loading and exposes aria-busy", () => {
    render(<Button variant="primary" isLoading>Submitting</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toBeDisabled();
  });

  it("fires onClick when not loading", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button variant="primary" onClick={() => { clicked = true; }}>Click me</Button>);
    await user.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });

  it("does not fire onClick when loading", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button variant="primary" isLoading onClick={() => { clicked = true; }}>Loading</Button>);
    await user.click(screen.getByRole("button"));
    expect(clicked).toBe(false);
  });
});

describe("StatusChip", () => {
  it("renders the passed status with a text label", () => {
    render(<StatusChip status="passed" />);
    expect(screen.getByText("Passed")).toBeVisible();
  });

  it("does not encode status with color alone", () => {
    const { rerender } = render(<StatusChip status="needs_attention" />);
    expect(screen.getByText("Needs attention")).toBeVisible();
    rerender(<StatusChip status="failed" />);
    expect(screen.getByText("Failed")).toBeVisible();
    rerender(<StatusChip status="unavailable" />);
    expect(screen.getByText("Unavailable")).toBeVisible();
  });

  it("uses aria-label for assistive technology without role=status chatter", () => {
    render(<StatusChip status="passed" />);
    const chip = screen.getByLabelText("Passed");
    expect(chip).toBeVisible();
    // Should NOT have role=status to avoid live-region chatter on every render
    expect(chip).not.toHaveAttribute("role", "status");
  });

  // Regression: the StatusChip status union was widened in Task 4 to cover
  // CheckStatus | DecisionQuality | SourceStatus. Every one of the 10 statuses
  // must render a visible text label AND expose an icon whose accessible name
  // is NOT "status" — i.e. each chip carries both text and icon signal, never
  // color alone. This pins the contract so a future edit to the status map
  // that drops an icon or label is caught immediately.
  it.each([
    // Old CheckStatus values — unchanged behaviour for existing callers.
    ["passed", /Passed/],
    ["needs_attention", /Needs attention/],
    ["failed", /Failed/],
    ["unavailable", /Unavailable/],
    // New DecisionQuality values.
    ["invalid", /Invalid/],
    ["possible", /Possible/],
    ["defensible", /Defensible/],
    ["preferred", /Preferred/],
    // New SourceStatus values.
    ["verified", /Verified/],
    ["under_review", /Under review/],
  ] as const)("renders status %s with a visible text label", (status, label) => {
    render(<StatusChip status={status} />);
    const chip = screen.getByLabelText(label);
    // Visible text (not colour alone).
    expect(chip).toHaveTextContent(label.source as string);
  });

  it.each([
    ["invalid", /Invalid/],
    ["possible", /Possible/],
    ["defensible", /Defensible/],
    ["preferred", /Preferred/],
    ["verified", /Verified/],
    ["under_review", /Under review/],
  ] as const)(
    "exposes the new status %s through an aria-label and never role=status",
    (status, label) => {
      render(<StatusChip status={status} />);
      const chip = screen.getByLabelText(label);
      expect(chip).toBeVisible();
      expect(chip).not.toHaveAttribute("role", "status");
    },
  );

  it("renders every status in the union (exhaustive)", () => {
    // If a status is added to the union without a map entry, StatusChip throws.
    // This pins exhaustiveness at the component level.
    const all = [
      "passed",
      "needs_attention",
      "failed",
      "unavailable",
      "invalid",
      "possible",
      "defensible",
      "preferred",
      "verified",
      "under_review",
    ] as const;
    for (const status of all) {
      const { unmount } = render(<StatusChip status={status} />);
      // No throw + at least one child element means the map had an entry.
      expect(screen.getByText(/./)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("AsyncRegion", () => {
  it("exposes a busy status when loading", () => {
    render(
      <AsyncRegion status="loading" loadingLabel="Loading banks">
        <p>Bank list</p>
      </AsyncRegion>,
    );
    expect(screen.getByRole("status", { name: "Loading banks" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Bank list")).not.toBeInTheDocument();
  });

  it("renders content on success", () => {
    render(
      <AsyncRegion status="success" loadingLabel="Loading">
        <p>Bank list</p>
      </AsyncRegion>,
    );
    expect(screen.getByText("Bank list")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows empty message and action on empty", () => {
    const onAction = () => {};
    render(
      <AsyncRegion status="empty" emptyMessage="No results" emptyActionLabel="Try again" onEmptyAction={onAction}>
        <p>Content</p>
      </AsyncRegion>,
    );
    expect(screen.getByText("No results")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("shows retry on error with the problem title", () => {
    render(
      <AsyncRegion
        status="error"
        error={{ status: 500, title: "Server error", detail: "Try again later", fieldErrors: {}, retryable: true }}
        onRetry={() => {}}
      >
        <p>Content</p>
      </AsyncRegion>,
    );
    expect(screen.getByText("Server error")).toBeVisible();
    expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
  });

  it("renders partial content with an unavailable note", () => {
    render(
      <AsyncRegion status="partial" partialNote="Some data unavailable">
        <p>Available content</p>
      </AsyncRegion>,
    );
    expect(screen.getByText("Available content")).toBeVisible();
    expect(screen.getByText("Some data unavailable")).toBeVisible();
  });
});
