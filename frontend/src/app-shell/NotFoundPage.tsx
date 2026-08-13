import { Link, useHref, useLocation } from "react-router-dom";

/**
 * Terminal state for any URL under /app that matches no route.
 *
 * This replaced `<Navigate to="" replace />`, which was a no-op: the component
 * rendered, no navigation happened, and the outlet stayed empty. Every mistyped
 * URL and every broken internal link painted shell chrome over a blank area
 * with no error and no console warning.
 *
 * A page rather than a redirect, on purpose. A redirect to Overview hides
 * broken links — the user assumes they misclicked and nobody files a bug. That
 * silence is exactly how the double-basename bug in the Operate flow reached
 * production. The unmatched path stays in the address bar so a bug report can
 * carry it.
 */
export function NotFoundPage() {
  const { pathname, search } = useLocation();

  // `useLocation()` reports the basename-STRIPPED path, so under
  // basename="/app" it turns the address bar's /app/nope into /nope — and the
  // doubled /app/app/operate/tracking into /app/operate/tracking, a path that
  // is real and routable. Either way the page printed something the user could
  // not find in their address bar, which defeats the point of printing it.
  // `useHref` re-applies the basename, giving back the URL as typed.
  const displayPath = useHref(pathname) + search;

  return (
    <div className="app-shell__not-found">
      <h1>Page not found</h1>
      <p>
        There's no page at <code className="mono">{displayPath}</code>.
      </p>
      <p className="app-shell__not-found-hint">
        If a link inside Relay brought you here, the link is broken. Report the path above.
      </p>
      <Link to="/" className="relay-btn relay-btn--secondary">
        Go to Overview
      </Link>
    </div>
  );
}
