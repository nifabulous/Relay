import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import { MultipleChoice } from "../components/MultipleChoice";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import { apiRequest, apiPost } from "../../../api/client";
import {
  SchemesResponseSchema,
  VoPResponseSchema,
  Pacs008CheckResponseSchema,
} from "../../../api/schemas";
import type {
  SchemesResponse,
  VoPResponse,
  Pacs008CheckResponse,
} from "../../../api/schemas";
import {
  eftSettlement,
  limitCheck,
  appReimbursement,
  type EftSettlement,
  type LimitVerdict,
  type AppReimbursement,
} from "./railsHelpers";
import "./LabContent.css";

// Autodeposit demo: a registered Interac e-Transfer that bypasses the
// security question. VoP still confirms the real account holder.
const AUTODEPOSIT_IBAN = "CA1234567890123456789012";

// The limits used for the Interac e-Transfer scenario. Amounts are minor units.
const ETRANSFER_LIMITS = {
  perTransactionMinor: 1_000_000, // $10,000
  perDayMinor: 3_000_000, // $30,000
  perMonthMinor: 20_000_000, // $200,000
};

// Sample submission times (ET) for the EFT window simulator.
const EFT_TIME_SAMPLES = [
  { label: "04:00 ET (before first window)", iso: "2026-07-20T04:00:00" },
  { label: "13:00 ET (before afternoon)", iso: "2026-07-20T13:00:00" },
  { label: "20:00 ET (after last window)", iso: "2026-07-20T20:00:00" },
  { label: "Saturday 10:00 ET (weekend)", iso: "2026-07-25T10:00:00" },
];

function formatMinor(minor: number, currency: string): string {
  const major = (minor / 100).toFixed(2);
  const symbol = currency === "GBP" ? "£" : currency === "CAD" ? "C$" : "";
  return `${symbol}${major}`;
}

export function Lab9Content({ moduleId, onCheckpoint }: LabContentProps) {
  // 1. Rail detail (CAD / GBP)
  const [railCurrency, setRailCurrency] = useState<string | null>(null);
  const [railData, setRailData] = useState<SchemesResponse | null>(null);
  const [railLoading, setRailLoading] = useState(false);
  const [railError, setRailError] = useState<string | null>(null);

  // 2. Autodeposit ↔ VoP
  const [vopName, setVopName] = useState("");
  const [vopResult, setVopResult] = useState<VoPResponse | null>(null);
  const [vopLoading, setVopLoading] = useState(false);
  const [vopError, setVopError] = useState<string | null>(null);

  // 3. CHAPS → pacs.008 address check
  const [chapsResult, setChapsResult] = useState<Pacs008CheckResponse | null>(null);
  const [chapsLoading, setChapsLoading] = useState(false);
  const [chapsError, setChapsError] = useState<string | null>(null);

  // 4. EFT window simulator
  const [eft, setEft] = useState<EftSettlement | null>(null);
  const [eftSubmitted, setEftSubmitted] = useState<string | null>(null);

  // 5. Interac limit checker
  const [limitAmount, setLimitAmount] = useState("7500");
  const [limitVerdict, setLimitVerdict] = useState<LimitVerdict | null>(null);

  // 6. APP reimbursement panel
  const [appAmount, setAppAmount] = useState("120000");
  const [appResult, setAppResult] = useState<AppReimbursement | null>(null);

  // Checkpoint-once guards
  const vopRef = useRef(false);
  const chapsRef = useRef(false);
  const eftRef = useRef(false);
  const limitRef = useRef(false);
  const appRef = useRef(false);

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
    } catch {
      setRailError("Could not load rail detail for this currency. Please try again.");
    } finally {
      setRailLoading(false);
    }
  }, []);

  // ── 2. Autodeposit ↔ VoP ────────────────────────────────────
  const runVop = useCallback(async () => {
    const name = vopName.trim();
    if (!name) return;
    setVopLoading(true);
    setVopError(null);
    setVopResult(null);
    try {
      const res = await apiPost<VoPResponse>(
        "/api/verify-payee",
        { iban: AUTODEPOSIT_IBAN, name },
        VoPResponseSchema,
      );
      setVopResult(res);
      // Reveal of the real account holder name completes the autodeposit↔VoP checkpoint.
      if (!vopRef.current && res.account_holder_name) {
        vopRef.current = true;
        onCheckpoint("autodeposit-vop");
      }
    } catch {
      setVopError("Verification failed. Please try again.");
    } finally {
      setVopLoading(false);
    }
  }, [vopName, onCheckpoint]);

  // ── 3. CHAPS → pacs.008 address check ───────────────────────
  const runChapsCheck = useCallback(async () => {
    setChapsLoading(true);
    setChapsError(null);
    setChapsResult(null);
    try {
      const res = await apiPost<Pacs008CheckResponse>(
        "/api/message/pacs008-check",
        {
          debtor_name: "Purchaser Ltd",
          debtor_agent_bic: "BARCGB22",
          creditor_name: "Conveyancer LLP",
          creditor_agent_bic: "NWBKGB22",
          // Country-only address: the structured-address gap that the Nov 2026
          // rule closes. CHAPS pacs.008 messages should carry a full address.
          creditor_postal_address: { street_name: "", town_name: "", country: "GB" },
          settlement_amount: 900000,
          settlement_currency: "GBP",
        },
        Pacs008CheckResponseSchema,
      );
      setChapsResult(res);
      if (
        !chapsRef.current &&
        res.findings.some((f) => f.code === "PACS-ADDR-UNSTRUCTURED")
      ) {
        chapsRef.current = true;
        onCheckpoint("chaps-pacs008");
      }
    } catch {
      setChapsError("Could not check the CHAPS message. Please try again.");
    } finally {
      setChapsLoading(false);
    }
  }, [onCheckpoint]);

  // ── 4. EFT window simulator ─────────────────────────────────
  const runEft = useCallback(
    (sample: (typeof EFT_TIME_SAMPLES)[number]) => {
      const settlement = eftSettlement(sample.iso);
      setEftSubmitted(sample.label);
      setEft(settlement);
      if (!eftRef.current) {
        eftRef.current = true;
        onCheckpoint("eft-window");
      }
    },
    [onCheckpoint],
  );

  // ── 5. Interac limit checker ────────────────────────────────
  const runLimit = useCallback(() => {
    const amount = Number(limitAmount) * 100; // dollars → minor units
    const verdict = limitCheck(amount, ETRANSFER_LIMITS);
    setLimitVerdict(verdict);
    if (!limitRef.current) {
      limitRef.current = true;
      onCheckpoint("limit-check");
    }
  }, [limitAmount, onCheckpoint]);

  // ── 6. APP reimbursement panel ──────────────────────────────
  const runApp = useCallback(() => {
    const amount = Number(appAmount) * 100; // pounds → minor units
    const result = appReimbursement(amount);
    setAppResult(result);
    if (!appRef.current) {
      appRef.current = true;
      onCheckpoint("app-reimbursement");
    }
  }, [appAmount, onCheckpoint]);

  const vopStatus = vopResult
    ? vopResult.outcome === "MATCH"
      ? ("passed" as const)
      : vopResult.outcome === "CLOSE_MATCH"
        ? ("needs_attention" as const)
        : vopResult.outcome === "NO_MATCH"
          ? ("failed" as const)
          : ("unavailable" as const)
    : null;

  return (
    <div className="lab-content" data-module-id={moduleId}>
      {/* Intro */}
      <section className="lab-section">
        <h2>Two rails, side by side</h2>
        <p className="measure">
          Lab 7 introduced the idea that every currency runs on multiple rails.
          Here we go deep on two: Canada&apos;s <strong>Interac e-Transfer</strong> and
          the UK&apos;s <strong>CHAPS</strong>. Each section is a hands-on checkpoint —
          run it to mark progress.
        </p>
      </section>

      {/* 1. Rail detail */}
      <section className="lab-section">
        <h2>Enriched rail detail</h2>
        <p className="measure">
          Pull the live scheme data for a currency to see how each rail really
          works: cut-off windows, settlement, reversibility, and operator roadmap.
        </p>
        <div className="lab-currency-pills">
          {["CAD", "GBP"].map((ccy) => (
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
                {scheme.processingWindows && scheme.processingWindows.length > 0 && (
                  <div className="lab-rail-card__block">
                    <h5>Processing windows</h5>
                    <ul>
                      {scheme.processingWindows.map((w, i) => <li key={i}>{w}</li>)}
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

      {/* 2. Autodeposit ↔ VoP */}
      <section className="lab-section">
        <h2>Autodeposit meets Verification of Payee</h2>
        <p className="measure">
          Interac <strong>Autodeposit</strong> lands funds without a security question —
          convenient, but it shifts trust onto the account. Run VoP on the demo
          CAD account to reveal the real account holder before you send.
        </p>
        <div className="lab-analyzer">
          <input
            type="text"
            className="lab-analyzer__input mono"
            aria-label="Autodeposit account"
            value={AUTODEPOSIT_IBAN}
            readOnly
          />
        </div>
        <div className="lab-analyzer">
          <input
            type="text"
            className="lab-analyzer__input"
            aria-label="Payee name to verify"
            placeholder="Enter the name you intend to pay"
            value={vopName}
            onChange={(e) => setVopName(e.target.value)}
          />
          <Button variant="primary" onClick={runVop} isLoading={vopLoading}>
            Verify payee
          </Button>
        </div>

        {vopError && <div className="lab-error" role="alert">{vopError}</div>}

        {vopResult && vopStatus && (
          <div className="lab-analyzer__result">
            <div className="lab-vop-result-header">
              <StatusChip status={vopStatus} />
              <strong>{vopResult.outcome}</strong>
            </div>
            <p>{vopResult.advice}</p>
            {vopResult.account_holder_name && (
              <div className="lab-vop-compare">
                <p>You entered: <strong>{vopResult.submitted_name}</strong></p>
                <p>Account holder: <strong className="mono">{vopResult.account_holder_name}</strong></p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. CHAPS → pacs.008 address check */}
      <section className="lab-section">
        <h2>CHAPS on pacs.008: the address trap</h2>
        <p className="measure">
          CHAPS now settles on the ISO 20022 pacs.008 message. A country-only
          creditor address slips past &quot;field not empty&quot; but fails the
          November 2026 structured-address requirement. Run the check on a £900k
          house purchase.
        </p>
        <Button variant="primary" onClick={runChapsCheck} isLoading={chapsLoading}>
          Check the CHAPS message
        </Button>

        {chapsError && <div className="lab-error" role="alert">{chapsError}</div>}

        {chapsResult && (
          <div className="lab-analyzer__result">
            <p>Verdict: <strong>{chapsResult.verdict}</strong></p>
            {chapsResult.findings.length === 0 ? (
              <p className="lab-muted">No issues found.</p>
            ) : (
              chapsResult.findings.map((f, i) => (
                <p key={i}>
                  <span className="mono">{f.code}</span> — {f.message}
                  {f.repair ? <em> {f.repair}</em> : null}
                </p>
              ))
            )}
          </div>
        )}
      </section>

      {/* 4. EFT window simulator */}
      <section className="lab-section">
        <h2>EFT settlement windows</h2>
        <p className="measure">
          Canadian EFT batches settle through a few daily windows. Submit before a
          window on a business day and funds value-date same day; miss it (or hit a
          weekend) and they roll to the next business day. Try a submission time.
        </p>
        <div className="lab-vop-scenarios">
          {EFT_TIME_SAMPLES.map((sample) => (
            <button
              key={sample.iso}
              type="button"
              className="lab-vop-scenario-btn"
              onClick={() => runEft(sample)}
            >
              {sample.label}
            </button>
          ))}
        </div>

        {eft && (
          <div className="lab-analyzer__result">
            <p>Submitted: <strong>{eftSubmitted}</strong></p>
            <p>Caught window: <strong>{eft.window}</strong></p>
            <p>Same-day settlement: <strong>{eft.sameDay ? "Yes" : "No"}</strong></p>
            <p>Value date: <strong className="mono">{eft.valueDate}</strong></p>
          </div>
        )}
      </section>

      {/* 5. Interac limit checker */}
      <section className="lab-section">
        <h2>Interac layered limits</h2>
        <p className="measure">
          Interac e-Transfer enforces limits at three layers: per transaction, per
          day, and per month. Enter an amount (CAD) to see which layer it trips.
        </p>
        <div className="lab-analyzer">
          <input
            type="number"
            min="0"
            className="lab-analyzer__input"
            aria-label="Amount in CAD"
            value={limitAmount}
            onChange={(e) => setLimitAmount(e.target.value)}
          />
          <Button variant="primary" onClick={runLimit}>Check limits</Button>
        </div>
        <p className="lab-caption">
          Caps: ${ETRANSFER_LIMITS.perTransactionMinor / 1_000_000},000 per transaction ·
          ${ETRANSFER_LIMITS.perDayMinor / 1_000_000},000 per day ·
          ${ETRANSFER_LIMITS.perMonthMinor / 1_000_000},000 per month
        </p>

        {limitVerdict && (
          <div className="lab-analyzer__result">
            {limitVerdict.clears ? (
              <p className="lab-valid">Clears all limit layers.</p>
            ) : limitVerdict.breached === null ? (
              <p className="lab-invalid">Enter a positive amount.</p>
            ) : (
              <p className="lab-invalid">
                Breached layer: <strong>{limitVerdict.breached}</strong>
              </p>
            )}
          </div>
        )}
      </section>

      {/* 6. APP reimbursement panel */}
      <section className="lab-section">
        <h2>APP scams: who pays?</h2>
        <p className="measure">
          UK Authorised Push Payment (APP) fraud is reimbursed by the sender and
          receiver PSPs jointly, capped at £85,000. Enter a loss (GBP) to see the
          split and where the cap bites.
        </p>
        <div className="lab-analyzer">
          <input
            type="number"
            min="0"
            className="lab-analyzer__input"
            aria-label="Loss amount in GBP"
            value={appAmount}
            onChange={(e) => setAppAmount(e.target.value)}
          />
          <Button variant="primary" onClick={runApp}>Calculate reimbursement</Button>
        </div>

        {appResult && (
          <div className="lab-analyzer__result">
            <p>Reimbursed: <strong>{formatMinor(appResult.reimbursedMinor, "GBP")}</strong></p>
            <p>Sender PSP pays: <strong>{formatMinor(appResult.senderPspMinor, "GBP")}</strong></p>
            <p>Receiver PSP pays: <strong>{formatMinor(appResult.receiverPspMinor, "GBP")}</strong></p>
            <p>Capped at: <strong>{formatMinor(appResult.cappedAtMinor, "GBP")}</strong></p>
          </div>
        )}
      </section>

      {/* 7. Rail-chooser */}
      <section className="lab-section">
        <h2>Choose the rail</h2>
        <p className="measure">
          A buyer is purchasing a house for £900,000 and the deposit must arrive
          same day, irrevocably. Which UK rail do you instruct?
        </p>
        <MultipleChoice
          question="£900k house purchase — same-day, irrevocable settlement. Which rail?"
          options={[
            {
              id: "chaps",
              label: "CHAPS",
              correct: true,
              explanation:
                "Correct — CHAPS is the Bank of England's RTGS: same-day, final, and uncapped. Built for high-value property completions.",
            },
            {
              id: "faster",
              label: "Faster Payments",
              correct: false,
              explanation:
                "No — Faster Payments is instant but capped (around £1M per payment, and many banks set far lower limits). Not suitable for irrevocable high-value settlement.",
            },
            {
              id: "bacs",
              label: "BACS",
              correct: false,
              explanation:
                "No — BACS is a batch system that settles over three working days. Far too slow for a same-day completion.",
            },
          ]}
          onCorrect={() => onCheckpoint("rail-chooser")}
        />
      </section>
    </div>
  );
}
