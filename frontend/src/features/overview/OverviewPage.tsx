import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { apiKeys } from "../../api/queryKeys";
import { HealthResponseSchema, ProgressResponseSchema } from "../../api/schemas";
import type { HealthResponse, ProgressResponse } from "../../api/schemas";
import { selectPrimaryAction } from "./selectPrimaryAction";
import { loadLearningState } from "../../lib/persistence/learnerStateTransfer";
import { displayStreak, dueReviews, practicedToday, dayKey, dayScore } from "../learn/practice/practiceStore";
import { computeProgress, getNextModule } from "../learn/curriculum";
import { toBackendModuleIds } from "./badgeIds";
import { OverviewActivity } from "./OverviewActivity";
import { OverviewLaunchpad } from "./OverviewLaunchpad";
import { OverviewLearningPulse } from "./OverviewLearningPulse";
import { OverviewSystemStatus } from "./OverviewSystemStatus";
import { buildPlan } from "./overviewContent";
import "./OverviewPage.css";
import "./OverviewLaunchpad.css";
import "./OverviewLearningPulse.css";
import "./OverviewActivity.css";
import "./OverviewSystemStatus.css";

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
  const nextModule = curriculumComplete ? null : getNextModule(progress.completedModuleIds);

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

      <OverviewLaunchpad action={action} nextModule={nextModule} stats={stats} plan={plan} />

      <div className="overview-launchpad__lower">
        <OverviewLearningPulse
          completedCount={stats.completedCount}
          totalCount={stats.totalCount}
          percentage={stats.percentage}
          streak={streak}
          practiceDone={practiceDone}
          todayDrill={todayDrill}
          reviewsDue={reviewsDue}
          badges={badgesQuery.data}
          curriculumComplete={curriculumComplete}
        />
        <OverviewActivity activity={activity} now={now} isFirstVisit={isFirstVisit} />
        <OverviewSystemStatus health={healthQuery.data} isError={healthQuery.isError} />
      </div>
    </div>
  );
}
