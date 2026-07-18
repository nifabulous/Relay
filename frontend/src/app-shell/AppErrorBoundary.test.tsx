import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppErrorBoundary } from "./AppErrorBoundary";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// Component that throws during render
function ThrowingComponent({ error }: { error: Error }): never {
  throw error;
}

// Safe component
function SafeComponent() {
  return <div>Safe content</div>;
}

// Silence console.error for expected throws
afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppErrorBoundary", () => {
  it("renders children when no error", () => {
    renderWithRouter(
      <AppErrorBoundary>
        <SafeComponent />
      </AppErrorBoundary>,
    );
    expect(screen.getByText("Safe content")).toBeVisible();
  });

  it("shows error UI with Reload and Return to Overview actions on render error", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithRouter(
      <AppErrorBoundary>
        <ThrowingComponent error={new Error("Test crash")} />
      </AppErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /reload/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /return to overview/i })).toBeVisible();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("shows the error message to help debugging", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithRouter(
      <AppErrorBoundary>
        <ThrowingComponent error={new Error("Specific crash message")} />
      </AppErrorBoundary>,
    );
    expect(screen.getByText("Specific crash message")).toBeVisible();
  });
});
