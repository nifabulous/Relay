/// <reference types="node" />
// tsconfig's `types` array is deliberately narrow, so node builtins are not
// ambient. This test reads the shipped stylesheet from disk, so it pulls the
// node types in explicitly — the same mechanism src/vite-env.d.ts uses for
// vite/client. (Node-only APIs; this file never ships to the browser.)
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * WCAG 2.2 AA contrast verification for semantic color tokens.
 *
 * DESIGN.md: "All text and interactive boundaries meet WCAG 2.2 AA contrast."
 *
 * Token values are PARSED OUT OF tokens.css rather than mirrored as a
 * TypeScript literal. The mirror this file used to carry could silently
 * disagree with the shipped stylesheet, and adding a second (dark) palette
 * would have doubled that risk. Parsing means the test cannot pass against
 * values the app does not actually ship.
 */

// ─── Contrast maths (relative luminance per WCAG 2.x) ───────────────────────

function srgbToLin(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── tokens.css parsing ─────────────────────────────────────────────────────

// Read the stylesheet exactly as shipped. Note the indirection through
// fileURLToPath: under the jsdom environment the global `URL` is jsdom's, and
// readFileSync rejects it ("The URL must be of scheme file"), so the URL has to
// be converted to a plain path first. Anchoring on import.meta.url rather than
// process.cwd() keeps this correct regardless of where vitest is invoked from.
const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "tokens.css"), "utf8");
const COSS_THEME_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "coss-theme.css"),
  "utf8",
);
const FLOATING_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../features/tutor/FloatingTutorLauncher.css"),
  "utf8",
);
const TUTOR_PANEL_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../features/tutor/TutorPanel.css"),
  "utf8",
);

/**
 * Return the body of the block whose opening selector matches `opener`,
 * using brace matching so nested blocks (a selector inside @media) are kept.
 * Throws when the selector is absent — an absent dark block must surface as a
 * failure, never as a silent fallback to the light palette.
 */
function blockBody(css: string, opener: RegExp): string {
  const match = opener.exec(css);
  if (!match) throw new Error(`tokens.css: no block matching ${opener}`);

  const open = css.indexOf("{", match.index);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`tokens.css: unbalanced braces after ${opener}`);
}

type Tokens = Record<string, string>;

function declarations(body: string): Tokens {
  const out: Tokens = {};
  const decl = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(body)) !== null) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

// The complete light palette lives on the bare, column-0 `:root`. Anchoring to
// the start of a line is what distinguishes it from the indented `:root`
// blocks nested inside the media queries.
const LIGHT = declarations(blockBody(CSS, /^:root\s*\{/m));

// Dark, as reached by the OS preference. Guarded with :not([data-theme="light"])
// so an explicit light choice wins over a dark OS.
const DARK_MEDIA = declarations(
  blockBody(
    blockBody(CSS, /^@media \(prefers-color-scheme: dark\)\s*\{/m),
    /:root:not\(\[data-theme="light"\]\)\s*\{/,
  ),
);

// Dark, as reached by an explicit choice. Parsed LAZILY: if this block is
// missing the toggle is broken, but the palette itself is still measurable, so
// that must fail the one parity test rather than collapsing the whole file.
function darkExplicit(): Tokens {
  return declarations(blockBody(CSS, /^:root\[data-theme="dark"\]\s*\{/m));
}

// The OLED variant: an explicit-only palette with neutral true-black surfaces.
// It has no OS media counterpart, so there is no parity twin — it is measured
// directly against the same AA pairs as the dark palette below.
const BLACK_EXPLICIT = declarations(
  blockBody(CSS, /^:root\[data-theme="black"\]\s*\{/m),
);
/** How the cascade resolves in the black theme: its redefinitions over light. */
const BLACK: Tokens = { ...LIGHT, ...BLACK_EXPLICIT };

/**
 * How the cascade actually resolves: a dark block redefines only the tokens
 * that change, everything else falls through to the bare `:root`. Resolving
 * the same way means a pairing is checked against the value that really paints.
 */
const DARK: Tokens = { ...LIGHT, ...DARK_MEDIA };

function ratio(scope: Tokens, fg: string, bg: string): number {
  const fgHex = scope[fg];
  const bgHex = scope[bg];
  if (!/^#[0-9a-f]{6}$/i.test(fgHex ?? "")) throw new Error(`not a hex token: ${fg}=${fgHex}`);
  if (!/^#[0-9a-f]{6}$/i.test(bgHex ?? "")) throw new Error(`not a hex token: ${bg}=${bgHex}`);
  return contrastRatio(fgHex, bgHex);
}

// ─── Light palette (the shipped palette — must not move) ────────────────────

describe("WCAG 2.2 AA contrast for semantic tokens", () => {
  it("success text on success-bg meets 4.5:1", () => {
    expect(ratio(LIGHT, "--color-success", "--color-success-bg")).toBeGreaterThanOrEqual(4.5);
  });

  it("warning text on warning-bg meets 4.5:1", () => {
    expect(ratio(LIGHT, "--color-warning", "--color-warning-bg")).toBeGreaterThanOrEqual(4.5);
  });

  it("danger text on danger-bg meets 4.5:1", () => {
    expect(ratio(LIGHT, "--color-danger", "--color-danger-bg")).toBeGreaterThanOrEqual(4.5);
  });

  it("ink-muted on surface-3 meets 4.5:1", () => {
    expect(ratio(LIGHT, "--color-ink-muted", "--color-surface-3")).toBeGreaterThanOrEqual(4.5);
  });

  it("ink-strong on surface meets 7:1 (AAA)", () => {
    expect(ratio(LIGHT, "--color-ink-strong", "--color-surface")).toBeGreaterThanOrEqual(7);
  });

  it("action text on action-surface meets 4.5:1 (preferred StatusChip)", () => {
    // Regression guard for the `--action` modifier used by the `preferred`
    // StatusChip. The action blue on its tinted surface is the chip's
    // foreground/background pair; ~5.43:1 today, AA requires 4.5:1.
    expect(ratio(LIGHT, "--color-action", "--color-action-surface")).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The light palette is the shipped palette. Adding dark must not move it by
   * a single byte, and "it still passes AA" is too weak a check to prove that
   * — a value can change and still clear 4.5:1. So pin the exact hexes.
   *
   * If you are here because this failed: adding or changing a colour on the
   * bare :root is a deliberate design decision, not a drive-by. Update this
   * map only alongside that decision.
   */
  it("pins every light colour token to its shipped value", () => {
    const lightColors = Object.fromEntries(
      Object.entries(LIGHT).filter(([token]) => token.startsWith("--color-")),
    );

    expect(lightColors).toEqual({
      "--color-action": "#3157d5",
      "--color-action-hover": "#2848b8",
      "--color-action-pressed": "#1f3aa0",
      "--color-action-surface": "#eef2fc",
      "--color-action-border": "#c3d0f5",
      "--color-on-action": "#ffffff",
      "--color-on-danger": "#ffffff",
      "--color-danger-hover": "#8a2530",
      "--color-ink-strong": "#16233d",
      "--color-ink": "#2d3a52",
      "--color-ink-muted": "#586273",
      "--color-canvas": "#f6f8fc",
      "--color-surface": "#ffffff",
      "--color-surface-2": "#f0f3f9",
      "--color-surface-3": "#e6eaf2",
      "--color-border": "#dce2eb",
      "--color-border-strong": "#c4cdd9",
      "--color-floating-border": "#667085",
      "--color-success": "#0e5c44",
      "--color-success-bg": "#e8f6ef",
      "--color-success-border": "#a3d9c4",
      "--color-warning": "#9a5a0c",
      "--color-warning-bg": "#fdf4e6",
      "--color-warning-border": "#f0d4a0",
      "--color-danger": "#9e2b34",
      "--color-danger-bg": "#fcecef",
      "--color-danger-border": "#f0b8be",
    });
  });
});

// ─── Dark palette ───────────────────────────────────────────────────────────

const DARK_TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["--color-ink-strong", "--color-canvas"],
  ["--color-ink-strong", "--color-surface"],
  ["--color-ink-strong", "--color-surface-2"],
  ["--color-ink-strong", "--color-surface-3"],
  ["--color-ink", "--color-canvas"],
  ["--color-ink", "--color-surface"],
  ["--color-ink", "--color-surface-2"],
  ["--color-ink", "--color-surface-3"],
  ["--color-ink-muted", "--color-canvas"],
  ["--color-ink-muted", "--color-surface"],
  ["--color-ink-muted", "--color-surface-2"],
  ["--color-ink-muted", "--color-surface-3"],
  ["--color-action", "--color-canvas"],
  ["--color-action", "--color-surface"],
  ["--color-action", "--color-action-surface"],
  ["--color-on-action", "--color-action"],
  ["--color-success", "--color-success-bg"],
  ["--color-warning", "--color-warning-bg"],
  ["--color-danger", "--color-danger-bg"],
];

describe("WCAG 2.2 AA contrast for the dark palette", () => {
  it.each(DARK_TEXT_PAIRS)("dark %s on %s meets 4.5:1", (fg, bg) => {
    expect(ratio(DARK, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("ink-strong on surface still meets 7:1 (AAA), as in light", () => {
    expect(ratio(DARK, "--color-ink-strong", "--color-surface")).toBeGreaterThanOrEqual(7);
  });

  /**
   * Elevation, not a text ratio — so AA does not apply and 1.15 is a
   * legibility floor, not a WCAG figure.
   *
   * DESIGN.md bans decorative shadows, which means the ONLY thing separating a
   * card from the page behind it is the canvas/surface luminance step. In dark
   * palettes that step compresses badly; the supplied values landed at 1.09,
   * which reads as a single flat sheet.
   *
   * Dark only. The light palette ships at 1.06 and is explicitly out of scope
   * here — light has near-white surfaces and thin structural borders doing the
   * separating, and changing it is forbidden.
   */
  it("keeps a perceptible canvas-to-surface elevation step (>= 1.15)", () => {
    expect(ratio(DARK, "--color-canvas", "--color-surface")).toBeGreaterThanOrEqual(1.15);
  });
});

// ─── Black (OLED) palette ───────────────────────────────────────────────────

describe("WCAG 2.2 AA contrast for the black palette", () => {
  // Same pairs, same bar: the OLED variant changes the neutrals, not the rules.
  it.each(DARK_TEXT_PAIRS)("black %s on %s meets 4.5:1", (fg, bg) => {
    expect(ratio(BLACK, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the same canvas-to-surface elevation floor as dark (>= 1.15)", () => {
    expect(ratio(BLACK, "--color-canvas", "--color-surface")).toBeGreaterThanOrEqual(1.15);
  });

  // The black block may only REDEFINE tokens that exist in light — a token
  // reachable solely in the OLED theme would render nothing in the others.
  it("never introduces a token that exists only in black", () => {
    const blackOnly = Object.keys(BLACK_EXPLICIT).filter((token) => !(token in LIGHT));
    expect(blackOnly).toEqual([]);
  });
});

// ─── Structural guards on the selector strategy ─────────────────────────────

describe("dark palette selector structure", () => {
  /**
   * THE bug this two-block structure exists to prevent. A token whose only
   * dark definition sits inside `@media (prefers-color-scheme: dark)` looks
   * perfect to anyone developing on a dark OS — and silently keeps its LIGHT
   * value for anyone who picks dark from the toggle on a light OS. The failure
   * is invisible in the common case, which is exactly why it needs a test.
   */
  it("defines the same tokens, with the same values, in both dark blocks", () => {
    expect(darkExplicit()).toEqual(DARK_MEDIA);
  });

  /**
   * A dark-only token has no light value to fall back to, so it resolves to
   * nothing in light mode and whatever it lands on renders unstyled.
   */
  it("never introduces a token that exists only in dark", () => {
    const darkOnly = Object.keys(DARK_MEDIA).filter((token) => !(token in LIGHT));
    expect(darkOnly).toEqual([]);
  });
});

describe("Coss token bridge", () => {
  it("maps semantic aliases to Relay tokens without hard-coded theme values", () => {
    expect(CSS).toContain("--background: var(--color-canvas);");
    expect(CSS).toContain("--primary: var(--color-action);");
    expect(CSS).toContain("--border: var(--color-border);");
    expect(CSS).toContain("--ring: var(--color-action);");
    expect(CSS).toContain("--coss-radius-sm: var(--radius-control);");
    expect(CSS).toContain("--coss-radius-md: var(--radius-control);");
    expect(CSS).toContain("--coss-radius-lg: var(--radius-region);");
    expect(CSS).toContain("--coss-radius-xl: var(--radius-region);");
    expect(CSS).toContain("--coss-font-sans: var(--font-ui);");
    expect(CSS).toContain("--coss-font-heading: var(--font-ui);");
    expect(CSS).toContain("--coss-font-mono: var(--font-mono);");
    expect(CSS).toContain("--success: var(--color-success);");
    expect(CSS).toContain("--warning: var(--color-warning);");
    expect(CSS).toContain("--info: var(--color-action);");
  });

  it("keeps the Relay light and dark token blocks present", () => {
    expect(CSS).toMatch(/^:root\s*\{/m);
    expect(CSS).toContain('@media (prefers-color-scheme: dark)');
    expect(CSS).toMatch(/^:root\[data-theme="dark"\]\s*\{/m);
  });

  it("maps the Coss theme namespace back to the semantic bridge", () => {
    expect(COSS_THEME_CSS).toContain("--font-sans: var(--coss-font-sans);");
    expect(COSS_THEME_CSS).toContain("--font-heading: var(--coss-font-heading);");
    expect(COSS_THEME_CSS).toContain("--font-mono: var(--coss-font-mono);");
    expect(COSS_THEME_CSS).toContain('@custom-variant relay-dark');
    expect(COSS_THEME_CSS).toContain('[data-theme="dark"]');
  });
});

// ── Review fix: CT2 ─────────────────────────────────────────────────────────

describe("floating surface elevation", () => {
  /*
   * A drop shadow only reads as depth when it is darker than its backdrop. The
   * approved elevation used #1d2433 against a #080b12 dark canvas, which is
   * 5.3x lighter — it could not work, and the review that approved it was shown
   * a light-mode board only. This pins the rule so the next elevation decision
   * cannot repeat that: on dark, elevation lifts the surface instead.
   */
  it("dark elevation lifts the surface rather than casting a lighter shadow", () => {
    const canvas = luminance("#080b12");
    const raised = luminance("#1c2740"); // --color-surface-2, dark
    expect(raised).toBeGreaterThan(canvas);
  });

  it("a shadow colour is only usable where it is darker than the canvas", () => {
    const shadow = luminance("#1d2433");
    expect(luminance("#f6f8fc")).toBeGreaterThan(shadow); // light: valid
    expect(luminance("#080b12")).toBeLessThan(shadow); // dark: inverted
  });

  it("uses the approved high-contrast boundary on the actual floating selectors", () => {
    expect(FLOATING_CSS).toMatch(
      /\.tutor-fab[\s\S]*?border:\s*1px solid var\(--color-floating-border\)/,
    );
    expect(FLOATING_CSS).toMatch(
      /\.tutor-floating-panel[\s\S]*?border:\s*1px solid var\(--color-floating-border\)/,
    );
    expect(FLOATING_CSS).toMatch(
      /\.tutor-floating-panel__close[\s\S]*?border:\s*1px solid var\(--color-floating-border\)/,
    );
    expect(TUTOR_PANEL_CSS).toMatch(
      /\.tutor-panel__feedback-button[\s\S]*?border:\s*1px solid var\(--color-floating-border\)/,
    );
    expect(TUTOR_PANEL_CSS).toMatch(
      /\.tutor-panel__input[\s\S]*?border:\s*1px solid var\(--color-floating-border\)/,
    );
    expect(ratio(LIGHT, "--color-floating-border", "--color-surface")).toBeGreaterThanOrEqual(3);
    expect(ratio(DARK, "--color-floating-border", "--color-surface-2")).toBeGreaterThanOrEqual(3);
  });

  it("caps the mobile tutor sheet so the page behind remains usable", () => {
    const mobileCss = FLOATING_CSS.split("@media (min-width: 1024px)")[0];
    expect(mobileCss).toMatch(/top:\s*auto;/);
    expect(mobileCss).toMatch(/height:\s*min\([\s\S]*70dvh[\s\S]*var\(--sim-banner-height\)/);
    expect(mobileCss).toMatch(/max-height:\s*calc\([\s\S]*var\(--sim-banner-height\)/);
  });
});
