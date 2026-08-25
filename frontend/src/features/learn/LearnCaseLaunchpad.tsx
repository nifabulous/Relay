import { Link } from "react-router-dom";
import { CaseEntry } from "./cases/CaseEntry";
import type { CaseEntrySnapshot } from "./cases/selectDominantCase";
import "./LearnPage.css";

interface PracticeSummary {
  doneToday: boolean;
  reviewsDue: number;
  streak: number;
}

export interface LearnCaseLaunchpadProps {
  entries: readonly CaseEntrySnapshot[];
  dominant: CaseEntrySnapshot | null;
  practice: PracticeSummary;
}

export function LearnCaseLaunchpad({ entries, dominant, practice }: LearnCaseLaunchpadProps) {
  const secondary = entries.filter((entry) => entry !== dominant);
  const practiceLabel = practice.doneToday ? "Practice again" : "Start drill";
  const practiceSummary = practice.doneToday
    ? `Done for today — ${practice.streak}-day streak`
    : practice.reviewsDue > 0
      ? `${practice.reviewsDue} question${practice.reviewsDue === 1 ? "" : "s"} due for review · 5-minute drill`
      : practice.streak > 0
        ? `Keep your ${practice.streak}-day streak alive · 5-minute drill`
        : "Five quick questions from what you've learned";

  return (
    <>
      <section id="active-case-desk" className="learn-launchpad" aria-label="Active case desk">
        {dominant && (
          <div className="learn-launchpad__active" role="list" aria-label="Active case">
            <CaseEntry
              caseDef={dominant.definition}
              session={dominant.session}
            />
          </div>
        )}

        <div className="learn-launchpad__practice">
          <div>
            <h2>Daily practice</h2>
            <p>{practiceSummary}</p>
          </div>
          <Link
            to="/learn/practice"
            className={`relay-btn ${practice.doneToday ? "relay-btn--secondary" : "relay-btn--primary"}`}
          >
            {practiceLabel}
          </Link>
        </div>

        {secondary.length > 0 && (
          <section className="learn-launchpad__secondary" aria-labelledby="other-cases-heading">
            <h2 id="other-cases-heading">Other cases</h2>
            <div role="list" aria-label="Other cases">
              {secondary.map((entry) => (
                <CaseEntry
                  key={entry.definition.id}
                  caseDef={entry.definition}
                  session={entry.session}
                />
              ))}
            </div>
          </section>
        )}
      </section>

      <nav className="learn-launchpad__routes" aria-label="Learn routes">
        <a href="#active-case-desk">Cases</a>
        <a href="#technical-labs">Technical labs</a>
        <Link to="/learn/practice">Practice</Link>
      </nav>
    </>
  );
}
