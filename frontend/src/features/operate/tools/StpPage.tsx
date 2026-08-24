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
import { recordActivity } from "../../../lib/persistence/storage";

type ChecklistStatus = "valid" | "attention" | "missing" | "invalid";

interface ChecklistRow {
  field: string;
  fieldName: string;
  detail: string;
  status: ChecklistStatus;
  statusLabel: string;
}

function statusForFinding(severity: string): ChecklistStatus {
  return severity.toLowerCase() === "error" ? "invalid" : "attention";
}

function statusLabel(status: ChecklistStatus): string {
  return status === "valid" ? "Valid" : status === "missing" ? "Missing" : status === "invalid" ? "Invalid" : "Review";
}

function buildChecklist(result: STPCheckResponse): ChecklistRow[] {
  const findingsByField = new Map<string, STPCheckResponse["findings"]>();
  result.findings.forEach((finding) => {
    const existing = findingsByField.get(finding.field) ?? [];
    existing.push(finding);
    findingsByField.set(finding.field, existing);
  });

  const rows: ChecklistRow[] = result.field_summary.flatMap((raw) => {
    const field = typeof raw.field === "string" ? raw.field : "";
    if (!field) return [];
    const fieldName = typeof raw.field_name === "string" && raw.field_name ? raw.field_name : `Field ${field}`;
    const present = raw.present === true;
    const valid = raw.valid === true;
    const findings = findingsByField.get(field) ?? [];
    const finding = findings[0];
    const status = finding ? statusForFinding(finding.severity) : valid ? "valid" : present ? "invalid" : "missing";
    return [{
      field,
      fieldName,
      detail: finding?.message ?? (valid ? "Field present and well-formed" : present ? "Field needs correction" : "Not provided"),
      status,
      statusLabel: statusLabel(status),
    }];
  });

  // Preserve findings attached to compound fields (for example 50K/59) even
  // when the backend does not include them in the per-field summary.
  result.findings.forEach((finding) => {
    if (rows.some((row) => row.field === finding.field)) return;
    rows.push({
      field: finding.field,
      fieldName: finding.field_name || `Field ${finding.field}`,
      detail: finding.message,
      status: statusForFinding(finding.severity),
      statusLabel: statusLabel(statusForFinding(finding.severity)),
    });
  });

  return rows;
}

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
    onSuccess: (data) => { setResult(data); recordActivity({ type: "tool", label: "MT103 STP check", at: Date.now() }); },
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
  const checklist = result ? buildChecklist(result) : [];
  const validCount = checklist.filter((row) => row.status === "valid").length;
  const score = checklist.length > 0 ? Math.round((validCount / checklist.length) * 100) : result?.stp_passes ? 100 : 0;
  const tips = result?.findings
    .map((finding) => finding.repair || finding.message)
    .filter((tip): tip is string => Boolean(tip)) ?? [];

  const verdictStatus = (verdict: string) =>
    verdict === "CLEAN" ? "passed" as const :
    verdict === "REPAIRABLE" ? "needs_attention" as const :
    "failed" as const;

  return (
    <div className="tool-page stp-page">
      <nav className="tool-breadcrumb" aria-label="Breadcrumb">
        <span>Operate</span>
        <span aria-hidden="true">/</span>
        <span>Tools</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">STP checker</span>
      </nav>

      <header className="tool-page__header">
        <h1>STP checker</h1>
        <p className="measure">Validate payment fields for straight-through processing.</p>
      </header>

      <form className="tool-form stp-page__form" onSubmit={(e) => { e.preventDefault(); if (txRef && valueDate && amount) mutation.mutate(); }}>
        <div className="stp-page__form-heading">
          <h2>Message fields</h2>
          <p>Use the MT103 values you want to validate.</p>
        </div>
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
        <div className="stp-page__form-actions">
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>Check STP compliance</Button>
          <Button type="button" variant="secondary"
          isLoading={translateMutation.isPending}
          onClick={() => { if (txRef && valueDate && amount) translateMutation.mutate(); }}>
            View as pacs.008
          </Button>
        </div>
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
        <div className="stp-page__result-layout">
          <section className="stp-page__check-card" aria-labelledby="stp-check-heading" aria-live="polite">
            <div className="stp-page__result-heading">
              <div>
                <h2 id="stp-check-heading">Field validation</h2>
                <p>{result.verdict === "CLEAN" ? "Ready for straight-through processing." : "Review the fields below before release."}</p>
              </div>
              <StatusChip status={verdictStatus(result.verdict)} />
            </div>
            <div className="stp-checklist" role="list" aria-label="STP field validation checklist">
              {checklist.map((row) => (
                <div className={`stp-checklist__row stp-checklist__row--${row.status}`} role="listitem" key={row.field}>
                  <span className="stp-checklist__marker" aria-hidden="true">{row.status === "valid" ? "✓" : row.status === "attention" || row.status === "missing" ? "!" : "×"}</span>
                  <div className="stp-checklist__copy">
                    <strong>{row.fieldName}</strong>
                    <span className="stp-checklist__separator" aria-hidden="true">—</span>
                    <span>{row.detail}</span>
                  </div>
                  <span className="stp-checklist__pill"><span aria-hidden="true">{row.status === "valid" ? "✓" : row.status === "attention" || row.status === "missing" ? "!" : "×"}</span>{row.statusLabel}</span>
                </div>
              ))}
            </div>
            <div className="stp-score" aria-label={`STP score ${score}%`}>
              <strong>STP score</strong>
              <span className="stp-score__track" aria-hidden="true"><span style={{ width: `${score}%` }} /></span>
              <strong className="stp-score__value">{score}%</strong>
            </div>
            <p className="tool-sim-label"><strong>{result.disclaimer || "Simulation — not a real payment."}</strong></p>
          </section>

          <aside className="stp-page__tips-card" aria-labelledby="stp-tips-heading">
            <div>
              <h2 id="stp-tips-heading">{tips.length > 0 ? "Fix before release" : "Next step"}</h2>
              {tips.length > 0 ? (
                <ul className="stp-tips">
                  {tips.map((tip, index) => <li key={`${tip}-${index}`}>{tip}</li>)}
                </ul>
              ) : (
                <p className="stp-tips__empty">No findings returned. Re-validate after any message edits.</p>
              )}
            </div>
            <Button className="stp-page__revalidate" type="button" variant="primary" isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
              Re-validate
            </Button>
          </aside>
        </div>
      )}

      {translation && <Pacs008View result={translation} />}
    </div>
  );
}
