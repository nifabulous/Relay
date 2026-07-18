import { useParams, Link } from "react-router-dom";
import { useState, useCallback } from "react";
import { getModuleById, isModuleUnlocked, CURRICULUM } from "./curriculum";
import { loadProgress, saveProgress } from "../../lib/persistence/storage";
import "./LearnPage.css";

export function LearnModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const [completed, setCompleted] = useState<string[]>(() => loadProgress().completedModuleIds);

  const mod = moduleId ? getModuleById(moduleId) : undefined;

  if (!mod) {
    return (
      <div className="learn-page">
        <h1>Module not found</h1>
        <Link to="/app/learn" className="relay-btn relay-btn--secondary">Back to curriculum</Link>
      </div>
    );
  }

  const unlocked = isModuleUnlocked(mod.id, completed);
  const isComplete = completed.includes(mod.id);
  const moduleIndex = CURRICULUM.findIndex((m) => m.id === mod.id);
  const prevModule = moduleIndex > 0 ? CURRICULUM[moduleIndex - 1] : null;
  const nextModule = moduleIndex < CURRICULUM.length - 1 ? CURRICULUM[moduleIndex + 1] : null;

  const toggleComplete = useCallback(() => {
    const next = isComplete
      ? completed.filter((c) => c !== mod.id)
      : [...completed, mod.id];
    setCompleted(next);
    saveProgress({ schemaVersion: 1, completedModuleIds: next });
  }, [completed, isComplete, mod.id]);

  if (!unlocked) {
    return (
      <div className="learn-page">
        <div className="learn-locked">
          <h1>Locked: {mod.title}</h1>
          <p>Complete the prerequisite modules first.</p>
          <Link to="/app/learn" className="relay-btn relay-btn--secondary">Back to curriculum</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="learn-page">
      <nav className="learn-breadcrumb" aria-label="Breadcrumb">
        <Link to="/app/learn">Learn</Link>
        <span aria-hidden="true">/</span>
        <span>{mod.title}</span>
      </nav>

      <div className="learn-module-header">
        <h1>{mod.title}</h1>
        <p className="measure">{mod.subtitle}</p>
        <div className="learn-module-header__meta">
          <span>{mod.duration} minutes</span>
          <button
            type="button"
            className="learn-module__toggle"
            onClick={toggleComplete}
            aria-pressed={isComplete}
          >
            {isComplete ? "✓ Completed" : "Mark as complete"}
          </button>
        </div>
      </div>

      <div className="learn-content">
        <h2>What you'll learn</h2>
        <ul className="learn-outcomes">
          {mod.outcomes.map((outcome, i) => (
            <li key={i}>{outcome}</li>
          ))}
        </ul>

        <div className="learn-content__body">
          <h2>Concept</h2>
          <p className="measure">
            This module covers the fundamentals of {mod.title.toLowerCase()}. The interactive
            exercises and tools in the Explore and Operate workspaces complement this material.
          </p>

          {mod.category === "core" && (
            <div className="learn-content__callout">
              <p>
                <strong>Try it:</strong> After reading, use the{" "}
                <Link to="/app/operate/prepare">Prepare Payment</Link> tool to see these concepts
                in action, or explore the{" "}
                <Link to="/app/explore/glossary">glossary</Link> for related terms.
              </p>
            </div>
          )}

          {mod.id === "capstone" && (
            <div className="learn-content__callout">
              <p>
                <strong>Capstone exercise:</strong> Prepare a simulated payment using all the
                skills you've learned. Go to{" "}
                <Link to="/app/operate/prepare">Prepare Payment</Link> and complete a full
                check run.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Prior / Next navigation */}
      <nav className="learn-nav" aria-label="Module navigation">
        {prevModule ? (
          <Link to={prevModule.href} className="relay-btn relay-btn--secondary learn-nav__prev">
            ← {prevModule.title}
          </Link>
        ) : <span />}
        {nextModule ? (
          <Link to={nextModule.href} className="relay-btn relay-btn--secondary learn-nav__next">
            {nextModule.title} →
          </Link>
        ) : (
          <Link to="/app/learn" className="relay-btn relay-btn--primary learn-nav__next">
            Back to curriculum →
          </Link>
        )}
      </nav>
    </div>
  );
}
