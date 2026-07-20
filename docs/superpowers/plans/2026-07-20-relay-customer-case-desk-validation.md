# Relay Customer Case Desk — Phase 1 Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one complete, researchable Customer Case Desk experience for a Canada-to-US supplier payment before expanding Relay to a second case or a reusable case engine.

**Architecture:** Extend the existing Learn route with one direct case implementation. Keep authored synthetic facts and deterministic evaluation in pure modules; keep draft and first-attempt state in a versioned local store; compose the approved evidence-led workspace from existing Relay primitives. This slice proves whether a payments professional can investigate, recommend, explain timing/cost/tracking, and revise a decision.

**Tech Stack:** React 19, TypeScript 7 strict, React Router 7, native controls, Vitest 4 + Testing Library, Playwright + axe, localStorage, and the existing Relay design system. No new dependencies.

## Scope decision

This plan is intentionally limited to the smallest complete validation loop:

- Included: Canada-to-US supplier payment, local draft persistence, evidence rail, contextual references, deterministic evaluation, first-attempt preservation, revision, debrief, transfer case, accessibility, and one end-to-end journey.
- Deferred: Canadian collection/receipt case, research consent/export UI, facilitator materials, second-case retention study, generic case-package extraction, accounts/sync, badges, dashboards, and additional rails.
- The deferred work is tracked in `docs/superpowers/plans/2026-07-20-relay-customer-case-desk-validation-phase-2.md` and requires evidence from Phase 1 before implementation.

## Global constraints

- Synthetic data only; never accept real customer, account, beneficiary, transaction, or employer-confidential data.
- Completion means the case was finished; it never means mastery, certification, or job readiness.
- Evaluate information gathering and reasoning, not clicks, time, or opened references.
- Use `invalid`, `possible`, `defensible`, and `preferred` under disclosed assumptions.
- Every material claim includes source, owner, verification date, jurisdiction/currency, scope, and review-by date.
- Use raw IDs for route/recommendation relationships; use `corpus:<id>` only for evidence namespace IDs.
- Use native radios, checkboxes, buttons, and inputs; support keyboard, screen readers, 44px targets, visible focus, live announcements, and reduced motion.
- Do not introduce chat bubbles, assistant avatars, decorative card mosaics, gradients, glass effects, or decorative route graphics.
- Reuse `Button`, `AsyncRegion`, `StatusChip`, `PaymentRoute`, `AppShell`, and existing tokens.

## File map

Create:

- `frontend/src/features/learn/cases/caseTypes.ts` — case, fact, rail, draft, attempt, outcome, and transfer types.
- `frontend/src/features/learn/cases/caseCatalog.ts` — one authored Canada-to-US supplier case plus a close transfer fixture.
- `frontend/src/features/learn/cases/caseEvaluator.ts` — pure shortlist validation and decision-quality evaluation.
- `frontend/src/features/learn/cases/caseStore.ts` — versioned session persistence, invalidation, restart, and safe recovery.
- `frontend/src/features/learn/cases/CaseDesk.tsx` / `CaseDesk.css` — phase orchestration and responsive workspace.
- `frontend/src/features/learn/cases/EvidenceRail.tsx` / `ReferenceSheet.tsx` — evidence ledger and source details.
- `frontend/src/features/learn/cases/FactRequest.tsx` / `RailShortlist.tsx` — investigation controls.
- `frontend/src/features/learn/cases/RecommendationSummary.tsx` / `CaseOutcome.tsx` / `CaseDebrief.tsx` — commit boundary, consequence, revision, and transfer.

Modify:

- `frontend/src/features/learn/LearnIndexPage.tsx` / `LearnPage.css` — one primary case entry and neutral Start/Resume/Completed states.
- `frontend/src/app-shell/App.tsx` — add `learn/cases/:caseId` before `learn/:moduleId`.
- `frontend/src/design-system/StatusChip.tsx`, `StatusChip.css`, and `types.ts` — add decision-quality/source metadata without breaking existing check statuses.
- `frontend/src/lib/persistence/storage.ts` and `persistence.test.ts` — namespaced case storage helpers.
- `frontend/e2e/case-desk.spec.ts` — complete user journey and recovery checks.

---

### Task 1: Define the supplier case and pure evaluator

**Files:**

- Create: `frontend/src/features/learn/cases/caseTypes.ts`
- Create: `frontend/src/features/learn/cases/caseCatalog.ts`
- Create: `frontend/src/features/learn/cases/caseEvaluator.ts`
- Test: `frontend/src/features/learn/cases/caseEvaluator.test.ts`
- Test: `frontend/src/features/learn/cases/caseCatalog.test.ts`

**Interfaces:**

```ts
export type CaseId = "canada-us-supplier";
export type CasePhase = "brief" | "investigate" | "recommend" | "resolve" | "debrief";
export type DecisionQuality = "invalid" | "possible" | "defensible" | "preferred";

export interface SourceClaim {
  source: string;
  owner: string;
  verifiedAt: string;
  reviewBy: string;
  jurisdiction: string;
  currency?: string;
  scope: "scheme-rule" | "operator-guidance" | "institution-config" | "example-assumption" | "simulation-only";
}

export interface CaseFact { id: string; label: string; value: string; state: "supplied" | "gathered" | "assumption" | "unknown"; requestable: boolean; claim?: SourceClaim; }
export interface RailOption { id: string; name: string; eligibility: string; requiredFacts: string[]; reasons: string[]; source?: SourceClaim; }
export interface RecommendationDraft { shortlist: string[]; selectedRail: string | null; reasons: string[]; conditions: string[]; priceExpectation: string; arrivalExpectation: string; trackingExpectation: string; customerExplanation: string; }
export interface CaseOutcome { quality: DecisionQuality; consequence: string; soundReasoning: string[]; reasoningGap: string | null; nextAction: string; invalidRailIds: string[]; missingFactIds: string[]; }
```

- [ ] Write tests for: ineligible rail → `invalid`; eligible but incomplete reasoning → `possible`; fact-supported route → `defensible`; best fit under disclosed priorities → `preferred`; empty shortlist; missing required facts; and multiple defensible alternatives.
- [ ] Run `npm test -- --run src/features/learn/cases/caseEvaluator.test.ts` and confirm the new tests fail before implementation.
- [ ] Author the synthetic supplier request with destination, USD currency, urgency, amount, price, arrival, tracking, intermediary, and institution-variation facts. Include a close transfer fixture with less scaffolding.
- [ ] Implement pure `validateShortlist(definition, draft)` and `evaluateRecommendation(definition, draft)` with no storage, network, clock, or React dependencies.
- [ ] Run the focused tests and `npm run build`; both must pass.
- [ ] Commit: `feat(learn): define supplier case and evaluator`.

### Task 2: Add versioned session persistence and invalidation

**Files:**

- Create: `frontend/src/features/learn/cases/caseStore.ts`
- Test: `frontend/src/features/learn/cases/caseStore.test.ts`
- Modify: `frontend/src/lib/persistence/storage.ts`
- Modify: `frontend/src/lib/persistence/persistence.test.ts`

**Interfaces:**

```ts
export interface CaseSession {
  schemaVersion: 1;
  caseId: CaseId;
  status: "not_started" | "in_progress" | "completed";
  phase: CasePhase;
  requestedFactIds: string[];
  draft: RecommendationDraft;
  firstAttempt: { draft: RecommendationDraft; outcome: CaseOutcome; submittedAt: string } | null;
  revisedAttempt: { draft: RecommendationDraft; outcome: CaseOutcome; submittedAt: string } | null;
  openedReferenceIds: string[];
  updatedAt: string;
}

export function loadCaseSession(caseId: CaseId): CaseSession | null;
export function saveCaseSession(session: CaseSession): void;
export function clearCaseDraft(caseId: CaseId): void;
export function updateRequestedFacts(caseId: CaseId, ids: string[]): { firstAffectedControlId: string | null };
```

- [ ] Test round-trip persistence, corrupt JSON, obsolete schema, absent session, restart clearing only the selected case, and preserving the immutable first attempt.
- [ ] Test that changing an upstream fact clears shortlist, recommendation, and outcomes while retaining the case shell and returning the first affected control id.
- [ ] Run `npm test -- --run src/features/learn/cases/caseStore.test.ts src/lib/persistence/persistence.test.ts` and confirm red before implementation.
- [ ] Implement keys `relay:case-session:<caseId>` with guarded localStorage access; never persist loading, open sheets, alerts, or focus.
- [ ] Run the focused tests and confirm green.
- [ ] Commit: `feat(learn): persist supplier case sessions safely`.

### Task 3: Add the case-first Learn entry and route

**Files:**

- Modify: `frontend/src/features/learn/LearnIndexPage.tsx`
- Modify: `frontend/src/features/learn/LearnPage.css`
- Modify: `frontend/src/app-shell/App.tsx`
- Test: `frontend/src/features/learn/cases/caseRoutes.test.tsx`

- [ ] Test fresh Learn state, Resume after a seeded draft, Completed after a finished session, and a missing case id.
- [ ] Run the focused test and confirm it fails before implementation.
- [ ] Render one dominant `Start case`/`Resume case` action and keep legacy technical labs below it; do not use Passed, Mastered, Certified, score, badge, or credential language.
- [ ] Add the lazy `learn/cases/:caseId` route before `learn/:moduleId` so `cases` cannot be interpreted as a module id.
- [ ] Run the focused test and `npm run build`; confirm green.
- [ ] Commit: `feat(learn): add supplier case entry and route`.

### Task 4: Build the evidence-led Case Desk

**Files:**

- Create: `frontend/src/features/learn/cases/CaseDesk.tsx`
- Create: `frontend/src/features/learn/cases/CaseDesk.css`
- Create: `frontend/src/features/learn/cases/EvidenceRail.tsx`
- Create: `frontend/src/features/learn/cases/ReferenceSheet.tsx`
- Create: `frontend/src/features/learn/cases/FactRequest.tsx`
- Create: `frontend/src/features/learn/cases/RailShortlist.tsx`
- Test: `frontend/src/features/learn/cases/CaseDesk.test.tsx`
- Test: `frontend/src/features/learn/cases/ReferenceSheet.test.tsx`

**Interfaces:**

```ts
interface CaseDeskProps { caseId: CaseId; }
interface EvidenceRailProps { definition: CaseDefinition; requestedFactIds: string[]; onOpenReference: (factId: string) => void; }
interface ReferenceSheetProps { fact: CaseFact; open: boolean; onClose: () => void; returnFocusRef: import("react").RefObject<HTMLButtonElement | null>; }
```

- [ ] Test the customer request anchor, supplied/gathered/assumption/unknown sections, compact source status, native fact checkboxes, native rail selection, and no preselected recommendation.
- [ ] Test the reference sheet role, labelled heading, Escape close, focus trap, focus restoration, and preserved draft.
- [ ] Run focused tests and confirm red before implementation.
- [ ] Implement wide desktop task/evidence split and task-first tablet/mobile layout using existing tokens and primitives; use a labelled Evidence sheet below the split breakpoint.
- [ ] Implement `AsyncRegion` loading/error/unavailable/partial states without blocking authored facts.
- [ ] Extend `StatusChip` with text-and-icon decision-quality metadata while preserving existing `CheckStatus` call sites.
- [ ] Move focus to the new phase/outcome heading after transitions; use a linked error summary and polite live region for evidence changes; respect reduced motion.
- [ ] Run focused tests and `npm run build`; confirm green.
- [ ] Commit: `feat(learn): build evidence-led supplier case desk`.

### Task 5: Implement recommendation, consequence, revision, and transfer

**Files:**

- Create: `frontend/src/features/learn/cases/RecommendationSummary.tsx`
- Create: `frontend/src/features/learn/cases/CaseOutcome.tsx`
- Create: `frontend/src/features/learn/cases/CaseDebrief.tsx`
- Test: `frontend/src/features/learn/cases/RecommendationFlow.test.tsx`
- Modify: `frontend/src/features/learn/cases/CaseDesk.tsx`

- [ ] Test that evaluation is hidden before commit; Send recommendation creates one immutable first attempt; consequence precedes classification; revision does not mutate the first attempt; and the debrief separates supported performance from independent transfer.
- [ ] Test rapid double-submit, evaluation failure with draft preservation, empty optional explanation, and navigating away before commit.
- [ ] Run focused tests and confirm red before implementation.
- [ ] Implement read-only summary, explicit `Send recommendation`, pending state, deterministic evaluator call, consequence-first feedback, decision-quality chip, one prioritized reasoning gap, revision, and close transfer.
- [ ] Mark the session `completed` only when the experience is finished, not when quality is `preferred`.
- [ ] Run focused tests and `npm run build`; confirm green.
- [ ] Commit: `feat(learn): add supplier recommendation and debrief flow`.

### Task 6: Verify the complete vertical slice

**Files:**

- Create: `frontend/e2e/case-desk.spec.ts`
- Create: `frontend/src/features/learn/cases/accessibility.test.tsx`
- Modify: `frontend/playwright.config.ts` only if target viewport projects are absent.

- [ ] Add an E2E journey covering Start case → request facts → shortlist → recommendation summary → Send recommendation → consequence → revision → debrief.
- [ ] Add refresh/resume, restart confirmation, corrupt draft, unavailable enrichment, and stale claim recovery tests.
- [ ] Run the journey at 390×844, 768, 1024, and 1440; assert no horizontal scroll, 44px targets, keyboard traversal, focus restoration, labelled sheet, Escape close, live announcements, and reduced motion.
- [ ] Run axe checks on brief, investigate, recommend, outcome, reference sheet, and debrief states.
- [ ] Run `npm test`, `npm run build`, `npm run test:e2e`, `npm run check:bundle`, and `python -m pytest tests/ -q`; all must pass.
- [ ] Commit: `test(learn): verify supplier case vertical slice`.

## Phase 2 — Deferred follow-up

Implement only after Phase 1 observed research establishes that the Case Desk resembles real work:

- Add the Canadian collection/receipt case.
- Add optional consent, event export, withdrawal, and deletion UI.
- Add facilitator, observation, interview, and consent materials.
- Add delayed retention case and unguided Round 2 validation.
- Extract shared case units only from repeated behavior across both cases.
- Revisit accounts, sync, dashboards, badges, missing tracks, and additional rails only when demand evidence supports them.

## Engineering review handoff

Review this Phase 1 plan against the approved design spec before implementation. Validate route precedence, session invalidation, evaluator/UI boundaries, source expiry behavior, focus management, and whether the vertical slice is genuinely sufficient to test learner pull.
