import type { LandingFacts } from "../facts";
import { formatCount } from "../format";

const SOURCE_LABEL = { case: "case desk", rule: "corridor rule" } as const;

export function Hero({ facts }: { facts: LandingFacts }) {
  const { rails, corridors, corridorRules } = facts;
  // The globe enhancer reads its corridors from here; the page needs no data request.
  const globeData = JSON.stringify(
    corridors.map((c) => ({
      code: c.currency,
      from: [c.origin.lat, c.origin.lon],
      to: [c.destination.lat, c.destination.lon],
      fromLabel: c.origin.city.toUpperCase(),
      toLabel: c.destination.city.toUpperCase(),
    })),
  );
  return (
    <section className="hero" id="hero">
      <div className="cells" aria-hidden="true" />
      <div className="wrap copy">
        <span className="chip lbl" data-simulation="">
          <span className="dot" aria-hidden="true" />
          Simulation · no real money moves
        </span>
        <h1>
          See where a payment <em>actually</em> goes.
        </h1>
        <p className="lede">
          From IBAN checks to correspondent routing to tracking, Relay simulates the whole journey of a
          cross-border payment across {formatCount(rails.currencyCount)} currencies and{" "}
          {formatCount(rails.totalRailCount)} payment rails. The demonstration banks and every account are
          fictional.
        </p>
        <div className="ctas">
          <a className="btn pri lg" href="/app">
            Open the simulation
          </a>
          <a className="btn ghost lg" href="#route">
            Follow a payment ↓
          </a>
        </div>
      </div>
      <div className="wrap stage" id="globe-stage">
        <div className="corner ctl lbl">
          <i>[ drag ]</i>
          <b>Spin the globe any way</b>
          <button type="button" className="btn ghost tourbtn" id="tour-toggle" aria-pressed="false" hidden>
            Pause tour
          </button>
        </div>
        <div className="corner ctr lbl">
          <i>[ corridors ]</i>
          <b>
            {formatCount(corridors.length)} of {formatCount(corridorRules.corridors)} corridors, on a loop
          </b>
        </div>
        <div className="globe-wrap" aria-hidden="true">
          <canvas id="globe" />
        </div>
        <script type="application/json" id="globe-data" dangerouslySetInnerHTML={{ __html: globeData.replace(/</g, "\\u003c") }} />
      </div>
      <div className="wrap legend" id="legend" role="group" aria-label="Corridors shown on the globe">
        {corridors.map((corridor, index) => (
          <button type="button" key={corridor.currency} className={`sw${index + 1}`} data-corridor={index}>
            <span className="code">{corridor.currency}</span>
            <small>
              {corridor.origin.city} → {corridor.destination.city}
            </small>
            <em>{SOURCE_LABEL[corridor.source]}</em>
          </button>
        ))}
      </div>
    </section>
  );
}
