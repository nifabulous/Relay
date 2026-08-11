import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test.describe("Learn", () => {
  test("curriculum shows all modules", async ({ page }) => {
    await page.goto("/app/learn");
    // Wait for lazy-loaded page
    await expect(page.locator("h1")).toHaveText("Learn", { timeout: 10_000 });
    const modules = page.locator(".learn-module");
    expect(await modules.count()).toBe(16);
  });

  test("lab-2 is locked without lab-1 complete", async ({ page }) => {
    await page.goto("/app/learn");
    await expect(page.locator("h1")).toHaveText("Learn", { timeout: 10_000 });
    // Target lab-2 specifically by its number
    const lab2 = page.locator(".learn-module").filter({ hasText: /^2/ });
    await expect(lab2).toHaveClass(/learn-module--locked/);
  });

  test("lab-1 module page renders content", async ({ page }) => {
    // Navigate directly to avoid SPA navigation timing issues
    await page.goto("/app/learn/lab-1", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000); // Allow lazy chunk to load
    await expect(page.locator("h1")).toContainText("Identifiers", { timeout: 15_000 });
  });
});
