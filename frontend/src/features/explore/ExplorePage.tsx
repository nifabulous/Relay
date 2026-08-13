import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CommandSearch } from "./search/CommandSearch";
import { apiKeys } from "../../api/queryKeys";
import { apiRequest } from "../../api/client";
import { LookupResponseSchema, SchemesResponseSchema, SSIResponseSchema } from "../../api/schemas";
import type { LookupResponse, SchemesResponse } from "../../api/schemas";
import { AsyncRegion } from "../../design-system/AsyncRegion";
import { Button } from "../../design-system/Button";
import type { AsyncStatus } from "../../design-system/types";
import type { ApiProblem } from "../../api/problem";
import { groupByCurrency } from "./ssiGrouping";
import { SettlementInstructions } from "./SettlementInstructions";
import "./ExplorePage.css";
import "../learn/labs/LabContent.css";

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
        <Link to="/explore/banks" className="explore__category">
          <span className="explore__category-label">Bank Directory</span>
          <span className="explore__category-sub">Browse and look up banks by BIC</span>
        </Link>
        <Link to="/explore/schemes" className="explore__category">
          <span className="explore__category-label">Payment Schemes</span>
          <span className="explore__category-sub">Compare rails: Faster Payments, SEPA, Fedwire, CHAPS</span>
        </Link>
        <Link to="/explore/glossary" className="explore__category">
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

  // Inline settlement summary: fetch SSI in parallel with the lookup so the
  // result card can show the bank's settlement currencies at a glance.
  const ssi = useQuery({
    queryKey: searchBic ? apiKeys.ssi(searchBic, "") : ["ssi", "idle"],
    queryFn: () =>
      apiRequest(`/api/ssi?bic=${encodeURIComponent(searchBic!)}`, undefined, SSIResponseSchema),
    enabled: searchBic !== null,
  });

  const currencyGroups = groupByCurrency(ssi.data?.instructions ?? []);

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
              <div className="bank-detail">
                <h2 className="bank-detail__name">{query.data.bank.bank_name}</h2>
                <dl className="bank-detail__grid">
                  <dt>BIC</dt>
                  <dd className="mono">{query.data.bank.bic}</dd>
                  {query.data.bank.country_code && (
                    <>
                      <dt>Country</dt>
                      <dd className="mono">{query.data.bank.country_code}</dd>
                    </>
                  )}
                  {query.data.bank.city && (
                    <>
                      <dt>City</dt>
                      <dd>{query.data.bank.city}</dd>
                    </>
                  )}
                </dl>

                {/* Settlement details inline — the search result is the
                    answer, no click-through required. */}
                <SettlementInstructions
                  groups={currencyGroups}
                  disclaimer={ssi.data?.disclaimer}
                />

                <div className="bank-detail__actions">
                  <Link
                    to={`/operate/prepare?bic=${encodeURIComponent(query.data.bank.bic)}`}
                    className="relay-btn relay-btn--primary"
                  >
                    Prepare a payment
                  </Link>
                </div>
              </div>
            )}
          </AsyncRegion>
        </div>
      )}
    </div>
  );
}

// ─── Payment Schemes ─────────────────────────────────────

const SCHEME_CURRENCIES = ["GBP", "CAD", "USD", "EUR", "NGN", "KES", "INR", "AUD", "JPY", "AED"];

export function SchemesPage() {
  const [currency, setCurrency] = useState<string | null>(null);

  const query = useQuery({
    queryKey: currency ? apiKeys.schemes(currency) : ["schemes", "idle"],
    enabled: currency !== null,
    queryFn: () =>
      apiRequest<SchemesResponse>(
        `/api/schemes?currency=${encodeURIComponent(currency!)}`,
        undefined,
        SchemesResponseSchema,
      ),
  });

  let status: "idle" | "loading" | "success" | "error" | "empty" = "idle";
  if (currency === null) status = "idle";
  else if (query.isLoading) status = "loading";
  else if (query.isError) status = "error";
  else if (query.data) status = query.data.schemes.length > 0 ? "success" : "empty";

  const error = query.error as Record<string, unknown> | null;

  return (
    <div className="explore">
      <div className="explore__header">
        <h1>Payment Schemes</h1>
        <p className="measure">Compare domestic payment rails by speed, cost, and limits. Educational reference — always check the operator's current rules.</p>
      </div>

      <div className="lab-currency-pills">
        {SCHEME_CURRENCIES.map((ccy) => (
          <button
            key={ccy}
            type="button"
            className={["lab-currency-pill", currency === ccy && "lab-currency-pill--active"].filter(Boolean).join(" ")}
            aria-pressed={currency === ccy}
            onClick={() => setCurrency(ccy)}
          >
            {ccy}
          </button>
        ))}
      </div>

      {currency && (
        <AsyncRegion
          status={status}
          loadingLabel="Loading schemes"
          emptyMessage={`No scheme data for ${currency}.`}
          error={error ? { status: 0, title: "Load failed", detail: "Could not load schemes.", fieldErrors: {}, retryable: true } : null}
          onRetry={() => query.refetch()}
        >
          {query.data && (
            <table className="lab-table">
              <thead>
                <tr><th>Rail</th><th>Speed</th><th>Limit</th><th>Cost</th><th>Use case</th><th>Operator</th></tr>
              </thead>
              <tbody>
                {query.data.schemes.map((s) => (
                  <tr key={s.name}>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.speed}</td>
                    <td className="mono">{s.limit}</td>
                    <td>{s.cost}</td>
                    <td>{s.useCase}</td>
                    <td>{s.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AsyncRegion>
      )}
    </div>
  );
}

// ─── Glossary ────────────────────────────────────────────

import { GLOSSARY_TERMS } from "./search/searchIndex";

const GLOSSARY_GROUPS = [
  { id: "identifiers", label: "Identifiers", terms: ["BIC", "SWIFT code", "IBAN", "MOD-97"] },
  {
    id: "correspondent-banking",
    label: "Correspondent banking",
    terms: ["Nostro", "Vostro", "Correspondent bank", "Intermediary bank", "SSI"],
  },
  { id: "tracking-messaging", label: "Tracking & messaging", terms: ["UETR", "gpi", "MT103", "pacs.008"] },
] as const;

export function GlossaryPage() {
  const [searchParams] = useSearchParams();
  const highlightTerm = searchParams.get("term");
  const [filter, setFilter] = useState("");

  const filtered = GLOSSARY_TERMS.filter(([term, def]) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return term.toLowerCase().includes(q) || def.toLowerCase().includes(q);
  });

  const termsByName = new Map<string, [string, string]>(GLOSSARY_TERMS.map((entry) => [entry[0], entry]));
  const groupedTerms = GLOSSARY_GROUPS.map((group) => ({
    ...group,
    entries: group.terms
      .map((term) => termsByName.get(term))
      .filter((entry): entry is [string, string] => Boolean(entry && filtered.includes(entry))),
  })).filter((group) => group.entries.length > 0);
  const groupedTermNames = new Set<string>(GLOSSARY_GROUPS.flatMap((group) => group.terms));
  const otherEntries = filtered.filter(([term]) => !groupedTermNames.has(term));

  const renderEntry = ([term, def]: [string, string]) => (
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
  );

  return (
    <div className="explore">
      <div className="explore__header">
        <h1>Glossary</h1>
        <p className="measure">Payment terminology used across Relay.</p>
      </div>

      <div className="glossary-toolbar">
        <label className="glossary-toolbar__label" htmlFor="glossary-filter">Find a term</label>
        <div className="glossary-toolbar__controls">
          <input
            id="glossary-filter"
            type="search"
            className="explore__glossary-filter"
            placeholder="Filter terms…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter glossary terms"
          />
          <span className="glossary-toolbar__count" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "term" : "terms"}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glossary-empty">
          <h2>No terms match that search</h2>
          <p>Try a broader word or clear the filter to browse the full glossary.</p>
        </div>
      ) : (
        <div className="glossary-sections">
          {groupedTerms.map((group) => (
            <section className="glossary-section" key={group.id} aria-labelledby={`glossary-${group.id}`}>
              <div className="glossary-section__heading">
                <h2 id={`glossary-${group.id}`}>{group.label}</h2>
                <span>{group.entries.length} {group.entries.length === 1 ? "term" : "terms"}</span>
              </div>
              <dl className="glossary-grid">{group.entries.map(renderEntry)}</dl>
            </section>
          ))}

          {otherEntries.length > 0 && (
            <section className="glossary-section" aria-labelledby="glossary-other">
              <div className="glossary-section__heading">
                <h2 id="glossary-other">Other payment terms</h2>
                <span>{otherEntries.length} terms</span>
              </div>
              <dl className="glossary-grid">{otherEntries.map(renderEntry)}</dl>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
