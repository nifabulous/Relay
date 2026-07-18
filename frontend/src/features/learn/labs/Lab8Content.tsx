import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import { Decompose } from "../components/Decompose";
import { MultipleChoice } from "../components/MultipleChoice";
import { Button } from "../../../design-system/Button";
import { apiPost } from "../../../api/client";
import {
  TranslateResponseSchema,
  Pacs008CheckResponseSchema,
} from "../../../api/schemas";
import type { TranslateResponse, Pacs008CheckResponse } from "../../../api/schemas";
import { Pacs008View } from "../../operate/tools/Pacs008View";
import "./LabContent.css";

const SAMPLE = {
  transaction_reference: "REF123456",
  value_date: "2026-07-20",
  currency: "USD",
  interbank_amount: 100000,
  charge_code: "OUR",
  ordering: { name: "Acme Corp", bic: "CHASUS33" },
  beneficiary: { name: "Beta Ltd", bic: "BARCGB22" },
  uetr: "97ed4827-7b6f-4491-a06f-b548d5a7512d",
  remittance: "Invoice 42",
};

export function Lab8Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [translation, setTranslation] = useState<TranslateResponse | null>(null);
  const [addrCheck, setAddrCheck] = useState<Pacs008CheckResponse | null>(null);
  const [country, setCountry] = useState("USA");
  const [busyT, setBusyT] = useState(false);
  const [busyA, setBusyA] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const translatedRef = useRef(false);
  const flaggedRef = useRef(false);

  const generate = useCallback(async () => {
    setBusyT(true); setError(null);
    try {
      const r = await apiPost<TranslateResponse>("/api/message/translate", SAMPLE, TranslateResponseSchema);
      setTranslation(r);
      if (!translatedRef.current) { translatedRef.current = true; onCheckpoint("translate-message"); }
    } catch {
      setError("Could not translate the message. Please try again.");
    } finally { setBusyT(false); }
  }, [onCheckpoint]);

  const checkAddress = useCallback(async () => {
    setBusyA(true); setError(null);
    try {
      const r = await apiPost<Pacs008CheckResponse>(
        "/api/message/pacs008-check",
        {
          debtor_name: "Acme Corp", debtor_agent_bic: "CHASUS33",
          creditor_name: "Beta Ltd", creditor_agent_bic: "BARCGB22",
          creditor_postal_address: { street_name: "", town_name: "", country },
          settlement_amount: 100000, settlement_currency: "USD",
        },
        Pacs008CheckResponseSchema,
      );
      setAddrCheck(r);
      if (!flaggedRef.current && r.findings.some((f) => f.code === "PACS-ADDR-UNSTRUCTURED")) {
        flaggedRef.current = true; onCheckpoint("flag-address");
      }
    } catch {
      setError("Could not check the address. Please try again.");
    } finally { setBusyA(false); }
  }, [country, onCheckpoint]);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>Why the message changed</h2>
        <p className="measure">
          For decades the cross-border payment instruction was the SWIFT MT103. On
          <strong> 22 November 2025</strong> SWIFT&apos;s CBPR+ coexistence period ended: MT103 and
          MT202 were retired for cross-border and replaced by their ISO 20022 equivalents,
          <span className="mono"> pacs.008</span> and <span className="mono">pacs.009</span>.
          ISO 20022 carries far richer, structured data — the reason for the switch.
        </p>
        <Decompose segments={[
          { value: "2023", tone: "info", label: "Coexistence starts" },
          { value: "22 Nov 2025", tone: "warning", label: "Cross-border MT retired" },
          { value: "Nov 2026", tone: "accent", label: "Structured address required" },
        ]} />
      </section>

      <section className="lab-section">
        <h2>Map the fields</h2>
        <p className="measure">Each MT103 field has a pacs.008 home. Where does field 59 (the beneficiary) go?</p>
        <MultipleChoice
          question="Field 59 (Beneficiary Customer) maps to which pacs.008 element?"
          options={[
            { id: "cdtr", label: "Cdtr (Creditor)", correct: true, explanation: "Correct — the beneficiary becomes the Creditor (Cdtr) in pacs.008." },
            { id: "dbtr", label: "Dbtr (Debtor)", correct: false, explanation: "No — Dbtr is the payer (MT field 50). The beneficiary is the Creditor." },
            { id: "rmt", label: "RmtInf (Remittance)", correct: false, explanation: "No — RmtInf carries the payment reference (MT field 70), not the party." },
          ]}
          onCorrect={() => onCheckpoint("map-fields")}
        />
      </section>

      <section className="lab-section">
        <h2>See both side by side</h2>
        <p className="measure">Generate the pacs.008 equivalent of the sample MT103.</p>
        <Button variant="primary" onClick={generate} isLoading={busyT}>Generate pacs.008</Button>
        {error && <div className="lab-error" role="alert">{error}</div>}
        {translation && <Pacs008View result={translation} />}
      </section>

      <section className="lab-section">
        <h2>Why structured addresses matter</h2>
        <p className="measure">
          A creditor address of just a country (e.g. &quot;USA&quot;) passes &quot;field not empty&quot; but fails
          the real data-completeness intent. From November 2026 SWIFT requires structured or hybrid
          addresses. Try it: leave street and town blank.
        </p>
        <div className="lab-analyzer">
          <input type="text" className="lab-analyzer__input mono" aria-label="Country only"
            value={country} onChange={(e) => setCountry(e.target.value)} />
          <Button variant="primary" onClick={checkAddress} isLoading={busyA}>Check the address</Button>
        </div>
        {addrCheck && (
          <div className="lab-analyzer__result">
            <p>Verdict: <strong>{addrCheck.verdict}</strong></p>
            {addrCheck.findings.map((f, i) => (
              <p key={i}><span className="mono">{f.code}</span> — {f.message} {f.repair ? <em>{f.repair}</em> : null}</p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
