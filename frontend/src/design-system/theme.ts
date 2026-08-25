/**
 * Relay theme resolution and application.
 *
 * Four preference states collapse to two rendered themes. Only "system"
 * consults the OS; an explicit choice is the user overriding it, so an OS flip
 * must leave them alone. "black" paints with the OLED palette but resolves as
 * dark everywhere a binary answer is needed (native color-scheme, hints).
 */

import type { RelayTheme } from "./types";

/** What actually gets painted. "system" never reaches the DOM. */
export type ResolvedTheme = "light" | "dark";

/** The media query that carries the OS appearance preference. */
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

/**
 * Current OS appearance. Falls back to light where matchMedia is unavailable
 * (jsdom, ancient WebViews) rather than throwing — this runs on the pre-paint
 * path, where a throw would blank the page.
 */
export function prefersDarkNow(): boolean {
  return window.matchMedia?.(DARK_SCHEME_QUERY).matches ?? false;
}

export function resolveTheme(theme: RelayTheme, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") return prefersDark ? "dark" : "light";
  // Black paints with its own palette but answers binary questions as dark.
  return theme === "black" ? "dark" : theme;
}

/**
 * Stamp the preference onto the document root.
 *
 * An explicit choice sets `data-theme`; "system" REMOVES it. The absent
 * attribute is load-bearing: the dark palette is guarded as
 * `:root:not([data-theme="light"])` inside the prefers-color-scheme media
 * query, so only an unstamped root lets the OS drive.
 */
export function applyTheme(
  theme: RelayTheme,
  prefersDark: boolean,
  root: HTMLElement = document.documentElement,
): void {
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  // Native UA chrome (scrollbars, form controls, date pickers) is not painted
  // by our tokens; color-scheme is the only lever for it. It tracks the
  // RESOLVED theme, so a system user on a dark OS gets dark scrollbars even
  // though no data-theme attribute is stamped.
  root.style.colorScheme = resolveTheme(theme, prefersDark);
}

const NO_OP = () => {};

/**
 * Subscribe to OS appearance changes while in "system" mode. Returns an
 * unsubscribe function.
 *
 * An explicit "light"/"dark" is the user overriding the OS, so we do not
 * subscribe at all — nothing to ignore, nothing to leak. Callers re-invoke
 * this when the preference changes (a `theme`-keyed effect), which is what
 * re-attaches the listener on a switch back to "system".
 */
export function watchSystemTheme(
  theme: RelayTheme,
  onResolved: (resolved: ResolvedTheme) => void,
): () => void {
  if (theme !== "system") return NO_OP;

  // jsdom and very old WebViews have no matchMedia; there is nothing to follow.
  const media = window.matchMedia?.(DARK_SCHEME_QUERY);
  if (!media) return NO_OP;

  const handler = (event: MediaQueryListEvent) => {
    onResolved(event.matches ? "dark" : "light");
  };

  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}

/**
 * Stamp the non-theme preferences onto the root element so CSS can act on them.
 *
 * These two shipped persisted-but-unconsumed: the Settings copy promised they
 * removed animation and tightened the rail, and neither happened. A preference
 * that lies is worse than one that is simply absent, so the attribute is the
 * contract and `global.css` holds the behaviour.
 *
 * Defaults deliberately stamp NOTHING. That keeps the plain selectors as the
 * baseline, so no rule needs a `:not()` guard to describe normal behaviour.
 */
export function applyPreferenceFlags(
  preferences: { reducedMotion: boolean; navigationDensity: "comfortable" | "compact" },
  root: HTMLElement = document.documentElement,
): void {
  if (preferences.reducedMotion) {
    root.setAttribute("data-reduced-motion", "true");
  } else {
    root.removeAttribute("data-reduced-motion");
  }

  if (preferences.navigationDensity === "compact") {
    root.setAttribute("data-density", "compact");
  } else {
    root.removeAttribute("data-density");
  }
}
