import { test, expect } from "@playwright/test";

test.describe("Prepare Payment", () => {
  test("renders the form with all required fields", async ({ page }) => {
    await page.goto("/app/operate/prepare");
    await expect(page.locator("h1")).toHaveText("Prepare a payment");
    await expect(page.getByText("Prepare, validate, and understand a simulated payment.")).toBeVisible();
    await expect(page.locator("#beneficiary_iban")).toBeVisible();
    await expect(page.locator("#beneficiary_name")).toBeVisible();
    await expect(page.locator("#currency")).toBeVisible();
    await expect(page.locator("#amount")).toBeVisible();
    await expect(page.locator("#strictness")).toBeVisible();
  });

  test("keeps currency menu options at least 44px tall on narrow screens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/operate/prepare");
    await page.getByRole("combobox", { name: /currency/i }).click();

    const option = page.getByRole("option", { name: "USD" });
    await expect(option).toBeVisible();
    await expect.poll(async () => (await option.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
  });

  test("shows validation errors on empty submit", async ({ page }) => {
    await page.goto("/app/operate/prepare");
    await page.locator("button", { hasText: "Run payment checks" }).click();
    // IBAN field should show aria-invalid
    await expect(page.locator("#beneficiary_iban")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#prepare-validation-summary")).toHaveAttribute("role", "alert");
    await expect(page.locator("#beneficiary_iban")).toBeFocused();
  });

  test("keeps the stage indicator accessible and simulation-only", async ({ page }) => {
    await page.goto("/app/operate/prepare");
    await expect(page.getByRole("navigation", { name: /payment preparation stages/i })).toBeVisible();
    await expect(page.locator("[aria-current='step']")).toHaveText(/Payment details/);
    await expect(page.locator("body")).not.toContainText(/execute|executing|send money|send payment/i);
  });

  test("keeps the mobile action reachable below the form", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/operate/prepare");
    const action = page.locator(".prepare-payment__actions");
    await expect(action).toBeVisible();
    await expect(action.locator("button")).toHaveCSS("min-height", "44px");
    await expect(action).toHaveCSS("position", "sticky");
  });
});
