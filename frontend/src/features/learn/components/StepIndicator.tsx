export interface StepInfo {
  id: string;
  label: string;
}

interface StepIndicatorProps {
  steps: StepInfo[];
  currentStep: number;
  completedSteps: ReadonlySet<number>;
}

export function StepIndicator({ steps, currentStep, completedSteps }: StepIndicatorProps) {
  return (
    <ol className="lab-step-indicator" aria-label="Progress steps">
      {steps.map((step, i) => {
        const isCurrent = i === currentStep;
        const isComplete = completedSteps.has(i);
        return (
          <li
            key={step.id}
            className={[
              "lab-step-indicator__step",
              isCurrent && "lab-step-indicator__step--current",
              isComplete && "lab-step-indicator__step--complete",
            ].filter(Boolean).join(" ")}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className="lab-step-indicator__num">
              {isComplete ? "✓" : i + 1}
            </span>
            <span>{step.label}</span>
            {i < steps.length - 1 && <span className="lab-step-indicator__arrow" aria-hidden="true">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
