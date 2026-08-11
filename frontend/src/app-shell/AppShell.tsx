import { type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import "./AppShell.css";

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
            end={item.to === "/app"}
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
