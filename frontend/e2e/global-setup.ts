import { execFileSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";

/**
 * The e2e suite drives the BUILT bundle, not the dev server: `baseURL` is the
 * uvicorn app, which serves `app/static/relay` from disk. Nothing on the local
 * path rebuilds that, and `reuseExistingServer` can skip the webServer command
 * altogether, so a stale bundle silently replaces the code under test. That is
 * not hypothetical: the Explore deep-link test failed for three days against a
 * build predating the feature it asserts, was reported as a product defect
 * twice, and passed immediately once the bundle was rebuilt.
 *
 * CI already builds before invoking Playwright (.github/workflows/ci.yml), so
 * this only closes the local gap. E2E_SKIP_BUILD=1 opts out for a tight loop
 * against a build you just produced yourself.
 */
export default function globalSetup(config: FullConfig): void {
  if (process.env.CI || process.env.E2E_SKIP_BUILD === "1") {
    return;
  }
  execFileSync("npm", ["run", "build"], { stdio: "inherit", cwd: config.rootDir });
}
