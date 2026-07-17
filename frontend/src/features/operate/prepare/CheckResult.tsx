import { type ReactNode } from "react";
import type { CheckStatus } from "../../../design-system/types";
import { StatusChip } from "../../../design-system/StatusChip";
import "./PreparePaymentPage.css";

interface CheckResultProps {
  title: string;
  status: CheckStatus;
  /** Can this check be retried independently? */
  onRetry?: () => void;
  children?: ReactNode;
}

/**
 * A single check result card in the Prepare Payment workspace.
 * Shows the check name, status chip, details, and optional retry button.
 */
export function CheckResult({ title, status, onRetry, children }: CheckResultProps) {
  return (
    <div className={`check-result check-result--${status}`}>
      <div className="check-result__header">
        <span className="check-result__title">{title}</span>
        <StatusChip status={status} />
      </div>
      {children && <div className="check-result__body">{children}</div>}
      {status === "unavailable" && onRetry && (
        <div className="check-result__retry">
          <button
            type="button"
            className="check-result__retry-btn"
            onClick={onRetry}
          >
            Retry this check
          </button>
        </div>
      )}
    </div>
  );
}
