import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { selectPrimaryAction } from "./selectPrimaryAction";
import { apiKeys } from "../../api/queryKeys";
import { apiRequest } from "../../api/client";
import { HealthResponseSchema, ProgressResponseSchema } from "../../api/schemas";
import type { HealthResponse, ProgressResponse } from "../../api/schemas";
import { loadProgress } from "../../lib/persistence/storage";
import "./OverviewPage.css";

export function OverviewPage() {
  // Legacy migration runs once at app startup in main.tsx — not in render
  const progress = loadProgress();

  // Health check
  const healthQuery = useQuery({
    queryKey: apiKeys.health,
    queryFn: () => apiRequest<HealthResponse>("/api/health", undefined, HealthResponseSchema),
  });

  // Progress from API
  const progressQuery = useQuery({
    queryKey: apiKeys.progress,
    queryFn: () => apiRequest<ProgressResponse>("/api/progress", undefined, ProgressResponseSchema),
  });

  const isFirstVisit = progress.completedModuleIds.length === 0;
  const curriculumComplete =
    progressQuery.data?.percentage === 100;

  const action = selectPrimaryAction({
    firstVisit: isFirstVisit,
    curriculumComplete,
    nextModuleId: progressQuery.data?.next_recommended ?? undefined,
  });

  return (
    <div className="overview">
      {/* Adaptive primary action — one dominant CTA */}
      <section className="overview__primary">
        <h1 className="overview__heading">Relay</h1>
        <p className="overview__tagline measure">
          Explore the network behind every payment.
        </p>
        <Link to={action.href} className="relay-btn relay-btn--primary overview__cta">
          {action.label}
        </Link>
      </section>

      {/* Current context — progress or health */}
      <section className="overview__context">
        <h2 className="overview__section-title">Your progress</h2>
        {progressQuery.isLoading ? (
          <div className="skeleton skeleton--line" style={{ width: "200px" }} />
        ) : progressQuery.data ? (
          <div className="overview__progress-row">
            <span className="overview__progress-count mono">
              {progressQuery.data.completed_count} / {progressQuery.data.total_count}
            </span>
            <span className="overview__progress-label">modules completed</span>
            <div className="overview__progress-bar">
              <div
                className="overview__progress-fill"
                style={{ width: `${progressQuery.data.percentage}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="overview__muted">Progress unavailable</p>
        )}
      </section>

      {/* Utility row — quick links */}
      <section className="overview__utility">
        <Link to="/explore" className="overview__utility-link">
          <span className="overview__utility-label">Search</span>
          <span className="overview__utility-sub">Find banks, corridors, terms</span>
        </Link>
        <Link to="/explore/banks" className="overview__utility-link">
          <span className="overview__utility-label">Directory</span>
          <span className="overview__utility-sub">Browse all banks</span>
        </Link>
        <Link to="/operate" className="overview__utility-link">
          <span className="overview__utility-label">Track</span>
          <span className="overview__utility-sub">Prepare or track a payment</span>
        </Link>
      </section>

      {/* Recent activity — empty state for first-time users */}
      <section className="overview__activity">
        <h2 className="overview__section-title">Recent activity</h2>
        <p className="overview__muted">
          {isFirstVisit
            ? "No activity yet. Start by exploring how payments move."
            : "Your recent simulations and learning activity will appear here."}
        </p>
      </section>

      {/* System status */}
      {healthQuery.data && (
        <section className="overview__status">
          <p className="overview__status-text">
            <span className="mono">{healthQuery.data.banks}</span> banks ·
            <span className="mono"> {healthQuery.data.corridor_rules}</span> corridors ·
            <span className="mono"> {healthQuery.data.ssi_records}</span> SSI records
          </p>
        </section>
      )}
    </div>
  );
}
