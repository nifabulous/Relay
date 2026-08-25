import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("production bundle budget", () => {
  it("checks the generated public assets", () => {
    const htmlPath = resolve(
      process.cwd(),
      "../app/static/relay/index.html",
    );
    expect(existsSync(htmlPath)).toBe(true);

    expect(() =>
      execFileSync("node", ["scripts/check-bundle.mjs"], {
        cwd: process.cwd(),
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
