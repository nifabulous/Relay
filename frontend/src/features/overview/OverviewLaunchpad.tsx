import { Link } from "react-router-dom";
import type { CurriculumModule } from "../learn/curriculum";
import { Icon } from "../../design-system/coss/icon";
import type { PrimaryAction } from "../../design-system/types";
import { ACTION_COPY, ACTION_STAGE, WORKSPACES, type PlanItem } from "./overviewContent";

type OverviewLaunchpadProps = {
  action: PrimaryAction;
  nextModule: CurriculumModule | null;
  stats: { completedCount: number; totalCount: number };
  plan: PlanItem[];
};

export function OverviewLaunchpad({ action, nextModule, stats, plan }: OverviewLaunchpadProps) {
  const copy = ACTION_COPY[action.kind];
  const isLearnish =
    action.kind === "explore_intro" || action.kind === "resume_learn" || action.kind === "next_learn";
  const secondaryAction = action.href.startsWith("/explore")
    ? { to: "/operate/prepare", label: "Prepare a payment" }
    : { to: "/explore", label: "Explore reference data" };

  return (
    <>
      <div className="overview-launchpad__focus">
        <section className="overview-launchpad__task" aria-label="Current task">
          <div className="overview-launchpad__task-head">
            <p className="overview__eyebrow">Current task</p>
            <span className={`overview__stage overview__stage--${action.kind}`}>
              {ACTION_STAGE[action.kind]}
            </span>
          </div>

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
    </>
  );
}
