import { expect, test } from "@playwright/test";

// One browser-driven probe intentionally covers the breakpoint boundary itself
// (768 → 769 → 1024) so the contract is checked without duplicating every
// assertion across all configured Playwright projects.
test("keeps major two-column layouts below the 1024px breakpoint", async ({ page }) => {
  test.skip(
    test.info().project.name !== "case-tablet-768",
    "Runs its own explicit boundary-width matrix",
  );

  const routes = [
    { path: "/app/operate/fees", selector: ".fee-page__layout", heading: "Fee calculator" },
    { path: "/app/operate/screening", selector: ".screening-page__layout", heading: "Sanctions screening" },
    { path: "/app/operate/value-date", selector: ".value-date-page__layout", heading: "Value date checker" },
    { path: "/app/explore/banks/SBININBBXXX", selector: ".bank-detail__body", heading: "State Bank of India" },
  ];

  for (const route of routes) {
    for (const width of [768, 769, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route.path, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible({ timeout: 10_000 });

      const columnCount = await page
        .locator(route.selector)
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);

      expect(columnCount, `${route.selector} at ${width}px`).toBe(width >= 1024 ? 2 : 1);
    }
  }
});
