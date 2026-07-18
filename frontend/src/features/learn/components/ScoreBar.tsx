import "./LabComponents.css";

interface ScoreBarProps {
  score: number;
  label?: string;
}

export function ScoreBar({ score, label = "Match score" }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(1, score));
  const pct = Math.round(clamped * 100);
  const tone = clamped >= 0.9 ? "var(--color-success)" : clamped >= 0.7 ? "var(--color-warning)" : "var(--color-danger)";

  return (
    <div className="lab-score-bar">
      <span className="lab-score-bar__label">{label}</span>
      <div className="lab-score-bar__track">
        <div
          className="lab-score-bar__fill"
          style={{ width: `${pct}%`, background: tone, minWidth: pct > 0 ? "2rem" : 0 }}
        >
          {pct > 15 && `${pct}%`}
        </div>
      </div>
      <meter
        min={0}
        max={1}
        value={clamped}
        low={0.7}
        high={0.9}
        optimum={1}
        aria-label={label}
        style={{ display: "none" }}
      />
    </div>
  );
}
