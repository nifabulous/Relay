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
    await expect(page.getByRole("heading", { name: "USD" })).toBeVisible();
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
