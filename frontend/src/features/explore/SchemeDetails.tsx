import { useId } from "react";
import type { SchemeInfo, InternationalSchemesResponse } from "../../api/schemas";
import "./SchemeDetails.css";

export type CatalogueScheme = SchemeInfo | InternationalSchemesResponse;

const LIMIT_LABELS: Array<[key: string, label: string]> = [
  ["perTransaction", "Per transaction"],
  ["perDay", "Per day"],
  ["perMonth", "Per month"],
  ["receiving", "Receiving"],
  ["note", "Note"],
];

/** The optional "International / SWIFT" scope label carried by the whole-catalogue rail. */
function scopeOf(scheme: CatalogueScheme): string | undefined {
  return "scope" in scheme && typeof scheme.scope === "string"
    ? scheme.scope
    : undefined;
}

/**
 * One rail's detail view. Sections render only when their data is present —
 * never empty headings. Variants are shown UNDER the parent rail and framed
 * as product variants of the same rail, not separate settlement rails.
 */
export interface SchemeDetailsProps {
  scheme: CatalogueScheme;
  /** Explicit "International / SWIFT" scope label when composing. */
  scopeLabel?: string;
}

export function SchemeDetails({ scheme, scopeLabel }: SchemeDetailsProps) {
  const uid = useId();
  const sectionId = (name: string) => `scheme-detail-${uid}-${name}`;

  const scope = scopeLabel ?? scopeOf(scheme);

  const howItWorks = scheme.howItWorks ?? [];
  const features = scheme.features ?? [];
  const limitRows = scheme.limits
    ? LIMIT_LABELS
        .map(([key, label]) => ({ key, label, value: scheme.limits?.[key] as string | undefined }))
        .filter((row) => Boolean(row.value))
    : [];
  const processingWindows = scheme.processingWindows ?? [];
  const protections = scheme.protections ?? [];
  const roadmap = scheme.roadmap ?? [];
  const variants = scheme.variants ?? [];
  const sources = scheme.sources ?? [];
  const hasReversibility = scheme.reversible !== null && scheme.reversible !== undefined;

  const showHowItWorks = howItWorks.length > 0 || features.length > 0;
  const showLimits = limitRows.length > 0 || processingWindows.length > 0;
  const showProtections =
    hasReversibility || protections.length > 0;

  return (
    <article className="scheme-details">
      <header className="scheme-details__header">
        <h2 className="scheme-details__name">{scheme.name}</h2>
        {scope && <p className="scheme-details__scope">{scope}</p>}
        <dl className="scheme-details__summary">
          <div>
            <dt>Speed</dt>
            <dd>{scheme.speed}</dd>
          </div>
          <div>
            <dt>Limit</dt>
            <dd>{scheme.limit}</dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>{scheme.cost}</dd>
          </div>
          <div>
            <dt>Use case</dt>
            <dd>{scheme.useCase}</dd>
          </div>
          <div>
            <dt>Operator</dt>
            <dd>{scheme.operator}</dd>
          </div>
        </dl>
      </header>

      {variants.length > 0 && (
        <section className="scheme-details__section" aria-labelledby={sectionId("variants")}>
          <h3 id={sectionId("variants")}>Product variants</h3>
          <p className="scheme-details__lede">
            Product variants of the same {scheme.family ?? scheme.name} rail —
            not separate settlement rails.
          </p>
          <ul className="scheme-details__variants">
            {variants.map((variant) => (
              <li key={variant.name}>
                <strong>{variant.name}</strong> — {variant.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      {showHowItWorks && (
        <section className="scheme-details__section" aria-labelledby={sectionId("how")}>
          <h3 id={sectionId("how")}>How it works</h3>
          {howItWorks.length > 0 && (
            <ul className="scheme-details__list">
              {howItWorks.map((step, index) => (
                <li key={`${step}-${index}`}>{step}</li>
              ))}
            </ul>
          )}
          {features.length > 0 && (
            <>
              <p className="scheme-details__sub-label">Key features</p>
              <ul className="scheme-details__list">
                {features.map((feature, index) => (
                  <li key={`${feature}-${index}`}>{feature}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {showLimits && (
        <section className="scheme-details__section" aria-labelledby={sectionId("limits")}>
          <h3 id={sectionId("limits")}>Limits &amp; timing</h3>
          {limitRows.length > 0 && (
            <dl className="scheme-details__limits">
              {limitRows.map(({ key, label, value }) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {processingWindows.length > 0 && (
            <>
              <p className="scheme-details__sub-label">Processing windows</p>
              <ul className="scheme-details__list">
                {processingWindows.map((window, index) => (
                  <li key={`${window}-${index}`}>{window}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {scheme.settlement && (
        <section className="scheme-details__section" aria-labelledby={sectionId("settlement")}>
          <h3 id={sectionId("settlement")}>Settlement</h3>
          <p className="scheme-details__body">{scheme.settlement}</p>
        </section>
      )}

      {showProtections && (
        <section className="scheme-details__section" aria-labelledby={sectionId("protections")}>
          <h3 id={sectionId("protections")}>Protections &amp; reversibility</h3>
          {hasReversibility && (
            <p className="scheme-details__body">
              <strong>Reversibility:</strong>{" "}
              {scheme.reversible ? "Reversible" : "Not reversible"}
            </p>
          )}
          {protections.length > 0 && (
            <ul className="scheme-details__list">
              {protections.map((protection, index) => (
                <li key={`${protection}-${index}`}>{protection}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {roadmap.length > 0 && (
        <section className="scheme-details__section" aria-labelledby={sectionId("roadmap")}>
          <h3 id={sectionId("roadmap")}>Roadmap</h3>
          <ul className="scheme-details__list">
            {roadmap.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {sources.length > 0 && (
        <section className="scheme-details__section" aria-labelledby={sectionId("sources")}>
          <h3 id={sectionId("sources")}>Sources</h3>
          <ul className="scheme-details__sources">
            {sources.map((source) => (
              <li key={source.url || source.name}>
                <a className="scheme-details__source" href={source.url}>
                  {source.name}
                  {source.label && source.label !== source.name && (
                    <span className="scheme-details__source-label">
                      {" · "}{source.label}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}