import { expect, test, type Page } from "@playwright/test";
import { containmentAudit, contrastAudit } from "./helpers/landingAudits";

/**
 * The landing page at /, served with RELAY_LANDING_ENABLED on (playwright.config.ts
 * gives this project its own flag-on server). It sets viewports, themes and motion
 * per test, so one Chromium project covers the matrix.
 */
const WIDTHS = [390, 768, 1024, 1440];
const PREFS = (overrides: Record<string, unknown>) =>
  JSON.stringify({ schemaVersion: 1, reducedMotion: false, navigationDensity: "comfortable", firstRunGuidanceSeen: [], theme: "system", ...overrides });
const SCROLL_STOPS = 12;

async function storePreferences(page: Page, value: string) {
  await page.addInitScript((raw) => localStorage.setItem("relay:preferences", raw), value);
}

async function sweep(page: Page, check: () => Promise<string[]>): Promise<string[]> {
  const found = new Set<string>();
  const height = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  for (let i = 0; i < SCROLL_STOPS; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round((height * i) / (SCROLL_STOPS - 1)));
    await page.waitForTimeout(150);
    for (const issue of await check()) found.add(issue);
  }
  return [...found];
}

test.describe("landing page layout and contrast", () => {
  for (const width of WIDTHS) {
    for (const theme of ["light", "dark", "black"] as const) {
      test(`${theme} at ${width}px: nothing overflows, every text pair passes AA, no errors`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(String(error)));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        await page.setViewportSize({ width, height: 900 });
        // Black is stored, so test it under an OS light setting: its block must be self-contained.
        await page.emulateMedia({ colorScheme: theme === "dark" ? "dark" : "light" });
        if (theme === "black") await storePreferences(page, PREFS({ theme: "black" }));
        await page.goto("/", { waitUntil: "load" });
        if (theme === "black") await expect(page.locator("html")).toHaveAttribute("data-theme", "black");

        expect(await sweep(page, () => page.evaluate(containmentAudit))).toEqual([]);
        expect(await sweep(page, () => page.evaluate(contrastAudit))).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  }
});

test.describe("landing page behaviour", () => {
  test("serves the landing page at / with the simulation stated", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toBe("no-cache");
    for (const selector of ["#hero", "#route", "#anatomy", "#data", "#tools", "footer"]) {
      await expect(page.locator(`${selector} [data-simulation]`).first()).toBeAttached();
    }
    await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  });

  test("rail tabs follow the WAI-ARIA keyboard pattern", async ({ page }) => {
    await page.goto("/");
    const tabs = page.getByRole("tab");
    await tabs.first().focus();
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.last()).toBeFocused();
    await expect(page.locator("#rail-panel-swift")).toBeVisible();
    await page.keyboard.press("Home");
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#rail-panel-gbp")).toBeVisible();
    await page.keyboard.press("End");
    await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#rail-panel-gbp")).toBeHidden();
  });

  test("a legend button activates its corridor and pausing holds the tour", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator("#tour-toggle");
    await expect(toggle).toHaveText("Pause tour");
    const third = page.locator("[data-corridor]").nth(2);
    await third.click();
    // Focusing a legend button pauses the tour (WCAG 2.2.2).
    await expect(toggle).toHaveText("Play tour");
    await expect(third).toHaveClass(/\bon\b/);
    await page.waitForTimeout(9000);
    await expect(third).toHaveClass(/\bon\b/);
    await toggle.click();
    await expect(toggle).toHaveText("Pause tour");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  test("the IBAN demo plays once, then offers Replay", async ({ page }) => {
    await page.goto("/");
    await page.locator("#iban-demo").scrollIntoViewIfNeeded();
    await expect(page.locator("#iban-replay")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#iban-checks .on")).toHaveCount(4);
  });

  test("counters keep the final value readable while they count", async ({ page }) => {
    await page.goto("/");
    const first = page.locator(".stats [data-count]").first();
    const text = (await first.textContent()) ?? "";
    await first.scrollIntoViewIfNeeded();
    await expect(first.locator(".sr")).toHaveText(text);
    await expect(first.locator(".sr")).toHaveCount(0, { timeout: 3000 });
    await expect(first).toHaveText(text);
  });

  test("a vertical swipe that starts on the mobile globe scrolls the page", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto("/");
    const box = (await page.locator(".globe-wrap").boundingBox())!;
    const x = box.x + box.width / 2;
    const y = Math.min(box.y + box.height / 2, 700);
    const cdp = await context.newCDPSession(page);
    const touch = (type: string, ty: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: ty }] });
    await touch("touchStart", y);
    for (let step = 1; step <= 10; step++) await touch("touchMove", y - step * 30);
    await touch("touchEnd", y - 300);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await context.close();
  });
});

test.describe("landing page without JavaScript or motion", () => {
  test("every section and every rail panel renders without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto("/");
    for (const id of ["hero", "route", "anatomy", "rails", "data", "learn", "tools"]) await expect(page.locator(`#${id}`)).toBeVisible();
    const panels = page.getByRole("tabpanel");
    const count = await panels.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i++) await expect(panels.nth(i)).toBeVisible();
    await expect(page.locator("#globe-stage")).toBeHidden();
    await expect(page.locator(".legend")).toBeVisible();
    await context.close();
  });

  for (const how of ["media query", "stored preference"] as const) {
    test(`reduced motion by ${how}: end states and no tour`, async ({ page }) => {
      if (how === "media query") await page.emulateMedia({ reducedMotion: "reduce" });
      else await storePreferences(page, PREFS({ reducedMotion: true }));
      await page.goto("/");
      await expect(page.locator("html")).not.toHaveClass(/\bmotion\b/);
      await expect(page.locator("#tour-toggle")).toBeHidden();
      await expect(page.locator("#iban-replay")).toBeHidden();
      const tag = page.locator("#route-stage .tag b").first();
      const [ink, colour] = await tag.evaluate((el) => [
        getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(),
        getComputedStyle(el).color,
      ]);
      expect(ink).not.toBe("");
      // End state: every hop is reached, so tags use the ink token, not muted.
      const muted = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--muted)";
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      });
      expect(colour).not.toBe(muted);
    });
  }
});
