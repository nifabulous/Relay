import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiPost, apiRequest } from "../../../api/client";
import { apiKeys } from "../../../api/queryKeys";
import { TrackPaymentResponseSchema } from "../../../api/schemas";
import type { TrackPaymentResponse } from "../../../api/schemas";
import type { ApiProblem } from "../../../api/problem";
import type { AsyncStatus } from "../../../design-system/types";
import { Button } from "../../../design-system/Button";
import { AsyncRegion } from "../../../design-system/AsyncRegion";
import { PaymentTimeline } from "./PaymentTimeline";
import { TutorLauncher } from "../../tutor/TutorLauncher";
import { buildTrackingContext } from "../../tutor/tutorContext";
import "./TrackingPage.css";
import "../tools/OperateTools.css";
import { recordActivity } from "../../../lib/persistence/storage";

/**
 * Scheduled pacing poll: the backend reveals timeline events on a schedule,
 * so a non-terminal payment is worth re-checking. A terminal payment is
 * finished — every subsequent response is identical — so polling stops the
 * moment `is_terminal` arrives.
 */
const POLL_INTERVAL_MS = 4500;

interface MutationNotice {
  kind: "success" | "error";
  message: string;
  uetr: string;
}

export function TrackingPage() {
  const [searchParams] = useSearchParams();
  const paramUetr = searchParams.get("uetr") ?? "";
  const [uetr, setUetr] = useState(paramUetr);
  const [submittedUetr, setSubmittedUetr] = useState<string | null>(paramUetr || null);
  const [notice, setNotice] = useState<MutationNotice | null>(null);

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
    setNotice(null);
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
    refetchInterval: (q) =>
      submittedUetr !== null && q.state.data && !q.state.data.is_terminal
        ? POLL_INTERVAL_MS
        : false,
  });

  const queryClient = useQueryClient();

  // Time-based reveal metadata is a backend concern: the skip/complete
  // controls only ask the backend to reveal events and then re-read the
  // timeline, so the page never fabricates events client-side.
  const skipMutation = useMutation<TrackPaymentResponse, ApiProblem, string>({
    mutationFn: (uetr: string) =>
      apiPost<TrackPaymentResponse>(
        `/api/track/${encodeURIComponent(uetr)}/skip`,
        {},
        TrackPaymentResponseSchema,
      ),
    onMutate: () => setNotice(null),
    onSuccess: (_data, uetr) => {
      setNotice({ kind: "success", message: "Timeline advanced by one event.", uetr });
      void queryClient.invalidateQueries({ queryKey: apiKeys.track(uetr) });
    },
    onError: (error, uetr) => {
      setNotice({ kind: "error", message: `${error.title}: ${error.detail}`, uetr });
    },
  });

  const completeMutation = useMutation<TrackPaymentResponse, ApiProblem, string>({
    mutationFn: (uetr: string) =>
      apiPost<TrackPaymentResponse>(
        `/api/track/${encodeURIComponent(uetr)}/complete`,
        {},
        TrackPaymentResponseSchema,
      ),
    onMutate: () => setNotice(null),
    onSuccess: (_data, uetr) => {
      setNotice({ kind: "success", message: "Simulation complete — all events revealed.", uetr });
      void queryClient.invalidateQueries({ queryKey: apiKeys.track(uetr) });
    },
    onError: (error, uetr) => {
      setNotice({ kind: "error", message: `${error.title}: ${error.detail}`, uetr });
    },
  });

  // While either mutation is in flight both controls are inert, so a double
  // click cannot double-advance the simulation.
  const controlsBusy = skipMutation.isPending || completeMutation.isPending;

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

      <form className="tool-form" onSubmit={(e) => { e.preventDefault(); if (uetr.trim()) { setNotice(null); setSubmittedUetr(uetr.trim()); } }}>
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
            <>
              <PaymentTimeline payment={data} />
              {/* Explains the timeline the learner can SEE. Deliberately not the
                  UETR: it identifies one specific transaction, the tutor has no
                  reason to know which payment produced this shape, and the MVP
                  performs no live lookup that would need it. Event names only —
                  no raw response, no hidden events. */}
              <TutorLauncher
                context={buildTrackingContext({
                  status: data.current_status,
                  eventNames: data.timeline.map((entry) => entry.status),
                  currency: data.sent_amount?.split(" ").pop() ?? "",
                  amount: data.sent_amount ?? "",
                })}
                label="Explain this timeline"
              />
              {!data.is_terminal && (
                <div className="tracking-page__controls" role="group" aria-label="Simulation pacing controls">
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={skipMutation.isPending}
                    disabled={controlsBusy}
                    onClick={() => skipMutation.mutate(submittedUetr!)}
                  >
                    Advance one event
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={completeMutation.isPending}
                    disabled={controlsBusy}
                    onClick={() => completeMutation.mutate(submittedUetr!)}
                  >
                    Complete simulation
                  </Button>
                </div>
              )}
              {notice && notice.uetr === submittedUetr && (
                <div
                  className={
                    notice.kind === "error"
                      ? "tracking-page__notice tracking-page__notice--error"
                      : "tracking-page__notice tracking-page__notice--success"
                  }
                  role={notice.kind === "error" ? "alert" : "status"}
                >
                  {notice.message}
                </div>
              )}
            </>
          )}
        </AsyncRegion>
      )}
    </div>
  );
}
