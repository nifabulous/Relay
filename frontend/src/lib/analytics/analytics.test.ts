import { afterEach, describe, expect, it } from "vitest";
import {
  createTestSink,
  getAnalyticsSink,
  resetAnalyticsSink,
  setAnalyticsSink,
  track,
  type AnalyticsEventMap,
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

  it("accepts only the declared event names and object-literal properties", () => {
    // @ts-expect-error unknown event names are not part of the analytics contract
    track("unknown_event", {});

    const properties = {
      module_id: "lab-1",
    } satisfies AnalyticsEventMap["module_completed"];

    const invalidProperties = {
      module_id: "lab-1",
      // @ts-expect-error object-literal properties outside the allowlist are rejected
      account: "not-permitted",
    } satisfies AnalyticsEventMap["module_completed"];

    track("module_completed", properties);
    expect(invalidProperties.account).toBe("not-permitted");
  });
});
