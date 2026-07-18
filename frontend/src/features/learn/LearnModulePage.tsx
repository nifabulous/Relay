import { useParams, Link } from "react-router-dom";
import { useState, useCallback, Suspense } from "react";
import { getModuleById, isModuleUnlocked, CURRICULUM } from "./curriculum";
import { getLabDefinition } from "./labRegistry";
import { useLabCompletion } from "./useLabCompletion";
import { loadProgress, saveProgress } from "../../lib/persistence/storage";
import { StatusChip } from "../../design-system/StatusChip";
import "./LearnPage.css";

export function LearnModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const [completed, setCompleted] = useState<string[]>(() => loadProgress().completedModuleIds);

  const mod = moduleId ? getModuleById(moduleId) : undefined;

  const completeModule = useCallback((id: string) => {
    setCompleted((prev) => {
      if (prev.includes(id)) return prev; // Idempotent
      const next = [...prev, id];
      saveProgress({ schemaVersion: 1, completedModuleIds: next });
      return next;
    });
  }, []);

  if (!mod) {
    return (
      <div className="learn-page">
        <h1>Module not found</h1>
        <Link to="/learn" className="relay-btn relay-btn--secondary">Back to curriculum</Link>
      </div>
    );
  }

  const unlocked = isModuleUnlocked(mod.id, completed);
  const isComplete = completed.includes(mod.id);
  const moduleIndex = CURRICULUM.findIndex((m) => m.id === mod.id);
  const prevModule = moduleIndex > 0 ? CURRICULUM[moduleIndex - 1] : null;
  const nextModule = moduleIndex < CURRICULUM.length - 1 ? CURRICULUM[moduleIndex + 1] : null;

  if (!unlocked) {
    return (
      <div className="learn-page">
        <div className="learn-locked">
          <h1>Locked: {mod.title}</h1>
          <p>Complete the prerequisite modules first.</p>
          <Link to="/learn" className="relay-btn relay-btn--secondary">Back to curriculum</Link>
        </div>
      </div>
    );
  }

  // Resolve the lab content from the registry
  const definition = getLabDefinition(mod.id);

  return (
    <div className="learn-page">
      <nav className="learn-breadcrumb" aria-label="Breadcrumb">
        <Link to="/learn">Learn</Link>
        <span aria-hidden="true">/</span>
        <span>{mod.title}</span>
      </nav>

      <div className="learn-module-header">
        <div className="learn-module-header__title-row">
          <h1>{mod.title}</h1>
          {isComplete && <StatusChip status="passed" />}
        </div>
        <p className="measure">{mod.subtitle}</p>
        <div className="learn-module-header__meta">
          <span>{mod.duration} minutes</span>
        </div>
      </div>

      <div className="learn-content">
        <h2>What you'll learn</h2>
        <ul className="learn-outcomes">
          {mod.outcomes.map((outcome, i) => (
            <li key={i}>{outcome}</li>
          ))}
        </ul>
      </div>

      {/* Lab content from registry (lazy-loaded) */}
      {definition ? (
        <Suspense fallback={<div className="skeleton skeleton--line" style={{ width: "60%", height: "100px" }} />}>
          <LabContentRenderer
            moduleId={mod.id}
            isComplete={isComplete}
            requiredCheckpoints={definition.requiredCheckpoints}
            component={definition.component}
            onComplete={() => completeModule(mod.id)}
          />
        </Suspense>
      ) : (
        <div className="learn-content__body">
          <p className="measure">Interactive content for this module is coming soon.</p>
        </div>
      )}

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
          <Link to="/learn" className="relay-btn relay-btn--primary learn-nav__next">
            Back to curriculum →
          </Link>
        )}
      </nav>
    </div>
  );
}

/**
 * Wrapper that connects the lab completion hook to the lab content component.
 */
function LabContentRenderer({
  moduleId,
  isComplete,
  requiredCheckpoints,
  component: LabComponent,
  onComplete,
}: {
  moduleId: string;
  isComplete: boolean;
  requiredCheckpoints: readonly string[];
  component: React.ComponentType<{ moduleId: string; isComplete: boolean; onCheckpoint: (id: string) => void }>;
  onComplete: () => void;
}) {
  const { markCheckpoint } = useLabCompletion(requiredCheckpoints, onComplete);

  return <LabComponent moduleId={moduleId} isComplete={isComplete} onCheckpoint={markCheckpoint} />;
}
