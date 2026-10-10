/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../../test/contrast";

/**
 * The landing palette (DESIGN.md "Colour" and "Dark and black themes"), parsed
 * from tokens.css as shipped. Pins every ramp and categorical hex, and holds
 * every text pair the page uses to WCAG 2.2 AA in light, dark and black.
 */
const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "tokens.css"), "utf8");
const LANDING_CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "landing.css"), "utf8");

type Tokens = Record<string, string>;

function block(css: string, opener: RegExp): string {
  const match = opener.exec(css);
  if (!match) throw new Error(`block not found: ${opener}`);
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (depth > 0) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(start, i - 1);
}

function declarations(body: string): Tokens {
  const out: Tokens = {};
  for (const [, name, value] of body.matchAll(/(--[\w]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

const LIGHT = declarations(block(CSS, /^:root\s*\{/m));
const DARK_MEDIA = declarations(block(block(CSS, /@media \(prefers-color-scheme: dark\)\s*\{/), /:root:not\(\[data-theme="light"\]\)\s*\{/));
const DARK_EXPLICIT = declarations(block(CSS, /^:root\[data-theme="dark"\]\s*\{/m));
const BLACK_EXPLICIT = declarations(block(CSS, /^:root\[data-theme="black"\]\s*\{/m));
const THEMES: Record<string, Tokens> = {
  light: LIGHT,
  dark: { ...LIGHT, ...DARK_EXPLICIT },
  black: { ...LIGHT, ...BLACK_EXPLICIT },
};

function resolveToken(scope: Tokens, name: string, seen = new Set<string>()): string {
  const value = scope[name];
  if (value === undefined) throw new Error(`undefined token ${name}`);
  const reference = /^var\((--[\w]+)\)$/.exec(value);
  if (!reference) return value;
  if (seen.has(name)) throw new Error(`cycle at ${name}`);
  seen.add(name);
  return resolveToken(scope, reference[1], seen);
}

/** rgba(r, g, b, a) over an opaque #rrggbb, as #rrggbb. */
function flatten(colour: string, under: string): string {
  if (colour.startsWith("#")) return colour.toUpperCase();
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(colour);
  if (!m) throw new Error(`not a colour: ${colour}`);
  const base = [1, 3, 5].map((i) => parseInt(under.slice(i, i + 2), 16));
  const alpha = Number(m[4]);
  const mixed = [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * alpha + base[k] * (1 - alpha)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function ratio(theme: string, fg: string, bg: string, under = "--bg"): number {
  const scope = THEMES[theme];
  const ground = flatten(resolveToken(scope, under), "#FFFFFF");
  const background = flatten(resolveToken(scope, bg), ground);
  return contrastRatio(flatten(resolveToken(scope, fg), background), background);
}

describe("landing palette", () => {
  it("pins the primary and neutral ramps", () => {
    const ramp = (prefix: string, steps: number[]) => steps.map((s) => resolveToken(LIGHT, `--${prefix}${s}`));
    expect(ramp("p", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950])).toEqual([
      "#F5F6FE", "#EAEDFF", "#D8DEFF", "#BBC4FF", "#95A0FF", "#7277FF", "#533AFD", "#472CDD", "#351DAE", "#23107D", "#16065A",
    ]);
    expect(ramp("n", [0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950])).toEqual([
      "#F9FAFC", "#F4F7FA", "#EFF3F8", "#E5EAF1", "#D1D8E1", "#B2BCC8", "#8693A5", "#5F6F85", "#4D5F76", "#354962", "#1F344F", "#0B223E", "#021732",
    ]);
  });

  it("pins the categorical order for light and for dark and black", () => {
    const series = (theme: string) => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => resolveToken(THEMES[theme], `--c${i}`));
    expect(series("light")).toEqual(["#533AFD", "#EF5F2F", "#BF3784", "#E3A200", "#3394F2", "#178F4F", "#A05DF2", "#0FB3A2"]);
    const darkSeries = ["#6B52FF", "#EF5F2F", "#BF3784", "#C08A00", "#3394F2", "#178F4F", "#A05DF2", "#0E9E8F"];
    expect(series("dark")).toEqual(darkSeries);
    expect(series("black")).toEqual(darkSeries);
  });

  it("pins the base tokens of each theme", () => {
    const base = (theme: string) => ["--bg", "--surface", "--tint", "--ink", "--ink2", "--muted", "--line", "--line2"].map((t) => resolveToken(THEMES[theme], t));
    expect(base("light")).toEqual(["#F9FAFC", "#FFFFFF", "#F4F7FA", "#021732", "#4D5F76", "#5F6F85", "#E5EAF1", "#D1D8E1"]);
    expect(base("dark")).toEqual(["#040A15", "#0A1322", "#0F1A2C", "#F3F6FA", "#B4BFCE", "#8A97AB", "#172234", "#25334B"]);
    expect(base("black")).toEqual(["#000000", "#0B0B0F", "#121217", "#F5F5F7", "#B5B7C0", "#8E909B", "#1C1C22", "#2A2A31"]);
  });

  it("keeps the OS-dark block and the explicit dark block identical", () => {
    expect(DARK_MEDIA).toEqual(DARK_EXPLICIT);
  });

  it("makes the black block self-contained: it repeats every dark token", () => {
    expect(Object.keys(DARK_EXPLICIT).filter((token) => !(token in BLACK_EXPLICIT))).toEqual([]);
  });

  describe.each(Object.keys(THEMES))("%s theme text pairs", (theme) => {
    const text = ["--ink", "--ink2", "--muted", "--acc", "--accInk", "--ok", "--warn", "--bad"];
    it.each(text.flatMap((fg) => ["--bg", "--surface", "--tint"].map((bg) => [fg, bg])))("%s on %s passes AA", (fg, bg) => {
      expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
    it.each([
      ["--accInk", "--accBg"],
      ["--bad", "--badBg"],
      ["--onAcc", "--accFill"],
      ["--onAcc", "--accFillHover"],
    ])("%s on %s passes AA", (fg, bg) => {
      expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(["--bandInk", "--bandInk2", "--bandBody", "--bandMuted", "--bandAcc2", "--bandOk"])("%s on the contrast band passes AA", (fg) => {
      expect(ratio(theme, fg, "--band")).toBeGreaterThanOrEqual(4.5);
    });
    it("band warning text on its tinted chip passes AA", () => {
      expect(ratio(theme, "--bandWarn", "--bandWarnBg", "--band")).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("keeps every colour in tokens.css: landing.css holds no hex", () => {
    expect(LANDING_CSS.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });
});
