import { type ReactNode } from "react";
import { type StatusChipStatus } from "./types";
import "./StatusChip.css";

interface StatusChipProps {
  status: StatusChipStatus;
  className?: string;
}

// ─── Icons ──────────────────────────────────────────────────────────────────
// Every status carries a distinct glyph so meaning is never carried by colour
// alone. Stroke-based so they inherit the chip's text colour.

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

// Question mark for "possible" — a recommendation that could work but is not
// yet fully reasoned. Rendered as a bold "?" via SVG path so it scales with the
// chip's icon disc.
function QuestionIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// Double-check for "defensible" — a solid recommendation, just not the best
// fit. Distinct from the single check of CheckStatus.passed / SourceStatus.
// verified so a learner can tell "good" from "fully right".
function DoubleCheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12l4 4 8-10" />
      <path d="M10 16l1 1 9-11" />
    </svg>
  );
}

// Star for "preferred" — the best-fit rail under the disclosed priorities.
// Reserved for the highest grade so it reads as the standout choice.
function StarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M12 2l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.6l-5.9 3.1 1.13-6.57L2.45 9.94l6.6-.96z" />
    </svg>
  );
}

// Clock for "under review" — the source claim is being refreshed. Signals a
// time-bound review status, distinct from the static warning triangle.
function ClockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

// ─── Exhaustive status map ──────────────────────────────────────────────────
// `Record<StatusChipStatus, ...>` is the load-bearing exhaustiveness guard:
// if a status is added to the union without a map entry, TypeScript fails to
// compile. Each entry pairs a human label, a distinct icon, and a modifier
// class. Modifier classes map onto the existing success/warning/danger/muted
// + action palettes in StatusChip.css.

const statusMeta: Record<StatusChipStatus, { label: string; icon: ReactNode; className: string }> = {
  // ── CheckStatus (unchanged for existing callers) ──
  passed: { label: "Passed", icon: <CheckIcon />, className: "status-chip--success" },
  needs_attention: { label: "Needs attention", icon: <WarningIcon />, className: "status-chip--warning" },
  failed: { label: "Failed", icon: <CrossIcon />, className: "status-chip--danger" },
  unavailable: { label: "Unavailable", icon: <DashIcon />, className: "status-chip--muted" },

  // ── DecisionQuality ──
  invalid: { label: "Invalid", icon: <CrossIcon />, className: "status-chip--danger" },
  possible: { label: "Possible", icon: <QuestionIcon />, className: "status-chip--warning" },
  defensible: { label: "Defensible", icon: <DoubleCheckIcon />, className: "status-chip--success" },
  preferred: { label: "Preferred", icon: <StarIcon />, className: "status-chip--action" },

  // ── SourceStatus ──
  verified: { label: "Verified", icon: <CheckIcon />, className: "status-chip--success" },
  under_review: { label: "Under review", icon: <ClockIcon />, className: "status-chip--warning" },
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
