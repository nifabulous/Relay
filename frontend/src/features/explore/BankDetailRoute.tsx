import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiKeys } from "../../api/queryKeys";
import { apiRequest } from "../../api/client";
import { LookupResponseSchema } from "../../api/schemas";
import type { LookupResponse } from "../../api/schemas";
import { AsyncRegion } from "../../design-system/AsyncRegion";
import type { AsyncStatus } from "../../design-system/types";
import type { ApiProblem } from "../../api/problem";
import "./ExplorePage.css";

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

  // ── Later tasks insert their queries here ──────────────────────────────
  // Task 4 adds the SSI query, Task 5 the heuristic route query. They belong
  // ABOVE the not-found early return: hooks must run unconditionally on every
  // render, so a query placed after the return would violate the rules of
  // hooks the first time a BIC misses.

  const bank = lookup.data?.bank ?? null;

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
          </>
        )}
      </AsyncRegion>
    </div>
  );
}