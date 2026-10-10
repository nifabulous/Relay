/**
 * Footer theme control: System, Light, Dark, Black. Applies the theme the same
 * way the app's applyTheme() does (theme-control.test.ts pins the parity) and
 * announces the change with a relay:theme event so the globe can repaint.
 */
import { pageStorage, storedTheme, writeTheme, type PreferenceStorage, type ThemeChoice } from "./preferences";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function applyLandingTheme(theme: ThemeChoice, prefersDark: boolean, root: HTMLElement): void {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  const dark = theme === "dark" || theme === "black" || (theme === "system" && prefersDark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function initThemeControl(
  doc: Document = document,
  storage: PreferenceStorage | null = pageStorage(),
  media: (query: string) => MediaQueryList = (query) => window.matchMedia(query),
): void {
  const buttons = Array.from(doc.querySelectorAll<HTMLButtonElement>("[data-theme-choice]"));
  if (buttons.length === 0) return;
  const darkQuery = media(DARK_QUERY);
  let session: ThemeChoice | null = null;
  const current = (): ThemeChoice => session ?? storedTheme(storage);

  const apply = (theme: ThemeChoice) => {
    applyLandingTheme(theme, darkQuery.matches, doc.documentElement);
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme));
    doc.dispatchEvent(new CustomEvent("relay:theme"));
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const theme = button.dataset.themeChoice as ThemeChoice;
      writeTheme(storage, theme);
      session = theme;
      apply(theme);
    });
  }
  darkQuery.addEventListener("change", () => {
    if (current() === "system") apply("system");
  });
  apply(current());
}
