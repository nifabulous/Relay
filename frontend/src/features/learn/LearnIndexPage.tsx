import { Link } from "react-router-dom";
import {
  CURRICULUM,
  formatDuration,
  formatDurationAriaLabel,
  isModuleUnlocked,
  getPrerequisiteChain,
} from "./curriculum";
import { loadProgress } from "../../lib/persistence/storage";
import { useState, useCallback } from "react";
import { CaseEntry } from "./cases/CaseEntry";
import { CASE_CATALOG } from "./cases/caseCatalog";
import { loadCaseSession } from "./cases/caseStore";
import { loadPracticeState, dueReviews, practicedToday, displayStreak, dayKey } from "./practice/practiceStore";
import "./LearnPage.css";

export function LearnIndexPage() {
  const [completed] = useState<string[]>(() => loadProgress().completedModuleIds);
  const [practice] = useState(() => loadPracticeState());
  const today = dayKey(new Date());
  const streak = displayStreak(practice, today);
  const reviewsDue = dueReviews(practice, today).length;
  const doneToday = practicedToday(practice, today);
  // Load each case session once on mount. LearnIndexPage is the single source
  // of truth for the case entries' visible state; CaseEntry itself is pure
  // presentation. We read here (not inside CaseEntry) so CaseEntry stays
  // trivially testable with injected props.
  const [caseEntries] = useState(() =>
    CASE_CATALOG.map((definition) => ({
      definition,
      session: loadCaseSession(definition.id),
    })),
  );

  const isComplete = useCallback((id: string) => completed.includes(id), [completed]);

  return (
    <div className="learn-page">
      <div className="learn-page__header">
        <h1>Learn</h1>
        <p className="measure">Guided modules covering the full cross-border payment lifecycle.</p>
      </div>

      {/* Case-first entry: the dominant actions sit ABOVE the legacy
          curriculum so a learner's eye lands on the case work first.
          The curriculum list below is unchanged. */}
      <section
        className="learn-case-desks"
        aria-label="Customer case desks"
      >
        <div
          className="learn-case-desks__track"
          role="list"
          aria-label="Customer cases"
        >
          {caseEntries.map(({ definition, session }) => (
            <CaseEntry key={definition.id} caseDef={definition} session={session} />
          ))}
        </div>
      </section>

      {/* Daily practice strip — the return habit */}
      <div className="learn-practice-strip">
        <div className="learn-practice-strip__text">
          <span className="learn-practice-strip__title">Daily practice</span>
          <span className="learn-practice-strip__sub">
            {doneToday
              ? `Done for today — ${streak}-day streak`
              : reviewsDue > 0
                ? `${reviewsDue} question${reviewsDue === 1 ? "" : "s"} due for review · 5-minute drill`
                : streak > 0
                  ? `Keep your ${streak}-day streak alive · 5-minute drill`
                  : "Five quick questions from what you've learned"}
          </span>
        </div>
        <Link
          to="/learn/practice"
          className={`relay-btn ${doneToday ? "relay-btn--secondary" : "relay-btn--primary"}`}
        >
          {doneToday ? "Practice again" : "Start drill"}
        </Link>
      </div>

      <div className="learn-page__progress">
        <span className="mono">{completed.length} / {CURRICULUM.length}</span>
        <span>modules completed</span>
        <div className="learn-page__progress-bar">
          <div className="learn-page__progress-fill"
            style={{ width: `${(completed.length / CURRICULUM.length) * 100}%` }} />
        </div>
      </div>

      <div className="learn-page__section-heading">
        <h2>Technical labs</h2>
        <p className="measure">
          Self-paced reference modules covering identifiers, schemes, messaging,
          and tracking. Start the case above to put these together in practice.
        </p>
      </div>

      <ol className="learn-curriculum" aria-label="Curriculum modules">
        {CURRICULUM.map((mod, index) => {
          const unlocked = isModuleUnlocked(mod.id, completed);
          const complete = isComplete(mod.id);
          return (
            <li key={mod.id} className={[
              "learn-module",
              !unlocked && "learn-module--locked",
              complete && "learn-module--complete",
            ].filter(Boolean).join(" ")}>
              <div className="learn-module__num">{complete ? "✓" : index + 1}</div>
              <div className="learn-module__body">
                {unlocked ? (
                  <Link to={mod.href} className="learn-module__title">{mod.title}</Link>
                ) : (
                  <span className="learn-module__title learn-module__title--locked">{mod.title}</span>
                )}
                <p className="learn-module__subtitle">{mod.subtitle}</p>
                <div className="learn-module__meta">
                  <span
                    className="learn-module__duration"
                    aria-label={formatDurationAriaLabel(mod.duration)}
                  >
                    {formatDuration(mod.duration)}
                  </span>
                  {!unlocked && (
                    <span className="learn-module__locked-reason">
                      Complete first: {getPrerequisiteChain(mod.id)
                        .filter((p) => !completed.includes(p))
                        .map((p) => getModuleTitle(p))
                        .join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function getModuleTitle(id: string): string {
  return CURRICULUM.find((m) => m.id === id)?.title ?? id;
}
