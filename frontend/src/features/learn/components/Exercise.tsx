import { useState, useRef, useCallback, type ReactNode } from "react";
import type { ExerciseChecker, ExerciseResult } from "../labTypes";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import "./LabComponents.css";

interface ExerciseProps {
  id: string;
  title: string;
  prompt: ReactNode;
  label: string;
  placeholder?: string;
  hint: ReactNode;
  checkAnswer: ExerciseChecker;
  onCorrect?: () => void;
}

type FeedbackState =
  | { status: "idle" }
  | { status: "correct"; message: string }
  | { status: "wrong"; message: string }
  | { status: "error"; message: string };

export function Exercise({
  id,
  title,
  prompt,
  label,
  placeholder,
  hint,
  checkAnswer,
  onCorrect,
}: ExerciseProps) {
  const [value, setValue] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const correctFiredRef = useRef(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setFeedback({ status: "wrong", message: "Please enter an answer." });
      return;
    }

    // Cancel any previous check
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setFeedback({ status: "idle" });

    try {
      const result: ExerciseResult = await checkAnswer(trimmed, controller.signal);
      if (controller.signal.aborted) return;

      if (result.correct) {
        setFeedback({ status: "correct", message: result.feedback });
        if (!correctFiredRef.current) {
          correctFiredRef.current = true;
          onCorrect?.();
        }
      } else {
        setFeedback({ status: "wrong", message: result.feedback });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setFeedback({
        status: "error",
        message: err instanceof Error ? err.message : "We couldn't check your answer. Please try again.",
      });
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [value, checkAnswer, onCorrect]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    // Clear stale feedback on edit
    if (feedback.status !== "idle") {
      setFeedback({ status: "idle" });
      correctFiredRef.current = false;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="lab-exercise" id={id}>
      <div className="lab-exercise__header">
        <span className="lab-exercise__badge">!</span>
        <h3 className="lab-exercise__title">{title}</h3>
      </div>
      <p className="lab-exercise__prompt">{prompt}</p>

      <div className="lab-exercise__input-row">
        <label htmlFor={`${id}-input`} className="lab-exercise__label">{label}</label>
        <input
          id={`${id}-input`}
          type="text"
          className="lab-exercise__input mono"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-invalid={feedback.status === "wrong" || feedback.status === "error"}
          aria-describedby={
            feedback.status !== "idle" ? `${id}-feedback` :
            showHint ? `${id}-hint` : undefined
          }
        />
      </div>

      <div className="lab-exercise__actions">
        <Button variant="primary" onClick={handleSubmit} isLoading={isLoading}>
          {isLoading ? "Checking…" : "Check answer"}
        </Button>
        <button
          type="button"
          className="lab-exercise__hint-toggle"
          onClick={() => setShowHint((s) => !s)}
          aria-expanded={showHint}
          aria-controls={`${id}-hint`}
        >
          {showHint ? "Hide hint" : "Show hint"}
        </button>
      </div>

      {showHint && (
        <p id={`${id}-hint`} className="lab-exercise__hint">
          {hint}
        </p>
      )}

      {feedback.status !== "idle" && (
        <div
          id={`${id}-feedback`}
          className={`lab-exercise__feedback lab-exercise__feedback--${feedback.status}`}
          role={feedback.status === "error" || feedback.status === "wrong" ? "alert" : "status"}
        >
          {feedback.status === "correct" && <StatusChip status="passed" />}
          {feedback.status === "wrong" && <StatusChip status="failed" />}
          {feedback.status === "error" && <StatusChip status="unavailable" />}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
