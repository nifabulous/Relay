import { Fragment } from "react";
import type { Demo } from "../demo";
import type { LandingFacts } from "../facts";
import { formatCount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

function sortCode(digits: string): string {
  return digits.match(/.{2}/g)!.join("-");
}

export function Data({ facts, demo }: { facts: LandingFacts; demo: Demo }) {
  const { directory, ssi, atlas } = facts;
  const { iban, payee } = demo;
  const checks: Array<[string, string]> = [
    [`Country ${iban.countryCode} · length ${iban.length}`, "pass"],
    [`Check digits ${iban.checkDigits} · mod-97`, "valid"],
    [`Bank ${iban.bankCode} · sort code ${sortCode(iban.sortCode)}`, "parsed"],
    ["Next: verify the payee", "→"],
  ];
  const stats: Array<[string, number, string]> = [
    ["SSI routes", ssi.rows, `${formatCount(ssi.settleableRows)} with settlement fields`],
    ["beneficiary banks", ssi.beneficiaryBanks, "with instructions on file"],
    ["correspondents", ssi.correspondents, "distinct correspondent BICs"],
    ["atlas", atlas.beneficiaryCountries, "beneficiary countries mapped"],
  ];
  return (
    <section className="s band" id="data">
      <Pluses />
      <div className="cells dim" aria-hidden="true" />
      <div className="wrap">
        <Head
          label={<SectionLabel index="04" title="the data behind the route" simulation />}
          title={
            <>
              Real reference data. <em>Fictional money.</em>
            </>
          }
          lede={`${formatCount(directory.banks)} banks, ${formatCount(ssi.rows)} settlement routes and a correspondent atlas covering ${formatCount(atlas.beneficiaryCountries)} countries. Every SSI row shows its provenance, and every account number is an ACCT- placeholder.`}
        />
        <div className="grid g4">
          {stats.map(([label, value, note]) => (
            <div className="stat" key={label}>
              <span className="lbl">
                <i>[</i> {label} <i>]</i>
              </span>
              <b data-count="">{formatCount(value)}</b>
              <small>{note}</small>
            </div>
          ))}
        </div>
        <div className="grid g3">
          <div className="ibanbox">
            <span className="lbl">
              <i>[ beneficiary bank ]</i> watch it validate
            </span>
            <div className="iban" id="iban-demo">
              {iban.groups.map((group) => (
                <span key={group}>{group}</span>
              ))}
            </div>
            <div className="checks" id="iban-checks">
              {checks.map(([text, result]) => (
                <div key={text}>
                  <span>{text}</span>
                  <b>{result}</b>
                </div>
              ))}
            </div>
            <button type="button" className="btn replay" id="iban-replay" hidden>
              Replay
            </button>
          </div>
          <div className="ssi">
            <span className="lbl">
              <i>[ settlement instruction ]</i> sample record · fictional
            </span>
            <dl>
              {demo.ssiSample.map(([key, value]) => (
                <Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </Fragment>
              ))}
            </dl>
            <span className="prov">source and as-of date on every real row</span>
          </div>
          <div className="vop">
            <span className="lbl">
              <i>[ verification of payee ]</i>
            </span>
            <div className="pair">
              <div>
                <span className="lbl who">entered</span>
                {payee.entered}
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <span className="lbl who">on file</span>
                {payee.onFile}
              </div>
            </div>
            <span className="res">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 1a4 4 0 0 1 0 8z" fill="currentColor" />
              </svg>
              close match · confirm before sending
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
