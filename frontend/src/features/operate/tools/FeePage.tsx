import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../../api/client";
import { FeeSimulateResponseSchema } from "../../../api/schemas";
import type { FeeSimulateResponse } from "../../../api/schemas";
import type { ApiProblem } from "../../../api/problem";
import { Button } from "../../../design-system/Button";
import "./OperateTools.css";
import { recordActivity } from "../../../lib/persistence/storage";

const ILLUSTRATIVE_CHAIN = [
  { bic: "CITIUS33XXX", name: "Citibank" },
  { bic: "BOFAUS3NXXX", name: "Bank of America" },
] as const;

export function FeePage() {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [chargeCode, setChargeCode] = useState("SHA");
  const [result, setResult] = useState<FeeSimulateResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<FeeSimulateResponse>(
        "/api/fees/simulate",
        {
          amount: Number(amount),
          currency,
          charge_code: chargeCode,
          intermediary_bics: ILLUSTRATIVE_CHAIN.map((hop) => hop.bic),
          intermediary_names: ILLUSTRATIVE_CHAIN.map((hop) => hop.name),
        },
        FeeSimulateResponseSchema,
      ),
    onSuccess: (data) => { setResult(data); recordActivity({ type: "tool", label: "Fee simulator", at: Date.now() }); },
  });

  const error = mutation.error as ApiProblem | null;

  return (
    <div className="tool-page">
      <h1>Fee Calculator</h1>
      <p className="measure">Simulate fee deduction across intermediary hops for OUR, SHA, or BEN charge codes.</p>
      <p className="tool-sim-label">Uses an illustrative two-hop chain: Citibank → Bank of America.</p>

      <form
        className="tool-form"
        onSubmit={(e) => { e.preventDefault(); if (amount) mutation.mutate(); }}
      >
        <div className="tool-form__field">
          <label htmlFor="fee-amount">Amount</label>
          <input id="fee-amount" type="number" step="0.01" min="0" className="mono"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="1000.00" aria-label="Amount" />
        </div>
        <div className="tool-form__field">
          <label htmlFor="fee-currency">Currency</label>
          <input id="fee-currency" type="text" className="mono" maxLength={3}
            value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            aria-label="Currency" />
        </div>
        <div className="tool-form__field">
          <label htmlFor="fee-charge">Charge code</label>
          <select id="fee-charge" value={chargeCode}
            onChange={(e) => setChargeCode(e.target.value)} aria-label="Charge code">
            <option value="OUR">OUR — sender pays all fees</option>
            <option value="SHA">SHA — fees shared</option>
            <option value="BEN">BEN — beneficiary pays all fees</option>
          </select>
        </div>
        <Button type="submit" variant="primary" isLoading={mutation.isPending}>Simulate fees</Button>
      </form>

      {error && (
        <div className="tool-error" role="alert">
          <strong>{error.title}</strong>
          {error.retryable && <Button variant="secondary" onClick={() => mutation.mutate()}>Retry</Button>}
        </div>
      )}

      {result && (
        <div className="tool-result">
          <h2>Results</h2>
          <div className="fee-summary">
            <div className="fee-summary__item">
              <span className="fee-summary__label">Sent</span>
              <span className="fee-summary__value mono">{result.currency} {result.sent_amount.toFixed(2)}</span>
            </div>
            <div className="fee-summary__item">
              <span className="fee-summary__label">Received</span>
              <span className="fee-summary__value mono">{result.currency} {result.received_amount.toFixed(2)}</span>
            </div>
            <div className="fee-summary__item fee-summary__item--warn">
              <span className="fee-summary__label">Total fees</span>
              <span className="fee-summary__value mono">{result.currency} {result.total_fees.toFixed(2)}</span>
            </div>
          </div>
          {result.hops.length > 0 && (
            <table className="fee-hops">
              <thead>
                <tr>
                  <th>Bank</th>
                  <th>BIC</th>
                  <th>Fee</th>
                  <th>Amount in</th>
                  <th>Amount out</th>
                  <th>Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {result.hops.map((hop, i) => (
                  <tr key={i}>
                    <td>{String(hop.bank_name ?? hop.bic)}</td>
                    <td className="mono">{hop.bic}</td>
                    <td className="mono">{result.currency} {hop.fee.toFixed(2)}</td>
                    <td className="mono">{hop.amount_in.toFixed(2)}</td>
                    <td className="mono">{hop.amount_out.toFixed(2)}</td>
                    <td className="mono">{hop.cumulative_fees.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="tool-sim-label"><strong>Simulation — not a real payment.</strong></p>
        </div>
      )}
    </div>
  );
}
