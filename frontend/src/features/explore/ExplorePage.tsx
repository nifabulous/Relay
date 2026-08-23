import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CommandSearch } from "./search/CommandSearch";
import { apiKeys } from "../../api/queryKeys";
import { apiRequest } from "../../api/client";
import { LookupResponseSchema, SchemesResponseSchema, InternationalSchemesResponseSchema, SSIResponseSchema } from "../../api/schemas";
import type { LookupResponse, SchemesResponse, InternationalSchemesResponse } from "../../api/schemas";
import { AsyncRegion } from "../../design-system/AsyncRegion";
import { Button } from "../../design-system/Button";
import type { AsyncStatus } from "../../design-system/types";
import type { ApiProblem } from "../../api/problem";
import { groupByCurrency } from "./ssiGrouping";
import { SettlementInstructions } from "./SettlementInstructions";
import { SchemeTabs } from "./SchemeTabs";
import { SchemeDetails } from "./SchemeDetails";
import { SchemeTable } from "./SchemeTable";
import { SCHEME_TAB_ORDER, DEFAULT_SCHEME_TAB_ID } from "./schemeCatalog";
import { buildSchemeContext } from "../tutor/tutorContext";
import { usePublishTutorContext } from "../tutor/tutorSurfaceStore";
import "./ExplorePage.css";
import "../learn/labs/LabContent.css";

export function ExplorePage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";

  return (
    <div className="explore">
      <div className="explore__header">
        <h1>Explore</h1>
        <p className="measure">Search banks by name or BIC, corridors, payment schemes, glossary terms, lessons, and tools.</p>
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

/** Example BICs shown in the Bank Directory's pre-search guidance. */
const EXAMPLE_BICS = ["GTBINGLAXXX", "MASHAEADXXX", "CTCBHKHHXXX"];

type DirectoryRow = {
  bic: string;
  name: string;
  country: string;
  market: string;
  capability: "Cross-border" | "Domestic";
  verified: boolean;
  monogram: string;
};

/**
 * The directory browse state is intentionally a small, curated view of the
 * seeded teaching data. BIC lookup remains the source of truth for a full
 * institution record and settlement instructions.
 */
const DIRECTORY_ROWS: DirectoryRow[] = [
  { name: "Lloyds Bank", bic: "LOYDGB2LXXX", country: "United Kingdom", market: "GB", capability: "Cross-border", verified: true, monogram: "LB" },
  { name: "HSBC", bic: "HSBCGB22XXX", country: "United Kingdom", market: "GB", capability: "Cross-border", verified: true, monogram: "HS" },
  { name: "JPMorgan Chase", bic: "CHASUS33XXX", country: "United States", market: "US", capability: "Cross-border", verified: true, monogram: "JC" },
  { name: "Deutsche Bank", bic: "DEUTDEFFXXX", country: "Germany", market: "DE", capability: "Cross-border", verified: true, monogram: "DB" },
  { name: "Mizuho Bank", bic: "MHCBJPJTXXX", country: "Japan", market: "JP", capability: "Domestic", verified: true, monogram: "MZ" },
];

const BIC_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z\d]{2}(?:[A-Z\d]{3})?$/i;
const BIC_LIKE_PATTERN = /^[A-Z]{4}[A-Z\d]{2,7}$/i;

export function BankDirectoryPage() {
  const [bic, setBic] = useState("");
  const [searchBic, setSearchBic] = useState<string | null>(null);
  const [market, setMarket] = useState("all");
  const [capability, setCapability] = useState("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [directoryPage, setDirectoryPage] = useState(1);

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

  const normalizedDirectoryQuery = bic.trim().toLowerCase();
  const filteredRows = DIRECTORY_ROWS.filter((row) => {
    const matchesQuery = !normalizedDirectoryQuery ||
      `${row.name} ${row.bic} ${row.country}`.toLowerCase().includes(normalizedDirectoryQuery);
    const matchesMarket = market === "all" || row.market === market;
    const matchesCapability = capability === "all" || row.capability === capability;
    // Browse rows represent published seed records, so the verified toggle is
    // a useful explicit affordance even though every curated row is verified.
    const matchesVerified = !verifiedOnly || row.verified;
    return matchesQuery && matchesMarket && matchesCapability && matchesVerified;
  });
  const directoryPageSize = 5;
  const directoryPageCount = Math.max(1, Math.ceil(filteredRows.length / directoryPageSize));
  const currentDirectoryPage = Math.min(directoryPage, directoryPageCount);
  const visibleRows = filteredRows.slice(
    (currentDirectoryPage - 1) * directoryPageSize,
    currentDirectoryPage * directoryPageSize,
  );
  const directoryStart = filteredRows.length === 0 ? 0 : (currentDirectoryPage - 1) * directoryPageSize + 1;
  const directoryEnd = Math.min(currentDirectoryPage * directoryPageSize, filteredRows.length);

  return (
    <div className="explore bank-directory">
      <div className="explore__header">
        <h1>Bank directory</h1>
        <p className="measure">Browse verified institutions by BIC, market, and capability.</p>
      </div>

      <form
        className="bank-directory__search"
        onSubmit={(e) => {
          e.preventDefault();
          const value = bic.trim();
          if (value && (BIC_PATTERN.test(value) || BIC_LIKE_PATTERN.test(value))) {
            setSearchBic(value.toUpperCase());
          }
          setDirectoryPage(1);
        }}
      >
        <svg className="bank-directory__search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
          type="text"
          className="bank-directory__search-input"
          placeholder="Search by name or BIC…"
          value={bic}
          onChange={(e) => {
            setBic(e.target.value);
            setDirectoryPage(1);
          }}
          aria-label="BIC to look up"
          aria-describedby="bank-directory-search-help"
          maxLength={80}
        />
        <Button type="submit" variant="secondary" className="bank-directory__search-submit">Look up</Button>
      </form>
      <p id="bank-directory-search-help" className="sr-only">Type a bank name to filter the directory, or enter an 8 or 11 character BIC to look up its full record.</p>

      <div className="bank-directory__filters" aria-label="Bank directory filters">
        <label className="bank-directory__select-chip">
          <span className="sr-only">Market</span>
          <select
            aria-label="Filter by market"
            value={market}
            onChange={(event) => { setMarket(event.target.value); setDirectoryPage(1); }}
          >
            <option value="all">Market: All</option>
            <option value="GB">Market: United Kingdom</option>
            <option value="US">Market: United States</option>
            <option value="DE">Market: Germany</option>
            <option value="JP">Market: Japan</option>
          </select>
        </label>
        <label className="bank-directory__select-chip">
          <span className="sr-only">Capability</span>
          <select
            aria-label="Filter by capability"
            value={capability}
            onChange={(event) => { setCapability(event.target.value); setDirectoryPage(1); }}
          >
            <option value="all">Capability: All</option>
            <option value="Cross-border">Capability: Cross-border</option>
            <option value="Domestic">Capability: Domestic</option>
          </select>
        </label>
        <button
          type="button"
          className={["bank-directory__filter-chip", verifiedOnly && "bank-directory__filter-chip--active"].filter(Boolean).join(" ")}
          aria-pressed={verifiedOnly}
          onClick={() => { setVerifiedOnly((current) => !current); setDirectoryPage(1); }}
        >
          <span className="bank-directory__status-icon" aria-hidden="true">✓</span>
          Verified only
        </button>
      </div>

      <section className="bank-directory__table-card" aria-labelledby="bank-directory-results-heading">
        <h2 id="bank-directory-results-heading" className="sr-only">Bank directory results</h2>
        <div className="bank-directory__table-scroll">
          <table className="bank-directory__table">
            <thead>
              <tr>
                <th scope="col">Institution</th>
                <th scope="col">BIC</th>
                <th scope="col">Country</th>
                <th scope="col">Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.bic}>
                  <td data-label="Institution">
                    <Link className="bank-directory__institution" to={`/explore/banks/${encodeURIComponent(row.bic)}`} aria-label={`Open ${row.name} details`}>
                      <span className="bank-directory__logo" aria-hidden="true">{row.monogram}</span>
                      <span>{row.name}</span>
                    </Link>
                  </td>
                  <td data-label="BIC" className="mono bank-directory__bic">{row.bic}</td>
                  <td data-label="Country">{row.country}</td>
                  <td data-label="Capabilities">
                    <span className={["bank-directory__capability", row.capability === "Domestic" && "bank-directory__capability--domestic"].filter(Boolean).join(" ")}>
                      <span className="bank-directory__capability-icon" aria-hidden="true">{row.capability === "Domestic" ? "–" : "✓"}</span>
                      {row.capability}
                    </span>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="bank-directory__no-results">No institutions match these filters. Clear a filter or try another name or BIC.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="bank-directory__pagination">
          <span aria-live="polite">Showing {directoryStart}–{directoryEnd} of {filteredRows.length}</span>
          <div className="bank-directory__pagination-actions">
            <button type="button" className="bank-directory__page-button" aria-label="Previous page" disabled={currentDirectoryPage <= 1} onClick={() => setDirectoryPage((page) => Math.max(1, page - 1))}>‹</button>
            <button type="button" className="bank-directory__page-button" aria-label="Next page" disabled={currentDirectoryPage >= directoryPageCount} onClick={() => setDirectoryPage((page) => Math.min(directoryPageCount, page + 1))}>›</button>
          </div>
        </footer>
      </section>

      {searchBic === null && (
        <div className="explore__empty">
          <p className="explore__empty-title">Find a bank to see its settlement instructions</p>
          <p className="measure explore__empty-body">
            Enter a SWIFT BIC (8 or 11 characters, for example GTBINGLAXXX or
            CITIUS33) to see the bank&apos;s identity and the correspondents it
            publishes for receiving payments. Try an example:
          </p>
          <div className="explore__examples">
            {EXAMPLE_BICS.map((example) => (
              <button
                key={example}
                type="button"
                className="explore__example"
                onClick={() => { setBic(example); setSearchBic(example); }}
              >
                <span className="mono">{example}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
                {ssi.isError && (
                  <div className="bank-ssi__error" role="alert">
                    <p>
                      Published settlement instructions could not be loaded for this bank.
                    </p>
                    <button
                      type="button"
                      className="relay-btn relay-btn--secondary"
                      onClick={() => ssi.refetch()}
                    >
                      Retry settlement instructions
                    </button>
                  </div>
                )}
                {ssi.isLoading && (
                  <div className="bank-ssi__loading" role="status" aria-label="Loading settlement instructions">
                    Loading published settlement instructions…
                  </div>
                )}
                {ssi.data && !ssi.isError && (
                  <SettlementInstructions
                    groups={currencyGroups}
                    disclaimer={ssi.data.disclaimer}
                  />
                )}

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

export function SchemesPage() {
  const [activeTabId, setActiveTabId] = useState(DEFAULT_SCHEME_TAB_ID);

  const activeTab =
    SCHEME_TAB_ORDER.find((tab) => tab.id === activeTabId) ?? SCHEME_TAB_ORDER[0];
  const isInternational = activeTab.lookupCode === null;

  const currencyQuery = useQuery({
    queryKey: activeTab.lookupCode
      ? apiKeys.schemes(activeTab.lookupCode)
      : ["schemes", "idle"],
    enabled: !isInternational,
    queryFn: () =>
      apiRequest<SchemesResponse>(
        `/api/schemes?currency=${encodeURIComponent(activeTab.lookupCode as string)}`,
        undefined,
        SchemesResponseSchema,
      ),
  });

  // The whole-catalogue rail exists only for the International / SWIFT tab;
  // it must not fire for any domestic tab.
  const internationalQuery = useQuery({
    queryKey: apiKeys.internationalSchemes,
    enabled: isInternational,
    queryFn: () =>
      apiRequest<InternationalSchemesResponse>(
        "/api/schemes/international",
        undefined,
        InternationalSchemesResponseSchema,
      ),
  });

  const query = isInternational ? internationalQuery : currencyQuery;

  // Switching tabs re-keys the query, so `query.data` belongs to the ACTIVE
  // tab only — the previous tab's rows can never leak into the new tab.
  let status: AsyncStatus;
  if (query.isLoading) status = "loading";
  else if (query.isError) status = "error";
  else if (query.data) {
    status =
      isInternational || (query.data as SchemesResponse).schemes.length > 0
        ? "success"
        : "empty";
  } else {
    status = "loading";
  }

  const international =
    isInternational && query.data
      ? (query.data as InternationalSchemesResponse)
      : null;
  const domesticSchemes =
    !isInternational && query.data
      ? (query.data as SchemesResponse).schemes
      : [];

  /*
   * The currency alone reaches every rail document the backend holds for it,
   * so one publish per tab covers all of them — no need to name each rail.
   * The international tab has no currency, so it stays on the scheme surface
   * and the tutor answers from the SWIFT/correspondent documents.
   */
  usePublishTutorContext(
    isInternational
      ? { surface: "scheme" }
      : buildSchemeContext({
          currency: String(activeTab.lookupCode ?? ""),
          summary:
            domesticSchemes.length > 0
              ? `Rails shown: ${domesticSchemes.map((scheme) => scheme.name).join(", ")}.`
              : undefined,
        }),
  );

  return (
    <div className="explore">
      <div className="explore__header">
        <h1>Payment Schemes</h1>
        <p className="measure">Compare domestic payment rails by speed, cost, and limits. Educational reference — always check the operator's current rules.</p>
      </div>

      <SchemeTabs
        tabs={SCHEME_TAB_ORDER}
        label="Payment schemes"
        activeId={activeTabId}
        onChange={setActiveTabId}
        renderPanel={(tab) => (
          <AsyncRegion
            status={status}
            loadingLabel="Loading schemes"
            emptyMessage={`No scheme data for ${tab.label}.`}
            error={query.error as ApiProblem | null}
            onRetry={() => query.refetch()}
          >
            {international ? (
              <>
                <SchemeTable schemes={[international]} />
                <SchemeDetails scheme={international} scopeLabel="International / SWIFT" />
              </>
            ) : (
              <>
                <SchemeTable schemes={domesticSchemes} />
                {domesticSchemes.map((scheme) => (
                  <SchemeDetails key={scheme.name} scheme={scheme} />
                ))}
              </>
            )}
          </AsyncRegion>
        )}
      />
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
