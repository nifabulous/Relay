import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { CadRailsContent } from "./CadRailsContent";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <CadRailsContent moduleId="cad-rails" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

const CAD_SCHEMES_FIXTURE = {
  currency: "CAD",
  country: "Canada",
  countryCode: "CA",
  iban: false,
  localIdentifier: "Bank (3) + Transit (5) + Account",
  schemes: [
    {
      name: "Lynx",
      speed: "Real-time (RTGS)",
      limit: "No limit",
      cost: "$5-25",
      useCase: "High-value",
      operator: "Bank of Canada",
      settlement: "Lynx RTGS",
      processingWindows: null,
      roadmap: ["Supports the incoming RTR"],
    },
    {
      name: "EFT",
      speed: "1-2 business days",
      limit: "No limit",
      cost: "$0.50-2",
      useCase: "Payroll",
      operator: "Payments Canada",
      processingWindows: ["05:00 ET", "14:15 ET", "19:00 ET"],
    },
  ],
  verifiedAsof: "2026-07",
};

describe("CadRailsContent", () => {
  it("renders the intro and deep-dive headings", () => {
    renderLab();
    expect(screen.getByRole("heading", { name: /Canada's three-layer stack/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Lynx: wholesale finality/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /EFT through ACSS/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /The Real-Time Rail/i })).toBeVisible();
  });

  it("loads CAD rail detail and fires cad-rail-detail", async () => {
    server.use(http.get("/api/schemes", () => HttpResponse.json(CAD_SCHEMES_FIXTURE)));

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: "CAD" }));

    await waitFor(() => {
      expect(screen.getAllByText(/05:00 ET/).length).toBeGreaterThanOrEqual(1);
    });
    expect(onCheckpoint).toHaveBeenCalledWith("cad-rail-detail");
  });

  it("shows an error when scheme data fails to load", async () => {
    server.use(http.get("/api/schemes", () => HttpResponse.json({ detail: "boom" }, { status: 500 })));

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: "CAD" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load/i);
    });
  });

  it("recommends Interac for a small urgent amount and fires lynx-vs-eft", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /choose the rail/i }));

    const result = screen.getByTestId("cad-rail-result");
    expect(result).toHaveTextContent("Interac e-Transfer");
    expect(onCheckpoint).toHaveBeenCalledWith("lynx-vs-eft");
  });

  it("recommends Lynx for a large urgent amount", async () => {
    const { user } = renderLab();

    const input = screen.getByLabelText(/amount in CAD/i);
    await user.clear(input);
    await user.type(input, "3200000");
    await user.click(screen.getByRole("button", { name: /choose the rail/i }));

    expect(screen.getByTestId("cad-rail-result")).toHaveTextContent("Lynx");
  });

  it("recommends EFT when the payment can wait", async () => {
    const { user } = renderLab();

    const input = screen.getByLabelText(/amount in CAD/i);
    await user.clear(input);
    await user.type(input, "3200000");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /choose the rail/i }));

    expect(screen.getByTestId("cad-rail-result")).toHaveTextContent("EFT");
  });

  it("fires rtr-roadmap when the RTR question is answered correctly", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(
      screen.getByRole("button", { name: /real-time clearing AND settlement/i }),
    );

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("rtr-roadmap");
    });
  });

  it("does not fire rtr-roadmap for a wrong answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /rebrand of the EFT system/i }));
    expect(onCheckpoint).not.toHaveBeenCalledWith("rtr-roadmap");
  });

  it("fires cad-rail-chooser only after both scenarios are correct", async () => {
    const { user, onCheckpoint } = renderLab();

    // Scenario 1: Lynx for the acquisition payment
    const lynxButtons = screen.getAllByRole("button", { name: /^Lynx$/ });
    await user.click(lynxButtons[0]);
    expect(onCheckpoint).not.toHaveBeenCalledWith("cad-rail-chooser");

    // Scenario 2: EFT for the vendor run
    const eftButtons = screen.getAllByRole("button", { name: /^EFT$/ });
    await user.click(eftButtons[1]);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("cad-rail-chooser");
    });
  });
});
