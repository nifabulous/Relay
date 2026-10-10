import type { ReactNode } from "react";
import type { Demo } from "../demo";
import type { LandingFacts } from "../facts";
import { formatAmount, formatCount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

function Tool({ name, title, href, children, viz }: { name: string; title: string; href: string; children: string; viz: ReactNode }) {
  return (
    <div className="tool">
      <span className="lbl">
        <i>[</i> {name} <i>]</i>
      </span>
      <h3>
        <a href={href}>{title}</a>
      </h3>
      <p>{children}</p>
      <div className="viz">{viz}</div>
    </div>
  );
}

export function Tools({ facts, demo }: { facts: LandingFacts; demo: Demo }) {
  const { tools } = facts;
  const { prepare, fees, tracking, payment } = demo;
  return (
    <section className="s" id="tools">
      <Pluses />
      <div className="wrap">
        <Head
          label={<SectionLabel index="06" title="the operator's desk" simulation />}
          title={
            <>
              Run the checks a <em>payments team</em> runs.
            </>
          }
          lede="Prepare a payment, split fees OUR, SHA or BEN, screen every hop, find the value date, check an MT103 and track it by UETR."
        />
        <div className="grid g3">
          <Tool
            name="prepare"
            title="Prepare a payment"
            href="/app/operate/prepare"
            viz={
              <>
                <div className="rows">
                  {(["lenient", "standard", "strict"] as const).map((mode) => (
                    <div key={mode} className={mode === "standard" ? "on" : undefined}>
                      <span>{mode}</span>
                      <span>{prepare.verdicts[mode]}</span>
                    </div>
                  ))}
                </div>
                <p className="lbl note">valid IBAN · payee close match</p>
              </>
            }
          >
            {`Validates the IBAN, checks the payee, picks a route and returns one of ${formatCount(tools.verdicts)} verdicts, at lenient, standard or strict settings.`}
          </Tool>
          <Tool
            name="fees"
            title="Who pays the fees?"
            href="/app/operate/fees"
            viz={
              <>
                <div className="rows">
                  {(["OUR", "SHA", "BEN"] as const).map((code) => {
                    const result = fees.byChargeCode[code];
                    return (
                      <div key={code}>
                        <span>{code}</span>
                        <span>{formatAmount(result.received)} arrives</span>
                      </div>
                    );
                  })}
                </div>
                <p className="lbl note">
                  {`${payment.currency} ${formatAmount(payment.amount)} sent · under OUR the sender adds ${formatAmount(fees.byChargeCode.OUR.senderPaysExtra)}`}
                </p>
              </>
            }
          >
            OUR, SHA or BEN: see the lift fee at each hop and what the beneficiary actually receives.
          </Tool>
        </div>
        <div className="grid g3">
          <Tool
            name="tracking"
            title="Track it by UETR"
            href="/app/operate/tracking"
            viz={
              <div className="tl">
                {tracking.map((step, index) => (
                  <div key={`${step.status}${index}`} className={index < tracking.length - 1 ? "on" : undefined}>
                    <i aria-hidden="true" />
                    <span>{step.status}</span>
                    <span>{step.code}</span>
                  </div>
                ))}
              </div>
            }
          >
            A simulated gpi timeline from initiated to credited, with each step mapped to its pacs.002 status code.
          </Tool>
        </div>
      </div>
    </section>
  );
}
