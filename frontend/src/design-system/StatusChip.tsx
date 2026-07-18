import { type ReactNode } from "react";
import { type CheckStatus } from "./types";
import "./StatusChip.css";

interface StatusChipProps {
  status: CheckStatus;
  className?: string;
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}

const statusMeta: Record<CheckStatus, { label: string; icon: ReactNode; className: string }> = {
  passed: { label: "Passed", icon: <CheckIcon />, className: "status-chip--success" },
  needs_attention: { label: "Needs attention", icon: <WarningIcon />, className: "status-chip--warning" },
  failed: { label: "Failed", icon: <CrossIcon />, className: "status-chip--danger" },
  unavailable: { label: "Unavailable", icon: <DashIcon />, className: "status-chip--muted" },
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
