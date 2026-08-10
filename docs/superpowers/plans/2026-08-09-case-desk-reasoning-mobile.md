# Case Desk Reasoning and Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the Canada → US case desk to three reasoning prompts and place the customer request before task controls on mobile without losing saved progress or assessment behavior.

**Architecture:** Add `customerExpectation` to the recommendation draft as the new consolidated learner-facing signal, while keeping legacy fields readable during session hydration and old-attempt display. Update the pure evaluator and recommendation summary to consume one expectation. Split the EvidenceRail presentation into a reusable customer-request anchor and the remaining evidence ledger so desktop layout stays unchanged and mobile can place only the anchor first.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS custom properties, existing localStorage case store.

## Global Constraints

- The reasoning section has exactly three learner prompts: “Why this rail?”, “Key risk or trade-off?”, and “What should the customer expect?”.
- New drafts store `customerExpectation`; the type remains optional at the hydration boundary so legacy payloads without it remain readable. Legacy price/arrival/tracking/customer-explanation fields remain readable.
- On mobile, the customer-request anchor appears before task controls; the remaining evidence ledger stays after the task.
- Desktop keeps task left and evidence right.
- The expectation textarea keeps the existing 1,000-character limit and live counter.
- Do not discard persisted learner progress or completed attempts.
- Do not add dependencies or commit changes.

---

### Task 1: Add the consolidated draft signal and compatibility fallback

**Files:**
- Modify: `frontend/src/features/learn/cases/caseTypes.ts`
- Modify: `frontend/src/features/learn/cases/caseStore.ts`
- Modify: `frontend/src/features/learn/cases/caseEvaluator.ts`
- Test: `frontend/src/features/learn/cases/caseStore.test.ts`
- Test: `frontend/src/features/learn/cases/caseEvaluator.test.ts`

**Interfaces:**
- `RecommendationDraft.customerExpectation?: string` is optional for legacy hydration, but the new UI always writes the string field.
- `caseStore` hydration accepts old drafts without `customerExpectation` and derives it from non-empty legacy `customerExplanation`, `priceExpectation`, `arrivalExpectation`, and `trackingExpectation` values.
- `evaluateRecommendation` scores a non-empty `customerExpectation` as the single expectation signal.

- [x] **Step 1: Write failing compatibility tests**

Add a case-store test that loads a serialized legacy draft with price/arrival/tracking/customerExplanation values and expects the hydrated draft to expose a combined `customerExpectation` without dropping the original values used by old attempts.

```ts
it("derives a consolidated expectation when loading a legacy draft", () => {
  const initial = createInitialCaseSession(CASE_ID);
  const legacy = {
    ...initial,
    draft: {
      ...initial.draft,
      priceExpectation: "Fee is acceptable for the deadline.",
      arrivalExpectation: "Funds arrive within two business days.",
      trackingExpectation: "The sender receives tracking confirmation.",
      customerExplanation: "Explain the timing and confirmation to the customer.",
    },
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
  const loaded = loadCaseSession(CASE_ID);

  expect(loaded.draft.customerExpectation).toContain("Fee is acceptable");
  expect(loaded.draft.customerExpectation).toContain("Funds arrive");
  expect(loaded.draft.customerExpectation).toContain("tracking confirmation");
});
```

- [x] **Step 2: Write the failing evaluator test**

Add a test with an eligible, fully investigated rail, a substantive primary reason, and only `customerExpectation` populated. Expect the outcome to be at least `defensible` and expect `soundReasoning` to contain the consolidated expectation message.

```ts
it("uses one customer expectation instead of three separate expectation fields", () => {
  const draft = completeDraftFor("swift-fedwire", {
    reasons: ["Fast same-day USD value protects the shipment deadline."],
    customerExpectation: "The customer should expect a justified fee, same-day value, and tracking confirmation.",
    priceExpectation: "",
    arrivalExpectation: "",
    trackingExpectation: "",
  });

  const outcome = evaluateRecommendation(definition, draft, ALL_REQUESTABLE_FACT_IDS);

  expect(["defensible", "preferred"]).toContain(outcome.quality);
  expect(outcome.soundReasoning).toContain("Articulated a customer expectation.");
});
```

- [x] **Step 3: Run the focused tests and verify the new contract fails**

Run: `cd frontend && npm test -- --run src/features/learn/cases/caseStore.test.ts src/features/learn/cases/caseEvaluator.test.ts`

Expected: the new assertions fail because `customerExpectation` does not exist and evaluator scoring still requires three legacy fields.

- [x] **Step 4: Implement the minimal draft and evaluator changes**

Add the field to `RecommendationDraft` and initial drafts. Normalize legacy sessions at the existing store boundary. In the evaluator replace the three-field `expectationsCovered` object and count with `isNonEmpty(draft.customerExpectation)`, and update the reasoning gap, next action, and sound-reasoning text to refer to one customer expectation.

- [x] **Step 5: Run focused tests and verify they pass**

Run the same focused command. Expected: all case-store and evaluator tests pass, including existing legacy behavior tests.

### Task 2: Reduce the Case Desk form and recommendation summary to three prompts

**Files:**
- Modify: `frontend/src/features/learn/cases/CaseDesk.tsx`
- Modify: `frontend/src/features/learn/cases/RecommendationSummary.tsx`
- Modify: `frontend/src/features/learn/cases/CaseDesk.css`
- Test: `frontend/src/features/learn/cases/CaseDesk.test.tsx`
- Test: `frontend/src/features/learn/cases/RecommendationFlow.test.tsx`

**Interfaces:**
- CaseDesk edits `reasons[0]`, `conditions[0]`, and `customerExpectation`.
- RecommendationSummary displays one `Customer expectation` row and no separate legacy expectation rows for new drafts.

- [x] **Step 1: Write failing UI tests for the reduced prompt set**

Add an integration assertion that a recommend-phase case exposes exactly these labelled controls and does not expose the legacy price, arrival, tracking, or explanation labels.

```ts
expect(screen.getByRole("textbox", { name: /primary reason|why this rail/i })).toBeVisible();
expect(screen.getByRole("textbox", { name: /key risk or trade-off/i })).toBeVisible();
expect(screen.getByRole("textbox", { name: /what should the customer expect/i })).toBeVisible();
expect(screen.queryByRole("textbox", { name: /price expectation/i })).not.toBeInTheDocument();
expect(screen.queryByRole("textbox", { name: /arrival expectation/i })).not.toBeInTheDocument();
expect(screen.queryByRole("textbox", { name: /tracking expectation/i })).not.toBeInTheDocument();
expect(screen.queryByRole("textbox", { name: /explanation for the customer/i })).not.toBeInTheDocument();
```

- [x] **Step 2: Run the UI tests and verify they fail**

Run: `cd frontend && npm test -- --run src/features/learn/cases/CaseDesk.test.tsx src/features/learn/cases/RecommendationFlow.test.tsx`

Expected: the new selectors fail because the current form still renders six fields.

- [x] **Step 3: Implement the three controlled inputs**

Keep the primary reason input, relabel the conditions input to “Key risk or trade-off?”, and replace the three expectation inputs plus explanation textarea with one `customerExpectation` textarea. Preserve `CUSTOMER_EXPLANATION_MAX` as its `maxLength`, counter, blur persistence, and synthetic-data helper. Update comments so the single expectation is the canonical new field.

- [x] **Step 4: Update the pre-send summary**

Replace the price, arrival, tracking, and customer explanation rows with one `Customer expectation` row. Read `draft.customerExpectation` first and use the legacy fallback helper only when the consolidated field is empty.

- [x] **Step 5: Update flow tests and run the focused suite**

Change preferred-tier setup to fill `customerExpectation` once. Assert the saved first attempt contains it and the outcome reaches the expected tier. Run the focused command from Step 2 and expect all tests to pass.

### Task 3: Split the customer request anchor from the evidence ledger and fix mobile order

**Files:**
- Modify: `frontend/src/features/learn/cases/EvidenceRail.tsx`
- Modify: `frontend/src/features/learn/cases/EvidenceRail.css`
- Modify: `frontend/src/features/learn/cases/CaseDesk.tsx`
- Modify: `frontend/src/features/learn/cases/CaseDesk.css`
- Test: `frontend/src/features/learn/cases/CaseDesk.test.tsx`

**Interfaces:**
- `CustomerRequestAnchor` accepts `{ request: string }` and renders the existing labelled customer-request region.
- `EvidenceRail` accepts a `showCustomerRequest` flag or renders only the remaining evidence sections when used below the task.

- [x] **Step 1: Write a failing DOM-order test**

Render the started case and inspect the `.case-desk__investigate` descendants. Assert the customer request anchor is a direct mobile-first element before `.case-desk__split`, while the evidence ledger remains in the split’s evidence column.

```ts
const investigate = document.querySelector(".case-desk__investigate")!;
const request = within(investigate).getByRole("region", { name: /customer request/i });
const split = investigate.querySelector(".case-desk__split")!;
expect(investigate.compareDocumentPosition(request)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
expect(request.compareDocumentPosition(split)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `cd frontend && npm test -- --run src/features/learn/cases/CaseDesk.test.tsx`

Expected: the request is currently nested inside the split evidence column, so the order assertion fails.

- [x] **Step 3: Extract and place the request anchor**

Move the customer-request section into a small presentational export in `EvidenceRail.tsx` or a colocated component. Render it directly under the investigate header and remove it from the ledger instance. Keep the full evidence sections in the evidence column with the consolidated references action.

- [x] **Step 4: Style desktop and mobile layouts**

Keep the desktop split grid unchanged. At mobile widths, give the request anchor normal flow precedence and add spacing so it reads as the case brief before FactRequest. Do not move the full evidence ledger ahead of the task.

- [x] **Step 5: Run focused tests and verify they pass**

Run the CaseDesk test file again. Expected: all existing customer-request, evidence, and accessibility tests pass.

### Task 4: Full regression and live verification

**Files:**
- Modify: none.

- [x] **Step 1: Run the full frontend test suite**

Run: `cd frontend && npm test -- --no-file-parallelism`

Expected: all frontend test files and tests pass.

- [x] **Step 2: Run the production build**

Run: `cd frontend && npm run build`

Expected: TypeScript and Vite build complete successfully.

- [x] **Step 3: Verify the live case route**

Open `http://localhost:5173/app/learn/cases/canada-us-supplier`. Confirm the form shows three prompts, the recommendation summary has one customer-expectation row, and the mobile viewport shows the customer request before the task controls while the evidence ledger remains available below.

- [x] **Step 4: Check the final diff**

Run: `git diff --check && git diff --stat -- frontend/src/features/learn/cases frontend/src/features/learn/cases/caseTypes.ts`

Expected: no whitespace errors and only the approved case-desk reasoning, draft compatibility, evaluator, summary, mobile layout, tests, and documentation changes are present.
