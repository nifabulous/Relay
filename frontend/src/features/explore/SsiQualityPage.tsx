import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { apiRequest } from "../../api/client";
import { apiKeys } from "../../api/queryKeys";
import { SSIQualityResponseSchema, type SSIQualityQueueItem, type SSIQualityResponse } from "../../api/schemas";
import type { ApiProblem } from "../../api/problem";
import { AsyncRegion } from "../../design-system/AsyncRegion";
import { RelaySelect } from "../../design-system/behavior/RelaySelect";
import { format } from "./atlas/formatters";
import "./SsiQualityPage.css";

const STALE_OPTIONS = [90, 180, 365];
const QUEUE_FILTER_OPTIONS = [
  { value: "all", label: "All review items" },
  { value: "evidence", label: "Missing evidence" },
  { value: "classification", label: "Needs classification" },
] as const;
const QUEUE_SORT_OPTIONS = [
  { value: "priority", label: "Priority" },
  { value: "source-age", label: "Oldest source" },
  { value: "beneficiary", label: "Beneficiary BIC" },
  { value: "currency", label: "Currency" },
] as const;

type QueueFilter = (typeof QUEUE_FILTER_OPTIONS)[number]["value"];
type QueueSort = (typeof QUEUE_SORT_OPTIONS)[number]["value"];

const EVIDENCE_ISSUES = new Set([
  "missing-citation",
  "future-source-date",
  "stale-source",
  "missing-source-date",
]);
const CLASSIFICATION_ISSUES = new Set([
  "published-without-verifier",
  "unverified-status",
  "terms-inferred",
  "bic-only",
  "illustrative",
]);

const ISSUE_LABELS: Record<string, string> = {
  "missing-citation": "Missing source citation",
  "future-source-date": "Source date is in the future",
  "published-without-verifier": "Published without verifier",
  "stale-source": "Source older than threshold",
  "missing-source-date": "Missing source date",
  "unverified-status": "Needs currency re-check",
  "terms-inferred": "Terms were inferred",
  "bic-only": "BIC availability only",
  illustrative: "Illustrative record",
};

function issueLabel(issue: string): string {
  return ISSUE_LABELS[issue] ?? issue.replaceAll("-", " ");
}

function percent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function queueSummary(item: SSIQualityQueueItem): string {
  return item.issues.map(issueLabel).join(" · ");
}

function matchesQueueFilter(item: SSIQualityQueueItem, filter: QueueFilter): boolean {
  if (filter === "all") return true;
  const issueSet = new Set(item.issues);
  const expected = filter === "evidence" ? EVIDENCE_ISSUES : CLASSIFICATION_ISSUES;
  return [...expected].some((issue) => issueSet.has(issue));
}

function sortQueue(items: SSIQualityQueueItem[], sort: QueueSort): SSIQualityQueueItem[] {
  if (sort === "priority") return items;
  return [...items].sort((left, right) => {
    if (sort === "source-age") {
      const leftAge = left.age_days ?? Number.POSITIVE_INFINITY;
      const rightAge = right.age_days ?? Number.POSITIVE_INFINITY;
      return rightAge - leftAge;
    }
    if (sort === "currency") return left.currency.localeCompare(right.currency);
    return left.beneficiary_bic.localeCompare(right.beneficiary_bic);
  });
}

function QualityMetrics({ data }: { data: SSIQualityResponse }) {
  const { totals } = data;
  const metrics = [
    ["Total rows", totals.total_rows, "Every loaded SSI record"],
    ["Instruction rows", totals.instruction_rows, "Rows with settlement fields"],
    ["BIC-only rows", totals.bic_only_rows, "Availability metadata, not instructions"],
    ["Stale rows", totals.stale_rows, `Older than ${data.stale_after_days} days`],
    ["Routing-ready rows", totals.routing_ready_rows, "Pass every live routing gate"],
  ] as const;
  return (
    <section className="ssi-quality__metrics" aria-label="SSI quality summary">
      {metrics.map(([label, value, description]) => (
        <div className="ssi-quality__metric" key={label}>
          <strong className="mono">{format(value)}</strong>
          <span>{label}</span>
          <small>{description}</small>
        </div>
      ))}
    </section>
  );
}

function FreshnessPanel({ data }: { data: SSIQualityResponse }) {
  const total = data.totals.total_rows;
  return (
    <section className="ssi-quality__panel" aria-labelledby="ssi-quality-freshness-title">
      <div className="ssi-quality__panel-heading">
        <div>
          <p className="ssi-quality__eyebrow">Source age</p>
          <h2 id="ssi-quality-freshness-title">Freshness</h2>
        </div>
        <span className="mono ssi-quality__panel-total">{format(total)} rows</span>
      </div>
      <div className="ssi-quality__bars">
        {data.freshness.map((bucket) => (
          <div className="ssi-quality__bar-row" key={bucket.label}>
            <div className="ssi-quality__bar-label">
              <span>{bucket.label}</span>
              <span className="mono ssi-quality__bar-value">{format(bucket.count)}</span>
            </div>
            <div className="ssi-quality__bar-track" aria-hidden="true">
              <span style={{ width: `${percent(bucket.count, total)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="ssi-quality__panel-note">
        A source is stale after {data.stale_after_days} days. Rows without a precise source date stay visible in the review queue.
      </p>
    </section>
  );
}

function CompositionPanel({ data }: { data: SSIQualityResponse }) {
  const { totals } = data;
  const rows = [
    ["Published", totals.published_rows],
    ["Unverified", totals.unverified_rows],
    ["Archived", totals.archived_rows],
    ["Illustrative", totals.illustrative_rows],
  ] as const;
  return (
    <section className="ssi-quality__panel" aria-labelledby="ssi-quality-composition-title">
      <div className="ssi-quality__panel-heading">
        <div>
          <p className="ssi-quality__eyebrow">Evidence status</p>
          <h2 id="ssi-quality-composition-title">Corpus composition</h2>
        </div>
      </div>
      <dl className="ssi-quality__definition-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="mono">{format(value)}</dd>
          </div>
        ))}
        <div><dt>Terms inferred</dt><dd className="mono">{format(totals.terms_inferred_rows)}</dd></div>
        <div><dt>Missing citations</dt><dd className="mono">{format(totals.missing_citation_rows)}</dd></div>
        <div><dt>Beneficiary banks</dt><dd className="mono">{format(totals.unique_beneficiaries)}</dd></div>
        <div><dt>Correspondents</dt><dd className="mono">{format(totals.unique_intermediaries)}</dd></div>
      </dl>
    </section>
  );
}

function ReviewQueue({ data }: { data: SSIQualityResponse }) {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [sort, setSort] = useState<QueueSort>("priority");
  const visibleQueue = useMemo(
    () => sortQueue(data.queue.filter((item) => matchesQueueFilter(item, filter)), sort),
    [data.queue, filter, sort],
  );

  return (
    <section className="ssi-quality__queue" aria-labelledby="ssi-quality-queue-title">
      <div className="ssi-quality__panel-heading">
        <div>
          <p className="ssi-quality__eyebrow">Next actions</p>
          <h2 id="ssi-quality-queue-title">Review queue</h2>
        </div>
        <span className="mono ssi-quality__panel-total">{format(visibleQueue.length)} of {format(data.queue.length)} shown</span>
      </div>
      <p className="ssi-quality__queue-intro">
        The highest-priority records needing source review or explicit classification. The list is bounded so it stays useful during expansion.
      </p>
      <div className="ssi-quality__queue-toolbar" aria-label="Review queue controls">
        <div className="ssi-quality__queue-control">
          <span className="ssi-quality__control-label">Filter</span>
          <RelaySelect
            ariaLabel="Filter review queue"
            value={filter}
            onValueChange={(value) => {
              if (QUEUE_FILTER_OPTIONS.some((option) => option.value === value)) setFilter(value as QueueFilter);
            }}
            options={QUEUE_FILTER_OPTIONS.map((option) => ({ ...option }))}
          />
        </div>
        <div className="ssi-quality__queue-control">
          <span className="ssi-quality__control-label">Sort</span>
          <RelaySelect
            ariaLabel="Sort review queue"
            value={sort}
            onValueChange={(value) => {
              if (QUEUE_SORT_OPTIONS.some((option) => option.value === value)) setSort(value as QueueSort);
            }}
            options={QUEUE_SORT_OPTIONS.map((option) => ({ ...option }))}
          />
        </div>
      </div>
      {visibleQueue.length === 0 ? (
        <p className="ssi-quality__empty" role="status">No quality actions are currently queued.</p>
      ) : (
        <div className="ssi-quality__table-wrap" role="region" aria-label="SSI review queue" tabIndex={0}>
          <table className="ssi-quality__table">
            <thead>
              <tr><th scope="col">Beneficiary</th><th scope="col">Currency</th><th scope="col">Correspondent</th><th scope="col">Source age</th><th scope="col">Action</th></tr>
            </thead>
            <tbody>
              {visibleQueue.map((item) => (
                <tr key={`${item.beneficiary_bic}-${item.currency}-${item.intermediary_bic}`}>
                  <th scope="row"><Link to={`/explore/banks/${encodeURIComponent(item.beneficiary_bic)}`} className="mono">{item.beneficiary_bic}</Link><span>{item.beneficiary_bank_name ?? "Unknown bank"}</span></th>
                  <td className="mono">{item.currency}</td>
                  <td><span className="mono">{item.intermediary_bic}</span><span>{item.intermediary_bank_name ?? "Unknown correspondent"}</span></td>
                  <td>{item.age_days == null ? "No date" : `${format(item.age_days)} days`}</td>
                  <td><ul className="ssi-quality__issue-list">{item.issues.map((issue) => <li key={issue}>{issueLabel(issue)}</li>)}</ul><span className="sr-only">{queueSummary(item)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function SsiQualityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const staleAfterDays = STALE_OPTIONS.includes(Number(searchParams.get("stale")))
    ? Number(searchParams.get("stale"))
    : 180;
  const limit = 50;
  const quality = useQuery({
    queryKey: apiKeys.ssiQuality(staleAfterDays, limit),
    queryFn: () => apiRequest<SSIQualityResponse>(`/api/ssi/quality?stale_after_days=${staleAfterDays}&limit=${limit}`, undefined, SSIQualityResponseSchema),
  });
  const data = quality.data;

  return (
    <div className="explore ssi-quality">
      <header className="explore__header ssi-quality__header">
        <p className="ssi-quality__eyebrow">Explore / Data quality</p>
        <h1>SSI data quality</h1>
        <p className="measure">Monitor evidence freshness and settlement-instruction readiness across the collected corpus.</p>
        <div className="ssi-quality__controls">
          <RelaySelect
            ariaLabel="Stale source threshold"
            value={String(staleAfterDays)}
            onValueChange={(value) => {
              const next = new URLSearchParams(searchParams);
              next.set("stale", value);
              setSearchParams(next);
            }}
            options={STALE_OPTIONS.map((value) => ({ value: String(value), label: `Stale after ${value} days` }))}
          />
          {data && <span className="ssi-quality__updated">Snapshot {data.generated_at}</span>}
        </div>
      </header>

      <AsyncRegion
        className="ssi-quality__content"
        status={quality.isPending ? "loading" : quality.isError ? "error" : "success"}
        loadingLabel="Loading SSI quality snapshot"
        error={quality.error as ApiProblem | null}
        onRetry={() => quality.refetch()}
      >
        {data && <>
          <QualityMetrics data={data} />
          <div className="ssi-quality__panel-grid">
            <FreshnessPanel data={data} />
            <CompositionPanel data={data} />
          </div>
          <ReviewQueue data={data} />
          <p className="ssi-quality__disclaimer" role="note">{data.disclaimer}</p>
        </>}
      </AsyncRegion>
    </div>
  );
}
