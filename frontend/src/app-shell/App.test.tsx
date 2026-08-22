import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { AppShell } from "./AppShell";
import {
  createTestSink,
  resetAnalyticsSink,
  setAnalyticsSink,
} from "../lib/analytics/analytics";

// App.tsx uses BrowserRouter which needs a real URL matching basename="/app".
// For the bootstrap test we verify the shell renders the Relay identity
// using MemoryRouter which works in any jsdom environment.

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app"]}>
        <AppShell>
          <h1>Overview</h1>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App bootstrap", () => {
  afterEach(() => {
    resetAnalyticsSink();
  });

  it("renders the Relay simulation identity", () => {
    const { container } = renderWithProviders();
    const brandName = container.querySelector(".app-shell__brand-name");
    expect(brandName).toHaveTextContent("Relay");
  });

  it("renders the simulation banner", () => {
    renderWithProviders();
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(/not a real payment/i);
  });

  it("tracks once through StrictMode effect replay and again after a real remount", async () => {
    window.history.replaceState({}, "", "/app");
    const sink = createTestSink();
    setAnalyticsSink(sink);
    const { App } = await import("./App");

    const first = render(<StrictMode><App /></StrictMode>);
    await waitFor(() => {
      expect(sink.events).toEqual([
        { name: "app_viewed", properties: { surface: "relay" } },
      ]);
    });
    first.unmount();
    render(<StrictMode><App /></StrictMode>);

    await waitFor(() => {
      expect(sink.events).toHaveLength(2);
    });
  });
});

// ─── Route ordering guard (real App.tsx tree) ──────────────────────────────
//
// The Case Desk route `/learn/cases/:caseId` MUST resolve to the case desk,
// never be swallowed by the legacy `/learn/:moduleId` route. React Router v6
// ranks static segments above dynamic ones regardless of declaration order,
// so the ordering invariant is robust by design — but App.tsx still declares
// the case route first as belt-and-suspenders. This test guards the REAL
// App.tsx route tree (lazy chunks, Suspense, BrowserRouter basename and all)
// so a future refactor that swaps the order, drops the case route, or breaks
// the lazy import is caught here, not just in the caseRoutes.test.tsx
// documentation-of-intent test that builds its own <Routes>.

describe("App routing — case desk route resolves against the real App tree", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the Case Desk for /learn/cases/canada-us-supplier (not LearnModulePage)", async () => {
    // App.tsx uses BrowserRouter with basename="/app". BrowserRouter reads
    // window.location.pathname and strips the basename, so we seed jsdom's
    // URL to the full path BEFORE importing App (we import lazily inside the
    // test so the router picks up the seeded URL).
    window.history.replaceState({}, "", "/app/learn/cases/canada-us-supplier");

    const { App } = await import("./App");
    render(<App />);

    // The case desk renders the case title as the page <h1>. The legacy
    // LearnModulePage renders "Module not found" for an unknown module id
    // (and "cases" is not a real lab id), so if route ordering regressed and
    // `cases` were captured as a module id, that text would appear instead.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Canada → US supplier payment/i }),
      ).toBeInTheDocument();
    }, { timeout: 10_000 });
    expect(screen.queryByText(/module not found/i)).toBeNull();
    // The Case Desk renders the customer request text. Assert it so a future
    // change that routes to the wrong lazy chunk is caught. (This replaced an
    // earlier assertion for the Task-3 placeholder copy, which Task 4 removed.)
    expect(screen.getByText(/Maple Ridge Outfitters/i)).toBeInTheDocument();
  });
});

describe("App routing — named lazy loading state", () => {
  it("renders the real Explore route through the lazy route boundary", async () => {
    window.history.replaceState({}, "", "/app/explore");

    const { App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Explore" })).toBeVisible();
    });
  });
});

// ─── Unmatched-URL recovery ────────────────────────────────────────────────
//
// The catch-all used to be <Navigate to="" replace />, which is a no-op in a
// React Router splat route: the component renders, no navigation happens, and
// the outlet stays empty. Every mistyped URL, stale bookmark, or broken
// internal link painted the shell chrome over a blank content area, forever,
// with no error and no console warning. That silence is why a dead link in the
// Operate flow survived to production.

describe("App routing — unmatched URLs under /app", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders a Not Found page instead of empty shell chrome", async () => {
    // The exact URL the double-basename bug produced.
    window.history.replaceState({}, "", "/app/app/operate/tracking");

    const { App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    });

    // A way out from inside the content area, or the page is still a dead end.
    // Scoped to <main> because both nav rails also link to Overview.
    const main = screen.getByRole("main");
    expect(within(main).getByRole("link", { name: /go to overview/i })).toBeInTheDocument();
    // The path is echoed so a bug report can carry it — which means the FULL
    // URL, doubled basename and all. This previously asserted
    // "/app/operate/tracking", the basename-stripped form: a real, routable
    // path that hides the very bug the page exists to surface.
    expect(within(main).getByText("/app/app/operate/tracking")).toBeInTheDocument();
    expect(within(main).queryByText("/app/operate/tracking")).toBeNull();
  });

  it("keeps the unmatched path in the URL so a bug report can carry it", async () => {
    window.history.replaceState({}, "", "/app/nonsense");

    const { App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe("/app/nonsense");
  });
});
