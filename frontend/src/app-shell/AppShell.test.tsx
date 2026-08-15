import { beforeEach, describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell, reloadPreferences } from "./AppShell";
import { defaultPreferences, savePreferences } from "../lib/persistence/storage";

// Render with basename="/app" to match production BrowserRouter config.
// NAV_ITEMS use paths like "/learn" (no /app prefix) — the basename handles it.
function renderShell(path = "") {
  return render(
    <MemoryRouter basename="/app" initialEntries={[`/app${path}`]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div>Overview placeholder</div>} />
          <Route path="learn" element={<div>Learn placeholder</div>} />
          <Route path="explore" element={<div>Explore placeholder</div>} />
          <Route path="operate" element={<div>Operate placeholder</div>} />
          <Route path="settings" element={<div>Settings placeholder</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell", () => {
  it("renders the Relay brand in the topbar", () => {
    renderShell();
    const topbar = screen.getByRole("banner");
    const brandName = topbar.querySelector(".app-shell__brand-name");
    expect(brandName).toHaveTextContent("Relay");
  });

  it("renders the simulation label in the sim banner", () => {
    renderShell();
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(/Educational payment simulation/i);
    expect(banner).toHaveTextContent(/not a real payment/i);
  });

  it("exposes four navigation destinations with accessible names", () => {
    renderShell();
    const nav = screen.getByLabelText("Primary navigation");
    const links = nav.querySelectorAll("a");
    expect(links.length).toBe(4);
    expect(nav).toHaveTextContent("Overview");
    expect(nav).toHaveTextContent("Learn");
    expect(nav).toHaveTextContent("Explore");
    expect(nav).toHaveTextContent("Operate");
  });

  it("marks the active destination with aria-current=page", () => {
    renderShell("/learn");
    const desktopNav = screen.getByLabelText("Primary navigation");
    const learnLink = desktopNav.querySelector('a[href="/app/learn"]');
    expect(learnLink).toHaveAttribute("aria-current", "page");
  });

  it("keeps inactive destinations neutral while the current route is active", () => {
    renderShell("/explore");
    const nav = screen.getByLabelText("Primary navigation");
    expect(nav.querySelector('a[href="/app/explore"]')).toHaveClass("app-shell__nav-link--active");
    expect(nav.querySelector('a[href="/app/learn"]')).not.toHaveClass("app-shell__nav-link--active");
  });

  // Overview's `to` is "" (the index route), so it needs `end` to match exactly.
  // Without it every path starting at the root counts as a match and two nav
  // items light up at once.
  it("does not mark Overview as active on a child route", () => {
    renderShell("/explore");
    const nav = screen.getByLabelText("Primary navigation");
    const overview = within(nav).getByRole("link", { name: /overview/i });
    expect(overview).not.toHaveClass("app-shell__nav-link--active");
    expect(overview).not.toHaveAttribute("aria-current", "page");
  });

  it("marks Overview as active on the index route", () => {
    renderShell();
    const nav = screen.getByLabelText("Primary navigation");
    const overview = within(nav).getByRole("link", { name: /overview/i });
    expect(overview).toHaveClass("app-shell__nav-link--active");
  });

  it("renders child route content", () => {
    renderShell("/explore");
    expect(screen.getByText("Explore placeholder")).toBeVisible();
  });

  it("renders mobile navigation with four bottom-bar items", () => {
    renderShell();
    const mobileNav = screen.getByLabelText("Mobile navigation");
    expect(mobileNav).toBeInTheDocument();
    const links = mobileNav.querySelectorAll("a");
    expect(links.length).toBe(4);
  });

  // The mobile bar needs the same `end` guard as the rail. It compared
  // `item.to === "/app"`, but NAV_ITEMS spells Overview as "" — the basename
  // supplies the "/app" — so the comparison was never true and `end` was
  // permanently false, leaving Overview lit on every child route. The rail's
  // equivalent tests above passed throughout, which is how it stayed hidden.
  it("does not mark mobile Overview as active on a child route", () => {
    renderShell("/explore");
    const mobileNav = screen.getByLabelText("Mobile navigation");
    const overview = within(mobileNav).getByRole("link", { name: /overview/i });
    expect(overview).not.toHaveClass("app-shell__mobile-link--active");
    expect(overview).not.toHaveAttribute("aria-current", "page");
  });

  it("marks mobile Overview as active on the index route", () => {
    renderShell();
    const mobileNav = screen.getByLabelText("Mobile navigation");
    const overview = within(mobileNav).getByRole("link", { name: /overview/i });
    expect(overview).toHaveClass("app-shell__mobile-link--active");
  });

  it("marks only the current destination active in the mobile bar", () => {
    renderShell("/explore");
    const mobileNav = screen.getByLabelText("Mobile navigation");
    const active = mobileNav.querySelectorAll(".app-shell__mobile-link--active");
    expect(active.length).toBe(1);
    expect(active[0]).toHaveAttribute("href", "/app/explore");
  });

  it("renders a desktop rail", () => {
    renderShell();
    expect(screen.getByLabelText("Primary navigation")).toBeInTheDocument();
  });
});

describe("AppShell preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    reloadPreferences();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  it("mounts the preferences menu in the top bar", () => {
    renderShell();
    const topbar = screen.getByRole("banner");
    const trigger = within(topbar).getByRole("button", { name: /preferences/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  // DESIGN.md defines the shell as exactly four workspaces, and mobile as a
  // four-item bottom bar. Settings is reachable only through the menu.
  it("does not add Settings as a fifth navigation destination", () => {
    renderShell();

    expect(screen.getByLabelText("Primary navigation").querySelectorAll("a")).toHaveLength(4);
    expect(screen.getByLabelText("Mobile navigation").querySelectorAll("a")).toHaveLength(4);

    const rail = screen.getByLabelText("Primary navigation");
    expect(within(rail).queryByRole("link", { name: /settings/i })).toBeNull();
  });

  // Nothing applied the stored theme at runtime before this: Task 7.2 shipped
  // the resolution logic and the pre-paint script, but the React app never
  // called it, so a change made in the menu would only survive a reload.
  it("applies an explicit stored theme to the document root on mount", () => {
    savePreferences({ ...defaultPreferences, theme: "dark" });
    reloadPreferences();

    renderShell();

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("stamps no data-theme for the system preference", () => {
    renderShell();

    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  // The menu's "All settings" item is the ONLY way in, so this path has to work.
  it("reaches the settings route through the menu, and closes the menu on the way", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: /preferences/i }));
    await user.click(screen.getByRole("menuitem", { name: /all settings/i }));

    expect(screen.getByText("Settings placeholder")).toBeVisible();
    expect(screen.queryByRole("menu", { name: /preferences/i })).not.toBeInTheDocument();
  });
});
