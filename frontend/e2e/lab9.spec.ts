import { test, expect } from "@playwright/test";

test("Lab 9 loads enriched rail detail and runs a mechanic", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("relay:progress", JSON.stringify({
      schemaVersion: 1,
      completedModuleIds: ["lab-1","lab-2","lab-3","lab-4","lab-5","lab-6","lab-7","lab-8"],
    }));
    localStorage.setItem("relay:legacy-imported", "1");
  });
  await page.goto("/app/learn/lab-9", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await expect(page.getByRole("heading", { name: /rails deep-dive/i })).toBeVisible();
  await expect(page.locator(".lab-content")).toContainText("Interac e-Transfer");
  await expect(page.locator(".lab-content")).toContainText("CHAPS");
  await page.getByRole("button", { name: /check.*chaps/i }).click();
  await page.waitForTimeout(2000);
  await expect(page.locator(".lab-content")).toContainText("REPAIRABLE");
});
