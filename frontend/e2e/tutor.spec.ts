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

    const panel = page.locator(".tutor-floating-panel");
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

  test("respects the banner and navigation at a constrained mobile height", async ({ page }) => {
    test.skip((await page.viewportSize())?.width! >= 1024, "mobile sheet assertion");
    await page.setViewportSize({ width: 390, height: 360 });
    await page.reload();
    await page.getByRole("button", { name: /tutor/i }).click();
    await expect(page.getByRole("log")).toBeVisible();

    const panel = page.locator(".tutor-floating-panel");
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

  test("keeps the desktop panel below the banner and outside the navigation rail", async ({ page }) => {
    test.skip((await page.viewportSize())?.width! < 1024, "desktop panel assertion");

    const panel = page.locator(".tutor-floating-panel");
    const banner = page.locator(".sim-banner");
    const navigation = page.locator('[aria-label="Primary navigation"]');
    const panelBox = await panel.boundingBox();
    const bannerBox = await banner.boundingBox();
    const navigationBox = await navigation.boundingBox();
    const viewport = page.viewportSize();

    expect(panelBox).not.toBeNull();
    expect(bannerBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(panelBox!.y).toBeGreaterThanOrEqual(bannerBox!.y + bannerBox!.height);
    expect(panelBox!.x).toBeGreaterThanOrEqual(navigationBox!.x + navigationBox!.width);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(viewport!.height);
  });
});
