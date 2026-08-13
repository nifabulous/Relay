import { afterEach, describe, expect, it } from "vitest";
import {
  createTestSink,
  getAnalyticsSink,
  resetAnalyticsSink,
  setAnalyticsSink,
  track,
  type AnalyticsEventMap,
  type AnalyticsSink,
} from "./analytics";

afterEach(() => {
  resetAnalyticsSink();
});

describe("analytics contract", () => {
  it("captures closed events through an injected sink", () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);

    track("module_completed", { module_id: "lab-1" });

    expect(sink.events).toEqual([
      { name: "module_completed", properties: { module_id: "lab-1" } },
    ]);
  });

  it("restores the no-op sink when reset", () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);
    track("module_completed", { module_id: "lab-1" });

    resetAnalyticsSink();
    track("module_completed", { module_id: "lab-2" });

    expect(sink.events).toEqual([
      { name: "module_completed", properties: { module_id: "lab-1" } },
    ]);
    expect(getAnalyticsSink()).not.toBe(sink);
  });

  it("keeps captured event properties free of account and free-text fields", () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);
    track("question_answered", {
      surface: "practice",
      question_id: "question-7",
      correct: true,
      attempt_index: 2,
    });

    const properties = JSON.parse(JSON.stringify(sink.events[0].properties)) as Record<string, unknown>;
    expect(properties).not.toHaveProperty("account");
    expect(properties).not.toHaveProperty("explanation");
    expect(properties).not.toHaveProperty("customer");
    expect(properties).not.toHaveProperty("name");
  });

  it("projects dynamic payloads onto the declared property allowlist", () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);
    const dynamicPayload = {
      module_id: "lab-1",
      explanation: "private learner prose",
    };

    track(
      "module_completed",
      dynamicPayload as unknown as AnalyticsEventMap["module_completed"],
    );

    expect(sink.events).toEqual([
      { name: "module_completed", properties: { module_id: "lab-1" } },
    ]);
  });

  it("accepts only the declared event names and object-literal properties", () => {
    if (false) {
      // @ts-expect-error unknown event names are not part of the analytics contract
      track("unknown_event", {});
    }

    const properties = {
      module_id: "lab-1",
    } satisfies AnalyticsEventMap["module_completed"];

    const invalidProperties = {
      module_id: "lab-1",
      // @ts-expect-error object-literal properties outside the allowlist are rejected
      account: "not-permitted",
    } satisfies AnalyticsEventMap["module_completed"];

    const predeclaredPayload = {
      module_id: "lab-1",
      explanation: "not-permitted",
    };
    if (false) {
      // @ts-expect-error predeclared payloads must obey the exact property allowlist
      track("module_completed", predeclaredPayload);
    }

    const unionName: "module_completed" | "practice_started" =
      Math.random() > 0.5 ? "module_completed" : "practice_started";
    const independentlyUnionedProperties:
      | AnalyticsEventMap["module_completed"]
      | AnalyticsEventMap["practice_started"] =
      Math.random() > 0.5 ? { module_id: "lab-1" } : { question_count: 5 };
    if (false) {
      // @ts-expect-error independent unions can mismatch; callers must preserve the name/property pair
      track(unionName, independentlyUnionedProperties);
    }

    track("module_completed", properties);
    expect(invalidProperties.account).toBe("not-permitted");
  });
});

describe("analytics runtime resilience", () => {
  it("replaces a failing sink so the failure is contained, not repeated", () => {
    const throwingSink: AnalyticsSink = {
      capture: () => {
        throw new Error("adapter unavailable");
      },
    };
    setAnalyticsSink(throwingSink);

    // A provider adapter that fails once must not crash a practice answer or
    // module render mid-transition, and must not be retried on every event:
    // the failing sink is swapped for the no-op sink.
    expect(() =>
      track("practice_completed", { question_count: 5, correct_count: 4 }),
    ).not.toThrow();
    expect(getAnalyticsSink()).not.toBe(throwingSink);

    // Later events are cheap no-ops rather than repeated failures.
    expect(() => track("module_viewed", { module_id: "lab-1" })).not.toThrow();
  });

  it("drops events for unknown runtime names instead of throwing", () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);

    // Type-safe callers can't express an unknown name, so widen the signature
    // on purpose: an `as any` caller with an object-prototype key would
    // previously throw mid-handler.
    const trackAny = track as unknown as (name: string, properties: unknown) => void;
    expect(() => trackAny("__proto__", {})).not.toThrow();
    expect(sink.events).toEqual([]);
  });

  it("drops events whose values violate the runtime contract", () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);
    // Widen on purpose: the type system already rejects these, but an `as any`
    // caller must not be able to smuggle them into telemetry at runtime.
    const trackAny = track as unknown as (name: string, properties: unknown) => void;

    // Enum outside the closed union.
    trackAny("case_phase_entered", {
      case_id: "canada-us-supplier",
      phase: "nonsense",
    });
    // Wrong primitive type for a boolean field.
    trackAny("question_answered", {
      surface: "practice",
      question_id: "l1-bic-country",
      correct: "yes",
      attempt_index: 1,
    });
    // Free text in an identifier field.
    trackAny("module_viewed", { module_id: "Full learner name" });
    // Count below its bound.
    trackAny("practice_started", { question_count: -1 });
    // Attempt index below its bound.
    trackAny("question_answered", {
      surface: "practice",
      question_id: "l1-bic-country",
      correct: true,
      attempt_index: 0,
    });

    expect(sink.events).toEqual([]);
  });
});
