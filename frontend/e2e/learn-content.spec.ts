import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Pre-complete all labs so no module is prerequisite-locked
  await page.addInitScript(() => {
    localStorage.setItem("relay:preferences", JSON.stringify({
      schemaVersion: 1,
      reducedMotion: false,
      navigationDensity: "comfortable",
      firstRunGuidanceSeen: [],
    }));
    localStorage.setItem("relay:progress", JSON.stringify({
      schemaVersion: 1,
      completedModuleIds: ["lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6", "lab-7", "capstone"],
    }));
    localStorage.setItem("relay:legacy-imported", "1");
  });
});

test.describe("Lab content parity", () => {
  test("Lab 1 renders BIC/IBAN decompositions", async ({ page }) => {
    await page.goto("/app/learn/lab-1", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expect(page.locator(".lab-content")).toBeVisible();
    // Target the decompose value elements specifically
    await expect(page.locator(".lab-decompose__value", { hasText: "CITI" })).toBeVisible();
    await expect(page.locator(".lab-decompose__value", { hasText: "NWBK" })).toBeVisible();
  });

  test("Lab 1 has the live analyzer", async ({ page }) => {
    await page.goto("/app/learn/lab-1", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expect(page.getByPlaceholder(/enter a BIC or IBAN/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /analyze/i })).toBeVisible();
  });

  test("Lab 2 renders MOD-97 concept and demo", async ({ page }) => {
    await page.goto("/app/learn/lab-2", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { name: /checksums.*MOD-97|MOD-97.*checksum/i })).toBeVisible();
    await expect(page.locator(".lab-content")).toContainText("DE89370400440532013000");
  });

  test("Lab 3 renders VoP outcome table", async ({ page }) => {
    await page.goto("/app/learn/lab-3", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    // Outcome names appear in the table cells
    const table = page.locator(".lab-table");
    await expect(table).toContainText("CLOSE_MATCH");
    await expect(table).toContainText("NO_MATCH");
    await expect(table).toContainText("NOT_CHECKED");
  });

  test("Lab 4 renders route demo form", async ({ page }) => {
    await page.goto("/app/learn/lab-4", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/Route a payment/i)).toBeVisible();
    await expect(page.getByLabel(/Beneficiary BIC/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /find.*intermediar/i })).toBeVisible();
  });

  test("Lab 5 renders SSI lookup and charge codes", async ({ page }) => {
    await page.goto("/app/learn/lab-5", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    // Charge code table should have the definitions
    const table = page.locator(".lab-table").first();
    await expect(table).toContainText("Sender pays all fees"); // OUR
    await expect(table).toContainText("Fees shared"); // SHA
    await expect(table).toContainText("Beneficiary pays all fees"); // BEN
    await expect(page.getByText(/placeholder/i)).toBeVisible();
  });

  test("Lab 6 renders tracking form", async ({ page }) => {
    await page.goto("/app/learn/lab-6", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expect(page.locator(".lab-content")).toBeVisible();
    await expect(page.locator(".lab-content")).toContainText("Create & track");
    await expect(page.locator(".lab-content")).toContainText("Simulation");
  });

  test("Lab 7 renders currency picker and quizzes", async ({ page }) => {
    await page.goto("/app/learn/lab-7", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expect(page.locator(".lab-currency-pill", { hasText: "GBP" })).toBeVisible();
    const fieldsets = page.locator("fieldset.lab-multiple-choice");
    expect(await fieldsets.count()).toBeGreaterThanOrEqual(7);
  });

  test("Capstone renders step indicator when unlocked", async ({ page }) => {
    await page.goto("/app/learn/capstone", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    // All labs are pre-completed in beforeEach, so capstone is unlocked
    await expect(page.locator(".lab-content")).toBeVisible();
    await expect(page.locator(".lab-step-indicator")).toBeVisible();
  });

  test("No module shows placeholder text", async ({ page }) => {
    for (const labId of ["lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6", "lab-7"]) {
      await page.goto(`/app/learn/${labId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      // The old placeholder sentence must not appear
      expect(await page.getByText(/covers the fundamentals/i).count()).toBe(0);
    }
  });
});
