import { describe, expect, it } from "vitest";
import { resolveSentryRelease } from "./sentryRelease";

describe("Sentry release configuration", () => {
  it("normalizes the same release value for runtime and build configuration", () => {
    expect(resolveSentryRelease("  vercel-3a4d130  ")).toBe("vercel-3a4d130");
  });

  it("fails closed for unsafe or oversized release values", () => {
    expect(resolveSentryRelease("release with spaces")).toBeUndefined();
    expect(resolveSentryRelease("x".repeat(129))).toBeUndefined();
  });
});
