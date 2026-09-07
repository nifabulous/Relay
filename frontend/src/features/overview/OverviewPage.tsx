import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { apiKeys } from "../../api/queryKeys";
import { HealthResponseSchema, ProgressResponseSchema } from "../../api/schemas";
import type { HealthResponse, ProgressResponse } from "../../api/schemas";
import { selectPrimaryAction } from "./selectPrimaryAction";
import type { PrimaryAction } from "../../design-system/types";
import { Icon, type IconName } from "../../design-system/coss/icon";
import { loadLearningState } from "../../lib/persistence/learnerStateTransfer";
import { displayStreak, dueReviews, practicedToday, dayKey, dayScore } from "../learn/practice/practiceStore";
import { computeProgress, getNextModule } from "../learn/curriculum";
import { toBackendModuleIds } from "./badgeIds";
import { relativeTime } from "./relativeTime";
import "./OverviewPage.css";

/**
 * Overview — Workspace Launchpad.
 *
 * The page leads with the one action the decision table selected, states
 * today's real work beside it, then opens into the three product workspaces
 * and closes with learner state, recent activity, and the live system
 * inventory.
 *
 * Every panel is driven by data Relay actually holds: the adaptive action,
 * local learner state, and `/api/health`. Nothing on this page is a
 * placeholder — an unknown value is omitted or named as unavailable rather
 * than filled in with an illustrative one, because a learning tool that
 * invents its own status teaches learners to trust invented status
 * (docs/superpowers/specs/2026-08-21-overview-adaptive-command-center-design.md).
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
    title: "Resume your lesson",
    supporting: "Pick up where you left off.",
    cta: "Resume lesson",
  },
  next_learn: {
    title: "Continue to the next module",
    supporting: "Build on your progress with the next lesson.",
    cta: "Continue learning",
  },
  resume_operate: {
    title: "Finish your payment draft",
    supporting: "Your prepared payment is still open.",
    cta: "Resume payment",
  },
  prepare_payment: {
    title: "Prepare a simulated payment",
    supporting: "Put the curriculum to work on a full route.",
    cta: "Prepare a payment",
  },
};

/** Short stage label for the action's eyebrow pill. */
const ACTION_STAGE: Record<PrimaryAction["kind"], string> = {
  explore_intro: "Start here",
  resume_learn: "Resume lesson",
  next_learn: "Next module",
  resume_operate: "Resume draft",
  prepare_payment: "Prepare payment",
};

type WorkspaceLink = {
  to: string;
  label: string;
  description: string;
  icon: IconName;
};

type Workspace = {
  name: "Learn" | "Explore" | "Operate";
  description: string;
  icon: IconName;
  links: WorkspaceLink[];
};

/**
 * Every label names the destination it actually opens. A launchpad tile that
 * promises a capability Relay does not have sends the learner somewhere that
 * reads as a broken product, so the wording tracks the route, not the ambition.
 */
const WORKSPACES: Workspace[] = [
  {
    name: "Learn",
    description: "Cases, labs, and daily practice.",
    icon: "book",
    links: [
      { to: "/learn", label: "Continue learning", description: "Case desk and technical labs", icon: "book" },
      { to: "/learn/practice", label: "Practice", description: "Run today’s drill", icon: "repeat" },
      { to: "/explore/glossary", label: "Glossary", description: "Look up payment terms", icon: "grid" },
    ],
  },
  {
    name: "Explore",
    description: "Reference data behind the simulation.",
    icon: "search",
    links: [
      { to: "/explore", label: "Search", description: "Find banks, corridors, and terms", icon: "search" },
      { to: "/explore/banks", label: "Directory", description: "Browse banks", icon: "building" },
      { to: "/explore/schemes", label: "Payment schemes", description: "Compare domestic rails", icon: "route" },
    ],
  },
  {
    name: "Operate",
    description: "Run a simulated payment end to end.",
    icon: "sliders",
    links: [
      { to: "/operate/prepare", label: "Prepare a payment", description: "Validate, route, and check", icon: "creditCard" },
      { to: "/operate/tracking", label: "Track a payment", description: "Follow a simulated gpi timeline", icon: "route" },
      { to: "/operate/tools", label: "Payment tools", description: "Fees, screening, value date, STP", icon: "sliders" },
    ],
  },
];

type PlanItem = {
  key: string;
  label: string;
  to: string;
  state: "Due" | "Up next" | "Done";
};

/**
 * Today's plan is derived, never authored. Each row is a real piece of work
 * with a route that acts on it, and a row appears only when that work exists:
 * a finished drill reports itself done rather than being padded out with
 * filler rows.
 */
function buildPlan(input: {
  reviewsDue: number;
  practiceDone: boolean;
  nextModuleTitle: string | null;
  nextModuleHref: string | null;
  curriculumComplete: boolean;
}): PlanItem[] {
  const plan: PlanItem[] = [];

  if (input.reviewsDue > 0) {
    plan.push({
      key: "reviews",
      label: `Review ${input.reviewsDue} missed question${input.reviewsDue === 1 ? "" : "s"}`,
      to: "/learn/practice",
      state: "Due",
    });
  }

  plan.push({
    key: "practice",
    label: input.practiceDone ? "Daily drill complete" : "Run today’s drill",
    to: "/learn/practice",
    state: input.practiceDone ? "Done" : "Up next",
  });

  if (input.nextModuleTitle && input.nextModuleHref) {
    plan.push({
      key: "module",
      label: `Study ${input.nextModuleTitle}`,
      to: input.nextModuleHref,
      state: "Up next",
    });
  }

  if (input.curriculumComplete) {
    plan.push({
      key: "prepare",
      label: "Prepare a simulated payment",
      to: "/operate/prepare",
      state: "Up next",
    });
  }

  return plan;
}

export function OverviewPage() {
  const learningState = loadLearningState();
  const progress = learningState.state.progress;
  const stats = computeProgress(progress.completedModuleIds);
  const completedParam = progress.completedModuleIds.flatMap(toBackendModuleIds).join(",");
  const activity = learningState.state.activity.entries;
  const now = Date.now();
  const practice = learningState.state.practice;
  const today = dayKey(new Date(now));
  const streak = displayStreak(practice, today);
  const reviewsDue = dueReviews(practice, today).length;
  const practiceDone = practicedToday(practice, today);
  const todayDrill = dayScore(practice, today);

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
  const nextModule = curriculumComplete ? null : getNextModule(progress.completedModuleIds);
  // A second button is only worth its weight if it goes somewhere the primary
  // does not.
  const secondaryAction = action.href.startsWith("/explore")
    ? { to: "/operate/prepare", label: "Prepare a payment" }
    : { to: "/explore", label: "Explore reference data" };

  const plan = buildPlan({
    reviewsDue,
    practiceDone,
    nextModuleTitle: nextModule?.title ?? null,
    nextModuleHref: nextModule?.href ?? null,
    curriculumComplete,
  });

  return (
    <div className="overview">
      <header className="overview__header">
        <h1 className="overview__heading">Overview</h1>
        <p className="overview__tagline">Your payment routing learning hub.</p>
      </header>

      <div className="overview-launchpad__focus">
        <section className="overview-launchpad__task" aria-label="Current task">
          <div className="overview-launchpad__task-head">
            <p className="overview__eyebrow">Current task</p>
            <span className={`overview__stage overview__stage--${action.kind}`}>
              {ACTION_STAGE[action.kind]}
            </span>
          </div>

          {/* `overview__action-title` carries no styling — the launchpad class
              does that. It is the selector the copy-contract tests and
              e2e/overview.spec.ts assert on, so it stays. Same for
              `overview__status` on the inventory panel below. */}
          <h2 className="overview-launchpad__task-title overview__action-title">{copy.title}</h2>
          <p className="overview-launchpad__task-summary">{copy.supporting}</p>

          <div className="overview-launchpad__task-meta">
            {isLearnish && nextModule ? (
              <>
                <span>{nextModule.title}</span>
                <span className="mono">
                  Lesson {Math.min(stats.completedCount + 1, stats.totalCount)} of {stats.totalCount}
                </span>
              </>
            ) : (
              <span>Originator → Correspondent → Beneficiary</span>
            )}
          </div>

          <div className="overview-launchpad__task-actions">
            <Link to={action.href} className="relay-btn relay-btn--primary overview__cta">
              {copy.cta}
              <span className="overview__cta-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <Link to={secondaryAction.to} className="relay-btn relay-btn--secondary">
              {secondaryAction.label}
            </Link>
          </div>
        </section>

        <section className="overview-launchpad__plan" aria-label="Today's plan">
          <div className="overview-launchpad__section-head">
            <h2>Today&apos;s plan</h2>
          </div>
          <ol className="overview-launchpad__plan-list">
            {plan.map((item) => (
              <li key={item.key} className="overview-launchpad__plan-item">
                <span
                  className={`overview-launchpad__plan-dot${item.state === "Due" ? " overview-launchpad__plan-dot--active" : ""}`}
                  aria-hidden="true"
                />
                <Link to={item.to} className="overview-launchpad__plan-label">
                  {item.label}
                </Link>
                <span
                  className={`overview-launchpad__plan-chip${item.state === "Due" ? " overview-launchpad__plan-chip--active" : ""}`}
                >
                  {item.state}
                </span>
              </li>
            ))}
          </ol>
          <Link to="/learn" className="overview-launchpad__plan-link">
            View full plan <span aria-hidden="true">→</span>
          </Link>
        </section>
      </div>

      <section className="overview-launchpad__workspaces" aria-label="Workspace launchpad">
        {WORKSPACES.map((workspace) => (
          <div key={workspace.name} className="overview-launchpad__workspace">
            <div className="overview-launchpad__workspace-head">
              <span className="overview-launchpad__workspace-icon" aria-hidden="true">
                <Icon name={workspace.icon} size={19} />
              </span>
              <div>
                <h2>{workspace.name}</h2>
                <p>{workspace.description}</p>
              </div>
            </div>
            <div className="overview-launchpad__workspace-links">
              {workspace.links.map((link) => (
                <Link key={link.to} to={link.to} className="overview-launchpad__workspace-link">
                  <span className="overview-launchpad__workspace-link-icon" aria-hidden="true">
                    <Icon name={link.icon} size={15} />
                  </span>
                  <span className="overview-launchpad__workspace-link-copy">
                    <span className="overview-launchpad__workspace-link-label">{link.label}</span>
                    <span className="overview-launchpad__workspace-link-description">{link.description}</span>
                  </span>
                  <span className="overview-launchpad__workspace-link-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="overview-launchpad__lower">
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

          {/* Today's drill row appears only once a drill has been recorded, so
              the count is the one the practice store holds, never a stand-in. */}
          {todayDrill && (
            <div className="overview__pulse-row">
              <span className="overview__pulse-icon overview__pulse-icon--progress" aria-hidden="true">
                <Icon name="check" size={14} />
              </span>
              <span className="overview__pulse-body">
                <span className="overview__pulse-line">
                  <span className="overview__pulse-value mono">
                    {todayDrill.correct} / {todayDrill.total}
                  </span>
                  <span className="overview__pulse-row-text">correct today</span>
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

        <section className="overview__activity" aria-label="Recent activity">
          <div className="overview-launchpad__section-head">
            <h2>Recent activity</h2>
          </div>
          {activity.length === 0 ? (
            <p className="overview__empty">
              {isFirstVisit
                ? "No activity yet. Start by exploring how payments move."
                : "No activity yet. Your recent simulations and learning will appear here."}
            </p>
          ) : (
            <ol className="overview__activity-list">
              {activity.map((e, i) => (
                <li key={`${e.at}-${i}`} className="overview__activity-item">
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

        {/* Reference-data inventory, straight from /api/health. There is no
            service-health story to tell here — Relay is one app and one
            database — so the panel reports the row counts it can prove and
            says nothing when the probe fails. */}
        <section className="overview__status overview-launchpad__panel" aria-label="System status">
          <div className="overview-launchpad__section-head">
            <h2>System status</h2>
          </div>
          {healthQuery.isError ? (
            <p className="overview-launchpad__inventory-error">System inventory is temporarily unavailable.</p>
          ) : healthQuery.data ? (
            <>
              <div className="overview-launchpad__system-list">
                <div className="overview-launchpad__system-row">
                  <span className="overview-launchpad__system-name">Reference data</span>
                  {/* The backend reports "degraded" when seeding failed or the
                      bank table is empty (app/routers/directory.py). Text,
                      icon, and colour all have to say the same thing. */}
                  <span
                    className={`overview-launchpad__system-state ${
                      healthQuery.data.status === "ok"
                        ? "overview-launchpad__system-state--ok"
                        : "overview-launchpad__system-state--warning"
                    }`}
                  >
                    <Icon name={healthQuery.data.status === "ok" ? "checkCircle" : "alertTriangle"} size={13} />
                    {healthQuery.data.status === "ok" ? "Healthy" : healthQuery.data.status}
                  </span>
                </div>
                <div className="overview-launchpad__system-row">
                  <span className="overview-launchpad__system-name">Banks</span>
                  <span className="overview-launchpad__system-state mono">{healthQuery.data.banks}</span>
                </div>
                <div className="overview-launchpad__system-row">
                  <span className="overview-launchpad__system-name">Corridor rules</span>
                  <span className="overview-launchpad__system-state mono">{healthQuery.data.corridor_rules}</span>
                </div>
                <div className="overview-launchpad__system-row">
                  <span className="overview-launchpad__system-name">SSI records</span>
                  <span className="overview-launchpad__system-state mono">{healthQuery.data.ssi_records}</span>
                </div>
              </div>
              <p className="overview__status-text overview-launchpad__inventory-footnote">
                Educational simulation — these are seeded reference records, not live rails.
              </p>
            </>
          ) : (
            <p className="overview-launchpad__inventory-footnote">Loading system inventory…</p>
          )}
          <Link to="/explore/banks" className="overview-launchpad__panel-link">
            Browse the directory <span aria-hidden="true">→</span>
          </Link>
        </section>
      </div>
    </div>
  );
}
