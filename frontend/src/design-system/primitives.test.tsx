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

  it("uses role=status for assistive technology", () => {
    render(<StatusChip status="passed" />);
    expect(screen.getByRole("status")).toHaveTextContent("Passed");
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
