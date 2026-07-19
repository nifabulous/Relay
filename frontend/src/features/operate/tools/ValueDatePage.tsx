import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../../api/client";
import { ValueDateResponseSchema } from "../../../api/schemas";
import type { ValueDateResponse } from "../../../api/schemas";
import type { ApiProblem } from "../../../api/problem";
import { Button } from "../../../design-system/Button";
import "./OperateTools.css";
import { recordActivity } from "../../../lib/persistence/storage";

export function ValueDatePage() {
  const [sendDatetime, setSendDatetime] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [scheme, setScheme] = useState("");
  const [result, setResult] = useState<ValueDateResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<ValueDateResponse>(
        "/api/value-date",
        { send_datetime: sendDatetime, currency, scheme: scheme || undefined },
        ValueDateResponseSchema,
      ),
    onSuccess: (data) => { setResult(data); recordActivity({ type: "tool", label: "Value date calculator", at: Date.now() }); },
  });

  const error = mutation.error as ApiProblem | null;

  return (
    <div className="tool-page">
      <h1>Value Date Calculator</h1>
      <p className="measure">Calculate settlement value date accounting for cut-offs, holidays, and T+n rules.</p>

      <form className="tool-form" onSubmit={(e) => { e.preventDefault(); if (sendDatetime) mutation.mutate(); }}>
        <div className="tool-form__field">
          <label htmlFor="vd-datetime">Send date &amp; time</label>
          <input id="vd-datetime" type="datetime-local" className="mono"
            value={sendDatetime} onChange={(e) => setSendDatetime(e.target.value)}
            aria-label="Send date and time" />
        </div>
        <div className="tool-form__field">
          <label htmlFor="vd-currency">Currency</label>
          <input id="vd-currency" type="text" className="mono" maxLength={3}
            value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            aria-label="Currency" />
        </div>
        <div className="tool-form__field">
          <label htmlFor="vd-scheme">Scheme (optional)</label>
          <input id="vd-scheme" type="text"
            value={scheme} onChange={(e) => setScheme(e.target.value)}
            placeholder="e.g. CHAPS, SEPA Instant, spot" aria-label="Scheme" />
        </div>
        <Button type="submit" variant="primary" isLoading={mutation.isPending}>Calculate value date</Button>
      </form>

      {error && (
        <div className="tool-error" role="alert">
          <strong>{error.title}</strong>
          {error.retryable && <Button variant="secondary" onClick={() => mutation.mutate()}>Retry</Button>}
        </div>
      )}

      {result && (
        <div className="tool-result">
          <h2>Settlement result</h2>
          <dl className="value-date__grid">
            <dt>Trade date</dt><dd className="mono">{result.trade_date}</dd>
            <dt>Value date</dt><dd className="mono">{result.value_date}</dd>
            <dt>Settlement type</dt><dd>{result.settlement_type}</dd>
            <dt>Business days</dt><dd className="mono">{result.business_days}</dd>
            <dt>Cut-off (local)</dt><dd className="mono">{result.cut_off_local} {result.cut_off_tz}</dd>
            <dt>Missed cut-off</dt><dd>{result.missed_cut_off ? "Yes" : "No"}</dd>
          </dl>
          {result.skipped_holidays.length > 0 && (
            <p className="value-date__holidays">Skipped holidays: {result.skipped_holidays.join(", ")}</p>
          )}
          <p className="value-date__explanation">{result.explanation}</p>
          <p className="tool-sim-label"><strong>Simulation — not a real payment.</strong></p>
        </div>
      )}
    </div>
  );
}
