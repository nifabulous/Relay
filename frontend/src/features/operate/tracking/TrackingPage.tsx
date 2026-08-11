import { useState, useEffect, useRef } from "react";
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
import { PaymentTimeline } from "./PaymentTimeline";
import "./TrackingPage.css";
import "../tools/OperateTools.css";
import { recordActivity } from "../../../lib/persistence/storage";

export function TrackingPage() {
  const [searchParams] = useSearchParams();
  const paramUetr = searchParams.get("uetr") ?? "";
  const [uetr, setUetr] = useState(paramUetr);
  const [submittedUetr, setSubmittedUetr] = useState<string | null>(paramUetr || null);

  // `useState` reads its initializer only on mount, so seeding from the URL
  // there alone meant navigating ?uetr=A -> ?uetr=B on this same route reused
  // the mounted component and kept querying A: the page showed one payment's
  // timeline under another payment's URL.
  //
  // Adjusting state during render (React's documented pattern for reacting to a
  // changed input) rather than in an effect, so there is no render showing the
  // previous payment under the new URL. Gated on the param having actually
  // changed, which is what keeps a UETR the user typed by hand from being
  // overwritten while the URL still carries the old one.
  const [appliedParam, setAppliedParam] = useState(paramUetr);
  if (paramUetr !== appliedParam) {
    setAppliedParam(paramUetr);
    setUetr(paramUetr);
    setSubmittedUetr(paramUetr || null);
  }

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
  else if (query.data) { status = "success"; }

  // Record activity on successful track (once per UETR lookup)
  const recordedUetr = useRef<string | null>(null);
  useEffect(() => {
    if (query.data && query.data.uetr !== recordedUetr.current) {
      recordedUetr.current = query.data.uetr;
      recordActivity({ type: "tool", label: "Payment tracking", at: Date.now() });
    }
  }, [query.data]);

  const error = query.error as ApiProblem | null;
  const data = query.data;

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
          {data && <PaymentTimeline payment={data} />}
        </AsyncRegion>
      )}
    </div>
  );
}
