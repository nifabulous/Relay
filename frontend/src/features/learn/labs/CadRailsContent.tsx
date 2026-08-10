import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import { MultipleChoice } from "../components/MultipleChoice";
import { Button } from "../../../design-system/Button";
import { apiRequest } from "../../../api/client";
import { SchemesResponseSchema } from "../../../api/schemas";
import type { SchemesResponse } from "../../../api/schemas";
import { chooseCadRail, type CadRailChoice } from "./railsHelpers";
import "./LabContent.css";

// Illustrative bank-set Interac e-Transfer cap for the rail picker (minor
// units). Network and bank caps vary — Lab 9's limit checker covers the layers.
const DEMO_INTERAC_CAP_MINOR = 1_000_000; // C$10,000

const CAD_CHOOSER_SCENARIOS = [
  {
    id: "closing",
    question: "A C$3.2M corporate acquisition payment must be final before the 17:00 ET closing call. Which CAD rail?",
    options: [
      { id: "lynx", label: "Lynx", correct: true, explanation: "Correct — Lynx is the Bank of Canada's RTGS: real-time, final, irrevocable, no cap. High-value time-critical settlement is exactly what it exists for." },
      { id: "eft", label: "EFT", correct: false, explanation: "EFT batches settle through ACSS over 1-2 business days — the deal closes before the file even processes." },
      { id: "interac", label: "Interac e-Transfer", correct: false, explanation: "Interac caps out at a few thousand dollars per transfer. C$3.2M is three orders of magnitude past it." },
    ],
  },
  {
    id: "vendors",
    question: "Monthly payment run to 400 vendors, due at month-end, known two weeks ahead. Which CAD rail?",
    options: [
      { id: "eft", label: "EFT", correct: true, explanation: "Correct — scheduled, batched, high-volume: EFT through ACSS costs cents per payment. Submit before a window on the due date and everyone is paid." },
      { id: "lynx", label: "Lynx", correct: false, explanation: "C$5-25 per payment × 400 vendors for money that isn't urgent — you'd be paying wire prices for batch work." },
      { id: "interac", label: "Interac e-Transfer", correct: false, explanation: "Vendor runs exceed Interac's per-transaction and daily caps quickly, and 400 individual e-Transfers is an operational headache." },
    ],
  },
];

const RTR_QUESTION = {
  question: "When the Real-Time Rail (RTR) launches, what changes for Interac e-Transfer?",
  options: [
    {
      id: "settle",
      label: "It gains real-time clearing AND settlement on ISO 20022 messages",
      correct: true,
      explanation:
        "Correct. Today an e-Transfer notifies in seconds but settles later across existing rails. The RTR closes that gap: payment-by-payment clearing and settlement in real time, carried as ISO 20022 — which also unlocks rich remittance data.",
    },
    {
      id: "limits",
      label: "Its per-transfer limits are abolished",
      correct: false,
      explanation:
        "Limits are risk controls set by Interac and the banks — the RTR changes the plumbing underneath, not the caps on top.",
    },
    {
      id: "replace",
      label: "It replaces Lynx as Canada's RTGS",
      correct: false,
      explanation:
        "No — Lynx keeps wholesale high-value settlement. The RTR is the retail real-time layer beside it, with pre-funded settlement accounts at the Bank of Canada.",
    },
    {
      id: "nothing",
      label: "Nothing — RTR is a rebrand of the EFT system",
      correct: false,
      explanation:
        "EFT/ACSS is the batch rail and stays. The RTR is new infrastructure built for real-time, data-rich payments.",
    },
  ],
};

function formatCadMinor(minor: number): string {
  return `C$${(minor / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CadRailsContent({ moduleId, onCheckpoint }: LabContentProps) {
  // 1. CAD rail detail
  const [railData, setRailData] = useState<SchemesResponse | null>(null);
  const [railLoading, setRailLoading] = useState(false);
  const [railError, setRailError] = useState<string | null>(null);

  // 2. CAD rail picker
  const [cadAmount, setCadAmount] = useState("8500");
  const [cadUrgent, setCadUrgent] = useState(true);
  const [cadChoice, setCadChoice] = useState<CadRailChoice | null>(null);

  // Checkpoint-once guards
  const detailRef = useRef(false);
  const pickRef = useRef(false);
  const chooserDone = useRef(new Set<string>());
  const chooserRef = useRef(false);

  // ── 1. Rail detail ──────────────────────────────────────────
  const loadRail = useCallback(async () => {
    setRailLoading(true);
    setRailError(null);
    setRailData(null);
    try {
      const result = await apiRequest<SchemesResponse>(
        "/api/schemes?currency=CAD",
        undefined,
        SchemesResponseSchema,
      );
      setRailData(result);
      if (!detailRef.current) {
        detailRef.current = true;
        onCheckpoint("cad-rail-detail");
      }
    } catch {
      setRailError("Could not load the CAD rail detail. Please try again.");
    } finally {
      setRailLoading(false);
    }
  }, [onCheckpoint]);

  // ── 2. CAD rail picker ──────────────────────────────────────
  const runCadPicker = useCallback(() => {
    const dollars = Number.parseFloat(cadAmount.replace(/[C$,\s]/gi, ""));
    const minor = Math.round(dollars * 100);
    setCadChoice(chooseCadRail(minor, cadUrgent, DEMO_INTERAC_CAP_MINOR));
    if (!pickRef.current && Number.isFinite(minor) && minor > 0) {
      pickRef.current = true;
      onCheckpoint("lynx-vs-eft");
    }
  }, [cadAmount, cadUrgent, onCheckpoint]);

  // ── Chooser checkpoint wiring ───────────────────────────────
  const onScenarioCorrect = useCallback((id: string) => {
    chooserDone.current.add(id);
    if (!chooserRef.current && chooserDone.current.size >= CAD_CHOOSER_SCENARIOS.length) {
      chooserRef.current = true;
      onCheckpoint("cad-rail-chooser");
    }
  }, [onCheckpoint]);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      {/* Intro */}
      <section className="lab-section">
        <h2>Canada's three-layer stack</h2>
        <p className="measure">
          Lab 9 put you inside Interac e-Transfer — aliases, Autodeposit, layered
          limits, EFT windows. This module zooms out to the whole Canadian stack:{" "}
          <strong>Lynx</strong> at the top for wholesale value,{" "}
          <strong>EFT through ACSS</strong> in the middle for scheduled volume, and{" "}
          <strong>Interac</strong> at the retail edge — with the{" "}
          <strong>Real-Time Rail</strong> about to rewire how the retail layer settles.
        </p>
      </section>

      {/* 1. Live rail detail */}
      <section className="lab-section">
        <h2>Pull the live CAD rail detail</h2>
        <p className="measure">
          Load the scheme data and read all three rails side by side — windows, limits,
          settlement, and the RTR roadmap.
        </p>
        <div className="lab-currency-pills">
          <button
            type="button"
            className={["lab-currency-pill", railData && "lab-currency-pill--active"].filter(Boolean).join(" ")}
            onClick={loadRail}
            disabled={railLoading}
            aria-pressed={railData !== null}
          >
            CAD
          </button>
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
                </dl>
                {scheme.howItWorks && scheme.howItWorks.length > 0 && (
                  <div className="lab-rail-card__block">
                    <h5>How it works</h5>
                    <ol>
                      {scheme.howItWorks.map((step, i) => <li key={i}>{step}</li>)}
                    </ol>
                  </div>
                )}
                {scheme.processingWindows && scheme.processingWindows.length > 0 && (
                  <div className="lab-rail-card__block">
                    <h5>Processing windows</h5>
                    <ul>
                      {scheme.processingWindows.map((w, i) => <li key={i}>{w}</li>)}
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

      {/* 2. Lynx in depth */}
      <section className="lab-section">
        <h2>Lynx: wholesale finality</h2>
        <p className="measure">
          Lynx is the Bank of Canada's real-time gross settlement system — the rail that
          replaced LVTS in 2021. Every payment settles individually, in central-bank
          money, with <strong>immediate finality</strong>: once settled, it cannot be
          unwound. Participants pre-fund settlement balances, which is the same risk
          model the incoming RTR borrows. Lynx is ISO 20022-native, runs on business
          days, and carries Canada's high-value flows — securities settlement legs,
          interbank funding, and the CAD side of FX trades. Expect C$5-25 per payment
          at the customer end, and no amount ceiling.
        </p>
        <table className="lab-table">
          <thead>
            <tr><th>Layer</th><th>Rail</th><th>Settles</th><th>Best at</th></tr>
          </thead>
          <tbody>
            <tr><td>Wholesale</td><td>Lynx (RTGS)</td><td>Real-time, per payment, final</td><td>High value, zero settlement risk</td></tr>
            <tr><td>Scheduled volume</td><td>EFT via ACSS</td><td>Batch windows, 1-2 business days</td><td>Payroll and vendor runs at cents each</td></tr>
            <tr><td>Retail instant</td><td>Interac e-Transfer</td><td>Notifies in seconds; settles across existing rails (RTR will make this real-time)</td><td>P2P and small business, alias-addressed</td></tr>
          </tbody>
        </table>
      </section>

      {/* 3. EFT / ACSS in depth */}
      <section className="lab-section">
        <h2>EFT through ACSS: the batch middle</h2>
        <p className="measure">
          Canadian EFT files clear through the <strong>ACSS</strong> — the Automated
          Clearing Settlement System. Files are exchanged in the daily windows you
          simulated in Lab 9 (05:00, 14:15, 19:00 ET), positions are netted between
          banks, and the net obligations settle across accounts at the Bank of Canada.
          The economics are the point: cents per transaction, in exchange for value
          dating measured in business days. A file submitted after the last window on
          Friday doesn't begin processing until Monday — the same weekend trap as
          Bacs in the UK.
        </p>
      </section>

      {/* 4. CAD rail picker */}
      <section className="lab-section">
        <h2>Lynx, EFT, or Interac?</h2>
        <p className="measure">
          Your bank's Interac cap in this simulation is{" "}
          <strong>{formatCadMinor(DEMO_INTERAC_CAP_MINOR)}</strong>. Enter an amount,
          say whether it must be final today, and see which rail carries it.
        </p>
        <div className="lab-analyzer">
          <input
            type="number"
            min="0"
            className="lab-analyzer__input"
            aria-label="Amount in CAD"
            value={cadAmount}
            onChange={(e) => setCadAmount(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={cadUrgent}
              onChange={(e) => setCadUrgent(e.target.checked)}
            />{" "}
            Must be final today
          </label>
          <Button variant="primary" onClick={runCadPicker}>Choose the rail</Button>
        </div>
        {cadChoice && (
          <div className="lab-analyzer__result" data-testid="cad-rail-result">
            <p>Recommended rail: <strong>{cadChoice.rail}</strong></p>
            <p className="lab-muted">{cadChoice.reason}</p>
          </div>
        )}
      </section>

      {/* 5. RTR roadmap */}
      <section className="lab-section">
        <h2>The Real-Time Rail</h2>
        <p className="measure">
          The RTR is Payments Canada's incoming real-time infrastructure: an exchange
          layer (built with Interac) carrying ISO 20022 messages, and a settlement layer
          with pre-funded accounts at the Bank of Canada. It doesn't replace Lynx or
          EFT — it gives the retail layer what they never had: clearing{" "}
          <em>and settlement</em> in real time, around the clock, with rich remittance
          data on every payment.
        </p>
        <MultipleChoice
          question={RTR_QUESTION.question}
          options={RTR_QUESTION.options}
          onCorrect={() => onCheckpoint("rtr-roadmap")}
        />
      </section>

      {/* 6. CAD rail chooser */}
      <section className="lab-section">
        <h2>Choose the Canadian rail</h2>
        <p className="measure">
          Two payments, two right answers. Get both to bank the checkpoint.
        </p>
        {CAD_CHOOSER_SCENARIOS.map((scenario) => (
          <MultipleChoice
            key={scenario.id}
            question={scenario.question}
            options={scenario.options}
            onCorrect={() => onScenarioCorrect(scenario.id)}
          />
        ))}
      </section>

      {/* Forward link */}
      <section className="lab-section">
        <h2>Where you'll use this next</h2>
        <p className="measure">
          Fees & FX runs a CAD correspondent chain you can now route deliberately, and
          the capstone will hand you corridors where the CAD last mile — Lynx, EFT, or
          Interac — decides whether your payment makes its deadline.
        </p>
      </section>
    </div>
  );
}
