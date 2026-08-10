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
      completedModuleIds: ["lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6", "lab-7", "lab-8", "lab-9", "gbp-eur-rails", "cad-rails", "capstone"],
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
    // The worked example table comes first; the charge-code table follows.
    const worked = page.locator(".lab-table").first();
    await expect(worked).toContainText("Nostro account");
    const table = page.locator(".lab-table").nth(1);
    await expect(table).toContainText("Sender pays all fees"); // OUR
    await expect(table).toContainText("Fees shared"); // SHA
    await expect(table).toContainText("Beneficiary pays all fees"); // BEN
    await expect(page.getByText(/illustrative placeholders/i)).toBeVisible();
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

  test("Fees & FX module renders concept, simulator, and FX sections", async ({ page }) => {
    await page.goto("/app/learn/fees-fx", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expect(page.locator(".lab-content")).toBeVisible();
    await expect(page.getByText(/case of the missing \$25/i)).toBeVisible();
    // The three charge-code buttons
    for (const code of ["OUR", "SHA", "BEN"]) {
      await expect(page.getByRole("button", { name: code, exact: true })).toBeVisible();
    }
  });

  test("Fees & FX module renders the currency picker", async ({ page }) => {
    await page.goto("/app/learn/fees-fx", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const group = page.getByRole("group", { name: /currency/i });
    for (const ccy of ["USD", "CAD", "GBP", "EUR"]) {
      await expect(group.getByRole("button", { name: ccy })).toBeVisible();
    }
    // Switching to CAD swaps the demo chain
    await group.getByRole("button", { name: "CAD" }).click();
    await expect(page.getByText(/RBC Royal Bank/).first()).toBeVisible();
  });

  test("UK & Eurozone rails module renders deep-dive sections", async ({ page }) => {
    await page.goto("/app/learn/gbp-eur-rails", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expect(page.locator(".lab-content")).toBeVisible();
    await expect(page.getByRole("heading", { name: /CHAPS: the sterling RTGS/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Bacs: the three-day workhorse/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /one currency, one payment area/i })).toBeVisible();
    // Bacs cycle simulator round-trip
    await page.getByRole("button", { name: /Monday 09:00/ }).click();
    await expect(page.getByTestId("bacs-cycle-result")).toContainText("2026-07-22");
    // Live GBP rail detail from the real backend
    await page.getByRole("button", { name: "GBP", exact: true }).click();
    await expect(page.locator(".lab-rail-card").first()).toBeVisible();
  });

  test("Canada rails module renders deep-dive sections", async ({ page }) => {
    await page.goto("/app/learn/cad-rails", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expect(page.locator(".lab-content")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Lynx: wholesale finality/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /The Real-Time Rail/i })).toBeVisible();
    // Rail picker round-trip
    await page.getByRole("button", { name: /choose the rail/i }).click();
    await expect(page.getByTestId("cad-rail-result")).toContainText("Interac e-Transfer");
    // Live CAD rail detail from the real backend
    await page.getByRole("button", { name: "CAD", exact: true }).click();
    await expect(page.locator(".lab-rail-card").first()).toBeVisible();
  });

  test("Daily practice page renders intro with streak stats", async ({ page }) => {
    await page.goto("/app/learn/practice", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await expect(page.getByRole("heading", { name: /daily practice/i })).toBeVisible();
    await expect(page.getByText(/day streak/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /start today's five|practice again/i })).toBeVisible();
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
