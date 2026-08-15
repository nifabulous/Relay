import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import type { RelayTheme } from "../design-system/types";
import { usePreferences, useResolvedTheme, updatePreferences } from "./AppShell";

/**
 * The quick path to the one preference people actually change. Everything
 * durable lives in the settings route; this menu stays short on purpose.
 *
 * Identical on every breakpoint — no mobile variant to keep in step.
 */

interface AppearanceOption {
  value: RelayTheme;
  label: string;
}

const APPEARANCE_OPTIONS: AppearanceOption[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function CheckIcon() {
  return (
    <svg
      className="app-shell__prefs-check"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function PreferencesMenu() {
  const [open, setOpen] = useState(false);
  const triggerId = useId();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const preferences = usePreferences();
  const resolvedTheme = useResolvedTheme();

  const close = useCallback(() => setOpen(false), []);

  /** Close and hand focus back, so Escape never strands a keyboard user. */
  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Focus the first item on open. Without this the menu is announced but a
  // keyboard user is still parked on the trigger.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [open]);

  // Outside click / focus loss dismisses. Pointerdown rather than click so the
  // menu is gone before the underlying control reacts.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent | MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("mousedown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [open]);

  /** Roving arrow-key movement across whatever items are currently rendered. */
  function moveFocus(delta: number) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    }
  }

  return (
    <div className="app-shell__prefs" ref={containerRef}>
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className="app-shell__prefs-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Preferences
      </button>

      {open && (
        <div
          className="app-shell__prefs-menu"
          role="menu"
          aria-labelledby={triggerId}
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
          <p className="app-shell__prefs-group-label">Appearance</p>

          {APPEARANCE_OPTIONS.map((option) => {
            const isActive = preferences.theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                className="app-shell__prefs-item"
                onClick={() => updatePreferences({ theme: option.value })}
              >
                <span className="app-shell__prefs-item-label">
                  {option.label}
                  {/* A bare "System" cannot answer the question the user
                      actually has, which is why the app is currently dark. */}
                  {option.value === "system" && (
                    <span className="app-shell__prefs-item-hint">
                      {" · "}
                      {resolvedTheme === "dark" ? "Dark" : "Light"} right now
                    </span>
                  )}
                </span>
                {isActive && <CheckIcon />}
              </button>
            );
          })}

          <hr className="app-shell__prefs-divider" />

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={preferences.reducedMotion}
            className="app-shell__prefs-item"
            onClick={() => updatePreferences({ reducedMotion: !preferences.reducedMotion })}
          >
            <span className="app-shell__prefs-item-label">Reduce motion</span>
            {/* A switch, not a checkmark. The radio items above use CheckIcon to mark
                which one of three is selected; a binary preference needs a control that
                shows BOTH states, or "off" renders as no indicator at all and the item
                is indistinguishable from a radio option. */}
            <span className="app-shell__prefs-switch" aria-hidden="true" />
          </button>

          <hr className="app-shell__prefs-divider" />

          {/* The only route into Settings — it is deliberately not a nav item. */}
          {/* Close on navigate, or the menu hangs over the page it opened. */}
          <Link to="/settings" role="menuitem" className="app-shell__prefs-item" onClick={close}>
            <span className="app-shell__prefs-item-label">All settings</span>
            <span className="app-shell__prefs-item-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
