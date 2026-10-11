import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The route showpiece on Prepare, Tracking and Atlas. Every assertion is
 * unconditional: each screen is seeded so the route must render.
 *
 *  - Prepare: the checks response is mocked (same approach as prepare.spec.ts)
 *    with a suggested intermediary, because the route only shows after checks.
 *  - Tracking: a real payment is created through POST /api/track/create.
 *  - Atlas: a real country that has correspondents is picked from the seeded
 *    /api/atlas data, so no country code is hard-coded.
 *
 * The `mobile` project is 390px wide and `desktop` is 1280px; the 390 and 1440
 * widths are also set explicitly below so the checks do not depend on which
 * project runs them.
 */

const WIDTHS = [390, 1440] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectRoute(page: Page, summary: RegExp) {
  const figure = page.locator("figure.lines-route");
  await expect(figure).toHaveCount(1);
  await expect(figure).toBeVisible();
  await expect(figure.getByRole("list").first()).toBeVisible();
  const caption = figure.locator("figcaption.sr");
  await expect(caption).toHaveCount(1);
  const text = (await caption.textContent())?.trim() ?? "";
  expect(text.length).toBeGreaterThan(0);
  expect(text).toMatch(summary);
  // The route ships static: it renders as its final state, with no reveal and
  // no pause control. Animation, if added later, brings its own checks.
  const line = figure.locator(".lines-route__drawn");
  await expect(line).toHaveCount(1);
  const drawn = await line.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      dasharray: element.getAttribute("stroke-dasharray"),
      dashoffset: element.getAttribute("stroke-dashoffset"),
      computedDasharray: style.strokeDasharray,
      animation: style.animationName,
      transition: style.transitionDuration,
    };
  });
  expect(drawn).toEqual({ dasharray: null, dashoffset: null, computedDasharray: "none", animation: "none", transition: "0s" });
  await expect(figure.getByRole("button")).toHaveCount(0);
}

/**
 * The screen root carries the landing scope, once, and the scope stylesheet is
 * actually loaded: its tokens resolve on the root and the route sits inside it.
 */
async function expectSurfaceRoot(page: Page, rootClass: string) {
  const root = page.locator(`.surface-landing.${rootClass}`);
  await expect(root).toHaveCount(1);
  await expect(root).toBeVisible();
  await expect(page.locator(".surface-landing .surface-landing")).toHaveCount(0);
  const resolved = await root.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      surface: style.getPropertyValue("--surface").trim(),
      remap: style.getPropertyValue("--color-surface").trim(),
      mono: style.getPropertyValue("--font-mono").trim(),
    };
  });
  // The production build minifies hex, so #FFFFFF arrives as #fff.
  expect(resolved.surface).toMatch(/^#[0-9a-f]{3,8}$/i);
  expect(resolved.remap.length).toBeGreaterThan(0);
  expect(resolved.mono).toContain("Geist Mono");
}

async function expectRouteInsideRoot(page: Page, rootClass: string) {
  await expect(page.locator(`.surface-landing.${rootClass} figure.lines-route`)).toHaveCount(1);
}

async function seedTracking(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/track/create", {
    data: {
      originator_bic: "CITIUS33XXX",
      originator_name: "Citibank",
      beneficiary_bic: "GTBINGLAXXX",
      beneficiary_name: "GTBank",
      currency: "USD",
      amount: 100,
    },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { uetr: string };
  expect(body.uetr).toBeTruthy();
  return body.uetr;
}

async function seedAtlasCountry(request: APIRequestContext): Promise<string> {
  const network = (await (await request.get("/api/atlas/network?scope=all")).json()) as {
    hub_countries: Array<{ iso2: string }>;
    spokes: Array<{ iso2: string; rows: number }>;
  };
  const hub = network.hub_countries[0]?.iso2;
  expect(hub).toBeTruthy();
  for (const spoke of network.spokes.filter((item) => item.rows > 0 && item.iso2 !== hub)) {
    const country = (await (await request.get(`/api/atlas/country/${spoke.iso2}?scope=all`)).json()) as {
      correspondents: unknown[];
    };
    if (country.correspondents.length > 0) return spoke.iso2;
  }
  throw new Error("The seeded atlas has no country with correspondents to route through.");
}

const prepareResponse = {
  recommendation: "PROCEED",
  reason: "Illustrative result",
  is_blocking: false,
  uetr: "e2e-uetr",
  validation: { valid: true, bic: "NWBKGB2LXXX", errors: [] },
  vop: { outcome: "MATCH", score: 1, advice: "Matches" },
  routing: {
    beneficiary_country: "GB",
    inferred_currency: "GBP",
    suggested_intermediaries: [
      { bic: "CITIUS33XXX", bank: "Citibank", corridor: "USD-GB", confidence: "high", basis: "published-ssi" },
    ],
    routing_basis: "published-ssi",
  },
  ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: false },
  warnings: ["Simulation"],
  blocks: [],
};

for (const width of WIDTHS) {
  test.describe(`route showpiece at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, reducedMotion: "reduce" });

    test("prepare shows the route with a summary after checks pass", async ({ page }) => {
      await page.route("**/api/prepare-payment", (route) => route.fulfill({ json: prepareResponse }));
      await page.goto("/app/operate/prepare");
      await expectSurfaceRoot(page, "prepare-payment");
      await page.locator("#beneficiary_iban").fill("GB29NWBK60161331926819");
      await page.locator("#beneficiary_name").fill("John Smith");
      await page.locator("#amount").fill("500");
      await page.getByRole("button", { name: /run payment checks/i }).click();
      await expect(page.locator('[data-request-state="success"]')).toBeVisible();

      await expectRoute(page, /Route from the sender through Citibank to John Smith\./);
      await expectRouteInsideRoot(page, "prepare-payment");
      await expectNoHorizontalOverflow(page);
    });

    test("tracking shows the route with a summary for a real payment", async ({ page, request }) => {
      const uetr = await seedTracking(request);
      await page.goto(`/app/operate/tracking?uetr=${encodeURIComponent(uetr)}`);
      await expectSurfaceRoot(page, "tracking-page");

      // Three events (INITIATED at CITIUS33, ACCEPTED and CREDITED at GTBINGLA) are two banks.
      await expectRoute(page, new RegExp(`Payment ${uetr} has revealed 2 banks\\.`));
      await expect(page.locator("figure.lines-route li")).toHaveCount(2);
      await expectRouteInsideRoot(page, "tracking-page");
      await expectNoHorizontalOverflow(page);
    });

    test("atlas shows the route for a selected country", async ({ page, request }) => {
      const iso2 = await seedAtlasCountry(request);
      await page.goto(`/app/explore/atlas?selected=${iso2}`, { waitUntil: "networkidle" });
      await expectSurfaceRoot(page, "atlas");

      await expectRoute(page, new RegExp(`^Route from [A-Z]{2} through .+ to ${iso2}\\.$`));
      await expectRouteInsideRoot(page, "atlas");
      await expectNoHorizontalOverflow(page);
    });
  });
}
