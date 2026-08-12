export type AnalyticsEventMap = {
  app_viewed: { surface: "relay" };
  module_viewed: { module_id: string };
  module_started: { module_id: string };
  module_completed: { module_id: string };
  checkpoint_reached: { module_id: string; checkpoint_id: string };
  question_answered: {
    surface: "module" | "practice";
    question_id: string;
    correct: boolean;
    attempt_index: number;
  };
  practice_started: { question_count: number };
  practice_completed: { question_count: number; correct_count: number };
  case_started: { case_id: string };
  case_phase_entered: {
    case_id: string;
    phase: "investigate" | "recommend" | "resolve" | "debrief";
  };
  case_action: {
    case_id: string;
    action:
      | "request-facts"
      | "open-reference"
      | "edit-draft"
      | "send-recommendation"
      | "complete-transfer"
      | "restart";
  };
  case_completed: {
    case_id: string;
    outcome: "invalid" | "possible" | "defensible" | "preferred";
  };
};

export type AnalyticsEvent = {
  [Name in keyof AnalyticsEventMap]: {
    name: Name;
    properties: AnalyticsEventMap[Name];
  };
}[keyof AnalyticsEventMap];

export interface AnalyticsSink {
  capture(event: AnalyticsEvent): void;
}

const noOpSink: AnalyticsSink = {
  capture: () => undefined,
};

let activeSink: AnalyticsSink = noOpSink;

export function track<Name extends keyof AnalyticsEventMap>(
  name: Name,
  properties: AnalyticsEventMap[Name],
): void {
  activeSink.capture({ name, properties } as AnalyticsEvent);
}

export function setAnalyticsSink(sink: AnalyticsSink): void {
  activeSink = sink;
}

export function resetAnalyticsSink(): void {
  activeSink = noOpSink;
}

export function getAnalyticsSink(): AnalyticsSink {
  return activeSink;
}

export class TestAnalyticsSink implements AnalyticsSink {
  readonly events: AnalyticsEvent[] = [];

  capture(event: AnalyticsEvent): void {
    this.events.push(event);
  }
}

export function createTestSink(): TestAnalyticsSink {
  return new TestAnalyticsSink();
}
