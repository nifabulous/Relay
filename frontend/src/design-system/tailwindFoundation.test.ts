import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentsConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "components.json"), "utf8"),
) as {
  aliases: Record<string, string>;
};
const tsconfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "tsconfig.json"), "utf8"),
) as {
  compilerOptions: { paths: Record<string, string[]> };
};
const globalCss = readFileSync(
  resolve(process.cwd(), "src/design-system/global.css"),
  "utf8",
);
const cossThemeCss = readFileSync(
  resolve(process.cwd(), "src/design-system/coss-theme.css"),
  "utf8",
);

describe("Tailwind foundation", () => {
  it("imports theme and utilities without importing Preflight", () => {
    expect(globalCss).toContain('@import "tailwindcss/theme.css"');
    expect(globalCss).toContain('@import "tailwindcss/utilities.css"');
    expect(globalCss).not.toContain('@import "tailwindcss"');
    expect(globalCss).not.toContain("preflight.css");
    expect(globalCss).toContain('source("../")');
    expect(cossThemeCss).toContain('--font-sans: var(--coss-font-sans)');
    expect(cossThemeCss).toContain('--font-heading: var(--coss-font-heading)');
    expect(cossThemeCss).toContain('--font-mono: var(--coss-font-mono)');
    expect(cossThemeCss).toContain('@custom-variant relay-dark');
    expect(cossThemeCss).toContain('[data-theme="dark"]');
    expect(cossThemeCss).not.toMatch(/\.dark\b/);
    expect(globalCss).toContain(":focus-visible");
    expect(globalCss).toContain("outline: 2px solid var(--color-action)");
    expect(globalCss).toContain("outline-offset: 2px");
  });

  it("keeps Relay base rules after the Tailwind layer imports", () => {
    const utilityImport = globalCss.indexOf("tailwindcss/utilities.css");
    const relayBaseRule = globalCss.indexOf("box-sizing");

    expect(utilityImport).toBeGreaterThanOrEqual(0);
    expect(relayBaseRule).toBeGreaterThan(utilityImport);
  });

  it("keeps registry output and TypeScript aliases aligned", () => {
    expect(componentsConfig.aliases.components).toBe("@/design-system/coss");
    expect(componentsConfig.aliases.ui).toBe("@/design-system/coss");
    expect(componentsConfig.aliases.utils).toBe("@/lib/coss/cn");
    expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["./src/*"]);
  });
});
