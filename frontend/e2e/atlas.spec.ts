import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Correspondent Atlas", () => {
  test("loads the hub instrument with its map and text equivalent", async ({ page }) => {
    await page.goto("/app/explore/atlas", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Correspondent atlas" })).toBeVisible();
    await expect(page.locator(".atlas__metrics")).toBeVisible();
    await expect(page.locator(".atlas-map__svg")).toBeVisible();
    await expect(page.locator(".atlas-table")).toBeVisible();
    await expect(page.getByText(/not payment volume or market share/i)).toBeVisible();
  });

  test("scope toggle owns the URL and updates the rollup", async ({ page }) => {
    await page.goto("/app/explore/atlas", { waitUntil: "networkidle" });
    const rail = page.locator(".atlas__metrics");
    const allText = await rail.innerText();

    await page.getByRole("button", { name: "Rows with instruction fields" }).click();

    await expect(page).toHaveURL(/\/app\/explore\/atlas\?scope=settleable$/);
    await expect(rail).not.toHaveText(allText);
    await expect(page.getByText(/never-collected.*collected but out of scope.*collected and in scope/i)).toBeVisible();
  });

  test("country selection opens the panel and links to the bank directory", async ({ page }) => {
    await page.goto("/app/explore/atlas?view=spoke", { waitUntil: "networkidle" });
    const firstCountry = page.locator(".atlas-table--spoke .atlas-table__row").first();
    await expect(firstCountry).toBeVisible();
    await firstCountry.click();

    await expect(page.getByRole("heading", { name: /network position/i })).toBeVisible();
    await expect(page.locator(".atlas-panel a[href^='/app/explore/banks/']").first()).toBeVisible();
  });

  test("keeps the text equivalent first without horizontal overflow on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/explore/atlas", { waitUntil: "networkidle" });
    await expect(page.locator(".atlas-table")).toBeVisible();

    const order = await page.locator(".atlas__workarea").evaluate((workarea) => {
      const children = [...workarea.children].map((child) => child.className);
      return { children, scrollWidth: document.documentElement.scrollWidth };
    });
    expect(order.children.indexOf("atlas__table-column")).toBeLessThan(order.children.indexOf("atlas__map-column"));
    expect(order.scrollWidth).toBeLessThanOrEqual(390);
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await page.goto("/app/explore/atlas", { waitUntil: "networkidle" });
    await expect(page.locator(".atlas-table")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
