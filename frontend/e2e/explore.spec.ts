import { test, expect } from "@playwright/test";

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
