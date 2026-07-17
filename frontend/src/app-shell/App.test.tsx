import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
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
