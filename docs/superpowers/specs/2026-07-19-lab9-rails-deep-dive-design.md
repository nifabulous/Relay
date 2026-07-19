# Lab 9 — Rails Deep-Dive: Canada & UK — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan
**Theme:** Teach the CAD and GBP domestic rails in real depth, plus the two consumer-protection
overlays (name-check before payment; APP-scam reimbursement), through six interactive mechanics —
two reusing existing endpoints, three backed by new pure helpers, one content-driven.

## Problem / motivation

Today the app teaches CAD and GBP as one flat line per rail (`name/speed/limit/cost/useCase/operator`).
That is too shallow: Interac has Autodeposit, Request Money, alias mechanics and a *layered* limit
model; EFT runs on fixed daily windows; CHAPS is mid-migration to ISO 20022 with a hard Nov-2026
structured-address rule; and the UK now has mandatory Confirmation of Payee and APP-scam
reimbursement. None of this is taught. Lab 9 adds a dedicated deep-dive that also ties back to
existing labs (VoP → Lab 3, pacs.008 → Lab 8) and teaches the cross-currency "rhyme."

Data corrections this fixes: Interac is not "$3,000–10,000" — it is a layered set (per-txn /
day / month / receiving). CAD is mid-transformation (Real-Time Rail arriving ~Q3 2026).

## Researched facts to encode (verified July 2026; date-stamp the fast-moving ones)

**CAD**
- **Interac e-Transfer** — alias-based (email/phone; money moves over bank rails, alias only
  carries the notification/deposit instructions). Features: **Autodeposit** (pre-authorized deposit;
  the sender is shown the recipient's *registered legal name* before sending — a Confirmation-of-Payee-like
  control), **Request Money** (pull), manual claim (security Q&A). Limits (Big-Five personal):
  **$3,000/transaction (network ceiling), $10,000/day, $30,000/month; receiving up to $25,000;
  Business up to $25,000/transfer**. Settlement: today over existing rails; **moving to the
  Real-Time Rail (RTR) for real-time clearing/settlement**. Irreversible once deposited.
- **EFT (via ACSS)** — batch; **three daily windows ≈ 05:00 / 14:15 / 19:00 ET**; 1–2 business
  days; no weekends/holidays. Payroll/vendor.
- **Lynx** — RTGS, high-value, real-time final, ISO 20022. Pre-funding underpins RTR.
- **Roadmap (dated):** RTR real-time payments targeted **Q3 2026** (may slip to late-2026/early-2027);
  ISO 20022; RTR will settle Interac in real time.

**GBP**
- **Faster Payments (FPS)** — scheme max **£1,000,000** (raised from £250k); banks cap lower
  (**~£25,000 personal, up to £1M business**). Evolving under the **New Payments Architecture (NPA)**.
- **CHAPS** — RTGS. Bank of England RTGS-renewal ISO 20022 mandates: **Purpose Codes + LEI (May 2025)**,
  **hybrid addresses from Nov 2025, fully-unstructured addresses rejected Nov 2026**, structured
  remittance mandated. This is a real `pacs.008` use case → bridges to Lab 8.
- **Bacs** — 3-day cycle (Direct Credit + Direct Debit), payroll/pensions.
- **Protections (UK):** **Confirmation of Payee** — mandatory since Oct 2024 for FPS + CHAPS + new
  standing orders (match/close/no-match; PSR Specific Direction 17; direction transitions **1 Jul 2026**);
  **APP-scam reimbursement** — since **7 Oct 2024**, victims reimbursed **up to £85,000**, cost split
  **50/50** sending/receiving PSP, refund within 5 business days.

## Non-goals

- No real integration with Interac/Pay.UK/Bank of England — all simulated/illustrative.
- No new backend endpoint. Mechanics reuse `/api/verify-payee` and `/api/message/pacs008-check`;
  compute-only mechanics use new **pure frontend helpers**.
- Not enriching the other 8 currencies' rails in this slice (their scheme dicts keep the shallow
  shape; the new fields are optional).
- Not modifying the existing Lab 3 / Lab 7 / Lab 8 behavior; Lab 9 references them, doesn't change them.

## Part A — Backend: enrich `/api/schemes` (additive, non-breaking)

Extend the **six CAD + GBP rails** in `app/data/payment_schemes.py` with these **optional** keys
(other currencies untouched):

```
"howItWorks": [str, ...]        # ordered teaching steps
"features": [str, ...]          # e.g. ["Autodeposit", "Request Money", "Alias (email/phone)"]
"limits": {                     # structured, strings (bank-set caveat in `note`)
    "perTransaction": str, "perDay": str, "perMonth": str,
    "receiving": str, "note": str
}
"processingWindows": [str, ...] # batch rails only, e.g. ["05:00 ET","14:15 ET","19:00 ET"]
"settlement": str               # e.g. "ACSS batch", "Lynx RTGS", "Interac → RTR (targeted Q3 2026)"
"reversible": bool
"protections": [str, ...]       # e.g. ["Confirmation of Payee","APP reimbursement up to £85,000"]
"roadmap": [str, ...]           # dated notes, e.g. ["RTR real-time settlement targeted Q3 2026"]
```

`SchemeInfoSchema` in `frontend/src/api/schemas.ts` gains matching optional fields
(`z.array(z.string()).nullish().catch(null)`, `limits` as an optional object schema, `reversible`
as `z.boolean().nullish().catch(null)`). All `.passthrough()` — the in-progress #7b Explore Schemes
table keeps working unchanged (it maps only the known columns).

**Coordination note:** the #7b Schemes page is being built in parallel against `SchemeInfoSchema`.
These additions are additive/optional; land this after (or merge cleanly with) that work. Do not
remove or rename existing scheme fields.

## Part B — Lab 9 shell

- `curriculum.ts`: add `lab-9` "Rails Deep-Dive: Canada & UK", subtitle "Interac, EFT, CHAPS,
  Faster Payments — in depth", `prerequisites: ["lab-7", "lab-8"]`, `category: "core"`, placed
  before `capstone`. Capstone prerequisites unchanged.
- `legacyParity.ts`: `lab-9` entry, `legacySources: []` (net-new — exempt from the legacy-source
  invariant, same as lab-8), `requiredCheckpoints` = the six below.
- `labRegistry.tsx`: lazy import + registry entry.
- `Lab9Content.tsx`: fetches `/api/schemes?currency=CAD` and `?currency=GBP` (Zod-validated),
  renders the enriched rail detail, and hosts the six mechanics. Checkpoint-gated completion via the
  existing `useLabCompletion` mechanism.

Checkpoints (all six must fire to complete): `autodeposit-vop`, `chaps-pacs008`, `eft-window`,
`limit-check`, `rail-chooser`, `app-reimbursement`.

## Part C — The six mechanics

1. **Interac Autodeposit ↔ VoP** (`autodeposit-vop`) — reuses `POST /api/verify-payee`. A toggle:
   *Autodeposit ON* → call verify-payee for the recipient, show the returned account-holder legal
   name (a MATCH-style reveal) and explain "the sender sees who they're paying — a CoP-like control";
   *OFF* → show the security-question path (no name reveal) and the fraud tradeoff. Fires when the
   learner has seen the ON (name-revealed) path.
2. **CHAPS → pacs.008 structured address** (`chaps-pacs008`) — reuses `POST /api/message/pacs008-check`.
   A CHAPS payment form with a creditor address; submitting a country-only address returns REPAIRABLE
   (`PACS-ADDR-UNSTRUCTURED`) with the Nov-2026 CHAPS mandate explained. Fires on the hold.
3. **EFT window simulator** (`eft-window`) — pure `eftSettlement(submitEt, now?)`; learner picks a
   submit time → shows which of the three windows it catches and the resulting value date (skips
   weekends). Fires on first run.
4. **Layered-limit checker** (`limit-check`) — pure `limitCheck(amountMinor, limits)` over the
   enriched `limits`; learner enters an amount for a chosen rail → clears or names the first cap it
   breaches (per-transaction / per-day / per-month). Fires on first run.
5. **Rail-chooser scenarios** (`rail-chooser`) — `MultipleChoice` set (Lab 7 style): "split a £40
   dinner" → FPS; "£900k house completion" → CHAPS; "monthly payroll" → Bacs/EFT; "instant refund" →
   FPS/Interac. Fires when the set is completed correctly.
6. **APP "who pays" panel** (`app-reimbursement`) — pure `appReimbursement(amountMinor)` →
   `reimbursed = min(amount, 85_000_00)`, `senderPspShare` / `receiverPspShare` = half each, plus the
   5-business-day note. Learner enters a scam amount → sees the split and the £85k cap bite. Fires on
   first run.

## Part D — Pure helpers (co-located, testable like `mod97`/`relativeTime`)

New file `frontend/src/features/learn/labs/railsHelpers.ts`:

```ts
export interface EftSettlement { window: string; sameDay: boolean; valueDate: string; }
// Illustrative: three ET windows; after the last, or on weekends, rolls to next business day.
export function eftSettlement(submitEtIso: string): EftSettlement;

export interface LimitVerdict { clears: boolean; breached: "perTransaction" | "perDay" | "perMonth" | null; }
export function limitCheck(amountMinor: number, limits: { perTransactionMinor: number; perDayMinor: number; perMonthMinor: number }): LimitVerdict;

export interface AppReimbursement { reimbursedMinor: number; senderPspMinor: number; receiverPspMinor: number; cappedAt: number; }
export function appReimbursement(amountMinor: number): AppReimbursement; // cap 8_500_000 minor (£85,000)
```

All pure and total (never throw); dates/amounts passed in for deterministic tests. Amounts are in
minor units (pence/cents) to avoid float drift; the limit-checker's `limits` are parsed from the
enriched `limits` strings by a small pure parser (or the lesson passes numeric fixtures — the plan
picks the least-fragile option after reading the real limit strings).

## Data flow

```
/api/schemes?currency=CAD|GBP  → enriched rail detail (facts) rendered in Lab 9
verify-payee                    → Autodeposit name-reveal (mechanic 1)
message/pacs008-check           → CHAPS structured-address hold (mechanic 2)
railsHelpers (pure)             → EFT window / limit check / APP split (mechanics 3,4,6)
MultipleChoice content          → rail-chooser (mechanic 5)
useLabCompletion(6 checkpoints) → module marked complete
```

## Error handling

- Pure helpers never throw; invalid input yields a safe verdict (e.g. empty/NaN amount → not-clears
  / zero reimbursement).
- Endpoint mechanics use `AsyncRegion` / existing error patterns; a failed verify-payee or
  pacs008-check shows a retry, does not block other mechanics or the rest of the lab.
- Enriched-field parsing is defensive: missing optional fields render "not modeled here," never crash.

## Testing

**Backend (pytest):** the six CAD/GBP rails expose the new keys with the researched values (assert
Interac limits are the corrected figures, CHAPS `protections` includes CoP, `roadmap` mentions the
RTR/Nov-2026 dates); `/api/schemes?currency=CAD` and `?currency=GBP` still validate; other currencies
still lack the optional keys (no accidental spillover).

**Frontend (Vitest + RTL + MSW):**
- `eftSettlement`: before first window → window 1 same-day; after last window → next business day;
  Friday-evening → Monday value date.
- `limitCheck`: clears under all caps; breaches per-transaction / per-day / per-month at the right
  boundary; zero/NaN safe.
- `appReimbursement`: under £85k → full + 50/50 split; over £85k → capped at £85k, split of the cap.
- `SchemeInfoSchema` keeps the new optional fields when present; still parses when absent.
- Lab 9: each of the six checkpoints fires from its mechanic (MSW handlers for verify-payee +
  pacs008-check); completion only when all six fire.

**E2E (Playwright + axe):** lab-9 smoke (seed prereqs `lab-1..lab-8`, navigate, run one mechanic,
axe clean). Lab 9 lazy-loaded; bundle gate stays green.

## Rollout / sequencing (plan will expand)

1. Pure helpers `eftSettlement` / `limitCheck` / `appReimbursement` + tests.
2. Backend enrich the six rails + `SchemeInfoSchema` optional fields + tests.
3. Lab 9 curriculum/parity/registry shell.
4. `Lab9Content` rail-detail rendering (from enriched `/api/schemes`).
5. Mechanic 1 (Autodeposit↔VoP) + mechanic 2 (CHAPS→pacs.008).
6. Mechanics 3/4/6 (helper-backed) + mechanic 5 (rail-chooser content).
7. E2E smoke + bundle check.

TDD, one commit per task, additive throughout.

## Open questions

None blocking. The one judgement call — whether `limitCheck` parses the enriched `limits` strings or
consumes numeric fixtures — is resolved at implementation time by reading the real `limits` string
format; minor-unit numeric inputs are preferred for test determinism.
