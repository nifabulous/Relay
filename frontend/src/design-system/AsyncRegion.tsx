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
  emptyMessage = "No data available",
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
    const detail = error?.detail ?? "An unexpected error occurred.";
    return (
      <div
        className={["async-region async-region--error", className].filter(Boolean).join(" ")}
        role="alert"
      >
        <div className="async-region__error-icon" aria-hidden="true">⚠</div>
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
          This data is temporarily unavailable.
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
