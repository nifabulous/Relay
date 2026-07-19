import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { selectPrimaryAction } from "./selectPrimaryAction";
import { apiKeys } from "../../api/queryKeys";
import { apiRequest } from "../../api/client";
import { HealthResponseSchema, ProgressResponseSchema } from "../../api/schemas";
import type { HealthResponse, ProgressResponse } from "../../api/schemas";
import { loadProgress, loadActivity } from "../../lib/persistence/storage";
import { computeProgress } from "../learn/curriculum";
import { toBackendModuleId } from "./badgeIds";
import { relativeTime } from "./relativeTime";
import "./OverviewPage.css";

export function OverviewPage() {
  const progress = loadProgress();
  const stats = computeProgress(progress.completedModuleIds);
  const completedParam = progress.completedModuleIds.map(toBackendModuleId).join(",");
  const activity = loadActivity().entries;
  const now = Date.now();

  const healthQuery = useQuery({
    queryKey: apiKeys.health,
    queryFn: () => apiRequest<HealthResponse>("/api/health", undefined, HealthResponseSchema),
  });

  // Badges only — count/%/next come from local stats
  const badgesQuery = useQuery({
    queryKey: [...apiKeys.progress, completedParam],
    queryFn: () =>
      apiRequest<ProgressResponse>(
        `/api/progress?completed=${encodeURIComponent(completedParam)}`,
        undefined,
        ProgressResponseSchema,
      ),
  });

  const isFirstVisit = progress.completedModuleIds.length === 0;
  const curriculumComplete = stats.percentage === 100;

  const action = selectPrimaryAction({
    firstVisit: isFirstVisit,
    curriculumComplete,
    nextModuleId: stats.nextModuleId ?? undefined,
  });

  return (
    <div className="overview">
      <section className="overview__primary">
        <h1 className="overview__heading">Relay</h1>
        <p className="overview__tagline measure">
          Explore the network behind every payment.
        </p>
        <Link to={action.href} className="relay-btn relay-btn--primary overview__cta">
          {action.label}
        </Link>
      </section>

      <section className="overview__context">
        <h2 className="overview__section-title">Your progress</h2>
        <div className="overview__progress-row">
          <span className="overview__progress-count mono">
            {stats.completedCount} / {stats.totalCount}
          </span>
          <span className="overview__progress-label">modules completed</span>
          <div className="overview__progress-bar">
            <div className="overview__progress-fill" style={{ width: `${stats.percentage}%` }} />
          </div>
        </div>
        {badgesQuery.data && badgesQuery.data.earned_badges.length > 0 && (
          <div className="overview__badges">
            {badgesQuery.data.earned_badges.map((b) => (
              <span key={b.id} className="overview__badge">{b.name}</span>
            ))}
          </div>
        )}
      </section>

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

      <section className="overview__activity">
        <h2 className="overview__section-title">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="overview__muted">
            {isFirstVisit
              ? "No activity yet. Start by exploring how payments move."
              : "Your recent simulations and learning activity will appear here."}
          </p>
        ) : (
          <ul className="overview__activity-list">
            {activity.map((e, i) => (
              <li key={i} className="overview__activity-item">
                <span className={`overview__activity-tag overview__activity-tag--${e.type}`}>
                  {e.type === "module" ? "Module" : "Tool"}
                </span>
                <span className="overview__activity-label">{e.label}</span>
                <span className="overview__activity-time">{relativeTime(e.at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
