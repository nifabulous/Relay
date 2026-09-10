import { Icon } from "../../design-system/coss/icon";
import type { RelayActivityEntry } from "../../lib/persistence/storage";
import { relativeTime } from "./relativeTime";

export function OverviewActivity({
  activity,
  now,
  isFirstVisit,
}: {
  activity: RelayActivityEntry[];
  now: number;
  isFirstVisit: boolean;
}) {
  return (
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
          {activity.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="overview__activity-item">
              <span className="overview__activity-marker" aria-hidden="true" />
              <span className={`overview__activity-glyph overview__activity-glyph--${entry.type}`}>
                <Icon name={entry.type === "module" ? "book" : "route"} size={14} />
              </span>
              <span className="overview__activity-text">
                <span className="overview__activity-kind">{entry.type === "module" ? "Module" : "Tool"}</span>
                <span className="overview__activity-label">{entry.label}</span>
              </span>
              <span className="overview__activity-time">{relativeTime(entry.at, now)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
