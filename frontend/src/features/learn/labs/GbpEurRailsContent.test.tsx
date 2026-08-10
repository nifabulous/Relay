import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { GbpEurRailsContent } from "./GbpEurRailsContent";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <GbpEurRailsContent moduleId="gbp-eur-rails" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

const GBP_SCHEMES_FIXTURE = {
  currency: "GBP",
  country: "United Kingdom",
  countryCode: "GB",
  iban: true,
  localIdentifier: "Sort Code",
  schemes: [
    { name: "CHAPS", speed: "Same-day", limit: "No limit", cost: "£25", useCase: "High-value", operator: "BoE" },
    { name: "Bacs Direct Credit", speed: "3 days", limit: "No limit", cost: "£0.50", useCase: "Payroll", operator: "Pay.UK" },
  ],
};

const EUR_SCHEMES_FIXTURE = {
  currency: "EUR",
  country: "Eurozone (20 countries)",
  countryCode: "EU",
  iban: true,
  localIdentifier: "IBAN",
  schemes: [
    {
      name: "SEPA Instant (SCT Inst)",
      speed: "Instant (<10s)",
      limit: "Bank-set",
      cost: "Free",
      useCase: "Instant retail",
      operator: "EPC",
      howItWorks: ["Sent 24/7", "Settled via TIPS"],
      roadmap: ["IPR send mandate Oct 2025"],
    },
  ],
};

describe("GbpEurRailsContent", () => {
  it("renders the intro and all rail deep-dive headings", () => {
    renderLab();
    expect(screen.getByRole("heading", { name: /one currency, three rails/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /CHAPS: the sterling RTGS/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Bacs: the three-day workhorse/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Faster Payments: instant, but capped/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /one currency, one payment area/i })).toBeVisible();
  });

  it("loads GBP rail detail and fires gbp-rail-detail", async () => {
    server.use(http.get("/api/schemes", () => HttpResponse.json(GBP_SCHEMES_FIXTURE)));

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: "GBP" }));

    await waitFor(() => {
      expect(screen.getAllByText(/Bacs Direct Credit/).length).toBeGreaterThanOrEqual(1);
    });
    expect(onCheckpoint).toHaveBeenCalledWith("gbp-rail-detail");
    expect(onCheckpoint).not.toHaveBeenCalledWith("eur-rail-detail");
  });

  it("loads EUR rail detail and fires eur-rail-detail", async () => {
    server.use(http.get("/api/schemes", () => HttpResponse.json(EUR_SCHEMES_FIXTURE)));

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: "EUR" }));

    await waitFor(() => {
      expect(screen.getAllByText(/SEPA Instant \(SCT Inst\)/).length).toBeGreaterThanOrEqual(1);
    });
    expect(onCheckpoint).toHaveBeenCalledWith("eur-rail-detail");
  });

  it("shows an error when scheme data fails to load", async () => {
    server.use(http.get("/api/schemes", () => HttpResponse.json({ detail: "boom" }, { status: 500 })));

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: "GBP" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load/i);
    });
  });

  it("runs the Bacs cycle simulator and fires bacs-cycle", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /Monday 09:00/ }));

    const result = screen.getByTestId("bacs-cycle-result");
    expect(result).toHaveTextContent("2026-07-20");
    expect(result).toHaveTextContent("2026-07-22");
    expect(result).toHaveTextContent(/caught the input window/i);
    expect(onCheckpoint).toHaveBeenCalledWith("bacs-cycle");
  });

  it("shows the missed-cutoff path after 22:30", async () => {
    const { user } = renderLab();

    await user.click(screen.getByRole("button", { name: /Monday 23:00/ }));

    const result = screen.getByTestId("bacs-cycle-result");
    expect(result).toHaveTextContent(/missed the input window/i);
    expect(result).toHaveTextContent("2026-07-23");
  });

  it("recommends SCT Inst inside the bank limit and fires sct-inst-limit", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /choose the rail/i }));

    const result = screen.getByTestId("eur-rail-result");
    expect(result).toHaveTextContent("SCT Inst");
    expect(onCheckpoint).toHaveBeenCalledWith("sct-inst-limit");
  });

  it("recommends TARGET2 for an urgent payment above the limit", async () => {
    const { user } = renderLab();

    const input = screen.getByLabelText(/amount in EUR/i);
    await user.clear(input);
    await user.type(input, "250000");
    await user.click(screen.getByRole("button", { name: /choose the rail/i }));

    expect(screen.getByTestId("eur-rail-result")).toHaveTextContent("TARGET2");
  });

  it("recommends SCT for a non-urgent payment above the limit", async () => {
    const { user } = renderLab();

    const input = screen.getByLabelText(/amount in EUR/i);
    await user.clear(input);
    await user.type(input, "250000");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /choose the rail/i }));

    const result = screen.getByTestId("eur-rail-result");
    expect(result).toHaveTextContent(/Recommended rail: /);
    expect(result).not.toHaveTextContent("TARGET2");
    expect(result).not.toHaveTextContent("SCT Inst");
  });

  it("fires gbp-rail-chooser only after all three GBP scenarios are correct", async () => {
    const { user, onCheckpoint } = renderLab();

    const bacsButtons = screen.getAllByRole("button", { name: /^Bacs Direct Credit$/ });
    await user.click(bacsButtons[0]);
    expect(onCheckpoint).not.toHaveBeenCalledWith("gbp-rail-chooser");

    // Second scenario: CHAPS is correct for the £2.4M completion
    const chapsButtons = screen.getAllByRole("button", { name: /^CHAPS$/ });
    await user.click(chapsButtons[1]);
    expect(onCheckpoint).not.toHaveBeenCalledWith("gbp-rail-chooser");

    // Third scenario: Faster Payments on a Sunday night
    const fpsButtons = screen.getAllByRole("button", { name: /^Faster Payments$/ });
    await user.click(fpsButtons[2]);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("gbp-rail-chooser");
    });
  });

  it("fires eur-rail-chooser only after both EUR scenarios are correct", async () => {
    const { user, onCheckpoint } = renderLab();

    const instButtons = screen.getAllByRole("button", { name: /^SEPA Instant \(SCT Inst\)$/ });
    await user.click(instButtons[0]);
    expect(onCheckpoint).not.toHaveBeenCalledWith("eur-rail-chooser");

    const t2Buttons = screen.getAllByRole("button", { name: /^TARGET2$/ });
    await user.click(t2Buttons[1]);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("eur-rail-chooser");
    });
  });
});
