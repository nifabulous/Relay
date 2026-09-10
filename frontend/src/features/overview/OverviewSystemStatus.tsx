import { Link } from "react-router-dom";
import { Icon } from "../../design-system/coss/icon";
import type { HealthResponse } from "../../api/schemas";

export function OverviewSystemStatus({
  health,
  isError,
}: {
  health?: HealthResponse;
  isError: boolean;
}) {
  return (
    <section className="overview__status overview-launchpad__panel" aria-label="System status">
      <div className="overview-launchpad__section-head">
        <h2>System status</h2>
      </div>
      {isError ? (
        <p className="overview-launchpad__inventory-error">System inventory is temporarily unavailable.</p>
      ) : health ? (
        <>
          <div className="overview-launchpad__system-list">
            <div className="overview-launchpad__system-row">
              <span className="overview-launchpad__system-name">Reference data</span>
              <span
                className={`overview-launchpad__system-state ${
                  health.status === "ok"
                    ? "overview-launchpad__system-state--ok"
                    : "overview-launchpad__system-state--warning"
                }`}
              >
                <Icon name={health.status === "ok" ? "checkCircle" : "alertTriangle"} size={13} />
                {health.status === "ok" ? "Healthy" : health.status}
              </span>
            </div>
            <div className="overview-launchpad__system-row">
              <span className="overview-launchpad__system-name">Banks</span>
              <span className="overview-launchpad__system-state mono">{health.banks}</span>
            </div>
            <div className="overview-launchpad__system-row">
              <span className="overview-launchpad__system-name">Corridor rules</span>
              <span className="overview-launchpad__system-state mono">{health.corridor_rules}</span>
            </div>
            <div className="overview-launchpad__system-row">
              <span className="overview-launchpad__system-name">SSI records</span>
              <span className="overview-launchpad__system-state mono">{health.ssi_records}</span>
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
  );
}
