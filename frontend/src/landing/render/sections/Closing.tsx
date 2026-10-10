import { Pluses } from "./shared";

export const THEME_CHOICES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "black", label: "Black" },
] as const;

export function Closing({ firstModuleHref }: { firstModuleHref: string }) {
  return (
    <section className="s s-cta" aria-labelledby="cta-title">
      <Pluses />
      <div className="cells" aria-hidden="true" />
      <div className="wrap">
        <span className="lbl">
          <i>[ start ]</i> run it yourself
        </span>
        <h2 id="cta-title">
          Send a payment that goes <em>nowhere</em>.
        </h2>
        <p className="lede">
          Every bank, account and amount you create is fictional. The checks, the routing and the timeline are how
          the real system works.
        </p>
        <div className="ctas">
          <a className="btn pri lg" href="/app">
            Open the simulation
          </a>
          <a className="btn ghost lg" href={firstModuleHref}>
            Start module 1
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="s foot">
      <Pluses />
      <div className="wrap lbl">
        <span data-simulation="">
          <i>[ simulation ]</i> demonstration institutions are fictional · reference data shows its provenance ·
          account numbers are <span className="nw">ACCT- placeholders</span>
        </span>
        <span className="themes" role="group" aria-label="Theme">
          {THEME_CHOICES.map((choice) => (
            <button type="button" key={choice.value} data-theme-choice={choice.value} aria-pressed="false">
              {choice.label}
            </button>
          ))}
        </span>
        <span>Relay · educational payment simulation</span>
      </div>
    </footer>
  );
}
