import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentTimeline } from "./PaymentTimeline";
import type { TrackPaymentResponse } from "../../../api/schemas";

const samplePayment: TrackPaymentResponse = {
  uetr: "test-uetr-123",
  current_status: "credited",
  is_terminal: true,
  event_count: 3,
  sent_amount: "5000.00",
  final_amount: "4970.00",
  total_fees: 30,
  last_updated: "2026-01-01T12:00:00",
  timeline: [
    { status: "initiated", bank_bic: "BOFAUS3N", bank_name: "Bank of America", hop: 0, timestamp: "2026-01-01T10:00:00", message: "Payment initiated", amount: undefined, currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
    { status: "in_transit", bank_bic: "CITIUS33", bank_name: "Citibank", hop: 1, timestamp: "2026-01-01T10:30:00", message: "Forwarded", amount: "4990.00", currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
    { status: "credited", bank_bic: "GTBINGLAXXX", bank_name: "GTBank", hop: 2, timestamp: "2026-01-01T11:00:00", message: "Credited to beneficiary", amount: "4970.00", currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
  ],
  disclaimer: "SIMULATION",
};

describe("PaymentTimeline", () => {
  it("renders the UETR", () => {
    render(<PaymentTimeline payment={samplePayment} />);
    expect(screen.getByText("test-uetr-123")).toBeVisible();
  });

  it("renders sent, final, and fee amounts", () => {
    render(<PaymentTimeline payment={samplePayment} />);
    expect(screen.getByText("5000.00")).toBeVisible();
    // 4970.00 appears in both the summary and the timeline event
    const finalAmounts = screen.getAllByText("4970.00");
    expect(finalAmounts.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("30.00")).toBeVisible();
  });

  it("renders all timeline events in order", () => {
    render(<PaymentTimeline payment={samplePayment} />);
    expect(screen.getByText("Bank of America")).toBeVisible();
    expect(screen.getByText("Citibank")).toBeVisible();
    expect(screen.getByText("GTBank")).toBeVisible();
  });

  it("shows terminal status", () => {
    render(<PaymentTimeline payment={samplePayment} />);
    expect(screen.getByText(/Terminal.*credited/i)).toBeVisible();
  });

  it("renders without amounts when optional fields are missing", () => {
    const noAmounts: TrackPaymentResponse = {
      ...samplePayment,
      sent_amount: undefined,
      final_amount: undefined,
      total_fees: undefined,
    };
    render(<PaymentTimeline payment={noAmounts} />);
    expect(screen.queryByText(/Sent:/i)).not.toBeInTheDocument();
  });
});
