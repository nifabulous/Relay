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

  test("keeps the Explore search input clear of its icon", async ({ page }) => {
    await page.goto("/app/explore");
    const input = page.locator(".command-search__input");
    await expect(input).toBeVisible();

    await expect(input).toHaveCSS("padding-left", "38px");
  });

  test("searches by bank name and opens the matching bank detail", async ({ page }) => {
    await page.goto("/app/explore");
    await expect(page.locator("h1")).toHaveText("Explore", { timeout: 10_000 });

    await page.locator('input[type="search"]').fill("Guaranty Trust Bank");
    const result = page.getByRole("option", { name: /Guaranty Trust Bank/i }).first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    await expect(page).toHaveURL(/\/app\/explore\/banks\/GTBINGLAXXX$/);
    await expect(
      page.getByRole("heading", { name: "Guaranty Trust Bank" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("deep-linked search preserves focus and shows grouped results", async ({ page }) => {
    await page.goto("/app/explore?q=IBAN");
    await expect(page.locator('input[type="search"]')).toHaveValue("IBAN");
    await expect(page.locator(".command-search__results")).toBeVisible();
    await expect(
      page.locator(".command-search__group-label").filter({ hasText: /^Glossary$/ }),
    ).toBeVisible();
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
    await removeIban.scrollIntoViewIfNeeded();

    const isMobileViewport = (page.viewportSize()?.width ?? 0) <= 1023;
    if (isMobileViewport) {
      const mobileNav = page.locator(".app-shell__mobile-nav");
      await expect(mobileNav).toHaveCount(1);
      await expect(mobileNav).toBeVisible();
    }

    const reachability = await page.evaluate(() => {
      const remove = document.querySelector<HTMLElement>(
        '[aria-label="Remove IBAN from recent searches"]',
      );
      const nav = document.querySelector<HTMLElement>(".app-shell__mobile-nav");
      const removeBox = remove?.getBoundingClientRect();
      const navStyle = nav ? getComputedStyle(nav) : null;
      return {
        removeBottom: removeBox?.bottom ?? 0,
        navTop: nav?.getBoundingClientRect().top ?? window.innerHeight,
        navVisible: Boolean(
          navStyle && navStyle.display !== "none" && navStyle.visibility !== "hidden",
        ),
      };
    });
    if (isMobileViewport || reachability.navVisible) {
      expect(reachability.removeBottom).toBeLessThanOrEqual(reachability.navTop);
    }

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

  test("keeps result and recent-search controls at a 44px touch target on 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem("relay:search-history:v1", JSON.stringify(["IBAN"]));
    });
    await page.goto("/app/explore");

    const input = page.locator('input[type="search"]');
    await input.fill("IBAN");
    const result = page.locator(".command-search__item").first();
    await expect(result).toBeVisible();
    const resultHeight = await result.evaluate((element) => element.getBoundingClientRect().height);
    expect(resultHeight).toBeGreaterThanOrEqual(44);

    await input.clear();
    const remove = page.getByRole("button", { name: "Remove IBAN from recent searches" });
    await expect(remove).toBeVisible();
    const removeHeight = await remove.evaluate((element) => element.getBoundingClientRect().height);
    expect(removeHeight).toBeGreaterThanOrEqual(44);
  });

  test("activates search results without duplicating the app basename", async ({ page }) => {
    await page.goto("/app/explore");
    const input = page.locator('input[type="search"]');
    await input.fill("IBAN");
    await page.locator(".command-search__item").filter({ hasText: "IBAN" }).first().click();
    await expect(page).toHaveURL(/\/app\/explore\/glossary\?term=IBAN$/);

    await page.goto("/app/explore");
    await input.fill("IBAN");
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/app\/explore\/glossary\?term=IBAN$/);
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
