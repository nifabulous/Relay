import { describe, it, expect } from "vitest";
import { relativeTime } from "./relativeTime";

const NOW = 1_000_000_000_000;

describe("relativeTime", () => {
  it("says just now under a minute", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now");
  });
  it("uses minutes then hours", () => {
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5 min ago");
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3 h ago");
  });
  it("falls back to a date beyond a day", () => {
    const out = relativeTime(NOW - 3 * 86_400_000, NOW);
    expect(out).not.toMatch(/ago|just now/);
  });
});
