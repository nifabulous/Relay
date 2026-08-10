import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import { MultipleChoice } from "../components/MultipleChoice";
import { Button } from "../../../design-system/Button";
import { apiRequest } from "../../../api/client";
import { SchemesResponseSchema } from "../../../api/schemas";
import type { SchemesResponse } from "../../../api/schemas";
import { bacsCycle, chooseEurRail, type BacsCycle, type EurRailChoice } from "./railsHelpers";
import "./LabContent.css";

// Sample submission times for the Bacs cycle simulator (London time treated
// as the cycle clock; dates in July 2026 — Mon 20th through Sat 25th).
const BACS_TIME_SAMPLES = [
  { label: "Monday 09:00 (normal working day)", iso: "2026-07-20T09:00:00" },
  { label: "Monday 23:00 (after the 22:30 cut-off)", iso: "2026-07-20T23:00:00" },
  { label: "Friday 15:00 (weekend in the cycle)", iso: "2026-07-24T15:00:00" },
  { label: "Saturday 10:00 (non-processing day)", iso: "2026-07-25T10:00:00" },
];

// Illustrative bank-set SCT Inst limit for the EUR rail picker (minor units).
// The scheme-level €100,000 cap was removed under the Instant Payments
// Regulation — what remains is whatever limit your PSP sets.
const DEMO_SCT_INST_LIMIT_MINOR = 10_000_000; // €100,000

const GBP_CHOOSER_SCENARIOS = [
  {
    id: "payroll",
    question: "Monthly payroll for 1,200 employees, known five days in advance. Which GBP rail?",
    options: [
      { id: "bacs", label: "Bacs Direct Credit", correct: true, explanation: "Correct — payroll is the canonical Bacs use case: predictable, batched, and roughly 50p per credit. Submit on Day 1, employees are paid on Day 3." },
      { id: "fps", label: "Faster Payments", correct: false, explanation: "It would work, but you'd pay instant-rail costs for 1,200 payments that don't need to be instant. Payroll is scheduled — use the cheap batch rail." },
      { id: "chaps", label: "CHAPS", correct: false, explanation: "£20-35 per payment × 1,200 employees is the most expensive possible payroll run. CHAPS is for high-value, not high-volume." },
    ],
  },
  {
    id: "completion",
    question: "A £2.4M commercial property completion must settle today, irrevocably. Which GBP rail?",
    options: [
      { id: "chaps", label: "CHAPS", correct: true, explanation: "Correct — CHAPS is the Bank of England's RTGS: no amount cap, same-day, and final on settlement. Property completions are its bread and butter." },
      { id: "fps", label: "Faster Payments", correct: false, explanation: "The scheme cap is £1M — £2.4M physically cannot travel on FPS, and many banks cap far lower." },
      { id: "bacs", label: "Bacs Direct Credit", correct: false, explanation: "Three working days to settle — the seller's solicitor will not hand over keys against a Bacs file." },
    ],
  },
  {
    id: "sunday",
    question: "Sunday 21:40 — a supplier threatens to halt delivery unless £8,000 arrives tonight. Which GBP rail?",
    options: [
      { id: "fps", label: "Faster Payments", correct: true, explanation: "Correct — FPS runs 24/7/365 and £8,000 sits comfortably inside typical limits. The money lands in seconds, on a Sunday night." },
      { id: "chaps", label: "CHAPS", correct: false, explanation: "CHAPS operates weekdays roughly 06:00-18:00 — it's closed on Sunday night. Nothing settles until Monday." },
      { id: "bacs", label: "Bacs Direct Credit", correct: false, explanation: "The file wouldn't even enter processing until Monday, and funds arrive Wednesday." },
    ],
  },
];

const EUR_CHOOSER_SCENARIOS = [
  {
    id: "friday",
    question: "Friday 18:30 — €15,000 to an Italian supplier who needs it before Monday. Which EUR rail?",
    options: [
      { id: "inst", label: "SEPA Instant (SCT Inst)", correct: true, explanation: "Correct — SCT Inst runs 24/7/365 and settles in under 10 seconds, weekend included. A standard SCT wouldn't land until Monday at the earliest." },
      { id: "sct", label: "SEPA Credit Transfer", correct: false, explanation: "SCT settles on business days — a Friday-evening file lands Monday. Too late." },
      { id: "t2", label: "TARGET2", correct: false, explanation: "TARGET2 is closed on weekends too, and it's the wholesale rail — not what you use for a €15,000 supplier invoice." },
    ],
  },
  {
    id: "treasury",
    question: "€40M interbank money-market settlement due before close of business. Which EUR rail?",
    options: [
      { id: "t2", label: "TARGET2", correct: true, explanation: "Correct — high-value interbank flows settle in central-bank money on the Eurosystem RTGS. Final, irrevocable, same day." },
      { id: "inst", label: "SEPA Instant (SCT Inst)", correct: false, explanation: "Even with the scheme cap removed, banks' instant limits sit far below €40M — and wholesale settlement belongs in central-bank money on the RTGS." },
      { id: "sct", label: "SEPA Credit Transfer", correct: false, explanation: "A next-day batch rail cannot carry a same-day treasury obligation." },
    ],
  },
];

function formatEuroMinor(minor: number): string {
  return `€${(minor / 100).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function GbpEurRailsContent({ moduleId, onCheckpoint }: LabContentProps) {
  // 1. Rail detail (GBP / EUR) via /api/schemes
  const [railCurrency, setRailCurrency] = useState<string | null>(null);
  const [railData, setRailData] = useState<SchemesResponse | null>(null);
  const [railLoading, setRailLoading] = useState(false);
  const [railError, setRailError] = useState<string | null>(null);

  // 2. Bacs cycle simulator
  const [bacs, setBacs] = useState<BacsCycle | null>(null);
  const [bacsSubmitted, setBacsSubmitted] = useState<string | null>(null);

  // 3. EUR rail picker
  const [eurAmount, setEurAmount] = useState("15000");
  const [eurUrgent, setEurUrgent] = useState(true);
  const [eurChoice, setEurChoice] = useState<EurRailChoice | null>(null);

  // Checkpoint-once guards
  const gbpDetailRef = useRef(false);
  const eurDetailRef = useRef(false);
  const bacsRef = useRef(false);
  const eurPickRef = useRef(false);
  const gbpChooserDone = useRef(new Set<string>());
  const gbpChooserRef = useRef(false);
  const eurChooserDone = useRef(new Set<string>());
  const eurChooserRef = useRef(false);

  // ── 1. Rail detail ──────────────────────────────────────────
  const loadRail = useCallback(async (currency: string) => {
    setRailCurrency(currency);
    setRailLoading(true);
    setRailError(null);
    setRailData(null);
    try {
      const result = await apiRequest<SchemesResponse>(
        `/api/schemes?currency=${encodeURIComponent(currency)}`,
        undefined,
        SchemesResponseSchema,
      );
      setRailData(result);
      if (currency === "GBP" && !gbpDetailRef.current) {
        gbpDetailRef.current = true;
        onCheckpoint("gbp-rail-detail");
      }
      if (currency === "EUR" && !eurDetailRef.current) {
        eurDetailRef.current = true;
        onCheckpoint("eur-rail-detail");
      }
    } catch {
      setRailError("Could not load rail detail for this currency. Please try again.");
    } finally {
      setRailLoading(false);
    }
  }, [onCheckpoint]);

  // ── 2. Bacs cycle simulator ─────────────────────────────────
  const runBacs = useCallback((sample: (typeof BACS_TIME_SAMPLES)[number]) => {
    setBacsSubmitted(sample.label);
    setBacs(bacsCycle(sample.iso));
    if (!bacsRef.current) {
      bacsRef.current = true;
      onCheckpoint("bacs-cycle");
    }
  }, [onCheckpoint]);

  // ── 3. EUR rail picker ──────────────────────────────────────
  const runEurPicker = useCallback(() => {
    const euros = Number.parseFloat(eurAmount.replace(/[€,\s]/g, ""));
    const minor = Math.round(euros * 100);
    setEurChoice(chooseEurRail(minor, DEMO_SCT_INST_LIMIT_MINOR, eurUrgent));
    if (!eurPickRef.current && Number.isFinite(minor) && minor > 0) {
      eurPickRef.current = true;
      onCheckpoint("sct-inst-limit");
    }
  }, [eurAmount, eurUrgent, onCheckpoint]);

  // ── Chooser checkpoint wiring ───────────────────────────────
  const onGbpScenarioCorrect = useCallback((id: string) => {
    gbpChooserDone.current.add(id);
    if (!gbpChooserRef.current && gbpChooserDone.current.size >= GBP_CHOOSER_SCENARIOS.length) {
      gbpChooserRef.current = true;
      onCheckpoint("gbp-rail-chooser");
    }
  }, [onCheckpoint]);

  const onEurScenarioCorrect = useCallback((id: string) => {
    eurChooserDone.current.add(id);
    if (!eurChooserRef.current && eurChooserDone.current.size >= EUR_CHOOSER_SCENARIOS.length) {
      eurChooserRef.current = true;
      onCheckpoint("eur-rail-chooser");
    }
  }, [onCheckpoint]);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      {/* Intro */}
      <section className="lab-section">
        <h2>One currency, three rails — twice over</h2>
        <p className="measure">
          Lab 9 went deep on Canada and the UK's CHAPS. This module completes the
          picture for the two big European currencies. Sterling runs on three rails —
          <strong> CHAPS</strong>, <strong>Bacs</strong>, and{" "}
          <strong>Faster Payments</strong> — that differ in speed, cost, and ceiling by
          orders of magnitude. The euro mirrors that split across{" "}
          <strong>TARGET2</strong>, <strong>SEPA Credit Transfer</strong>, and{" "}
          <strong>SEPA Instant</strong> — but stretched across an entire currency union.
          Choosing the wrong rail doesn't just cost money; it can miss a completion
          deadline or strand payroll over a weekend.
        </p>
      </section>

      {/* 1. Live rail detail */}
      <section className="lab-section">
        <h2>Pull the live rail detail</h2>
        <p className="measure">
          Load the scheme data for each currency and read it rail by rail: operating
          windows, limits, protections, and what the operator has on its roadmap.
        </p>
        <div className="lab-currency-pills">
          {["GBP", "EUR"].map((ccy) => (
            <button
              key={ccy}
              type="button"
              className={[
                "lab-currency-pill",
                railCurrency === ccy && "lab-currency-pill--active",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => loadRail(ccy)}
              disabled={railLoading}
              aria-pressed={railCurrency === ccy}
            >
              {ccy}
            </button>
          ))}
        </div>

        {railError && <div className="lab-error" role="alert">{railError}</div>}

        {railData && (
          <div className="lab-rail-grid">
            {railData.schemes.map((scheme) => (
              <div key={scheme.name} className="lab-rail-card">
                <div className="lab-rail-card__head">
                  <h4>{scheme.name}</h4>
                  <span className="lab-scheme-card__speed">{scheme.speed}</span>
                </div>
                <dl>
                  <dt>Operator</dt><dd>{scheme.operator}</dd>
                  <dt>Limit</dt><dd>{scheme.limit}</dd>
                  <dt>Cost</dt><dd>{scheme.cost}</dd>
                  <dt>Use case</dt><dd>{scheme.useCase}</dd>
                  {scheme.settlement && (<><dt>Settlement</dt><dd>{scheme.settlement}</dd></>)}
                  {scheme.reversible !== null && scheme.reversible !== undefined && (
                    <><dt>Reversible</dt><dd>{scheme.reversible ? "Yes" : "No"}</dd></>
                  )}
                </dl>
                {scheme.howItWorks && scheme.howItWorks.length > 0 && (
                  <div className="lab-rail-card__block">
                    <h5>How it works</h5>
                    <ol>
                      {scheme.howItWorks.map((step, i) => <li key={i}>{step}</li>)}
                    </ol>
                  </div>
                )}
                {scheme.features && scheme.features.length > 0 && (
                  <div className="lab-rail-card__block">
                    <h5>Features</h5>
                    <ul>
                      {scheme.features.map((feat, i) => <li key={i}>{feat}</li>)}
                    </ul>
                  </div>
                )}
                {scheme.protections && scheme.protections.length > 0 && (
                  <div className="lab-rail-card__block">
                    <h5>Protections</h5>
                    <ul>
                      {scheme.protections.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}
                {scheme.roadmap && scheme.roadmap.length > 0 && (
                  <div className="lab-rail-card__block">
                    <h5>Roadmap</h5>
                    <ul>
                      {scheme.roadmap.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {railData?.verifiedAsof && (
          <p className="lab-caption">
            Rail data verified as of {railData.verifiedAsof}. Always confirm with the operator.
          </p>
        )}
      </section>

      {/* 2. CHAPS in depth */}
      <section className="lab-section">
        <h2>CHAPS: the sterling RTGS</h2>
        <p className="measure">
          CHAPS is the Bank of England's real-time gross settlement rail. Every payment
          settles individually, in central-bank money, and becomes{" "}
          <strong>final and irrevocable</strong> the moment it settles — there is no
          recall, only a polite request to the receiving bank. It runs on working days
          (roughly 06:00-18:00 London, with bank cut-offs earlier in the afternoon), has
          no amount cap, and costs £20-35 a payment. That price buys certainty: property
          completions, margin calls, and corporate treasury all ride CHAPS.
        </p>
        <table className="lab-table">
          <thead>
            <tr><th>Attribute</th><th>CHAPS</th><th>What it means in practice</th></tr>
          </thead>
          <tbody>
            <tr><td>Settlement</td><td>RTGS, per payment</td><td>No batching, no netting — your payment doesn't wait for anyone else's</td></tr>
            <tr><td>Finality</td><td>On settlement</td><td>Funds cannot be pulled back; errors need the beneficiary's cooperation</td></tr>
            <tr><td>Hours</td><td>Working days only</td><td>A Friday-evening CHAPS instruction sits until Monday morning</td></tr>
            <tr><td>Message format</td><td>ISO 20022 pacs.008</td><td>Purpose codes + LEIs mandated 2025; unstructured addresses rejected from Nov 2026</td></tr>
          </tbody>
        </table>
        <p className="measure lab-muted">
          Lab 9 covered the pacs.008 structured-address trap — the same rule applies to
          every CHAPS payment you route.
        </p>
      </section>

      {/* 3. Bacs in depth + cycle simulator */}
      <section className="lab-section">
        <h2>Bacs: the three-day workhorse</h2>
        <p className="measure">
          Bacs moves the UK's salaries, pensions, and Direct Debits — around 90% of UK
          adults are paid or pay through it. It is a <strong>batch</strong> rail with a
          fixed three-day cycle: files go in on <strong>Day 1</strong> (input, cut-off
          22:30), banks process on <strong>Day 2</strong>, and debits and credits happen
          simultaneously on <strong>Day 3</strong>. At roughly 50p per transaction it is
          two orders of magnitude cheaper than CHAPS — as long as three working days is
          acceptable. <strong>Direct Credit</strong> pushes money out (payroll);{" "}
          <strong>Direct Debit</strong> pulls it in (subscriptions, utilities), backed by
          the Direct Debit Guarantee.
        </p>
        <p className="measure">
          Submit a file at each of these times and watch which cycle it enters:
        </p>
        <div className="lab-currency-pills">
          {BACS_TIME_SAMPLES.map((sample) => (
            <button
              key={sample.iso}
              type="button"
              className={[
                "lab-currency-pill",
                bacsSubmitted === sample.label && "lab-currency-pill--active",
              ].filter(Boolean).join(" ")}
              onClick={() => runBacs(sample)}
              aria-pressed={bacsSubmitted === sample.label}
            >
              {sample.label}
            </button>
          ))}
        </div>
        {bacs && (
          <div className="lab-analyzer__result" data-testid="bacs-cycle-result">
            <p>
              {bacs.caughtCutoff
                ? "Caught the input window — the file enters today's cycle."
                : "Missed the input window — the file waits for the next business day's cycle."}
            </p>
            <table className="lab-table">
              <thead>
                <tr><th>Day 1 — input</th><th>Day 2 — processing</th><th>Day 3 — settlement</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">{bacs.submissionDay}</td>
                  <td className="mono">{bacs.processingDay}</td>
                  <td className="mono">{bacs.settlementDay}</td>
                </tr>
              </tbody>
            </table>
            <p className="lab-muted">
              Beneficiaries see funds on the morning of Day 3. Miss the cut-off on a
              Thursday and payday slips past the weekend.
            </p>
          </div>
        )}
      </section>

      {/* 4. Faster Payments in depth */}
      <section className="lab-section">
        <h2>Faster Payments: instant, but capped</h2>
        <p className="measure">
          Faster Payments is the UK's 24/7 instant rail: single immediate payments,
          forward-dated payments, and standing orders, typically landing in seconds at
          no visible cost to consumers. The scheme ceiling is{" "}
          <strong>£1,000,000</strong> (raised from £250,000), but every bank sets its own
          lower limit — often around £25,000 for personal customers. Two protections
          wrap it: <strong>Confirmation of Payee</strong> checks the beneficiary name
          before you send, and the <strong>APP-scam reimbursement</strong> regime splits
          refunds up to £85,000 between the two banks — both covered hands-on in Lab 9.
        </p>
        <p className="measure lab-muted">
          The pattern to remember: FPS for speed under the cap, Bacs for volume on a
          schedule, CHAPS for value without a ceiling.
        </p>
      </section>

      {/* 5. GBP rail chooser */}
      <section className="lab-section">
        <h2>Choose the sterling rail</h2>
        <p className="measure">
          Three payments, three right answers. Get all three to bank the checkpoint.
        </p>
        {GBP_CHOOSER_SCENARIOS.map((scenario) => (
          <MultipleChoice
            key={scenario.id}
            question={scenario.question}
            options={scenario.options}
            onCorrect={() => onGbpScenarioCorrect(scenario.id)}
          />
        ))}
      </section>

      {/* 6. EUR: SEPA + TARGET2 in depth */}
      <section className="lab-section">
        <h2>The euro: one currency, one payment area</h2>
        <p className="measure">
          SEPA — the Single Euro Payments Area — makes a euro transfer from Lisbon to
          Helsinki work exactly like a domestic one: IBAN only, same price, same rules,
          across 36 countries. Under it sit three rails.{" "}
          <strong>SEPA Credit Transfer</strong> is the batch workhorse: files clear
          through STEP2-T and land next business day.{" "}
          <strong>SEPA Instant (SCT Inst)</strong> settles in under 10 seconds,
          24/7/365, through TIPS (central-bank money) or RT1. And{" "}
          <strong>TARGET2</strong> — running on the consolidated T2 platform since
          March 2023 — is the Eurosystem's RTGS, settling around €2 trillion a day in
          central-bank money.
        </p>
        <p className="measure">
          The Instant Payments Regulation reshaped this landscape: eurozone banks had to
          receive instant payments by January 2025 and send them by October 2025,
          instant transfers may not cost more than standard ones, the historical
          €100,000 scheme cap was lifted (banks now set their own limits), and every
          EUR credit transfer gets a <strong>Verification of Payee</strong> name-check —
          the same idea you met as Confirmation of Payee in the UK.
        </p>
      </section>

      {/* 7. EUR rail picker */}
      <section className="lab-section">
        <h2>Pick the euro rail</h2>
        <p className="measure">
          Your bank's SCT Inst limit in this simulation is{" "}
          <strong>{formatEuroMinor(DEMO_SCT_INST_LIMIT_MINOR)}</strong>. Enter an amount,
          say whether it can wait a day, and see which rail carries it.
        </p>
        <div className="lab-analyzer">
          <input
            type="number"
            min="0"
            className="lab-analyzer__input"
            aria-label="Amount in EUR"
            value={eurAmount}
            onChange={(e) => setEurAmount(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={eurUrgent}
              onChange={(e) => setEurUrgent(e.target.checked)}
            />{" "}
            Must arrive today
          </label>
          <Button variant="primary" onClick={runEurPicker}>Choose the rail</Button>
        </div>
        {eurChoice && (
          <div className="lab-analyzer__result" data-testid="eur-rail-result">
            <p>Recommended rail: <strong>{eurChoice.rail}</strong></p>
            <p className="lab-muted">{eurChoice.reason}</p>
          </div>
        )}
      </section>

      {/* 8. EUR rail chooser */}
      <section className="lab-section">
        <h2>Choose the euro rail</h2>
        {EUR_CHOOSER_SCENARIOS.map((scenario) => (
          <MultipleChoice
            key={scenario.id}
            question={scenario.question}
            options={scenario.options}
            onCorrect={() => onEurScenarioCorrect(scenario.id)}
          />
        ))}
      </section>

      {/* Forward link */}
      <section className="lab-section">
        <h2>Where you'll use this next</h2>
        <p className="measure">
          The Canada deep-dive applies the same lens to CAD — Lynx, EFT, and Interac —
          and the capstone asks you to route a real payment across whichever corridor
          it throws at you. You now know all three sterling rails and all three euro
          rails cold.
        </p>
      </section>
    </div>
  );
}
