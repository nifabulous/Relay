import { Link } from "react-router-dom";
import {
  CURRICULUM,
  formatDuration,
  formatDurationAriaLabel,
  isModuleUnlocked,
  getNextModule,
  getPrerequisiteChain,
} from "./curriculum";
import { loadProgress } from "../../lib/persistence/storage";
import { useState, useCallback } from "react";
import { CASE_CATALOG } from "./cases/caseCatalog";
import { loadCaseSession } from "./cases/caseStore";
import { selectDominantCase } from "./cases/selectDominantCase";
import { loadPracticeState, dueReviews, practicedToday, displayStreak, dayKey, dayScore } from "./practice/practiceStore";
import { LearnCaseLaunchpad, LearnSecondaryCases } from "./LearnCaseLaunchpad";
import { Icon } from "../../design-system/coss/icon";
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
  const secondaryCases = caseEntries.filter((entry) => entry !== dominantCase);
  const nextModuleId = getNextModule(completed)?.id;
  const todayDrill = dayScore(practice, today);

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
        practice={{ doneToday, reviewsDue, streak, todayDrill }}
        showSecondary={false}
      />

      <section id="technical-labs" className="learn-labs" aria-labelledby="technical-labs-title">
        <div className="learn-labs__header">
          <div>
            <h2 id="technical-labs-title">Technical labs</h2>
            <p className="measure">
              Self-paced modules covering identifiers, schemes, messaging, and tracking.
            </p>
          </div>
          <div className="learn-labs__progress" aria-label={`${completed.length} of ${CURRICULUM.length} modules complete`}>
            <span className="mono">{completed.length} / {CURRICULUM.length}</span>
            <span>complete</span>
          </div>
        </div>

        <div className="learn-labs__table">
          {/* Column captions for the visual grid only — each row states its
              own status in text, so this adds nothing for a screen reader. */}
          <div className="learn-labs__table-head" aria-hidden="true">
            <span>Module</span>
            <span>Status</span>
          </div>
          <ol className="learn-curriculum" aria-label="Curriculum modules">
            {CURRICULUM.map((mod, index) => {
              const unlocked = isModuleUnlocked(mod.id, completed);
              const complete = isComplete(mod.id);
              const isNext = mod.id === nextModuleId;
              const status = complete ? "Completed" : isNext ? "Next module" : unlocked ? "Available" : "Locked";
              return (
                <li key={mod.id} className={[
                  "learn-module",
                  !unlocked && "learn-module--locked",
                  complete && "learn-module--complete",
                ].filter(Boolean).join(" ")}>
                  <div className="learn-module__num" aria-hidden="true">{complete ? "✓" : index + 1}</div>
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
                  <div className={`learn-module__status learn-module__status--${status.toLowerCase().replaceAll(" ", "-")}`}>
                    <Icon name={complete ? "checkCircle" : unlocked ? "arrowRight" : "clock"} size={18} />
                    <span>{status}</span>
                  </div>
                  <Icon name="chevronRight" size={18} className="learn-module__arrow" />
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {secondaryCases.length > 0 && <LearnSecondaryCases entries={secondaryCases} />}
    </div>
  );
}

function getModuleTitle(id: string): string {
  return CURRICULUM.find((m) => m.id === id)?.title ?? id;
}
