import type { RouteStop } from "../../../design-system/payment-route/routeStops";
import type { AtlasCountry } from "./atlasSchemas";

/**
 * The correspondent with the most beneficiary banks. A tie keeps the first
 * in input order (Array.prototype.sort is stable). Does not mutate the input.
 */
export function topCorrespondent(country: AtlasCountry): AtlasCountry["correspondents"][number] | undefined {
  return [...country.correspondents].sort((a, b) => b.beneficiary_banks - a.beneficiary_banks)[0];
}

/**
 * Country data only counts when it belongs to the current selection. A query
 * can hold the previous country's data while the new one loads.
 */
export function routeCountryFor(selected: string | null | undefined, data: AtlasCountry | undefined): AtlasCountry | undefined {
  return selected && data && data.iso2 === selected ? data : undefined;
}

/**
 * Hub country to the selected country, through the selected country's top
 * correspondent. Returns no stops when the data has no correspondent or the
 * hub is the selected country, so nothing is invented. No stop is marked
 * passed: the atlas shows published relationships, not the result of a check.
 */
export function atlasRouteStops(hubIso2: string, selected: AtlasCountry): RouteStop[] {
  if (hubIso2 === selected.iso2) return [];
  const top = topCorrespondent(selected);
  if (!top) return [];
  return [
    { role: "origin", name: hubIso2, status: "not_checked" },
    { role: "correspondent", name: top.name, detail: top.bic, status: "not_checked" },
    { role: "beneficiary", name: selected.iso2, status: "not_checked" },
  ];
}
