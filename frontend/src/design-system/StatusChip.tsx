import { type CheckStatus } from "./types";
import "./StatusChip.css";

interface StatusChipProps {
  status: CheckStatus;
  className?: string;
}

const statusMeta: Record<CheckStatus, { label: string; icon: string; className: string }> = {
  passed: { label: "Passed", icon: "✓", className: "status-chip--success" },
  needs_attention: { label: "Needs attention", icon: "!", className: "status-chip--warning" },
  failed: { label: "Failed", icon: "✕", className: "status-chip--danger" },
  unavailable: { label: "Unavailable", icon: "–", className: "status-chip--muted" },
};

export function StatusChip({ status, className = "" }: StatusChipProps) {
  const meta = statusMeta[status];
  return (
    <span
      className={["status-chip", meta.className, className].filter(Boolean).join(" ")}
      aria-label={meta.label}
    >
      <span className="status-chip__icon" aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}
