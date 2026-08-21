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

test.describe("Overview adaptive command center", () => {
  test("renders the adaptive action and Learning Pulse regions", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await expect(page.getByText("Your payment routing learning hub.")).toBeVisible();
    await expect(page.locator(".overview__action-title")).toContainText(/payments move/i);
    await expect(page.getByRole("complementary", { name: /learning pulse/i })).toBeVisible();
    await expect(page.getByText("Recent activity")).toBeVisible();
  });

  test("keeps exactly one primary CTA with the selected destination", async ({ page }) => {
    await page.goto("/app");
    const cta = page.locator(".overview__cta");
    await expect(cta).toHaveCount(1);
    // The basename is part of the rendered href in the real router.
    await expect(cta).toHaveAttribute("href", "/app/explore?intro=1");
  });

  test("keeps the four quick routes as real links", async ({ page }) => {
    await page.goto("/app");
    const routes = [
      [/^Search/i, "/app/explore"],
      [/^Directory/i, "/app/explore/banks"],
      [/^Track/i, "/app/operate"],
      [/^Practice/i, "/app/learn/practice"],
    ] as const;
    for (const [name, href] of routes) {
      await expect(page.getByRole("link", { name }).first()).toHaveAttribute("href", href);
    }
  });

  test("has no horizontal overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
