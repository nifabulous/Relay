# Relay Customer Case Desk Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate two evidence-led Customer Case Desk experiences inside Relay's existing Learn workspace: Canadian collection/receipt and Canada-to-US supplier payment.

**Architecture:** Keep the existing React shell and Learn route, then add a direct case feature under `frontend/src/features/learn/cases/`. Authored synthetic case definitions, deterministic eligibility/evaluation, and versioned local session state are explicit modules; no universal case engine is introduced before observed research. The UI composes existing design-system primitives into a task-first workspace with an evidence rail on wide screens and a labelled Evidence sheet on tablet/mobile.

**Tech Stack:** React 19, TypeScript 7 strict, React Router 7, TanStack Query 5 only where existing infrastructure is useful, native HTML controls, Vitest 4 + Testing Library, Playwright 1.61 + axe, localStorage, and existing Relay design tokens/primitives.

## Global Constraints

- **Validation release:** Build two direct case prototypes before extracting a reusable case-package engine.
- **Synthetic data only:** Do not accept or persist real customer, account, beneficiary, transaction, or employer-confidential data.
- **Assessment:** Measure reasoning and information gathering, not clicks, elapsed time, or opened references; completion is not mastery.
- **Decision quality:** Use `invalid`, `possible`, `defensible`, and `preferred` under disclosed assumptions; more than one recommendation may be defensible.
- **Source governance:** Every material claim carries source, owner, verification date, jurisdiction/currency, scope, and review-by date; expired claims make the affected case unavailable.
- **Persistence:** Store versioned case drafts locally; restore phase/evidence/draft but never transient loading, sheets, alerts, or focus.
- **Visual direction:** Evidence-led operations workspace; no chat bubbles, assistant avatars, decorative card mosaics, gradients, glass effects, or route graphics used as filler.
- **Responsive:** Wide desktop uses task/evidence split; tablet collapses when minimum readable widths are not met; test 390×844, 768, 1024, and 1440 widths.
- **Accessibility:** Native radios, checkboxes, buttons, and inputs; 44px pointer targets; visible focus; managed focus after transitions; linked error summary; polite live announcements; reduced-motion support.
- **Privacy:** Research consent is optional and separate from learning progress; export, withdrawal, and deletion are explicit actions.
- **Dependencies:** Add no new package. Reuse `Button`, `AsyncRegion`, `StatusChip`, `PaymentRoute`, existing shell, and existing tokens.
- **Verification:** From `frontend/`, run `npm test -- --run <path>`, `npm run build`, and targeted Playwright/axe checks; finish with `npm test` and `npm run test:e2e`.
- **Commits:** Each task ends with one focused commit using `feat(learn): ...` or `test(learn): ...` and the repository's existing co-author convention.

## File Map

Create these focused case files:

- `frontend/src/features/learn/cases/caseTypes.ts` — case, fact, rail, draft, outcome, and consent interfaces.
- `frontend/src/features/learn/cases/caseCatalog.ts` — two authored synthetic case definitions and source metadata.
- `frontend/src/features/learn/cases/caseEvaluator.ts` — pure shortlist validation and decision-quality evaluation.
- `frontend/src/features/learn/cases/caseStore.ts` — versioned local draft/attempt persistence and safe recovery.
- `frontend/src/features/learn/cases/CaseDesk.tsx` / `CaseDesk.css` — route-level shell, phase orchestration, focus targets, and responsive layout.
- `frontend/src/features/learn/cases/EvidenceRail.tsx` / `EvidenceRail.css` — supplied/gathered/assumption/unknown ledger and source status.
- `frontend/src/features/learn/cases/ReferenceSheet.tsx` — contextual source details with focus trap/restore.
- `frontend/src/features/learn/cases/FactRequest.tsx` — native requestable-fact checkbox group.
- `frontend/src/features/learn/cases/RailShortlist.tsx` — native single/multiple rail selection and eligibility explanations.
- `frontend/src/features/learn/cases/RecommendationSummary.tsx` — read-only pre-send review and structured reasoning.
- `frontend/src/features/learn/cases/CaseOutcome.tsx` / `CaseDebrief.tsx` — consequence, decision-quality metadata, revision, transfer, and retention.
- `frontend/src/features/learn/cases/ResearchConsent.tsx` / `ResearchExport.tsx` — optional consent, review, export, withdrawal, and deletion.

Modify these existing files:

- `frontend/src/features/learn/LearnIndexPage.tsx` / `LearnPage.css` — case-first Learn landing and neutral case states.
- `frontend/src/app-shell/App.tsx` — lazy route `/learn/cases/:caseId` before the legacy `:moduleId` route.
- `frontend/src/design-system/StatusChip.tsx`, `StatusChip.css`, and `types.ts` — support decision-quality/source-status metadata without changing existing check statuses.
- `frontend/src/lib/persistence/storage.ts` and `persistence.test.ts` — namespaced case storage helpers and safe deletion.
- `frontend/e2e/case-desk.spec.ts` and feature unit tests — behavior, responsive, keyboard, and failure coverage.

---

### Task 1: Define case domain types, authored scenarios, and deterministic evaluator

**Files:**
- Create: `frontend/src/features/learn/cases/caseTypes.ts`
- Create: `frontend/src/features/learn/cases/caseCatalog.ts`
- Create: `frontend/src/features/learn/cases/caseEvaluator.ts`
- Test: `frontend/src/features/learn/cases/caseEvaluator.test.ts`
- Test: `frontend/src/features/learn/cases/caseCatalog.test.ts`

**Interfaces:**

```ts
export type CaseId = "canada-collection" | "canada-us-supplier";
export type CasePhase = "brief" | "investigate" | "recommend" | "resolve" | "debrief";
export type DecisionQuality = "invalid" | "possible" | "defensible" | "preferred";
export type FactState = "supplied" | "gathered" | "assumption" | "unknown";

export interface SourceClaim {
  source: string;
  owner: string;
  verifiedAt: string;
  reviewBy: string;
  jurisdiction: string;
  currency?: string;
  scope: "scheme-rule" | "operator-guidance" | "institution-config" | "example-assumption" | "simulation-only";
}

export interface CaseFact {
  id: string;
  label: string;
  value: string;
  state: FactState;
  requestable: boolean;
  claim?: SourceClaim;
}

export interface RailOption {
  id: string;
  name: string;
  eligibility: string;
  requiredFacts: string[];
  reasons: string[];
  source?: SourceClaim;
}

export interface CaseDefinition {
  id: CaseId;
  title: string;
  customerRequest: string;
  roleAndStakes: string;
  facts: CaseFact[];
  rails: RailOption[];
  transferCase: Omit<CaseDefinition, "transferCase" | "retentionCase">;
  retentionCase: Omit<CaseDefinition, "transferCase" | "retentionCase">;
}

export interface RecommendationDraft {
  shortlist: string[];
  selectedRail: string | null;
  reasons: string[];
  conditions: string[];
  priceExpectation: string;
  arrivalExpectation: string;
  trackingExpectation: string;
  customerExplanation: string;
}

export interface CaseOutcome {
  quality: DecisionQuality;
  consequence: string;
  soundReasoning: string[];
  reasoningGap: string | null;
  nextAction: string;
  invalidRailIds: string[];
  missingFactIds: string[];
}

export interface TransferResult {
  completed: boolean;
  quality: DecisionQuality | null;
  independent: boolean;
}

export interface RetentionResult {
  completed: boolean;
  quality: DecisionQuality | null;
  scheduledFor: string;
}
```

- [ ] **Step 1: Write failing evaluator tests** — add cases proving a rail that violates a supplied constraint is `invalid`, a viable but incomplete explanation is `possible`, a fully fact-supported route is `defensible`, and the best route under disclosed priorities is `preferred`.

```ts
it("rejects a rail that cannot serve the supplied currency and destination", () => {
  const result = evaluateRecommendation(canadaUsCase, {
    facts: ["destination-us", "currency-usd", "urgent"],
    shortlist: ["interac"],
    selectedRail: "interac",
    reasons: ["fast"],
    conditions: [],
    priceExpectation: "unknown",
    arrivalExpectation: "today",
    trackingExpectation: "confirmation only",
    customerExplanation: "We can send it now.",
  });
  expect(result.quality).toBe("invalid");
  expect(result.consequence).toContain("cannot serve");
});
```

- [ ] **Step 2: Run the focused tests** — `npm test -- --run src/features/learn/cases/caseEvaluator.test.ts` → FAIL because the evaluator and fixtures do not exist.
- [ ] **Step 3: Add the two synthetic catalog entries** — encode the Canadian collection case and Canada-to-US supplier case from the approved spec, including Interac Request Money, Autodeposit, Canadian EFT, ACH, Fedwire, SWIFT/correspondent considerations, cost/timing/tracking uncertainty, and source metadata. Keep all values explicitly simulation-only or assumption-scoped where no universal rule exists.
- [ ] **Step 4: Implement pure evaluator functions** — export `validateShortlist(definition, draft): { invalidRailIds: string[]; missingFactIds: string[] }` and `evaluateRecommendation(definition, draft): CaseOutcome`; never read storage, clock, network, or React state.
- [ ] **Step 5: Run focused tests** — `npm test -- --run src/features/learn/cases/caseEvaluator.test.ts src/features/learn/cases/caseCatalog.test.ts` → PASS.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/learn/cases
git commit -m "feat(learn): define customer case domain and evaluator"
```

### Task 2: Add versioned case drafts, attempts, and research consent storage

**Files:**
- Create: `frontend/src/features/learn/cases/caseStore.ts`
- Create: `frontend/src/features/learn/cases/caseStore.test.ts`
- Modify: `frontend/src/lib/persistence/storage.ts`
- Modify: `frontend/src/lib/persistence/persistence.test.ts`

**Interfaces:**

```ts
export interface CaseSession {
  schemaVersion: 1;
  caseId: CaseId;
  status: "not_started" | "in_progress" | "completed" | "under_review";
  phase: CasePhase;
  requestedFactIds: string[];
  draft: RecommendationDraft;
  firstAttempt: SubmittedAttempt | null;
  revisedAttempt: SubmittedAttempt | null;
  openedReferenceIds: string[];
  updatedAt: string;
}

export interface SubmittedAttempt {
  draft: RecommendationDraft;
  outcome: CaseOutcome;
  submittedAt: string;
}

export interface ResearchConsent {
  schemaVersion: 1;
  consented: boolean;
  consentedAt: string | null;
  withdrawnAt: string | null;
}

export function loadCaseSession(caseId: CaseId): CaseSession | null;
export function saveCaseSession(session: CaseSession): void;
export function clearCaseDraft(caseId: CaseId): void;
export function updateRequestedFacts(caseId: CaseId, requestedFactIds: string[]): { firstAffectedControlId: string | null };
export function loadResearchConsent(): ResearchConsent;
export function saveResearchConsent(consent: ResearchConsent): void;
export function buildResearchExport(session: CaseSession): string;
export function appendResearchEvent(event: { type: string; at: number; payload: Record<string, string | number | boolean> }): void;
export function clearResearchData(): void;
```

- [ ] **Step 1: Write failing storage tests** — verify a round trip preserves phase, evidence, optional text, and first attempt; corrupt JSON returns `null`; an obsolete schema is discarded; `clearCaseDraft` removes only the selected case; consent is independent of session data.
- [ ] **Step 2: Run** — `npm test -- --run src/features/learn/cases/caseStore.test.ts src/lib/persistence/persistence.test.ts` → FAIL.
- [ ] **Step 3: Implement namespaced storage** — use keys `relay:case-session:<caseId>` and `relay:research-consent`; call existing safe JSON helpers or equivalent guarded `localStorage` access; never persist open sheets, focus, loading, alerts, or transient validation state.
- [ ] **Step 4: Implement dependency invalidation** — `updateRequestedFacts` clears shortlist, recommendation, attempts, and outcome when a material upstream fact changes, while returning the first affected control id for focus management.
- [ ] **Step 5: Implement export and deletion** — serialize only consented structured session events and explicit learner notes; `clearCaseDraft` and a separate `clearResearchData` must be independently callable.
- [ ] **Step 6: Run** — `npm test -- --run src/features/learn/cases/caseStore.test.ts src/lib/persistence/persistence.test.ts` → PASS.
- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/learn/cases/caseStore.ts frontend/src/features/learn/cases/caseStore.test.ts frontend/src/lib/persistence/storage.ts frontend/src/lib/persistence/persistence.test.ts
git commit -m "feat(learn): persist customer case sessions safely"
```

### Task 3: Make Learn case-first and register the case route

**Files:**
- Modify: `frontend/src/features/learn/LearnIndexPage.tsx`
- Modify: `frontend/src/features/learn/LearnPage.css`
- Modify: `frontend/src/app-shell/App.tsx`
- Create: `frontend/src/features/learn/cases/caseRoutes.test.tsx`

**Interfaces:**
- Consumes `CASE_CATALOG`, `loadCaseSession`, `clearCaseDraft`, and existing `loadProgress`.
- Produces links `/learn/cases/canada-collection` and `/learn/cases/canada-us-supplier`; legacy technical labs remain below the case section.

- [ ] **Step 1: Write failing route/landing tests** — render Learn with no sessions and assert one dominant Start case action, two case entries, a quieter Technical Labs section, and no “mastery” or “certification” copy; seed a session and assert Resume; seed `under_review` and assert disabled start/resume plus verification date.
- [ ] **Step 2: Run** — `npm test -- --run src/features/learn/cases/caseRoutes.test.tsx` → FAIL.
- [ ] **Step 3: Add case-first Learn markup** — render the first available case as the primary action; render session labels exactly `Not started`, `In progress`, `Completed`, or `Under review`; use `Button`/`Link` semantics and preserve the existing curriculum list as secondary deep dives.
- [ ] **Step 4: Add route-level lazy import** — in `App.tsx`, load `CaseDesk` and add `learn/cases/:caseId` before `learn/:moduleId`, with an explicit not-found state handled by `CaseDesk`.
- [ ] **Step 5: Style and test** — use existing tokens, thin dividers, no card mosaic, visible focus, and 44px actions; run the focused test and `npm run build` → PASS.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/learn/LearnIndexPage.tsx frontend/src/features/learn/LearnPage.css frontend/src/app-shell/App.tsx frontend/src/features/learn/cases/caseRoutes.test.tsx
git commit -m "feat(learn): make customer cases the primary entry"
```

### Task 4: Build the evidence-led Case Desk shell and evidence rail

**Files:**
- Create: `frontend/src/features/learn/cases/CaseDesk.tsx`
- Create: `frontend/src/features/learn/cases/CaseDesk.css`
- Create: `frontend/src/features/learn/cases/EvidenceRail.tsx`
- Create: `frontend/src/features/learn/cases/EvidenceRail.css`
- Create: `frontend/src/features/learn/cases/ReferenceSheet.tsx`
- Create: `frontend/src/features/learn/cases/ReferenceSheet.test.tsx`
- Modify: `frontend/src/design-system/StatusChip.tsx`, `StatusChip.css`, `types.ts`

**Interfaces:**

```ts
interface EvidenceRailProps {
  definition: CaseDefinition;
  requestedFactIds: string[];
  openedReferenceIds: string[];
  onOpenReference: (factId: string) => void;
}

interface ReferenceSheetProps {
  fact: CaseFact;
  open: boolean;
  onClose: () => void;
  returnFocusRef: import("react").RefObject<HTMLButtonElement | null>;
}
```

- [ ] **Step 1: Write failing component tests** — assert customer request appears first, supplied/gathered/assumption/unknown sections are labelled, source status includes verification date and scope, and `ReferenceSheet` restores focus after close and closes on Escape.
- [ ] **Step 2: Run** — `npm test -- --run src/features/learn/cases/ReferenceSheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement `EvidenceRail`** — render a structured ledger with thin dividers and compact source status; use `AsyncRegion` around any live enrichment; expose a text-labelled `View source details` button for each claim.
- [ ] **Step 4: Implement `ReferenceSheet`** — use a portal or sibling overlay with `role="dialog"`, `aria-modal="true"`, labelled heading, focus trap, Escape close, and focus restoration; keep body measure between 45 and 75 characters.
- [ ] **Step 5: Extend status metadata** — preserve existing `CheckStatus` labels and add a separate typed display map for `invalid`, `possible`, `defensible`, `preferred`, and source freshness; every status includes text and icon, never color only.
- [ ] **Step 6: Implement `CaseDesk` frame** — render case header, phase progress, primary task outlet, evidence rail, one dominant action, and a mobile/tablet Evidence button that opens the same labelled sheet. Do not persist open sheet or focus.
- [ ] **Step 7: Run** — `npm test -- --run src/features/learn/cases/ReferenceSheet.test.tsx src/design-system/primitives.test.tsx && npm run build` → PASS.
- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/learn/cases frontend/src/design-system/StatusChip.tsx frontend/src/design-system/StatusChip.css frontend/src/design-system/types.ts
git commit -m "feat(learn): build evidence-led case desk shell"
```

### Task 5: Implement Investigate controls with native semantics

**Files:**
- Create: `frontend/src/features/learn/cases/FactRequest.tsx`
- Create: `frontend/src/features/learn/cases/RailShortlist.tsx`
- Create: `frontend/src/features/learn/cases/InvestigatePhase.test.tsx`
- Modify: `frontend/src/features/learn/cases/CaseDesk.tsx`

**Interfaces:**

```ts
interface FactRequestProps {
  facts: CaseFact[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}

interface RailShortlistProps {
  rails: RailOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  invalidIds: string[];
}
```

- [ ] **Step 1: Write failing tests** — assert requestable facts render as native checkboxes with a visible legend; one selected rail uses a native radio group; keyboard can tab, select, and submit; no rail is pre-highlighted; invalid candidates remain visible after evaluation with a reason.
- [ ] **Step 2: Run** — `npm test -- --run src/features/learn/cases/InvestigatePhase.test.tsx` → FAIL.
- [ ] **Step 3: Implement `FactRequest`** — render only requestable facts as checkboxes, preserve selection on validation errors, move requested facts to gathered evidence after the authored response, and announce the evidence count through a polite live region.
- [ ] **Step 4: Implement `RailShortlist`** — use a fieldset/legend, native radio for the committed route, optional checkbox shortlist where multiple candidates are required, visible eligibility text, and remove actions with accessible names.
- [ ] **Step 5: Connect to `CaseDesk`** — persist each material action through `caseStore`, invalidate dependent selections through `updateRequestedFacts`, announce cleared decisions, and focus the first affected control.
- [ ] **Step 6: Run** — focused tests plus `npm run build` → PASS.
- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/learn/cases/FactRequest.tsx frontend/src/features/learn/cases/RailShortlist.tsx frontend/src/features/learn/cases/InvestigatePhase.test.tsx frontend/src/features/learn/cases/CaseDesk.tsx
git commit -m "feat(learn): add accessible investigation controls"
```

### Task 6: Implement Recommend, Resolve, debrief, and transfer states

**Files:**
- Create: `frontend/src/features/learn/cases/RecommendationSummary.tsx`
- Create: `frontend/src/features/learn/cases/CaseOutcome.tsx`
- Create: `frontend/src/features/learn/cases/CaseDebrief.tsx`
- Create: `frontend/src/features/learn/cases/RecommendResolve.test.tsx`
- Modify: `frontend/src/features/learn/cases/CaseDesk.tsx`

**Interfaces:**

```ts
interface RecommendationSummaryProps {
  draft: RecommendationDraft;
  onSubmit: () => void;
  submitting: boolean;
  error?: string;
}

interface CaseOutcomeProps {
  outcome: CaseOutcome;
  firstAttempt: boolean;
  onRevise: () => void;
}

interface CaseDebriefProps {
  firstAttempt: SubmittedAttempt;
  revisedAttempt: SubmittedAttempt | null;
  transfer: TransferResult;
  retention: RetentionResult | null;
}
```

- [ ] **Step 1: Write failing tests** — assert evaluation is hidden while fields are edited; `Send recommendation` creates the immutable first attempt; consequence appears before classification; revision does not mutate the first attempt; debrief labels supported performance, independent transfer, and retention separately; no “Passed”, “Mastered”, score, badge, or certification copy appears.
- [ ] **Step 2: Run** — `npm test -- --run src/features/learn/cases/RecommendResolve.test.tsx` → FAIL.
- [ ] **Step 3: Implement structured recommendation form** — collect reason, required conditions, risk, price expectation, arrival expectation, tracking expectation, and optional customer explanation with native labelled controls; preserve text through validation.
- [ ] **Step 4: Implement commit boundary** — render a read-only summary; disable and announce pending evaluation; call `evaluateRecommendation`; persist `firstAttempt` only after success; focus the operational consequence heading.
- [ ] **Step 5: Implement consequence and revision** — show consequence, then `StatusChip` metadata and one prioritized reasoning gap; keep first attempt read-only; allow a clearly labelled revision and preserve both attempts.
- [ ] **Step 6: Implement debrief and transfer** — show what was considered, missed, sound reasoning, next action, close transfer with reduced scaffolding, and contrast retention state; mark the session `completed` only when the experience is finished, not when quality is preferred.
- [ ] **Step 7: Run** — focused tests plus `npm run build` → PASS.
- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/learn/cases/RecommendationSummary.tsx frontend/src/features/learn/cases/CaseOutcome.tsx frontend/src/features/learn/cases/CaseDebrief.tsx frontend/src/features/learn/cases/RecommendResolve.test.tsx frontend/src/features/learn/cases/CaseDesk.tsx
git commit -m "feat(learn): add recommendation consequence and debrief loop"
```

### Task 7: Add optional research consent, export, withdrawal, and deletion UI

**Files:**
- Create: `frontend/src/features/learn/cases/ResearchConsent.tsx`
- Create: `frontend/src/features/learn/cases/ResearchExport.tsx`
- Create: `frontend/src/features/learn/cases/ResearchControls.test.tsx`
- Modify: `frontend/src/features/learn/cases/CaseDesk.tsx`

**Interfaces:**

```ts
interface ResearchConsentProps {
  consent: ResearchConsent;
  onChange: (next: ResearchConsent) => void;
}

interface ResearchExportProps {
  session: CaseSession;
  consent: ResearchConsent;
  onDelete: () => void;
}
```

- [ ] **Step 1: Write failing tests** — assert a learner can start and complete a case without consent; consent text names purpose, synthetic-data boundary, event categories, retention period, and withdrawal; declining stops future events; export reveals recorded events; deletion clears research data without clearing learning progress.
- [ ] **Step 2: Run** — `npm test -- --run src/features/learn/cases/ResearchControls.test.tsx` → FAIL.
- [ ] **Step 3: Implement optional consent** — render before the first case action without blocking use; save consent independently; provide withdrawal that stops future telemetry while preserving local learning state.
- [ ] **Step 4: Implement export/review** — show first attempt, revision, hints, opened references, and timestamps; export only when consented; show success/error states without blocking debrief.
- [ ] **Step 5: Implement deletion** — call explicit storage deletion for research data, preserve case progress unless the learner separately chooses restart, and announce the result.
- [ ] **Step 6: Run** — focused tests plus `npm run build` → PASS.
- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/learn/cases/ResearchConsent.tsx frontend/src/features/learn/cases/ResearchExport.tsx frontend/src/features/learn/cases/ResearchControls.test.tsx frontend/src/features/learn/cases/CaseDesk.tsx
git commit -m "feat(learn): add optional case research controls"
```

### Task 8: Verify responsive, accessibility, persistence recovery, and both end-to-end cases

**Files:**
- Create: `frontend/e2e/case-desk.spec.ts`
- Create: `frontend/src/features/learn/cases/accessibility.test.tsx`
- Modify: `frontend/playwright.config.ts` only if the existing project lacks the target viewport projects
- Modify: `frontend/src/features/learn/cases/CaseDesk.css` only for failures found by the tests

- [ ] **Step 1: Write the failing end-to-end journeys** — cover fresh start, request facts, shortlist, send recommendation, consequence, revision, debrief, refresh resume, restart confirmation, stale/under-review case, API enrichment unavailable, and research consent decline.

```ts
test("supplier case preserves first attempt and supports revision", async ({ page }) => {
  await page.goto("/app/learn/cases/canada-us-supplier");
  await page.getByRole("button", { name: "Start case" }).click();
  await page.getByRole("group", { name: /facts/i }).getByRole("checkbox", { name: /beneficiary/i }).check();
  await page.getByRole("radio", { name: /ACH/i }).check();
  await page.getByRole("button", { name: "Review recommendation" }).click();
  await page.getByRole("button", { name: "Send recommendation" }).click();
  await expect(page.getByRole("heading", { name: /what this would cause/i })).toBeVisible();
  await page.getByRole("button", { name: /revise/i }).click();
  await expect(page.getByText(/first attempt/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the journeys** — `npm run test:e2e -- e2e/case-desk.spec.ts` → FAIL until the full flow and route fixtures are connected.
- [ ] **Step 3: Add viewport/accessibility assertions** — run at 390×844, 768, 1024, and 1440; assert no horizontal scroll, 44px minimum targets, visible focus, labelled Evidence sheet, Escape close, focus restoration, live transition announcement, and reduced-motion behavior.
- [ ] **Step 4: Add axe checks** — use the existing `@axe-core/playwright` dependency and fail on serious/critical violations in brief, investigate, recommend, outcome, sheet, and debrief states.
- [ ] **Step 5: Verify recovery paths** — corrupt the case-session key, mark a catalog claim expired, force the enrichment handler to fail, and assert authored case facts remain usable with the specified recovery copy.
- [ ] **Step 6: Run the complete verification suite** — from `frontend/`: `npm test`, `npm run build`, `npm run test:e2e`, and `npm run check:bundle` → all PASS; from repo root: `python -m pytest tests/ -q` → PASS to confirm no backend regression.
- [ ] **Step 7: Commit**

```bash
git add frontend/e2e/case-desk.spec.ts frontend/src/features/learn/cases/accessibility.test.tsx frontend/playwright.config.ts frontend/src/features/learn/cases/CaseDesk.css
git commit -m "test(learn): verify customer case desk journeys and accessibility"
```

### Task 9: Prepare the observed validation release

**Files:**
- Create: `docs/research/customer-case-desk-facilitator-guide.md`
- Create: `docs/research/customer-case-desk-observation-sheet.md`
- Create: `docs/research/customer-case-desk-consent-form.md`
- Create: `docs/research/customer-case-desk-export-readme.md`
- Modify: `README.md` with local run and research-prototype boundaries

- [ ] **Step 1: Write the facilitator guide** — document the five-person Round 1 mix, five-minute baseline, one observed case, post-session interview, three-to-seven-day neutral link, silent-facilitator rule, safety/consent/technical-failure exceptions, and synthetic-data boundary.
- [ ] **Step 2: Write the observation sheet** — record independent start, role/stakes comprehension, material fact requests, shortlist reasoning, recommendation reached, references used, transfer result, hesitation, and concrete work moments without converting them into a single score.
- [ ] **Step 3: Write consent/export instructions** — match the UI copy, state retention period as a value selected before recording, explain withdrawal/deletion, and document the exact structured event fields.
- [ ] **Step 4: Update README** — state that Relay is an educational simulation and research prototype, not production payment advice, and include `cd frontend && npm install && npm run dev` plus the test commands.
- [ ] **Step 5: Run a facilitator-script rehearsal** — complete both cases with synthetic data, verify the script does not coach rail selection, and record any copy or state defect as a follow-up implementation change.
- [ ] **Step 6: Commit**

```bash
git add docs/research README.md
git commit -m "docs(learn): prepare customer case validation research"
```

## Self-Review Checklist

- [ ] Case-first Learn entry, two scenarios, reference library, and optional technical labs are covered by Tasks 1, 3, and 9.
- [ ] Evidence ledger, contextual references, source expiry, stale recovery, and live enrichment failure are covered by Tasks 1, 4, and 8.
- [ ] Click-independent assessment, first-attempt preservation, revision, transfer, and retention are covered by Tasks 1 and 6.
- [ ] Local draft persistence, invalidation, corrupt recovery, consent, export, withdrawal, and deletion are covered by Tasks 2, 7, and 8.
- [ ] Responsive, keyboard, screen-reader, focus, live-region, target-size, reduced-motion, and no-horizontal-scroll requirements are covered by Tasks 4, 5, 6, and 8.
- [ ] No new dependencies, generic case engine, account sync, cohort dashboard, badges, or unvalidated rails are introduced.
- [ ] A final text scan confirms every implementation step names its files, interfaces, test command, and expected result.

## Handoff to Engineering Review

Run the engineering plan review against this document before implementing Task 1. The review should specifically validate the route precedence (`learn/cases/:caseId` before `learn/:moduleId`), the case-store schema and invalidation rules, the boundary between deterministic authored evaluation and UI state, the StatusChip type extension, focus-trap implementation, and the absence of a premature generic case engine.
