import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "SsiQualityPage.css"),
  "utf8",
);

function mobileBlock(css: string): string {
  const mediaStart = css.indexOf("@media (max-width: 760px)");
  if (mediaStart < 0) throw new Error("SsiQualityPage.css: mobile media block is missing");
  const open = css.indexOf("{", mediaStart);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error("SsiQualityPage.css: mobile media block is unbalanced");
}

describe("SsiQualityPage responsive queue", () => {
  it("keeps the narrow queue as labelled stacked records", () => {
    const mobile = mobileBlock(CSS);

    expect(mobile).toContain(".ssi-quality__table tbody tr");
    expect(mobile).toContain("display: block");
    expect(mobile).toContain("content: attr(data-label)");
    expect(mobile).toContain("grid-template-columns: minmax(5.75rem, auto) minmax(0, 1fr)");
  });
});
