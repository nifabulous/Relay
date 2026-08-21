import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandSearch } from "./CommandSearch";
import { server } from "../../../test/server";

function renderSearch(initialQuery = "") {
  const user = userEvent.setup();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CommandSearch initialQuery={initialQuery} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user, ...utils };
}

describe("CommandSearch", () => {
  it("renders an input field with accessible label", () => {
    renderSearch();
    expect(screen.getByRole("searchbox", { name: /search/i })).toBeVisible();
  });

  it("shows grouped results when typing a query", async () => {
    const { user } = renderSearch();
    const input = screen.getByRole("searchbox");
    await user.type(input, "IBAN");

    // Should show a glossary result for IBAN
    expect(screen.getByText("IBAN")).toBeVisible();
    // Should be grouped under a "Glossary" heading
    expect(screen.getByText(/glossary/i)).toBeVisible();
  });

  it("shows a zero-result message when nothing matches", async () => {
    const { user } = renderSearch();
    const input = screen.getByRole("searchbox");
    await user.type(input, "zzzznotfound");

    expect(screen.getByText(/no results/i)).toBeVisible();
  });

  it("shows bank-name matches from the directory search", async () => {
    server.use(
      http.get("/api/banks/search", () =>
        HttpResponse.json({
          query: "citibank",
          results: [
            {
              bic: "CITIUS33XXX",
              bank_name: "Citibank N.A.",
              country_code: "US",
              city: "New York",
              country_currency: "USD",
            },
          ],
        }),
      ),
    );

    const { user } = renderSearch();
    await user.type(screen.getByRole("searchbox"), "citibank");

    const result = await screen.findByRole("option", { name: /Citibank N\.A\./i });
    expect(result).toHaveAttribute("href", "/app/explore/banks/CITIUS33XXX");
  });

  it("offers a direct directory result for an uppercase BIC", async () => {
    const { user } = renderSearch();
    await user.type(screen.getByRole("searchbox"), "CITIUS33XXX");

    const result = await screen.findByRole("option", { name: /look up bank by bic/i });
    expect(result).toHaveAttribute("href", "/app/explore/banks/CITIUS33XXX");
  });

  it("does not treat an invalid numeric code as a BIC", async () => {
    const { user } = renderSearch();
    await user.type(screen.getByRole("searchbox"), "12345678");

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /look up bank by bic/i })).not.toBeInTheDocument();
    });
  });

  it("keeps static results usable when the bank directory is unavailable", async () => {
    server.use(
      http.get("/api/banks/search", () => HttpResponse.json({ detail: "unavailable" }, { status: 503 })),
    );

    const { user } = renderSearch();
    await user.type(screen.getByRole("searchbox"), "IBAN");

    expect(await screen.findByRole("alert")).toHaveTextContent(/other results remain available/i);
    expect(screen.getAllByRole("option").some((option) => option.textContent?.trim().startsWith("IBAN"))).toBe(true);
  });

  it("navigates results with ArrowDown and ArrowUp", async () => {
    const { user } = renderSearch();
    const input = screen.getByRole("searchbox");
    await user.type(input, "IBAN");

    // Results should be visible
    const items = screen.getAllByRole("option");
    expect(items.length).toBeGreaterThan(0);

    // Press ArrowDown to activate first item
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveClass("command-search__item--active");

    // Press ArrowDown again to move to second item
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveClass("command-search__item--active");
  });

  it("closes results on Escape and restores focus to input", async () => {
    const { user } = renderSearch();
    const input = screen.getByRole("searchbox");
    await user.type(input, "BIC");

    // Results visible
    expect(screen.getByText("BIC")).toBeVisible();

    // Press Escape
    await user.keyboard("{Escape}");

    // Focus back to input
    expect(input).toHaveFocus();
  });

  it("preserves initial query value", () => {
    renderSearch("SEPA");
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    expect(input.value).toBe("SEPA");
  });

  it("exposes aria-expanded on the input when results are open", async () => {
    const { user } = renderSearch();
    const input = screen.getByRole("searchbox");
    // Closed initially
    expect(input).toHaveAttribute("aria-expanded", "false");
    // Open after typing
    await user.type(input, "IBAN");
    expect(input).toHaveAttribute("aria-expanded", "true");
    // aria-controls points to the listbox
    expect(input).toHaveAttribute("aria-controls");
    const listboxId = input.getAttribute("aria-controls");
    expect(screen.getByRole("listbox")).toHaveAttribute("id", listboxId);
  });

  it("updates aria-activedescendant when navigating with ArrowDown", async () => {
    const { user } = renderSearch();
    const input = screen.getByRole("searchbox");
    await user.type(input, "IBAN");

    // No active descendant initially
    expect(input.getAttribute("aria-activedescendant")).toBeNull();

    // Navigate down — should point to the first option
    await user.keyboard("{ArrowDown}");
    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    // The option with that id should exist
    expect(document.getElementById(activeId!)).not.toBeNull();
  });
});
