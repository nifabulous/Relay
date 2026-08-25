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
    <div className="tool-page fee-page">
      <nav className="tool-breadcrumb" aria-label="Breadcrumb">
        <span>Operate</span>
        <span aria-hidden="true">/</span>
        <span>Tools</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Fees</span>
      </nav>

      <header className="tool-page__header">
        <h1>Fee calculator</h1>
        <p className="measure">Estimate the total cost of a cross-border transfer.</p>
      </header>

      <div className="fee-page__layout">
        <section className="fee-page__card fee-page__form-card" aria-labelledby="fee-form-heading">
          <h2 id="fee-form-heading">Transfer details</h2>
          <p className="fee-page__supporting-copy">
            Compare how intermediary charges affect the amount received.
          </p>

          <form
            className="tool-form"
            onSubmit={(e) => { e.preventDefault(); if (amount) mutation.mutate(); }}
          >
            <div className="tool-form__field">
              <label htmlFor="fee-currency">Currency</label>
              <input id="fee-currency" type="text" className="mono" maxLength={3}
                value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                aria-label="Currency" />
            </div>
            <div className="tool-form__field">
              <label htmlFor="fee-amount">Amount</label>
              <input id="fee-amount" type="number" step="0.01" min="0" className="mono"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="1000.00" aria-label="Amount" />
            </div>
            <div className="tool-form__field">
              <label htmlFor="fee-charge">Charge code</label>
              <select id="fee-charge" value={chargeCode}
                onChange={(e) => setChargeCode(e.target.value)} aria-label="Charge code">
                <option value="OUR">OUR — sender pays all fees</option>
                <option value="SHA">SHA — fees shared</option>
                <option value="BEN">BEN — beneficiary pays all fees</option>
              </select>
              <span className="fee-page__field-help">Choose who absorbs intermediary fees.</span>
            </div>
            <Button className="fee-page__submit" type="submit" variant="primary" isLoading={mutation.isPending}>
              Simulate fees
            </Button>
          </form>
          <p className="fee-page__chain-note">
            Illustrative two-hop chain: Citibank <span aria-hidden="true">→</span> Bank of America.
          </p>
        </section>

        <section className="tool-result fee-page__card fee-page__result-card" aria-labelledby="fee-breakdown-heading" aria-live="polite">
          <h2 id="fee-breakdown-heading">Fee breakdown</h2>
          {result ? (
            <>
              <div className="fee-summary" aria-label="Fee summary">
                <div className="fee-summary__item">
                  <span className="fee-summary__label">Sent</span>
                  <span className="fee-summary__value mono">{result.currency} {result.sent_amount.toFixed(2)}</span>
                </div>
                <div className="fee-summary__item">
                  <span className="fee-summary__label">Received</span>
                  <span className="fee-summary__value mono">{result.currency} {result.received_amount.toFixed(2)}</span>
                </div>
                <div className="fee-summary__item fee-summary__item--total">
                  <span className="fee-summary__label">Total fees</span>
                  <span className="fee-summary__value mono">{result.currency} {result.total_fees.toFixed(2)}</span>
                </div>
              </div>
              {result.hops.length > 0 && (
                <div className="fee-page__hops">
                  <h3>Intermediary charges</h3>
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
                </div>
              )}
              <p className="fee-page__estimate-note">Estimate only — actual fees vary by institution.</p>
              <p className="tool-sim-label"><strong>Simulation — not a real payment.</strong></p>
            </>
          ) : (
            <p className="fee-page__empty" role="status">
              Enter transfer details and run the simulation to see an estimated breakdown.
            </p>
          )}
        </section>
      </div>

      {error && (
        <div className="tool-error" role="alert">
          <strong>{error.title}</strong>
          {error.retryable && <Button variant="secondary" onClick={() => mutation.mutate()}>Retry</Button>}
        </div>
      )}
    </div>
  );
}
