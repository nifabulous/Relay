import { orderedRails, railHighlights } from "../content";
import type { LandingFacts } from "../facts";
import { formatCount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

interface Panel {
  id: string;
  code: string;
  region: string;
  verifiedAsOf: string;
  schemes: Array<{ name: string; speed: string; limit: string; cost: string }>;
}

function count(n: number): string {
  return n === 1 ? "1 rail" : `${formatCount(n)} rails`;
}

export function Rails({ facts }: { facts: LandingFacts }) {
  const panels: Panel[] = [
    ...orderedRails(facts).map((c) => ({
      id: c.code.toLowerCase(),
      code: c.code,
      region: c.country,
      verifiedAsOf: c.verifiedAsOf,
      schemes: c.schemes,
    })),
    {
      id: "swift",
      code: "SWIFT",
      region: "Cross-border",
      verifiedAsOf: facts.rails.international.verifiedAsOf,
      schemes: [facts.rails.international],
    },
  ];
  const highlights = railHighlights(facts);
  return (
    <section className="s" id="rails">
      <Pluses />
      <div className="wrap">
        <Head
          label={<SectionLabel index="03" title="every rail, every currency" />}
          title={
            <>
              One payment. <em>{formatCount(facts.rails.totalRailCount)} rails</em> to learn.
            </>
          }
          lede={`${highlights[0].scheme} for ${highlights[0].code}, ${highlights[1].scheme} and ${highlights[2].scheme} for ${highlights[1].code}, ${highlights[3].scheme} for ${highlights[3].code}, ${highlights[4].scheme} for ${highlights[4].code}: each rail with its speed, limits and cost.`}
        />
        <div className="tabs" role="tablist" aria-label="Payment rails by currency" id="rail-tabs">
          {panels.map((panel, index) => (
            <button
              type="button"
              role="tab"
              key={panel.id}
              id={`rail-tab-${panel.id}`}
              aria-controls={`rail-panel-${panel.id}`}
              aria-selected={index === 0 ? "true" : "false"}
              tabIndex={index === 0 ? 0 : -1}
            >
              {panel.code}
            </button>
          ))}
        </div>
        <div className="panels" id="rail-panels">
          {panels.map((panel) => (
            <div className="panel" role="tabpanel" key={panel.id} id={`rail-panel-${panel.id}`} aria-labelledby={`rail-tab-${panel.id}`}>
              <div>
                <span className="lbl">
                  <i>[ {panel.code} ]</i> {panel.region}
                </span>
                <div className="big">{count(panel.schemes.length)}</div>
                <p className="desc">
                  Speed, limit and cost for each scheme, verified as of {panel.verifiedAsOf}.{" "}
                  <a href="/app/explore/schemes">Compare them in Explore</a>
                </p>
              </div>
              <div className="schemes">
                {panel.schemes.map((scheme) => (
                  <div key={scheme.name}>
                    <b>{scheme.name}</b>
                    <span>
                      <span className="k">speed</span>
                      {scheme.speed}
                    </span>
                    <span>
                      <span className="k">limit · cost</span>
                      {scheme.limit} · {scheme.cost}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
