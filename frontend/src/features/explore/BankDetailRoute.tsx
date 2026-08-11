import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiKeys } from "../../api/queryKeys";
import { apiRequest } from "../../api/client";
import { LookupResponseSchema, SSIResponseSchema, RouteResponseSchema } from "../../api/schemas";
import type {
  LookupResponse,
  SSIResponse,
  RouteResponse,
  SuggestedIntermediary,
} from "../../api/schemas";
import { AsyncRegion } from "../../design-system/AsyncRegion";
import { PaymentRoute } from "../../design-system/payment-route/PaymentRoute";
import { buildRouteNodes } from "../../design-system/payment-route/routeNodes";
import { groupByCurrency } from "./ssiGrouping";
import type { AsyncStatus } from "../../design-system/types";
import type { ApiProblem } from "../../api/problem";
import "./ExplorePage.css";

const CONFIDENCE_RANK: Record<SuggestedIntermediary["confidence"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * The confidence of the weakest hop in a suggested chain.
 *
 * A chain is only as trustworthy as its least certain leg, and the seeded
 * corridor table disagrees hop to hop for 122 of the 139 banks that render a
 * chain. Reporting `intermediaries[0]` would tell the learner a route is more
 * reliable than the curated table claims — the same overstatement the
 * "Possible" chips exist to avoid.
 *
 * Caller guarantees a non-empty list (the chain only renders when it has hops).
 */
function weakestConfidence(
  intermediaries: SuggestedIntermediary[],
): SuggestedIntermediary["confidence"] {
  return intermediaries.reduce((weakest, hop) =>
    CONFIDENCE_RANK[hop.confidence] < CONFIDENCE_RANK[weakest.confidence] ? hop : weakest,
  ).confidence;
}

/**
 * Bank detail — `/app/explore/banks/:bic`.
 *
 * All three backing endpoints resolve a BIC by exact match, then the 8-char
 * prefix, then the 6-char prefix, so a branch BIC resolves to its head office.
 * When that happens the page says so rather than presenting an institution's
 * records as a specific branch's.
 */
export function BankDetailRoute() {
  const { bic: rawBic } = useParams<{ bic: string }>();
  const requestedBic = (rawBic ?? "").toUpperCase();

  const lookup = useQuery({
    queryKey: apiKeys.lookup(requestedBic),
    queryFn: () =>
      apiRequest<LookupResponse>(
        `/api/lookup?bic=${encodeURIComponent(requestedBic)}`,
        undefined,
        LookupResponseSchema,
      ),
    enabled: requestedBic.length > 0,
  });

  // The ssi and heuristic queries must stay ABOVE the not-found early return:
  // hooks run unconditionally on every render, so a query placed after the
  // return would violate the rules of hooks the first time a BIC misses.

  const ssi = useQuery({
    queryKey: apiKeys.ssi(requestedBic, ""),
    queryFn: () =>
      apiRequest<SSIResponse>(
        `/api/ssi?bic=${encodeURIComponent(requestedBic)}`,
        undefined,
        SSIResponseSchema,
      ),
    enabled: requestedBic.length > 0,
  });

  const instructions = ssi.data?.instructions ?? [];
  const currencyGroups = groupByCurrency(instructions);
  const hasSSI = currencyGroups.length > 0;

  const bank = lookup.data?.bank ?? null;

  const routeCurrency = bank?.country_currency || "USD";

  // Fired in parallel with the SSI query rather than after it. 87% of banks have
  // no published SSI, so a conditional fetch would make the common case pay two
  // sequential round trips to save one request for the uncommon case.
  const heuristic = useQuery({
    queryKey: apiKeys.route(requestedBic, routeCurrency),
    queryFn: () =>
      apiRequest<RouteResponse>(
        `/api/route?bic=${encodeURIComponent(requestedBic)}&currency=${encodeURIComponent(routeCurrency)}`,
        undefined,
        RouteResponseSchema,
      ),
    enabled: requestedBic.length > 0 && Boolean(bank),
  });

  // The route param is what the learner typed; bank.bic is what the API
  // resolved it to. They differ for any branch BIC.
  const resolvedDiffers = Boolean(bank && bank.bic && bank.bic !== requestedBic);

  // Not-found is a page-level state, NOT an AsyncRegion empty slot. AsyncRegion
  // returns its own empty message *instead of* children for status="empty", so
  // a not-found block passed as a child would never render.
  if (lookup.data && !lookup.data.found) {
    return (
      <div className="explore">
        <nav className="explore__breadcrumb" aria-label="Breadcrumb">
          <Link to="/explore/banks">Bank Directory</Link>
          <span aria-hidden="true">/</span>
          <span className="mono">{requestedBic}</span>
        </nav>
        <div className="bank-detail__not-found">
          <h1>Bank not found</h1>
          <p className="measure">
            No bank in the directory matches <span className="mono">{requestedBic}</span>.
            The BIC may be mistyped, or the link may be out of date.
          </p>
          <Link to="/explore/banks" className="relay-btn relay-btn--secondary">
            Back to Bank Directory
          </Link>
        </div>
      </div>
    );
  }

  // Only loading / error / success reach AsyncRegion now.
  let status: AsyncStatus = "loading";
  if (lookup.isError) status = "error";
  else if (lookup.data) status = "success";

  return (
    <div className="explore">
      <nav className="explore__breadcrumb" aria-label="Breadcrumb">
        <Link to="/explore/banks">Bank Directory</Link>
        <span aria-hidden="true">/</span>
        <span className="mono">{requestedBic}</span>
      </nav>

      <AsyncRegion
        status={status}
        loadingLabel="Loading bank"
        error={lookup.error as ApiProblem | null}
        onRetry={() => lookup.refetch()}
      >
        {bank && (
          <>
            <div className="bank-detail">
              <h1 className="bank-detail__name">{bank.bank_name}</h1>
              <dl className="bank-detail__grid">
                <dt>BIC</dt>
                <dd className="mono">{bank.bic}</dd>
                {bank.country_code && (
                  <>
                    <dt>Country</dt>
                    <dd className="mono">{bank.country_code}</dd>
                  </>
                )}
                {bank.city && (
                  <>
                    <dt>City</dt>
                    <dd>{bank.city}</dd>
                  </>
                )}
                {bank.country_currency && (
                  <>
                    <dt>Currency</dt>
                    <dd className="mono">{bank.country_currency}</dd>
                  </>
                )}
              </dl>

              {resolvedDiffers && (
                <p className="bank-detail__resolution">
                  Showing institution-level records for{" "}
                  <span className="mono">{bank.bic}</span>. The BIC you searched
                  resolves to this institution rather than a specific branch.
                </p>
              )}

              <div className="bank-detail__actions">
                <Link
                  to={`/operate/prepare?bic=${encodeURIComponent(bank.bic)}`}
                  className="relay-btn relay-btn--secondary"
                >
                  Prepare payment to this bank
                </Link>
              </div>
            </div>

            {hasSSI && (
              <section className="bank-ssi" aria-labelledby="bank-ssi-title">
                <h2 id="bank-ssi-title">Published settlement instructions</h2>
                <p className="measure bank-ssi__intro">
                  Where this bank holds Nostro accounts, and which correspondent
                  to pay for each currency. A currency can list more than one
                  correspondent.
                </p>

                {currencyGroups.map((group) => (
                  <div className="bank-ssi__group" key={group.currency}>
                    <h3 className="bank-ssi__currency mono">{group.currency}</h3>
                    <ul className="bank-ssi__list">
                      {group.records.map((r, index) => (
                        // The index disambiguates: /api/import/ssi can add rows,
                        // so currency + intermediary BIC is not guaranteed unique
                        // even though the seeded data has no collisions today.
                        <li
                          className="bank-ssi__item"
                          key={`${group.currency}-${r.intermediary_bic}-${index}`}
                        >
                          <p className="bank-ssi__intermediary">
                            {r.intermediary_bank_name ?? r.intermediary_bic}
                          </p>
                          <dl className="bank-ssi__fields">
                            <dt>Intermediary BIC</dt>
                            <dd className="mono">{r.intermediary_bic}</dd>
                            {r.intermediary_account && (
                              <>
                                <dt>Nostro account</dt>
                                <dd className="mono">{r.intermediary_account}</dd>
                              </>
                            )}
                            {r.beneficiary_account && (
                              <>
                                <dt>Credit to</dt>
                                <dd className="mono">{r.beneficiary_account}</dd>
                              </>
                            )}
                            <dt>Charges</dt>
                            <dd className="mono">{r.charge_code}</dd>
                            <dt>Value date</dt>
                            <dd>{r.value_date}</dd>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {ssi.data?.disclaimer && (
                  <p className="bank-ssi__disclaimer">{ssi.data.disclaimer}</p>
                )}
              </section>
            )}

            {ssi.isError && (
              <div className="bank-ssi__error">
                <p>
                  Published settlement instructions could not be loaded for this bank.
                </p>
                <button
                  type="button"
                  className="relay-btn relay-btn--secondary"
                  onClick={() => ssi.refetch()}
                >
                  Retry settlement instructions
                </button>
              </div>
            )}

            {ssi.data !== undefined && !hasSSI && (
              <section className="bank-route" aria-labelledby="bank-route-title">
                <h2 id="bank-route-title">Heuristic correspondent route</h2>

                {heuristic.isError ? (
                  <p className="bank-route__error">
                    No published settlement instructions are on file for this
                    bank, and the suggested chain could not be loaded. Try
                    reloading the page.
                  </p>
                ) : (
                  <p className="measure bank-route__intro">
                    No published settlement instructions are on file for this
                    bank. Real correspondent relationships are private and
                    bank-specific, so the chain below is an informed suggestion
                    from the curated corridor table — not a published
                    instruction.
                  </p>
                )}

                {heuristic.data && heuristic.data.suggested_intermediaries.length > 0 && (
                  <>
                    <PaymentRoute
                      nodes={buildRouteNodes(
                        heuristic.data.suggested_intermediaries,
                        bank.bic,
                        "possible",
                      )}
                      currency={heuristic.data.currency}
                    />
                    <dl className="bank-route__meta">
                      <dt>Confidence (weakest hop)</dt>
                      <dd>{weakestConfidence(heuristic.data.suggested_intermediaries)}</dd>
                      <dt>Source</dt>
                      <dd>{heuristic.data.source}</dd>
                    </dl>
                  </>
                )}

                {heuristic.data &&
                  heuristic.data.suggested_intermediaries.length === 0 &&
                  heuristic.data.notes && (
                    <p className="bank-route__notes measure">{heuristic.data.notes}</p>
                  )}
              </section>
            )}
          </>
        )}
      </AsyncRegion>
    </div>
  );
}
