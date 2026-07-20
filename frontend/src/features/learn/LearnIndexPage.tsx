import { Link } from "react-router-dom";
import { CURRICULUM, isModuleUnlocked, getPrerequisiteChain } from "./curriculum";
import { loadProgress } from "../../lib/persistence/storage";
import { useState, useCallback } from "react";
import { CaseEntry } from "./cases/CaseEntry";
import { supplierCase } from "./cases/caseCatalog";
import { loadCaseSession } from "./cases/caseStore";
import "./LearnPage.css";

export function LearnIndexPage() {
  const [completed] = useState<string[]>(() => loadProgress().completedModuleIds);
  // Load the case session once on mount. LearnIndexPage is the single source
  // of truth for the case entry's visible state; CaseEntry itself is pure
  // presentation. We read here (not inside CaseEntry) so CaseEntry stays
  // trivially testable with injected props.
  const [caseSession] = useState(() => loadCaseSession(supplierCase.id));

  const isComplete = useCallback((id: string) => completed.includes(id), [completed]);

  return (
    <div className="learn-page">
      <div className="learn-page__header">
        <h1>Learn</h1>
        <p className="measure">Guided modules covering the full cross-border payment lifecycle.</p>
      </div>

      {/* Case-first entry: the dominant action sits ABOVE the legacy
          curriculum so a learner's eye lands on the supplier case first.
          The curriculum list below is unchanged. */}
      <CaseEntry caseDef={supplierCase} session={caseSession} />

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
                  <span className="learn-module__duration">{mod.duration} min</span>
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
