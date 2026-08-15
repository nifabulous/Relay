import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";
import { reloadPreferences } from "../../app-shell/AppShell";
import { PreferencesMenu } from "../../app-shell/PreferencesMenu";
import { loadPreferences } from "../../lib/persistence/storage";

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});

describe("SettingsPage appearance section", () => {
  it("offers the three appearance states with the active one determinable", () => {
    renderSettings();

    expect(screen.getByRole("radio", { name: /^System/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });

  it("persists an appearance choice", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(loadPreferences().theme).toBe("dark");
  });

  it("exposes reduce motion and compact navigation, and persists them", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("checkbox", { name: /reduce motion/i }));
    expect(loadPreferences().reducedMotion).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: /compact navigation/i }));
    expect(loadPreferences().navigationDensity).toBe("compact");
  });
});

describe("SettingsPage learner data section", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The panel was a finished component sitting commented out on Overview. This
  // is the home it never had; the E2E round trip had nothing to drive without it.
  it("renders the learning backup panel", () => {
    renderSettings();
    expect(screen.getByRole("heading", { name: /learning backup/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download learning backup/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/choose learning backup file/i)).toBeInTheDocument();
  });

  it("still exports a backup from its new home", async () => {
    const createObjectURL = vi.fn(() => "blob:relay-backup");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: /download learning backup/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  // An export control only reads as worth using once the boundary is stated:
  // this data lives in this browser and nowhere else.
  it("states the storage boundary plainly", () => {
    renderSettings();
    const section = screen
      .getByRole("heading", { name: /your data/i })
      .closest("section") as HTMLElement;
    expect(section).toHaveTextContent(/this browser/i);
  });
});

/**
 * The whole reason two surfaces is risky: a copy of the preference in either
 * component would let them disagree. Both must read the same store, so a write
 * from one re-renders the other in the same tick with no reload.
 */
describe("menu and route stay in sync", () => {
  function renderBothSurfaces() {
    return render(
      <MemoryRouter>
        <PreferencesMenu />
        <SettingsPage />
      </MemoryRouter>,
    );
  }

  it("reflects a menu change in the route immediately", async () => {
    const user = userEvent.setup();
    renderBothSurfaces();

    await user.click(screen.getByRole("button", { name: /preferences/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^System/ })).not.toBeChecked();
  });

  it("reflects a route change in the menu immediately", async () => {
    const user = userEvent.setup();
    renderBothSurfaces();

    await user.click(screen.getByRole("radio", { name: "Light" }));
    await user.click(screen.getByRole("button", { name: /preferences/i }));

    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("keeps reduce motion in step in both directions", async () => {
    const user = userEvent.setup();
    renderBothSurfaces();

    await user.click(screen.getByRole("checkbox", { name: /reduce motion/i }));
    await user.click(screen.getByRole("button", { name: /preferences/i }));
    expect(screen.getByRole("menuitemcheckbox", { name: /reduce motion/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(screen.getByRole("menuitemcheckbox", { name: /reduce motion/i }));
    expect(screen.getByRole("checkbox", { name: /reduce motion/i })).not.toBeChecked();
  });
});

describe("SettingsPage navigation", () => {
  // Settings is not a nav item, so the page must carry its own way back.
  it("offers a breadcrumb back to Overview", () => {
    renderSettings();
    const back = screen.getByRole("link", { name: /overview/i });
    expect(back).toHaveAttribute("href", "/");
  });
});
