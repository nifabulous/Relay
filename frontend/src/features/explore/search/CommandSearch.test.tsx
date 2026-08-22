import { beforeEach, describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandSearch } from "./CommandSearch";
import { server } from "../../../test/server";

function renderSearch(initialQuery = "", onNavigate?: (href: string) => void) {
  const user = userEvent.setup();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CommandSearch initialQuery={initialQuery} onNavigate={onNavigate} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user, ...utils };
}

describe("CommandSearch", () => {
  beforeEach(() => localStorage.clear());
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

  it("does not write history while typing", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { user } = renderSearch();

    await user.type(screen.getByRole("searchbox"), "IBAN");

    expect(setItem).not.toHaveBeenCalledWith("relay:search-history:v1", expect.any(String));
    setItem.mockRestore();
  });

  it("records and navigates a clicked result", async () => {
    const navigate = vi.fn();
    const { user } = renderSearch("IBAN", navigate);

    await user.click(screen.getAllByRole("option", { name: /IBAN/i })[0]);

    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("/app/explore/glossary"));
    expect(JSON.parse(localStorage.getItem("relay:search-history:v1") ?? "[]")).toEqual(["IBAN"]);
  });

  it("records and navigates with the same handler on Enter", async () => {
    const navigate = vi.fn();
    const { user } = renderSearch("IBAN", navigate);
    const input = screen.getByRole("searchbox");
    await user.click(input);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("/app/explore/glossary"));
    expect(JSON.parse(localStorage.getItem("relay:search-history:v1") ?? "[]")).toEqual(["IBAN"]);
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("shows grouped destinations and removable recent searches for an empty focused query", async () => {
    localStorage.setItem("relay:search-history:v1", JSON.stringify(["IBAN", "CITIUS33"]));
    const { user } = renderSearch();

    await user.click(screen.getByRole("searchbox"));

    expect(screen.getByText("Bank Directory")).toBeVisible();
    expect(screen.getAllByText("Payment Schemes")[0]).toBeVisible();
    expect(screen.getAllByText("Glossary")[0]).toBeVisible();
    expect(screen.getByText("Recent searches")).toBeVisible();
    expect(screen.getByRole("button", { name: /remove iban/i })).toBeVisible();
  });

  it("keeps recent-search controls outside the listbox option model", async () => {
    localStorage.setItem("relay:search-history:v1", JSON.stringify(["IBAN"]));
    const { user } = renderSearch();
    const input = screen.getByRole("searchbox");

    await user.click(input);

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByRole("button", { name: /remove iban/i })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Recent searches" })).toContainElement(
      screen.getByRole("button", { name: /remove iban/i }),
    );

    await user.keyboard("{ArrowDown}");
    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    expect(document.getElementById(activeId!)).toHaveAttribute("role", "option");
  });

  it("removes a recent search and persists the updated list", async () => {
    localStorage.setItem("relay:search-history:v1", JSON.stringify(["IBAN", "CITIUS33"]));
    const { user } = renderSearch();

    await user.click(screen.getByRole("searchbox"));
    await user.click(screen.getByRole("button", { name: /remove iban/i }));

    expect(screen.queryByRole("button", { name: /remove iban/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove CITIUS33/i })).toBeVisible();
    expect(JSON.parse(localStorage.getItem("relay:search-history:v1") ?? "[]")).toEqual(["CITIUS33"]);
  });

  it("opens the empty-query panel when a focused query is cleared", async () => {
    const { user } = renderSearch();
    const input = screen.getByRole("searchbox");

    await user.type(input, "IBAN");
    await user.clear(input);

    expect(input).toHaveFocus();
    expect(screen.getByText("Bank Directory")).toBeVisible();
    expect(screen.getAllByText("Payment Schemes")[0]).toBeVisible();
    expect(screen.getAllByText("Glossary")[0]).toBeVisible();
  });

  it("preserves focus for deep-link results and announces result state", async () => {
    renderSearch("IBAN");
    const input = screen.getByRole("searchbox");

    expect(input).not.toHaveFocus();
    expect(await screen.findByText("IBAN")).toBeVisible();
    await waitFor(() => expect(screen.getAllByRole("status").at(-1)).toHaveTextContent(/result/i));
  });

  it("debounces bank directory lookup until typing settles", async () => {
    let requests = 0;
    server.use(
      http.get("/api/banks/search", async ({ request }) => {
        requests += 1;
        return HttpResponse.json({ query: new URL(request.url).searchParams.get("q"), results: [] });
      }),
    );
    const { user } = renderSearch();

    await user.type(screen.getByRole("searchbox"), "citibank");
    expect(requests).toBe(0);
    await waitFor(() => expect(requests).toBe(1), { timeout: 1000 });
  });

  it("renders result context and recovers from no results", async () => {
    const { user } = renderSearch();
    const input = screen.getByRole("searchbox");
    await user.type(input, "zzzznotfound");
    expect(await screen.findByText(/no results/i)).toBeVisible();

    await user.clear(input);
    await user.type(input, "IBAN");
    const option = (await screen.findAllByRole("option", { name: /IBAN/i }))[0];
    expect(within(option).getByText(/International Bank Account Number/i)).toBeVisible();
  });
});
