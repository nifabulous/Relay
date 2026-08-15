import { useParams, Link } from "react-router-dom";
import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { CURRICULUM, formatDuration, formatDurationAriaLabel, getModuleById, isModuleUnlocked } from "./curriculum";
import { getLabDefinition } from "./labRegistry";
import { useLabCompletion } from "./useLabCompletion";
import { LabCompletionChecklist } from "./LabCompletionChecklist";
import { loadProgress, saveProgress, recordActivity } from "../../lib/persistence/storage";
import { StatusChip } from "../../design-system/StatusChip";
import { track } from "../../lib/analytics/analytics";
import { TutorLauncher } from "../tutor/TutorLauncher";
import { buildLessonContext } from "../tutor/tutorContext";
import { withLearnerSummary } from "../tutor/tutorLearnerContext";
import { loadPracticeState } from "./practice/practiceStore";
import "./LearnPage.css";

export function LearnModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const [completed, setCompleted] = useState<string[]>(() => loadProgress().completedModuleIds);
  const reportedCompletedIdsRef = useRef(new Set(completed));
  const lastViewedModuleIdRef = useRef<string | undefined>(undefined);

  const mod = moduleId ? getModuleById(moduleId) : undefined;

  useEffect(() => {
    if (!mod) {
      lastViewedModuleIdRef.current = undefined;
      return;
    }
    if (lastViewedModuleIdRef.current === mod.id) return;
    lastViewedModuleIdRef.current = mod.id;
    track("module_viewed", { module_id: mod.id });
    // A locked module (visited by URL before its prerequisites) is not
    // "started": the learner is blocked from the content, so gating here
    // keeps module_started out of the completion-rate denominator.
    if (isModuleUnlocked(mod.id, completed) && !completed.includes(mod.id)) {
      track("module_started", { module_id: mod.id });
    }
  }, [mod?.id, completed]);

  useEffect(() => {
    for (const id of completed) {
      if (reportedCompletedIdsRef.current.has(id)) continue;
      reportedCompletedIdsRef.current.add(id);
      // Guard the same boundary the other events enforce: only authored
      // curriculum ids reach telemetry. `completed` is a raw localStorage
      // array, so a tampered or legacy entry must not flow into the payload.
      if (!getModuleById(id)) continue;
      track("module_completed", { module_id: id });
    }
  }, [completed]);

  const completeModule = useCallback((id: string) => {
    setCompleted((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveProgress({ schemaVersion: 1, completedModuleIds: next });
      const title = getModuleById(id)?.title ?? id;
      recordActivity({ type: "module", label: title, at: Date.now() });
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
          <span
            className="learn-module-header__duration"
            aria-label={formatDurationAriaLabel(mod.duration)}
          >
            {formatDuration(mod.duration)}
          </span>
          {isComplete && <StatusChip status="passed" />}
        </div>
        <p className="measure">{mod.subtitle}</p>
        {/* Module identity only — never the lesson's rendered content. The
            backend has its own card for this module, so passing the ID reaches
            better grounding than any amount of scraped text would. */}
        {/* Learner-aware: the tutor is told how many modules are done, which
            are worth revisiting, and which comes next — all computed here, all
            at module granularity. Never a question ID, a score, or a date. */}
        <TutorLauncher
          context={withLearnerSummary(
            buildLessonContext({
              moduleId: mod.id,
              moduleTitle: mod.title,
              topic: mod.category,
            }),
            {
              completedModuleIds: loadProgress().completedModuleIds,
              practice: loadPracticeState(),
              currentModuleId: mod.id,
            },
          )}
          label="Ask the tutor about this module"
        />
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
            key={mod.id}
            moduleId={mod.id}
            isComplete={isComplete}
            requiredCheckpoints={definition.requiredCheckpoints}
            component={definition.component}
            onComplete={() => completeModule(mod.id)}
            onCheckpointReached={(checkpointId) => {
              track("checkpoint_reached", {
                module_id: mod.id,
                checkpoint_id: checkpointId,
              });
            }}
          />
        </Suspense>
      ) : (
        <div className="learn-content__body">
          <p className="measure">Interactive content for this module is coming soon. Check back later.</p>
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
          isComplete ? (
            <Link to={nextModule.href} className="relay-btn relay-btn--secondary learn-nav__next">
              {nextModule.title} →
            </Link>
          ) : (
            <span
              className="relay-btn relay-btn--secondary learn-nav__next learn-nav__next--disabled"
              aria-disabled="true"
              aria-label={`${nextModule.title}. Complete this lab to unlock.`}
              title="Complete this lab to unlock"
            >
              {nextModule.title} → · Complete this lab to unlock
            </span>
          )
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
  onCheckpointReached,
}: {
  moduleId: string;
  isComplete: boolean;
  requiredCheckpoints: readonly string[];
  component: React.ComponentType<{ moduleId: string; isComplete: boolean; onCheckpoint: (id: string) => void }>;
  onComplete: () => void;
  onCheckpointReached: (id: string) => void;
}) {
  const { completed, markCheckpoint } = useLabCompletion(
    requiredCheckpoints,
    onComplete,
    onCheckpointReached,
  );

  return (
    <>
      <LabCompletionChecklist
        required={requiredCheckpoints}
        completed={completed}
        isComplete={isComplete}
      />
      <LabComponent moduleId={moduleId} isComplete={isComplete} onCheckpoint={markCheckpoint} />
    </>
  );
}
