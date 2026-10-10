import type { RouteStop } from "../../../design-system/payment-route/routeStops";
import type { AtlasCountry } from "./atlasSchemas";

/**
 * Hub country to the selected country, through the selected country's
 * correspondent with the most beneficiary banks. Returns no stops when the
 * data has no correspondent, so nothing is invented.
 */
export function atlasRouteStops(hubIso2: string, selected: AtlasCountry): RouteStop[] {
  const top = [...selected.correspondents].sort((a, b) => b.beneficiary_banks - a.beneficiary_banks)[0];
  if (!top) return [];
  return [
    { role: "origin", name: hubIso2, status: "not_checked" },
    { role: "correspondent", name: top.name, detail: top.bic, status: "passed" },
    { role: "beneficiary", name: selected.iso2, status: "not_checked" },
  ];
}
