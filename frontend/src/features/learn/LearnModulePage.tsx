import { useParams, Link } from "react-router-dom";
import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { CURRICULUM, formatDuration, formatDurationAriaLabel, getModuleById, isModuleUnlocked } from "./curriculum";
import { getLabDefinition } from "./labRegistry";
import { useLabCompletion } from "./useLabCompletion";
import { LabCompletionChecklist } from "./LabCompletionChecklist";
import { loadProgress, saveProgress, recordActivity } from "../../lib/persistence/storage";
import { StatusChip } from "../../design-system/StatusChip";
import { track } from "../../lib/analytics/analytics";
import { buildLessonContext } from "../tutor/tutorContext";
import { withLearnerSummary } from "../tutor/tutorLearnerContext";
import { usePublishTutorContext } from "../tutor/tutorSurfaceStore";
import { loadPracticeState } from "./practice/practiceStore";
import "./LearnPage.css";

export function LearnModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const [completed, setCompleted] = useState<string[]>(() => loadProgress().completedModuleIds);
  const reportedCompletedIdsRef = useRef(new Set(completed));
  const lastViewedModuleIdRef = useRef<string | undefined>(undefined);

  const mod = moduleId ? getModuleById(moduleId) : undefined;
  // Resolve this before any early return so page-level checkpoint state and
  // header values always have a safe definition to work from.
  const definition = mod ? getLabDefinition(mod.id) : undefined;
  const requiredCheckpoints = definition?.requiredCheckpoints ?? [];

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

  /*
   * Tell the floating tutor launcher what this page is.
   *
   * Called here, above every early return, because it is a hook — a locked or
   * unknown module returns early below, and a conditional hook call is a React
   * error rather than a subtle bug. An absent module publishes the global
   * surface, which is the correct thing for a "module not found" page anyway.
   *
   * Learner-aware: how many modules are done, which are worth revisiting, and
   * which comes next. All at module granularity — never a question ID, a
   * score, or a date.
   */
  usePublishTutorContext(
    mod
      ? withLearnerSummary(
          buildLessonContext({
            moduleId: mod.id,
            moduleTitle: mod.title,
            topic: mod.category,
          }),
          {
            completedModuleIds: completed,
            practice: loadPracticeState(),
            currentModuleId: mod.id,
          },
        )
      : { surface: "global" },
  );

  const completeModule = useCallback((id: string) => {
    // Persist before the visible checklist flips to complete. A full page
    // navigation immediately after that UI transition must not be able to race
    // an effect that owns this write.
    setCompleted((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      return next;
    });
    const current = loadProgress().completedModuleIds;
    if (!current.includes(id)) {
      const next = [...current, id];
      saveProgress({ schemaVersion: 1, completedModuleIds: next });
      const title = getModuleById(id)?.title ?? id;
      recordActivity({ type: "module", label: title, at: Date.now() });
    }
  }, []);

  const onCheckpointReached = useCallback((checkpointId: string) => {
    if (!mod) return;
    track("checkpoint_reached", {
      module_id: mod.id,
      checkpoint_id: checkpointId,
    });
  }, [mod?.id]);

  const { completed: completedCheckpoints, markCheckpoint } = useLabCompletion(
    requiredCheckpoints,
    () => {
      if (mod) completeModule(mod.id);
    },
    onCheckpointReached,
    mod?.id,
  );

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
  const completionPercent = isComplete
    ? 100
    : requiredCheckpoints.length > 0
      ? Math.round((completedCheckpoints.size / requiredCheckpoints.length) * 100)
      : 0;
  const currentLessonIndex = Math.min(
    completedCheckpoints.size,
    Math.max(mod.outcomes.length - 1, 0),
  );
  const lessonItems = mod.outcomes.map((outcome, index) => {
    const state = isComplete
      ? "complete"
      : requiredCheckpoints.length === 0
        ? index === 0 ? "current" : "upcoming"
        : index < currentLessonIndex
          ? "complete"
          : index === currentLessonIndex
            ? "current"
            : "upcoming";
    return { outcome, index, state } as const;
  });

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

  return (
    <div className="learn-page">
      <nav className="learn-breadcrumb" aria-label="Breadcrumb">
        <Link to="/learn">Learn</Link>
        <span aria-hidden="true">/</span>
        <span>{mod.title}</span>
      </nav>

      <div className="learn-module-header">
        <span className="learn-module-header__badge">MODULE {moduleIndex + 1}</span>
        <div className="learn-module-header__title-row">
          <h1>{mod.title}</h1>
          {isComplete && <StatusChip status="passed" />}
        </div>
        <p className="measure">{mod.subtitle}</p>
        <div className="learn-module-header__progress">
          <div
            className="learn-module-header__progress-track"
            role="progressbar"
            aria-label="Module completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completionPercent}
          >
            <span
              className="learn-module-header__progress-fill"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
          <span className="learn-module-header__progress-label">
            {completionPercent}% complete
          </span>
        </div>
        <div className="learn-module-header__meta">
          <span
            className="learn-module-header__duration"
            aria-label={formatDurationAriaLabel(mod.duration)}
          >
            {formatDuration(mod.duration)}
          </span>
        </div>
        {/* Module identity only — never the lesson's rendered content. The
            backend has its own card for this module, so passing the ID reaches
            better grounding than any amount of scraped text would. */}
      </div>

      <div className="learn-module-layout">
        <aside className="learn-lesson-outline" aria-labelledby="lesson-outline-title">
          <h2 id="lesson-outline-title">Lesson outline</h2>
          <ol className="learn-lesson-outline__list" aria-label="Lesson outline">
            {lessonItems.map(({ outcome, index, state }) => (
              <li
                key={index}
                className={`learn-lesson-outline__item learn-lesson-outline__item--${state}`}
                data-state={state}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="learn-lesson-outline__indicator" aria-hidden="true">
                  {state === "complete" ? "✓" : index + 1}
                </span>
                <span className="learn-lesson-outline__copy">
                  <span className="learn-lesson-outline__eyebrow">Lesson {index + 1}</span>
                  <span className="learn-lesson-outline__title">{outcome}</span>
                  <span className="learn-lesson-outline__state">{
                    state === "complete" ? "Completed" : state === "current" ? "Current" : "Upcoming"
                  }</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>

        <section className="learn-module-content-card" aria-labelledby="module-content-title">
          <div className="learn-module-content-card__body">
            <h2 id="module-content-title">What you'll learn</h2>
            <ul className="learn-outcomes">
              {mod.outcomes.map((outcome, i) => (
                <li key={i}>{outcome}</li>
              ))}
            </ul>

            {/* Lab content from registry (lazy-loaded) */}
            {definition ? (
              <Suspense fallback={<div className="skeleton skeleton--line" style={{ width: "60%", height: "100px" }} />}>
                <LabContentRenderer
                  key={mod.id}
                  moduleId={mod.id}
                  isComplete={isComplete}
                  requiredCheckpoints={definition.requiredCheckpoints}
                  completed={completedCheckpoints}
                  markCheckpoint={markCheckpoint}
                  component={definition.component}
                />
              </Suspense>
            ) : (
              <div className="learn-content__body">
                <p className="measure">Interactive content for this module is coming soon. Check back later.</p>
              </div>
            )}
          </div>
          <footer className="learn-module-content-card__footer">
            <span className="learn-module-content-card__duration" aria-label={formatDurationAriaLabel(mod.duration)}>
              <svg className="learn-module-content-card__duration-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
              {formatDuration(mod.duration)} read
            </span>
          </footer>
        </section>
      </div>

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
  completed,
  markCheckpoint,
  component: LabComponent,
}: {
  moduleId: string;
  isComplete: boolean;
  requiredCheckpoints: readonly string[];
  completed: ReadonlySet<string>;
  markCheckpoint: (id: string) => void;
  component: React.ComponentType<{ moduleId: string; isComplete: boolean; onCheckpoint: (id: string) => void }>;
}) {
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
