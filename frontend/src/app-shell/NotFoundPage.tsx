import { Link, useLocation } from "react-router-dom";

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

  return (
    <div className="app-shell__not-found">
      <h1>Page not found</h1>
      <p>
        Nothing is routed at <code className="mono">{pathname}{search}</code>.
      </p>
      <p className="app-shell__not-found-hint">
        If you followed a link inside Relay to get here, that link is broken —
        worth reporting with the path above.
      </p>
      <Link to="/" className="relay-btn relay-btn--secondary">
        Go to Overview
      </Link>
    </div>
  );
}
