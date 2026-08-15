import { useId } from "react";
import { Link } from "react-router-dom";
import type { RelayTheme } from "../../design-system/types";
import { usePreferences, useResolvedTheme, updatePreferences } from "../../app-shell/AppShell";
import { LearnerDataPanel } from "../overview/LearnerDataPanel";
import { loadLearningState } from "../../lib/persistence/learnerStateTransfer";
// LearnerDataPanel still carries `overview__learner-data*` class names. Its
// styles live in OverviewPage.css, which is eagerly loaded today because
// OverviewPage is not lazy — but relying on that would break the moment it is.
// Import it explicitly; Vite dedupes it into the same CSS bundle.
import "../overview/OverviewPage.css";
import "./SettingsPage.css";

/**
 * The durable home for preferences. Reachable only from the preferences menu's
 * "All settings" item — Settings is deliberately NOT a fifth nav entry, because
 * DESIGN.md defines the shell as exactly four workspaces and the mobile bar as
 * a four-item bottom bar.
 *
 * Every control is associated with its explanation via aria-describedby rather
 * than by wrapping both in the <label>. Wrapping folds the explanation into the
 * accessible name, so screen-reader users hear the whole paragraph every time
 * they land on the control.
 */

interface AppearanceOption {
  value: RelayTheme;
  label: string;
  description: string;
}

const APPEARANCE_OPTIONS: AppearanceOption[] = [
  {
    value: "system",
    label: "System",
    description: "Follow your device's appearance setting, and change when it changes.",
  },
  {
    value: "light",
    label: "Light",
    description: "Always use the light palette, whatever your device is set to.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Always use the dark palette, whatever your device is set to.",
  },
];

export function SettingsPage() {
  const preferences = usePreferences();
  const resolvedTheme = useResolvedTheme();
  const idBase = useId();
  const learningState = loadLearningState();

  return (
    <div className="settings">
      {/* Settings is not a nav destination, so the page carries its own way back. */}
      <nav className="settings__breadcrumb" aria-label="Breadcrumb">
        <Link to="/" className="settings__breadcrumb-link">
          ← Overview
        </Link>
      </nav>

      <h1 className="settings__heading">Settings</h1>

      {/* ── Appearance ─────────────────────────────────── */}
      <section className="settings__section" aria-labelledby="settings-appearance">
        <h2 id="settings-appearance" className="settings__section-title">
          Appearance
        </h2>

        <fieldset className="settings__fieldset">
          <legend className="settings__legend">Theme</legend>

          {APPEARANCE_OPTIONS.map((option) => {
            const inputId = `${idBase}-theme-${option.value}`;
            const descriptionId = `${inputId}-description`;
            return (
              <div key={option.value} className="settings__option">
                <input
                  id={inputId}
                  className="settings__option-control"
                  type="radio"
                  name={`${idBase}-theme`}
                  value={option.value}
                  checked={preferences.theme === option.value}
                  aria-describedby={descriptionId}
                  onChange={() => updatePreferences({ theme: option.value })}
                />
                <div className="settings__option-body">
                  <label htmlFor={inputId} className="settings__option-label">
                    {option.label}
                    {option.value === "system" && (
                      <span className="settings__option-hint">
                        {" · "}
                        {resolvedTheme === "dark" ? "Dark" : "Light"} right now
                      </span>
                    )}
                  </label>
                  <p id={descriptionId} className="settings__option-description">
                    {option.description}
                  </p>
                </div>
              </div>
            );
          })}
        </fieldset>

        <div className="settings__option">
          <input
            id={`${idBase}-reduced-motion`}
            className="settings__option-control"
            type="checkbox"
            checked={preferences.reducedMotion}
            aria-describedby={`${idBase}-reduced-motion-description`}
            onChange={(event) => updatePreferences({ reducedMotion: event.target.checked })}
          />
          <div className="settings__option-body">
            <label htmlFor={`${idBase}-reduced-motion`} className="settings__option-label">
              Reduce motion
            </label>
            <p
              id={`${idBase}-reduced-motion-description`}
              className="settings__option-description"
            >
              Removes the theme crossfade, the loading shimmer and other animation.
            </p>
          </div>
        </div>

        <div className="settings__option">
          <input
            id={`${idBase}-density`}
            className="settings__option-control"
            type="checkbox"
            checked={preferences.navigationDensity === "compact"}
            aria-describedby={`${idBase}-density-description`}
            onChange={(event) =>
              updatePreferences({
                navigationDensity: event.target.checked ? "compact" : "comfortable",
              })
            }
          />
          <div className="settings__option-body">
            <label htmlFor={`${idBase}-density`} className="settings__option-label">
              Compact navigation
            </label>
            <p id={`${idBase}-density-description`} className="settings__option-description">
              Tightens spacing in the navigation rail so more fits on screen.
            </p>
          </div>
        </div>
      </section>

      {/* ── Learner data ───────────────────────────────── */}
      <section className="settings__section" aria-labelledby="settings-data">
        <h2 id="settings-data" className="settings__section-title">
          Your data
        </h2>
        <p className="settings__section-intro measure">
          Relay has no account and no server-side profile. Your preferences, progress, practice
          history and case sessions are stored in this browser only — clearing site data removes
          them, and they do not follow you to another browser or device. A backup file is the only
          way to carry them across.
        </p>

        <LearnerDataPanel profilePersistence={learningState.persistence} />
      </section>
    </div>
  );
}
