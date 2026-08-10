import { expect, test } from "@playwright/test";

const MODULE_TITLE = "Identifiers: BICs & IBANs";
const LEARNING_KEYS = [
  "relay:profile",
  "relay:progress",
  "relay:practice",
  "relay:activity",
] as const;
const PREFERENCES_KEY = "relay:preferences";
const DRAFT_KEY = "relay:draft:payment-1";

const INITIAL_PREFERENCES_RAW = JSON.stringify({
  schemaVersion: 1,
  reducedMotion: false,
  navigationDensity: "comfortable",
  firstRunGuidanceSeen: [],
});

const UPDATED_PREFERENCES_RAW = JSON.stringify({
  schemaVersion: 1,
  reducedMotion: true,
  navigationDensity: "compact",
  firstRunGuidanceSeen: ["overview-learning-backup"],
});

const INITIAL_DRAFT_RAW = JSON.stringify({
  schemaVersion: 1,
  id: "payment-1",
  updatedAt: "2026-08-10T10:00:00.000Z",
  beneficiaryIban: "GB29NWBK60161331926819",
  beneficiaryName: "Acme Imports Ltd",
  beneficiaryBic: "NWBKGB2L",
  currency: "GBP",
  amount: 1250,
  strictness: "standard",
});

const UPDATED_DRAFT_RAW = JSON.stringify({
  schemaVersion: 1,
  id: "payment-1",
  updatedAt: "2026-08-10T10:30:00.000Z",
  beneficiaryIban: "DE89370400440532013000",
  beneficiaryName: "Updated Draft Beneficiary",
  beneficiaryBic: "COBADEFFXXX",
  currency: "EUR",
  amount: 980,
  strictness: "strict",
});

async function writeRawStorage(page: Parameters<typeof test>[0]["page"], key: string, value: string) {
  await page.evaluate(
    ({ storageKey, rawValue }) => {
      localStorage.setItem(storageKey, rawValue);
    },
    { storageKey: key, rawValue: value },
  );
}

async function readRawStorage(page: Parameters<typeof test>[0]["page"], key: string) {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

async function clearLearningKeys(page: Parameters<typeof test>[0]["page"]) {
  await page.evaluate((keys) => {
    for (const key of keys) {
      localStorage.removeItem(key);
    }

    const caseSessionKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("relay:case-session:")) {
        caseSessionKeys.push(key);
      }
    }

    for (const key of caseSessionKeys) {
      localStorage.removeItem(key);
    }
  }, [...LEARNING_KEYS]);
}

// Skipped while the Learning backup panel is hidden on the Overview page. The
// download and import controls are its only UI entry point, so this round trip
// has nothing to drive. The merge/transfer logic stays covered by
// learnerStateMerge.test.ts, learnerStateTransfer.test.ts and
// LearnerDataPanel.test.tsx. Un-skip when the panel is restored.
test.describe.skip("Learner state portability", () => {
  test("restores learning progress without overwriting drafts or preferences", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "coverage is not viewport-dependent");

    await page.goto("/app/learn/lab-1", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: MODULE_TITLE })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Identifier to analyze").fill("CITIUS33XXX");
    await page.getByRole("button", { name: "Analyze" }).click();
    await expect(page.getByText(/format is valid/i)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Your answer (country name or code)").fill("Nigeria");
    await page.getByLabel("Your answer (country name or code)").press("Enter");
    await expect(page.getByText(/correct! gtbinglaxxx/i)).toBeVisible();

    await page.getByLabel("Your answer (bank name or code)").fill("NatWest");
    await page.getByLabel("Your answer (bank name or code)").press("Enter");
    await expect(page.getByText(/correct! nwbk/i)).toBeVisible();
    await expect(page.getByText("3 of 3 complete")).toBeVisible();

    await page.goto("/app", { waitUntil: "networkidle" });
    await expect(page.locator(".overview__progress-count")).toHaveText("1 / 13");
    await expect(page.locator(".overview__activity-list")).toContainText(MODULE_TITLE);

    await writeRawStorage(page, PREFERENCES_KEY, INITIAL_PREFERENCES_RAW);
    await writeRawStorage(page, DRAFT_KEY, INITIAL_DRAFT_RAW);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download learning backup" }).click();
    const download = await downloadPromise;
    const backupPath = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(backupPath);

    await writeRawStorage(page, PREFERENCES_KEY, UPDATED_PREFERENCES_RAW);
    await writeRawStorage(page, DRAFT_KEY, UPDATED_DRAFT_RAW);

    await clearLearningKeys(page);
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.locator(".overview__progress-count")).toHaveText("0 / 13");
    await expect(page.locator(".overview__activity")).toContainText(/no activity yet/i);
    await expect(await readRawStorage(page, PREFERENCES_KEY)).toBe(UPDATED_PREFERENCES_RAW);
    await expect(await readRawStorage(page, DRAFT_KEY)).toBe(UPDATED_DRAFT_RAW);

    await page.getByLabel("Choose learning backup file").setInputFiles(backupPath);
    await expect(page.getByRole("heading", { name: "Backup preview" })).toBeVisible();
    await expect(page.getByText("1 module completed")).toBeVisible();
    await expect(page.getByText("1 activity entry")).toBeVisible();

    await page.getByRole("button", { name: "Import learning backup" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Imported 1 new module, 1 activity entry, and 0 case sessions.",
    );

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".overview__progress-count")).toHaveText("1 / 13");
    await expect(page.locator(".overview__activity-list")).toContainText(MODULE_TITLE);
    await expect(await readRawStorage(page, PREFERENCES_KEY)).toBe(UPDATED_PREFERENCES_RAW);
    await expect(await readRawStorage(page, DRAFT_KEY)).toBe(UPDATED_DRAFT_RAW);
  });
});
