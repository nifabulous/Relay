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
import { CASE_CATALOG } from "./cases/caseCatalog";
import { loadCaseSession } from "./cases/caseStore";
import { selectDominantCase } from "./cases/selectDominantCase";
import { loadPracticeState, dueReviews, practicedToday, displayStreak, dayKey } from "./practice/practiceStore";
import { LearnCaseLaunchpad } from "./LearnCaseLaunchpad";
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
    })).map((entry, index) => ({ ...entry, index })),
  );
  const dominantCase = selectDominantCase(caseEntries);

  const isComplete = useCallback((id: string) => completed.includes(id), [completed]);

  return (
    <div className="learn-page">
      <div className="learn-page__header">
        <h1>Learn</h1>
        <p className="measure">Guided modules covering the full cross-border payment lifecycle.</p>
      </div>

      <LearnCaseLaunchpad
        entries={caseEntries}
        dominant={dominantCase}
        practice={{ doneToday, reviewsDue, streak }}
      />

      <div className="learn-page__progress">
        <span className="mono">{completed.length} / {CURRICULUM.length}</span>
        <span>modules completed</span>
        <div className="learn-page__progress-bar">
          <div className="learn-page__progress-fill"
            style={{ width: `${(completed.length / CURRICULUM.length) * 100}%` }} />
        </div>
      </div>

      <div id="technical-labs" className="learn-page__section-heading">
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
