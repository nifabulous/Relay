# Lab 9 — Rails Deep-Dive (CAD/UK) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Learn **Lab 9 "Rails Deep-Dive: Canada & UK"** — enriched CAD/GBP rail facts served
from `/api/schemes`, plus six interactive mechanics (two reusing existing endpoints, three backed by
new pure helpers, one content-driven).

**Architecture:** Additive. Backend enriches the six CAD+GBP rail dicts with optional fields (Zod
gains optional fields — non-breaking). A new lazy-loaded `Lab9Content` renders the enriched detail
and hosts the mechanics: Autodeposit↔VoP (reuses `/api/verify-payee`), CHAPS→pacs.008 (reuses
`/api/message/pacs008-check`), and EFT-window / limit-check / APP-reimbursement via new pure helpers,
plus a rail-chooser `MultipleChoice`.

**Tech Stack:** Python 3.9+/FastAPI/pytest; React 19 + TS7 strict, TanStack Query 5, Zod 4, Vitest 4
+ RTL + MSW, Playwright + axe.

## Global Constraints

- **Python 3.9+** (`Optional`/`List` from typing, not `X | None`); backend change is data + schema only.
- **TypeScript 7 strict**; match existing patterns (Zod `.catch/.passthrough/.nullish`, `AsyncRegion`,
  lab content components, `useLabCompletion`).
- **TDD**; failing test first. **No new dependencies.**
- **One commit per task**, `type(scope): description`; end body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Backend:** `source .venv/bin/activate` then `python -m pytest tests/ -q && ruff check app/`.
- **Frontend:** from `frontend/` — `npm test -- --run <path>` and `npx tsc --noEmit`; new lab
  `lazy()`-loaded; `npm run check:bundle` stays green.
- **Additive / non-breaking:** existing scheme fields, endpoints, and Labs 3/7/8 are untouched. The
  new `/api/schemes` fields are optional; the in-progress #7b Explore Schemes table keeps working.
- **Purity:** `eftSettlement`, `limitCheck`, `appReimbursement` are pure and total (never throw);
  dates/amounts are inputs. Amounts in **minor units** (cents/pence).
- **Facts are verified (July 2026);** date-stamp fast-moving items (RTR Q3 2026, CHAPS Nov 2026,
  CoP direction Jul 2026). Do not alter the researched values in Task 2 — they are the spec's payload.

---

## Task 1: Pure rail helpers

**Files:**
- Create: `frontend/src/features/learn/labs/railsHelpers.ts`
- Test: `frontend/src/features/learn/labs/railsHelpers.test.ts`

**Interfaces (Produces, used by Task 6):**
```ts
export interface EftSettlement { window: string; sameDay: boolean; valueDate: string; }
export function eftSettlement(submitEtIso: string): EftSettlement;
export interface LimitVerdict { clears: boolean; breached: "perTransaction" | "perDay" | "perMonth" | null; }
export function limitCheck(amountMinor: number, limits: { perTransactionMinor: number; perDayMinor: number; perMonthMinor: number }): LimitVerdict;
export interface AppReimbursement { reimbursedMinor: number; senderPspMinor: number; receiverPspMinor: number; cappedAtMinor: number; }
export function appReimbursement(amountMinor: number): AppReimbursement; // cap £85,000 = 8_500_000 minor
```

- [ ] **Step 1: Write the failing test** — `railsHelpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { eftSettlement, limitCheck, appReimbursement } from "./railsHelpers";

describe("eftSettlement", () => {
  it("catches window 1 same-day before 05:00 ET on a weekday", () => {
    const s = eftSettlement("2026-07-20T04:30:00"); // Monday
    expect(s.window).toContain("05:00");
    expect(s.sameDay).toBe(true);
    expect(s.valueDate).toBe("2026-07-20");
  });
  it("rolls to next business day after the last window", () => {
    const s = eftSettlement("2026-07-20T20:00:00"); // Monday 20:00
    expect(s.sameDay).toBe(false);
    expect(s.valueDate).toBe("2026-07-21"); // Tuesday
  });
  it("rolls a Friday evening to Monday", () => {
    const s = eftSettlement("2026-07-24T20:00:00"); // Friday 20:00
    expect(s.valueDate).toBe("2026-07-27"); // Monday
  });
});

describe("limitCheck", () => {
  const limits = { perTransactionMinor: 300_000, perDayMinor: 1_000_000, perMonthMinor: 3_000_000 };
  it("clears under all caps", () => {
    expect(limitCheck(250_000, limits)).toEqual({ clears: true, breached: null });
  });
  it("breaches per-transaction first", () => {
    expect(limitCheck(400_000, limits)).toEqual({ clears: false, breached: "perTransaction" });
  });
  it("treats zero / NaN as non-clearing without throwing", () => {
    expect(limitCheck(NaN, limits).clears).toBe(false);
  });
});

describe("appReimbursement", () => {
  it("reimburses in full under the cap, split 50/50", () => {
    const r = appReimbursement(2_000_000); // £20,000
    expect(r.reimbursedMinor).toBe(2_000_000);
    expect(r.senderPspMinor + r.receiverPspMinor).toBe(2_000_000);
  });
  it("caps at £85,000", () => {
    const r = appReimbursement(20_000_000); // £200,000
    expect(r.reimbursedMinor).toBe(8_500_000);
    expect(r.cappedAtMinor).toBe(8_500_000);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- --run src/features/learn/labs/railsHelpers.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `railsHelpers.ts`:

```ts
/**
 * Illustrative rail helpers for Lab 9. Pure and total — safe for teaching, not
 * production settlement. Amounts are in minor units (cents/pence).
 */

const EFT_WINDOWS = [
  { minutes: 300, label: "05:00 ET" },   // 05:00
  { minutes: 855, label: "14:15 ET" },   // 14:15
  { minutes: 1140, label: "19:00 ET" },  // 19:00
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function rollToBusinessDay(d: Date): Date {
  const out = new Date(d);
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6) out.setUTCDate(out.getUTCDate() + 1);
  return out;
}

export interface EftSettlement { window: string; sameDay: boolean; valueDate: string; }

export function eftSettlement(submitEtIso: string): EftSettlement {
  // Treat the supplied ISO local time as Eastern; no timezone maths (illustrative).
  const dt = new Date(`${submitEtIso}Z`);
  if (isNaN(dt.getTime())) return { window: "—", sameDay: false, valueDate: "—" };
  const minutes = dt.getUTCHours() * 60 + dt.getUTCMinutes();
  const caught = EFT_WINDOWS.find((w) => minutes <= w.minutes);
  const base = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  if (caught && rollToBusinessDay(base).getTime() === base.getTime()) {
    return { window: caught.label, sameDay: true, valueDate: isoDate(base) };
  }
  // Missed the last window today, or today is a weekend → next business day, window 1.
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + 1);
  return { window: "05:00 ET (next business day)", sameDay: false, valueDate: isoDate(rollToBusinessDay(next)) };
}

export interface LimitVerdict { clears: boolean; breached: "perTransaction" | "perDay" | "perMonth" | null; }

export function limitCheck(
  amountMinor: number,
  limits: { perTransactionMinor: number; perDayMinor: number; perMonthMinor: number },
): LimitVerdict {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return { clears: false, breached: null };
  if (amountMinor > limits.perTransactionMinor) return { clears: false, breached: "perTransaction" };
  if (amountMinor > limits.perDayMinor) return { clears: false, breached: "perDay" };
  if (amountMinor > limits.perMonthMinor) return { clears: false, breached: "perMonth" };
  return { clears: true, breached: null };
}

export interface AppReimbursement { reimbursedMinor: number; senderPspMinor: number; receiverPspMinor: number; cappedAtMinor: number; }

const APP_CAP_MINOR = 8_500_000; // £85,000

export function appReimbursement(amountMinor: number): AppReimbursement {
  const amount = Number.isFinite(amountMinor) && amountMinor > 0 ? amountMinor : 0;
  const reimbursedMinor = Math.min(amount, APP_CAP_MINOR);
  const senderPspMinor = Math.floor(reimbursedMinor / 2);
  return {
    reimbursedMinor,
    senderPspMinor,
    receiverPspMinor: reimbursedMinor - senderPspMinor,
    cappedAtMinor: APP_CAP_MINOR,
  };
}
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/learn/labs/railsHelpers.ts frontend/src/features/learn/labs/railsHelpers.test.ts
git commit -m "feat(learn): pure rail helpers (eftSettlement/limitCheck/appReimbursement)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Enrich the CAD + GBP rails + Zod optional fields

**Files:**
- Modify: `app/data/payment_schemes.py` (the `GBP` block lines 14-24 and `CAD` block lines 25-35)
- Modify: `frontend/src/api/schemas.ts` (`SchemeInfoSchema`, lines 520-529)
- Test: `tests/test_payment_schemes.py` (append) and `frontend/src/api/schemas.test.ts` (append)

**Interfaces:** `/api/schemes?currency=CAD|GBP` returns rails carrying optional `howItWorks`,
`features`, `limits`, `processingWindows`, `settlement`, `reversible`, `protections`, `roadmap`.
`SchemeInfoSchema` gains matching optional fields. Non-breaking.

- [ ] **Step 1: Write the failing backend test** — append to `tests/test_payment_schemes.py`:

```python
def test_interac_enriched_with_corrected_limits_and_roadmap():
    from app.data.payment_schemes import get_schemes_for_currency
    interac = next(s for s in get_schemes_for_currency("CAD")["schemes"] if s["name"] == "Interac e-Transfer")
    assert "Autodeposit" in " ".join(interac["features"])
    assert interac["limits"]["perTransaction"].startswith("$3,000")
    assert interac["limits"]["perMonth"] == "$30,000"
    assert any("RTR" in r for r in interac["roadmap"])
    assert "05:00 ET" not in " ".join(interac.get("processingWindows", []))  # Interac is not windowed


def test_eft_has_three_processing_windows():
    from app.data.payment_schemes import get_schemes_for_currency
    eft = next(s for s in get_schemes_for_currency("CAD")["schemes"] if s["name"] == "EFT")
    assert eft["processingWindows"] == ["05:00 ET", "14:15 ET", "19:00 ET"]


def test_chaps_teaches_iso20022_and_protections():
    from app.data.payment_schemes import get_schemes_for_currency
    chaps = next(s for s in get_schemes_for_currency("GBP")["schemes"] if s["name"] == "CHAPS")
    assert any("Nov 2026" in r or "November 2026" in r for r in chaps["roadmap"])
    assert any("Confirmation of Payee" in p for p in chaps["protections"])


def test_fps_teaches_app_reimbursement():
    from app.data.payment_schemes import get_schemes_for_currency
    fps = next(s for s in get_schemes_for_currency("GBP")["schemes"] if "Faster Payments" in s["name"])
    assert any("85,000" in p for p in fps["protections"])


def test_other_currencies_have_no_enriched_fields():
    from app.data.payment_schemes import get_schemes_for_currency
    usd = get_schemes_for_currency("USD")["schemes"][0]
    assert "roadmap" not in usd and "protections" not in usd
```

- [ ] **Step 2: Run to verify it fails** — `python -m pytest tests/test_payment_schemes.py -q` → FAIL.

- [ ] **Step 3: Enrich the GBP block** — replace the three GBP scheme dicts (lines 20-22) with:

```python
            {"name": "Faster Payments (FPS)", "speed": "Instant (<2s)", "limit": "£1,000,000 scheme max", "cost": "Free", "useCase": "Retail, bills, transfers", "operator": "Pay.UK",
             "howItWorks": ["Payer initiates; cleared in seconds, 24/7", "Name-checked via Confirmation of Payee before sending", "Beneficiary bank credits the account"],
             "features": ["24/7 instant", "Confirmation of Payee name-check", "Evolving under the New Payments Architecture (NPA)"],
             "limits": {"perTransaction": "£1,000,000 (scheme max)", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Scheme max raised to £1M (from £250k); banks cap lower — often ~£25,000 personal, up to £1M business"},
             "settlement": "Faster Payments Service (Pay.UK); evolving under the NPA", "reversible": False,
             "protections": ["Confirmation of Payee (mandatory since Oct 2024)", "APP-scam reimbursement up to £85,000 (50/50 PSP split)"],
             "roadmap": ["Scheme limit raised to £1,000,000", "New Payments Architecture (NPA) migration in progress"]},
            {"name": "CHAPS", "speed": "Same-day (RTGS)", "limit": "No limit", "cost": "£20-35", "useCase": "High-value, house purchases", "operator": "Bank of England",
             "howItWorks": ["Real-time gross settlement via the Bank of England", "Same-day, final and irrevocable", "Carried as ISO 20022 pacs.008 with enhanced data"],
             "features": ["ISO 20022 enhanced data", "Purpose Codes + LEI", "Structured postal addresses"],
             "limits": {"perTransaction": "No limit", "perDay": "No limit", "perMonth": "No limit", "receiving": "No limit", "note": "High-value; bank/operational controls apply"},
             "settlement": "Bank of England RTGS (final, same-day)", "reversible": False,
             "protections": ["Confirmation of Payee (mandatory since Oct 2024)", "APP-scam reimbursement up to £85,000 (50/50 PSP split)"],
             "roadmap": ["Purpose Codes + LEI mandated May 2025", "Hybrid addresses from Nov 2025; fully-unstructured addresses rejected Nov 2026", "Structured remittance mandated Nov 2025"]},
            {"name": "Bacs Direct Credit", "speed": "3 business days", "limit": "No limit", "cost": "~£0.50", "useCase": "Payroll, pensions", "operator": "Pay.UK",
             "howItWorks": ["3-day cycle: submission day, processing day, settlement day", "Batched, low-cost, high-volume"],
             "features": ["Direct Credit + Direct Debit", "Low cost, high volume"],
             "settlement": "Bacs 3-day cycle (Pay.UK)", "reversible": False, "protections": [], "roadmap": []},
```

- [ ] **Step 4: Enrich the CAD block** — replace the three CAD scheme dicts (lines 31-33) with:

```python
            {"name": "Interac e-Transfer", "speed": "Instant (seconds)", "limit": "$3,000/txn, $10,000/day, $30,000/month", "cost": "Bank package (often free)", "useCase": "P2P, retail, small business", "operator": "Interac Corp.",
             "howItWorks": ["Sender picks the recipient by email or phone (alias)", "Money moves over existing bank rails — the alias only carries the notification/deposit instructions", "Recipient auto-deposits, or answers a security question", "Funds land in seconds after routine interbank fraud checks"],
             "features": ["Autodeposit (sender is shown the recipient's registered legal name — a CoP-like check; may be delayed by fraud checks)", "Request Money (pull)", "Security-question claim (answer must not be guessable/public, and must not travel on the same channel as the transfer)"],
             "limits": {"perTransaction": "$3,000 (typical consumer ~$2,000-3,000, bank-set)", "perDay": "$10,000", "perMonth": "$30,000", "receiving": "Up to $25,000", "note": "Network ceiling $3,000/txn; banks set their own caps; Business e-Transfer up to $25,000/transfer"},
             "settlement": "Existing bank rails today; moving to the Real-Time Rail (RTR) for real-time clearing/settlement", "reversible": False,
             "protections": ["Autodeposit shows the sender the recipient's registered legal name", "Cancellable while pending/unclaimed; irreversible once claimed or autodeposited", "Can go cross-border if the sender's bank participates"],
             "roadmap": ["RTR real-time clearing/settlement targeted Q3 2026 (may slip to late 2026/early 2027)", "RTR is ISO 20022 and will settle Interac in real time"]},
            {"name": "EFT", "speed": "1-2 business days", "limit": "No scheme limit", "cost": "$0.50-2", "useCase": "Payroll, vendor, bulk", "operator": "Payments Canada",
             "howItWorks": ["Batched and submitted in fixed daily windows", "Cleared and settled via ACSS", "Credited 1-2 business days later; no weekends/holidays"],
             "features": ["Batch processing", "Business days only"],
             "processingWindows": ["05:00 ET", "14:15 ET", "19:00 ET"],
             "settlement": "ACSS batch (Automated Clearing Settlement System)", "reversible": False, "protections": [], "roadmap": []},
            {"name": "Lynx", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "$5-25", "useCase": "High-value, wholesale", "operator": "Bank of Canada",
             "howItWorks": ["Real-time gross settlement, transaction by transaction", "Final and irrevocable"],
             "features": ["ISO 20022", "Pre-funding underpins the incoming RTR"],
             "settlement": "Lynx RTGS (final, real-time)", "reversible": False, "protections": [],
             "roadmap": ["ISO 20022-native; supports the incoming Real-Time Rail"]},
```

- [ ] **Step 5: Add the optional Zod fields** — replace `SchemeInfoSchema` (lines 520-529) with:

```ts
const SchemeLimitsSchema = z
  .object({
    perTransaction: z.string().catch(""),
    perDay: z.string().catch(""),
    perMonth: z.string().catch(""),
    receiving: z.string().catch(""),
    note: z.string().catch(""),
  })
  .partial()
  .passthrough();

export const SchemeInfoSchema = z
  .object({
    name: z.string().catch(""),
    speed: z.string().catch(""),
    limit: z.string().catch(""),
    cost: z.string().catch(""),
    useCase: z.string().catch(""),
    operator: z.string().catch(""),
    howItWorks: z.array(z.string()).nullish().catch(null),
    features: z.array(z.string()).nullish().catch(null),
    limits: SchemeLimitsSchema.nullish().catch(null),
    processingWindows: z.array(z.string()).nullish().catch(null),
    settlement: z.string().nullish().catch(null),
    reversible: z.boolean().nullish().catch(null),
    protections: z.array(z.string()).nullish().catch(null),
    roadmap: z.array(z.string()).nullish().catch(null),
  })
  .passthrough();
```

- [ ] **Step 6: Add the frontend schema test** — append to `frontend/src/api/schemas.test.ts`:

```ts
it("SchemeInfoSchema keeps enriched fields and still parses without them", () => {
  const rich = SchemeInfoSchema.parse({
    name: "Interac e-Transfer", speed: "Instant", limit: "x", cost: "y", useCase: "z", operator: "Interac",
    features: ["Autodeposit"], limits: { perMonth: "$30,000" }, reversible: false, roadmap: ["RTR Q3 2026"],
  });
  expect(rich.features?.[0]).toBe("Autodeposit");
  expect(rich.limits?.perMonth).toBe("$30,000");
  const plain = SchemeInfoSchema.parse({ name: "Fedwire", speed: "RTGS", limit: "x", cost: "y", useCase: "z", operator: "Fed" });
  expect(plain.roadmap ?? null).toBeNull();
});
```

(Ensure `SchemeInfoSchema` is imported at the top of `schemas.test.ts`.)

- [ ] **Step 7: Run tests** — backend `python -m pytest tests/test_payment_schemes.py tests/ -q && ruff check app/`; frontend `npm test -- --run src/api/schemas.test.ts && npx tsc --noEmit`. All PASS.

- [ ] **Step 8: Commit**

```bash
git add app/data/payment_schemes.py frontend/src/api/schemas.ts frontend/src/api/schemas.test.ts tests/test_payment_schemes.py
git commit -m "feat(schemes): enrich CAD+GBP rails with depth fields (limits/windows/protections/roadmap)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Lab 9 curriculum + parity

**Files:**
- Modify: `frontend/src/features/learn/curriculum.ts`
- Modify: `frontend/src/features/learn/legacyParity.ts`
- Test: `frontend/src/features/learn/curriculum.test.ts` (append)

Note: the `labRegistry.tsx` registration and the `legacyParity.test.ts` key-count/legacy-source
update are handled in Task 4 (after `Lab9Content` exists), to avoid a dangling lazy import — the same
sequencing used for lab-8.

- [ ] **Step 1: Write the failing test** — append to `curriculum.test.ts`:

```ts
it("includes lab-9 requiring lab-7 and lab-8", () => {
  const lab9 = CURRICULUM.find((m) => m.id === "lab-9");
  expect(lab9).toBeDefined();
  expect(lab9?.prerequisites).toEqual(expect.arrayContaining(["lab-7", "lab-8"]));
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- --run src/features/learn/curriculum.test.ts` → FAIL.

- [ ] **Step 3: Add lab-9 to CURRICULUM** — insert between `lab-8` and `capstone`:

```ts
  {
    id: "lab-9",
    title: "Rails Deep-Dive: Canada & UK",
    subtitle: "Interac, EFT, CHAPS, Faster Payments — in depth",
    href: "/learn/lab-9",
    duration: 20,
    prerequisites: ["lab-7", "lab-8"],
    outcomes: [
      "Explain Interac Autodeposit, Request Money, limits, and the RTR roadmap",
      "Read EFT processing windows and CHAPS's ISO 20022 structured-address mandate",
      "Compare UK Confirmation of Payee and APP-scam reimbursement",
    ],
    category: "core",
  },
```

Leave `capstone.prerequisites` unchanged.

- [ ] **Step 4: Add the lab-9 parity entry** — in `legacyParity.ts`, before the `capstone` entry:

```ts
  "lab-9": {
    title: "Rails Deep-Dive: Canada & UK",
    legacySources: [],
    apiEndpoints: ["/api/schemes", "/api/verify-payee", "/api/message/pacs008-check"],
    interactions: [
      "Enriched CAD/GBP rail detail from /api/schemes",
      "Interac Autodeposit ↔ VoP name reveal",
      "CHAPS → pacs.008 structured-address hold",
      "EFT window simulator, layered-limit checker, APP 'who pays' panel",
      "Rail-chooser scenarios",
    ],
    requiredCheckpoints: ["autodeposit-vop", "chaps-pacs008", "eft-window", "limit-check", "rail-chooser", "app-reimbursement"],
  },
```

- [ ] **Step 5: Run to verify it passes** — `npm test -- --run src/features/learn/curriculum.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/learn/curriculum.ts frontend/src/features/learn/legacyParity.ts frontend/src/features/learn/curriculum.test.ts
git commit -m "feat(learn): Lab 9 curriculum + parity entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Lab 9 content skeleton (rail detail) + registration

**Files:**
- Create: `frontend/src/features/learn/labs/Lab9Content.tsx`
- Create: `frontend/src/features/learn/labs/Lab9Content.test.tsx`
- Modify: `frontend/src/features/learn/labRegistry.tsx`
- Modify: `frontend/src/features/learn/legacyParity.test.ts` (9→10 keys; exempt lab-9 from legacy-source)
- Modify: `frontend/src/features/explore/search/searchIndex.ts` (add lab-9 to `LESSON_MODULES`)

**Interfaces:** `Lab9Content({ moduleId, isComplete, onCheckpoint })` fetches
`/api/schemes?currency=CAD` and `?currency=GBP` (via `apiRequest` + `SchemesResponseSchema`) and
renders the enriched rail detail. Mechanics are added in Tasks 5–6; this task lands the skeleton +
wiring so the lab is reachable.

- [ ] **Step 1: Write the failing test** — `Lab9Content.test.tsx` (model on `Lab2Content.test.tsx`:
plain `render`, `server.use`):

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab9Content } from "./Lab9Content";

const CAD = { currency: "CAD", country: "Canada", countryCode: "CA", iban: false, localIdentifier: "x", verifiedAsof: "2026-07",
  schemes: [{ name: "Interac e-Transfer", speed: "Instant", limit: "x", cost: "y", useCase: "z", operator: "Interac Corp.", features: ["Autodeposit"], roadmap: ["RTR Q3 2026"] }] };
const GBP = { currency: "GBP", country: "United Kingdom", countryCode: "GB", iban: true, localIdentifier: "x", verifiedAsof: "2026-07",
  schemes: [{ name: "CHAPS", speed: "RTGS", limit: "No limit", cost: "£25", useCase: "High value", operator: "Bank of England", protections: ["Confirmation of Payee"] }] };

function useSchemes() {
  server.use(http.get("/api/schemes", ({ request }) => {
    const c = new URL(request.url).searchParams.get("currency");
    return HttpResponse.json(c === "GBP" ? GBP : CAD);
  }));
}

describe("Lab9Content skeleton", () => {
  it("renders enriched CAD and GBP rail detail", async () => {
    useSchemes();
    render(<Lab9Content moduleId="lab-9" isComplete={false} onCheckpoint={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Interac e-Transfer")).toBeInTheDocument());
    expect(screen.getByText(/RTR Q3 2026/)).toBeInTheDocument();
    expect(await screen.findByText("CHAPS")).toBeInTheDocument();
    expect(screen.getByText(/Confirmation of Payee/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (component missing).

- [ ] **Step 3: Create `Lab9Content.tsx` skeleton**

```tsx
import { useCallback, useEffect, useState } from "react";
import type { LabContentProps } from "../labTypes";
import { apiRequest } from "../../../api/client";
import { SchemesResponseSchema } from "../../../api/schemas";
import type { SchemesResponse, SchemeInfo } from "../../../api/schemas";
import "./LabContent.css";

function RailDetail({ rail }: { rail: SchemeInfo }) {
  return (
    <div className="rail-detail">
      <h4>{rail.name}</h4>
      <p className="rail-detail__meta">{rail.speed} · {rail.cost} · {rail.operator}</p>
      {rail.settlement && <p><strong>Settlement:</strong> {rail.settlement}</p>}
      {rail.limits && (
        <dl className="rail-detail__limits">
          {rail.limits.perTransaction && (<><dt>Per transaction</dt><dd>{rail.limits.perTransaction}</dd></>)}
          {rail.limits.perDay && (<><dt>Per day</dt><dd>{rail.limits.perDay}</dd></>)}
          {rail.limits.perMonth && (<><dt>Per month</dt><dd>{rail.limits.perMonth}</dd></>)}
          {rail.limits.receiving && (<><dt>Receiving</dt><dd>{rail.limits.receiving}</dd></>)}
        </dl>
      )}
      {rail.features && rail.features.length > 0 && (
        <ul className="rail-detail__list">{rail.features.map((f, i) => <li key={i}>{f}</li>)}</ul>
      )}
      {rail.protections && rail.protections.length > 0 && (
        <p><strong>Protections:</strong> {rail.protections.join("; ")}</p>
      )}
      {rail.roadmap && rail.roadmap.length > 0 && (
        <p className="rail-detail__roadmap"><strong>Roadmap:</strong> {rail.roadmap.join(" · ")}</p>
      )}
    </div>
  );
}

export function Lab9Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [cad, setCad] = useState<SchemesResponse | null>(null);
  const [gbp, setGbp] = useState<SchemesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, g] = await Promise.all([
        apiRequest<SchemesResponse>("/api/schemes?currency=CAD", undefined, SchemesResponseSchema),
        apiRequest<SchemesResponse>("/api/schemes?currency=GBP", undefined, SchemesResponseSchema),
      ]);
      setCad(c); setGbp(g);
    } catch {
      setError("Could not load rail data. Please retry.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>Two stacks, the same rhyme</h2>
        <p className="measure">
          Canada and the UK both run an <strong>instant</strong> rail, a high-value <strong>RTGS</strong> rail,
          and a <strong>batch</strong> rail — and both are adding a name-check before payment and moving to
          ISO 20022. Explore each, then work through the mechanics below.
        </p>
      </section>

      {error && <div className="lab-error" role="alert">{error}</div>}

      <section className="lab-section">
        <h2>Canada (CAD)</h2>
        {cad?.schemes.map((r) => <RailDetail key={r.name} rail={r} />)}
      </section>
      <section className="lab-section">
        <h2>United Kingdom (GBP)</h2>
        {gbp?.schemes.map((r) => <RailDetail key={r.name} rail={r} />)}
      </section>

      {/* Mechanics are added in Tasks 5-6; onCheckpoint is threaded to them. */}
      <div data-checkpoint-host style={{ display: "none" }} aria-hidden onClick={() => onCheckpoint("noop")} />
    </div>
  );
}
```

(The hidden `onCheckpoint` placeholder keeps the prop used until Tasks 5–6 wire the real
checkpoints; remove it in Task 5.)

- [ ] **Step 4: Register lab-9** — in `labRegistry.tsx` add after `Lab8Content`:
`const Lab9Content = lazy(() => import("./labs/Lab9Content").then(m => ({ default: m.Lab9Content })));`
and add before `"capstone"`:
`"lab-9": { component: Lab9Content, requiredCheckpoints: CORE_LAB_PARITY["lab-9"].requiredCheckpoints },`

- [ ] **Step 5: Update `legacyParity.test.ts`** — add `"lab-9"` to the expected key array (before
`"capstone"`), update the count text (nine→ten), and extend the legacy-source exemption to
`id !== "lab-8" && id !== "lab-9"` (both are net-new). Read the current test to match its exact shape.

- [ ] **Step 6: Add lab-9 to Explore search** — in `searchIndex.ts` `LESSON_MODULES`, add after the
lab-8 tuple: `["lab-9", "Rails Deep-Dive: Canada & UK", "/app/learn/lab-9"]`.

- [ ] **Step 7: Add minimal CSS** — append to `LabContent.css`:

```css
.rail-detail { border: 1px solid var(--color-border, #d8d8d8); border-radius: 6px; padding: var(--space-3, 12px); margin-bottom: var(--space-3, 12px); }
.rail-detail__meta { color: var(--color-text-muted, #666); font-size: 0.875rem; }
.rail-detail__limits { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; }
.rail-detail__roadmap { color: var(--color-text-muted, #666); }
```

- [ ] **Step 8: Run tests** — `npm test -- --run src/features/learn/labs/Lab9Content.test.tsx src/features/learn/legacyParity.test.ts src/features/explore/search && npx tsc --noEmit` → PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/learn/labs/Lab9Content.tsx frontend/src/features/learn/labs/Lab9Content.test.tsx frontend/src/features/learn/labRegistry.tsx frontend/src/features/learn/legacyParity.test.ts frontend/src/features/explore/search/searchIndex.ts frontend/src/features/learn/labs/LabContent.css
git commit -m "feat(learn): Lab 9 content skeleton + registration (rail detail)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Mechanics 1 & 2 (endpoint-backed)

**Files:**
- Modify: `frontend/src/features/learn/labs/Lab9Content.tsx`
- Modify: `frontend/src/features/learn/labs/Lab9Content.test.tsx` (append)

**Interfaces:** Consumes `apiPost`, `VoPResponseSchema`/`VoPResponse` (request `{ iban, name }`;
response `{ outcome, account_holder_name?, advice, ... }`), `Pacs008CheckResponseSchema` (from Lab 8).
Fires `autodeposit-vop` and `chaps-pacs008`.

- [ ] **Step 1: Write the failing tests** — append to `Lab9Content.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event";

it("fires autodeposit-vop after revealing the payee's legal name", async () => {
  useSchemes();
  server.use(http.post("/api/verify-payee", () => HttpResponse.json({
    iban: "GB29NWBK60161331926819", submitted_name: "J Smith", outcome: "CLOSE_MATCH",
    score: 0.82, account_holder_name: "John Smith", account_type: "personal", advice: "Confirm before sending.",
  })));
  const onCheckpoint = vi.fn();
  render(<Lab9Content moduleId="lab-9" isComplete={false} onCheckpoint={onCheckpoint} />);
  await userEvent.click(await screen.findByRole("button", { name: /autodeposit on/i }));
  await waitFor(() => expect(onCheckpoint).toHaveBeenCalledWith("autodeposit-vop"));
  expect(screen.getByText(/John Smith/)).toBeInTheDocument();
});

it("fires chaps-pacs008 when a country-only CHAPS address is held", async () => {
  useSchemes();
  server.use(http.post("/api/message/pacs008-check", () => HttpResponse.json({
    verdict: "REPAIRABLE", passes: true,
    findings: [{ field: "Cdtr/PstlAdr", field_name: "Creditor Postal Address", severity: "warning", code: "PACS-ADDR-UNSTRUCTURED", message: "country only", repair: "add street + town" }],
    disclaimer: "primer",
  })));
  const onCheckpoint = vi.fn();
  render(<Lab9Content moduleId="lab-9" isComplete={false} onCheckpoint={onCheckpoint} />);
  await userEvent.click(await screen.findByRole("button", { name: /check chaps address/i }));
  await waitFor(() => expect(onCheckpoint).toHaveBeenCalledWith("chaps-pacs008"));
});
```

- [ ] **Step 2: Run to verify they fail** — FAIL (buttons not present).

- [ ] **Step 3: Implement** — in `Lab9Content.tsx`: remove the hidden placeholder; add imports
(`apiPost`, `VoPResponseSchema`/`VoPResponse`, `Pacs008CheckResponseSchema`/`Pacs008CheckResponse`,
`Button` from design-system); add state + handlers and two sections. Use a seeded IBAN + a
slightly-off name so verify-payee returns CLOSE_MATCH with `account_holder_name` (the "registered
legal name" the sender is shown). Reference `Lab3Content.tsx` for a known seeded IBAN/name pair.

```tsx
  const [vop, setVop] = useState<VoPResponse | null>(null);
  const vopFired = useRef(false);
  const autodepositOn = useCallback(async () => {
    const res = await apiPost<VoPResponse>("/api/verify-payee",
      { iban: "GB29NWBK60161331926819", name: "J Smith" }, VoPResponseSchema);
    setVop(res);
    if (!vopFired.current && (res.account_holder_name || res.outcome === "MATCH")) {
      vopFired.current = true; onCheckpoint("autodeposit-vop");
    }
  }, [onCheckpoint]);

  const [chaps, setChaps] = useState<Pacs008CheckResponse | null>(null);
  const chapsFired = useRef(false);
  const checkChaps = useCallback(async () => {
    const res = await apiPost<Pacs008CheckResponse>("/api/message/pacs008-check", {
      debtor_name: "Acme Ltd", debtor_agent_bic: "CHASGB2L", creditor_name: "Beta Ltd", creditor_agent_bic: "BARCGB22",
      creditor_postal_address: { street_name: "", town_name: "", country: "GB" }, settlement_amount: 500000, settlement_currency: "GBP",
    }, Pacs008CheckResponseSchema);
    setChaps(res);
    if (!chapsFired.current && res.findings.some((f) => f.code === "PACS-ADDR-UNSTRUCTURED")) {
      chapsFired.current = true; onCheckpoint("chaps-pacs008");
    }
  }, [onCheckpoint]);
```

Add `useRef` to the React import. Render two sections: an "Autodeposit" toggle (button "Autodeposit
ON" calls `autodepositOn`; show the revealed `vop.account_holder_name` + a note that manual claim
uses a security question whose answer must not travel on the same channel), and a "CHAPS in ISO
20022" section (button "Check CHAPS address" calls `checkChaps`; show the REPAIRABLE verdict + the
Nov-2026 mandate explanation).

- [ ] **Step 4: Run to verify they pass** — `npm test -- --run src/features/learn/labs/Lab9Content.test.tsx && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/learn/labs/Lab9Content.tsx frontend/src/features/learn/labs/Lab9Content.test.tsx
git commit -m "feat(learn): Lab 9 mechanics — Autodeposit↔VoP + CHAPS→pacs.008

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Mechanics 3–6 (helpers + content) + full completion

**Files:**
- Modify: `frontend/src/features/learn/labs/Lab9Content.tsx`
- Modify: `frontend/src/features/learn/labs/Lab9Content.test.tsx` (append)

**Interfaces:** Consumes `eftSettlement`, `limitCheck`, `appReimbursement` (Task 1) and
`MultipleChoice` (existing). Fires `eft-window`, `limit-check`, `rail-chooser`, `app-reimbursement`.
After this task all six checkpoints exist, so the lab can be completed.

- [ ] **Step 1: Write the failing tests** — append to `Lab9Content.test.tsx`:

```tsx
it("fires eft-window when the EFT simulator runs", async () => {
  useSchemes();
  const onCheckpoint = vi.fn();
  render(<Lab9Content moduleId="lab-9" isComplete={false} onCheckpoint={onCheckpoint} />);
  await userEvent.click(await screen.findByRole("button", { name: /which window/i }));
  await waitFor(() => expect(onCheckpoint).toHaveBeenCalledWith("eft-window"));
});

it("fires limit-check and app-reimbursement", async () => {
  useSchemes();
  const onCheckpoint = vi.fn();
  render(<Lab9Content moduleId="lab-9" isComplete={false} onCheckpoint={onCheckpoint} />);
  await userEvent.type(await screen.findByLabelText(/interac amount/i), "4000");
  await userEvent.click(screen.getByRole("button", { name: /check limit/i }));
  await waitFor(() => expect(onCheckpoint).toHaveBeenCalledWith("limit-check"));
  await userEvent.type(screen.getByLabelText(/scam amount/i), "200000");
  await userEvent.click(screen.getByRole("button", { name: /who pays/i }));
  await waitFor(() => expect(onCheckpoint).toHaveBeenCalledWith("app-reimbursement"));
});

it("fires rail-chooser on the correct scenario answer", async () => {
  useSchemes();
  const onCheckpoint = vi.fn();
  render(<Lab9Content moduleId="lab-9" isComplete={false} onCheckpoint={onCheckpoint} />);
  await userEvent.click(await screen.findByText(/CHAPS/)); // the £900k-house correct option
  await waitFor(() => expect(onCheckpoint).toHaveBeenCalledWith("rail-chooser"));
});
```

(The rail-chooser test clicks the correct option; match it to the `MultipleChoice` option label you
render — keep the correct answer's visible label unique enough to target.)

- [ ] **Step 2: Run to verify they fail** — FAIL.

- [ ] **Step 3: Implement** — add imports (`eftSettlement`, `limitCheck`, `appReimbursement` from
`./railsHelpers`; `MultipleChoice` from `../components/MultipleChoice`) and four sections:

```tsx
  // EFT window
  const [eft, setEft] = useState<ReturnType<typeof eftSettlement> | null>(null);
  const eftFired = useRef(false);
  const runEft = (submitEtIso: string) => {
    setEft(eftSettlement(submitEtIso));
    if (!eftFired.current) { eftFired.current = true; onCheckpoint("eft-window"); }
  };

  // Interac limit check (minor units; $3,000 / $10,000 / $30,000)
  const [amount, setAmount] = useState("");
  const [limit, setLimit] = useState<ReturnType<typeof limitCheck> | null>(null);
  const limitFired = useRef(false);
  const runLimit = () => {
    const minor = Math.round(Number(amount) * 100);
    setLimit(limitCheck(minor, { perTransactionMinor: 300_000, perDayMinor: 1_000_000, perMonthMinor: 3_000_000 }));
    if (!limitFired.current) { limitFired.current = true; onCheckpoint("limit-check"); }
  };

  // APP reimbursement (minor units)
  const [scam, setScam] = useState("");
  const [app, setApp] = useState<ReturnType<typeof appReimbursement> | null>(null);
  const appFired = useRef(false);
  const runApp = () => {
    setApp(appReimbursement(Math.round(Number(scam) * 100)));
    if (!appFired.current) { appFired.current = true; onCheckpoint("app-reimbursement"); }
  };
```

- **EFT window section:** buttons for a few sample submit times (e.g. "04:30", "15:00", "20:00")
  each calling `runEft` with a fixed ISO on a known weekday, plus a "Which window?" button that runs
  a default. Show `eft.window` / `eft.sameDay` / `eft.valueDate`.
- **Limit checker:** an input `aria-label="Interac amount"`, a "Check limit" button → show
  clears/breached (`limit.breached`).
- **APP panel:** an input `aria-label="Scam amount"`, a "Who pays?" button → show
  `reimbursedMinor/100`, the 50/50 split, and the £85k cap note.
- **Rail-chooser:** a `MultipleChoice` — question "A £900,000 house purchase must complete today —
  which rail?", options CHAPS (correct), Faster Payments, Bacs, with explanations; `onCorrect={() => onCheckpoint("rail-chooser")}`.

- [ ] **Step 4: Run to verify they pass** — `npm test -- --run src/features/learn/labs/Lab9Content.test.tsx && npx tsc --noEmit` → PASS. Then the touched-area sweep: `npm test -- --run src/features/learn`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/learn/labs/Lab9Content.tsx frontend/src/features/learn/labs/Lab9Content.test.tsx
git commit -m "feat(learn): Lab 9 mechanics — EFT window, limit check, APP split, rail chooser

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: E2E smoke + bundle

**Files:**
- Create: `frontend/e2e/lab9.spec.ts`

- [ ] **Step 1: Write the smoke spec** — model on `frontend/e2e/lab8.spec.ts` (same style). Seed
progress so lab-9 is unlocked (prereqs lab-7 + lab-8) using the real storage shape:

```ts
import { test, expect } from "@playwright/test";

test("Lab 9 loads enriched rail detail and runs a mechanic", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("relay:progress", JSON.stringify({
      schemaVersion: 1,
      completedModuleIds: ["lab-1","lab-2","lab-3","lab-4","lab-5","lab-6","lab-7","lab-8"],
    }));
  });
  await page.goto("/app/learn/lab-9");
  await expect(page.getByRole("heading", { name: /rails deep-dive/i })).toBeVisible();
  await expect(page.getByText("Interac e-Transfer")).toBeVisible();
  await expect(page.getByText("CHAPS")).toBeVisible();
  await page.getByRole("button", { name: /check chaps address/i }).click();
  await expect(page.getByText(/REPAIRABLE|structured/i)).toBeVisible();
});
```

Confirm the persisted shape against `src/lib/persistence/storage.ts` (field is `completedModuleIds`)
before finalizing. If `lab8.spec.ts` adds an axe check, mirror it; otherwise keep the smoke plain.

- [ ] **Step 2: Run it** — from `frontend/`: `npm run test:e2e -- lab9.spec.ts` → PASS (non-flaky).
Diagnose and fix the spec (not product code) if it fails.

- [ ] **Step 3: Bundle gate** — `npm run check:bundle` → PASS (Lab 9 lazy-loaded).

- [ ] **Step 4: Full sweep** — backend `python -m pytest tests/ -q && ruff check app/`; frontend
`npm test -- --run && npx tsc --noEmit`. All green.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/lab9.spec.ts
git commit -m "test(e2e): lab-9 smoke

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes (for the executor)

- **Coverage:** helpers (T1), backend enrichment + Zod (T2), curriculum/parity (T3), skeleton +
  registration + search + parity-test update (T4), endpoint mechanics 1–2 (T5), helper/content
  mechanics 3–6 + full completion (T6), e2e + bundle (T7). All six checkpoints
  (`autodeposit-vop`, `chaps-pacs008`, `eft-window`, `limit-check`, `rail-chooser`,
  `app-reimbursement`) are defined in T3's parity entry and fired across T5–T6.
- **Verify-before-code anchors:** the exact seeded IBAN/name pair that yields CLOSE_MATCH from
  `/api/verify-payee` (read `Lab3Content.tsx` / seed data — T5); the `legacyParity.test.ts` and
  `searchIndex.ts` real shapes (T4); the `lab8.spec.ts` style + real `relay:progress` shape (T7);
  whether `curriculum.test.ts` already imports `CURRICULUM` (T3). Everything else (VoP + pacs008
  contracts, `SchemeInfoSchema`, the scheme block line numbers, `MultipleChoice`/`Button` props,
  `useLabCompletion` via `onCheckpoint`) was read from source.
- **Type consistency:** `eftSettlement`/`limitCheck`/`appReimbursement` signatures identical across
  T1/T6; `SchemeInfo` optional fields consumed exactly as declared; checkpoint id strings identical
  between parity (T3) and firing sites (T5/T6).
- **Sequencing:** registry registration is in T4 (after `Lab9Content` exists) — no dangling lazy
  import. Mechanics are added into the same component across T5/T6; each ends green and committable.
- **Invariant:** additive only — existing scheme fields, `/api/verify-payee`, `/api/message/pacs008-check`,
  Labs 3/7/8, and other currencies are untouched; new `/api/schemes` fields are optional.
