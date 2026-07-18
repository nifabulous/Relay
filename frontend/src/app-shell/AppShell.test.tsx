import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";

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

  it("renders a desktop rail", () => {
    renderShell();
    expect(screen.getByLabelText("Primary navigation")).toBeInTheDocument();
  });
});
