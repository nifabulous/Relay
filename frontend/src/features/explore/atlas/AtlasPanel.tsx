import { Link } from "react-router-dom";
import type { AtlasCountry, AtlasHub, AtlasHubCountry } from "./atlasSchemas";
import { denominatorText } from "./atlasEncoding";
import { format } from "./formatters";

type Props = {
  view: "hub" | "spoke";
  country?: AtlasCountry;
  hubCountry?: AtlasHubCountry;
  hubs: AtlasHub[];
  totalBeneficiaryBanks: number;
  totalCorrespondents: number;
  totalCurrencies: number;
  isLoading: boolean;
  isError: boolean;
  countryName: string;
  isDefault?: boolean;
  onRetry: () => void;
};

export function AtlasPanel({ view, country, hubCountry, hubs, totalBeneficiaryBanks, totalCorrespondents, totalCurrencies, isLoading, isError, countryName, isDefault = false, onRetry }: Props) {
  const isHub = view === "hub";
  return <aside className="atlas-panel" aria-labelledby="atlas-panel-title">
    <div className="atlas-panel__heading"><div><p className="atlas__eyebrow">{isDefault ? "Default country" : "Selected country"}</p><h2 id="atlas-panel-title">{countryName} {isHub ? "correspondent" : "network"} position</h2></div></div>
    {!isHub && isLoading && <p role="status">Loading country detail…</p>}
    {!isHub && isError && <div role="alert"><p>Country detail could not be loaded.</p><button type="button" className="relay-btn relay-btn--secondary" onClick={onRetry}>Retry</button></div>}
    {!isHub && country && <>
      {!country.collected ? <p>No rows collected for {countryName}.</p> : country.in_scope.rows === 0 && country.all_scopes.rows > 0 ? <p>{format(country.all_scopes.rows)} of {format(country.all_scopes.ssi_rows_total)} rows collected, none of them rows with instruction fields.</p> : <p>{format(country.in_scope.rows)} of {format(country.in_scope.ssi_rows_total)} rows collected across {format(country.in_scope.beneficiary_banks)} of {format(country.in_scope.beneficiary_banks_total)} beneficiary banks.</p>}
      <div className="atlas-panel__correspondents">{country.correspondents.map((correspondent) => <section key={correspondent.bic}><h3>{correspondent.name}</h3><p className="mono">{correspondent.bic} · {correspondent.currencies.join(", ")}</p><ul>{correspondent.disclosures.map((disclosure) => <li key={`${disclosure.beneficiary_bic}-${disclosure.status}-${disclosure.bic_only}`}><Link to={`/explore/banks/${disclosure.beneficiary_bic}`}>{disclosure.beneficiary_bank_name}</Link><span>{denominatorText(disclosure.row_count, country.in_scope.rows, "rows")} · {disclosure.status}</span></li>)}</ul></section>)}</div>
    </>}
    {isHub && hubCountry && <>
      <p>{denominatorText(hubCountry.banks_served, totalBeneficiaryBanks, "beneficiary banks")} reached through {denominatorText(hubCountry.correspondents, totalCorrespondents, "correspondents")} across {denominatorText(hubCountry.currencies, totalCurrencies, "currencies")}.</p>
      <div className="atlas-panel__correspondents">{hubs.map((hub) => <section key={hub.bic}><h3><Link to={`/explore/banks/${hub.bic}`}>{hub.name}</Link></h3><p className="mono">{hub.bic}</p><p>{denominatorText(hub.banks_served, totalBeneficiaryBanks, "beneficiary banks")} · {denominatorText(hub.currencies, totalCurrencies, "currencies")}</p></section>)}</div>
    </>}
    {isHub && !hubCountry && <p>No correspondent rows collected for {countryName}.</p>}
  </aside>;
}
