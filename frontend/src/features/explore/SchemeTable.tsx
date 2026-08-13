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

/**
 * Summary table/card for the catalogue. A real table (column headers,
 * row headers) that stacks into labelled cards on narrow screens via
 * `data-label` attributes — the semantics stay intact for assistive tech.
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
                {scheme.name}
                {scopeOf(scheme) && (
                  <span className="scheme-table__scope">{scopeOf(scheme)}</span>
                )}
              </th>
              <td data-label="Speed">{scheme.speed}</td>
              <td data-label="Limit">{scheme.limit}</td>
              <td data-label="Cost">{scheme.cost}</td>
              <td data-label="Use case">{scheme.useCase}</td>
              <td data-label="Operator">{scheme.operator}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}