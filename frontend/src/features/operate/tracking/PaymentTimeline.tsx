import type { TrackPaymentResponse } from "../../../api/schemas";
import { StatusChip } from "../../../design-system/StatusChip";
import type { CheckStatus } from "../../../design-system/types";
import "../tracking/TrackingPage.css";

interface PaymentTimelineProps {
  payment: TrackPaymentResponse;
}

function eventStatus(s: string): CheckStatus {
  if (s === "credited" || s === "accepted") return "passed";
  if (s === "in_transit" || s === "pending") return "needs_attention";
  if (s === "rejected" || s === "returned") return "failed";
  return "unavailable";
}

export function PaymentTimeline({ payment }: PaymentTimelineProps) {
  return (
    <div className="tracking-result">
      <div className="tracking-result__header">
        <StatusChip status={payment.is_terminal ? "passed" : "needs_attention"} />
        <span className="mono">{payment.uetr}</span>
        {payment.is_terminal && <span>Terminal: {payment.current_status}</span>}
      </div>
      {payment.sent_amount && payment.final_amount && (
        <div className="tracking-result__amounts">
          <span>Sent: <span className="mono">{payment.sent_amount}</span></span>
          <span>Final: <span className="mono">{payment.final_amount}</span></span>
          {payment.total_fees !== null && payment.total_fees !== undefined && (
            <span>Fees: <span className="mono">{payment.total_fees.toFixed(2)}</span></span>
          )}
        </div>
      )}
      <ol className="tracking-timeline" aria-label="Payment timeline">
        {payment.timeline.map((event, i) => (
          <li key={i} className={`tracking-timeline__item tracking-timeline__item--${event.status}`}>
            <div className="tracking-timeline__dot" />
            <div className="tracking-timeline__content">
              <div className="tracking-timeline__row">
                <StatusChip status={eventStatus(event.status)} />
                <span className="tracking-timeline__time mono">{event.timestamp}</span>
              </div>
              <div className="tracking-timeline__bank">{event.bank_name ?? event.bank_bic}</div>
              {event.message && <div className="tracking-timeline__message">{event.message}</div>}
              {event.amount && <div className="tracking-timeline__amount mono">{event.amount}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
