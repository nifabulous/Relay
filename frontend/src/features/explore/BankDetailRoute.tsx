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
import { SettlementInstructions } from "./SettlementInstructions";
import { StatusChip } from "../../design-system/StatusChip";
import type { AsyncStatus } from "../../design-system/types";
import type { ApiProblem } from "../../api/problem";
import "./ExplorePage.css";

const CONFIDENCE_RANK: Record<SuggestedIntermediary["confidence"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const COUNTRY_NAMES: Record<string, string> = {
  GB: "United Kingdom",
  US: "United States",
  DE: "Germany",
  FR: "France",
  IN: "India",
  NG: "Nigeria",
  AE: "United Arab Emirates",
  JP: "Japan",
  CA: "Canada",
  AU: "Australia",
};

function countryName(code: string | undefined) {
  if (!code) return "Country not specified";
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

function bankMonogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "BK";
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

type PotentialRailRow = {
  name: string;
  description: string;
  status: "verified" | "under_review";
};

function potentialRails(currency: string | undefined): PotentialRailRow[] {
  const normalized = currency?.toUpperCase();
  const domestic = normalized === "GBP"
    ? { name: "CHAPS", description: "Same-day high-value settlement" }
    : normalized === "EUR"
      ? { name: "SEPA", description: "Euro credit transfers" }
      : normalized === "USD"
        ? { name: "Fedwire", description: "Real-time gross settlement" }
        : { name: normalized ? `${normalized} clearing` : "Local clearing", description: "Domestic payment settlement" };

  return [
    // Lookup only establishes the institution identity and its directory
    // currency. It does not establish bank-level verification or bilateral
    // scheme membership, so currency-derived rows must remain under review.
    { name: "SWIFT MT103", description: "Global correspondent messaging", status: "under_review" },
    { name: domestic.name, description: domestic.description, status: "under_review" },
    { name: normalized === "GBP" ? "SEPA" : "Correspondent settlement", description: "Cross-border payment routing", status: "under_review" },
  ];
}

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
            <div className="bank-detail bank-detail--route">
            <section className="bank-detail__hero" aria-labelledby="bank-detail-title">
              <div className="bank-detail__logo" aria-hidden="true">{bankMonogram(bank.bank_name)}</div>
              <div className="bank-detail__identity">
                <h1 id="bank-detail-title" className="bank-detail__name">{bank.bank_name}</h1>
                <div className="bank-detail__bic-row">
                  <span className="bank-detail__bic mono">{bank.bic}</span>
                  <span className="bank-detail__bic-label">Bank identifier</span>
                </div>
                <p className="bank-detail__country">
                  <svg className="bank-detail__country-mark" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 21V4m0 0c4-3 7 3 13 0v9c-6 3-9-3-13 0" />
                  </svg>
                  {countryName(bank.country_code)}
                </p>
                <StatusChip status="under_review" className="bank-detail__verified" />
              </div>
            </section>

            <div className="bank-detail__body">
              <section className="bank-detail__schemes" aria-labelledby="bank-detail-schemes-title">
                <h2 id="bank-detail-schemes-title">Potential rails to verify</h2>
                <p className="bank-detail__scheme-note">
                  These are generic educational examples for the directory currency,
                  not confirmation that this bank supports them.
                </p>
                <div className="bank-detail__scheme-list">
                  {potentialRails(bank.country_currency).map((scheme) => (
                    <div className="bank-detail__scheme-row" key={scheme.name}>
                      <span className="bank-detail__scheme-icon" aria-hidden="true">{scheme.name === "SWIFT MT103" ? "◎" : "↗"}</span>
                      <span className="bank-detail__scheme-copy">
                        <strong>{scheme.name}</strong>
                        <span>{scheme.description}</span>
                      </span>
                      <StatusChip status={scheme.status} className="bank-detail__scheme-status" />
                    </div>
                  ))}
                </div>

                <div className="bank-detail__about">
                  <h2>About</h2>
                  <p>
                    {bank.bank_name} is a banking institution serving payment
                    corridors from {countryName(bank.country_code)}.
                  </p>
                  <p>
                    Confirm the receiving bank&apos;s current rules and settlement
                    instructions before initiating a payment.
                  </p>
                </div>
              </section>

              <aside className="bank-detail__details" aria-labelledby="bank-detail-details-title">
                <h2 id="bank-detail-details-title">Institution details</h2>
                <dl className="bank-detail__grid">
                  <div>
                    <dt>BIC</dt>
                    <dd className="mono">{bank.bic}</dd>
                  </div>
                  {bank.country_code && (
                    <div>
                      <dt>Country</dt>
                      <dd>{countryName(bank.country_code)}</dd>
                    </div>
                  )}
                  {bank.city && (
                    <div>
                      <dt>City</dt>
                      <dd>{bank.city}</dd>
                    </div>
                  )}
                  {bank.country_currency && (
                    <div>
                      <dt>Currency</dt>
                      <dd className="mono">{bank.country_currency}</dd>
                    </div>
                  )}
                  {lookup.data?.settlement?.chips_uid && (
                    <div>
                      <dt>CHIPS participant</dt>
                      <dd className="mono">{lookup.data.settlement.chips_uid}</dd>
                    </div>
                  )}
                  {lookup.data?.settlement?.aba && (
                    <div>
                      <dt>ABA (Fedwire)</dt>
                      <dd className="mono">{lookup.data.settlement.aba}</dd>
                    </div>
                  )}
                </dl>
                <div className="bank-detail__actions">
                  <Link
                    to={`/operate/prepare?bic=${encodeURIComponent(bank.bic)}`}
                    className="relay-btn relay-btn--primary"
                  >
                    Prepare payment to this bank
                  </Link>
                </div>
              </aside>
            </div>

            {lookup.data?.settlement && (
              <p className="measure bank-detail__settlement-note">
                This bank is a direct participant in the US settlement systems:
                the CHIPS participant number and ABA routing number above are its
                addresses on CHIPS and Fedwire — why it appears as a USD
                correspondent in other banks&apos; settlement instructions.
              </p>
            )}

            {resolvedDiffers && (
              <p className="bank-detail__resolution">
                Showing institution-level records for{" "}
                <span className="mono">{bank.bic}</span>. The BIC you searched
                resolves to this institution rather than a specific branch.
              </p>
            )}
            </div>

            {hasSSI && (
              <SettlementInstructions
                groups={currencyGroups}
                disclaimer={ssi.data?.disclaimer}
              />
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
