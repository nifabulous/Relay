import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, it, expect } from "vitest";

import { reloadPreferences } from "./AppShell";
import { PreferencesMenu } from "./PreferencesMenu";
import { loadPreferences } from "../lib/persistence/storage";

function renderMenu() {
  return render(
    <MemoryRouter>
      <PreferencesMenu />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  // The store is module-level and outlives a single test, so drop its cached
  // snapshot too — otherwise a theme chosen in one test leaks into the next.
  reloadPreferences();
});

describe("PreferencesMenu trigger", () => {
  it("renders a labelled trigger that reports its collapsed state", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /preferences/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the menu on click and reports the expanded state", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /preferences/i }));

    expect(screen.getByRole("button", { name: /preferences/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("menu", { name: /preferences/i })).toBeInTheDocument();
  });
});

async function openMenu() {
  const user = userEvent.setup();
  renderMenu();
  await user.click(screen.getByRole("button", { name: /preferences/i }));
  return user;
}

describe("PreferencesMenu appearance group", () => {
  // DESIGN.md: status is text + icon + colour, never colour alone. aria-checked
  // is what makes the active state available to assistive tech and to a user
  // who cannot distinguish the selected tint.
  it("exposes four appearance states with the active one programmatically determinable", async () => {
    await openMenu();

    const options = screen.getAllByRole("menuitemradio");
    expect(options).toHaveLength(4);

    // "system" is the default from Task 7.2.
    expect(screen.getByRole("menuitemradio", { name: /^System/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    // The OLED variant joins dark as an explicit non-OS choice.
    expect(screen.getByRole("menuitemradio", { name: /Black/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("persists an explicit choice and reflects it without a reload", async () => {
    const user = await openMenu();

    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: /^System/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    // Straight from storage, not the store's cache.
    expect(loadPreferences().theme).toBe("dark");
  });

  it("round-trips all four appearance states", async () => {
    const user = await openMenu();

    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));
    expect(loadPreferences().theme).toBe("light");

    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
    expect(loadPreferences().theme).toBe("dark");

    await user.click(screen.getByRole("menuitemradio", { name: /Black/ }));
    expect(loadPreferences().theme).toBe("black");

    await user.click(screen.getByRole("menuitemradio", { name: /^System/ }));
    expect(loadPreferences().theme).toBe("system");
  });
});

describe("PreferencesMenu remaining items", () => {
  it("toggles reduce motion and persists it", async () => {
    const user = await openMenu();

    const toggle = screen.getByRole("menuitemcheckbox", { name: /reduce motion/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    expect(screen.getByRole("menuitemcheckbox", { name: /reduce motion/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(loadPreferences().reducedMotion).toBe(true);
  });

  // Regression: reduce motion originally reused the radio items' CheckIcon, which
  // only renders when selected. Off therefore drew NOTHING — no icon, no colour —
  // so a binary toggle was indistinguishable from an unselected radio option, and
  // DESIGN.md's "text + icon + colour, never one alone" was silently violated.
  // The aria-checked assertions above passed the whole time, which is exactly why
  // this needs its own test: the accessible state was right, the visible one absent.
  it("renders a visible state indicator whether reduce motion is on or off", async () => {
    const user = await openMenu();

    const offItem = screen.getByRole("menuitemcheckbox", { name: /reduce motion/i });
    expect(offItem).toHaveAttribute("aria-checked", "false");
    expect(offItem.querySelector(".app-shell__prefs-switch")).not.toBeNull();

    await user.click(offItem);

    const onItem = screen.getByRole("menuitemcheckbox", { name: /reduce motion/i });
    expect(onItem).toHaveAttribute("aria-checked", "true");
    expect(onItem.querySelector(".app-shell__prefs-switch")).not.toBeNull();
  });

  // The switch must not be the radio checkmark. Both are "an indicator", so the
  // test above alone would still pass if someone swapped the switch back for a
  // CheckIcon rendered in both states — this pins the two controls apart.
  it("uses a switch for the binary preference, not the radio checkmark", async () => {
    await openMenu();

    const toggle = screen.getByRole("menuitemcheckbox", { name: /reduce motion/i });
    expect(toggle.querySelector(".app-shell__prefs-switch")).not.toBeNull();
    expect(toggle.querySelector(".app-shell__prefs-check")).toBeNull();

    const selectedRadio = screen
      .getAllByRole("menuitemradio")
      .find((item) => item.getAttribute("aria-checked") === "true");
    expect(selectedRadio?.querySelector(".app-shell__prefs-check")).not.toBeNull();
    expect(selectedRadio?.querySelector(".app-shell__prefs-switch")).toBeNull();
  });

  // The menu is the one-click path; the route is the durable home. This link is
  // the only way to reach the route, since Settings is deliberately not a nav
  // item (DESIGN.md defines the shell as exactly four workspaces).
  it("links onward to the settings route", async () => {
    await openMenu();

    const link = screen.getByRole("menuitem", { name: /all settings/i });
    expect(link).toHaveAttribute("href", "/settings");
  });
});

describe("PreferencesMenu keyboard and dismissal", () => {
  it("exposes the RelayPopover menu contract around the real Preferences content", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /preferences/i }));

    const trigger = screen.getByRole("button", { name: /preferences/i });
    const menu = screen.getByRole("menu", { name: /preferences/i });

    expect(menu).toHaveAttribute("id", "app-shell-preferences-menu");
    expect(menu).toHaveAttribute("aria-labelledby", trigger.id);
    expect(menu.parentElement).toHaveClass("app-shell__prefs-positioner");
    expect(menu).toContainElement(
      screen.getByRole("menuitemradio", { name: /system/i }),
    );
    expect(menu).toContainElement(
      screen.getByRole("menuitemcheckbox", { name: /reduce motion/i }),
    );
    expect(menu).toContainElement(
      screen.getByRole("menuitem", { name: /all settings/i }),
    );
  });

  // The trigger sits at the top bar's right edge, so the popup must grow
  // downward and leftward — any other placement clips it off-screen or drags
  // it over the brand. Base UI reports the resolved placement as data
  // attributes on the positioner, which is observable without a layout engine.
  it("positions the popup below and end-aligned to the trigger", async () => {
    await openMenu();

    const positioner = screen.getByRole("menu", { name: /preferences/i })
      .parentElement;
    expect(positioner).toHaveClass("app-shell__prefs-positioner");
    expect(positioner).toHaveAttribute("data-side", "bottom");
    expect(positioner).toHaveAttribute("data-align", "end");
  });

  it("moves focus into the menu on open", async () => {
    await openMenu();

    // Focus must land inside, or a keyboard user opens the menu and is still
    // parked on the trigger with no way to reach the options by arrow keys.
    const menu = screen.getByRole("menu", { name: /preferences/i });
    expect(menu).toContainElement(document.activeElement as HTMLElement);
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = await openMenu();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu", { name: /preferences/i })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /preferences/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes on an outside click", async () => {
    const user = await openMenu();

    await user.click(document.body);

    expect(screen.queryByRole("menu", { name: /preferences/i })).not.toBeInTheDocument();
  });

  it("moves through the options with the arrow keys", async () => {
    const user = await openMenu();

    // Focus starts on the first item; ArrowDown walks the menu.
    expect(screen.getByRole("menuitemradio", { name: /^System/ })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitemradio", { name: /^System/ })).toHaveFocus();
  });
});
