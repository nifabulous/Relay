import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Lab 8 is gated behind completing lab-7; seed the real persisted shape
  // (relay:progress -> { schemaVersion, completedModuleIds }), not "completed".
  await page.addInitScript(() => {
    localStorage.setItem(
      "relay:progress",
      JSON.stringify({
        schemaVersion: 1,
        completedModuleIds: ["lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6", "lab-7"],
      }),
    );
  });
});

test.describe("Lab 8: Message Standards", () => {
  test("loads and renders the field-mapping question", async ({ page }) => {
    await page.goto("/app/learn/lab-8", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000); // allow lazy chunk to load

    await expect(page.locator("h1")).toContainText(/message standards/i, { timeout: 15_000 });
    await expect(
      page.getByText(/Field 59 \(Beneficiary Customer\) maps to which pacs\.008 element\?/i),
    ).toBeVisible();
  });

  test("generates pacs.008 from the sample MT103", async ({ page }) => {
    await page.goto("/app/learn/lab-8", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    await page.getByRole("button", { name: /generate pacs\.008/i }).click();
    await expect(page.getByText(/MT103 → pacs\.008 field mapping/i)).toBeVisible({ timeout: 10_000 });
  });
});
