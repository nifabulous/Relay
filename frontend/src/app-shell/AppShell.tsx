import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  applyTheme,
  prefersDarkNow,
  resolveTheme,
  watchSystemTheme,
  type ResolvedTheme,
} from "../design-system/theme";
import type { RelayPreferences } from "../design-system/types";
import { loadPreferences, savePreferences } from "../lib/persistence/storage";
import { PreferencesMenu } from "./PreferencesMenu";
import "./AppShell.css";

/*
 * ── Preferences store ─────────────────────────────────────────────────────
 *
 * Module-level, not React context, so the quick menu in the top bar and the
 * settings route read and write the SAME object. Two surfaces editing one
 * preference is the main risk of shipping both, and a copy in either component
 * is how they would drift. useSyncExternalStore means a write from either one
 * re-renders the other in the same tick, with no reload.
 *
 * Nothing here writes on load. Preferences are persisted ONLY on an explicit
 * user change, so merely opening the app never rewrites the stored JSON.
 */

let currentPreferences: RelayPreferences | null = null;
const preferenceListeners = new Set<() => void>();

function getPreferencesSnapshot(): RelayPreferences {
  currentPreferences ??= loadPreferences();
  return currentPreferences;
}

function subscribeToPreferences(onStoreChange: () => void): () => void {
  preferenceListeners.add(onStoreChange);
  return () => {
    preferenceListeners.delete(onStoreChange);
  };
}

function emitPreferenceChange(): void {
  for (const listener of preferenceListeners) listener();
}

/** The live preferences. Re-renders on any write from any surface. */
export function usePreferences(): RelayPreferences {
  return useSyncExternalStore(
    subscribeToPreferences,
    getPreferencesSnapshot,
    getPreferencesSnapshot,
  );
}

/** Persist a preference change and notify every subscribed surface. */
export function updatePreferences(patch: Partial<RelayPreferences>): void {
  currentPreferences = { ...getPreferencesSnapshot(), ...patch };
  savePreferences(currentPreferences);
  emitPreferenceChange();
}

/**
 * Drop the cached snapshot so the next read comes from storage again. Needed
 * whenever storage is written from outside this module — tests that clear
 * localStorage, and any future import path that touches preferences.
 */
export function reloadPreferences(): void {
  currentPreferences = null;
  emitPreferenceChange();
}

/**
 * What the current preference actually resolves to right now. In "system" mode
 * this tracks the OS live; in an explicit mode the OS is ignored.
 */
export function useResolvedTheme(): ResolvedTheme {
  const { theme } = usePreferences();
  const [osPrefersDark, setOsPrefersDark] = useState(prefersDarkNow);

  useEffect(
    () => watchSystemTheme(theme, (resolved) => setOsPrefersDark(resolved === "dark")),
    [theme],
  );

  return resolveTheme(theme, osPrefersDark);
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "", label: "Overview", icon: "grid" },
  { to: "/learn", label: "Learn", icon: "book" },
  { to: "/explore", label: "Explore", icon: "search" },
  { to: "/operate", label: "Operate", icon: "play" },
];

function NavIcon({ name }: { name: string }) {
  // Simple inline SVG icons — no emoji per DESIGN.md anti-template
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </>
    ),
    book: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
    play: (
      <>
        <polygon points="6 3 20 12 6 21 6 3" />
      </>
    ),
  };

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? null}
    </svg>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { theme } = usePreferences();

  /*
   * Apply the stored theme at runtime. The pre-paint script in index.html
   * handles first paint, but nothing kept the DOM in step afterwards — without
   * this, a change made in the menu would only take effect on the next reload.
   *
   * The returned unsubscribe also keeps "system" live: the palette itself
   * follows the CSS media query natively, but the inline color-scheme (native
   * scrollbars and form controls) has to be re-applied when the OS flips.
   */
  useEffect(() => {
    applyTheme(theme, prefersDarkNow());
    return watchSystemTheme(theme, () => applyTheme(theme, prefersDarkNow()));
  }, [theme]);

  return (
    <div className="app-shell">
      {/* Simulation banner — persistent, unmissable but not garish */}
      <div className="sim-banner" role="alert">
        <strong>Educational payment simulation</strong> — Simulation, not a real payment. All data is illustrative.
      </div>

      {/* Top bar */}
      <header className="app-shell__topbar">
        <div className="app-shell__brand">
          <span className="app-shell__brand-name">Relay</span>
          <span className="app-shell__brand-sub">Educational payment simulation</span>
        </div>

        {/* The only entry point to preferences and, through it, to Settings. */}
        <PreferencesMenu />
      </header>

      <div className="app-shell__body">
        {/* Desktop navigation rail */}
        <nav className="app-shell__rail" aria-label="Primary navigation">
          <ul className="app-shell__nav-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                {/* Overview's `to` is "", which resolves to the router root. `end`
                    is belt-and-braces here: React Router's prefix match already
                    requires the next char to be "/", so "/explore" never matches
                    "/". Kept explicit so the intent survives a route reshuffle. */}
                <NavLink
                  to={item.to}
                  end={item.to === ""}
                  className={({ isActive }) =>
                    ["app-shell__nav-link", isActive && "app-shell__nav-link--active"]
                      .filter(Boolean)
                      .join(" ")
                  }
                >
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main content */}
        <main className="app-shell__main">
          {children ?? <Outlet />}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="app-shell__mobile-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            // Same guard as the rail. This read `item.to === "/app"`, which no
            // NAV_ITEM ever equals (Overview is "", the basename supplies the
            // prefix), so `end` was permanently false here. Harmless in practice
            // — React Router's prefix match requires the next char to be "/", so
            // "/explore" never matches the root — but a comparison that cannot
            // be true reads as intent that is not there.
            end={item.to === ""}
            className={({ isActive }) =>
              ["app-shell__mobile-link", isActive && "app-shell__mobile-link--active"]
                .filter(Boolean)
                .join(" ")
            }
          >
            <NavIcon name={item.icon} />
            <span className="app-shell__mobile-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
