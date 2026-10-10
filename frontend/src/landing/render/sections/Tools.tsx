import type { ReactNode } from "react";
import type { Demo } from "../demo";
import type { LandingFacts } from "../facts";
import { formatAmount, formatCount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** The Monday-to-Sunday week around the demonstration send date, in UTC. */
function weekOf(isoDate: string): Date[] {
  const sent = new Date(`${isoDate}T00:00:00Z`);
  const monday = new Date(sent);
  monday.setUTCDate(sent.getUTCDate() - ((sent.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day;
  });
}

/** MT103 field 32A: YYMMDD, currency, amount with a decimal comma. */
function field32A(valueDate: string, currency: string, amount: number): string {
  const [year, month, day] = valueDate.split("-");
  return `${year.slice(2)}${month}${day}${currency}${amount.toFixed(2).replace(".", ",")}`;
}

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
  const { prepare, fees, screening, valueDate, stp, tracking, payment } = demo;
  const sentDate = valueDate.sentAt.slice(0, 10);
  const holidays = new Set(valueDate.skippedHolidays);
  const message = stp.message;
  const mt103 = [
    `:20:${message.transaction_reference}`,
    `:23B:${message.bank_op_code}`,
    `:32A:${field32A(message.value_date, message.currency, message.interbank_amount)}`,
    `:50K:/${message.ordering.account}`,
    message.ordering.name.toUpperCase(),
    `:59:/${message.beneficiary.account}`,
    message.beneficiary.name.toUpperCase(),
    `:71A:${message.charge_code}`,
    `:121:${message.uetr}`,
  ];
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
          <Tool
            name="screening"
            title="Screen every hop"
            href="/app/operate/screening"
            viz={
              <>
                <div className="rows">
                  {screening.hops.map((hop, index) => (
                    <div key={hop.name}>
                      <span>
                        hop {index} · {hop.name}
                      </span>
                      <span>
                        {hop.score.toFixed(2)} · {hop.decision.toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="lbl note">best watchlist score at each hop</p>
              </>
            }
          >
            {`Fuzzy name matching against a fictional ${formatCount(tools.watchlistEntries)}-entry watchlist, for both parties and every bank on the route, a little stricter at each hop.`}
          </Tool>
        </div>
        <div className="grid g3">
          <Tool
            name="value date"
            title="When does it land?"
            href="/app/operate/value-date"
            viz={
              <>
                <div className="cal" aria-label={`Week of ${sentDate}`}>
                  {WEEKDAYS.map((day, index) => (
                    <span key={`h${index}`} aria-hidden="true">
                      {day}
                    </span>
                  ))}
                  {weekOf(sentDate).map((day, index) => {
                    const iso = day.toISOString().slice(0, 10);
                    const classes = [
                      index >= 5 ? "we" : "",
                      holidays.has(iso) ? "hd" : "",
                      iso === valueDate.valueDate ? "on" : "",
                      iso === sentDate ? "sent" : "",
                    ].filter(Boolean);
                    return (
                      <span key={iso} className={classes.join(" ") || undefined}>
                        {day.getUTCDate()}
                      </span>
                    );
                  })}
                </div>
                <p className="lbl note">
                  {`${valueDate.currency} ${valueDate.scheme.toUpperCase()} · sent after the ${valueDate.cutOff} cut-off · holiday skipped · T+${valueDate.businessDays}`}
                </p>
              </>
            }
          >
            {`Holiday calendars for ${formatCount(tools.holidayCalendars)} currencies, cut-off times and settlement lags from T+${tools.settlementLagDays.min} to T+${tools.settlementLagDays.max}. Instant rails ignore weekends.`}
          </Tool>
          <Tool
            name="stp check"
            title="Will it go straight through?"
            href="/app/operate/stp"
            viz={
              <>
                <pre className="mt">
                  {mt103.map((line) => (
                    <span key={line} className={line.startsWith(":59:") ? "hl" : undefined}>
                      {line}
                      {"\n"}
                    </span>
                  ))}
                </pre>
                <p className="lbl note">
                  <i>{stp.verdict}</i> · {stp.verdict === "CLEAN"
                    ? `${formatCount(tools.stpRules)} / ${formatCount(tools.stpRules)} rules pass`
                    : `${formatCount(tools.stpRules)} rules checked`}
                </p>
              </>
            }
          >
            {`${formatCount(tools.stpRules)} rules check an MT103 for straight-through processing, then translate it to ISO 20022 pacs.008.`}
          </Tool>
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
