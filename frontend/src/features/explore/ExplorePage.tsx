import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  siAxisbank,
  siBarclays,
  siBankofamerica,
  siCaixabank,
  siChase,
  siCommerzbank,
  siDeutschebank,
  siHdfcbank,
  siHsbc,
  siIcicibank,
  siStarlingbank,
  siWellsfargo,
} from "simple-icons";
import { CommandSearch } from "./search/CommandSearch";
import { apiKeys } from "../../api/queryKeys";
import { apiRequest } from "../../api/client";
import { LookupResponseSchema, SchemesResponseSchema, InternationalSchemesResponseSchema, SSIResponseSchema } from "../../api/schemas";
import type { LookupResponse, SchemesResponse, InternationalSchemesResponse } from "../../api/schemas";
import { AsyncRegion } from "../../design-system/AsyncRegion";
import { Button } from "../../design-system/Button";
import { RelaySelect } from "../../design-system/behavior/RelaySelect";
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
import { Icon } from "../../design-system/coss/icon";
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
  mark: ReactNode;
  resolved: boolean;
};

/**
 * The directory browse state is a curated view of the seeded teaching data.
 * Rows flagged resolved are known to answer /lookup; the remaining teaching
 * rows stay visible but are excluded from "Verified only". Simple Icons
 * supplies marks where available, otherwise a text monogram is used.
 */
const DIRECTORY_ROWS: DirectoryRow[] = [
  { name: "HSBC UK", bic: "HSBCGB22XXX", country: "United Kingdom", market: "GB", capability: "Cross-border", mark: <BankMark icon={siHsbc} fallback="HS" />, resolved: true },
  { name: "JPMorgan Chase", bic: "CHASUS33XXX", country: "United States", market: "US", capability: "Cross-border", mark: <BankMark icon={siChase} fallback="JC" />, resolved: true },
  { name: "Deutsche Bank", bic: "DEUTDEFFXXX", country: "Germany", market: "DE", capability: "Cross-border", mark: <BankMark icon={siDeutschebank} fallback="DB" />, resolved: true },
  { name: "Citibank N.A.", bic: "CITIUS33XXX", country: "United States", market: "US", capability: "Cross-border", mark: <BankMark fallback="CI" />, resolved: true },
  { name: "Bank of America", bic: "BOFAUS3NXXX", country: "United States", market: "US", capability: "Cross-border", mark: <BankMark icon={siBankofamerica} fallback="BA" />, resolved: true },
  { name: "Wells Fargo Bank N.A.", bic: "PNBPUS33XXX", country: "United States", market: "US", capability: "Cross-border", mark: <BankMark icon={siWellsfargo} fallback="WF" />, resolved: true },
  { name: "Barclays", bic: "BARCGB22XXX", country: "United Kingdom", market: "GB", capability: "Cross-border", mark: <BankMark icon={siBarclays} fallback="BA" />, resolved: true },
  { name: "NatWest", bic: "NWBKGB2LXXX", country: "United Kingdom", market: "GB", capability: "Cross-border", mark: <BankMark fallback="NW" />, resolved: true },
  { name: "Commerzbank", bic: "COBADEFFXXX", country: "Germany", market: "DE", capability: "Cross-border", mark: <BankMark icon={siCommerzbank} fallback="CB" />, resolved: true },
  { name: "Mizuho Bank", bic: "MHCBJPJTXXX", country: "Japan", market: "JP", capability: "Domestic", mark: <BankMark fallback="MZ" />, resolved: true },
  { name: "Starling Bank", bic: "STARGB2LXXX", country: "United Kingdom", market: "GB", capability: "Domestic", mark: <BankMark icon={siStarlingbank} fallback="SB" />, resolved: false },
  { name: "HDFC Bank", bic: "HDFCINBBXXX", country: "India", market: "IN", capability: "Domestic", mark: <BankMark icon={siHdfcbank} fallback="HD" />, resolved: false },
  { name: "ICICI Bank", bic: "ICICINBBXXX", country: "India", market: "IN", capability: "Domestic", mark: <BankMark icon={siIcicibank} fallback="IC" />, resolved: false },
  { name: "Axis Bank", bic: "AXISINBBXXX", country: "India", market: "IN", capability: "Domestic", mark: <BankMark icon={siAxisbank} fallback="AX" />, resolved: false },
  { name: "CaixaBank", bic: "CAIXESBBXXX", country: "Spain", market: "ES", capability: "Domestic", mark: <BankMark icon={siCaixabank} fallback="CX" />, resolved: false },
];

function BankMark({ icon, fallback }: { icon?: { path: string; title: string }; fallback: string }) {
  return (
    <span className="bank-directory__logo">
      {icon ? (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
          <title>{icon.title}</title>
          <path d={icon.path} fill="currentColor" />
        </svg>
      ) : (
        fallback
      )}
    </span>
  );
}

const BIC_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z\d]{2}(?:[A-Z\d]{3})?$/i;

export function BankDirectoryPage() {
  const navigate = useNavigate();
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
    const matchesVerified = !verifiedOnly || row.resolved;
    return matchesQuery && matchesMarket && matchesCapability && matchesVerified;
  });
  const directoryPageSize = 10;
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
        <p className="measure">Browse a curated teaching directory by market and capability.</p>
      </div>

      <form
        className="bank-directory__search"
        onSubmit={(e) => {
          e.preventDefault();
          const value = bic.trim();
          if (value && BIC_PATTERN.test(value)) {
            setSearchBic(value.toUpperCase());
          } else if (searchBic !== null) {
            setSearchBic(null);
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
            if (searchBic !== null) setSearchBic(null);
            setDirectoryPage(1);
          }}
          aria-label="Search bank name or BIC"
          aria-describedby="bank-directory-search-help"
          maxLength={80}
        />
        <Button type="submit" variant="secondary" className="bank-directory__search-submit">Look up</Button>
      </form>
      <div className="bank-directory__search-guidance">
        <p id="bank-directory-search-help">Type a bank name to filter the directory, or enter an 8 or 11 character BIC to open its full record.</p>
        {searchBic === null && (
          <div className="explore__examples">
            <span className="bank-directory__guidance-label">Try:</span>
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
        )}
      </div>

      <div className="bank-directory__filters" aria-label="Bank directory filters">
        <RelaySelect
          ariaLabel="Filter by market"
          value={market}
          onValueChange={(value) => { setMarket(value); setDirectoryPage(1); }}
          triggerClassName="bank-directory__select"
          options={[
            { value: "all", label: "Market: All" },
            { value: "GB", label: "Market: United Kingdom" },
            { value: "US", label: "Market: United States" },
            { value: "DE", label: "Market: Germany" },
            { value: "JP", label: "Market: Japan" },
            { value: "IN", label: "Market: India" },
            { value: "ES", label: "Market: Spain" },
          ]}
        />
        <RelaySelect
          ariaLabel="Filter by capability"
          value={capability}
          onValueChange={(value) => { setCapability(value); setDirectoryPage(1); }}
          triggerClassName="bank-directory__select"
          options={[
            { value: "all", label: "Capability: All" },
            { value: "Cross-border", label: "Capability: Cross-border" },
            { value: "Domestic", label: "Capability: Domestic" },
          ]}
        />
        <button
          type="button"
          className={[
            "bank-directory__filter-toggle",
            verifiedOnly && "bank-directory__filter-toggle--active",
          ].filter(Boolean).join(" ")}
          aria-pressed={verifiedOnly}
          onClick={() => { setVerifiedOnly((checked) => !checked); setDirectoryPage(1); }}
        >
          <Icon name="checkCircle" size={15} aria-hidden="true" />
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
                <tr
                  key={row.bic}
                  className="bank-directory__clickable-row"
                  onClick={() => navigate(`/explore/banks/${encodeURIComponent(row.bic)}`)}
                >
                  <td data-label="Institution">
                    <Link className="bank-directory__institution" to={`/explore/banks/${encodeURIComponent(row.bic)}`} aria-label={`Open ${row.name} details`}>
                      {row.mark}
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
    <div className="explore schemes-page">
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

const GLOSSARY_RELATED: Record<string, string[]> = {
  BIC: ["SWIFT code", "IBAN"],
  "SWIFT code": ["BIC", "UETR"],
  IBAN: ["MOD-97", "BIC"],
  "MOD-97": ["IBAN"],
  Nostro: ["Vostro", "Correspondent bank"],
  Vostro: ["Nostro", "Correspondent bank"],
  "Correspondent bank": ["Intermediary bank", "SSI"],
  "Intermediary bank": ["Correspondent bank", "SSI"],
  SSI: ["Nostro", "Vostro"],
  UETR: ["gpi", "MT103"],
  gpi: ["UETR", "MT103"],
  MT103: ["pacs.008", "UETR"],
  "pacs.008": ["MT103", "gpi"],
};

const RECENTLY_VIEWED_TERMS = ["BIC", "IBAN", "STP"];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function GlossaryPage() {
  const [searchParams] = useSearchParams();
  const highlightTerm = searchParams.get("term");
  const [filter, setFilter] = useState("");
  const [activeLetter, setActiveLetter] = useState("C");

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

  const letterTargets = new Map<string, string>();
  filtered.forEach(([term]) => {
    const letter = term.charAt(0).toUpperCase();
    if (!letterTargets.has(letter)) letterTargets.set(letter, `glossary-term-${term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
  });

  const renderEntry = ([term, def]: [string, string]) => {
    const related = (GLOSSARY_RELATED[term] ?? []).filter((relatedTerm) => termsByName.has(relatedTerm));
    const termId = `glossary-term-${term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return (
    <div
      key={term}
      id={termId}
      className={[
        "glossary-entry",
        highlightTerm?.toLowerCase() === term.toLowerCase() && "glossary-entry--highlighted",
      ].filter(Boolean).join(" ")}
    >
      <dt className="glossary-entry__term" data-part-of-speech="noun">{term}</dt>
      <dd className="glossary-entry__def">
        {def}
        {related.length > 0 && (
          <div className="glossary-entry__related" aria-label={`Related terms for ${term}`}>
            {related.map((relatedTerm) => (
              <Link
                key={relatedTerm}
                className="glossary-entry__chip"
                to={`/explore/glossary?term=${encodeURIComponent(relatedTerm)}`}
              >
                {relatedTerm}
              </Link>
            ))}
          </div>
        )}
      </dd>
    </div>
    );
  };

  return (
    <div className="explore glossary-page">
      <div className="explore__header">
        <h1>Glossary</h1>
        <p className="measure">Definitions for cross-border payment terms.</p>
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
        <div className="glossary-layout">
          <nav className="glossary-index" aria-label="Glossary alphabetical index">
            <span className="glossary-index__label">Jump to</span>
            <div className="glossary-index__letters">
              {ALPHABET.map((letter) => {
                const target = letterTargets.get(letter);
                return target ? (
                  <a
                    key={letter}
                    href={`#${target}`}
                    className={activeLetter === letter ? "glossary-index__letter glossary-index__letter--active" : "glossary-index__letter"}
                    aria-label={`Jump to ${letter}`}
                    aria-current={activeLetter === letter ? "true" : undefined}
                    onClick={() => setActiveLetter(letter)}
                  >
                    {letter}
                  </a>
                ) : (
                  <span key={letter} className="glossary-index__letter glossary-index__letter--disabled" aria-hidden="true">
                    {letter}
                  </span>
                );
              })}
            </div>
          </nav>

          <div className="glossary-results">
            <div className="glossary-results__summary">
              <h2>Definitions</h2>
              <span>{filtered.length} {filtered.length === 1 ? "term" : "terms"}</span>
            </div>
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
          </div>

          <aside className="glossary-recent" aria-labelledby="glossary-recent-heading">
            <h2 id="glossary-recent-heading">Recently viewed</h2>
            <ul className="glossary-recent__list">
              {RECENTLY_VIEWED_TERMS.map((term) => (
                <li key={term}>
                  <Link to={`/explore/glossary?term=${encodeURIComponent(term)}`} className="glossary-recent__link">
                    <span>{term}</span>
                    <span className="glossary-recent__icon" aria-hidden="true">◷</span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
