import { RelaySymbol } from "./shared";

export const NAV_LINKS = [
  { label: "Learn", href: "/app/learn" },
  { label: "Explore", href: "/app/explore" },
  { label: "Operate", href: "/app/operate" },
  { label: "Atlas", href: "/app/explore/atlas" },
];

export function Nav() {
  return (
    <header className="nav">
      <div className="wrap">
        <a className="logo" href="/">
          <RelaySymbol />
          Relay
        </a>
        <nav className="links" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="acts">
          <a className="docs" href="/docs">
            API docs
          </a>
          <a className="btn pri" href="/app">
            Open the simulation
          </a>
          <details className="menu">
            <summary className="btn ghost">Menu</summary>
            <nav className="menu-panel" aria-label="Menu">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href}>
                  {link.label}
                </a>
              ))}
              <a href="/docs">API docs</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
