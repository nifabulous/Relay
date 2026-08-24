import type { TrackPaymentResponse } from "../../../api/schemas";
import { StatusChip } from "../../../design-system/StatusChip";
import type { CheckStatus } from "../../../design-system/types";
import "../tracking/TrackingPage.css";

interface PaymentTimelineProps {
  payment: TrackPaymentResponse;
  hideFees?: boolean;
}

// The backend emits UPPERCASE statuses (app/services/tracking.py:37-43):
// INITIATED, ACCEPTED, IN_PROGRESS, FORWARDED, CREDITED, REJECTED, RETURNED.
// This used to compare against lowercase values, and against two — "in_transit"
// and "pending" — that the backend has never produced, so every real event fell
// through to "unavailable". Normalise once, here, and match on the real set.
function normalise(s: string): string {
  return s.toLowerCase();
}

/** Per-hop verdict: did this step complete, or is this where the payment died? */
function eventStatus(s: string): CheckStatus {
  switch (normalise(s)) {
    case "initiated":
    case "accepted":
    case "in_progress":
    case "forwarded":
    case "credited":
      return "passed";
    case "rejected":
    case "returned":
      return "failed";
    default:
      return "unavailable";
  }
}

/**
 * At-a-glance verdict for the whole payment.
 *
 * This used to be `is_terminal ? "passed" : "needs_attention"`, which reported
 * every terminal payment as a success — a payment rejected at a correspondent
 * displayed a green Passed chip. Terminal says the payment stopped moving, not
 * that it arrived.
 */
function overallStatus(currentStatus: string, isTerminal: boolean): CheckStatus {
  switch (normalise(currentStatus)) {
    case "credited":
      return "passed";
    case "rejected":
    case "returned":
      return "failed";
    default:
      return isTerminal ? "unavailable" : "needs_attention";
  }
}

export function PaymentTimeline({ payment, hideFees = false }: PaymentTimelineProps) {
  const lastEventIndex = payment.timeline.length - 1;
  return (
    <div className="tracking-result">
      <div className="tracking-result__grid">
        <section className="tracking-lifecycle" aria-labelledby="tracking-lifecycle-title">
          <h2 id="tracking-lifecycle-title">Lifecycle</h2>
          <ol className="tracking-timeline" aria-label="Payment timeline">
            {payment.timeline.map((event, i) => {
              const phase = !payment.is_terminal && i === lastEventIndex ? "current" : "completed";
              return (
                <li key={i} className={`tracking-timeline__item tracking-timeline__item--${normalise(event.status)} tracking-timeline__item--${phase}`}>
                  <div className="tracking-timeline__dot" aria-hidden="true"><span /></div>
                  <div className="tracking-timeline__content">
                    <div className="tracking-timeline__row">
                      <div className="tracking-timeline__label">
                        <StatusChip status={eventStatus(event.status)} />
                        <span className="tracking-timeline__phase">{phase}</span>
                      </div>
                      <span className="tracking-timeline__time mono">{event.timestamp}</span>
                    </div>
                    <div className="tracking-timeline__bank">{event.bank_name ?? event.bank_bic}</div>
                    {event.message && <div className="tracking-timeline__message">{event.message}</div>}
                    {event.amount && <div className="tracking-timeline__amount mono">{event.amount}</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="tracking-summary" aria-labelledby="tracking-summary-title">
          <h2 id="tracking-summary-title">Payment</h2>
          <div className="tracking-result__header">
            <StatusChip status={overallStatus(payment.current_status, payment.is_terminal)} />
            <span className="mono tracking-result__uetr">{payment.uetr}</span>
            {payment.is_terminal && <span>Terminal: {payment.current_status}</span>}
          </div>
          {payment.sent_amount && payment.final_amount && (
            <dl className="tracking-result__amounts">
              <div><dt>Sent</dt><dd className="mono">{payment.sent_amount}</dd></div>
              <div><dt>Final</dt><dd className="mono">{payment.final_amount}</dd></div>
              {!hideFees && payment.total_fees !== null && payment.total_fees !== undefined && (
                <div><dt>Fees</dt><dd className="mono">{payment.total_fees.toFixed(2)}</dd></div>
              )}
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
