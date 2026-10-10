import type { Demo } from "../demo";
import { formatAmount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

/**
 * The route path runs along the stage's own grid lines. Total length is
 * 320 + 120 + 480 + 120 + 480 = 1520, so the two inner nodes sit at
 * 320 / 1520 and 920 / 1520 of the way along it.
 */
const ROUTE_PATH = "M-200 120 H120 V240 H600 V360 H1080";
const HOPS = [
  { at: "0.211", node: { x: 113, y: 113 }, tag: "t1", role: "origin" },
  { at: "0.605", node: { x: 593, y: 233 }, tag: "t2", role: "correspondent" },
  { at: "1", node: { x: 1066, y: 353 }, tag: "t3", role: "beneficiary" },
] as const;
/** The vertical stepper fills from its own progress, so its thresholds differ. */
const STEP_AT = ["0.2", "0.55", "0.9"] as const;

export function Route({ demo }: { demo: Demo }) {
  const { payment } = demo;
  const parties = [payment.origin, payment.correspondent, payment.beneficiary];
  const notes = ["IBAN checked · mod-97", "settles through its nostro", "credited · UETR tracked"];
  const amount = `${payment.currency} ${formatAmount(payment.amount).replace(/\.00$/, "")}`;
  return (
    <section className="s" id="route">
      <Pluses />
      <div className="wrap">
        <Head
          label={<SectionLabel index="01" title="follow every hop" simulation />}
          title={
            <>
              The payment runs on the <em>page's own lines</em>.
            </>
          }
          lede={`Scroll, and ${amount} leaves ${payment.origin.name} in ${payment.origin.place}, clears through ${payment.correspondent.name} in ${payment.correspondent.place}, and lands at ${payment.beneficiary.name}. All three banks are fictional; the steps are real.`}
        />
        <div className="routebox">
          <div className="rstage" id="route-stage">
            <div className="cells" aria-hidden="true" />
            <svg className="route-svg" viewBox="0 0 1080 456" preserveAspectRatio="none" aria-hidden="true">
              <path className="route-bg" d={ROUTE_PATH} />
              <path className="route-fg" id="route-path" d={ROUTE_PATH} pathLength={1} />
              {HOPS.map((hop) => (
                <rect key={hop.at} className="node" data-at={hop.at} x={hop.node.x} y={hop.node.y} width="14" height="14" />
              ))}
              <rect className="packet" id="route-packet" width="10" height="10" x="-5" y="-5" transform="translate(1080 360)" />
            </svg>
            {HOPS.map((hop, index) => (
              <div key={hop.at} className={`tag lbl ${hop.tag}`} data-at={hop.at}>
                <i>[ 0{index + 1} ]</i> {hop.role}
                <b>
                  {parties[index].name} · {parties[index].place}
                </b>
                <span className="m">{notes[index]}</span>
              </div>
            ))}
          </div>
          <div className="vroute" id="route-steps">
            <ol>
              {HOPS.map((hop, index) => (
                <li key={hop.at} data-at={STEP_AT[index]}>
                  <span className="lbl">
                    <i>[ 0{index + 1} ]</i> {hop.role}
                  </span>
                  <b>
                    {parties[index].name} · {parties[index].place}
                  </b>
                  <span className="m">{notes[index]}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid g3 steps">
            <a href="/app/operate/prepare">
              <span className="lbl">Validate</span>
              <h3>Is the instruction well-formed?</h3>
              <p>IBAN checksum, BIC, amount and currency, before anything leaves {payment.origin.place}.</p>
            </a>
            <a href="/app/operate/prepare">
              <span className="lbl">Verify</span>
              <h3>Is it the right person?</h3>
              <p>The payee's name is matched before the payment is released.</p>
            </a>
            <a href="/app/operate/prepare">
              <span className="lbl">Route</span>
              <h3>Who carries it?</h3>
              <p>Settlement instructions pick the correspondent that holds the nostro.</p>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
