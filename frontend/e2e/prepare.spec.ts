import { test, expect, type Page } from "@playwright/test";

const validPrepareResponse = (overrides: Record<string, unknown> = {}) => ({
  recommendation: "PROCEED",
  reason: "Illustrative result",
  is_blocking: false,
  uetr: "e2e-uetr",
  validation: { valid: true, bic: "NWBKGB2LXXX", errors: [] },
  vop: { outcome: "MATCH", score: 1, advice: "Matches" },
  routing: {
    beneficiary_country: "GB",
    inferred_currency: "GBP",
    suggested_intermediaries: [],
  },
  ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
  warnings: ["Simulation"],
  blocks: [],
  ...overrides,
});

async function fillValidDetails(page: Page) {
  await page.locator("#beneficiary_iban").fill("GB29NWBK60161331926819");
  await page.locator("#beneficiary_name").fill("John Smith");
  await page.locator("#amount").fill("500");
}

async function submitDetails(page: Page) {
  await page.getByRole("button", { name: /run payment checks/i }).click();
}

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

  test("runs a successful production-route check and renders review evidence", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/prepare-payment", async (route) => {
      requests += 1;
      await route.fulfill({ json: validPrepareResponse() });
    });

    await page.goto("/app/operate/prepare");
    await fillValidDetails(page);
    await submitDetails(page);

    await expect(page.locator('[data-request-state="success"]')).toBeVisible();
    await expect(page.locator("[aria-current='step']")).toHaveText(/Review route/);
    expect(requests).toBe(1);
  });

  test("renders an explicit NOT_CHECKED response as a partial review", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/prepare-payment", async (route) => {
      requests += 1;
      await route.fulfill({
        json: validPrepareResponse({
          vop: { outcome: "NOT_CHECKED", score: null, advice: "No account to check" },
        }),
      });
    });

    await page.goto("/app/operate/prepare");
    await fillValidDetails(page);
    await submitDetails(page);

    await expect(page.locator('[data-request-state="partial"]')).toBeVisible();
    await expect(page.getByText(/some evidence was not available/i)).toBeVisible();
    expect(requests).toBe(1);
  });

  test("shows a request error and retries the production-route request", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/prepare-payment", async (route) => {
      requests += 1;
      if (requests === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Temporary failure" }),
        });
        return;
      }
      await route.fulfill({ json: validPrepareResponse({ uetr: "retry-uetr" }) });
    });

    await page.goto("/app/operate/prepare");
    await fillValidDetails(page);
    await submitDetails(page);

    const error = page.locator(".prepare-payment__api-error");
    await expect(error).toContainText("Temporary failure");
    await expect(page.locator("[aria-current='step']")).toHaveText(/Run checks/);
    await error.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator('[data-request-state="success"]')).toBeVisible();
    expect(requests).toBe(2);
  });

  test("re-checks a stale result with the current production-route inputs", async ({ page }) => {
    const requestBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/prepare-payment", async (route) => {
      requestBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        json: validPrepareResponse({ uetr: `stale-recheck-${requestBodies.length}` }),
      });
    });

    await page.goto("/app/operate/prepare");
    await fillValidDetails(page);
    await submitDetails(page);
    await expect(page.locator('[data-request-state="success"]')).toBeVisible();

    await page.locator("#amount").fill("501");
    await expect(page.locator(".prepare-payment__stale")).toBeVisible();
    await expect(page.locator("[aria-current='step']")).toHaveText(/Review route/);
    await submitDetails(page);

    await expect(page.locator('[data-request-state="success"]')).toBeVisible();
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1].amount).toBe(501);
  });

  test("keeps the mobile action and result reachable above fixed navigation after scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let requests = 0;
    await page.route("**/api/prepare-payment", async (route) => {
      requests += 1;
      await route.fulfill({ json: validPrepareResponse() });
    });

    await page.goto("/app/operate/prepare");
    await fillValidDetails(page);
    await submitDetails(page);
    await expect(page.locator('[data-request-state="success"]')).toBeVisible();

    await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".app-shell__main");
      main?.scrollTo({ top: main.scrollHeight, behavior: "instant" as ScrollBehavior });
    });
    const geometry = await page.evaluate(() => {
      const action = document.querySelector<HTMLElement>(".prepare-payment__actions");
      const button = action?.querySelector<HTMLElement>("button");
      const nav = document.querySelector<HTMLElement>(".app-shell__mobile-nav");
      const result = document.querySelector<HTMLElement>(".prepare-payment__results");
      const actionBox = action?.getBoundingClientRect();
      const buttonBox = button?.getBoundingClientRect();
      const navBox = nav?.getBoundingClientRect();
      const resultBox = result?.getBoundingClientRect();
      return {
        actionBottom: actionBox?.bottom ?? 0,
        buttonBottom: buttonBox?.bottom ?? 0,
        navTop: navBox?.top ?? 0,
        resultTop: resultBox?.top ?? 0,
        viewportBottom: window.innerHeight,
      };
    });

    expect(geometry.actionBottom).toBeLessThan(geometry.navTop);
    expect(geometry.buttonBottom).toBeLessThan(geometry.navTop);
    expect(geometry.resultTop).toBeLessThan(geometry.viewportBottom);
    await page.locator(".prepare-payment__actions button").click();
    expect(requests).toBe(2);
  });
});
