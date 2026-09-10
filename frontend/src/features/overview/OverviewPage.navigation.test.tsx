import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const destinations = [
  { link: /continue learning/i, heading: "Learn" },
  { link: /^practice/i, heading: "Daily practice" },
  { link: /^glossary/i, heading: "Glossary" },
  { link: /^search/i, heading: "Explore" },
  { link: /^directory/i, heading: "Bank directory" },
  { link: /^payment schemes/i, heading: "Payment Schemes" },
  { link: /^prepare a payment$/i, heading: "Prepare a payment" },
  { link: /^track a payment/i, heading: "Payment Tracking" },
  { link: /^payment tools/i, heading: "Tools" },
] as const;

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/app");
});

afterEach(() => {
  cleanup();
});

describe("Overview workspace navigation", () => {
  it.each(destinations)("navigates to $heading and renders the target route", async ({ link, heading }) => {
    const user = userEvent.setup();
    const { App } = await import("../../app-shell/App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("link", { name: link }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
    }, { timeout: 10_000 });
  });
});
