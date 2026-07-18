import { Link } from "react-router-dom";
import { CURRICULUM, isModuleUnlocked, getPrerequisiteChain } from "./curriculum";
import { loadProgress, saveProgress } from "../../lib/persistence/storage";
import { useState, useCallback } from "react";
import "./LearnPage.css";

export function LearnIndexPage() {
  const [completed, setCompleted] = useState<string[]>(() => loadProgress().completedModuleIds);

  const isComplete = useCallback((id: string) => completed.includes(id), [completed]);

  function toggleComplete(id: string) {
    const next = isComplete(id)
      ? completed.filter((c) => c !== id)
      : [...completed, id];
    setCompleted(next);
    saveProgress({ schemaVersion: 1, completedModuleIds: next });
  }

  return (
    <div className="learn-page">
      <div className="learn-page__header">
        <h1>Learn</h1>
        <p className="measure">Guided modules covering the full cross-border payment lifecycle.</p>
      </div>

      <div className="learn-page__progress">
        <span className="mono">{completed.length} / {CURRICULUM.length}</span>
        <span>modules completed</span>
        <div className="learn-page__progress-bar">
          <div className="learn-page__progress-fill"
            style={{ width: `${(completed.length / CURRICULUM.length) * 100}%` }} />
        </div>
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
                {unlocked && (
                  <button
                    type="button"
                    className="learn-module__toggle"
                    onClick={() => toggleComplete(mod.id)}
                    aria-pressed={complete}
                  >
                    {complete ? "Mark as incomplete" : "Mark as complete"}
                  </button>
                )}
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
