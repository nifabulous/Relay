import { test, expect } from "@playwright/test";

test.describe("Overview page", () => {
  test("renders the Relay brand and simulation banner", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator(".app-shell__brand-name")).toHaveText("Relay");
    await expect(page.locator(".sim-banner")).toBeVisible();
    await expect(page.locator(".sim-banner")).toContainText(/not a real payment/i);
  });

  test("shows one dominant primary action", async ({ page }) => {
    await page.goto("/app");
    // Exactly one primary CTA button
    const cta = page.locator(".overview__cta");
    await expect(cta).toHaveCount(1);
    await expect(cta).toBeVisible();
  });

  test("navigation has four destinations", async ({ page }) => {
    await page.goto("/app");
    const nav = page.locator('[aria-label="Primary navigation"]');
    await expect(nav.locator("a")).toHaveCount(4);
    await expect(nav).toContainText("Overview");
    await expect(nav).toContainText("Learn");
    await expect(nav).toContainText("Explore");
    await expect(nav).toContainText("Operate");
  });

  test("Explore page renders via direct navigation", async ({ page }) => {
    await page.goto("/app/explore", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000); // Allow lazy chunk to load
    await expect(page.locator("h1")).toHaveText("Explore", { timeout: 15_000 });
  });
});
