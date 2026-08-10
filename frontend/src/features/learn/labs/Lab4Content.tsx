import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import { Exercise } from "../components/Exercise";
import { Button } from "../../../design-system/Button";
import { apiRequest } from "../../../api/client";
import { RouteResponseSchema } from "../../../api/schemas";
import type { RouteResponse } from "../../../api/schemas";
import "./LabContent.css";

export function Lab4Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [bic, setBic] = useState("GTBINGLAXXX");
  const [currency, setCurrency] = useState("USD");
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demoFired = useRef(false);

  const findRoute = useCallback(async (overrideBic?: string, overrideCurrency?: string) => {
    const effectiveBic = (overrideBic ?? bic).trim();
    const effectiveCurrency = (overrideCurrency ?? currency).trim();
    if (!effectiveBic) return;

    setIsLoading(true);
    setError(null);
    setRoute(null);

    try {
      const result = await apiRequest<RouteResponse>(
        `/api/route?bic=${encodeURIComponent(effectiveBic)}&currency=${encodeURIComponent(effectiveCurrency)}`,
        undefined,
        RouteResponseSchema,
      );
      setRoute(result);

      if (!demoFired.current && result.suggested_intermediaries.length > 0) {
        demoFired.current = true;
        onCheckpoint("route-demo");
      }
    } catch {
      setError("Could not look up routing. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [bic, currency, onCheckpoint]);

  // Japan exercise: learner enters the BIC for Bank of Tokyo-Mitsubishi
  const checkJapan: Parameters<typeof Exercise>[0]["checkAnswer"] = async (answer, signal) => {
    const cleaned = answer.trim().toUpperCase();
    // Query the real API to verify
    try {
      const result = await apiRequest<RouteResponse>(
        `/api/route?bic=${encodeURIComponent(cleaned)}&currency=USD`,
        { signal },
        RouteResponseSchema,
      );
      const count = result.suggested_intermediaries.length;
      const isJapan = result.beneficiary_country === "JP" || cleaned.includes("JP");
      if (count > 0 && isJapan) {
        return { correct: true, feedback: `Correct! Bank of Tokyo-Mitsubishi (BOTKJPJTXXX) has ${count} USD intermediary option(s).` };
      }
      return { correct: false, feedback: "That BIC either doesn't route to Japan or has no intermediaries. The BIC for Bank of Tokyo-Mitsubishi UFJ starts with BOTK and ends with JPJT." };
    } catch {
      return { correct: false, feedback: "Could not verify that BIC. The Japan bank BIC is BOTKJPJTXXX." };
    }
  };

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>How correspondent routing works</h2>
        <p className="measure">
          When you send money across borders, it rarely goes directly from your bank to the
          beneficiary's bank. Instead, it hops through intermediary (correspondent) banks that
          hold accounts in each other's currencies. These <strong>Nostro</strong> ("our account
          at your bank") and <strong>Vostro</strong> ("your account at our bank") relationships
          are what make international payments possible.
        </p>
      </section>

      {/* Route demo */}
      <section className="lab-section">
        <h2>Route a payment</h2>
        <p className="measure">
          Enter a beneficiary bank BIC and currency to see possible correspondent options.
        </p>
        <div className="lab-analyzer">
          <input
            type="text"
            className="lab-analyzer__input mono"
            aria-label="Beneficiary BIC"
            placeholder="GTBINGLAXXX"
            value={bic}
            onChange={(e) => { setBic(e.target.value.toUpperCase()); setRoute(null); }}
          />
          <input
            type="text"
            className="lab-analyzer__input mono"
            aria-label="Currency"
            placeholder="USD"
            value={currency}
            maxLength={3}
            onChange={(e) => { setCurrency(e.target.value.toUpperCase()); setRoute(null); }}
            style={{ maxWidth: "80px" }}
          />
          <Button variant="primary" onClick={() => findRoute()} isLoading={isLoading}>
            Find intermediaries
          </Button>
        </div>

        {error && <div className="lab-error" role="alert">{error}</div>}

        {route && (
          <div className="lab-route-result">
            {route.suggested_intermediaries.length > 0 ? (
              <>
                <p>{route.suggested_intermediaries.length} possible correspondent option(s) found for {currency} → {route.beneficiary_country} (local: {route.currency}):</p>

                <div className="lab-route-options" role="group" aria-labelledby="lab-route-options-title">
                  <div className="lab-route-options__header">
                    <div>
                      <h3 id="lab-route-options-title">Possible correspondent options</h3>
                      <p className="lab-route-options__note">
                        These are candidates, not a confirmed chain. The actual path may use one or more correspondents—or a different bank—depending on your bank&apos;s Nostro relationships.
                      </p>
                    </div>
                    <span className="lab-route-options__currency mono">{route.currency}</span>
                  </div>
                  <div className="lab-route-options__diagram" aria-hidden="true">
                    <span className="lab-route-options__endpoint">Your bank</span>
                    <span className="lab-route-options__bridge">selects from {route.suggested_intermediaries.length} candidates</span>
                    <span className="lab-route-options__endpoint">Beneficiary bank</span>
                  </div>
                  <p className="lab-route-result__note">{route.notes}</p>
                </div>

                {/* Intermediary details table */}
                <h3 className="lab-route-result__table-title">Candidate details</h3>
                <table className="lab-table lab-route-result__table">
                  <thead>
                    <tr><th>#</th><th>Bank</th><th>BIC</th><th>Corridor</th><th>Confidence</th></tr>
                  </thead>
                  <tbody>
                    {route.suggested_intermediaries.map((inter, i) => (
                      <tr key={i}>
                        <td className="mono">{i + 1}</td>
                        <td>{String(inter.bank ?? inter.bic)}</td>
                        <td className="mono">{inter.bic}</td>
                        <td className="mono">{String(inter.corridor ?? "")}</td>
                        <td>{String(inter.confidence ?? "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="lab-muted">No intermediaries found for this corridor. {route.notes}</p>
            )}
          </div>
        )}
      </section>

      {/* Japan exercise */}
      <Exercise
        id="ex-japan"
        title="Exercise: Route to Japan"
        prompt={<>The Bank of Tokyo-Mitsubishi UFJ has BIC <span className="mono">BOTKJPJTXXX</span>. Enter this BIC to find its USD intermediaries.</>}
        label="Japan bank BIC"
        placeholder="BOTKJPJTXXX"
        hint="The BIC starts with BOTK and ends with JPJT. Enter it exactly."
        checkAnswer={checkJapan}
        onCorrect={() => onCheckpoint("route-japan")}
      />
    </div>
  );
}
