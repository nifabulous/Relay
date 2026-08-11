import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentTimeline } from "./PaymentTimeline";
import type { TrackPaymentResponse } from "../../../api/schemas";

// Statuses here are the UPPERCASE values app/services/tracking.py:37-43 actually
// emits: INITIATED, ACCEPTED, IN_PROGRESS, FORWARDED, CREDITED, REJECTED,
// RETURNED. These fixtures previously used invented lowercase values
// ("in_transit", "pending") that the backend never produces, which is why the
// suite stayed green over a component that mapped every real status to
// "Unavailable".
const samplePayment: TrackPaymentResponse = {
  uetr: "test-uetr-123",
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
    { status: "CREDITED", bank_bic: "GTBINGLAXXX", bank_name: "GTBank", hop: 2, timestamp: "2026-01-01T11:00:00", message: "Credited to beneficiary", amount: "4970.00", currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
  ],
  disclaimer: "SIMULATION",
};

const rejectedPayment: TrackPaymentResponse = {
  ...samplePayment,
  uetr: "rejected-uetr-456",
  current_status: "REJECTED",
  is_terminal: true,
  timeline: [
    { status: "INITIATED", bank_bic: "BOFAUS3N", bank_name: "Bank of America", hop: 0, timestamp: "2026-01-01T10:00:00", message: "Payment initiated", amount: undefined, currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
    { status: "ACCEPTED", bank_bic: "CITIUS33", bank_name: "Citibank", hop: 1, timestamp: "2026-01-01T10:30:00", message: "Accepted by Citibank for processing", amount: "4990.00", currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
    { status: "REJECTED", bank_bic: "CITIUS33", bank_name: "Citibank", hop: 2, timestamp: "2026-01-01T10:32:00", message: "Rejected at compliance screening", amount: "4990.00", currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
  ],
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

  it("maps the backend's uppercase statuses to real chips, never Unavailable", () => {
    render(<PaymentTimeline payment={samplePayment} />);
    const timeline = screen.getByRole("list", { name: /payment timeline/i });
    expect(timeline.querySelectorAll('[aria-label="Unavailable"]').length).toBe(0);
    // Three hops that each completed successfully.
    expect(timeline.querySelectorAll('[aria-label="Passed"]').length).toBe(3);
  });

  it("shows a rejected payment as failed, not passed", () => {
    render(<PaymentTimeline payment={rejectedPayment} />);
    // The header chip is the at-a-glance verdict. Driving it from is_terminal
    // alone reported every terminal payment as a success, rejections included.
    const header = screen.getByText(/Terminal/i).closest(".tracking-result__header");
    expect(header?.querySelector('[aria-label="Failed"]')).not.toBeNull();
    expect(header?.querySelector('[aria-label="Passed"]')).toBeNull();
  });

  it("marks the rejecting hop as failed and the earlier hops as passed", () => {
    render(<PaymentTimeline payment={rejectedPayment} />);
    const timeline = screen.getByRole("list", { name: /payment timeline/i });
    expect(timeline.querySelectorAll('[aria-label="Failed"]').length).toBe(1);
    expect(timeline.querySelectorAll('[aria-label="Passed"]').length).toBe(2);
  });

  it("emits lowercase status modifier classes so the CSS rules match", () => {
    render(<PaymentTimeline payment={rejectedPayment} />);
    const timeline = screen.getByRole("list", { name: /payment timeline/i });
    // TrackingPage.css targets .tracking-timeline__item--rejected etc. in
    // lowercase; an uppercase class name silently styles nothing.
    expect(timeline.querySelector(".tracking-timeline__item--rejected")).not.toBeNull();
    expect(timeline.querySelector(".tracking-timeline__item--REJECTED")).toBeNull();
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
