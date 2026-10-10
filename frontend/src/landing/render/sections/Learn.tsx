import type { LearnSummary } from "../content";
import { formatCount, formatHours } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

export function Learn({ learn }: { learn: LearnSummary }) {
  return (
    <section className="s" id="learn">
      <Pluses />
      <div className="wrap">
        <Head
          label={<SectionLabel index="05" title="learn it properly" />}
          title={
            <>
              <em>{formatCount(learn.coreCount)} modules</em> and a capstone.
            </>
          }
          lede={`${formatCount(learn.coreCount)} core modules, from BICs to nostro reconciliation, then a capstone that runs a full payment. Between ${formatHours(learn.minutes.min)} and ${formatHours(learn.minutes.max)} hours in all.`}
        />
        <div className="grid g3 cards">
          <a href="/app/learn">
            <span className="lbl">
              <i>[</i> labs <i>]</i>
            </span>
            <h3>{formatCount(learn.labCount)} hands-on labs</h3>
            <p>One per module: check an IBAN, route a payment, repair an MT103.</p>
          </a>
          <a href="/app/learn/practice">
            <span className="lbl">
              <i>[</i> practice <i>]</i>
            </span>
            <h3>{formatCount(learn.questionCount)} practice questions</h3>
            <p>
              Across the {formatCount(learn.practiceModuleCount)} core modules, with a {formatCount(learn.drillSize)}
              -question daily drill.
            </p>
          </a>
          <a href={learn.firstCaseHref}>
            <span className="lbl">
              <i>[</i> case desk <i>]</i>
            </span>
            <h3>{formatCount(learn.caseCount)} customer cases</h3>
            <p>{learn.caseCorridors.join(", ")}.</p>
          </a>
        </div>
      </div>
    </section>
  );
}
