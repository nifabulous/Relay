/**
 * Relay theme resolution and application.
 *
 * Three preference states collapse to two rendered themes. Only "system"
 * consults the OS; an explicit "light" or "dark" is the user overriding it, so
 * an OS flip must leave them alone.
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
  return theme;
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
