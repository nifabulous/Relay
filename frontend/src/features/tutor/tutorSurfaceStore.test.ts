import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  publishTutorContext,
  clearTutorContext,
  readTutorContext,
  useTutorSurfaceContext,
} from "./tutorSurfaceStore";
import { buildLessonContext, buildSchemeContext } from "./tutorContext";

/**
 * The floating launcher lives in AppShell and has no idea what page is under
 * it. Pages publish their context here; the launcher reads it.
 *
 * The alternative — AppShell parsing the route to work out the module ID or
 * currency — would put a second, drifting copy of every page's routing
 * knowledge in the shell. This way the page that already holds the data is the
 * one that supplies it.
 */

beforeEach(() => {
  clearTutorContext();
});

describe("tutorSurfaceStore", () => {
  it("falls back to the global surface when no page has published", () => {
    // Every route must be able to open the tutor, including ones that publish
    // nothing. "Nothing published" is the common case, not an error.
    expect(readTutorContext()).toEqual({ surface: "global" });
  });

  it("returns whatever the current page published", () => {
    const lesson = buildLessonContext({ moduleId: "lab-4", moduleTitle: "Routing" });
    publishTutorContext(lesson);
    expect(readTutorContext()).toEqual(lesson);
  });

  it("clearing returns to the global surface", () => {
    publishTutorContext(buildSchemeContext({ currency: "GBP" }));
    clearTutorContext();
    expect(readTutorContext().surface).toBe("global");
  });

  it("a later publish replaces an earlier one", () => {
    publishTutorContext(buildLessonContext({ moduleId: "lab-1", moduleTitle: "A" }));
    publishTutorContext(buildLessonContext({ moduleId: "lab-2", moduleTitle: "B" }));
    expect(readTutorContext().module_id).toBe("lab-2");
  });

  it("returns a stable reference for an unchanged context", () => {
    /*
     * useSyncExternalStore calls the snapshot on every render and compares by
     * identity. A fresh object each time is an infinite re-render loop, which
     * is why this is asserted rather than assumed.
     */
    const first = readTutorContext();
    const second = readTutorContext();
    expect(first).toBe(second);
  });

  it("notifies subscribers when the context changes", () => {
    const { result } = renderHook(() => useTutorSurfaceContext());
    expect(result.current.surface).toBe("global");

    act(() => {
      publishTutorContext(buildLessonContext({ moduleId: "lab-6", moduleTitle: "Tracking" }));
    });
    expect(result.current.module_id).toBe("lab-6");
  });

  it("does not notify when the same context is published twice", () => {
    /*
     * Pages publish from an effect, so a re-render for an unrelated reason
     * republishes. Without this the launcher would re-render on every parent
     * render — and, worse, the panel's own context-identity check would see a
     * new object and drop the conversation mid-question.
     */
    let renders = 0;
    const lesson = buildLessonContext({ moduleId: "lab-1", moduleTitle: "A" });
    renderHook(() => {
      renders += 1;
      return useTutorSurfaceContext();
    });
    const before = renders;

    act(() => {
      publishTutorContext(lesson);
    });
    const afterFirst = renders;
    expect(afterFirst).toBeGreaterThan(before);

    act(() => {
      publishTutorContext({ ...lesson });
    });
    expect(renders).toBe(afterFirst);
  });
});
