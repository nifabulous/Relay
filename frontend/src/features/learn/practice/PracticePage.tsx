import { useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { loadProgress, recordActivity } from "../../../lib/persistence/storage";
import {
  loadPracticeState,
  savePracticeState,
  recordDrill,
  dueReviews,
  practicedToday,
  displayStreak,
  dayKey,
  type AnswerOutcome,
  type PracticeState,
} from "./practiceStore";
import { selectDailyQuestions, shuffled } from "./selectDaily";
import type { PracticeQuestion } from "./questionBank";
import { StatusChip } from "../../../design-system/StatusChip";
import { track } from "../../../lib/analytics/analytics";
import "../LearnPage.css";
import "../components/LabComponents.css";
import "./PracticePage.css";

type Phase = "intro" | "drilling" | "done";

function StatIcon({ type }: { type: "streak" | "reviews" }) {
  return (
    <span className={`practice-stat__icon practice-stat__icon--${type}`} aria-hidden="true">
      {type === "streak" ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12.4 2.5c.4 3.2-1.8 4.8-3.1 6.5-1.1 1.4-1.5 2.7-.9 4.2.4-1 1.1-1.8 2.2-2.4-.1 2.3 1.2 3.8 3 4.7 1.1-1 1.6-2.2 1.5-3.6 1.6 1.2 2.4 2.8 2.4 4.6 0 3.2-2.5 5.5-5.7 5.5s-5.7-2.3-5.7-5.5c0-3.8 2.8-6.6 6.3-10.1Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 4.5h14v3H5zM5 10.5h14v3H5zM5 16.5h14v3H5z" />
          <path d="M2.5 4.5h1v3h-1zM2.5 10.5h1v3h-1zM2.5 16.5h1v3h-1z" />
        </svg>
      )}
    </span>
  );
}

function TodayProgress({ completed, total }: { completed: number; total: number }) {
  const ratio = total > 0 ? Math.min(completed / total, 1) : 0;
  const circumference = 2 * Math.PI * 19;
  return (
    <span className="practice-stat__progress-ring" aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <circle className="practice-stat__progress-track" cx="24" cy="24" r="19" />
        <circle
          className="practice-stat__progress-value"
          cx="24"
          cy="24"
          r="19"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
    </span>
  );
}

export function PracticePage() {
  const today = useMemo(() => dayKey(new Date()), []);
  const [state, setState] = useState<PracticeState>(() => loadPracticeState());
  const completed = useMemo(() => loadProgress().completedModuleIds, []);

  const questions = useMemo(
    () => selectDailyQuestions(today, completed, dueReviews(loadPracticeState(), today)),
    [today, completed],
  );

  const alreadyDone = practicedToday(state, today);
  // The intro and active drill should report the same persisted, current-day
  // completion record after a reload. History is newest-first, so the first
  // matching entry is the latest round if the learner practices again today.
  const completedToday = Math.min(
    state.history.find((record) => record.day === today)?.total ?? 0,
    questions.length,
  );
  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<AnswerOutcome[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const streak = displayStreak(state, today);
  const reviewCount = dueReviews(state, today).length;

  const currentQuestion: PracticeQuestion | undefined = questions[index];
  // Shuffle the answer positions per question — the authored order otherwise
  // leaks the correct answer's position across repeat drills.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const orderedOptions = useMemo(
    () => (currentQuestion ? shuffled(currentQuestion.options, Math.random) : []),
    [currentQuestion?.id],
  );

  const handleSelect = useCallback((optionId: string) => {
    if (selectedId || !currentQuestion) return; // single attempt
    setSelectedId(optionId);
    const option = currentQuestion.options.find((o) => o.id === optionId);
    track("question_answered", {
      surface: "practice",
      question_id: currentQuestion.id,
      correct: option?.correct ?? false,
      attempt_index: 1,
    });
    setOutcomes((prev) => [
      ...prev,
      { questionId: currentQuestion.id, correct: option?.correct ?? false },
    ]);
  }, [selectedId, currentQuestion]);

  const handleNext = useCallback(() => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setSelectedId(null);
    } else {
      // Drill complete — fold into persistent state.
      const next = recordDrill(loadPracticeState(), today, outcomes);
      savePracticeState(next);
      setState(next);
      const correct = outcomes.filter((o) => o.correct).length;
      track("practice_completed", {
        question_count: outcomes.length,
        correct_count: correct,
      });
      recordActivity({
        type: "tool",
        label: `Daily practice — ${correct}/${outcomes.length} correct`,
        at: Date.now(),
      });
      setPhase("done");
    }
  }, [index, questions.length, outcomes, today]);

  const startDrill = useCallback(() => {
    track("practice_started", { question_count: questions.length });
    setIndex(0);
    setOutcomes([]);
    setSelectedId(null);
    setPhase("drilling");
  }, [questions.length]);

  const correctCount = outcomes.filter((o) => o.correct).length;

  return (
    <div className="learn-page practice-page">
      <nav className="learn-breadcrumb" aria-label="Breadcrumb">
        <Link to="/learn">Learn</Link>
        <span aria-hidden="true">/</span>
        <span>Daily practice</span>
      </nav>

      {phase === "intro" && (
        <div className="practice-intro">
          <h1>Daily practice</h1>
          <p className="measure">
            Five quick questions from material you've already completed — a new
            set every day. Miss a question and it comes back for review until
            you answer it correctly.
          </p>

          <div className="practice-stats" role="group" aria-label="Practice stats">
            <div className="practice-stat">
              <StatIcon type="streak" />
              <span className="practice-stat__value mono">{streak}</span>
              <span className="practice-stat__label">day streak</span>
            </div>
            <div className="practice-stat">
              <StatIcon type="reviews" />
              <span className="practice-stat__value mono">{reviewCount}</span>
              <span className="practice-stat__label">reviews due</span>
            </div>
            <div className="practice-stat practice-stat--progress">
              <TodayProgress completed={completedToday} total={questions.length} />
              <span className="practice-stat__value mono">{completedToday} <small>of {questions.length}</small></span>
              <span className="practice-stat__label">today</span>
            </div>
          </div>

          {alreadyDone && (
            <p className="practice-done-note" role="status">
              You've already practiced today — your streak is safe. Another
              round won't change it, but review questions still count.
            </p>
          )}

          <button type="button" className="relay-btn relay-btn--primary" onClick={startDrill}>
            {alreadyDone ? "Practice again" : "Start today's five"}
          </button>
        </div>
      )}

      {phase === "drilling" && currentQuestion && (
        <div className="practice-drill">
          <header className="practice-drill__header">
            <h1>Daily practice</h1>
            <p>Build speed and accuracy.</p>
          </header>

          <div className="practice-drill__layout">
            <aside className="practice-drill__stats" aria-label="Practice stats">
              <div className="practice-stat">
                <StatIcon type="streak" />
                <span className="practice-stat__value mono">{streak}</span>
                <span className="practice-stat__label">day streak</span>
              </div>
              <div className="practice-stat">
                <StatIcon type="reviews" />
                <span className="practice-stat__value mono">{reviewCount}</span>
                <span className="practice-stat__label">reviews due</span>
              </div>
              <div className="practice-stat practice-stat--progress">
                <TodayProgress completed={outcomes.length} total={questions.length} />
                <span className="practice-stat__value mono">{outcomes.length} <small>of {questions.length}</small></span>
                <span className="practice-stat__label">today</span>
              </div>
            </aside>

            <section className="practice-drill__card" aria-label="Daily practice question">
              <p className="practice-progress mono" aria-live="polite">
                Question {index + 1} of {questions.length}
              </p>

              <fieldset className="lab-multiple-choice practice-question">
                <legend className="lab-multiple-choice__legend">{currentQuestion.question}</legend>
                {orderedOptions.map((opt) => {
                  const isSelected = selectedId === opt.id;
                  const revealCorrect = selectedId !== null && opt.correct;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={[
                        "lab-multiple-choice__option",
                        isSelected && opt.correct && "lab-multiple-choice__option--correct",
                        isSelected && !opt.correct && "lab-multiple-choice__option--wrong",
                        !isSelected && revealCorrect && "lab-multiple-choice__option--correct",
                      ].filter(Boolean).join(" ")}
                      onClick={() => handleSelect(opt.id)}
                      disabled={selectedId !== null}
                      aria-pressed={isSelected}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {selectedId !== null && (() => {
                  const chosen = currentQuestion.options.find((o) => o.id === selectedId);
                  if (!chosen) return null;
                  const correctOption = currentQuestion.options.find((o) => o.correct);
                  return (
                    <div
                      className={`lab-multiple-choice__feedback lab-exercise__feedback--${chosen.correct ? "correct" : "wrong"}`}
                      role={chosen.correct ? "status" : "alert"}
                    >
                      {chosen.correct ? <StatusChip status="passed" /> : <StatusChip status="failed" />}
                      <span>
                        {chosen.explanation}
                        {!chosen.correct && correctOption && (
                          <> The answer: <strong>{correctOption.label}</strong>.</>
                        )}
                      </span>
                    </div>
                  );
                })()}
              </fieldset>
            </section>
          </div>

          <footer className="practice-drill__footer">
            <button type="button" className="practice-drill__end" onClick={() => setPhase("intro")}>
              End session
            </button>
            {selectedId !== null && (
              <button type="button" className="relay-btn relay-btn--primary" onClick={handleNext}>
                {index + 1 < questions.length ? "Next question" : "Finish drill"}
                <span aria-hidden="true" className="practice-drill__next-icon">→</span>
              </button>
            )}
          </footer>
        </div>
      )}

      {phase === "done" && (
        <div className="practice-summary">
          <h1>Drill complete</h1>
          <p className="practice-score mono">{correctCount} / {outcomes.length}</p>
          <p className="measure">
            {correctCount === outcomes.length
              ? "Perfect round. Come back tomorrow to keep the streak alive."
              : "Missed questions return for review in the next few days — repetition is what makes them stick."}
          </p>

          <div className="practice-stats" role="group" aria-label="Practice stats">
            <div className="practice-stat">
              <span className="practice-stat__value mono">{displayStreak(state, today)}</span>
              <span className="practice-stat__label">day streak</span>
            </div>
            <div className="practice-stat">
              <span className="practice-stat__value mono">{state.bestStreak}</span>
              <span className="practice-stat__label">best streak</span>
            </div>
          </div>

          <div className="practice-summary__actions">
            <Link to="/learn" className="relay-btn relay-btn--secondary">Back to Learn</Link>
            <Link to="/" className="relay-btn relay-btn--secondary">Overview</Link>
          </div>
        </div>
      )}
    </div>
  );
}
