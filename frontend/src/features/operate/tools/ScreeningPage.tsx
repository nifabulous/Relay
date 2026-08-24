import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../../api/client";
import { ScreenResponseSchema } from "../../../api/schemas";
import type { ScreenResponse } from "../../../api/schemas";
import type { ApiProblem } from "../../../api/problem";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import "./OperateTools.css";
import { recordActivity } from "../../../lib/persistence/storage";

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
    onSuccess: (data) => { setResult(data); recordActivity({ type: "tool", label: "Sanctions screening", at: Date.now() }); },
  });

  const error = mutation.error as ApiProblem | null;

  const recStatus = (rec: string) =>
    rec === "CLEAR" ? "passed" as const :
    rec === "REVIEW" ? "needs_attention" as const :
    "failed" as const;

  const parties = result ? [result.sender, result.beneficiary] : [];
  const matchedParties = parties.filter((party) => party.hit).length;
  const matchedHops = result?.hops.filter((hop) => hop.decision !== "CLEAR").length ?? 0;
  const checksRun = result ? parties.length + result.hops.length : null;

  const recommendationLabel = (recommendation: string) =>
    recommendation === "CLEAR" ? "Clear" :
    recommendation === "REVIEW" ? "Review required" :
    "Blocked";

  const partySummary = (party: ScreenResponse["sender"]) => {
    if (party.matched_entry) {
      const confidence = party.score == null ? "Possible watchlist match" : `${(party.score * 100).toFixed(0)}% confidence`;
      return `${party.matched_entry} · ${confidence}`;
    }
    return "No match found";
  };

  return (
    <div className="tool-page screening-page">
      <nav className="tool-breadcrumb" aria-label="Breadcrumb">
        <span>Operate</span>
        <span aria-hidden="true">/</span>
        <span>Tools</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Screening</span>
      </nav>

      <header className="tool-page__header">
        <h1>Sanctions screening</h1>
        <p className="measure">Check payment parties against watchlists before release.</p>
      </header>

      <div className="screening-page__layout">
        <section className="screening-page__card screening-page__form-card" aria-labelledby="screen-form-heading">
          <h2 id="screen-form-heading">Screen payment parties</h2>
          <p className="screening-page__supporting-copy">Use fictional training data to understand how a compliance check is evaluated.</p>
          <form className="tool-form" onSubmit={(e) => { e.preventDefault(); if (senderName && beneficiaryName) mutation.mutate(); }}>
            <div className="screening-page__fields">
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
            </div>
            <fieldset className="screening-page__watchlists">
              <legend>Watchlists checked</legend>
              <div className="screening-page__watchlist-chips" aria-label="Watchlists checked">
                {['OFAC', 'UN', 'EU', 'HMT'].map((watchlist) => <span className="screening-page__watchlist" key={watchlist}>{watchlist}</span>)}
              </div>
            </fieldset>
            <Button className="screening-page__submit" type="submit" variant="primary" isLoading={mutation.isPending}>Run screen</Button>
          </form>
        </section>

        <aside className="screening-page__card screening-page__stats-card" aria-labelledby="screen-stats-heading">
          <h2 id="screen-stats-heading">This screen</h2>
          <dl className="screening-page__stats">
            <div><dt>Checks run</dt><dd>{checksRun ?? "—"}</dd></div>
            <div><dt>Potential matches</dt><dd>{result ? matchedParties + matchedHops : "—"}</dd></div>
            <div><dt>Route hops</dt><dd>{result ? result.hops.length : "—"}</dd></div>
          </dl>
          <p className="screening-page__stats-note">Results are illustrative and never authorize a real payment.</p>
        </aside>
      </div>

      {error && (
        <div className="tool-error" role="alert">
          <strong>{error.title}</strong>
          {error.retryable && <Button variant="secondary" onClick={() => mutation.mutate()}>Retry</Button>}
        </div>
      )}

      {result && (
        <section className="tool-result screening-page__result-card" aria-labelledby="screen-results-heading" aria-live="polite">
          <h2 id="screen-results-heading">Screening results</h2>
          <div className="screen-result__overall">
            <StatusChip status={recStatus(result.overall_recommendation)} />
            <span>{recommendationLabel(result.overall_recommendation)}</span>
            {result.blocked && <span className="screen-result__blocked">Blocked at hop {result.blocked_at_hop}</span>}
          </div>
          <div className="screening-page__rows" role="list" aria-label="Screened parties">
            {parties.map((party) => (
              <div className="screening-page__row" role="listitem" key={party.party}>
                <div className="screening-page__row-main">
                  <span className="screening-page__row-party">{party.party === "sender" ? "Sender" : "Beneficiary"}</span>
                  <strong>{party.name}</strong>
                </div>
                <span className="screening-page__row-summary">{partySummary(party)}</span>
                <StatusChip status={recStatus(party.recommendation)} />
              </div>
            ))}
            {result.hops.map((hop) => (
              <div className="screening-page__row screening-page__row--hop" role="listitem" key={`hop-${hop.hop}`}>
                <div className="screening-page__row-main">
                  <span className="screening-page__row-party">Hop {hop.hop}</span>
                  <strong>{String(hop.bank_name || hop.bic)}</strong>
                </div>
                <span className="screening-page__row-summary">{hop.decision} · {hop.action} · {hop.delay_hours}h delay</span>
                <StatusChip status={hop.decision === "CLEAR" ? "passed" : hop.decision === "POSSIBLE_HIT" ? "needs_attention" : "failed"} />
              </div>
            ))}
          </div>
          <p className="tool-sim-label"><strong>Simulation — not a real payment.</strong></p>
        </section>
      )}
    </div>
  );
}
