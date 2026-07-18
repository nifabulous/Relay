import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CommandSearch } from "./search/CommandSearch";
import { apiKeys } from "../../api/queryKeys";
import { apiRequest } from "../../api/client";
import { LookupResponseSchema } from "../../api/schemas";
import type { LookupResponse } from "../../api/schemas";
import { AsyncRegion } from "../../design-system/AsyncRegion";
import { Button } from "../../design-system/Button";
import type { AsyncStatus } from "../../design-system/types";
import type { ApiProblem } from "../../api/problem";
import "./ExplorePage.css";

export function ExplorePage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";

  return (
    <div className="explore">
      <div className="explore__header">
        <h1>Explore</h1>
        <p className="measure">Search banks, corridors, payment schemes, and glossary terms.</p>
      </div>

      <CommandSearch initialQuery={query} />

      {/* Quick categories */}
      <div className="explore__categories">
        <Link to="/app/explore/banks" className="explore__category">
          <span className="explore__category-label">Bank Directory</span>
          <span className="explore__category-sub">Browse and look up banks by BIC</span>
        </Link>
        <Link to="/app/explore/schemes" className="explore__category">
          <span className="explore__category-label">Payment Schemes</span>
          <span className="explore__category-sub">Compare rails: Faster Payments, SEPA, Fedwire, CHAPS</span>
        </Link>
        <Link to="/app/explore/glossary" className="explore__category">
          <span className="explore__category-label">Glossary</span>
          <span className="explore__category-sub">Payment terminology reference</span>
        </Link>
      </div>
    </div>
  );
}

// ─── Bank Directory ──────────────────────────────────────

export function BankDirectoryPage() {
  const [bic, setBic] = useState("");
  const [searchBic, setSearchBic] = useState<string | null>(null);

  const query = useQuery({
    queryKey: searchBic ? apiKeys.lookup(searchBic) : ["lookup", "idle"],
    queryFn: () => apiRequest<LookupResponse>(`/api/lookup?bic=${encodeURIComponent(searchBic!)}`, undefined, LookupResponseSchema),
    enabled: searchBic !== null,
  });

  let status: AsyncStatus = "idle";
  if (searchBic === null) status = "idle";
  else if (query.isLoading) status = "loading";
  else if (query.isError) status = "error";
  else if (query.data) status = query.data.found ? "success" : "empty";

  return (
    <div className="explore">
      <div className="explore__header">
        <h1>Bank Directory</h1>
        <p className="measure">Look up a bank by its BIC (SWIFT code).</p>
      </div>

      <form
        className="explore__bank-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (bic.trim()) setSearchBic(bic.trim().toUpperCase());
        }}
      >
        <input
          type="text"
          className="explore__bank-input mono"
          placeholder="e.g. CITIUS33, GTBINGLAXXX"
          value={bic}
          onChange={(e) => setBic(e.target.value)}
          aria-label="BIC to look up"
          maxLength={11}
        />
        <Button type="submit" variant="primary">Look up</Button>
      </form>

      {searchBic && (
        <div className="explore__bank-result">
          <AsyncRegion
            status={status}
            loadingLabel="Looking up bank"
            emptyMessage={`No bank found for BIC: ${searchBic}`}
            emptyActionLabel="Try another BIC"
            onEmptyAction={() => { setSearchBic(null); setBic(""); }}
            error={query.error as ApiProblem | null}
            onRetry={() => query.refetch()}
          >
            {query.data?.bank && (
              <BankDetailCard bank={query.data.bank} />
            )}
          </AsyncRegion>
        </div>
      )}
    </div>
  );
}

function BankDetailCard({ bank }: { bank: NonNullable<LookupResponse["bank"]> }) {
  return (
    <div className="bank-detail">
      <h2 className="bank-detail__name">{bank.bank_name}</h2>
      <dl className="bank-detail__grid">
        <dt>BIC</dt>
        <dd className="mono">{bank.bic}</dd>
        {bank.country_code && (
          <>
            <dt>Country</dt>
            <dd className="mono">{bank.country_code}</dd>
          </>
        )}
        {bank.city && (
          <>
            <dt>City</dt>
            <dd>{bank.city}</dd>
          </>
        )}
        {bank.country_currency && (
          <>
            <dt>Currency</dt>
            <dd className="mono">{bank.country_currency}</dd>
          </>
        )}
      </dl>
      <div className="bank-detail__actions">
        <Link to={`/app/operate/prepare?bic=${encodeURIComponent(bank.bic)}`} className="relay-btn relay-btn--secondary">
          Prepare payment to this bank
        </Link>
        <Link to={`/app/explore?country=${encodeURIComponent(bank.country_code)}`} className="relay-btn relay-btn--secondary">
          Search corridors
        </Link>
      </div>
    </div>
  );
}

// ─── Payment Schemes ─────────────────────────────────────

export function SchemesPage() {
  return (
    <div className="explore">
      <div className="explore__header">
        <h1>Payment Schemes</h1>
        <p className="measure">Compare payment rails by speed, cost, and currency.</p>
      </div>
      <div className="schemes-list">
        <p className="explore__muted">Payment scheme comparison loads from the API. Use the Operate workspace to check schemes for a specific currency.</p>
        <Link to="/app/operate" className="relay-btn relay-btn--secondary">
          Go to Operate
        </Link>
      </div>
    </div>
  );
}

// ─── Glossary ────────────────────────────────────────────

import { GLOSSARY_TERMS } from "./search/searchIndex";

export function GlossaryPage() {
  const [searchParams] = useSearchParams();
  const highlightTerm = searchParams.get("term");
  const [filter, setFilter] = useState("");

  const filtered = GLOSSARY_TERMS.filter(([term, def]) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return term.toLowerCase().includes(q) || def.toLowerCase().includes(q);
  });

  return (
    <div className="explore">
      <div className="explore__header">
        <h1>Glossary</h1>
        <p className="measure">Payment terminology used across Relay.</p>
      </div>

      <input
        type="search"
        className="explore__glossary-filter"
        placeholder="Filter terms…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter glossary terms"
      />

      <div className="glossary-list">
        {filtered.length === 0 ? (
          <p className="explore__muted">No terms match &ldquo;{filter}&rdquo;</p>
        ) : (
          filtered.map(([term, def]) => (
            <div
              key={term}
              className={[
                "glossary-entry",
                highlightTerm?.toLowerCase() === term.toLowerCase() && "glossary-entry--highlighted",
              ].filter(Boolean).join(" ")}
            >
              <dt className="glossary-entry__term mono">{term}</dt>
              <dd className="glossary-entry__def">{def}</dd>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
