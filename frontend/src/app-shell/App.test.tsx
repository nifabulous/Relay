import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./AppShell";

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
    });
    expect(screen.queryByText(/module not found/i)).toBeNull();
    // The case desk placeholder is the honest Task-3 surface; assert it so a
    // future change that routes to the wrong lazy chunk is caught.
    expect(screen.getByText(/case desk coming in task 4/i)).toBeInTheDocument();
  });
});
