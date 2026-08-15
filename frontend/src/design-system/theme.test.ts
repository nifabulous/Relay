/// <reference types="node" />
// See contrast.test.ts: node builtins are not ambient under this tsconfig, and
// these tests read global.css / index.html from disk.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, afterEach } from "vitest";

import { applyTheme, prefersDarkNow, resolveTheme, watchSystemTheme } from "./theme";
import type { ResolvedTheme } from "./theme";
import type { RelayTheme } from "./types";

type MatchMediaHost = { matchMedia?: (query: string) => MediaQueryList };

// jsdom does not implement window.matchMedia at all, so there is nothing to
// spy on — the double has to be assigned and torn down by hand.
const originalMatchMedia = (window as MatchMediaHost).matchMedia;

afterEach(() => {
  if (originalMatchMedia === undefined) {
    delete (window as MatchMediaHost).matchMedia;
  } else {
    (window as MatchMediaHost).matchMedia = originalMatchMedia;
  }
});

/**
 * A controllable prefers-color-scheme MediaQueryList. The only way to simulate
 * the user flipping their OS appearance while Relay is open.
 */
function installFakeColorSchemeMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialMatches;

  const mql = {
    media: "(prefers-color-scheme: dark)",
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
  };

  (window as MatchMediaHost).matchMedia = () => mql as unknown as MediaQueryList;

  return {
    /** Simulate the OS appearance changing under a running app. */
    flipTo(next: boolean) {
      matches = next;
      for (const cb of listeners) {
        cb({ matches: next, media: mql.media } as MediaQueryListEvent);
      }
    },
  };
}

describe("resolveTheme", () => {
  it("follows the OS only in system mode", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("prefersDarkNow", () => {
  it("reads the OS preference, and falls back to light where matchMedia is absent", () => {
    // jsdom ships no matchMedia — the same shape as an ancient WebView. A
    // throw here would take the whole pre-paint path down with it.
    expect(prefersDarkNow()).toBe(false);

    installFakeColorSchemeMedia(true);
    expect(prefersDarkNow()).toBe(true);
  });
});

describe("applyTheme", () => {
  // "system" must stamp NOTHING. The dark palette lives under
  // `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`, so
  // an absent attribute is what lets the OS drive; stamping data-theme="light"
  // for a system user would pin them to light forever.
  it("stamps data-theme for an explicit choice and removes it for system", () => {
    const root = document.createElement("div");

    applyTheme("dark", false, root);
    expect(root.getAttribute("data-theme")).toBe("dark");

    applyTheme("light", true, root);
    expect(root.getAttribute("data-theme")).toBe("light");

    applyTheme("system", true, root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  // Native scrollbars, date pickers and form controls are painted by the UA,
  // not by our tokens. Without color-scheme they stay light-on-dark.
  it("sets color-scheme to the RESOLVED theme, including in system mode", () => {
    const root = document.createElement("div");

    applyTheme("system", true, root);
    expect(root.style.colorScheme).toBe("dark");

    applyTheme("system", false, root);
    expect(root.style.colorScheme).toBe("light");

    applyTheme("dark", false, root);
    expect(root.style.colorScheme).toBe("dark");
  });
});

describe("watchSystemTheme", () => {
  it("reports OS flips live in system mode, and stops once unsubscribed", () => {
    const media = installFakeColorSchemeMedia(false);
    const seen: ResolvedTheme[] = [];

    const stop = watchSystemTheme("system", (resolved) => seen.push(resolved));

    media.flipTo(true);
    media.flipTo(false);
    expect(seen).toEqual(["dark", "light"]);

    // Unsubscribing must actually detach, or every remount leaks a listener.
    stop();
    media.flipTo(true);
    expect(seen).toEqual(["dark", "light"]);
  });

  // An explicit choice is the user overriding the OS. The listener must be
  // inert — not merely "resolve to the same value", but silent, so a consumer
  // is never handed a spurious update for a preference it did not ask to follow.
  it("stays silent on an OS flip when the user chose an explicit theme", () => {
    const media = installFakeColorSchemeMedia(false);
    const seen: ResolvedTheme[] = [];

    const stop = watchSystemTheme("dark", (resolved) => seen.push(resolved));
    media.flipTo(true);
    media.flipTo(false);
    stop();

    expect(seen).toEqual([]);
  });
});

// ─── Theme crossfade (global.css) ───────────────────────────────────────────

// Comments are stripped first: prose explaining a rule can otherwise be read
// AS the rule (a comment mentioning `transition: all` is not a declaration).
const GLOBAL_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "global.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** The transition value declared on the top-level `body` rule, if any. */
function bodyTransition(): string | undefined {
  return /^body\s*\{[^}]*?transition:\s*([^;]+);/m.exec(GLOBAL_CSS)?.[1]?.trim();
}

describe("theme crossfade", () => {
  it("transitions background-color and color only — never `all`", () => {
    const value = bodyTransition();
    expect(value, "global.css: body declares no transition").toBeDefined();

    // `transition: all` would drag layout-affecting properties into the swap
    // and quietly animate anything added to body later.
    expect(value).not.toMatch(/\ball\b/);

    const properties = value!.split(",").map((part) => part.trim().split(/\s+/)[0]);
    expect(properties.sort()).toEqual(["background-color", "color"]);

    // Duration comes from the token, which tokens.css already collapses to
    // 0.01ms under prefers-reduced-motion — the pattern the rest of the repo
    // uses. The explicit override below is the belt to that pair of braces.
    expect(value).toContain("var(--duration-fast)");
  });

  it("drops the crossfade entirely under prefers-reduced-motion", () => {
    const reducedMotionBlocks = GLOBAL_CSS.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g,
    );
    expect(reducedMotionBlocks, "global.css: no reduced-motion block").not.toBeNull();
    expect(reducedMotionBlocks!.join("\n")).toMatch(/body\s*\{[^}]*transition:\s*none/);
  });
});

// ─── Pre-paint script (index.html) ──────────────────────────────────────────

/**
 * The inline script in index.html necessarily DUPLICATES the resolution logic:
 * it has to run before the module bundle exists, so it cannot import any of it.
 * Duplicated logic drifts — a renamed storage key or a forgotten theme value
 * would silently disable dark mode's first paint and show a white flash, which
 * no unit test of theme.ts would ever notice.
 *
 * So rather than assert on its source text, this actually EXECUTES the script
 * against a fake document/localStorage/matchMedia and compares the result to
 * what applyTheme() produces for the same inputs.
 */
const INDEX_HTML = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../index.html"),
  "utf8",
);

interface PrePaintResult {
  dataTheme: string | null;
  colorScheme: string;
}

function runPrePaintScript(rawStored: string | null, osDark: boolean): PrePaintResult {
  const match = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML);
  if (!match) throw new Error("index.html: no inline pre-paint <script> found");

  const root = document.createElement("div");
  const fakeDocument = { documentElement: root };
  const fakeLocalStorage = {
    getItem: (key: string) => (key === "relay:preferences" ? rawStored : null),
  };
  const fakeMatchMedia = (query: string) => ({ matches: osDark && query.includes("dark") });

  // eslint-disable-next-line no-new-func
  new Function("document", "localStorage", "matchMedia", match[1])(
    fakeDocument,
    fakeLocalStorage,
    fakeMatchMedia,
  );

  return { dataTheme: root.getAttribute("data-theme"), colorScheme: root.style.colorScheme };
}

/** What applyTheme() would do for the same inputs — the reference answer. */
function reference(theme: RelayTheme, osDark: boolean): PrePaintResult {
  const root = document.createElement("div");
  applyTheme(theme, osDark, root);
  return { dataTheme: root.getAttribute("data-theme"), colorScheme: root.style.colorScheme };
}

describe("pre-paint theme script", () => {
  const matrix: Array<[RelayTheme, boolean]> = [
    ["system", true],
    ["system", false],
    ["light", true],
    ["light", false],
    ["dark", true],
    ["dark", false],
  ];

  it.each(matrix)("matches applyTheme for stored=%s osDark=%s", (theme, osDark) => {
    const stored = JSON.stringify({
      schemaVersion: 1,
      reducedMotion: false,
      navigationDensity: "comfortable",
      firstRunGuidanceSeen: [],
      theme,
    });
    expect(runPrePaintScript(stored, osDark)).toEqual(reference(theme, osDark));
  });

  it("treats a pre-theme preferences object as system", () => {
    const legacy = JSON.stringify({
      schemaVersion: 1,
      reducedMotion: true,
      navigationDensity: "compact",
      firstRunGuidanceSeen: ["overview"],
    });
    expect(runPrePaintScript(legacy, true)).toEqual(reference("system", true));
  });

  it("treats absent, corrupt and unknown values as system", () => {
    expect(runPrePaintScript(null, true)).toEqual(reference("system", true));
    expect(runPrePaintScript("not-json{", true)).toEqual(reference("system", true));
    expect(
      runPrePaintScript(JSON.stringify({ schemaVersion: 1, theme: "midnight-neon" }), true),
    ).toEqual(reference("system", true));
    // Wrong schemaVersion is rejected wholesale by loadVersioned, so the
    // pre-paint script must fall back to the default rather than trust it.
    expect(runPrePaintScript(JSON.stringify({ schemaVersion: 99, theme: "dark" }), false)).toEqual(
      reference("system", false),
    );
  });

  it("does not throw when storage is denied", () => {
    const match = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML);
    const root = document.createElement("div");
    const denied = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    };
    expect(() =>
      new Function("document", "localStorage", "matchMedia", match![1])(
        { documentElement: root },
        denied,
        () => ({ matches: false }),
      ),
    ).not.toThrow();
  });
});

// ── Codex review 2026-08-14 [P2] ─────────────────────────────────────────────

describe("useResolvedTheme after an OS flip in an explicit mode", () => {
  it("re-reads the OS preference when the user returns to system", async () => {
    // While an explicit theme is selected, watchSystemTheme deliberately does
    // not subscribe. The cached osPrefersDark therefore goes stale the moment
    // the OS flips. Returning to "system" resubscribes, but a listener only
    // fires on FUTURE changes — so without an explicit re-read the menu hint
    // reports the pre-flip value while the CSS media query shows the truth.
    const media = installFakeColorSchemeMedia(false); // OS starts light
    const { renderHook, act } = await import("@testing-library/react");
    const { useResolvedTheme, updatePreferences, reloadPreferences } = await import(
      "../app-shell/AppShell"
    );

    localStorage.clear();
    reloadPreferences();

    const { result } = renderHook(() => useResolvedTheme());
    act(() => updatePreferences({ theme: "dark" }));
    expect(result.current).toBe("dark");

    // OS flips to dark while we are pinned to explicit dark: nothing subscribed.
    act(() => media.flipTo(true));

    act(() => updatePreferences({ theme: "system" }));
    expect(result.current).toBe("dark"); // the OS is dark now, not light
  });
});

// ── Review 2026-08-15 [P1]: two settings controls did nothing ────────────────

describe("applyPreferenceFlags", () => {
  it("stamps and clears reduce-motion and density on the root element", async () => {
    const { applyPreferenceFlags } = await import("./theme");
    const root = document.createElement("html");

    applyPreferenceFlags({ reducedMotion: true, navigationDensity: "compact" }, root);
    expect(root.getAttribute("data-reduced-motion")).toBe("true");
    expect(root.getAttribute("data-density")).toBe("compact");

    // Defaults stamp nothing, so the plain selectors stay the baseline and CSS
    // needs no :not() gymnastics.
    applyPreferenceFlags({ reducedMotion: false, navigationDensity: "comfortable" }, root);
    expect(root.hasAttribute("data-reduced-motion")).toBe(false);
    expect(root.hasAttribute("data-density")).toBe(false);
  });
});

describe("the CSS actually honours those flags", () => {
  it("kills transitions under data-reduced-motion and tightens the rail under data-density", () => {
    // Without these blocks the toggles persist a value and change nothing,
    // while the Settings copy promises they remove animation and tighten the
    // rail. A preference that lies is worse than one that is absent.
    expect(GLOBAL_CSS).toMatch(/\[data-reduced-motion="true"\][^{]*\{[^}]*transition:\s*none/);
    expect(GLOBAL_CSS).toMatch(/\[data-reduced-motion="true"\][^{]*\{[^}]*animation:\s*none/);
  });
});
