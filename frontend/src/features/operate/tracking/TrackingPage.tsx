import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../../../api/client";
import { apiKeys } from "../../../api/queryKeys";
import { TrackPaymentResponseSchema } from "../../../api/schemas";
import type { TrackPaymentResponse } from "../../../api/schemas";
import type { ApiProblem } from "../../../api/problem";
import type { AsyncStatus } from "../../../design-system/types";
import { Button } from "../../../design-system/Button";
import { AsyncRegion } from "../../../design-system/AsyncRegion";
import { StatusChip } from "../../../design-system/StatusChip";
import "./TrackingPage.css";

export function TrackingPage() {
  const [searchParams] = useSearchParams();
  const initialUetr = searchParams.get("uetr") ?? "";
  const [uetr, setUetr] = useState(initialUetr);
  const [submittedUetr, setSubmittedUetr] = useState<string | null>(initialUetr || null);

  const query = useQuery({
    queryKey: submittedUetr ? apiKeys.track(submittedUetr) : ["track", "idle"],
    queryFn: () =>
      apiRequest<TrackPaymentResponse>(
        `/api/track/${encodeURIComponent(submittedUetr!)}`,
        undefined,
        TrackPaymentResponseSchema,
      ),
    enabled: submittedUetr !== null,
  });

  let status: AsyncStatus = "idle";
  if (submittedUetr === null) status = "idle";
  else if (query.isLoading) status = "loading";
  else if (query.isError) status = "error";
  else if (query.data) status = "success";

  const error = query.error as ApiProblem | null;
  const data = query.data;

  const eventStatus = (s: string): "passed" | "needs_attention" | "failed" | "unavailable" => {
    if (s === "credited" || s === "accepted") return "passed";
    if (s === "in_transit" || s === "pending") return "needs_attention";
    if (s === "rejected" || s === "returned") return "failed";
    return "unavailable";
  };

  return (
    <div className="tracking-page">
      <h1>Payment Tracking</h1>
      <p className="measure">Look up a simulated payment by its UETR (Unique End-to-End Transaction Reference).</p>

      <div className="tracking-page__sim-label" role="note">
        <strong>Simulation — not a real payment.</strong> All tracking events are illustrative.
      </div>

      <form className="tool-form" onSubmit={(e) => { e.preventDefault(); if (uetr.trim()) setSubmittedUetr(uetr.trim()); }}>
        <div className="tool-form__field">
          <label htmlFor="track-uetr">UETR</label>
          <input id="track-uetr" type="text" className="mono"
            value={uetr} onChange={(e) => setUetr(e.target.value)}
            placeholder="36-character UUID" aria-label="UETR" />
        </div>
        <Button type="submit" variant="primary">Track payment</Button>
      </form>

      {submittedUetr && (
        <AsyncRegion
          status={status}
          loadingLabel="Loading payment timeline"
          emptyMessage={`No tracked payment found for UETR: ${submittedUetr}`}
          error={error}
          onRetry={() => query.refetch()}
        >
          {data && (
            <div className="tracking-result">
              <div className="tracking-result__header">
                <StatusChip status={data.is_terminal ? "passed" : "needs_attention"} />
                <span className="mono">{data.uetr}</span>
                {data.is_terminal && <span>Terminal: {data.current_status}</span>}
              </div>
              {data.sent_amount && data.final_amount && (
                <div className="tracking-result__amounts">
                  <span>Sent: <span className="mono">{data.sent_amount}</span></span>
                  <span>Final: <span className="mono">{data.final_amount}</span></span>
                  {data.total_fees !== null && data.total_fees !== undefined && (
                    <span>Fees: <span className="mono">{data.total_fees.toFixed(2)}</span></span>
                  )}
                </div>
              )}
              <ol className="tracking-timeline" aria-label="Payment timeline">
                {data.timeline.map((event, i) => (
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
          )}
        </AsyncRegion>
      )}
    </div>
  );
}
