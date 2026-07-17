import { useState, useRef, type KeyboardEvent } from "react";
import { searchStatic } from "./searchIndex";
import type { SearchResult, SearchResultType, SearchGroup } from "./searchTypes";
import "./CommandSearch.css";

const GROUP_LABELS: Record<SearchResultType, string> = {
  bank: "Banks",
  lesson: "Lessons",
  glossary: "Glossary",
  scheme: "Payment Schemes",
  tool: "Tools",
};

const GROUP_ORDER: SearchResultType[] = ["lesson", "bank", "scheme", "glossary", "tool"];

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
  const [query, setQuery] = useState(initialQuery);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = isOpen ? searchStatic(query) : [];
  const groups = groupResults(results);
  const flatResults = groups.flatMap((g) => g.results);

  function handleChange(value: string) {
    setQuery(value);
    setIsOpen(value.trim().length > 0);
    setActiveIndex(-1);
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
        onNavigate?.(result.href);
        setIsOpen(false);
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
          aria-label="Search banks, lessons, terms"
          className="command-search__input"
          placeholder="Search banks, corridors, lessons, terms…"
          value={query}
          onChange={(e) => {
            handleChange(e.target.value);
            syncUrl(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
        />
      </div>

      {isOpen && (
        <div className="command-search__results" ref={listRef} role="listbox">
          {flatResults.length === 0 ? (
            <div className="command-search__empty">
              No results for &ldquo;{query}&rdquo;. Try a bank name, currency, or payment term.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.type} className="command-search__group">
                <div className="command-search__group-label">{group.label}</div>
                {group.results.map((result) => {
                  runningIndex++;
                  const idx = runningIndex;
                  return (
                    <a
                      key={result.id}
                      href={result.href}
                      className={[
                        "command-search__item",
                        idx === activeIndex && "command-search__item--active",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      role="option"
                      aria-selected={idx === activeIndex}
                      onClick={() => {
                        setIsOpen(false);
                        onNavigate?.(result.href);
                      }}
                    >
                      <span className="command-search__item-label">{result.label}</span>
                      <span className="command-search__item-subtitle">{result.subtitle}</span>
                    </a>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
