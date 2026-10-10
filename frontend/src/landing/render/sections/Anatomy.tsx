import type { Demo } from "../demo";
import { formatAmount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

/** Isometric plate geometry, in SVG user units (viewBox 0 0 520 700). */
export const PLATE = { cx: 200, a: 160, b: 80, t: 10, y0: 130, gap: 112 } as const;

/** Words for the decision count in the section 02 headline, indexed by count. */
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export function Anatomy({ demo }: { demo: Demo }) {
  const { cx, a, b, t, y0, gap } = PLATE;
  const plates: Array<[string, string, string]> = [
    ["0.1", "INSTRUCTION", `pacs.008 · ${demo.payment.currency} ${formatAmount(demo.payment.amount)}`],
    ["0.2", "VALIDATE", "IBAN · BIC · amount"],
    ["0.3", "VERIFY PAYEE", "close match, confirmed"],
    ["0.4", "ROUTE", "correspondent + SSI"],
    ["0.5", "SETTLE", "credited · UETR tracked"],
  ];
  const lastY = y0 + (plates.length - 1) * gap;
  return (
    <section className="s" id="anatomy">
      <Pluses />
      <div className="wrap">
        <div className="anat">
          <div>
            <Head
              single
              label={<SectionLabel index="02" title="anatomy of a payment" simulation />}
              title={
                <>
                  Every payment is {NUMBER_WORDS[plates.length]} <em>decisions</em>.
                </>
              }
              lede="Take the instruction apart. Each layer is a check a real bank runs, and the curriculum has a lab for each."
            />
            <div className="ledger mono" id="ledger" aria-label="Illustrative timeline of the demonstration payment">
              {demo.ledger.map((row) => (
                <div key={row.time}>
                  <span>{row.time}</span>
                  <span>{row.event}</span>
                  <span>{row.result}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="iso">
            <svg viewBox="0 0 520 700" id="anatomy-svg" aria-hidden="true" data-y0={y0} data-gap={gap}>
              {plates.map(([fig, name, detail], index) => {
                const cy = y0 + index * gap;
                return (
                  <g className="plate" key={fig}>
                    <polygon className="side" points={`${cx - a},${cy} ${cx},${cy + b} ${cx},${cy + b + t} ${cx - a},${cy + t}`} />
                    <polygon className="side2" points={`${cx + a},${cy} ${cx},${cy + b} ${cx},${cy + b + t} ${cx + a},${cy + t}`} />
                    <polygon className="top" points={`${cx},${cy - b} ${cx + a},${cy} ${cx},${cy + b} ${cx - a},${cy}`} />
                    <path className="tick" d={`M${cx - a / 2} ${cy - b / 2} L${cx + a / 2} ${cy + b / 2} M${cx + a / 2} ${cy - b / 2} L${cx - a / 2} ${cy + b / 2}`} />
                    <line className="ld" x1={cx + a} y1={cy} x2="512" y2={cy} />
                    <text x="512" y={cy - 10} textAnchor="end">
                      FIG {fig}
                    </text>
                    <text className="n" x="512" y={cy + 14} textAnchor="end">
                      {name}
                    </text>
                    <text className="d" x="512" y={cy + 30} textAnchor="end">
                      {detail}
                    </text>
                  </g>
                );
              })}
              <g id="anatomy-cube" transform={`translate(0 ${lastY})`}>
                <polygon className="cube1" points={`${cx},-16 ${cx + 16},-8 ${cx},0 ${cx - 16},-8`} />
                <polygon className="cube2" points={`${cx - 16},-8 ${cx},0 ${cx},16 ${cx - 16},8`} />
                <polygon className="cube3" points={`${cx + 16},-8 ${cx},0 ${cx},16 ${cx + 16},8`} />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
