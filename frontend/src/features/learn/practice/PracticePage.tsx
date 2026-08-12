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
import "../LearnPage.css";
import "../components/LabComponents.css";
import "./PracticePage.css";

type Phase = "intro" | "drilling" | "done";

export function PracticePage() {
  const today = useMemo(() => dayKey(new Date()), []);
  const [state, setState] = useState<PracticeState>(() => loadPracticeState());
  const completed = useMemo(() => loadProgress().completedModuleIds, []);

  const questions = useMemo(
    () => selectDailyQuestions(today, completed, dueReviews(loadPracticeState(), today)),
    [today, completed],
  );

  const alreadyDone = practicedToday(state, today);
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
      recordActivity({
        type: "tool",
        label: `Daily practice — ${correct}/${outcomes.length} correct`,
        at: Date.now(),
      });
      setPhase("done");
    }
  }, [index, questions.length, outcomes, today]);

  const startDrill = useCallback(() => {
    setIndex(0);
    setOutcomes([]);
    setSelectedId(null);
    setPhase("drilling");
  }, []);

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
            Five quick questions from the material you've already completed —
            a different set every day. Miss one and it comes back for review
            until you've beaten it.
          </p>

          <div className="practice-stats" role="group" aria-label="Practice stats">
            <div className="practice-stat">
              <span className="practice-stat__value mono">{streak}</span>
              <span className="practice-stat__label">day streak</span>
            </div>
            <div className="practice-stat">
              <span className="practice-stat__value mono">{state.bestStreak}</span>
              <span className="practice-stat__label">best streak</span>
            </div>
            <div className="practice-stat">
              <span className="practice-stat__value mono">{reviewCount}</span>
              <span className="practice-stat__label">due for review</span>
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

          {selectedId !== null && (
            <button type="button" className="relay-btn relay-btn--primary" onClick={handleNext}>
              {index + 1 < questions.length ? "Next question" : "Finish drill"}
            </button>
          )}
        </div>
      )}

      {phase === "done" && (
        <div className="practice-summary">
          <h1>Drill complete</h1>
          <p className="practice-score mono">{correctCount} / {outcomes.length}</p>
          <p className="measure">
            {correctCount === outcomes.length
              ? "Perfect round. Come back tomorrow to keep the streak alive."
              : "Missed questions will come back for review in the next few days — that's how they stick."}
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
