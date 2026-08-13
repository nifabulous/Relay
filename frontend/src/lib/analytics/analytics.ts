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

type NoExtraProperties<Allowed, Candidate> = Candidate &
  Record<Exclude<keyof Candidate, keyof Allowed>, never>;

type IsUnion<Value, Whole = Value> = Value extends Whole
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

type SingleEventName<Name> = IsUnion<Name> extends false ? Name : never;

const analyticsPropertyKeys = {
  app_viewed: ["surface"],
  module_viewed: ["module_id"],
  module_started: ["module_id"],
  module_completed: ["module_id"],
  checkpoint_reached: ["module_id", "checkpoint_id"],
  question_answered: ["surface", "question_id", "correct", "attempt_index"],
  practice_started: ["question_count"],
  practice_completed: ["question_count", "correct_count"],
  case_started: ["case_id"],
  case_phase_entered: ["case_id", "phase"],
  case_action: ["case_id", "action"],
  case_completed: ["case_id", "outcome"],
} as const satisfies {
  [Name in keyof AnalyticsEventMap]: readonly (keyof AnalyticsEventMap[Name])[];
};

type ValueCheck =
  | { kind: "string" }
  | { kind: "boolean" }
  | { kind: "number"; min?: number }
  | { kind: "enum"; values: readonly string[] };

// Per-property runtime checks keyed by event name. The `satisfies` clause ties
// this table to AnalyticsEventMap: adding a property to the event map without
// a check here is a compile error, and an enum value list can never grow past
// the declared union (only shrink — which the happy-path tests then catch).
const analyticsValueChecks = {
  app_viewed: { surface: { kind: "enum", values: ["relay"] } },
  module_viewed: { module_id: { kind: "string" } },
  module_started: { module_id: { kind: "string" } },
  module_completed: { module_id: { kind: "string" } },
  checkpoint_reached: {
    module_id: { kind: "string" },
    checkpoint_id: { kind: "string" },
  },
  question_answered: {
    surface: { kind: "enum", values: ["module", "practice"] },
    question_id: { kind: "string" },
    correct: { kind: "boolean" },
    attempt_index: { kind: "number", min: 1 },
  },
  practice_started: { question_count: { kind: "number", min: 0 } },
  practice_completed: {
    question_count: { kind: "number", min: 0 },
    correct_count: { kind: "number", min: 0 },
  },
  case_started: { case_id: { kind: "string" } },
  case_phase_entered: {
    case_id: { kind: "string" },
    phase: {
      kind: "enum",
      values: ["investigate", "recommend", "resolve", "debrief"],
    },
  },
  case_action: {
    case_id: { kind: "string" },
    action: {
      kind: "enum",
      values: [
        "request-facts",
        "open-reference",
        "edit-draft",
        "send-recommendation",
        "complete-transfer",
        "restart",
      ],
    },
  },
  case_completed: {
    case_id: { kind: "string" },
    outcome: {
      kind: "enum",
      values: ["invalid", "possible", "defensible", "preferred"],
    },
  },
} as const satisfies {
  [Name in keyof AnalyticsEventMap]: {
    [Key in keyof AnalyticsEventMap[Name]]: ValueCheck;
  };
};

function isValueValid(check: ValueCheck, value: unknown): boolean {
  switch (check.kind) {
    case "string":
      // Authored identifiers are single-token slugs (lab-1, canada-us-supplier,
      // question-7). Rejecting whitespace and control characters keeps free
      // text or newline-injected values out of telemetry even when a caller
      // bypasses the types with a cast.
      return (
        typeof value === "string" &&
        value.length > 0 &&
        !/\s/.test(value) &&
        !/[\u0000-\u001F\u007F]/.test(value)
      );
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (check.min === undefined || value >= check.min)
      );
    case "enum":
      return (
        typeof value === "string" &&
        (check.values as readonly string[]).includes(value)
      );
  }
}

const noOpSink: AnalyticsSink = {
  capture: () => undefined,
};

let activeSink: AnalyticsSink = noOpSink;

export function track<
  Name extends keyof AnalyticsEventMap,
  Properties extends AnalyticsEventMap[Name],
>(
  name: Name & SingleEventName<Name>,
  properties: NoExtraProperties<AnalyticsEventMap[Name], Properties>,
): void;
export function track(
  name: keyof AnalyticsEventMap,
  properties: AnalyticsEventMap[keyof AnalyticsEventMap],
): void {
  // Type-safe callers can only pass declared names, but a runtime misuse
  // (e.g. an `as any` caller with an object-prototype key) must fail closed
  // instead of throwing inside a learner's event handler. Own-property check
  // matters: `analyticsPropertyKeys["__proto__"]` resolves to Object.prototype
  // via the prototype chain, which is truthy but not iterable.
  const keys = Object.prototype.hasOwnProperty.call(analyticsPropertyKeys, name)
    ? (analyticsPropertyKeys[name] as readonly string[])
    : undefined;
  const checks = Object.prototype.hasOwnProperty.call(analyticsValueChecks, name)
    ? (analyticsValueChecks[name] as Record<string, ValueCheck>)
    : undefined;
  if (keys === undefined || checks === undefined) return;

  const source = properties as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    const check = checks[key];
    // Drop the whole event when a value violates its contract, so telemetry
    // never carries free text, out-of-union enums, or out-of-range numbers —
    // even if a caller bypasses the types with a cast.
    if (check === undefined || !isValueValid(check, value)) return;
    projected[key] = value;
  }

  try {
    activeSink.capture({ name, properties: projected } as AnalyticsEvent);
  } catch {
    // A provider adapter that throws is treated as broken: swap in the no-op
    // sink so later events are cheap no-ops instead of repeating the failure
    // on every call, and the learner's state machine is never interrupted.
    activeSink = noOpSink;
  }
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
