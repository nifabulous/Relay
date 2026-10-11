export type RouteStopRole = "origin" | "correspondent" | "beneficiary" | "stopped";

export type RouteStopStatus = "passed" | "needs_attention" | "failed" | "unavailable" | "not_checked";

export interface RouteStop {
  role: RouteStopRole;
  name: string;
  detail?: string;
  status: RouteStopStatus;
}

export const STATUS_LABEL: Record<RouteStopStatus, string> = {
  passed: "passed",
  needs_attention: "needs attention",
  failed: "failed",
  unavailable: "unavailable",
  not_checked: "not checked",
};

export const ROLE_LABEL: Record<RouteStopRole, string> = {
  origin: "Sender",
  correspondent: "Correspondent",
  beneficiary: "Beneficiary",
  stopped: "Stopped at",
};
