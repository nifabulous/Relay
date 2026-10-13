/// <reference types="node" />
// tsconfig's `types` array is deliberately narrow, so node builtins are not
// ambient. This test reads the shipped stylesheet from disk, so it pulls the
// node types in explicitly — the same mechanism src/vite-env.d.ts uses for
// vite/client. (Node-only APIs; this file never ships to the browser.)
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { contrastRatio, luminance } from "../test/contrast";

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

/** Paint a hex or rgba() colour over an opaque hex backdrop, returning #rrggbb. */
function composite(colour: string, backdrop: string): string {
  if (/^#[0-9a-f]{6}$/i.test(colour)) return colour;
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(colour);
  if (!m || !/^#[0-9a-f]{6}$/i.test(backdrop)) throw new Error(`cannot composite ${colour} over ${backdrop}`);
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  const under = [1, 3, 5].map((i) => parseInt(backdrop.slice(i, i + 2), 16));
  const mixed = [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * alpha + under[k] * (1 - alpha)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

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

describe("landing scope", () => {
  const scopeCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "landing-scope.css"), "utf8");

  it("defines the landing tokens only under .surface-landing, never on :root", () => {
    expect(scopeCss).not.toMatch(/^:root\s*\{/m);
    expect(scopeCss).toMatch(/\.surface-landing\s*\{/);
  });

  it("keeps the clashing names inside the scope", () => {
    for (const name of ["--font-mono", "--muted"]) {
      expect(scopeCss).toContain(`${name}:`);
    }
  });

  // Scoped component overrides: every selector must sit under .surface-landing.
  const SCOPED_SELECTORS = [
    ".relay-btn--primary",
    ".relay-btn--primary:hover",
    ".relay-btn--secondary",
    ".status-chip",
    ".status-chip--success",
    ".status-chip--warning",
    ".status-chip--danger",
    ".status-chip--muted",
    ".status-chip--action",
    ".status-chip .status-chip__icon",
  ];

  it.each(SCOPED_SELECTORS)("scopes %s under .surface-landing", (selector) => {
    const escaped = selector.replace(/[.:]/g, "\\$&");
    expect(scopeCss).toMatch(new RegExp(`\\.surface-landing\\s+${escaped}\\s*[,{]`));
  });

  it("never styles a shared component outside .surface-landing", () => {
    expect(scopeCss).not.toMatch(/^\s*(\.relay-btn|\.status-chip|h[1-3]\b)/m);
  });

  // theme.ts sets data-theme on documentElement only. A selector that reads data-theme on the
  // scope element itself never sees the explicit choice, so explicit light under a dark OS rendered dark.
  it("never reads data-theme on the scope element itself", () => {
    expect(scopeCss).not.toMatch(/\.surface-landing:not\(/);
    expect(scopeCss).not.toMatch(/\.surface-landing\[data-theme/);
  });

  it("orders the theme blocks so black wins over the OS-dark block", () => {
    const media = scopeCss.indexOf("@media (prefers-color-scheme: dark)");
    const dark = scopeCss.search(/^:root\[data-theme="dark"\]\s+\.surface-landing\s*\{/m);
    const black = scopeCss.search(/^:root\[data-theme="black"\]\s+\.surface-landing\s*\{/m);
    expect(media).toBeGreaterThanOrEqual(0);
    expect(dark).toBeGreaterThan(media);
    expect(black).toBeGreaterThan(dark);
  });

  it("follows the app theme set on the document root", () => {
    expect(scopeCss).toMatch(/:root\[data-theme="dark"\]\s+\.surface-landing\b/);
    expect(scopeCss).toMatch(/:root\[data-theme="black"\]\s+\.surface-landing\b/);
    expect(scopeCss).toMatch(/:root:not\(\[data-theme="light"\]\)\s+\.surface-landing\b/);
  });

  // Resolve the scope's tokens the way the cascade does: the bare block, then the theme's redefinitions.
  function scopeTokens(opener: RegExp | null): Tokens {
    const base = declarations(blockBody(scopeCss, /^\.surface-landing\s*\{/m));
    const theme = opener ? declarations(blockBody(scopeCss, opener)) : {};
    const merged: Tokens = { ...base, ...theme };
    const resolve = (value: string): string => {
      const m = /^var\((--[\w-]+)\)$/.exec(value);
      // An undefined target stays as the unresolved var(), so the test that checks it can fail by name.
      return m && merged[m[1]] !== undefined ? resolve(merged[m[1]]) : value;
    };
    return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, resolve(v)]));
  }
  const THEMES: Array<[string, Tokens]> = [
    ["light", scopeTokens(null)],
    ["dark", scopeTokens(/^:root\[data-theme="dark"\]\s+\.surface-landing\s*\{/m)],
    ["black", scopeTokens(/^:root\[data-theme="black"\]\s+\.surface-landing\s*\{/m)],
  ];
  const TEXT_PAIRS: Array<[string, string, number]> = [
    ["--onAcc", "--accFill", 4.5], // primary button
    ["--onAcc", "--accFillHover", 4.5], // primary button hover
    ["--ink", "--surface", 4.5], // secondary button and headings
    ["--ok", "--surface", 4.5], // success chip
    ["--warn", "--surface", 4.5], // warning chip
    ["--bad", "--surface", 4.5], // danger chip
    ["--muted", "--surface", 4.5], // muted chip
    ["--accInk", "--surface", 4.5], // action chip
    // The route itself sits on the page canvas: stop roles, details, names and status text.
    ["--muted", "--bg", 4.5],
    ["--ink2", "--bg", 4.5],
    ["--ok", "--bg", 4.5],
    ["--warn", "--bg", 4.5],
    ["--bad", "--bg", 4.5],
  ];

  describe.each(THEMES)("%s theme text pairs", (_name, tokens) => {
    it.each(TEXT_PAIRS)("%s on %s is at least %f:1", (fg, bg, min) => {
      expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(min);
    });
  });

  // ── App-token remap: shared components read the app's names; the scope re-points them. ──
  const REMAP_OPEN = "/* app-token remap: start */";
  const REMAP_CLOSE = "/* app-token remap: end */";
  const remapBlock = (): string => {
    const a = scopeCss.indexOf(REMAP_OPEN);
    const b = scopeCss.indexOf(REMAP_CLOSE);
    if (a < 0 || b < a) throw new Error("landing-scope.css: app-token remap markers missing");
    return scopeCss.slice(a + REMAP_OPEN.length, b);
  };

  // Every var(--x) the screens' CSS and TSX read, intersected with the names tokens.css and
  // coss-theme.css define. Non-colour, non-font tokens have no landing equivalent and stay on :root;
  // --font-sans, --font-mono and --muted are defined natively by the scope already.
  const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : /\.(css|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
    );
  const NOT_REMAPPED =
    /^--(space|text|leading|tracking|radius|coss-radius|duration|ease|nav|mobile|floating|sim|reading|content|font-sans|font-mono|muted$)/;
  const used = new Set<string>();
  for (const dir of ["design-system", "features/operate", "features/explore"]) {
    for (const file of walk(join(srcRoot, dir))) {
      for (const m of readFileSync(file, "utf8").matchAll(/var\((--[\w-]+)/g)) used.add(m[1]);
    }
  }
  // tokens.css :root also carries the shadcn names (--card, --border, ...); coss-theme.css only
  // maps them into Tailwind's @theme and defines no custom properties of its own.
  const defined = new Set(Object.keys(declarations(blockBody(CSS, /^:root\s*\{/m))));
  const MUST_REMAP = [...used].filter((n) => defined.has(n) && !NOT_REMAPPED.test(n)).sort();

  it("finds the app tokens the screens read (guards the intersection itself)", () => {
    expect(MUST_REMAP).toEqual(expect.arrayContaining(["--color-surface", "--card", "--font-ui", "--color-action"]));
  });

  it.each(MUST_REMAP)("remaps %s to a landing token inside .surface-landing", (name) => {
    const body = declarations(remapBlock());
    expect(body[name], `${name} has no remap line`).toMatch(/^var\(--[\w-]+\)$/);
  });

  // The var() shape alone passes for a typo. Each target must be a landing token the scope
  // defines, and must resolve, in every theme, to a real value: a colour, or a font stack.
  it.each(MUST_REMAP)("remap target of %s is defined in the scope and resolves in every theme", (name) => {
    const target = /^var\((--[\w-]+)\)$/.exec(declarations(remapBlock())[name] ?? "")?.[1];
    expect(target, `${name} has no var() target`).toBeTruthy();
    const base = declarations(blockBody(scopeCss, /^\.surface-landing\s*\{/m));
    const remapNames = new Set(Object.keys(declarations(remapBlock())));
    expect(base[target!], `${target} is not defined in the scope`).toBeDefined();
    expect(remapNames.has(target!), `${target} points at another remap line, not a landing token`).toBe(false);
    for (const [theme, tokens] of THEMES) {
      const value = tokens[name];
      if (/font/.test(name)) expect(value, `${name} in ${theme}`).toMatch(/Geist/);
      else expect(value, `${name} in ${theme}`).toMatch(/^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i);
    }
  });

  it("keeps the remap block inside the base .surface-landing block", () => {
    const base = blockBody(scopeCss, /^\.surface-landing\s*\{/m);
    expect(base).toContain(REMAP_OPEN);
    expect(base).toContain(REMAP_CLOSE);
  });

  it("contains no hex in the remap block", () => {
    expect(remapBlock()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  // Text pairs that read through a remap, resolved per theme (remap -> landing token -> theme value).
  const REMAP_TEXT_PAIRS: Array<[string, string, number]> = [
    ["--color-ink-strong", "--color-canvas", 4.5],
    ["--color-ink-strong", "--color-surface", 4.5],
    ["--color-ink", "--color-surface", 4.5],
    ["--color-ink", "--color-surface-2", 4.5],
    ["--color-ink-muted", "--color-surface", 4.5],
    ["--color-ink-muted", "--color-surface-2", 4.5],
    ["--color-action", "--color-surface", 4.5], // links and action text
    ["--color-action", "--color-canvas", 4.5],
    ["--color-action-hover", "--color-surface", 4.5],
    ["--color-on-action", "--color-action", 4.5], // fills
    ["--color-on-danger", "--color-danger", 4.5],
    ["--color-success", "--color-success-bg", 4.5],
    ["--color-warning", "--color-warning-bg", 4.5],
    ["--color-danger", "--color-surface", 4.5],
    ["--foreground", "--background", 4.5],
    ["--card-foreground", "--card", 4.5],
    ["--popover-foreground", "--popover", 4.5],
    ["--secondary-foreground", "--secondary", 4.5],
    ["--muted-foreground", "--card", 4.5],
    ["--accent-foreground", "--card", 4.5],
    ["--primary-foreground", "--primary", 4.5],
    ["--destructive-foreground", "--destructive", 4.5],
    ["--success-foreground", "--success", 4.5],
    ["--warning-foreground", "--warning", 4.5],
    ["--info-foreground", "--info", 4.5],
    ["--destructive", "--card", 4.5],
    ["--color-on-action", "--color-action-hover", 4.5], // fill hover
    ["--color-on-action", "--color-action-pressed", 4.5], // fill pressed
    ["--color-success", "--color-surface", 4.5],
  ];

  describe.each(THEMES)("%s theme remapped text pairs", (_name, tokens) => {
    it.each(REMAP_TEXT_PAIRS)("%s on %s is at least %f:1", (fg, bg, min) => {
      expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(min);
    });
  });

  // Shell chrome (app-shell/AppShell.css, global.css .sim-banner) and the Tutor launcher cluster and panel
  // (FloatingTutorLauncher.css, TutorPanel.css), all under .surface-landing. Pairs already listed above
  // (for example ink-muted on surface for the brand sub-line, rail eyebrow, nav links and mobile links) are
  // not repeated; the ones named here are those the surfaces use that nothing else measured.
  const SHELL_TUTOR_TEXT_PAIRS: Array<[string, string, number, string]> = [
    ["--color-warning", "--color-warning-bg", 4.5, "sim banner text"],
    ["--color-ink-strong", "--color-surface", 4.5, "brand name on the top bar"],
    ["--color-ink", "--secondary", 4.5, "Preferences trigger"],
    ["--color-ink-strong", "--color-surface-2", 4.5, "rail link hover; Tutor button on the dark raised surface"],
    ["--color-ink", "--color-surface-2", 4.5, "Tutor close button hover on the dark raised surface"],
    ["--color-ink-muted", "--color-surface-2", 4.5, "Tutor close button on the dark raised surface"],
    ["--color-ink", "--color-canvas", 4.5, "Tutor question input"],
    ["--color-ink-muted", "--color-canvas", 4.5, "Tutor labels beside the input"],
    ["--color-ink", "--color-warning-bg", 4.5, "Tutor failure notice body"],
    ["--color-warning", "--color-warning-bg", 4.5, "Tutor clarification notice"],
  ];

  describe.each(THEMES)("%s theme shell chrome and Tutor text pairs", (_name, tokens) => {
    it.each(SHELL_TUTOR_TEXT_PAIRS)("%s on %s is at least %f:1 (%s)", (fg, bg, min) => {
      expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(min);
    });

    // --color-action-surface is translucent in dark and black, so it paints over whatever sits under it:
    // the top bar, rail, menu and mobile nav (--surface), or the raised Tutor surface (--surface-2).
    // Measure the composite over both backdrops.
    const OVER_ACTION_SURFACE: Array<[string, string]> = [
      ["--color-ink", "Preferences trigger and menu item, hover or expanded"],
      ["--color-ink-muted", "Preferences item hint over the hover tint"],
      ["--color-action", "active rail link, active mobile link, checked Preferences item"],
      ["--color-ink-strong", "Tutor button while expanded"],
    ];
    describe.each(["--color-surface", "--color-surface-2"])("over %s", (backdrop) => {
      it.each(OVER_ACTION_SURFACE)("%s on --color-action-surface is at least 4.5:1 (%s)", (fg) => {
        expect(tokens[fg]).toMatch(/^#[0-9a-f]{6}$/i);
        expect(
          contrastRatio(tokens[fg], composite(tokens["--color-action-surface"], tokens[backdrop])),
        ).toBeGreaterThanOrEqual(4.5);
      });
    });

    // The Tutor safety notice paints a translucent danger-bg over the panel surface.
    it("danger on danger-bg (composited over --surface, Tutor safety notice) is at least 4.5:1", () => {
      expect(tokens["--color-danger"]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(
        contrastRatio(tokens["--color-danger"], composite(tokens["--color-danger-bg"], tokens["--surface"])),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  // Settings workspace (SettingsPage.css, LearnerDataPanel inside it). Every text pair it reads through the
  // remap is already listed above (ink-strong, ink, ink-muted and action on canvas, surface and surface-2;
  // success, warning and danger on their backgrounds; muted-foreground on card for FieldDescription). The one
  // pair nothing else measured is the secondary button on the panel surface: --ghost and --ghostHover are
  // translucent, so measure the ink text over the composite. The panel is LearnerDataPanel's
  // .overview__learner-data, whose background is --color-surface, remapped to --surface in the scope
  // (SettingsPage.css). The button is .relay-btn--secondary, whose font is --font-ui, remapped to Geist.
  describe.each(THEMES)("%s theme settings workspace text pairs", (_name, tokens) => {
    it.each(["--ghost", "--ghostHover"])("--ink on %s (composited over --surface, secondary button) is at least 4.5:1", (bg) => {
      expect(tokens["--ink"]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrastRatio(tokens["--ink"], composite(tokens[bg], tokens["--surface"]))).toBeGreaterThanOrEqual(4.5);
    });
  });

  // Overview workspace (OverviewPage.css, OverviewLaunchpad.css, OverviewLearningPulse.css, OverviewActivity.css,
  // OverviewSystemStatus.css). Every card, panel, chip, button and status line paints --color-surface,
  // --color-surface-2 or --color-success-bg / --color-warning-bg (opaque in every theme), and each text pair on
  // them is already listed above: ink-strong, ink, ink-muted, action, success and warning on surface; ink-muted
  // on surface-2 (plan chip, stage pill, icon discs); success and warning on their -bg; on-action on action
  // (workspace icon tile); action on --color-action-surface composited over surface (stage pill, active plan chip,
  // module glyph, reviews icon); the primary and secondary buttons. The one backdrop nothing measured is the page
  // itself. The outlet is not scoped, so body and <main> still paint tokens.css's --color-canvas, and
  // .surface-landing sets no background: the h1 (.overview__heading) and the tagline (.overview__tagline) are
  // the only text outside a card, and they read the landing ink over that old canvas. Measure that mix.
  const OLD_PALETTES: Record<string, Tokens> = { light: LIGHT, dark: DARK, black: BLACK };
  describe.each(THEMES)("%s theme overview workspace text pairs", (name, tokens) => {
    const oldCanvas = OLD_PALETTES[name]["--color-canvas"];
    it.each([
      ["--color-ink-strong", "h1"],
      ["--color-ink-muted", "tagline"],
    ])("%s on the unscoped tokens.css --color-canvas (%s) is at least 4.5:1", (fg) => {
      expect(tokens[fg]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(oldCanvas).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrastRatio(tokens[fg], oldCanvas)).toBeGreaterThanOrEqual(4.5);
    });
  });

  // Translucent backgrounds (dark --badBg is rgba) paint over the canvas, so measure the composite.
  const PAIRS_OVER_CANVAS: Array<[string, string, number]> = [
    ["--color-danger", "--color-danger-bg", 4.5], // danger notices and alerts
  ];

  describe.each(THEMES)("%s theme remapped pairs over the canvas", (_name, tokens) => {
    it.each(PAIRS_OVER_CANVAS)("%s on %s (composited over --bg) is at least %f:1", (fg, bg, min) => {
      const fgHex = tokens[fg];
      expect(fgHex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrastRatio(fgHex, composite(tokens[bg], tokens["--bg"]))).toBeGreaterThanOrEqual(min);
    });
  });
});
