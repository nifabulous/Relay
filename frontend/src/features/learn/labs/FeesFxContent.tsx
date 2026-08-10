import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import type { ExerciseChecker } from "../labTypes";
import { Exercise } from "../components/Exercise";
import { MultipleChoice } from "../components/MultipleChoice";
import { apiPost } from "../../../api/client";
import { FeeSimulateResponseSchema } from "../../../api/schemas";
import type { FeeSimulateResponse } from "../../../api/schemas";
import "./LabContent.css";

/**
 * Per-currency demo correspondent chains. Every BIC below has a seeded lift
 * fee in the backend (app/services/seed.py LIFT_FEES) — so the numbers a
 * learner predicts by hand match the simulator exactly.
 */
export type DemoCurrency = "USD" | "CAD" | "GBP" | "EUR";

interface DemoHop {
  bic: string;
  name: string;
  fee: number;
}

interface CurrencyDemo {
  symbol: string;
  currencyName: string;
  hops: DemoHop[];
  /** 1000 minus the sum of lift fees — what SHA delivers. */
  expectedSha: number;
}

export const CURRENCY_DEMOS: Record<DemoCurrency, CurrencyDemo> = {
  USD: {
    symbol: "$",
    currencyName: "US dollars",
    hops: [
      { bic: "CITIUS33XXX", name: "Citibank N.A.", fee: 15.0 },
      { bic: "CHASUS33XXX", name: "JPMorgan Chase", fee: 10.0 },
    ],
    expectedSha: 975.0,
  },
  CAD: {
    symbol: "C$",
    currencyName: "Canadian dollars",
    hops: [
      { bic: "ROYCCAT2XXX", name: "RBC Royal Bank", fee: 17.5 },
      { bic: "TDOMCATTXXX", name: "Toronto-Dominion Bank", fee: 12.0 },
    ],
    expectedSha: 970.5,
  },
  GBP: {
    symbol: "£",
    currencyName: "pounds sterling",
    hops: [
      { bic: "BARCGB22XXX", name: "Barclays", fee: 10.0 },
      { bic: "NWBKGB2LXXX", name: "NatWest", fee: 8.0 },
    ],
    expectedSha: 982.0,
  },
  EUR: {
    symbol: "€",
    currencyName: "euros",
    hops: [
      { bic: "DEUTDEFFXXX", name: "Deutsche Bank", fee: 10.0 },
      { bic: "BNPAFRPPXXX", name: "BNP Paribas", fee: 9.0 },
    ],
    expectedSha: 981.0,
  },
};

const DEMO_CURRENCIES: DemoCurrency[] = ["USD", "CAD", "GBP", "EUR"];

const DEMO_AMOUNT = 1000;

type ChargeCode = "OUR" | "SHA" | "BEN";

const CHARGE_CODES: ChargeCode[] = ["OUR", "SHA", "BEN"];

const FX_QUESTION = {
  question:
    "You convert €10,000 to dollars. The mid-market rate is 1.1000 but your bank offers 1.0780, plus a visible $10 wire fee. What's the real cost of this conversion?",
  options: [
    {
      id: "ten",
      label: "$10 — the wire fee is the only charge listed",
      correct: false,
      explanation:
        "The wire fee is the only charge you can SEE. The rate itself hides a much bigger one.",
    },
    {
      id: "margin",
      label: "$230 — a $220 hidden FX margin plus the $10 fee",
      correct: true,
      explanation:
        "Correct. Mid-market would give you $11,000; at 1.0780 you get $10,780. That $220 spread is the bank's FX margin — 22 times the visible fee. Always compare against mid-market.",
    },
    {
      id: "nothing",
      label: "Nothing — exchange rates just differ between banks",
      correct: false,
      explanation:
        "Rates differ precisely because each bank adds its own margin on top of mid-market. The difference is a real cost you pay.",
    },
    {
      id: "pct",
      label: "$110 — banks charge a standard 1% on conversions",
      correct: false,
      explanation:
        "There is no standard percentage. This bank's margin works out to 2% — you find it by comparing the offered rate to mid-market, not by assuming a convention.",
    },
  ],
};

function fmt(symbol: string, value: number): string {
  return `${symbol}${value.toFixed(2)}`;
}

export function FeesFxContent({ moduleId, onCheckpoint }: LabContentProps) {
  const [currency, setCurrency] = useState<DemoCurrency>("USD");
  const [chargeCode, setChargeCode] = useState<ChargeCode>("SHA");
  const [result, setResult] = useState<FeeSimulateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The lesson is the CONTRAST between charge codes on the SAME payment, so
  // runs are tracked per currency.
  const runCodes = useRef(new Map<DemoCurrency, Set<ChargeCode>>());
  const simulateFired = useRef(false);

  const demo = CURRENCY_DEMOS[currency];

  const selectCurrency = useCallback((ccy: DemoCurrency) => {
    setCurrency(ccy);
    setResult(null);
    setError(null);
  }, []);

  const runSimulation = useCallback(async (code: ChargeCode) => {
    const activeDemo = CURRENCY_DEMOS[currency];
    setChargeCode(code);
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiPost<FeeSimulateResponse>(
        "/api/fees/simulate",
        {
          amount: DEMO_AMOUNT,
          currency,
          charge_code: code,
          intermediary_bics: activeDemo.hops.map((h) => h.bic),
          intermediary_names: activeDemo.hops.map((h) => h.name),
        },
        FeeSimulateResponseSchema,
      );
      setResult(res);

      const codesForCurrency = runCodes.current.get(currency) ?? new Set<ChargeCode>();
      codesForCurrency.add(code);
      runCodes.current.set(currency, codesForCurrency);
      // Fires once the learner has compared at least two charge codes on the
      // same payment (same currency, same chain).
      if (!simulateFired.current && codesForCurrency.size >= 2) {
        simulateFired.current = true;
        onCheckpoint("simulate-fees");
      }
    } catch {
      setError("Could not run the fee simulation. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [currency, onCheckpoint]);

  // Exercise: predict the SHA received amount before trusting the simulator.
  // Recomputed per currency — the checker closes over the active demo chain.
  const checkPrediction: ExerciseChecker = useCallback((answer) => {
    const activeDemo = CURRENCY_DEMOS[currency];
    const cleaned = answer.replace(/[$£€C,\s]/gi, "");
    const value = Number.parseFloat(cleaned);
    const [first, second] = activeDemo.hops;

    if (Number.isNaN(value)) {
      return { correct: false, feedback: "Enter a number — the amount the beneficiary receives." };
    }
    if (Math.abs(value - activeDemo.expectedSha) < 0.01) {
      return {
        correct: true,
        feedback:
          `Correct: ${fmt(activeDemo.symbol, DEMO_AMOUNT)} − ${fmt(activeDemo.symbol, first.fee)} (${first.name}) − ${fmt(activeDemo.symbol, second.fee)} (${second.name}) = ${fmt(activeDemo.symbol, activeDemo.expectedSha)}. Now run SHA in the simulator above and confirm.`,
      };
    }
    if (Math.abs(value - DEMO_AMOUNT) < 0.01) {
      return {
        correct: false,
        feedback: "That's what the SENDER sends. Under SHA, each intermediary deducts its lift fee from the amount in flight.",
      };
    }
    return {
      correct: false,
      feedback: `Not quite. Start at ${fmt(activeDemo.symbol, DEMO_AMOUNT)} and subtract each intermediary's lift fee in turn (${fmt(activeDemo.symbol, first.fee)}, then ${fmt(activeDemo.symbol, second.fee)}).`,
    };
  }, [currency]);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>The case of the missing $25</h2>
        <p className="measure">
          A US company sends $1,000 to a supplier. The supplier's bank statement shows
          $975 arrived. Nobody stole anything, and nobody made an error. Each correspondent
          in the chain simply took its <strong>lift fee</strong> for handling the payment —
          exactly as the charge code instructed.
        </p>
        <p className="measure">
          The same story plays out in every currency — only the banks and the fee sizes
          change. A CAD payment routes through Canadian correspondents, a GBP payment
          through London clearers, a EUR payment through the big eurozone banks. In Lab 5
          you chose charge codes; in Lab 6 you read total fees off a tracker. This module
          puts numbers on both, in four currencies: you'll predict a deduction chain by
          hand, verify it against the simulator, and then meet the fee nobody prints on a
          receipt — the FX margin.
        </p>
      </section>

      {/* Currency picker — drives the chain, the exercise, and the simulator */}
      <section className="lab-section">
        <h2>Pick a currency</h2>
        <p className="measure">
          Each currency gets a realistic two-bank correspondent chain with its own lift
          fees. Work through at least two currencies and compare how much of the same
          1,000 survives the trip.
        </p>
        <div className="lab-currency-pills" role="group" aria-label="Currency">
          {DEMO_CURRENCIES.map((ccy) => (
            <button
              key={ccy}
              type="button"
              className={[
                "lab-currency-pill",
                currency === ccy && "lab-currency-pill--active",
              ].filter(Boolean).join(" ")}
              onClick={() => selectCurrency(ccy)}
              aria-pressed={currency === ccy}
            >
              {ccy}
            </button>
          ))}
        </div>
        <table className="lab-table">
          <thead>
            <tr>
              <th>Hop</th>
              <th>Correspondent</th>
              <th>Lift fee</th>
            </tr>
          </thead>
          <tbody>
            {demo.hops.map((hop, i) => (
              <tr key={hop.bic}>
                <td>{i + 1}</td>
                <td>{hop.name} <span className="mono lab-muted">{hop.bic}</span></td>
                <td className="mono">{fmt(demo.symbol, hop.fee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Predict before you run */}
      <Exercise
        key={currency}
        id={`ex-predict-received-${currency}`}
        title="Exercise: Predict before you simulate"
        prompt={
          <>
            You send <strong>{fmt(demo.symbol, DEMO_AMOUNT)}</strong> ({demo.currencyName})
            with charge code <strong>SHA</strong> through two intermediaries:{" "}
            {demo.hops[0].name} (lift fee {fmt(demo.symbol, demo.hops[0].fee)}), then{" "}
            {demo.hops[1].name} (lift fee {fmt(demo.symbol, demo.hops[1].fee)}).
            How much does the beneficiary receive?
          </>
        }
        label="Amount received"
        placeholder="e.g. 950"
        hint={`Under SHA every intermediary deducts its fee from the amount as it passes through: start at ${fmt(demo.symbol, DEMO_AMOUNT)} and subtract each fee in order.`}
        checkAnswer={checkPrediction}
        onCorrect={() => onCheckpoint("predict-received")}
      />

      {/* Fee chain simulator */}
      <section className="lab-section">
        <h2>Simulate the fee chain</h2>
        <p className="measure">
          Same {fmt(demo.symbol, DEMO_AMOUNT)}, same two intermediaries
          ({demo.hops[0].name}, then {demo.hops[1].name}). Run it under at least two
          different charge codes and compare who ends up paying.
        </p>

        <div className="lab-currency-pills" role="group" aria-label="Charge code">
          {CHARGE_CODES.map((code) => (
            <button
              key={code}
              type="button"
              className={[
                "lab-currency-pill",
                chargeCode === code && result && "lab-currency-pill--active",
              ].filter(Boolean).join(" ")}
              onClick={() => runSimulation(code)}
              disabled={isLoading}
              aria-pressed={chargeCode === code && result !== null}
            >
              {code}
            </button>
          ))}
        </div>

        {error && <div className="lab-error" role="alert">{error}</div>}

        {result && (
          <div className="lab-ssi-result">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Hop</th>
                  <th>Fee</th>
                  <th>Amount in</th>
                  <th>Amount out</th>
                </tr>
              </thead>
              <tbody>
                {result.hops.map((hop, i) => (
                  <tr key={`${hop.bic}-${i}`}>
                    <td>{hop.bank_name}</td>
                    <td className="mono">{hop.fee.toFixed(2)}</td>
                    <td className="mono">{hop.amount_in.toFixed(2)}</td>
                    <td className="mono">{hop.amount_out.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Sent <strong className="mono">{result.sent_amount.toFixed(2)}</strong> ·
              beneficiary receives <strong className="mono">{result.received_amount.toFixed(2)}</strong> ·
              total fees <strong className="mono">{result.total_fees.toFixed(2)}</strong>
              {result.sender_pays_extra > 0 && (
                <> · sender pays <strong className="mono">{result.sender_pays_extra.toFixed(2)}</strong> on top</>
              )}
            </p>
            <p className="lab-muted">{result.fee_breakdown}</p>
          </div>
        )}
      </section>

      {/* FX margin */}
      <section className="lab-section">
        <h2>The fee nobody prints: FX margin</h2>
        <p className="measure">
          Lift fees at least appear on statements. When a payment changes currency, there's
          a second cost hidden inside the exchange rate itself. The{" "}
          <strong>mid-market rate</strong> is where banks trade with each other; the rate
          offered to you sits below it, and the gap — the <strong>FX margin</strong> — is
          revenue for the converting bank.
        </p>
        <table className="lab-table">
          <thead>
            <tr><th>Rate</th><th>€10,000 becomes</th><th>Difference</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Mid-market 1.1000</td>
              <td className="mono">$11,000.00</td>
              <td className="lab-muted">the benchmark</td>
            </tr>
            <tr>
              <td>Offered 1.0780</td>
              <td className="mono">$10,780.00</td>
              <td className="mono">−$220.00 hidden</td>
            </tr>
          </tbody>
        </table>
        <p className="measure lab-muted">
          The same trick works on every pair: GBP→USD, USD→CAD, EUR→GBP. Whatever the
          currencies, the method is the same — find the mid-market rate, multiply, and
          compare with what your bank offered.
        </p>
        <MultipleChoice
          question={FX_QUESTION.question}
          options={FX_QUESTION.options}
          onCorrect={() => onCheckpoint("spot-fx-margin")}
        />
      </section>

      {/* Forward link */}
      <section className="lab-section">
        <h2>Where you'll use this next</h2>
        <p className="measure">
          The capstone's tracker shows total fees deducted along the chain — you now know
          exactly where every one of those dollars, pounds, euros, or loonies went, and
          which charge code would have kept them in the payment.
        </p>
      </section>
    </div>
  );
}
