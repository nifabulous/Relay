import { type ReactNode } from "react";
import { type AsyncStatus, type ApiProblem } from "./types";
import { Button } from "./Button";
import "./AsyncRegion.css";

interface AsyncRegionProps {
  status: AsyncStatus;
  loadingLabel?: string;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  error?: ApiProblem | null;
  onRetry?: () => void;
  partialNote?: string;
  children?: ReactNode;
  className?: string;
}

export function AsyncRegion({
  status,
  loadingLabel = "Loading",
  emptyMessage = "No data to show yet",
  emptyActionLabel,
  onEmptyAction,
  error = null,
  onRetry,
  partialNote,
  children,
  className = "",
}: AsyncRegionProps) {
  if (status === "loading" || status === "idle") {
    return (
      <div
        className={["async-region async-region--loading", className].filter(Boolean).join(" ")}
        role="status"
        aria-busy="true"
        aria-label={loadingLabel}
      >
        <div className="skeleton skeleton--line" style={{ width: "60%" }} />
        <div className="skeleton skeleton--line" style={{ width: "80%" }} />
        <div className="skeleton skeleton--line" style={{ width: "40%" }} />
      </div>
    );
  }

  if (status === "error") {
    const title = error?.title ?? "Something went wrong";
    const detail = error?.detail ?? "This section could not load.";
    return (
      <div
        className={["async-region async-region--error", className].filter(Boolean).join(" ")}
        role="alert"
      >
        <svg className="async-region__error-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className="async-region__error-body">
          <p className="async-region__error-title">{title}</p>
          <p className="async-region__error-detail">{detail}</p>
        </div>
        {error?.retryable !== false && onRetry && (
          <Button variant="secondary" onClick={onRetry}>Retry</Button>
        )}
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className={["async-region async-region--empty", className].filter(Boolean).join(" ")}>
        <p className="async-region__empty-message">{emptyMessage}</p>
        {emptyActionLabel && onEmptyAction && (
          <Button variant="secondary" onClick={onEmptyAction}>{emptyActionLabel}</Button>
        )}
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className={["async-region async-region--unavailable", className].filter(Boolean).join(" ")}>
        <p className="async-region__unavailable-message">
          This data is temporarily unavailable. Try again later.
        </p>
      </div>
    );
  }

  // success or partial — render children
  if (status === "partial") {
    return (
      <div className={className}>
        {children}
        {partialNote && (
          <p className="async-region__partial-note" role="note">{partialNote}</p>
        )}
      </div>
    );
  }

  // success
  return <div className={className}>{children}</div>;
}
