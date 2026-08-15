import { describe, it, expect } from "vitest";
import { TutorContextSchema } from "../../api/schemas";
import {
  buildLessonContext,
  buildSchemeContext,
  buildTrackingContext,
  contextIdentity,
} from "./tutorContext";

/**
 * Context builders are the only thing that decides what leaves the browser.
 *
 * The rule they enforce: an explicit, named allowlist of fields. Nothing here
 * serialises a component's props, an API response, or form state — a builder
 * that spread an object would carry whatever that object grows next, silently,
 * on the next release.
 */

describe("buildLessonContext", () => {
  it("carries the module identity and nothing else", () => {
    const context = buildLessonContext({
      moduleId: "lab-6",
      moduleTitle: "Did It Arrive? Tracking with UETR",
      topic: "uetr",
    });
    expect(context).toEqual({
      surface: "lesson",
      module_id: "lab-6",
      module_title: "Did It Arrive? Tracking with UETR",
      topic: "uetr",
    });
  });

  it("produces a context the API schema accepts", () => {
    expect(() =>
      TutorContextSchema.parse(buildLessonContext({ moduleId: "lab-1", moduleTitle: "X" })),
    ).not.toThrow();
  });

  it("bounds an over-long title rather than letting the request 422", () => {
    const context = buildLessonContext({
      moduleId: "lab-1",
      moduleTitle: "T".repeat(500),
    });
    expect(context.module_title!.length).toBeLessThanOrEqual(200);
  });

  it("omits an absent topic instead of sending an empty string", () => {
    // An empty string is a value the backend has to interpret; absence is not.
    expect(buildLessonContext({ moduleId: "lab-1", moduleTitle: "X" }).topic).toBeUndefined();
  });
});

describe("buildTrackingContext", () => {
  it("summarises only what is already visible on screen", () => {
    const context = buildTrackingContext({
      status: "In progress",
      eventNames: ["Created", "Sent to correspondent", "Compliance review"],
      currency: "USD",
      amount: "1,000.00",
    });
    expect(context.surface).toBe("tracking");
    expect(context.currency).toBe("USD");
    expect(context.result_summary).toContain("In progress");
    expect(context.result_summary).toContain("Compliance review");
  });

  it("never carries the tracking identifier", () => {
    // The UETR identifies one specific transaction. The tutor explains what a
    // timeline *means*; it has no reason to know which payment it belongs to,
    // and the MVP performs no live lookup that would need it.
    const context = buildTrackingContext({
      status: "In progress",
      eventNames: ["Created"],
      currency: "USD",
      amount: "10.00",
      uetr: "97ed4827-7b6f-4491-a06f-b548d5a7512d",
    } as never);
    expect(JSON.stringify(context)).not.toContain("97ed4827");
  });

  it("bounds a long event list so the summary cannot grow without limit", () => {
    const context = buildTrackingContext({
      status: "In progress",
      eventNames: Array.from({ length: 200 }, (_, index) => `Event number ${index}`),
      currency: "USD",
      amount: "1.00",
    });
    expect(context.result_summary!.length).toBeLessThanOrEqual(600);
  });

  it("produces a context the API schema accepts", () => {
    expect(() =>
      TutorContextSchema.parse(
        buildTrackingContext({
          status: "Credited",
          eventNames: ["Created", "Credited"],
          currency: "EUR",
          amount: "5.00",
        }),
      ),
    ).not.toThrow();
  });
});

describe("buildSchemeContext", () => {
  it("carries the currency and rail identity", () => {
    const context = buildSchemeContext({
      currency: "GBP",
      railName: "CHAPS",
      summary: "Same-day high value, no practical ceiling.",
    });
    expect(context.surface).toBe("scheme");
    expect(context.currency).toBe("GBP");
    expect(context.rail_name).toBe("CHAPS");
  });

  it("works for a currency overview with no rail selected", () => {
    const context = buildSchemeContext({ currency: "CAD" });
    expect(context.rail_name).toBeUndefined();
    expect(() => TutorContextSchema.parse(context)).not.toThrow();
  });
});

describe("contextIdentity", () => {
  /**
   * The identity decides when a conversation is still about the same thing.
   * Get it wrong in one direction and history follows the learner onto an
   * unrelated page, where the model answers the previous page's question. Get
   * it wrong in the other and the thread resets mid-conversation.
   */
  it("is stable across two contexts describing the same resource", () => {
    const first = buildLessonContext({ moduleId: "lab-1", moduleTitle: "Identifiers" });
    const second = buildLessonContext({ moduleId: "lab-1", moduleTitle: "Identifiers" });
    expect(contextIdentity(first)).toBe(contextIdentity(second));
  });

  it("changes when the module changes", () => {
    expect(
      contextIdentity(buildLessonContext({ moduleId: "lab-1", moduleTitle: "A" })),
    ).not.toBe(contextIdentity(buildLessonContext({ moduleId: "lab-2", moduleTitle: "B" })));
  });

  it("changes when the rail changes within one currency", () => {
    expect(contextIdentity(buildSchemeContext({ currency: "GBP", railName: "CHAPS" }))).not.toBe(
      contextIdentity(buildSchemeContext({ currency: "GBP", railName: "Bacs" })),
    );
  });

  it("ignores the result summary, which changes on every poll", () => {
    // Tracking summaries update as events arrive. Including them would reset
    // the conversation every few seconds, mid-question.
    const first = buildTrackingContext({
      status: "In progress",
      eventNames: ["Created"],
      currency: "USD",
      amount: "1.00",
    });
    const second = buildTrackingContext({
      status: "In progress",
      eventNames: ["Created", "Sent"],
      currency: "USD",
      amount: "1.00",
    });
    expect(contextIdentity(first)).toBe(contextIdentity(second));
  });
});
