/**
 * The legacy capstone at /learn (app/static/js/learn-capstone.js) is plain
 * browser JavaScript with no test harness of its own. Load the real file —
 * and the real LearnUtils.esc it depends on — into jsdom and drive it through
 * the DOM, with MSW standing in for the API exactly as in the Relay tests.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const UTILS_SOURCE = readFileSync(resolve(REPO_ROOT, "app/static/js/learn-utils.js"), "utf8");
const CAPSTONE_SOURCE = readFileSync(resolve(REPO_ROOT, "app/static/js/learn-capstone.js"), "utf8");

type LegacyLab = (main: HTMLElement, helpers: Record<string, unknown>) => void;

// Same contract as el() in app/static/js/learn.js, which the lab receives as a helper.
function el(tag: string, className?: string, html?: string) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html != null) e.innerHTML = html;
  return e;
}

function mountLegacyCapstone() {
  const legacyWindow: { LearnUtils?: unknown; LearnLabs?: Record<string, LegacyLab> } = {};
  new Function("window", UTILS_SOURCE)(legacyWindow);
  const labs: Record<string, LegacyLab> = {};
  legacyWindow.LearnLabs = labs;
  new Function("window", "LearnLabs", "LearnUtils", CAPSTONE_SOURCE)(legacyWindow, labs, legacyWindow.LearnUtils);

  const main = document.createElement("main");
  document.body.appendChild(main);
  const markComplete = vi.fn();
  labs.capstone(main, { el, glossify: (text: string) => text, markComplete });
  return { main, markComplete };
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} is not in the document`);
  return found as T;
}

async function clickWhenPresent(id: string) {
  await waitFor(() => expect(document.getElementById(id)).not.toBeNull());
  byId(id).click();
}

const NO_BIC_IBAN = "GB82WEST12345698765432";

interface Captured {
  validateValues: string[];
  requestUrls: string[];
  prepareBodies: Record<string, unknown>[];
  trackBodies: Record<string, unknown>[];
}

function mockApi(): Captured {
  const captured: Captured = { validateValues: [], requestUrls: [], prepareBodies: [], trackBodies: [] };
  server.use(
    http.all("/api/*", ({ request }) => {
      captured.requestUrls.push(request.url);
    }),
    http.get("/api/validate", ({ request }) => {
      const value = new URL(request.url).searchParams.get("value") ?? "";
      captured.validateValues.push(value);
      if (value === NO_BIC_IBAN) {
        return HttpResponse.json({ input: value, input_type: "iban", valid: true, bic: null, bank: null, errors: [] });
      }
      if (value === "GB29NWBK60161331926819") {
        return HttpResponse.json({
          input: value, input_type: "iban", valid: true, bic: "NWBKGB2LXXX",
          bank: { bic: "NWBKGB2LXXX", bank_name: "NatWest", country_code: "GB" }, errors: [],
        });
      }
      if (value.toUpperCase() === "BARCGB22") {
        return HttpResponse.json({
          input: value, input_type: "bic", valid: true, bic: "BARCGB22XXX",
          bank: { bic: "BARCGB22XXX", bank_name: "Barclays", country_code: "GB" }, errors: [],
        });
      }
      return HttpResponse.json({
        input: value, input_type: "bic", valid: false, bic: null, bank: null,
        errors: [`Enter a valid SWIFT BIC — it must be 8 or 11 characters (you entered ${value.length}).`],
      });
    }),
    http.post("/api/verify-payee", () =>
      HttpResponse.json({ iban: NO_BIC_IBAN, submitted_name: "John Smith", outcome: "MATCH", score: 1.0, advice: "Name matches." }),
    ),
    http.get("/api/route", () =>
      HttpResponse.json({
        bic: "BARCGB22XXX", currency: "USD", valid: true, beneficiary_country: "GB",
        suggested_intermediaries: [{ bic: "CHASUS33XXX", bank: "JPMorgan Chase", corridor: "USD->GB", confidence: "high" }],
        notes: "Test",
      }),
    ),
    http.get("/api/ssi", () =>
      HttpResponse.json({ beneficiary_bic: "BARCGB22XXX", currency: "USD", instructions: [], disclaimer: "SIMULATION" }),
    ),
    http.post("/api/prepare-payment", async ({ request }) => {
      captured.prepareBodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({
        recommendation: "PROCEED", reason: "All checks passed", is_blocking: false, uetr: "legacy-uetr",
        validation: { valid: true, bic: "BARCGB22XXX", errors: [] },
        vop: { outcome: "MATCH", score: 1.0, advice: "ok" },
        routing: { suggested_intermediaries: [] },
        ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: true },
        warnings: [], blocks: [],
      });
    }),
    http.post("/api/track/create", async ({ request }) => {
      captured.trackBodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({
        uetr: "legacy-uetr", current_status: "CREDITED", is_terminal: true,
        sent_amount: "5000.00", final_amount: "5000.00", total_fees: 0,
        timeline: [{ status: "CREDITED", bank_bic: "BARCGB22XXX", bank_name: "Barclays", timestamp: "2026-01-01T12:00:00" }],
      });
    }),
  );
  return captured;
}

async function validateIban(iban: string) {
  byId<HTMLInputElement>("cs-iban").value = iban;
  byId("cs-validate-btn").click();
}

/** Walk Verify → Route → Settle → Decide → Track from the Verify step. */
async function runRemainingSteps() {
  await clickWhenPresent("cs-vop-btn");
  await clickWhenPresent("cs-next");
  await clickWhenPresent("cs-route-btn");
  await clickWhenPresent("cs-next");
  await clickWhenPresent("cs-ssi-btn");
  await clickWhenPresent("cs-next");
  await clickWhenPresent("cs-prepare-btn");
  await clickWhenPresent("cs-next");
  await clickWhenPresent("cs-track-btn");
  await screen.findByText(/you completed the capstone/i);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("legacy capstone (app/static/js/learn-capstone.js)", () => {
  describe("when the IBAN is valid but no BIC can be derived", () => {
    it("stops at Validate and asks for the beneficiary BIC instead of continuing", async () => {
      const captured = mockApi();
      mountLegacyCapstone();

      await validateIban(NO_BIC_IBAN);

      expect(await screen.findByText(/no bic derivable/i)).toBeVisible();
      expect(byId("cs-bic")).toBeVisible();
      expect(document.getElementById("cs-next")).toBeNull();
      expect(captured.validateValues).toEqual([NO_BIC_IBAN]);
    });

    it("continues with the BIC the learner enters and never substitutes another bank", async () => {
      const captured = mockApi();
      mountLegacyCapstone();

      await validateIban(NO_BIC_IBAN);
      await screen.findByText(/no bic derivable/i);
      byId<HTMLInputElement>("cs-bic").value = "barcgb22";
      byId("cs-bic-btn").click();
      await clickWhenPresent("cs-next");
      await runRemainingSteps();

      expect(captured.validateValues).toEqual([NO_BIC_IBAN, "BARCGB22"]);
      const pathsAndQueries = captured.requestUrls.map((u) => { const url = new URL(u); return url.pathname + url.search; });
      expect(pathsAndQueries).toContain("/api/route?bic=BARCGB22XXX&currency=USD");
      expect(pathsAndQueries).toContain("/api/ssi?bic=BARCGB22XXX");
      expect(pathsAndQueries.join("\n")).not.toMatch(/bic=(null|undefined|None)\b/);
      expect(captured.prepareBodies).toHaveLength(1);
      expect(captured.prepareBodies[0].beneficiary_bic).toBe("BARCGB22XXX");
      expect(captured.trackBodies).toHaveLength(1);
      expect(captured.trackBodies[0].beneficiary_bic).toBe("BARCGB22XXX");
    });

    it("rejects a BIC that does not validate and offers no way on", async () => {
      const captured = mockApi();
      mountLegacyCapstone();

      await validateIban(NO_BIC_IBAN);
      await screen.findByText(/no bic derivable/i);
      byId<HTMLInputElement>("cs-bic").value = "XXXX";
      byId("cs-bic-btn").click();

      expect(await screen.findByText(/you entered 4/i)).toBeVisible();
      expect(document.getElementById("cs-next")).toBeNull();
      expect(captured.requestUrls.some((u) => u.includes("/api/verify-payee"))).toBe(false);
    });

    it("rejects an IBAN typed into the BIC field", async () => {
      mockApi();
      mountLegacyCapstone();

      await validateIban(NO_BIC_IBAN);
      await screen.findByText(/no bic derivable/i);
      byId<HTMLInputElement>("cs-bic").value = NO_BIC_IBAN;
      byId("cs-bic-btn").click();

      expect(await screen.findByText(/enter a bic/i)).toBeVisible();
      expect(document.getElementById("cs-next")).toBeNull();
    });
  });

  // The BIC check is async. If the learner re-validates a different IBAN while
  // it is in flight, its late answer belongs to a prompt that no longer exists
  // and must not replace the new IBAN's BIC.
  it("drops a BIC check that resolves after the learner re-validated", async () => {
    const captured = mockApi();
    let releaseBicCheck!: () => void;
    const bicCheckHeld = new Promise<void>((resolve) => { releaseBicCheck = resolve; });
    server.use(
      http.get("/api/validate", async ({ request }) => {
        const value = new URL(request.url).searchParams.get("value") ?? "";
        if (value !== "BARCGB22") return undefined;
        captured.validateValues.push(value);
        await bicCheckHeld;
        return HttpResponse.json({
          input: value, input_type: "bic", valid: true, bic: "BARCGB22XXX",
          bank: { bic: "BARCGB22XXX", bank_name: "Barclays", country_code: "GB" }, errors: [],
        });
      }),
    );
    mountLegacyCapstone();

    await validateIban(NO_BIC_IBAN);
    await screen.findByText(/no bic derivable/i);
    byId<HTMLInputElement>("cs-bic").value = "BARCGB22";
    byId("cs-bic-btn").click();
    await waitFor(() => expect(captured.validateValues).toContain("BARCGB22"));

    await validateIban("GB29NWBK60161331926819");
    await screen.findByText(/BIC derived/i);
    releaseBicCheck();
    await new Promise((resolve) => setTimeout(resolve, 50));

    await clickWhenPresent("cs-next");
    await runRemainingSteps();
    expect(captured.prepareBodies[0]).not.toHaveProperty("beneficiary_bic");
    expect(captured.trackBodies[0].beneficiary_bic).toBe("NWBKGB2LXXX");
  });

  it("explains an error response from the BIC check as an invalid BIC, not an IBAN", async () => {
    mockApi();
    server.use(
      http.get("/api/validate", ({ request }) => {
        const value = new URL(request.url).searchParams.get("value") ?? "";
        if (value !== "BARCGB22") return undefined;
        return HttpResponse.json({ detail: "Service unavailable" }, { status: 503 });
      }),
    );
    mountLegacyCapstone();

    await validateIban(NO_BIC_IBAN);
    await screen.findByText(/no bic derivable/i);
    byId<HTMLInputElement>("cs-bic").value = "BARCGB22";
    byId("cs-bic-btn").click();

    expect(await screen.findByText(/that bic is not valid/i)).toBeVisible();
    expect(screen.queryByText(/not an iban/i)).toBeNull();
    expect(document.getElementById("cs-next")).toBeNull();
  });

  it("tracks to the derived BIC and sends no BIC override when the IBAN derives one", async () => {
    const captured = mockApi();
    mountLegacyCapstone();

    await validateIban("GB29NWBK60161331926819");
    await clickWhenPresent("cs-next");
    await runRemainingSteps();

    expect(captured.prepareBodies[0]).toEqual({
      beneficiary_iban: "GB29NWBK60161331926819",
      beneficiary_name: "John Smith",
      currency: "USD",
      amount: 5000,
    });
    expect(captured.trackBodies[0].beneficiary_bic).toBe("NWBKGB2LXXX");
  });
});
