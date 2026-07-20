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
- `frontend/src/design-system/StatusChip.tsx`, `StatusChip.css`, and `types.ts` — add a typed exhaustive status union/map for decision-quality and source metadata without breaking existing check statuses.
- `frontend/src/lib/persistence/storage.ts` and `persistence.test.ts` — shared versioned storage primitives used by the case store.
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
export interface TransferDefinition { id: "canada-us-supplier-transfer"; customerRequest: string; facts: CaseFact[]; rails: RailOption[]; }
export interface CaseDefinition { id: CaseId; title: string; customerRequest: string; verifiedAt: string; reviewBy: string; reviewStatus: "current" | "under_review"; facts: CaseFact[]; rails: RailOption[]; transfer: TransferDefinition; }
export interface RecommendationDraft { shortlist: string[]; selectedRail: string | null; reasons: string[]; conditions: string[]; priceExpectation: string; arrivalExpectation: string; trackingExpectation: string; customerExplanation: string; }
export interface CaseOutcome { quality: DecisionQuality; consequence: string; soundReasoning: string[]; reasoningGap: string | null; nextAction: string; invalidRailIds: string[]; missingFactIds: string[]; }
export type EnrichmentState = "idle" | "loading" | "success" | "unavailable" | "error";
export interface CaseEnrichment { state: EnrichmentState; facts: CaseFact[]; message?: string; retry?: () => void; }
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
  caseRevision: string;
  status: "not_started" | "in_progress" | "completed" | "under_review";
  phase: CasePhase;
  requestedFactIds: string[];
  draft: RecommendationDraft;
  firstAttempt: { draft: RecommendationDraft; outcome: CaseOutcome; submittedAt: string } | null;
  revisedAttempt: { draft: RecommendationDraft; outcome: CaseOutcome; submittedAt: string } | null;
  openedReferenceIds: string[];
  updatedAt: string;
}

export type CaseAction =
  | { type: "start" }
  | { type: "request-facts"; ids: string[] }
  | { type: "edit-draft"; patch: Partial<RecommendationDraft> }
  | { type: "send-recommendation"; outcome: CaseOutcome; submittedAt: string }
  | { type: "begin-revision" }
  | { type: "complete-transfer"; outcome: CaseOutcome }
  | { type: "restart" };

export function caseReducer(session: CaseSession, action: CaseAction): CaseSession;

export function loadCaseSession(caseId: CaseId): CaseSession | null;
export function saveCaseSession(session: CaseSession): void;
export function clearCaseDraft(caseId: CaseId): void;
export function updateRequestedFacts(caseId: CaseId, ids: string[]): { firstAffectedControlId: string | null };
```

- [ ] Export generic `loadVersioned<T>(key, fallback)`, `saveVersioned<T>(key, value): { ok: true } | { ok: false; reason: "unavailable" | "quota" }`, and `removeStored(key)` from `storage.ts`; preserve existing non-throwing wrappers for current callers while allowing `caseStore` to surface a recoverable save failure.
- [ ] Test round-trip persistence, corrupt JSON, obsolete schema, absent session, case-revision mismatch, restart clearing only the selected case, preserving the immutable first attempt, and `localStorage.setItem` failure returning a typed result.
- [ ] Test that changing an upstream fact clears shortlist, recommendation, and outcomes while retaining the case shell and returning the first affected control id.
- [ ] Test reducer legal transitions, rejected phase actions, double-submit protection, immutable first attempt, revision isolation, transfer completion, and restart reset.
- [ ] Run `npm test -- --run src/features/learn/cases/caseStore.test.ts src/lib/persistence/persistence.test.ts` and confirm red before implementation.
- [ ] Implement `caseStore.ts` with keys `relay:case-session:<caseId>` by calling the shared storage primitives; compare `caseRevision` before resume and return a recoverable restart state on mismatch; keep case-specific invalidation and first-attempt rules in this module, and never persist loading, open sheets, alerts, or focus.
- [ ] Implement `caseReducer` as a pure transition function; `CaseDesk` dispatches actions, and `caseStore` persists material decision actions immediately. Debounce `customerExplanation` writes by 300ms after the last edit, flush on blur, Exit case, and Start again, and keep the in-memory draft authoritative while a write is pending. Illegal actions return the unchanged session and expose no partial mutation.
- [ ] Run the focused tests and confirm green.
- [ ] Commit: `feat(learn): persist supplier case sessions safely`.

### Task 3: Add the case-first Learn entry and route

**Files:**

- Modify: `frontend/src/features/learn/LearnIndexPage.tsx`
- Modify: `frontend/src/features/learn/LearnPage.css`
- Modify: `frontend/src/app-shell/App.tsx`
- Test: `frontend/src/features/learn/cases/caseRoutes.test.tsx`

- [ ] Test fresh Learn state, Resume after a seeded draft, Completed after a finished session, Under review when `reviewStatus` is `under_review`, and a missing case id.
- [ ] Run the focused test and confirm it fails before implementation.
- [ ] Render one dominant `Start case`/`Resume case` action and keep legacy technical labs below it; for `under_review`, show the last verification date, disable Start/Resume, preserve any existing draft, and offer one verified reference or technical lab. Do not use Passed, Mastered, Certified, score, badge, or credential language.
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
interface CaseDeskProps { caseId: CaseId; enrichment?: CaseEnrichment; }
interface EvidenceRailProps { definition: CaseDefinition; requestedFactIds: string[]; onOpenReference: (factId: string) => void; }
interface ReferenceSheetProps { fact: CaseFact; open: boolean; onClose: () => void; returnFocusRef: import("react").RefObject<HTMLButtonElement | null>; }
```

- [ ] Test the customer request anchor, supplied/gathered/assumption/unknown sections, compact source status, native fact checkboxes, native rail selection, and no preselected recommendation.
- [ ] Test the reference sheet role, labelled heading, Escape close, focus trap, focus restoration, and preserved draft.
- [ ] Test enrichment `loading`, `success`, `unavailable`, and `error` states while authored facts and deterministic evaluation remain usable.
- [ ] Add `StatusChip` regression assertions for `passed`, `needs_attention`, `failed`, and `unavailable`, plus new `invalid`, `possible`, `defensible`, `preferred`, `verified`, and `under_review` statuses with text and icon accessible names.
- [ ] Run focused tests and confirm red before implementation.
- [ ] Implement wide desktop task/evidence split and task-first tablet/mobile layout using existing tokens and primitives; use a labelled Evidence sheet below the split breakpoint.
- [ ] Define the optional injected `CaseEnrichment` adapter at the Case Desk boundary; render it through `AsyncRegion`, keep authored facts/evaluation independent, and never replace unknown data with invented values.
- [ ] Define `StatusChipStatus = CheckStatus | DecisionQuality | SourceStatus` and an exhaustive `Record<StatusChipStatus, ...>`; preserve existing call sites and never rely on color alone.
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
- [ ] Test rapid double-submit, evaluation failure with draft preservation, debounced text persistence and flush-on-exit, storage-write failure with an in-memory draft recovery message, empty optional explanation, maximum-length rejection, visible synthetic-data disclosure, and navigating away before commit.
- [ ] Run focused tests and confirm red before implementation.
- [ ] Implement read-only summary, explicit `Send recommendation`, pending state, deterministic evaluator call, consequence-first feedback, decision-quality chip, one prioritized reasoning gap, revision, and close transfer. Limit `customerExplanation` to 1,000 characters, show remaining-character feedback and “Use synthetic details only,” validate before save, and surface a recoverable save-failure message without losing the in-memory draft.
- [ ] Mark the session `completed` only when the experience is finished, not when quality is `preferred`.
- [ ] Run focused tests and `npm run build`; confirm green.
- [ ] Commit: `feat(learn): add supplier recommendation and debrief flow`.

### Task 6: Verify the complete vertical slice

**Files:**

- Create: `frontend/e2e/case-desk.spec.ts`
- Create: `frontend/src/features/learn/cases/accessibility.test.tsx`
- Modify: `frontend/playwright.config.ts` — add explicit 390×844, 768×844, 1024×900, and 1440×900 projects for the case journey.

- [ ] Add an E2E journey covering Start case → request facts → shortlist → recommendation summary → Send recommendation → consequence → revision → debrief.
- [ ] Add refresh/resume, restart confirmation, corrupt draft, unavailable enrichment, and stale claim recovery tests; assert an under-review case cannot start or resume while its draft remains stored.
- [ ] Add named Playwright projects `case-mobile-390`, `case-tablet-768`, `case-desktop-1024`, and `case-wide-1440` with viewports 390×844, 768×844, 1024×900, and 1440×900; run the journey in each and assert no horizontal scroll, 44px targets, keyboard traversal, focus restoration, labelled sheet, Escape close, live announcements, and reduced motion.
- [ ] Run axe checks on brief, investigate, recommend, outcome, reference sheet, and debrief states.
- [ ] Run `npm test`, `npm run build`, `npm run test:e2e`, `npm run check:bundle`, and `python -m pytest tests/ -q`; all must pass.
- [ ] Commit: `test(learn): verify supplier case vertical slice`.

## Test coverage map

```text
CODE PATHS                                              USER FLOWS
route /learn/cases/:caseId                              Learn → Start case
  ├─ missing case id → not-found                       ├─ [★★★] start → investigate → recommend → debrief [→E2E]
  ├─ current case → load session/catalog                ├─ [★★★] refresh/tab close → Resume [→E2E]
  ├─ under_review → disabled entry                      ├─ [★★★] stale claim → Under review [→E2E]
  └─ revision mismatch → restart recovery               └─ [★★★] restart confirmation preserves history [→E2E]

caseReducer(session, action)                             CaseDesk interactions
  ├─ legal phase action → next session                  ├─ [★★★] request facts and observe live evidence [→E2E]
  ├─ illegal action → unchanged session                 ├─ [★★★] select/remove rails with keyboard [→E2E]
  ├─ send → immutable first attempt                      ├─ [★★★] double-submit and evaluation failure [→E2E]
  ├─ revise → mutable second attempt                     ├─ [★★★] reference sheet Escape/focus restore [→E2E]
  ├─ transfer → independent result                       └─ [★★★] 390/768/1024/1440 layout matrix [→E2E]
  └─ restart → clean draft

storage primitives                                      evaluator(definition, draft)
  ├─ valid JSON/schema → session                         ├─ empty/missing facts → validation result
  ├─ corrupt/obsolete → recovery                         ├─ ineligible → invalid
  ├─ revision mismatch → recovery                        ├─ incomplete → possible
  ├─ setItem failure → typed save error                  ├─ fact-supported → defensible
  └─ remove → selected case only                         └─ best fit/multiple valid → preferred/alternatives [→EVAL]

enrichment adapter                                      evidence/reference UI
  ├─ idle/loading → AsyncRegion                          ├─ supplied/gathered/assumption/unknown groups
  ├─ success → merge requestable facts                   ├─ verified/under_review source statuses
  ├─ unavailable/error → authored fallback               └─ labelled sheet, trap, Escape, focus restore
  └─ retry → same boundary
```

Legend: ★★★ = behavior + edge + error coverage; `[→E2E]` = browser journey; `[→EVAL]` = deterministic evaluation suite.

## Phase 2 — Deferred follow-up

Implement only after Phase 1 observed research establishes that the Case Desk resembles real work:

- Add the Canadian collection/receipt case.
- Add optional consent, event export, withdrawal, and deletion UI.
- Add facilitator, observation, interview, and consent materials.
- Add delayed retention case and unguided Round 2 validation.
- Extract shared case units only from repeated behavior across both cases.
- Revisit accounts, sync, dashboards, badges, missing tracks, and additional rails only when demand evidence supports them.

## NOT in scope

- Canadian collection/receipt case — deferred until the first vertical slice establishes that the Case Desk resembles real work.
- Research consent, export, withdrawal, and deletion UI — deferred until telemetry is needed for observed research.
- Facilitator and cohort materials — deferred until the slice has stable interaction and observation patterns.
- Generic case-package engine — deferred until repeated structure exists across at least two cases.
- Accounts, cross-device sync, badges, dashboards, and new curriculum tracks — require separate demand evidence and product decisions.

## What already exists

- `frontend/src/app-shell/AppShell.tsx` — existing four-workspace shell, desktop rail, mobile navigation, and simulation banner; the plan adds only the case route.
- `frontend/src/features/learn/LearnIndexPage.tsx` and `LearnPage.css` — existing Learn entry and module styling; the plan reorders the entry and keeps technical labs intact.
- `frontend/src/design-system/Button.tsx` — existing semantic action primitive reused for start, send, retry, exit, restart, and revision.
- `frontend/src/design-system/AsyncRegion.tsx` — existing loading/error/unavailable/partial rendering reused behind the enrichment adapter.
- `frontend/src/design-system/StatusChip.tsx` — existing text/icon/status treatment extended exhaustively rather than replaced.
- `frontend/src/design-system/payment-route/PaymentRoute.tsx` — existing route visualization used only when it clarifies the selected cross-border path.
- `frontend/src/lib/persistence/storage.ts` — existing versioned localStorage boundary reused through exported generic helpers; case-specific invariants remain in `caseStore.ts`.
- `frontend/vite.config.ts`, Vitest setup, and `frontend/playwright.config.ts` — existing test/build infrastructure extended with the explicit case viewport projects.
- `DESIGN.md` and the approved Customer Case Desk design spec — canonical visual, interaction, responsive, accessibility, source-governance, and assessment constraints.

## Failure modes

| Code path | Realistic failure | Test | Error handling | User sees |
|---|---|---|---|---|
| Case catalog load | Missing case id or malformed fixture | Case route/catalog tests | Not-found state; catalog tests fail fast | Clear missing-case message and Learn link |
| Case revision resume | Authored facts change while draft exists | Case-store revision-mismatch test and E2E | Draft marked unrecoverable; first attempt preserved | Restart explanation and safe action |
| Storage write | Quota/private-mode/denied `setItem` | Typed save-result test and recommendation flow | In-memory draft remains authoritative; retry/recovery message | Draft is not lost; persistence status is explicit |
| Reducer transition | Double-submit or illegal phase action | Reducer transition tests and E2E | Unchanged session; pending action disabled | No duplicate attempt; current step remains visible |
| Enrichment adapter | Timeout, 5xx, or unavailable demo API | Adapter state tests and E2E | `AsyncRegion` error/unavailable state; authored facts continue | Clear unavailable notice and usable case |
| Source expiry | Claim passes review-by date | Under-review catalog/route test and E2E | Start/Resume disabled; draft retained | Verification date, reason, and safe reference |
| Reference sheet | Focus trap or close handler fails | ReferenceSheet accessibility tests and axe | Explicit close control remains available | Focus returns to the opening control |
| Layout | Tablet split becomes unreadable or overflows | Four viewport Playwright projects | Collapsed task-first layout | No horizontal scrolling or clipped controls |

No critical silent failure remains in the Phase 1 plan: each listed failure has a test, an explicit recovery path, and visible user feedback.

## Parallelization strategy

Sequential implementation, no parallelization opportunity. Tasks 1–6 share `frontend/src/features/learn/cases/`, the reducer/session contract, and the same route; splitting them into worktrees would create merge conflicts and duplicate contract decisions. Launch each task only after the previous task's focused tests pass.

## Implementation Tasks

Synthesized from this engineering review. These are additions to the Phase 1 build tasks and should be checked off as they land.

- [ ] **E1 (P1, human: ~2h / CC: ~15min)** — Case lifecycle — add `under_review` state and case verification metadata. Surfaced by Architecture A1. Files: `caseTypes.ts`, `caseCatalog.ts`, `LearnIndexPage.tsx`, route tests. Verify Start/Resume disabled while a draft remains stored.
- [ ] **E2 (P1, human: ~2h / CC: ~15min)** — Persistence boundary — export shared versioned storage primitives and keep case invariants in `caseStore.ts`. Surfaced by Architecture A2. Files: `storage.ts`, `persistence.test.ts`, `caseStore.ts`. Verify current callers remain non-throwing and case storage uses one corruption policy.
- [ ] **E3 (P1, human: ~1d / CC: ~30min)** — Enrichment boundary — inject typed `CaseEnrichment` state into `CaseDesk` and preserve authored-fact fallback. Surfaced by Architecture A3. Files: `caseTypes.ts`, `CaseDesk.tsx`, `EvidenceRail.tsx`, adapter tests. Verify loading, success, unavailable, error, and retry states.
- [ ] **E4 (P2, human: ~1h / CC: ~10min)** — Transfer model — use a non-routable `TransferDefinition` instead of recursive `CaseDefinition`. Surfaced by Architecture A4. Files: `caseTypes.ts`, `caseCatalog.ts`, evaluator tests. Verify transfer cannot recurse or collide with Learn routing.
- [ ] **E5 (P1, human: ~3h / CC: ~20min)** — Reducer boundary — implement `CaseAction` and pure `caseReducer` with legal-transition tests. Surfaced by Code Quality Q1. Files: `caseStore.ts`, `caseStore.test.ts`, `CaseDesk.tsx`. Verify illegal actions are no-ops and first attempts remain immutable.
- [ ] **E6 (P1, human: ~1h / CC: ~10min)** — Draft validity — add `caseRevision` and mismatch recovery. Surfaced by Code Quality Q2. Files: `caseTypes.ts`, `caseStore.ts`, route/recovery tests. Verify changed case content cannot silently resume an old draft.
- [ ] **E7 (P2, human: ~2h / CC: ~15min)** — Status compatibility — add exhaustive `StatusChipStatus` metadata with old-status regression coverage. Surfaced by Code Quality Q3. Files: `StatusChip.tsx`, `types.ts`, design-system tests. Verify existing payment screens remain unchanged.
- [ ] **E8 (P2, human: ~1h / CC: ~10min)** — Free-text boundary — enforce 1,000 characters, synthetic-data copy, remaining count, and save-failure recovery. Surfaced by Code Quality Q4. Files: `RecommendationSummary.tsx`, `RecommendationFlow.test.tsx`. Verify over-limit input cannot be persisted.
- [ ] **E9 (P1, human: ~2h / CC: ~15min)** — Viewport matrix — add named 390, 768, 1024, and 1440 Playwright projects. Surfaced by Test T1. Files: `playwright.config.ts`, `case-desk.spec.ts`. Verify the same critical journey at all four sizes.
- [ ] **E10 (P1, human: ~2h / CC: ~15min)** — Observable persistence failures — return typed save results and test quota/denied writes. Surfaced by Test T2. Files: `storage.ts`, `caseStore.ts`, persistence/recommendation tests. Verify in-memory recovery and visible retry copy.
- [ ] **E11 (P1, human: ~1h / CC: ~10min)** — Responsive draft writes — debounce text persistence by 300ms and flush on blur/exit/restart. Surfaced by Performance P1. Files: `CaseDesk.tsx`, `caseStore.ts`, recommendation tests. Verify no per-keystroke writes and no text loss on exit.

## Review findings summary

- Architecture: 4 findings, all accepted and folded into the plan.
- Code Quality: 4 findings, all accepted and folded into the plan.
- Tests: 2 findings, both accepted and folded into the plan; coverage diagram and QA artifact added.
- Performance: 1 finding, accepted and folded into the plan.
- Outside voice: skipped because no independent review endpoint is available in this session.

## Engineering review handoff

Review this Phase 1 plan against the approved design spec before implementation. Validate route precedence, session invalidation, evaluator/UI boundaries, source expiry behavior, focus management, and whether the vertical slice is genuinely sufficient to test learner pull.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run; prior product strategy review established validation-first direction |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 11 findings; 0 critical gaps; scope reduced to one vertical slice |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | Score: 6/10 → 10/10; 17 decisions; 0 unresolved |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run |

**VERDICT:** ENG + DESIGN CLEARED — Phase 1 is ready for implementation; Phase 2 remains evidence-gated.

NO UNRESOLVED DECISIONS
