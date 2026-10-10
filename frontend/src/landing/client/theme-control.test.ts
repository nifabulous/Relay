import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme } from "../../design-system/theme";
import type { RelayTheme } from "../../design-system/types";
import { PREFERENCES_KEY, THEME_CHOICES } from "./preferences";
import { applyLandingTheme, initThemeControl } from "./theme-control";

function fakeMedia(matches: boolean) {
  const listeners: Array<() => void> = [];
  const query = {
    matches,
    addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
  } as unknown as MediaQueryList;
  return { media: () => query, fire: () => listeners.forEach((listener) => listener()), query };
}

function mountControl(): HTMLButtonElement[] {
  document.body.innerHTML = THEME_CHOICES.map(
    (theme) => `<button type="button" data-theme-choice="${theme}" aria-pressed="false">${theme}</button>`,
  ).join("");
  return Array.from(document.querySelectorAll("button"));
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  localStorage.clear();
});

describe("applyLandingTheme", () => {
  it.each(THEME_CHOICES.flatMap((theme) => [[theme, true], [theme, false]] as const))(
    "matches the app's applyTheme for %s with osDark=%s",
    (theme, osDark) => {
      const ours = document.createElement("div");
      const app = document.createElement("div");
      applyLandingTheme(theme, osDark, ours);
      applyTheme(theme as RelayTheme, osDark, app);
      expect(ours.getAttribute("data-theme")).toBe(app.getAttribute("data-theme"));
      expect(ours.style.colorScheme).toBe(app.style.colorScheme);
    },
  );
});

describe("initThemeControl", () => {
  it("presses the stored theme on load and switches on click", () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, reducedMotion: false, navigationDensity: "comfortable", firstRunGuidanceSeen: [], theme: "dark" }));
    const buttons = mountControl();
    const { media } = fakeMedia(false);
    const onTheme = vi.fn();
    document.addEventListener("relay:theme", onTheme);
    initThemeControl(document, localStorage, media);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(buttons.find((b) => b.dataset.themeChoice === "dark")!.getAttribute("aria-pressed")).toBe("true");

    buttons.find((b) => b.dataset.themeChoice === "black")!.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("black");
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).theme).toBe("black");
    expect(onTheme).toHaveBeenCalledTimes(2);
    document.removeEventListener("relay:theme", onTheme);
  });

  it("re-reads storage at click time instead of using the record seen at load", () => {
    const loaded = { schemaVersion: 1, reducedMotion: false, navigationDensity: "comfortable", firstRunGuidanceSeen: [], theme: "system" };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(loaded));
    const buttons = mountControl();
    initThemeControl(document, localStorage, fakeMedia(false).media);
    // The app, open in another tab, changes a field after this page loaded.
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...loaded, reducedMotion: true }));
    buttons.find((b) => b.dataset.themeChoice === "light")!.click();
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!)).toEqual({ ...loaded, reducedMotion: true, theme: "light" });
  });

  it("changes the theme for the page only when the record is foreign", () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 2, theme: "light" }));
    const buttons = mountControl();
    initThemeControl(document, localStorage, fakeMedia(false).media);
    buttons.find((b) => b.dataset.themeChoice === "dark")!.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(PREFERENCES_KEY)).toBe(JSON.stringify({ schemaVersion: 2, theme: "light" }));
  });

  it("follows the OS while the choice is system", () => {
    mountControl();
    const { media, fire, query } = fakeMedia(false);
    initThemeControl(document, localStorage, media);
    expect(document.documentElement.style.colorScheme).toBe("light");
    (query as { matches: boolean }).matches = true;
    fire();
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
