import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkLandingBuild } from "./check-landing-build.mjs";

describe("check-landing-build", () => {
  it("reports a missing build instead of passing", () => {
    expect(checkLandingBuild(mkdtempSync(join(tmpdir(), "landing-dist-")))).toHaveLength(1);
  });

  it("fails on source maps and leftover markers", () => {
    const dist = mkdtempSync(join(tmpdir(), "landing-dist-"));
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "landing.html"), "<!doctype html><!--landing-body-->");
    writeFileSync(join(dist, "assets", "landing-1.js"), "x");
    writeFileSync(join(dist, "assets", "landing-1.js.map"), "{}");
    writeFileSync(join(dist, "assets", "globe-points-1.json"), "[]");
    const failures = checkLandingBuild(dist);
    expect(failures).toContain("source maps present");
    expect(failures).toContain("an unreplaced <!--landing-...--> marker remains");
  });
});
