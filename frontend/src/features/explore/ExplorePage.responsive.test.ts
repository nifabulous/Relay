import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ExplorePage.css"),
  "utf8",
);

function mobileBlock(css: string): string {
  const mediaStart = css.indexOf("@media (max-width: 768px)");
  if (mediaStart < 0) throw new Error("ExplorePage.css: mobile media block is missing");
  const open = css.indexOf("{", mediaStart);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error("ExplorePage.css: mobile media block is unbalanced");
}

describe("ExplorePage responsive controls", () => {
  it("keeps the bank lookup input at the shared touch-target height in a column form", () => {
    const mobile = mobileBlock(CSS);
    const inputRule = mobile.match(/\.explore__bank-input\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(inputRule).toContain("flex: 0 1 auto");
    expect(inputRule).toContain("min-height: 44px");
  });
});
