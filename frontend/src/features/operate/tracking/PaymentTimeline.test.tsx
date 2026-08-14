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

// IN_PROGRESS was the one emitted status the mapping test did not cover.
//
// It is deliberately mapped to "passed". Verified against the real backend: a
// multi-hop credited payment emits
//   INITIATED, ACCEPTED, IN_PROGRESS, FORWARDED, ACCEPTED, IN_PROGRESS,
//   FORWARDED, ACCEPTED, CREDITED
// so IN_PROGRESS only ever appears mid-chain, immediately followed by
// FORWARDED — a hop that was processing and then completed. generate_timeline
// writes the whole chain in one call, so current_status is always terminal and
// IN_PROGRESS is never the latest event. Marking it "needs attention" would
// flag completed hops on every multi-hop payment in the app.
describe("PaymentTimeline IN_PROGRESS hops", () => {
  const multiHop: TrackPaymentResponse = {
    ...samplePayment,
    current_status: "CREDITED",
    is_terminal: true,
    event_count: 5,
    timeline: [
      { status: "INITIATED", bank_bic: "GTBINGLA", bank_name: "GTBank", hop: 0, timestamp: "2026-01-01T10:00:00", message: undefined, amount: undefined, currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
      { status: "ACCEPTED", bank_bic: "DEUTDEFF", bank_name: "Deutsche", hop: 1, timestamp: "2026-01-01T10:01:00", message: undefined, amount: undefined, currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
      { status: "IN_PROGRESS", bank_bic: "DEUTDEFF", bank_name: "Deutsche", hop: 1, timestamp: "2026-01-01T10:02:00", message: undefined, amount: undefined, currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
      { status: "FORWARDED", bank_bic: "DEUTDEFF", bank_name: "Deutsche", hop: 1, timestamp: "2026-01-01T10:03:00", message: undefined, amount: undefined, currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
      { status: "CREDITED", bank_bic: "CITIUS33", bank_name: "Citibank", hop: 2, timestamp: "2026-01-01T10:04:00", message: undefined, amount: undefined, currency: undefined, instructing_bic: undefined, instructed_bic: undefined },
    ],
  };

  it("treats a forwarded IN_PROGRESS hop as completed, not unavailable", () => {
    render(<PaymentTimeline payment={multiHop} />);
    const list = screen.getByLabelText("Payment timeline");
    expect(list.querySelectorAll(".tracking-timeline__event--unavailable").length).toBe(0);
    expect(list.querySelectorAll(".tracking-timeline__event--failed").length).toBe(0);
  });

  it("still reports the payment as passed overall", () => {
    const { container } = render(<PaymentTimeline payment={multiHop} />);
    // Scoped to the header: the per-hop chips also read "Passed", so an
    // unscoped query matches several nodes.
    const header = container.querySelector(".tracking-result__header")!;
    expect(header.querySelector(".status-chip--success")).toHaveAttribute(
      "aria-label",
      "Passed",
    );
  });
});

// ─── Scheduled payments (plan task 4.2) ─────────────────────────────────────
//
// Task 1.x made prepared payments reveal progressively: a freshly prepared
// payment responds with a single INITIATED event, `is_terminal: false`, and no
// final amounts — the rest of the chain is hidden until due timestamps arrive
// or TrackingPage's skip/complete controls ask the backend to reveal events.
// Before 4.1 the backend returned a complete terminal chain in one call, so a
// non-terminal current status never reached this component; scheduled reveal
// makes it the common case for prepared payments.
//
// These tests pin the shared component's language for that state (AC 4.2.1,
// 4.2.2): the partial chain keeps the current visual language — every revealed
// hop is "Passed", the overall verdict is the warning "Needs attention" (a
// payment still moving, not an error), and nothing is labelled failed or
// unavailable until a terminal rejection/return actually appears. The
// component itself renders no pacing controls: those belong to TrackingPage
// (task 4.1), so a learner lab that embeds the timeline never inherits buttons
// whose parents supply no handlers.
const INITIATED_EVENT = {
  status: "INITIATED",
  bank_bic: "BOFAUS3N",
  bank_name: "Bank of America",
  hop: 0,
  timestamp: "2026-08-13T09:00:00",
  message: "Payment initiated",
  amount: undefined,
  currency: undefined,
  instructing_bic: undefined,
  instructed_bic: undefined,
};

const scheduledPayment: TrackPaymentResponse = {
  uetr: "scheduled-uetr-789",
  current_status: "INITIATED",
  is_terminal: false,
  event_count: 1,
  sent_amount: "5000.00",
  final_amount: undefined,
  total_fees: undefined,
  last_updated: "2026-08-13T09:00:00",
  timeline: [INITIATED_EVENT],
  disclaimer: "SIMULATION",
};

// Every status a scheduled payment can currently wear without being finished.
// REJECTED / RETURNED / CREDITED are terminal and covered above. Each of these
// must keep mapping to the current visual language (AC 4.2.1): revealed hops
// are Passed and the overall verdict stays a non-terminal warning, never a
// failure label.
const SCHEDULED_STATUSES = ["INITIATED", "ACCEPTED", "IN_PROGRESS", "FORWARDED"] as const;

describe("PaymentTimeline scheduled payments", () => {
  it("renders a partial timeline without a terminal label", () => {
    render(<PaymentTimeline payment={scheduledPayment} />);
    expect(screen.getByText("Bank of America")).toBeVisible();
    expect(screen.queryByText(/Terminal/i)).toBeNull();
  });

  it("does not label a still-scheduled payment failed or unavailable", () => {
    const { container } = render(<PaymentTimeline payment={scheduledPayment} />);
    const header = container.querySelector(".tracking-result__header")!;
    // Distinguish "still scheduled" from "failed": nothing is a failure until
    // a terminal rejection/return is actually revealed (AC 4.2.2).
    expect(header.querySelector('[aria-label="Failed"]')).toBeNull();
    expect(header.querySelector('[aria-label="Unavailable"]')).toBeNull();
    expect(header.querySelector('[aria-label="Passed"]')).toBeNull();
    // The current visual language for a non-terminal payment is kept (AC 4.2.1).
    expect(header.querySelector('[aria-label="Needs attention"]')).not.toBeNull();
  });

  it("maps every still-scheduled status to the current visual language", () => {
    for (const status of SCHEDULED_STATUSES) {
      const payment: TrackPaymentResponse = {
        ...scheduledPayment,
        current_status: status,
        timeline: [{ ...INITIATED_EVENT, status }],
      };
      const { container, unmount } = render(<PaymentTimeline payment={payment} />);
      const timeline = container.querySelector(".tracking-timeline")!;
      expect(timeline.querySelectorAll('[aria-label="Passed"]').length).toBe(1);
      expect(timeline.querySelectorAll('[aria-label="Failed"]').length).toBe(0);
      expect(timeline.querySelectorAll('[aria-label="Unavailable"]').length).toBe(0);
      const header = container.querySelector(".tracking-result__header")!;
      expect(header.querySelector('[aria-label="Needs attention"]')).not.toBeNull();
      unmount();
    }
  });

  it("renders no pacing controls of its own", () => {
    const { container } = render(<PaymentTimeline payment={scheduledPayment} />);
    // "Advance one event" / "Complete simulation" live on TrackingPage (4.1);
    // the shared timeline never renders buttons a learner embedding it has not
    // supplied handlers for (AC 4.2.3).
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
