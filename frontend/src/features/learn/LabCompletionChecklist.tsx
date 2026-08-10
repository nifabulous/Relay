import type { LabCheckpointId } from "./labTypes";
import "./LearnPage.css";

interface LabCompletionChecklistProps {
  required: readonly LabCheckpointId[];
  completed: ReadonlySet<LabCheckpointId>;
  isComplete: boolean;
}

const CHECKPOINT_LABELS: Record<string, string> = {
  "validate-original": "Check the valid IBAN",
  "break-checksum": "Change a digit and check the broken IBAN",
  "find-valid-iban": "Choose the valid IBAN",
};

function checkpointLabel(id: LabCheckpointId): string {
  return CHECKPOINT_LABELS[id] ?? id.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Makes the lab's completion contract visible before the learner navigates
 * away. The checklist is driven by the same checkpoint set that determines
 * module completion, so the instructions cannot drift from the actual gate.
 */
export function LabCompletionChecklist({ required, completed, isComplete }: LabCompletionChecklistProps) {
  const completedCount = isComplete
    ? required.length
    : required.filter((id) => completed.has(id)).length;

  return (
    <section
      className={`lab-completion ${isComplete ? "lab-completion--complete" : ""}`.trim()}
      aria-labelledby="lab-completion-title"
      role={isComplete ? "status" : undefined}
    >
      <div className="lab-completion__header">
        <div>
          <p className="lab-completion__eyebrow">Before you move on</p>
          <h2 id="lab-completion-title">Complete this lab</h2>
        </div>
        <strong className="lab-completion__count">{completedCount} of {required.length} complete</strong>
      </div>
      <p className="lab-completion__instruction">
        {isComplete
          ? "All required activities are complete. You can continue to the next module."
          : "Finish each activity below before selecting the next module."}
      </p>
      <ol className="lab-completion__list">
        {required.map((id) => {
          const done = isComplete || completed.has(id);
          return (
            <li key={id} className="lab-completion__item">
              <span
                className="lab-completion__indicator"
                aria-hidden="true"
                data-state={done ? "complete" : "pending"}
              >
                {done ? "✓" : ""}
              </span>
              <span data-state={done ? "complete" : "pending"}>{checkpointLabel(id)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
