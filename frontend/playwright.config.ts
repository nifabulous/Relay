import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  // Seven viewport projects share one webServer, so a `networkidle` goto can
  // exceed Playwright's 30s default while other projects are hammering the same
  // uvicorn. The failure moved between tests and projects run to run — always a
  // navigation timeout, never an assertion — so the budget is the problem, not
  // any one test. The three full-pipeline tests keep their own 120s overrides.
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
    },
    // ─── Case Desk viewport matrix ───────────────────────────────────────────
    // Four explicitly-named projects that exercise the supplier-case journey
    // across the target device widths. The case-desk.spec.ts suite asserts the
    // per-viewport invariants (no horizontal scroll, ≥44px tap targets, keyboard
    // traversal, labelled sheet, focus restoration, live announcements) inside
    // each of these viewports. All projects run the whole e2e/ tree — the case
    // journey's per-viewport tests simply run in four widths, while the legacy
    // explore/learn/prepare suites run once per project (acceptable cost).
    {
      name: "case-mobile-390",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "case-tablet-768",
      use: {
        browserName: "chromium",
        viewport: { width: 768, height: 844 },
      },
    },
    {
      name: "case-desktop-1024",
      use: {
        browserName: "chromium",
        viewport: { width: 1024, height: 900 },
      },
    },
    {
      name: "case-wide-1440",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    // ─── Reduced motion ───────────────────────────────────────────────────────
    // Emulates prefers-reduced-motion: reduce for the case journey. The case's
    // animations are token-driven (tokens.css zeroes durations under reduced
    // motion); this project verifies the journey still completes (transitions
    // do not block) when the user has reduced motion enabled.
    {
      name: "case-reduced-motion",
      use: {
        browserName: "chromium",
        viewport: { width: 1024, height: 900 },
        reducedMotion: "reduce",
      },
    },
  ],
  webServer: {
    // Start from the repository root so the shared launcher can resolve the
    // current worktree's environment, a linked worktree's common .venv, or uv's
    // project environment. reuseExistingServer still lets a developer-run
    // uvicorn (or a prior run) short-circuit the spawn.
    cwd: "..",
    command: "./scripts/run_e2e_server.sh",
    url: "http://127.0.0.1:8000/api/health",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
