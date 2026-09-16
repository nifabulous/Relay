import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { apiKeys } from "../../api/queryKeys";
import { AsyncRegion } from "../../design-system/AsyncRegion";
import type { ApiProblem } from "../../api/problem";
import {
  AtlasCountrySchema,
  AtlasNetworkSchema,
  type AtlasCountry,
  type AtlasNetwork,
  type AtlasScope,
} from "./atlas/atlasSchemas";
import { AtlasMap } from "./atlas/AtlasMap";
import { AtlasTable } from "./atlas/AtlasTable";
import { AtlasPanel } from "./atlas/AtlasPanel";
import { format } from "./atlas/formatters";
import { KNOWN_UNRESOLVABLE, iso2ForNumericId } from "./atlas/isoNumeric";
import { coverageCounts } from "./atlas/atlasEncoding";
import { parseAtlasTopology } from "./atlas/atlasTopology";
import { buildAtlasContext } from "../tutor/tutorContext";
import { usePublishTutorContext } from "../tutor/tutorSurfaceStore";
import "./atlas/AtlasPage.css";
import topologyUrl from "./atlas/assets/countries-50m.json?url";

export function AtlasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "spoke" ? "spoke" : "hub";
  const scope: AtlasScope = searchParams.get("scope") === "settleable" ? "settleable" : "all";
  const selectedParam = searchParams.get("selected");
  const selected = selectedParam && /^[A-Za-z]{2}$/.test(selectedParam)
    ? selectedParam.toUpperCase()
    : null;
  const search = searchParams.get("q") ?? "";
  const sortParam = searchParams.get("sort");
  const sort: "reach" | "name" | "currencies" = sortParam === "name" || sortParam === "currencies" ? sortParam : "reach";
  const direction = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const [hovered, setHovered] = useState<string | null>(null);
  const autoSelectedSearch = useRef<string | null>(null);

  const setAtlasState = (patch: { view?: "spoke" | "hub"; scope?: AtlasScope; selected?: string | null; sort?: string; direction?: "asc" | "desc" }) => {
    const next = new URLSearchParams(searchParams);
    if (patch.view) next.set("view", patch.view);
    if (patch.scope) next.set("scope", patch.scope);
    if (patch.selected === null) next.delete("selected");
    else if (patch.selected) next.set("selected", patch.selected.toUpperCase());
    if (patch.sort) next.set("sort", patch.sort);
    if (patch.direction) next.set("dir", patch.direction);
    setSearchParams(next);
  };
  const selectCountry = useCallback((iso2: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("selected", iso2.toUpperCase());
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAtlasState({ selected: null });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, searchParams]);

  const network = useQuery({
    queryKey: apiKeys.atlasNetwork(scope),
    queryFn: () => apiRequest<AtlasNetwork>(`/api/atlas/network?scope=${scope}`, undefined, AtlasNetworkSchema),
  });

  const defaultCountry = view === "hub"
    ? network.data?.hub_countries[0]?.iso2
    : network.data?.spokes.find((item) => item.rows > 0)?.iso2 ?? network.data?.spokes[0]?.iso2;
  const panelIso2 = selected ?? defaultCountry ?? null;
  const country = useQuery({
    queryKey: panelIso2 ? apiKeys.atlasCountry(panelIso2, scope) : ["atlas", "country", "idle"],
    queryFn: () => apiRequest<AtlasCountry>(`/api/atlas/country/${encodeURIComponent(panelIso2!)}?scope=${scope}`, undefined, AtlasCountrySchema),
    enabled: Boolean(panelIso2) && view === "spoke",
  });

  const topology = useQuery({
    queryKey: ["atlas", "topology"],
    queryFn: async () => {
      const response = await fetch(topologyUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("The atlas geography could not be loaded.");
      if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        throw new Error("The atlas geography returned a non-JSON response.");
      }
      const value: unknown = await response.json();
      return parseAtlasTopology(value);
    },
    staleTime: Infinity,
  });

  const data = network.data;
  const selectedHubCountry = data?.hub_countries.find((item) => item.iso2 === panelIso2);
  const selectedHubs = data?.hubs.filter((item) => item.iso2 === panelIso2) ?? [];
  const spokes = data?.spokes ?? [];
  const activeRows = useMemo(() => {
    if (!data) return [];
    return view === "hub" ? data.hub_countries.map((item) => ({ iso2: item.iso2, value: item.banks_served })) : data.spokes.map((item) => ({ iso2: item.iso2, value: item.rows }));
  }, [data, view]);
  const drawableCodes = useMemo(() => new Set(
    topology.data?.objects.countries.geometries.flatMap((geometry) => {
      const iso2 = iso2ForNumericId(geometry.id);
      return iso2 ? [iso2] : [];
    }) ?? [],
  ), [topology.data]);
  const coverage = useMemo(() => {
    if (!data || !topology.data) return null;
    const observedCodes = view === "hub" ? data.observed_intermediary_country_codes : data.observed_beneficiary_country_codes;
    return coverageCounts(observedCodes, activeRows, drawableCodes);
  }, [activeRows, data, drawableCodes, topology.data, view]);
  const searchSelection = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data || !query) return null;
    const observedCodes = view === "hub"
      ? data.observed_intermediary_country_codes
      : data.observed_beneficiary_country_codes;
    const exactCountry = observedCodes.find((iso2) => iso2.toLowerCase() === query || countryName(iso2).toLowerCase() === query);
    if (exactCountry) return exactCountry;
    return data.hubs.find((hub) => hub.bic.toLowerCase() === query || hub.name.toLowerCase() === query)?.iso2 ?? null;
  }, [data, search, view]);
  const archivedRows = useMemo(() => new Map(spokes.map((item) => [item.iso2, item.evidence.filter((e) => e.status === "archived").reduce((sum, e) => sum + e.count, 0)])), [spokes]);

  useEffect(() => {
    if (!searchSelection) {
      autoSelectedSearch.current = null;
      return;
    }
    const selectionKey = `${search}|${searchSelection}`;
    if (autoSelectedSearch.current === selectionKey) return;
    autoSelectedSearch.current = selectionKey;
    if (selected !== searchSelection) setAtlasState({ selected: searchSelection });
  }, [search, searchSelection, selected, searchParams]);

  usePublishTutorContext(buildAtlasContext({
    view,
    scope,
    selected,
    summary: data ? `${format(data.totals.beneficiary_banks)} beneficiary banks and ${format(data.totals.correspondents)} correspondents are represented in the selected atlas scope.` : undefined,
  }));

  return (
    <div className="explore atlas" data-view={view} data-scope={scope}>
      <header className="atlas__title-block">
        <p className="atlas__eyebrow">Explore / Network position</p>
        <h1>Correspondent atlas</h1>
        <p className="atlas__lede measure">
          An observed network of banks and correspondents. It describes collected SSI relationships, not payment volume or market share.
        </p>
        {data && <p className="atlas__concentration">{data.hubs.filter((hub) => hub.banks_served >= 10).length} institutions serve at least ten beneficiary banks; {data.hubs.filter((hub) => hub.banks_served === 1).length} correspondents appear exactly once.</p>}
      </header>

      <div className="atlas__controls" role="group" aria-label="Atlas controls">
        <div className="atlas__segmented" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "hub"} onClick={() => setAtlasState({ view: "hub" })}>Who does the reaching</button>
          <button type="button" aria-pressed={view === "spoke"} onClick={() => setAtlasState({ view: "spoke" })}>Who gets reached</button>
        </div>
        <div className="atlas__segmented" role="group" aria-label="Scope">
          <button type="button" aria-pressed={scope === "all"} onClick={() => setAtlasState({ scope: "all" })}>All collected rows</button>
          <button type="button" aria-pressed={scope === "settleable"} onClick={() => setAtlasState({ scope: "settleable" })}>Rows with instruction fields</button>
        </div>
      </div>
      <label className="atlas__search">
        <span>Search countries or institutions</span>
        <input
          type="search"
          value={search}
          placeholder="Try US, Citibank, or a BIC"
          onChange={(event) => {
            const next = new URLSearchParams(searchParams);
            if (event.target.value) next.set("q", event.target.value);
            else next.delete("q");
            setSearchParams(next);
          }}
        />
      </label>

      <AsyncRegion
        status={network.isError ? "error" : "success"}
        loadingLabel="Loading correspondent atlas"
        error={network.error as ApiProblem | null}
        onRetry={() => network.refetch()}
        partialNote={topology.isError ? "The map is unavailable, but the complete table remains available. Retry the geography request to restore it." : undefined}
      >
        {!data && !network.isError && <div className="atlas__loading-shell" aria-busy="true">
          <div className="atlas__metrics" aria-label="Loading atlas sample" role="status">
            <div><strong className="mono">—</strong><span>beneficiary banks</span></div>
            <div><strong className="mono">—</strong><span>correspondents</span></div>
            <div><strong className="mono">—</strong><span>drawable countries</span></div>
          </div>
          <div className="atlas__map-loading" role="status">
            {topology.data ? <AtlasMap topology={topology.data} data={[]} spokes={[]} view={view} selected={null} denominator={0} onSelect={selectCountry} loading /> : "Loading geography…"}
          </div>
        </div>}
        {data && (
          <>
            {data.totals.ssi_rows === 0 && <div className="atlas__empty" role="status"><p>No SSI rows are loaded, so the atlas cannot describe a network yet.</p><button type="button" className="relay-btn relay-btn--secondary" onClick={() => network.refetch()}>Retry</button></div>}
            <div className="atlas__metrics" aria-label="Atlas sample">
              <div><strong className="mono">{network.isFetching ? "—" : format(data.totals.beneficiary_banks)}</strong><span>beneficiary banks</span></div>
              <div><strong className="mono">{network.isFetching ? "—" : format(data.totals.correspondents)}</strong><span>correspondents</span></div>
              <div><strong className="mono">{network.isFetching || !coverage ? "—" : format(coverage.inScope)}</strong><span>{network.isFetching ? "loading current scope" : coverage ? `of ${format(drawableCodes.size)} drawable countries` : "drawable countries pending map"}</span></div>
            </div>

            <div className="atlas__workarea">
              <section className="atlas__table-column" aria-labelledby="atlas-table-title">
                <div className="atlas__section-heading"><h2 id="atlas-table-title">{view === "hub" ? "Correspondent hubs" : "Beneficiary countries"}</h2><span className="atlas__table-count mono">{format(activeRows.length)}</span></div>
                <AtlasTable network={data} view={view} scope={scope} search={search} selected={selected} sort={sort} direction={direction} onSort={(nextSort) => setAtlasState({ sort: nextSort, direction: nextSort === sort && direction === "desc" ? "asc" : "desc" })} onSelect={selectCountry} onHover={setHovered} archivedRows={archivedRows} />
              </section>
              <section className="atlas__map-column" aria-labelledby="atlas-map-title">
                <div className="atlas__section-heading"><h2 id="atlas-map-title">{view === "hub" ? "Who does the reaching" : "Who gets reached"}</h2><span className="atlas__map-range">{view === "hub" ? "Beneficiary banks reached" : "Rows collected"}</span></div>
                {topology.data ? <AtlasMap topology={topology.data} data={activeRows} spokes={view === "spoke" ? spokes : []} view={view} selected={selected} hovered={hovered} denominator={view === "hub" ? data.totals.beneficiary_banks : data.totals.ssi_rows} onSelect={selectCountry} onHover={setHovered} loading={network.isFetching || topology.isFetching} /> : topology.isError ? <button type="button" className="relay-btn relay-btn--secondary" onClick={() => topology.refetch()}>Retry map</button> : <div className="atlas__map-loading" role="status">Loading geography…</div>}
                <section className="atlas__coverage atlas__coverage--map" aria-labelledby="atlas-coverage-title">
                  <h2 id="atlas-coverage-title">Coverage frame</h2>
                  {network.isFetching ? <p role="status">Loading current scope…</p> : coverage ? <>
                    <p>{format(coverage.neverCollected)} never-collected, {format(coverage.outOfScope)} collected but out of scope, and {format(coverage.inScope)} collected and in scope across {format(drawableCodes.size)} drawable {view === "hub" ? "correspondent" : "beneficiary"} countries.</p>
                    {coverage.outOfScopeCodes.length > 0 && <p>Collected but out of scope: <span className="mono">{coverage.outOfScopeCodes.join(", ")}</span>.</p>}
                    {coverage.unmapped.length > 0 && <p>Observed but not drawable: <span className="mono">{coverage.unmapped.join(", ")}</span> ({coverage.unmapped.map((code) => KNOWN_UNRESOLVABLE[code] ?? "no topology feature recorded").join("; ")}).</p>}
                  </> : <p>Coverage states will appear when the geography is ready.</p>}
                  <p className="atlas__status-summary">Evidence rows: {data.by_status_and_tier.map((item) => `${format(item.count)} of ${format(data.totals.ssi_rows)} ${item.status}${item.bic_only ? " BIC-only" : ""}`).join(" · ")}.</p>
                </section>
              </section>
              {panelIso2 && <AtlasPanel view={view} country={country.data} hubCountry={selectedHubCountry} hubs={selectedHubs} totalBeneficiaryBanks={data.totals.beneficiary_banks} totalCorrespondents={data.totals.correspondents} totalCurrencies={data.totals.currencies} isLoading={country.isLoading} isError={country.isError} countryName={countryName(panelIso2)} isDefault={!selected} onRetry={() => country.refetch()} />}
            </div>

            <p className="atlas__disclaimer" role="note">{data.disclaimer}</p>
          </>
        )}
      </AsyncRegion>
    </div>
  );
}

function countryName(iso2: string): string {
  const names: Record<string, string> = { US: "United States", GB: "United Kingdom", DE: "Germany", FR: "France", CA: "Canada", IN: "India", JP: "Japan", NG: "Nigeria", AU: "Australia", SG: "Singapore", AD: "Andorra" };
  return names[iso2] ?? new Intl.DisplayNames(["en"], { type: "region" }).of(iso2) ?? iso2;
}
