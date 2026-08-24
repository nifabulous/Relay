import type { SchemeInfo, InternationalSchemesResponse } from "../../api/schemas";
import "./SchemeDetails.css";

export type CatalogueScheme = SchemeInfo | InternationalSchemesResponse;

const SUMMARY_COLUMNS = [
  "Rail",
  "Speed",
  "Limit",
  "Cost",
  "Use case",
  "Operator",
] as const;

/** The optional "International / SWIFT" scope label carried by the whole-catalogue rail. */
function scopeOf(scheme: CatalogueScheme): string | undefined {
  return "scope" in scheme && typeof scheme.scope === "string"
    ? scheme.scope
    : undefined;
}

function tileLabel(scheme: CatalogueScheme): string {
  const name = scheme.name.toLowerCase();
  if (name.includes("faster")) return "➤";
  if (name.includes("sepa")) return "★";
  if (name.includes("swift")) return "◎";
  if (name.includes("chaps")) return "✦";
  if (name.includes("fedwire")) return "◆";
  if (name.includes("ach")) return "×";
  return scheme.name.slice(0, 2).toUpperCase();
}

type Availability = "available" | "limited" | "domestic";

function availabilityOf(scheme: CatalogueScheme): { label: string; tone: Availability } {
  const name = scheme.name.toLowerCase();
  if (scopeOf(scheme)) return { label: "Available", tone: "available" };
  if (name.includes("chaps")) return { label: "Limited", tone: "limited" };
  if (name.includes("fedwire") || name === "ach") return { label: "Domestic", tone: "domestic" };
  return { label: "Available", tone: "available" };
}

/**
 * Summary cards for the catalogue. The real table semantics are retained so
 * screen readers and existing consumers still get column and row headers;
 * CSS turns each row into a responsive card on the visual surface.
 */
export function SchemeTable({ schemes }: { schemes: readonly CatalogueScheme[] }) {
  if (schemes.length === 0) return null;

  return (
    <div className="scheme-table__scroll">
      <table className="scheme-table">
        <caption className="scheme-table__caption">
          Payment schemes compared by speed, limit, cost, and use case
        </caption>
        <thead>
          <tr>
            {SUMMARY_COLUMNS.map((column) => (
              <th key={column} scope="col">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schemes.map((scheme) => (
            <tr key={scheme.name}>
              <th scope="row" data-label="Rail">
                <span className="scheme-table__identity">
                  <span className={["scheme-table__tile", `scheme-table__tile--${availabilityOf(scheme).tone}`].join(" ")} aria-hidden="true">
                    {tileLabel(scheme)}
                  </span>
                  <span className="scheme-table__identity-copy">
                    <strong className="scheme-table__name">{scheme.name}</strong>
                    {scopeOf(scheme) && (
                      <span className="scheme-table__scope">{scopeOf(scheme)}</span>
                    )}
                    <span className="scheme-table__description" aria-hidden="true" data-description={scheme.useCase} />
                  </span>
                </span>
              </th>
              <td data-label="Speed"><span className="scheme-table__meta-label">Speed</span><span>{scheme.speed}</span></td>
              <td data-label="Limit"><span className="scheme-table__meta-label">Limit</span><span>{scheme.limit}</span></td>
              <td data-label="Cost"><span className="scheme-table__meta-label">Cost</span><span>{scheme.cost}</span></td>
              <td data-label="Use case"><span className="scheme-table__meta-label">Use case</span><span>{scheme.useCase}</span></td>
              <td data-label="Operator">
                <span className="scheme-table__meta-label">Operator</span>
                <span className="scheme-table__operator">{scheme.operator}<span className="scheme-table__arrow" aria-hidden="true">›</span></span>
                <span className={["scheme-table__availability", `scheme-table__availability--${availabilityOf(scheme).tone}`].join(" ")}>
                  <span className="scheme-table__availability-dot" aria-hidden="true" />
                  {availabilityOf(scheme).label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
