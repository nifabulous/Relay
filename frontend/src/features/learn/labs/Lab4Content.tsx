import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import { Exercise } from "../components/Exercise";
import { MultipleChoice } from "../components/MultipleChoice";
import { Button } from "../../../design-system/Button";
import { apiRequest } from "../../../api/client";
import { RouteResponseSchema } from "../../../api/schemas";
import type { RouteResponse } from "../../../api/schemas";
import "./LabContent.css";

const SETTLEMENT_QUESTION = {
  question:
    "Your USD payment sits at Deutsche Bank Trust Company Americas (CHIPS 0103), which must now pay another New York bank. Most cross-border USD legs like this settle over CHIPS rather than Fedwire. Why?",
  options: [
    {
      id: "swift-moves",
      label: "They don't need either — SWIFT moves the money between them",
      correct: false,
      explanation:
        "SWIFT only carries the instruction. Settlement always happens on a ledger — a correspondent's books, CHIPS, or Fedwire.",
    },
    {
      id: "netting",
      label: "CHIPS nets payments against each other all day, so banks tie up far less liquidity",
      correct: true,
      explanation:
        "Correct. CHIPS continuously offsets its ~40 participants' payments against each other and settles the net over Fedwire — moving the same value with a fraction of the parked liquidity. Fedwire settles each payment gross and immediately, which is why it remains the choice for finality-critical payments and the backstop under CHIPS.",
    },
    {
      id: "fedwire-cheap",
      label: "Fedwire is always used because it's cheaper",
      correct: false,
      explanation:
        "Gross settlement is the expensive option in liquidity terms — every payment needs full funding at the moment it settles.",
    },
    {
      id: "chips-required",
      label: "US law requires foreign payments to use CHIPS",
      correct: false,
      explanation:
        "No law forces the choice — banks route where the economics and finality needs point, and roughly 9 in 10 cross-border USD value ends up on CHIPS.",
    },
  ],
};

const SERIAL_COVER_QUESTION = {
  question:
    "A serial payment passes the customer instruction bank-to-bank along the whole chain. A cover payment sends it straight to the beneficiary bank while a separate pacs.009 COV moves the funds through the correspondents. What's the trade-off?",
  options: [
    {
      id: "info-ahead",
      label: "Cover gets the information there before the money — faster advice, but the funding leg once hid the customer details from intermediaries",
      correct: true,
      explanation:
        "Correct. The beneficiary bank learns the payment is coming immediately, while the money follows through the chain. The old blind spot — intermediaries screening a bare bank-to-bank transfer with no customer names — is why regulators forced the COV variant to carry the underlying customer details too.",
    },
    {
      id: "serial-faster",
      label: "Serial is faster because it uses fewer messages",
      correct: false,
      explanation:
        "Serial uses one message type but each bank must receive, process, and forward it in turn — the information moves only as fast as the slowest hop.",
    },
    {
      id: "no-difference",
      label: "No practical difference — banks pick at random",
      correct: false,
      explanation:
        "The choice shapes when the beneficiary bank learns about the payment and what each intermediary can screen — it's an explicit design decision.",
    },
    {
      id: "cover-domestic",
      label: "Cover payments only work domestically",
      correct: false,
      explanation:
        "Cover exists precisely FOR cross-border correspondent chains — a domestic single-hop payment has nothing to cover.",
    },
  ],
};

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
      setError("Could not look up correspondent routing. Please try again.");
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
          Enter a beneficiary bank BIC and currency to see correspondent options. Where the
          beneficiary bank has <strong>published its settlement instructions</strong>, you get
          its real correspondent list; otherwise you get ranked heuristic candidates. Try{" "}
          <span className="mono">ABNGNGLAXXX</span> (published) against{" "}
          <span className="mono">GTBINGLAXXX</span> (heuristic) and compare the label on the
          results.
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
                <p>
                  {route.source === "published-ssi"
                    ? `${route.suggested_intermediaries.length} published correspondent(s) found`
                    : `${route.suggested_intermediaries.length} possible correspondent option(s) found`} for {currency} → {route.beneficiary_country} (local: {route.currency}):
                </p>

                <div className="lab-route-options" role="group" aria-labelledby="lab-route-options-title">
                  <div className="lab-route-options__header">
                    <div>
                      <h3 id="lab-route-options-title">
                        {route.source === "published-ssi"
                          ? "Published correspondents"
                          : "Possible correspondent options"}
                      </h3>
                      <p className="lab-route-options__note">
                        {route.source === "published-ssi"
                          ? "This is the beneficiary bank's own published correspondent list — the authoritative instruction, not a guess."
                          : "These are candidates, not a confirmed chain. The actual path may use one or more correspondents—or a different bank—depending on your bank's Nostro relationships."}
                      </p>
                    </div>
                    <span className="lab-route-options__currency mono">{route.currency}</span>
                  </div>
                  <div className="lab-route-options__diagram" aria-hidden="true">
                    <span className="lab-route-options__endpoint">Your bank</span>
                    <span className="lab-route-options__bridge">
                      {route.source === "published-ssi"
                        ? `uses ${route.suggested_intermediaries.length} published correspondents`
                        : `selects from ${route.suggested_intermediaries.length} candidates`}
                    </span>
                    <span className="lab-route-options__endpoint">Beneficiary bank</span>
                  </div>
                  <p className="lab-route-result__note">{route.notes}</p>
                </div>

                {/* Intermediary details table */}
                <h3 className="lab-route-result__table-title">
                  {route.source === "published-ssi" ? "Published correspondent details" : "Candidate details"}
                </h3>
                <table className="lab-table lab-route-result__table">
                  <thead>
                    <tr><th>#</th><th>Bank</th><th>BIC</th><th>Corridor</th><th>Basis</th><th>Confidence</th><th>Settlement IDs</th></tr>
                  </thead>
                  <tbody>
                    {route.suggested_intermediaries.map((inter, i) => (
                      <tr key={i}>
                        <td className="mono">{i + 1}</td>
                        <td>{String(inter.bank ?? inter.bic)}</td>
                        <td className="mono">{inter.bic}</td>
                        <td className="mono">{String(inter.corridor ?? "")}</td>
                        <td>{inter.basis === "published-ssi" ? "published SSI" : "heuristic"}</td>
                        <td>{String(inter.confidence ?? "")}</td>
                        <td className="mono">
                          {inter.settlement?.chips_uid || inter.settlement?.aba
                            ? [
                                inter.settlement?.chips_uid ? `CHIPS ${inter.settlement.chips_uid}` : null,
                                inter.settlement?.aba ? `ABA ${inter.settlement.aba}` : null,
                              ].filter(Boolean).join(" · ")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {route.suggested_intermediaries.some((inter) => inter.settlement) && (
                  <p className="measure lab-muted">
                    The settlement IDs are the correspondent's addresses on the US settlement
                    systems: its CHIPS participant number and its ABA (Fedwire) routing number —
                    the layer the next section explains.
                  </p>
                )}
              </>
            ) : (
              <p className="lab-muted">No intermediaries found for this corridor. {route.notes}</p>
            )}
          </div>
        )}
      </section>

      {/* Settlement layer: CHIPS and Fedwire */}
      <section className="lab-section">
        <h2>The settlement layer: CHIPS and Fedwire</h2>
        <p className="measure">
          Why are the same few New York banks on every USD correspondent list? Because when a
          USD payment's final leg moves between two US banks, it settles on one of two systems —
          and a bank is only a useful USD correspondent if it sits on them directly. A bank has
          three addresses that matter here: its <strong>BIC</strong> on SWIFT (messages), its{" "}
          <strong>CHIPS participant number</strong> (netted settlement), and its{" "}
          <strong>ABA routing number</strong> on Fedwire (gross settlement).
        </p>
        <table className="lab-table">
          <thead>
            <tr>
              <th></th>
              <th>CHIPS</th>
              <th>Fedwire</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Operator</strong></td>
              <td>The Clearing House (private, bank-owned)</td>
              <td>Federal Reserve (central bank)</td>
            </tr>
            <tr>
              <td><strong>Settlement</strong></td>
              <td>Continuous netting; net positions settle over Fedwire</td>
              <td>Real-time gross — each payment individually and finally</td>
            </tr>
            <tr>
              <td><strong>Direct participants</strong></td>
              <td>~40 (the big clearers: 0001 BNY, 0002 JPMorgan, 0008 Citi…)</td>
              <td>Thousands of US institutions</td>
            </tr>
            <tr>
              <td><strong>Typical use</strong></td>
              <td>Cross-border USD — roughly 9 in 10 dollars of it</td>
              <td>Domestic wires, finality-critical payments, CHIPS backstop</td>
            </tr>
          </tbody>
        </table>
        <p className="measure lab-muted">
          SWIFT appears nowhere in this table on purpose: it carries the instructions between
          banks and settles nothing. Every real movement of dollars lands on a correspondent's
          own books, on CHIPS, or on Fedwire.
        </p>
        <MultipleChoice
          question={SETTLEMENT_QUESTION.question}
          options={SETTLEMENT_QUESTION.options}
          onCorrect={() => onCheckpoint("settlement-system")}
        />
      </section>

      {/* Serial vs cover */}
      <section className="lab-section">
        <h2>Two ways to wire a chain: serial vs cover</h2>
        <p className="measure">
          The chain you routed above can be wired in two message patterns. In a{" "}
          <strong>serial</strong> payment, the customer instruction itself hops bank to bank —
          each correspondent reads it, moves the funds, and forwards it. In a{" "}
          <strong>cover</strong> payment, the instruction goes directly to the beneficiary
          bank while a separate bank-to-bank funding message (a{" "}
          <span className="mono">pacs.009 COV</span>, formerly MT202 COV) travels the
          correspondent chain to deliver the money.
        </p>
        <MultipleChoice
          question={SERIAL_COVER_QUESTION.question}
          options={SERIAL_COVER_QUESTION.options}
          onCorrect={() => onCheckpoint("serial-cover")}
        />
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
