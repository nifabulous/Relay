import { useState } from "react";
import { Link } from "react-router-dom";
import type { AtlasNetwork, AtlasScope } from "./atlasSchemas";
import { archivedBand, coverageState, denominatorText } from "./atlasEncoding";
import { format, percent } from "./formatters";

type SortKey = "reach" | "name" | "currencies";

type Props = {
  network: AtlasNetwork;
  view: "hub" | "spoke";
  scope: AtlasScope;
  search: string;
  selected: string | null;
  sort: SortKey;
  direction: "asc" | "desc";
  onSort: (sort: SortKey) => void;
  onSelect: (iso2: string) => void;
  onHover?: (iso2: string | null) => void;
  archivedRows: Map<string, number>;
};

const names: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  CA: "Canada",
  IN: "India",
  JP: "Japan",
  NG: "Nigeria",
  AU: "Australia",
  SG: "Singapore",
};
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
const name = (iso2: string) => names[iso2] ?? displayNames.of(iso2) ?? iso2;

export function AtlasTable({ network, view, scope, search, selected, sort, direction, onSort, onSelect, onHover, archivedRows }: Props) {
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const query = search.trim().toLowerCase();

  if (view === "spoke") {
    const rows = [...network.spokes]
      .filter((row) => !query || row.iso2.toLowerCase().includes(query) || name(row.iso2).toLowerCase().includes(query) || network.hubs.some((hub) => hub.iso2 === row.iso2 && `${hub.name} ${hub.bic}`.toLowerCase().includes(query)))
      .sort((a, b) => {
        const comparison = sort === "name" ? name(a.iso2).localeCompare(name(b.iso2)) : a.rows - b.rows;
        return (direction === "asc" ? comparison : -comparison) || a.iso2.localeCompare(b.iso2);
      });
    return (
      <div className="atlas-table atlas-table--spoke" role="region" aria-label="Beneficiary countries">
        <div className="atlas-table__head">
          <button type="button" onClick={() => onSort("name")} aria-label="Sort beneficiary countries by name">Country</button>
          <span>Beneficiary banks</span>
          <button type="button" onClick={() => onSort("reach")} aria-label="Sort beneficiary countries by rows">Rows</button>
          <span>Coverage</span>
        </div>
        {rows.map((row) => {
          const archived = archivedRows.get(row.iso2) ?? 0;
          const state = coverageState(true, row.rows, scope);
          return (
            <button
              type="button"
              className={["atlas-table__row", selected === row.iso2 && "atlas-table__row--selected"].filter(Boolean).join(" ")}
              key={row.iso2}
              onClick={() => onSelect(row.iso2)}
              onMouseEnter={() => onHover?.(row.iso2)}
              onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(row.iso2)}
              onBlur={() => onHover?.(null)}
              aria-label={`${name(row.iso2)}: ${denominatorText(row.beneficiary_banks, network.totals.beneficiary_banks, "beneficiary banks")}, ${denominatorText(row.rows, network.totals.ssi_rows, "rows")}`}
            >
              <span data-label="Country"><strong>{name(row.iso2)}</strong><small className="mono">{row.iso2}</small></span>
              <span className="mono" data-label="Beneficiary banks">{denominatorText(row.beneficiary_banks, network.totals.beneficiary_banks, "beneficiary banks")}</span>
              <span className="mono" data-label="Rows">{denominatorText(row.rows, network.totals.ssi_rows, "rows")}</span>
              <span data-label="Coverage" data-state={state}>{format(archived)} archived of {format(row.rows)} collected rows ({percent(archived, row.rows)}) · {archivedBand(archived, row.rows)} hatch</span>
            </button>
          );
        })}
      </div>
    );
  }

  const countries = [...network.hub_countries]
    .filter((country) => {
      const countryMatches = !query || country.iso2.toLowerCase().includes(query) || name(country.iso2).toLowerCase().includes(query);
      const institutionMatches = network.hubs.some((hub) => hub.iso2 === country.iso2 && `${hub.name} ${hub.bic}`.toLowerCase().includes(query));
      return countryMatches || institutionMatches;
    })
    .map((country) => {
      const hubs = network.hubs.filter((hub) => hub.iso2 === country.iso2 && (!query || `${hub.name} ${hub.bic}`.toLowerCase().includes(query)));
      return { country, hubs };
    })
    .sort((a, b) => {
      const comparison = sort === "name" ? name(a.country.iso2).localeCompare(name(b.country.iso2)) : sort === "currencies" ? a.country.currencies - b.country.currencies : a.country.banks_served - b.country.banks_served;
      return (direction === "asc" ? comparison : -comparison) || a.country.iso2.localeCompare(b.country.iso2);
    });

  return (
    <div className="atlas-table atlas-table--hub" role="region" aria-label="Correspondent hubs">
      <div className="atlas-table__head">
        <button type="button" onClick={() => onSort("name")} aria-label="Sort correspondent countries by name">Country</button>
        <button type="button" onClick={() => onSort("reach")} aria-label="Sort correspondent countries by banks reached">Banks reached</button>
        <button type="button" onClick={() => onSort("currencies")} aria-label="Sort correspondent countries by currencies">Currencies</button>
      </div>
      {countries.map(({ country, hubs }) => {
        const expanded = query ? hubs.length > 0 : expandedCountries.has(country.iso2);
        return (
          <div className="atlas-table__group" key={country.iso2}>
            <div className="atlas-table__country-row">
              <button
                type="button"
                className={["atlas-table__row", selected === country.iso2 && "atlas-table__row--selected"].filter(Boolean).join(" ")}
                onClick={() => onSelect(country.iso2)}
                onMouseEnter={() => onHover?.(country.iso2)}
                onMouseLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(country.iso2)}
                onBlur={() => onHover?.(null)}
                aria-label={`${name(country.iso2)}: ${denominatorText(country.banks_served, network.totals.beneficiary_banks, "beneficiary banks")}`}
              >
                <span data-label="Country"><strong>{name(country.iso2)}</strong><small className="mono">{country.iso2}</small></span>
                <span className="mono" data-label="Banks reached">{denominatorText(country.banks_served, network.totals.beneficiary_banks, "beneficiary banks")}</span>
                <span className="mono" data-label="Currencies">{denominatorText(country.currencies, network.totals.currencies, "currencies")}</span>
              </button>
              {hubs.length > 0 && <button type="button" className="atlas-table__toggle" aria-expanded={expanded} onClick={() => setExpandedCountries((current) => { const next = new Set(current); if (next.has(country.iso2)) next.delete(country.iso2); else next.add(country.iso2); return next; })}>{expanded ? "Hide institutions" : `Show ${hubs.length} institutions`}</button>}
            </div>
            {expanded && hubs.map((hub) => <Link className="atlas-table__institution" key={hub.bic} to={`/explore/banks/${hub.bic}`}><span data-label="Institution">{hub.name}</span><span className="mono" data-label="Reach">{denominatorText(hub.banks_served, country.banks_served, "banks")} · {denominatorText(hub.currencies, network.totals.currencies, "currencies")}</span></Link>)}
          </div>
        );
      })}
    </div>
  );
}
