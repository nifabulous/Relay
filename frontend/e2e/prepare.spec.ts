import { test, expect } from "@playwright/test";

test.describe("Prepare Payment", () => {
  test("renders the form with all required fields", async ({ page }) => {
    await page.goto("/app/operate/prepare");
    await expect(page.locator("h1")).toHaveText("Prepare payment");
    await expect(page.locator("#beneficiary_iban")).toBeVisible();
    await expect(page.locator("#beneficiary_name")).toBeVisible();
    await expect(page.locator("#currency")).toBeVisible();
    await expect(page.locator("#amount")).toBeVisible();
    await expect(page.locator("#strictness")).toBeVisible();
  });

  test("shows validation errors on empty submit", async ({ page }) => {
    await page.goto("/app/operate/prepare");
    await page.locator("button", { hasText: "Run payment checks" }).click();
    // IBAN field should show aria-invalid
    await expect(page.locator("#beneficiary_iban")).toHaveAttribute("aria-invalid", "true");
  });
});
