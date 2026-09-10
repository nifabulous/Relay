import { Link } from "react-router-dom";
import { Icon } from "../../design-system/coss/icon";
import type { ProgressResponse } from "../../api/schemas";

type OverviewLearningPulseProps = {
  completedCount: number;
  totalCount: number;
  percentage: number;
  streak: number;
  practiceDone: boolean;
  todayDrill: { correct: number; total: number } | null;
  reviewsDue: number;
  badges?: ProgressResponse;
  curriculumComplete: boolean;
};

export function OverviewLearningPulse({
  completedCount,
  totalCount,
  percentage,
  streak,
  practiceDone,
  todayDrill,
  reviewsDue,
  badges,
  curriculumComplete,
}: OverviewLearningPulseProps) {
  return (
    <aside className="overview__pulse" aria-labelledby="overview-pulse-heading">
      <h2 id="overview-pulse-heading" className="overview__eyebrow overview__pulse-heading">
        Learning Pulse
      </h2>

      <div className="overview__pulse-row">
        <span className="overview__pulse-icon overview__pulse-icon--progress" aria-hidden="true">
          <Icon name="grid" size={14} />
        </span>
        <span className="overview__pulse-body">
          <span className="overview__pulse-line">
            <span className="overview__progress-count mono">
              {completedCount} / {totalCount}
            </span>
            <span className="overview__pulse-row-text">modules</span>
            <span className="overview__pulse-percentage mono">{percentage}%</span>
          </span>
          <span className="overview__progress-bar">
            <span className="overview__progress-fill" style={{ width: `${percentage}%` }} />
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
                {!practiceDone && <span className="overview__pulse-hint"> · practice today to keep it</span>}
              </span>
            </span>
          </span>
        </div>
      )}

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

      {badges && badges.earned_badges.length > 0 && (
        <div className="overview__pulse-row">
          <span className="overview__pulse-icon overview__pulse-icon--badges" aria-hidden="true">
            <Icon name="checkCircle" size={14} />
          </span>
          <span className="overview__pulse-body overview__badges">
            {badges.earned_badges.map((badge) => (
              <span key={badge.id} className="overview__badge">
                {badge.name}
              </span>
            ))}
          </span>
        </div>
      )}

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
  );
}
