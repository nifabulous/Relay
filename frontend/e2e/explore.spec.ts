import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Explore", () => {
  test("search shows results for 'IBAN'", async ({ page }) => {
    await page.goto("/app/explore");
    // Wait for lazy-loaded page to render
    await expect(page.locator("h1")).toHaveText("Explore", { timeout: 10_000 });
    await page.locator('input[type="search"]').fill("IBAN");
    // Should show at least one result containing "IBAN"
    await expect(page.locator(".command-search__results")).toBeVisible();
    const items = page.locator(".command-search__item");
    expect(await items.count()).toBeGreaterThanOrEqual(1);
  });

  test("deep-linked search preserves focus and shows grouped results", async ({ page }) => {
    await page.goto("/app/explore?q=IBAN");
    await expect(page.locator('input[type="search"]')).toHaveValue("IBAN");
    await expect(page.locator(".command-search__results")).toBeVisible();
    await expect(page.locator(".command-search__group-label")).toContainText("Glossary");
    await expect(page.locator('input[type="search"]')).not.toBeFocused();
  });

  test("removing a recent search updates the visible list and localStorage", async ({ page }) => {
    await page.goto("/app/explore");
    await page.evaluate(() => {
      localStorage.setItem("relay:search-history:v1", JSON.stringify(["IBAN", "CITIUS33"]));
    });
    await page.reload();

    const input = page.locator('input[type="search"]');
    await input.click();
    const removeIban = page.getByRole("button", { name: "Remove IBAN from recent searches" });
    await expect(removeIban).toBeVisible();
    await removeIban.click();

    await expect(removeIban).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove CITIUS33 from recent searches" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("relay:search-history:v1")))
      .toBe(JSON.stringify(["CITIUS33"]));
  });

  test("search rows remain readable at 390px without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/explore");
    await page.locator('input[type="search"]').fill("IBAN");
    await expect(page.locator(".command-search__item").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("glossary page shows terms", async ({ page }) => {
    await page.goto("/app/explore/glossary");
    // Wait for lazy-loaded page to render
    await expect(page.locator("h1")).toHaveText("Glossary", { timeout: 10_000 });
    // Should have at least 20 glossary entries
    const entries = page.locator(".glossary-entry");
    expect(await entries.count()).toBeGreaterThan(20);
  });
});

test.describe("Bank detail", () => {
  test("deep link shows published settlement instructions grouped by currency", async ({ page }) => {
    await page.goto("/app/explore/banks/SBININBBXXX", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "State Bank of India" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Published settlement instructions" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /USD/ })).toBeVisible();
  });

  test("a bank without SSI shows the heuristic route instead", async ({ page }) => {
    await page.goto("/app/explore/banks/COBADEFFXXX", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "Heuristic correspondent route" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Published settlement instructions" }),
    ).toHaveCount(0);
  });

  test("an unknown BIC degrades to a not-found state", async ({ page }) => {
    // XXXXUS33XXX: the plan's original ZZZZZZ99XXX is rejected by the API's BIC
    // validation (non-ISO country code "99" -> 400 before lookup), so a
    // valid-format-but-absent BIC is required to reach the not-found path.
    await page.goto("/app/explore/banks/XXXXUS33XXX", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "Bank not found" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: "Back to Bank Directory" }),
    ).toBeVisible();
  });

  test("axe: no serious violations on bank detail", async ({ page }) => {
    await page.goto("/app/explore/banks/SBININBBXXX", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "State Bank of India" }),
    ).toBeVisible({ timeout: 10_000 });

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
