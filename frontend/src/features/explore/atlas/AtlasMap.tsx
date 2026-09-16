import { memo, useEffect, useMemo, useRef } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { scaleQuantile } from "d3-scale";
import { feature } from "topojson-client";
import { coverageState } from "./atlasEncoding";
import { iso2ForNumericId } from "./isoNumeric";
import type { AtlasSpoke } from "./atlasSchemas";
import type { AtlasTopology } from "./atlasTopology";

export type AtlasLayerDescriptor = { id: string; label: string };

/** The explicit layer seam keeps a future scale independently attributable. */
export function atlasLayerDescriptors(
  view: "spoke" | "hub",
  range: string,
  denominator: number,
  extras: AtlasLayerDescriptor[] = [],
): AtlasLayerDescriptor[] {
  const measure = view === "hub" ? "beneficiary banks reached" : "SSI rows collected";
  const denominatorNoun = view === "hub" ? "beneficiary banks" : "SSI rows";
  const measureLabel = view === "spoke"
    ? `Darker = more SSI rows we collected in this scope, not more correspondent banking. Range ${range} of ${denominator.toLocaleString()} ${denominatorNoun} in scope.`
    : `Dark = more ${measure}; range ${range} of ${denominator.toLocaleString()} ${denominatorNoun} in scope.`;
  const layers = [
    { id: "coverage", label: "Neutral = never collected · Dashed = collected, none in this scope · Filled = collected and in scope" },
    { id: "measure", label: measureLabel },
  ];
  if (view === "spoke") layers.push({ id: "evidence", label: "Five quantile bins · hatch = archived share (25% / 75% bands)" });
  return [...layers, ...extras];
}

type Props = {
  topology: AtlasTopology;
  data: Array<{ iso2: string; value: number }>;
  spokes: AtlasSpoke[];
  view: "spoke" | "hub";
  selected: string | null;
  denominator: number;
  onSelect: (iso2: string) => void;
  onHover?: (iso2: string | null) => void;
  loading?: boolean;
};

type Countries = { features: Array<{ id?: string | number; geometry: unknown }> };

export function AtlasMap({ selected, hovered, ...props }: Props & { hovered?: string | null }) {
  const mapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const paths = mapRef.current?.querySelectorAll<SVGPathElement>(".atlas-map__country") ?? [];
    paths.forEach((path) => {
      path.classList.toggle("atlas-map__country--selected", Boolean(selected && path.dataset.iso2 === selected));
      path.classList.toggle("atlas-map__country--hovered", Boolean(hovered && path.dataset.iso2 === hovered));
    });
  }, [hovered, selected, props.data, props.spokes, props.topology, props.view]);
  return (
    <div ref={mapRef} className={["atlas-map", props.loading && "atlas-map--loading"].filter(Boolean).join(" ")} data-selected={selected ?? undefined} data-hovered={hovered ?? undefined}>
      <AtlasMapGeometry {...props} />
    </div>
  );
}

/** Geometry is independent of URL selection, so selection only changes a container attribute. */
const AtlasMapGeometry = memo(function AtlasMapGeometry({ topology, data, spokes, view, denominator, onSelect, onHover, loading = false }: Omit<Props, "selected">) {
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);
  const countries = useMemo(
    () => feature(topology as never, topology.objects.countries as never) as unknown as Countries,
    [topology],
  );
  const showEvidence = view === "spoke";
  const valuesByIso = useMemo(() => new Map(data.map((item) => [item.iso2, item.value])), [data]);
  const archivedByIso = useMemo(
    () => showEvidence
      ? new Map(spokes.map((item) => [item.iso2, item.evidence.filter((e) => e.status === "archived").reduce((sum, e) => sum + e.count, 0)]))
      : new Map<string, number>(),
    [showEvidence, spokes],
  );
  const rowsByIso = useMemo(
    () => showEvidence ? new Map(spokes.map((item) => [item.iso2, item.rows])) : new Map<string, number>(),
    [showEvidence, spokes],
  );
  const domain = useMemo(() => data.map((item) => item.value).filter((value) => value > 0), [data]);
  const bins = useMemo(() => scaleQuantile<number, number>().domain(domain.length ? domain : [0]).range([1, 2, 3, 4, 5]), [domain]);
  const projection = useMemo(() => geoNaturalEarth1().fitSize([900, 470], countries as never), [countries]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const range = domain.length ? `${Math.min(...domain)}–${Math.max(...domain)}` : "0";
  const layers = atlasLayerDescriptors(view, range, denominator);
  const measure = view === "hub" ? "beneficiary banks reached" : "SSI rows collected";

  return (
    <>
      <p className="atlas-map__alternative">The map is exploratory; the table below is the complete text equivalent.</p>
      <svg className="atlas-map__svg" viewBox="0 0 900 470" role="img" aria-label={`World map of ${measure}`} aria-hidden="true">
        <g className="atlas-map__land">
          {countries.features.map((country, index) => {
            const resolvedIso = iso2ForNumericId(country.id);
            const value = resolvedIso ? valuesByIso.get(resolvedIso) : undefined;
            const archived = showEvidence && resolvedIso ? archivedByIso.get(resolvedIso) ?? 0 : 0;
            const total = showEvidence && resolvedIso ? rowsByIso.get(resolvedIso) ?? 0 : 0;
            const band = total > 0 && archived / total >= 0.75 ? "heavy" : total > 0 && archived / total >= 0.25 ? "light" : "none";
            const coverage = value == null ? "never-collected" : coverageState(true, value, "settleable");
            const classes = ["atlas-map__country", loading ? "atlas-map__country--loading" : `atlas-map__country--${coverage}`, !loading && value != null && value > 0 ? `atlas-map__country--bin-${bins(value)}` : "", !loading && showEvidence ? `atlas-map__country--hatch-${band}` : ""].filter(Boolean).join(" ");
            const label = resolvedIso ? `${resolvedIso}: ${value == null ? "never collected" : value === 0 ? "collected, none in this scope" : `${value.toLocaleString()} ${measure}`}` : "Unidentified geography";
            return <path key={`${country.id == null ? "no-id" : country.id}-${index}`} className={classes} data-iso2={resolvedIso} d={path(country as never) ?? ""} onClick={() => resolvedIso && !loading && onSelectRef.current(resolvedIso)} onMouseEnter={() => resolvedIso && onHoverRef.current?.(resolvedIso)} onMouseLeave={() => onHoverRef.current?.(null)}><title>{label}</title></path>;
          })}
        </g>
      </svg>
      <div className="atlas-map__legend" aria-label="Map legend">
        {layers.map((layer) => <span key={layer.id} data-layer={layer.id}>{layer.label}</span>)}
      </div>
    </>
  );
}, (previous, next) => previous.topology === next.topology && previous.data === next.data && previous.spokes === next.spokes && previous.view === next.view && previous.denominator === next.denominator && previous.loading === next.loading);
