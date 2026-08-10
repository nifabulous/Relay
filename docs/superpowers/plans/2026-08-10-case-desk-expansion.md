# Case Desk Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three catalog-driven Customer Case Desks while preserving the existing Canada → US workflow and making grading corridor-agnostic.

**Architecture:** Keep one shared Case Desk UI and persistence state machine. Move case lookup into `caseCatalog.ts`, add serializable case recommendation metadata and eligibility rules, and have the evaluator consume those authored rules instead of reading corridor words from prose.

**Tech Stack:** React, TypeScript, React Router, Vitest, Testing Library, Vite, localStorage persistence.

## Global Constraints

- All new case organizations, amounts, accounts, and routes are fictional educational simulation data.
- Existing `canada-us-supplier` behavior and persisted sessions remain readable.
- Requestable facts remain `state: "unknown"` until the learner requests them.
- No live payment execution, bank integrations, or external enrichment is added.
- Each case owns its content revision; changing one case must not invalidate another case's draft.
- Use the existing Case Desk flow and design system; do not duplicate the UI per scenario.

---

### Task 1: Generalize case types and create the shared registry

**Files:**
- Modify: `frontend/src/features/learn/cases/caseTypes.ts`
- Modify: `frontend/src/features/learn/cases/caseCatalog.ts`
- Test: `frontend/src/features/learn/cases/caseCatalog.test.ts`

**Interfaces:**
- Produce `CaseRecommendationProfile`, `RailEligibilityRule`, and `CaseDefinition.contentRevision`.
- Produce `CASE_CATALOG: readonly CaseDefinition[]` and `getCaseById(caseId: string): CaseDefinition | undefined`.
- Preserve named export `supplierCase` and compatibility export `CASE_REVISION` for existing tests.

- [ ] **Step 1: Write failing registry and schema tests**

Add tests that assert:

```ts
expect(CASE_CATALOG.map((c) => c.id)).toEqual([
  "canada-us-supplier",
  "uk-eurozone-supplier",
  "nigeria-uk-contractor",
  "us-mexico-vendor",
]);
expect(getCaseById("us-mexico-vendor")?.title).toContain("Mexico");
expect(getCaseById("missing-case")).toBeUndefined();
expect(new Set(CASE_CATALOG.map((c) => c.id)).size).toBe(CASE_CATALOG.length);
for (const definition of CASE_CATALOG) {
  expect(definition.contentRevision.length).toBeGreaterThan(0);
  expect(definition.recommendation.preferredRailId).toBe(
    expect.stringMatching(/.+/),
  );
  expect(definition.rails.map((rail) => rail.id)).toContain(
    definition.recommendation.preferredRailId,
  );
}
```

Run: `cd frontend && npm test -- --run src/features/learn/cases/caseCatalog.test.ts`

Expected: FAIL because the new registry exports, fields, and cases do not exist.

- [ ] **Step 2: Add the serializable case rule types**

Add these exact types to `caseTypes.ts`:

```ts
export interface CaseRecommendationProfile {
  preferredRailId: string;
  priorityFactIds: {
    urgency?: string;
    tracking?: string;
    cost?: string;
  };
  corridorLabel: string;
  paymentLabel: string;
}

export interface RailEligibilityRule {
  factId: string;
  operator: "equals" | "includes";
  value: string;
  outcome: "eligible" | "ineligible";
}
```

Change `CaseId` to `string`, `TransferDefinition.id` to `string`, add
`CaseDefinition.summary`, `CaseDefinition.contentRevision`, and
`CaseDefinition.recommendation`, and add optional `eligibilityRules` and
`fitTags` to `RailOption`.

- [ ] **Step 3: Add the three authored cases**

Keep `supplierCase` unchanged except for the new metadata fields. Add these
simulation-only definitions to `caseCatalog.ts`:

| ID | Summary | Preferred rail |
| --- | --- | --- |
| `uk-eurozone-supplier` | UK buyer paying a German supplier in EUR | `sepa-instant` |
| `nigeria-uk-contractor` | Nigerian company paying a UK contractor in GBP | `swift-gbp` |
| `us-mexico-vendor` | US buyer paying an urgent Mexico vendor in USD | `swift-usd-mexico` |

Each case must have destination, currency, amount, urgency, beneficiary-bank,
and two or three requestable facts. Every rail ID must be unique within its
case, required fact IDs must exist in that case, and each case must include
three rails with `fitTags` and at least one `workedExplanation` on the
preferred rail. Use `scope: "simulation-only"` for new source claims.

- [ ] **Step 4: Export the registry and run catalog tests**

Export the ordered registry and lookup:

```ts
export const CASE_CATALOG: readonly CaseDefinition[] = [
  supplierCase,
  ukEurozoneSupplierCase,
  nigeriaUkContractorCase,
  usMexicoVendorCase,
];

export function getCaseById(caseId: string): CaseDefinition | undefined {
  return CASE_CATALOG.find((definition) => definition.id === caseId);
}

export const CASE_REVISION = supplierCase.contentRevision;
```

Run the catalog test again. Expected: PASS.

### Task 2: Make persistence revision-aware per case

**Files:**
- Modify: `frontend/src/features/learn/cases/caseStore.ts`
- Test: `frontend/src/features/learn/cases/caseStore.test.ts`

**Interfaces:**
- Consume `getCaseById` and `CaseDefinition.contentRevision`.
- Produce `getCaseRevision(caseId: CaseId): string` with a safe fallback to the legacy `CASE_REVISION` for existing callers.

- [ ] **Step 1: Write failing per-case revision tests**

Add tests that save valid sessions for two different case IDs, change one
case's revision fixture, and assert only that case recovers as `under_review`.
Also assert `createInitialCaseSession("us-mexico-vendor").caseRevision` equals
that definition's revision.

Run: `cd frontend && npm test -- --run src/features/learn/cases/caseStore.test.ts`

Expected: FAIL because the store currently imports one global revision.

- [ ] **Step 2: Implement the revision lookup**

Replace direct `CASE_REVISION` reads in initialization, load, recovery, and
restart paths with:

```ts
function getCaseRevision(caseId: CaseId): string {
  return getCaseById(caseId)?.contentRevision ?? CASE_REVISION;
}
```

Keep the legacy export and existing Canada tests passing.

- [ ] **Step 3: Run persistence tests**

Run the focused store tests. Expected: PASS, including stale-draft recovery,
first-attempt preservation, and legacy Canada payload normalization.

### Task 3: Refactor evaluator logic to authored rules

**Files:**
- Modify: `frontend/src/features/learn/cases/caseEvaluator.ts`
- Test: `frontend/src/features/learn/cases/caseEvaluator.test.ts`
- Test: `frontend/src/features/learn/cases/caseCatalog.test.ts`

**Interfaces:**
- Consume `definition.recommendation`, `rail.eligibilityRules`, and `rail.fitTags`.
- Preserve exported `disclosedPriorities`, `bestFitRailId`, `validateShortlist`, and `evaluateRecommendation` signatures.

- [ ] **Step 1: Write failing cross-corridor evaluator tests**

For each new case, gather all requestable facts and evaluate a complete draft
using the authored preferred rail. Assert `quality === "preferred"`. Assert a
non-preferred eligible rail returns `"defensible"`, and an explicitly
ineligible rail returns `"invalid"` with that rail ID in `invalidRailIds`.

Also assert no outcome contains the hardcoded phrase `USD payment to the
United States` when evaluating the UK, Nigeria, or Mexico cases.

Run: `cd frontend && npm test -- --run src/features/learn/cases/caseEvaluator.test.ts src/features/learn/cases/caseCatalog.test.ts`

Expected: FAIL because evaluator priority and eligibility are still derived
from Canada/US text.

- [ ] **Step 2: Implement authored eligibility and priorities**

Replace `destinationIsUnitedStates`, `destinationIsUsd`, and the domestic/currency
regex checks with a rule evaluator:

```ts
function ruleMatches(definition: CaseDefinition, rule: RailEligibilityRule): boolean {
  const actual = factValueLower(definition, rule.factId);
  const expected = rule.value.toLowerCase();
  return rule.operator === "equals"
    ? actual === expected
    : actual.includes(expected);
}
```

Treat any matching `outcome: "ineligible"` rule as invalid and any matching
`outcome: "eligible"` rule as an explicit eligibility requirement. Replace
keyword matching in `railSatisfies` with `rail.fitTags?.includes(priority)`.
Use `definition.recommendation.preferredRailId` as the best-fit candidate only
when the corresponding priority facts are gathered.

Build consequence, gap, and next-action prose from
`definition.recommendation.corridorLabel` and `paymentLabel`.

- [ ] **Step 3: Run all evaluator and existing Canada tests**

Run the focused tests again. Expected: PASS for all four cases and all existing
Canada-specific assertions.

### Task 4: Wire the registry into routing and the Learn index

**Files:**
- Modify: `frontend/src/features/learn/cases/CaseDeskRoute.tsx`
- Modify: `frontend/src/features/learn/cases/CaseDesk.tsx`
- Modify: `frontend/src/features/learn/LearnIndexPage.tsx`
- Modify: `frontend/src/features/learn/cases/CaseEntry.tsx`
- Modify: `frontend/src/features/learn/cases/caseRoutes.test.tsx`
- Modify: `frontend/src/features/learn/cases/accessibility.test.tsx`

**Interfaces:**
- Consume `CASE_CATALOG`, `getCaseById`, and each definition's `summary`.
- Preserve `/learn/cases/canada-us-supplier` and unknown-case behavior.

- [ ] **Step 1: Write failing multi-case route/index tests**

Assert the Learn index renders four case cards, each Start link has the matching
`/learn/cases/:caseId` path, each card has a unique heading ID, and a stored
Mexico session does not change the Canada card state.

Run: `cd frontend && npm test -- --run src/features/learn/cases/caseRoutes.test.tsx src/features/learn/cases/accessibility.test.tsx`

Expected: FAIL because the index and route currently know only one case.

- [ ] **Step 2: Replace local one-case arrays with catalog lookup**

Import `CASE_CATALOG` in `LearnIndexPage`, load sessions with
`CASE_CATALOG.map((definition) => ({ definition, session: loadCaseSession(definition.id) }))`,
and render one `CaseEntry` per item. Import `getCaseById` in the route and
Case Desk instead of maintaining `KNOWN_CASES` arrays.

- [ ] **Step 3: Make card copy and accessibility case-specific**

Use:

```tsx
const titleId = `case-entry__title-${caseDef.id}`;
<section aria-labelledby={titleId}>
  <h2 id={titleId}>{caseDef.title}</h2>
  <p>{caseDef.summary}</p>
</section>
```

Keep the current state labels and actions unchanged.

- [ ] **Step 4: Run route/accessibility tests**

Expected: PASS, including direct route rendering for all three new IDs and the
not-found state for an unknown ID.

### Task 5: Full verification and browser smoke test

**Files:**
- No source changes expected; adjust only failing tests discovered in Tasks 1–4.

- [ ] **Step 1: Run the complete frontend test suite**

Run: `cd frontend && npm test -- --run`

Expected: all tests PASS.

- [ ] **Step 2: Build the production bundle**

Run: `cd frontend && npm run build`

Expected: TypeScript and Vite build PASS.

- [ ] **Step 3: Smoke test the live app**

Open `/app/learn`, then each case route. Confirm each brief shows the right
customer request, the investigation facts are requestable, the preferred rail
can reach the recommendation outcome, and mobile cards stack without duplicate
heading announcements. Confirm the browser console has no new errors.
