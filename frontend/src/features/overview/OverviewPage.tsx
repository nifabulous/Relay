import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { selectPrimaryAction } from "./selectPrimaryAction";
import { apiKeys } from "../../api/queryKeys";
import { apiRequest } from "../../api/client";
import { HealthResponseSchema, ProgressResponseSchema } from "../../api/schemas";
import type { HealthResponse, ProgressResponse } from "../../api/schemas";
import type { PrimaryAction } from "../../design-system/types";
import { Icon, type IconName } from "../../design-system/coss/icon";
import { loadLearningState } from "../../lib/persistence/learnerStateTransfer";
import { displayStreak, dueReviews, practicedToday, dayKey } from "../learn/practice/practiceStore";
import { computeProgress, getNextModule } from "../learn/curriculum";
import { toBackendModuleIds } from "./badgeIds";
import { relativeTime } from "./relativeTime";
import "./OverviewPage.css";

/**
 * Overview — Adaptive Command Center.
 *
 * One dominant adaptive action first (with the payment-route cue that is the
 * product's visual signature), Learning Pulse beside it, quick routes and a
 * scan-friendly activity feed below, system inventory last and quietest.
 * Composition change only — every data source and its behaviour is preserved
 * (docs/superpowers/specs/2026-08-21-overview-adaptive-command-center-design.md).
 *
 * The page uses Relay-owned classes; Coss supplies the token bridge, the cn
 * helper and the project-owned icon set.
 */

/**
 * Copy contract from the spec — deterministic title, supporting line, and CTA
 * label per action kind. Do not invent per-state marketing language here.
 */
const ACTION_COPY: Record<PrimaryAction["kind"], { title: string; supporting: string; cta: string }> = {
  explore_intro: {
    title: "Explore how payments move",
    supporting: "Start with an illustrative payment flow.",
    cta: "Explore how payments move",
  },
  resume_learn: {
    title: "Continue learning",
    supporting: "Pick up the lesson you were last working on.",
    cta: "Continue learning",
  },
  resume_operate: {
    title: "Resume payment preparation",
    supporting: "Continue the simulated payment you started.",
    cta: "Resume payment preparation",
  },
  next_learn: {
    title: "Continue to the next module",
    supporting: "Build on your progress with the next lesson.",
    cta: "Continue to next module",
  },
  prepare_payment: {
    title: "Prepare a simulated payment",
    supporting: "Apply what you learned to a complete payment route.",
    cta: "Prepare a simulated payment",
  },
};

/** Short stage label for the action's eyebrow pill. */
const ACTION_STAGE: Record<PrimaryAction["kind"], string> = {
  explore_intro: "Start here",
  resume_learn: "Resume lesson",
  resume_operate: "Resume payment",
  next_learn: "Next module",
  prepare_payment: "Prepare payment",
};

const QUICK_ROUTES: ReadonlyArray<{ to: string; label: string; purpose: string; icon: IconName }> = [
  { to: "/explore", label: "Search", purpose: "Find banks, corridors, and terms", icon: "search" },
  { to: "/explore/banks", label: "Directory", purpose: "Browse banks", icon: "building" },
  { to: "/operate", label: "Track", purpose: "Prepare or track a payment", icon: "route" },
  { to: "/learn/practice", label: "Practice", purpose: "Run today’s drill", icon: "repeat" },
];

export function OverviewPage() {
  const learningState = loadLearningState();
  const progress = learningState.state.progress;
  const stats = computeProgress(progress.completedModuleIds);
  const nextModule = stats.percentage === 100 ? null : getNextModule(progress.completedModuleIds);
  const completedParam = progress.completedModuleIds.flatMap(toBackendModuleIds).join(",");
  const activity = learningState.state.activity.entries;
  const now = Date.now();
  const practice = learningState.state.practice;
  const today = dayKey(new Date());
  const streak = displayStreak(practice, today);
  const reviewsDue = dueReviews(practice, today).length;
  const practiceDone = practicedToday(practice, today);

  // Non-blocking by contract: loading omits the inventory line, failure shows
  // a quiet unavailable note, and neither hides anything above it.
  const healthQuery = useQuery({
    queryKey: apiKeys.health,
    queryFn: () => apiRequest<HealthResponse>("/api/health", undefined, HealthResponseSchema),
  });

  // Badges only — count/%/next come from local stats. A failed badge request
  // just omits the row; it never takes over the page.
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
  const copy = ACTION_COPY[action.kind];
  const isLearnish =
    action.kind === "explore_intro" || action.kind === "resume_learn" || action.kind === "next_learn";

  return (
    <div className="overview">
      <header className="overview__header">
        <h1 className="overview__heading">Overview</h1>
        <p className="overview__tagline">Your payment routing learning hub.</p>
      </header>

      <section className="overview__hero" aria-label="Next action">
        <div className="overview__action">
          <div className="overview__action-main">
            <p className={`overview__stage overview__stage--${action.kind}`}>{ACTION_STAGE[action.kind]}</p>
            <p className="overview__action-title">{copy.title}</p>
            <p className="overview__action-supporting">{copy.supporting}</p>
          </div>

          {/* The route is Relay's visual signature (DESIGN.md); this compact cue
              explains what the action feeds without becoming a second progress
              section. For learn actions it carries the live curriculum state. */}
          <div className="overview__action-cue">
            <RouteCue active={!isFirstVisit} />
            <div className="overview__cue-caption">
              {isLearnish && nextModule ? (
                <>
                  <span className="overview__cue-context">{nextModule.title}</span>
                  <span className="overview__cue-track">
                    <span className="overview__cue-fill" style={{ width: `${stats.percentage}%` }} />
                  </span>
                  <span className="overview__cue-meta mono">
                    Lesson {Math.min(stats.completedCount + 1, stats.totalCount)} of {stats.totalCount} ·{" "}
                    {stats.percentage}%
                  </span>
                </>
              ) : (
                <span className="overview__cue-context">
                  Originator → Correspondent → Beneficiary
                </span>
              )}
            </div>
          </div>

          <Link to={action.href} className="relay-btn relay-btn--primary overview__cta">
            {copy.cta}
            <span className="overview__cta-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>

        <aside className="overview__pulse" aria-labelledby="overview-pulse-heading">
          <h2 id="overview-pulse-heading" className="overview__eyebrow overview__pulse-heading">
            Learning Pulse
          </h2>

          {/* The starting point stays visible even at zero; zero-value streak
              and review rows are omitted rather than rendered as empty stats. */}
          <div className="overview__pulse-row">
            <span className="overview__pulse-icon overview__pulse-icon--progress" aria-hidden="true">
              <Icon name="grid" size={14} />
            </span>
            <span className="overview__pulse-body">
              <span className="overview__pulse-line">
                <span className="overview__progress-count mono">
                  {stats.completedCount} / {stats.totalCount}
                </span>
                <span className="overview__pulse-row-text">modules</span>
                <span className="overview__pulse-percentage mono">{stats.percentage}%</span>
              </span>
              <span className="overview__progress-bar">
                <span className="overview__progress-fill" style={{ width: `${stats.percentage}%` }} />
              </span>
            </span>
          </div>

          {streak > 0 && (
            <div className="overview__pulse-row">
              <span className="overview__pulse-icon overview__pulse-icon--streak" aria-hidden="true">
                <Icon name="flame" size={14} />
              </span>
              <span className="overview__pulse-body">
                <span className="overview__pulse-line">
                  <span className="overview__pulse-value mono">{streak}</span>
                  <span className="overview__pulse-row-text">
                    day streak
                    {!practiceDone && (
                      <span className="overview__pulse-hint"> · practice today to keep it</span>
                    )}
                  </span>
                </span>
              </span>
            </div>
          )}

          {reviewsDue > 0 && (
            <div className="overview__pulse-row">
              <span className="overview__pulse-icon overview__pulse-icon--reviews" aria-hidden="true">
                <Icon name="book" size={14} />
              </span>
              <span className="overview__pulse-body">
                <span className="overview__pulse-line">
                  <span className="overview__pulse-value mono">{reviewsDue}</span>
                  <span className="overview__pulse-row-text">
                    <Link to="/learn/practice" className="overview__review-due">
                      question{reviewsDue === 1 ? "" : "s"} due for review
                    </Link>
                  </span>
                </span>
              </span>
            </div>
          )}

          {badgesQuery.data && badgesQuery.data.earned_badges.length > 0 && (
            <div className="overview__pulse-row">
              <span className="overview__pulse-icon overview__pulse-icon--badges" aria-hidden="true">
                <Icon name="checkCircle" size={14} />
              </span>
              <span className="overview__pulse-body overview__badges">
                {badgesQuery.data.earned_badges.map((b) => (
                  <span key={b.id} className="overview__badge">
                    {b.name}
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* Status footer: text + dot so meaning never rides on colour alone. */}
          <p className="overview__pulse-footer">
            <span
              className={
                reviewsDue > 0 && !practiceDone
                  ? "overview__pulse-dot overview__pulse-dot--waiting"
                  : "overview__pulse-dot overview__pulse-dot--ok"
              }
              aria-hidden="true"
            />
            {curriculumComplete
              ? "Curriculum complete — try a simulated payment"
              : reviewsDue > 0 && !practiceDone
                ? `Review ${reviewsDue === 1 ? "that question" : "those questions"} to stay sharp`
                : "On track — keep it up"}
          </p>
        </aside>
      </section>

      <section aria-label="Quick routes" className="overview__section">
        <h2 className="overview__section-title">Quick routes</h2>
        <div className="overview__routes">
          {QUICK_ROUTES.map((route) => (
            <Link key={route.to} to={route.to} className="overview__route">
              <span className="overview__route-icon" aria-hidden="true">
                <Icon name={route.icon} size={16} />
              </span>
              <span className="overview__route-body">
                <span className="overview__route-label">{route.label}</span>
                <span className="overview__route-purpose">{route.purpose}</span>
              </span>
              <span className="overview__route-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Recent activity" className="overview__activity">
        <h2 className="overview__section-title">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="overview__empty">
            {isFirstVisit
              ? "No activity yet. Start by exploring how payments move."
              : "No activity yet. Your recent simulations and learning will appear here."}
          </p>
        ) : (
          <ol className="overview__activity-list">
            {activity.map((e, i) => (
              <li key={i} className="overview__activity-item">
                <span className="overview__activity-marker" aria-hidden="true" />
                <span className={`overview__activity-glyph overview__activity-glyph--${e.type}`}>
                  <Icon name={e.type === "module" ? "book" : "route"} size={14} />
                </span>
                <span className="overview__activity-text">
                  <span className="overview__activity-kind">{e.type === "module" ? "Module" : "Tool"}</span>
                  <span className="overview__activity-label">{e.label}</span>
                </span>
                <span className="overview__activity-time">{relativeTime(e.at, now)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* The Learning backup panel lives on the Settings route
          (features/settings/SettingsPage.tsx), alongside the storage-boundary
          explanation that makes an export control legible. */}

      {healthQuery.data && (
        <section className="overview__status">
          <p className="overview__status-text">
            <span className="mono">{healthQuery.data.banks}</span> banks ·
            <span className="mono"> {healthQuery.data.corridor_rules}</span> corridors ·
            <span className="mono"> {healthQuery.data.ssi_records}</span> SSI records
          </p>
        </section>
      )}
      {healthQuery.isError && (
        <section className="overview__status">
          <p className="overview__status-text">System inventory is temporarily unavailable.</p>
        </section>
      )}
    </div>
  );
}

/**
 * The simplified payment route: originator → correspondent → beneficiary.
 * Decorative by contract (the information is in the caption), hence the
 * aria-hidden wrapper and non-semantic spans.
 */
function RouteCue({ active }: { active: boolean }) {
  return (
    <span className={`overview__cue-nodes${active ? " overview__cue-nodes--active" : ""}`}>
      <span className="overview__cue-node overview__cue-node--origin">
        <Icon name="creditCard" size={16} />
      </span>
      <span className="overview__cue-link" />
      <span className="overview__cue-node">
        <Icon name="building" size={16} />
      </span>
      <span className="overview__cue-link" />
      <span className="overview__cue-node">
        <Icon name="user" size={16} />
      </span>
    </span>
  );
}
