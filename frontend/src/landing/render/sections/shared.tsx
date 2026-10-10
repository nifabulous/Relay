import type { ReactNode } from "react";

/** Crosshair markers where a section's top rule meets the container rails. */
export function Pluses() {
  return (
    <>
      <span className="plus l" aria-hidden="true" />
      <span className="plus r" aria-hidden="true" />
    </>
  );
}

/** A bracketed mono label, e.g. "[ 01 / 06 ] follow every hop [ simulation ]". */
export function SectionLabel({ index, title, simulation = false }: { index: string; title: string; simulation?: boolean }) {
  return (
    <span className="lbl">
      <i>[ {index} / 06 ]</i> {title}
      {simulation ? (
        <>
          {" "}
          <i data-simulation="">[ simulation ]</i>
        </>
      ) : null}
    </span>
  );
}

export function Head({ label, title, lede, single = false }: { label: ReactNode; title: ReactNode; lede: ReactNode; single?: boolean }) {
  return (
    <div className={single ? "head single" : "head"}>
      <div className="t">
        {label}
        <h2>{title}</h2>
      </div>
      <p className="lede">{lede}</p>
    </div>
  );
}

/** The Route Loop symbol, drawn in the accent colour of the current theme. */
export function RelaySymbol() {
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true">
      <path
        d="M24 17h40c14 0 24 10 24 23 0 12-8 21-22 21H39c-15 0-25 9-25 22s10 22 25 22h30"
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="currentColor">
        <circle cx="24" cy="17" r="12" />
        <circle cx="66" cy="61" r="12" />
        <circle cx="69" cy="105" r="12" />
      </g>
    </svg>
  );
}
