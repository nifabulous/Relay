import type { Demo } from "../demo";
import type { LandingFacts } from "../facts";
import { formatCount } from "../format";
import { Pluses } from "./shared";

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <span className="lbl">
        <i>[</i> {label} <i>]</i>
      </span>
      <b data-count="">{value}</b>
      <small>{note}</small>
    </div>
  );
}

export function Stats({ facts, demo }: { facts: LandingFacts; demo: Demo }) {
  const { directory, ssi, rails } = facts;
  return (
    <section className="s stats" aria-label="Relay in numbers">
      <Pluses />
      <div className="wrap grid g4 flush">
        <Stat label="banks" value={formatCount(directory.banks)} note={`in the directory, across ${formatCount(directory.countries)} countries`} />
        <Stat label="settlement routes" value={formatCount(ssi.rows)} note="SSI rows, each with its provenance" />
        <Stat
          label="payment rails"
          value={formatCount(rails.totalRailCount)}
          note={`${formatCount(rails.domesticSchemeCount)} domestic schemes in ${formatCount(rails.currencyCount)} currencies, plus SWIFT gpi`}
        />
        <Stat label="real money moved" value={demo.realMoneyMoved} note="it is a simulation, always" />
      </div>
      <p className="wrap caption lbl">Counts describe the reference data shipped with this release.</p>
    </section>
  );
}
