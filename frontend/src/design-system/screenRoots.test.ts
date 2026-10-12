/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, "..", rel), "utf8");

// Phase 2 Task 6: the three route screens take the landing scope on the
// screen root itself, not only on the route wrapper inside it.
const ROOTS: Array<[string, string, RegExp]> = [
  ["Prepare", "features/operate/prepare/PreparePaymentPage.tsx", /<div className="surface-landing prepare-payment">/],
  ["Tracking", "features/operate/tracking/TrackingPage.tsx", /<div className="surface-landing tracking-page">/],
  ["Atlas", "features/explore/AtlasPage.tsx", /<div className="surface-landing explore atlas" data-view=/],
];

describe("landing scope on screen roots", () => {
  it.each(ROOTS)("%s root carries surface-landing", (_name, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  // The root already scopes the screen; a second scope inside it re-declares every token for nothing.
  it.each(ROOTS)("%s carries surface-landing on the root only, never nested", (_name, file) => {
    expect(read(file).match(/\bsurface-landing\b/g)).toHaveLength(1);
  });
});

// The scope stylesheet only applies if the screen module pulls it in. Each page is a
// lazy route, so importing it there keeps the scope out of the eager shell.
const SCOPE_CSS = resolve(here, "landing-scope.css");
const PAGES: Array<[string, string]> = [
  ["Prepare", "features/operate/prepare/PreparePaymentPage.tsx"],
  ["Tracking", "features/operate/tracking/TrackingPage.tsx"],
  ["Atlas", "features/explore/AtlasPage.tsx"],
];

describe("landing scope stylesheet reaches each route screen", () => {
  it.each(PAGES)("%s imports a path that resolves to design-system/landing-scope.css", (_name, file) => {
    const source = read(file);
    const specs = [...source.matchAll(/^import\s+["']([^"']+\.css)["'];?$/gm)].map((m) => m[1]);
    const resolved = specs.map((spec) => resolve(dirname(resolve(here, "..", file)), spec));
    expect(resolved).toContain(SCOPE_CSS);
    expect(existsSync(SCOPE_CSS)).toBe(true);
  });

  it("the stylesheet defines the scope and the remap the screens rely on", () => {
    const css = readFileSync(SCOPE_CSS, "utf8");
    expect(css).toMatch(/^\.surface-landing\s*\{/m);
    expect(css).toMatch(/--color-surface:\s*var\(--surface\)/);
  });

  it("sets Geist as the font for all text inside the scope, not only headings", () => {
    const css = readFileSync(SCOPE_CSS, "utf8");
    const block = css.match(/^\.surface-landing\s*\{([^}]*)\}/m);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/font-family:\s*var\(--font-sans\)/);
  });
});
