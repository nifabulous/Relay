import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../../api/client";
import { STPCheckResponseSchema, TranslateResponseSchema } from "../../../api/schemas";
import type { STPCheckResponse, TranslateResponse } from "../../../api/schemas";
import type { ApiProblem } from "../../../api/problem";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import { Pacs008View } from "./Pacs008View";
import "./OperateTools.css";

export function StpPage() {
  const [txRef, setTxRef] = useState("");
  const [valueDate, setValueDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<STPCheckResponse | null>(null);
  const [translation, setTranslation] = useState<TranslateResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<STPCheckResponse>(
        "/api/message/stp-check",
        {
          transaction_reference: txRef,
          value_date: valueDate,
          currency,
          interbank_amount: Number(amount),
        },
        STPCheckResponseSchema,
      ),
    onSuccess: setResult,
  });

  const translateMutation = useMutation({
    mutationFn: () =>
      apiPost<TranslateResponse>(
        "/api/message/translate",
        {
          transaction_reference: txRef,
          value_date: valueDate,
          currency,
          interbank_amount: Number(amount),
        },
        TranslateResponseSchema,
      ),
    onSuccess: setTranslation,
  });

  const error = mutation.error as ApiProblem | null;
  const translateError = translateMutation.error as ApiProblem | null;

  const verdictStatus = (verdict: string) =>
    verdict === "CLEAN" ? "passed" as const :
    verdict === "REPAIRABLE" ? "needs_attention" as const :
    "failed" as const;

  return (
    <div className="tool-page">
      <h1>MT103 STP Checker</h1>
      <p className="measure">Validate an MT103 message for straight-through processing across 12 rules.</p>

      <form className="tool-form" onSubmit={(e) => { e.preventDefault(); if (txRef && valueDate && amount) mutation.mutate(); }}>
        <div className="tool-form__field">
          <label htmlFor="stp-ref">Transaction reference</label>
          <input id="stp-ref" type="text" value={txRef}
            onChange={(e) => setTxRef(e.target.value)}
            placeholder="MT field 20" aria-label="Transaction reference" />
        </div>
        <div className="tool-form__field">
          <label htmlFor="stp-vdate">Value date</label>
          <input id="stp-vdate" type="text" className="mono"
            value={valueDate} onChange={(e) => setValueDate(e.target.value)}
            placeholder="YYYYMMDD or YYYY-MM-DD" aria-label="Value date" />
        </div>
        <div className="tool-form__row">
          <div className="tool-form__field">
            <label htmlFor="stp-currency">Currency</label>
            <input id="stp-currency" type="text" className="mono" maxLength={3}
              value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              aria-label="Currency" />
          </div>
          <div className="tool-form__field">
            <label htmlFor="stp-amount">Amount</label>
            <input id="stp-amount" type="number" step="0.01" min="0" className="mono"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="100000.00" aria-label="Interbank amount" />
          </div>
        </div>
        <Button type="submit" variant="primary" isLoading={mutation.isPending}>Check STP compliance</Button>
        <Button type="button" variant="secondary"
          isLoading={translateMutation.isPending}
          onClick={() => { if (txRef && valueDate && amount) translateMutation.mutate(); }}>
          View as pacs.008
        </Button>
      </form>

      {error && (
        <div className="tool-error" role="alert">
          <strong>{error.title}</strong>
          {error.retryable && <Button variant="secondary" onClick={() => mutation.mutate()}>Retry</Button>}
        </div>
      )}

      {translateError && (
        <div className="tool-error" role="alert">
          <strong>Translation failed: {translateError.title}</strong>
          {translateError.retryable && <Button variant="secondary" onClick={() => translateMutation.mutate()}>Retry</Button>}
        </div>
      )}

      {result && (
        <div className="tool-result">
          <h2>STP check result</h2>
          <div className="stp-verdict">
            <StatusChip status={verdictStatus(result.verdict)} />
            <span>Verdict: <strong>{result.verdict}</strong></span>
            <span>STP passes: <strong>{result.stp_passes ? "Yes" : "No"}</strong></span>
          </div>
          {result.findings.length > 0 && (
            <table className="stp-findings">
              <thead><tr><th>Field</th><th>Severity</th><th>Code</th><th>Message</th><th>Repair</th></tr></thead>
              <tbody>
                {result.findings.map((f, i) => (
                  <tr key={i}>
                    <td className="mono">{f.field}</td>
                    <td>{f.severity}</td>
                    <td className="mono">{f.code}</td>
                    <td>{f.message}</td>
                    <td>{f.repair ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="tool-sim-label"><strong>Simulation — not a real payment.</strong></p>
        </div>
      )}

      {translation && <Pacs008View result={translation} />}
    </div>
  );
}
