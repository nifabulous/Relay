import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLabCompletion } from "./useLabCompletion";

describe("useLabCompletion", () => {
  it("calls onComplete once after every required checkpoint", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useLabCompletion(["first", "second"], onComplete));

    act(() => result.current.markCheckpoint("first"));
    expect(onComplete).not.toHaveBeenCalled();

    act(() => result.current.markCheckpoint("second"));
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Duplicate checkpoint should not call again
    act(() => result.current.markCheckpoint("second"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown checkpoint IDs", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useLabCompletion(["a"], onComplete));

    act(() => result.current.markCheckpoint("unknown"));
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.completed.has("unknown")).toBe(false);
  });

  it("never auto-completes with an empty requirement set", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useLabCompletion([], onComplete));

    act(() => result.current.markCheckpoint("anything"));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("tracks completed checkpoints in a Set", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useLabCompletion(["a", "b"], onComplete));

    act(() => result.current.markCheckpoint("a"));
    expect(result.current.completed.has("a")).toBe(true);
    expect(result.current.completed.has("b")).toBe(false);
    expect(result.current.isReady).toBe(false);

    act(() => result.current.markCheckpoint("b"));
    expect(result.current.isReady).toBe(true);
  });
});
