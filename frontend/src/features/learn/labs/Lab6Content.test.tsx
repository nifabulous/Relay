import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab6Content } from "./Lab6Content";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <Lab6Content moduleId="lab-6" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

const TRACK_FIXTURE = {
  uetr: "11111111-2222-3333-4444-555555555555",
  current_status: "CREDITED",
  is_terminal: true,
  event_count: 3,
  sent_amount: "5000.00",
  final_amount: "4970.00",
  total_fees: 30,
  last_updated: "2026-01-01T12:00:00",
  timeline: [
    { status: "INITIATED", bank_bic: "BOFAUS3N", bank_name: "Bank of America", hop: 0, timestamp: "2026-01-01T10:00:00", message: "Payment initiated", amount: undefined, currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
    { status: "FORWARDED", bank_bic: "CITIUS33", bank_name: "Citibank", hop: 1, timestamp: "2026-01-01T10:30:00", message: "Forwarded", amount: "4990.00", currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
    { status: "CREDITED", bank_bic: "GTBINGLAXXX", bank_name: "GTBank", hop: 2, timestamp: "2026-01-01T11:00:00", message: "Credited", amount: "4970.00", currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
  ],
  disclaimer: "SIMULATION",
};

describe("Lab6Content", () => {
  it("renders the concept explanation about UETR tracking", () => {
    renderLab();
    expect(screen.getByRole("heading", { name: /UETR|tracking/i })).toBeVisible();
  });

  it("renders the payment creation form", () => {
    renderLab();
    expect(screen.getByRole("button", { name: /create.*track/i })).toBeVisible();
  });

  it("emits create-payment checkpoint when payment is created", async () => {
    server.use(
      http.post("/api/track/create", () => HttpResponse.json(TRACK_FIXTURE)),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /create.*track/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("create-payment");
    });
  });

  it("renders the UETR after creation", async () => {
    server.use(
      http.post("/api/track/create", () => HttpResponse.json(TRACK_FIXTURE)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /create.*track/i }));

    await waitFor(() => {
      expect(screen.getByText("11111111-2222-3333-4444-555555555555")).toBeVisible();
    });
  });

  it("renders the timeline after creation", async () => {
    server.use(
      http.post("/api/track/create", () => HttpResponse.json(TRACK_FIXTURE)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /create.*track/i }));

    await waitFor(() => {
      expect(screen.getByText("Bank of America")).toBeVisible();
      expect(screen.getByText("GTBank")).toBeVisible();
    });
  });

  it("shows the fee-reading exercise after creation", async () => {
    server.use(
      http.post("/api/track/create", () => HttpResponse.json(TRACK_FIXTURE)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /create.*track/i }));

    await waitFor(() => {
      expect(screen.getByText(/What was deducted/i)).toBeVisible();
    });
  });

  it("emits read-fee-deduction checkpoint when fee answer is correct", async () => {
    server.use(
      http.post("/api/track/create", () => HttpResponse.json(TRACK_FIXTURE)),
    );

    const { user, onCheckpoint } = renderLab();
    // Create the payment first
    await user.click(screen.getByRole("button", { name: /create.*track/i }));
    await waitFor(() => {
      expect(screen.getByText("11111111-2222-3333-4444-555555555555")).toBeVisible();
    });

    // Answer the fee exercise — total_fees is 30
    await user.type(screen.getByLabelText(/deduction.*answer/i), "30");
    const checkButtons = screen.getAllByRole("button", { name: /check answer/i });
    await user.click(checkButtons[checkButtons.length - 1]);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("read-fee-deduction");
    });
  });

  it("shows simulation label persistently", () => {
    renderLab();
    expect(screen.getByText(/simulation.*not a real payment/i)).toBeVisible();
  });
});
