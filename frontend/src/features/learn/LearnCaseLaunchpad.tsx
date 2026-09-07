import { Link } from "react-router-dom";
import { CaseEntry } from "./cases/CaseEntry";
import type { CaseEntrySnapshot } from "./cases/selectDominantCase";
import { Icon } from "../../design-system/coss/icon";
import { DRILL_SIZE } from "./practice/selectDaily";
import "./LearnPage.css";

interface PracticeSummary {
  doneToday: boolean;
  reviewsDue: number;
  streak: number;
  /**
   * Today's recorded drill, when there is one. The pulse reports the score the
   * practice store holds; without a record the learner has answered nothing
   * today, and the drill length is the only other number in play.
   */
  todayDrill?: { correct: number; total: number } | null;
}

export interface LearnCaseLaunchpadProps {
  entries: readonly CaseEntrySnapshot[];
  dominant: CaseEntrySnapshot | null;
  practice: PracticeSummary;
  showSecondary?: boolean;
}

export function LearnCaseLaunchpad({
  entries,
  dominant,
  practice,
  showSecondary = true,
}: LearnCaseLaunchpadProps) {
  const secondary = entries.filter((entry) => entry !== dominant);
  const answeredCorrectly = practice.todayDrill?.correct ?? 0;
  const drillLength = practice.todayDrill?.total ?? DRILL_SIZE;
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
              variant="active"
            />
          </div>
        )}

        <section className="learn-launchpad__practice" aria-labelledby="daily-practice-heading">
          <div className="learn-launchpad__practice-header">
            <div>
              <p className="learn-launchpad__eyebrow">Keep your momentum</p>
              <h2 id="daily-practice-heading">Daily practice</h2>
              <p>{practiceSummary}</p>
            </div>
          </div>

          <div className="learn-practice-stats" aria-label="Learning pulse">
            <div className="learn-practice-stat">
              <span className="learn-practice-stat__icon" aria-hidden="true">
                <Icon name="flame" size={20} />
              </span>
              <span className="learn-practice-stat__value">{practice.streak}</span>
              <span className="learn-practice-stat__label">day streak</span>
            </div>
            <div className="learn-practice-stat">
              <span className="learn-practice-stat__icon learn-practice-stat__icon--warning" aria-hidden="true">
                <Icon name="repeat" size={20} />
              </span>
              <span className="learn-practice-stat__value">{practice.reviewsDue}</span>
              <span className="learn-practice-stat__label">
                {practice.reviewsDue === 1 ? "review due" : "reviews due"}
              </span>
            </div>
            <div className="learn-practice-stat">
              <span className="learn-practice-stat__icon" aria-hidden="true">
                <Icon name="checkCircle" size={20} />
              </span>
              <span className="learn-practice-stat__value">
                {answeredCorrectly} of {drillLength}
              </span>
              <span className="learn-practice-stat__label">correct today</span>
            </div>
          </div>

          <Link
            to="/learn/practice"
            className={`relay-btn ${practice.doneToday ? "relay-btn--secondary" : "relay-btn--primary"}`}
          >
            {practiceLabel}
          </Link>
        </section>

        {showSecondary && secondary.length > 0 && (
          <LearnSecondaryCases entries={secondary} />
        )}
      </section>

      <nav className="learn-launchpad__routes" aria-label="Learn routes">
        <a href="#active-case-desk" aria-label="Cases">
          <Icon name="route" size={20} />
          <span>
            <strong>Cases</strong>
            <small>Real-world scenarios</small>
          </span>
          <Icon name="chevronRight" size={18} />
        </a>
        <a href="#technical-labs" aria-label="Technical labs">
          <Icon name="book" size={20} />
          <span>
            <strong>Technical labs</strong>
            <small>Deep technical modules</small>
          </span>
          <Icon name="chevronRight" size={18} />
        </a>
        <Link to="/learn/practice" aria-label="Practice">
          <Icon name="checkCircle" size={20} />
          <span>
            <strong>Practice</strong>
            <small>Build speed and accuracy</small>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
      </nav>
    </>
  );
}

export function LearnSecondaryCases({ entries }: { entries: readonly CaseEntrySnapshot[] }) {
  return (
    <section className="learn-launchpad__secondary" aria-labelledby="other-cases-heading">
      <h2 id="other-cases-heading">Other cases</h2>
      <div role="list" aria-label="Other cases">
        {entries.map((entry) => (
          <CaseEntry
            key={entry.definition.id}
            caseDef={entry.definition}
            session={entry.session}
            variant="compact"
          />
        ))}
      </div>
    </section>
  );
}
