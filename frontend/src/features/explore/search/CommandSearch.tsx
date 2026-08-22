import { useEffect, useRef, useId, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchStatic } from "./searchIndex";
import type { SearchResult, SearchResultType, SearchGroup } from "./searchTypes";
import { requestBankSearch } from "./bankSearch";
import {
  loadSearchHistory,
  recordSearchHistory,
  removeSearchHistory,
  normalizeSearch,
} from "./searchHistory";
import "./CommandSearch.css";

const GROUP_LABELS: Record<SearchResultType, string> = {
  bank: "Banks",
  lesson: "Lessons",
  glossary: "Glossary",
  scheme: "Payment Schemes",
  tool: "Tools",
};

const GROUP_ORDER: SearchResultType[] = ["bank", "scheme", "glossary", "lesson", "tool"];

const BIC_QUERY_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z\d]{2}(?:[A-Z\d]{3})?$/i;

const EMPTY_DESTINATIONS: SearchResult[] = [
  { id: "destination:banks", type: "bank", label: "Bank Directory", subtitle: "Browse and look up banks by BIC", href: "/app/explore/banks" },
  { id: "destination:schemes", type: "scheme", label: "Payment Schemes", subtitle: "Compare payment rails and settlement schemes", href: "/app/explore/schemes" },
  { id: "destination:glossary", type: "glossary", label: "Glossary", subtitle: "Payment terminology reference", href: "/app/explore/glossary" },
];

function isBicQuery(value: string): boolean {
  const normalized = value.trim();
  return normalized === normalized.toUpperCase() && BIC_QUERY_PATTERN.test(normalized);
}

function groupResults(results: SearchResult[]): SearchGroup[] {
  const groups = new Map<SearchResultType, SearchResult[]>();
  for (const r of results) {
    const list = groups.get(r.type) ?? [];
    list.push(r);
    groups.set(r.type, list);
  }
  return GROUP_ORDER
    .filter((t) => groups.has(t))
    .map((t) => ({ type: t, label: GROUP_LABELS[t], results: groups.get(t)! }));
}

interface CommandSearchProps {
  initialQuery?: string;
  onNavigate?: (href: string) => void;
}

export function CommandSearch({ initialQuery = "", onNavigate }: CommandSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [isOpen, setIsOpen] = useState(initialQuery.trim().length > 0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [settledQuery, setSettledQuery] = useState(initialQuery.trim());
  const [history, setHistory] = useState<string[]>(() => loadSearchHistory());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const historyLabelId = `${listboxId}-history-label`;
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (!normalizedQuery) {
      setSettledQuery("");
      return;
    }
    const timer = window.setTimeout(() => setSettledQuery(normalizedQuery), 250);
    return () => window.clearTimeout(timer);
  }, [normalizedQuery]);

  const bicQuery = isBicQuery(normalizedQuery);
  const bankSearch = useQuery({
    queryKey: ["banks", settledQuery],
    queryFn: () => requestBankSearch(settledQuery),
    enabled: isOpen && settledQuery.length >= 2,
    staleTime: 30_000,
  });

  const directoryBankResults: SearchResult[] = (bankSearch.data?.results ?? []).map((bank) => ({
    id: `bank:${bank.bic}`,
    type: "bank" as const,
    label: bank.bank_name,
    subtitle: [bank.country_code, bank.city, bank.bic].filter(Boolean).join(" · "),
    href: `/app/explore/banks/${encodeURIComponent(bank.bic)}`,
  }));

  const bankResults: SearchResult[] = directoryBankResults.length > 0
    ? directoryBankResults
    : !bankSearch.isFetching && bicQuery
      ? [{
        id: `bank-bic:${normalizedQuery.toUpperCase()}`,
        type: "bank",
        label: `Look up bank by BIC: ${normalizedQuery.toUpperCase()}`,
        subtitle: "Bank Directory lookup",
        href: `/app/explore/banks/${encodeURIComponent(normalizedQuery.toUpperCase())}`,
      }]
      : [];

  const staticResults = searchStatic(query);
  const results = isOpen
    ? normalizedQuery
      ? [...bankResults, ...staticResults]
      : EMPTY_DESTINATIONS
    : [];
  const groups = groupResults(results);
  const flatResults = groups.flatMap((g) => g.results);

  // Compute the active option's id for aria-activedescendant
  const activeOptionId = activeIndex >= 0 && activeIndex < flatResults.length
    ? `${listboxId}-opt-${activeIndex}`
    : undefined;

  useEffect(() => {
    if (!activeOptionId) return;
    const activeOption = listRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    if (typeof activeOption?.scrollIntoView === "function") {
      activeOption.scrollIntoView({ block: "nearest" });
    }
  }, [activeOptionId]);

  function handleChange(value: string) {
    setQuery(value);
    setIsOpen(value.trim().length > 0 || document.activeElement === inputRef.current);
    setActiveIndex(-1);
  }

  function activateResult(result: SearchResult, event?: { preventDefault(): void }) {
    const nextHistory = recordSearchHistory(normalizeSearch(query));
    setHistory(nextHistory);
    setIsOpen(false);
    setActiveIndex(-1);
    event?.preventDefault();
    (onNavigate ?? navigate)(result.href);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex((prev) => (prev + 1) % flatResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex((prev) => (prev <= 0 ? flatResults.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < flatResults.length) {
        e.preventDefault();
        const result = flatResults[activeIndex];
        activateResult(result, e);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
    }
  }

  // Sync URL query param
  function syncUrl(q: string) {
    const url = new URL(window.location.href);
    if (q.trim()) {
      url.searchParams.set("q", q);
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState(null, "", url.toString());
  }

  let runningIndex = -1;

  return (
    <div className="command-search">
      <div className="command-search__input-wrap">
        <svg
          className="command-search__icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          aria-label="Search banks, payment schemes, lessons, terms, and tools"
          className="command-search__input"
          placeholder="Search banks by name, BIC, corridors, lessons, terms…"
          value={query}
          onChange={(e) => {
            handleChange(e.target.value);
            syncUrl(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsOpen(true);
          }}
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
        />
      </div>

      {isOpen && (
        <div className="command-search__results">
          <div ref={listRef} role="listbox" id={listboxId}>
          {flatResults.length === 0 ? (
            <div className="command-search__empty">
              {bankSearch.isFetching
                ? "Searching the bank directory…"
                : bankSearch.isError
                  ? "Bank search unavailable. Try a BIC or Bank Directory."
                : `No results for “${query}”. Try a bank name, BIC, currency, or payment term.`}
            </div>
          ) : (
            <>
              {bankSearch.isFetching && (
                <div className="command-search__empty" role="status">
                  Searching banks; other results remain available.
                </div>
              )}
              {bankSearch.isError && (
                <div className="command-search__empty" role="alert">
                  Bank search unavailable; other results remain available.
                </div>
              )}
              {groups.map((group) => (
                <div key={group.type} className="command-search__group">
                  <div className="command-search__group-label">{group.label}</div>
                  {group.results.map((result) => {
                    runningIndex++;
                    const idx = runningIndex;
                    return (
                      <a
                        key={result.id}
                        id={`${listboxId}-opt-${runningIndex}`}
                        href={result.href}
                        className={[
                          "command-search__item",
                          idx === activeIndex && "command-search__item--active",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        role="option"
                        aria-selected={idx === activeIndex}
                        onClick={(event) => activateResult(result, event)}
                      >
                        <span className="command-search__item-label">{result.label}</span>
                        <span className="command-search__item-subtitle">{result.subtitle}</span>
                      </a>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
          {normalizedQuery.length === 0 && history.length > 0 && (
            <section className="command-search__history" aria-labelledby={historyLabelId}>
              <div id={historyLabelId} className="command-search__group-label">Recent searches</div>
              {history.map((entry) => (
                <div key={entry} className="command-search__history-item">
                  <button
                    type="button"
                    className="command-search__history-query"
                    onClick={() => {
                      handleChange(entry);
                      syncUrl(entry);
                    }}
                  >
                    {entry}
                  </button>
                  <button
                    type="button"
                    className="command-search__history-remove"
                    aria-label={`Remove ${entry} from recent searches`}
                    onClick={() => setHistory(removeSearchHistory(entry))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {bankSearch.isFetching
          ? "Searching banks"
          : bankSearch.isError
            ? "Bank search error"
            : normalizedQuery
              ? `${flatResults.length} search results`
              : "Search ready"}
      </div>
    </div>
  );
}
