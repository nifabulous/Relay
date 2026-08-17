import { test, expect } from "@playwright/test";

test.describe("Tutor floating surface geometry", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/tutor/availability", (route) =>
      route.fulfill({ json: { available: true } }),
    );
    await page.goto("/app");
    await page.getByRole("button", { name: /tutor/i }).click();
    await expect(page.getByRole("log")).toBeVisible();
  });

  test("stays between the simulation banner and bottom navigation on mobile", async ({ page }) => {
    test.skip((await page.viewportSize())?.width! >= 1024, "mobile sheet assertion");

    const panel = page.getByRole("log");
    const banner = page.locator(".sim-banner");
    const navigation = page.locator('[aria-label="Mobile navigation"]');
    const panelBox = await panel.boundingBox();
    const bannerBox = await banner.boundingBox();
    const navigationBox = await navigation.boundingBox();

    expect(panelBox).not.toBeNull();
    expect(bannerBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    expect(panelBox!.y).toBeGreaterThanOrEqual(bannerBox!.y + bannerBox!.height);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(navigationBox!.y);
  });
});
