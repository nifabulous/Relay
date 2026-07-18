import { useState, useCallback, type ReactNode } from "react";
import "./LabComponents.css";

export interface MultipleChoiceOption {
  id: string;
  label: string;
  correct: boolean;
  explanation: ReactNode;
}

interface MultipleChoiceProps {
  question: ReactNode;
  options: MultipleChoiceOption[];
  onCorrect?: () => void;
}

type SelectedState = Record<string, "correct" | "wrong" | undefined>;

export function MultipleChoice({ question, options, onCorrect }: MultipleChoiceProps) {
  const [selected, setSelected] = useState<SelectedState>({});
  const [locked, setLocked] = useState(false);
  const [correctFired, setCorrectFired] = useState(false);

  const handleSelect = useCallback((opt: MultipleChoiceOption) => {
    if (locked) return;

    if (opt.correct) {
      setSelected({ [opt.id]: "correct" });
      setLocked(true);
      if (!correctFired) {
        setCorrectFired(true);
        onCorrect?.();
      }
    } else {
      // Show wrong, then allow retry
      setSelected({ [opt.id]: "wrong" });
    }
  }, [locked, correctFired, onCorrect]);

  return (
    <fieldset className="lab-multiple-choice">
      <legend className="lab-multiple-choice__legend">{question}</legend>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={[
            "lab-multiple-choice__option",
            selected[opt.id] === "correct" && "lab-multiple-choice__option--correct",
            selected[opt.id] === "wrong" && "lab-multiple-choice__option--wrong",
          ].filter(Boolean).join(" ")}
          onClick={() => handleSelect(opt)}
          disabled={locked && selected[opt.id] !== "correct"}
          aria-pressed={selected[opt.id] === "correct"}
        >
          {opt.label}
        </button>
      ))}
      {Object.entries(selected).map(([id, state]) => {
        const opt = options.find((o) => o.id === id);
        if (!opt) return null;
        return (
          <div
            key={`feedback-${id}`}
            className={`lab-multiple-choice__feedback lab-exercise__feedback--${state === "correct" ? "correct" : "wrong"}`}
            role={state === "correct" ? "status" : "alert"}
          >
            {opt.explanation}
          </div>
        );
      })}
    </fieldset>
  );
}
