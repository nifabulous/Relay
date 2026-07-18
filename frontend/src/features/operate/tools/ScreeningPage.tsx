import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../../api/client";
import { ScreenResponseSchema } from "../../../api/schemas";
import type { ScreenResponse } from "../../../api/schemas";
import type { ApiProblem } from "../../../api/problem";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import "./OperateTools.css";

export function ScreeningPage() {
  const [senderName, setSenderName] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [result, setResult] = useState<ScreenResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<ScreenResponse>(
        "/api/screen",
        { sender_name: senderName, beneficiary_name: beneficiaryName },
        ScreenResponseSchema,
      ),
    onSuccess: setResult,
  });

  const error = mutation.error as ApiProblem | null;

  const recStatus = (rec: string) =>
    rec === "CLEAR" ? "passed" as const :
    rec === "REVIEW" ? "needs_attention" as const :
    "failed" as const;

  return (
    <div className="tool-page">
      <h1>Sanctions Screening</h1>
      <p className="measure">Screen payment parties against a fictional watchlist (training data only).</p>

      <form className="tool-form" onSubmit={(e) => { e.preventDefault(); if (senderName && beneficiaryName) mutation.mutate(); }}>
        <div className="tool-form__field">
          <label htmlFor="screen-sender">Sender name</label>
          <input id="screen-sender" type="text" maxLength={200}
            value={senderName} onChange={(e) => setSenderName(e.target.value)}
            placeholder="Sender name" aria-label="Sender name" />
        </div>
        <div className="tool-form__field">
          <label htmlFor="screen-beneficiary">Beneficiary name</label>
          <input id="screen-beneficiary" type="text" maxLength={200}
            value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)}
            placeholder="Beneficiary name" aria-label="Beneficiary name" />
        </div>
        <Button type="submit" variant="primary" isLoading={mutation.isPending}>Screen parties</Button>
      </form>

      {error && (
        <div className="tool-error" role="alert">
          <strong>{error.title}</strong>
          {error.retryable && <Button variant="secondary" onClick={() => mutation.mutate()}>Retry</Button>}
        </div>
      )}

      {result && (
        <div className="tool-result">
          <h2>Screening results</h2>
          <div className="screen-result__overall">
            <StatusChip status={recStatus(result.overall_recommendation)} />
            {result.blocked && <span className="screen-result__blocked">Blocked at hop {result.blocked_at_hop}</span>}
          </div>
          <table className="screen-table">
            <thead><tr><th>Party</th><th>Name</th><th>Score</th><th>Result</th></tr></thead>
            <tbody>
              <tr>
                <td>Sender</td><td>{result.sender.name}</td>
                <td className="mono">{((result.sender.score ?? 0) * 100).toFixed(0)}%</td>
                <td><StatusChip status={recStatus(result.sender.recommendation)} /></td>
              </tr>
              <tr>
                <td>Beneficiary</td><td>{result.beneficiary.name}</td>
                <td className="mono">{((result.beneficiary.score ?? 0) * 100).toFixed(0)}%</td>
                <td><StatusChip status={recStatus(result.beneficiary.recommendation)} /></td>
              </tr>
            </tbody>
          </table>
          {result.hops.length > 0 && (
            <table className="screen-table">
              <thead><tr><th>Hop</th><th>Bank</th><th>Decision</th><th>Action</th><th>Delay</th></tr></thead>
              <tbody>
                {result.hops.map((hop) => (
                  <tr key={hop.hop}>
                    <td className="mono">{hop.hop}</td>
                    <td>{String(hop.bank_name ?? hop.bic)}</td>
                    <td>{hop.decision}</td>
                    <td>{hop.action}</td>
                    <td className="mono">{hop.delay_hours}h</td>
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
