# Relay Learn Content Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder React module body for Labs 1–7 and the capstone with behaviorally equivalent, accessible interactive content migrated from the legacy Learn application.

**Architecture:** Keep `LearnModulePage` responsible for routing, prerequisite gates, headers, progress, and previous/next navigation. A typed `labRegistry` selects a focused content component; shared exercise primitives own accessible interaction state, while each lab owns only its domain copy, API calls, visualizations, and completion checkpoints. Complete one lab as a tested vertical slice before starting the next.

**Tech Stack:** React 19.2.7, TypeScript 7.0.2, React Router 7.18.1, TanStack Query 5.101.2, Zod 4.4.3, Vitest 4.1.10, React Testing Library 16.3.2, MSW 2.15.0, Playwright 1.61.1, existing FastAPI `/api` endpoints.

## Global Constraints

- Preserve `curriculum.ts`, `LearnIndexPage.tsx`, prerequisite rules, existing progress key, module routes, and previous/next navigation unless a task explicitly names a change.
- `LearnModulePage` must not contain a lab ID switch or lab-specific markup; use `labRegistry.ts`.
- Feature components call `apiRequest` or `apiPost` with schemas from `frontend/src/api/schemas.ts`; no direct `fetch`.
- Every API interaction defines idle, loading, success, empty, validation failure, network/server error, retry, and stale-input behavior.
- A lab becomes complete only after its defined completion checkpoints are satisfied; merely opening a module must never mark it complete.
- Completion must be idempotent: repeated successful interactions cannot duplicate a module ID in persisted progress.
- Use existing `Button`, `StatusChip`, `AsyncRegion`, `PaymentRoute`, design tokens, and typography. Do not recreate them inside Learn.
- All form fields have persistent visible labels. Feedback uses `role="status"` for neutral/success and `role="alert"` for errors. Focus moves to the feedback summary after async submission.
- Primary mobile controls are at least 44×44px; layouts must work at 390×844 and 1440×900 without horizontal scrolling.
- Preserve the strongest legacy qualities: narrow reading measure, concept-to-example-to-exercise pacing, inline payment diagrams, specific feedback, and explicit prior/next navigation.
- Do not port unsafe wording that implies seeded settlement accounts are real. Use: **Account numbers are illustrative placeholders. Never initiate a real payment with this data.**
- Do not add the deferred tool modules (fees, FX, sanctions, settlement cycles, MT103, cases, glossary, progress) to this plan; they require a separate parity plan because they are independent curriculum surfaces.

---

## File Map and Responsibilities

```text
frontend/src/features/learn/
  labTypes.ts                         shared Learn-only contracts
  labRegistry.ts                      module ID → content component + checkpoints
  useLabCompletion.ts                 idempotent checkpoint aggregation
  components/
    Exercise.tsx                      async text-answer exercise state machine
    MultipleChoice.tsx                single-answer quiz state machine
    Decompose.tsx                     semantic BIC/IBAN segment display
    ScoreBar.tsx                      accessible 0–1 match score meter
    StepIndicator.tsx                 capstone step navigation/status
    LabComponents.css                 shared Learn interaction styling
  labs/
    Lab1Content.tsx                   BIC/IBAN identity and decomposition
    Lab2Content.tsx                   MOD-97 checksum behavior
    Lab3Content.tsx                   Verification of Payee outcomes
    Lab4Content.tsx                   correspondent route exploration
    Lab5Content.tsx                   SSI and charge-code interpretation
    Lab6Content.tsx                   simulated payment creation/tracking
    Lab7Content.tsx                   payment-scheme comparison and scenarios
    CapstoneContent.tsx               full six-step payment simulation
    LabContent.css                    shared content composition only
  LearnModulePage.tsx                 shell + registry render + persisted completion
frontend/src/features/operate/tracking/
  PaymentTimeline.tsx                 extracted reusable tracking presentation
frontend/src/api/schemas.ts            missing scheme/create-payment schemas
frontend/src/test/handlers.ts          deterministic lab API fixtures
frontend/e2e/learn-content.spec.ts     full curriculum parity journeys
```

## Shared Interfaces

Create these in `frontend/src/features/learn/labTypes.ts` before any lab component:

```ts
import type { ComponentType } from "react";

export type LabCheckpointId = string;

export interface LabContentProps {
  moduleId: string;
  isComplete: boolean;
  onCheckpoint: (checkpointId: LabCheckpointId) => void;
}

export interface LabDefinition {
  component: ComponentType<LabContentProps>;
  requiredCheckpoints: readonly LabCheckpointId[];
}

export interface ExerciseResult {
  correct: boolean;
  feedback: string;
}

export type ExerciseChecker = (
  input: string,
  signal: AbortSignal,
) => ExerciseResult | Promise<ExerciseResult>;

export interface SchemeInfo {
  name: string;
  speed: string;
  limit: string;
  cost: string;
  useCase: string;
  operator: string;
}

export interface SchemesResponse {
  currency: string;
  country: string;
  countryCode: string;
  iban: boolean;
  localIdentifier: string;
  schemes: SchemeInfo[];
}

export interface TrackCreateRequest {
  originator_bic: string;
  originator_name: string;
  beneficiary_bic: string;
  beneficiary_name: string;
  currency: string;
  amount: number;
  charge_code: "OUR" | "SHA" | "BEN";
  intermediary_bics: string[];
  intermediary_names: string[];
  outcome: "credited" | "rejected";
}
```

`useLabCompletion` has this exact signature:

```ts
export function useLabCompletion(
  required: readonly LabCheckpointId[],
  onComplete: () => void,
): {
  completed: ReadonlySet<LabCheckpointId>;
  markCheckpoint: (id: LabCheckpointId) => void;
  isReady: boolean;
};
```

---

### Task 1: Freeze the Legacy Parity Contract

**Files:**
- Create: `frontend/src/features/learn/legacyParity.ts`
- Create: `frontend/src/features/learn/legacyParity.test.ts`
- Reference: `app/static/js/learn-labs.js`
- Reference: `app/static/js/learn-labs-2-3.js`
- Reference: `app/static/js/learn-labs-4-6.js`
- Reference: `app/static/js/learn-lab-schemes.js`
- Reference: `app/static/js/learn-capstone.js`

**Interfaces:**
- Produces: `CORE_LAB_PARITY`, the acceptance inventory used by unit and E2E tests.

- [ ] **Step 1: Write the failing parity inventory test**

```ts
import { CORE_LAB_PARITY } from "./legacyParity";

it("defines behavior parity for all eight core learning modules", () => {
  expect(Object.keys(CORE_LAB_PARITY)).toEqual([
    "lab-1", "lab-2", "lab-3", "lab-4",
    "lab-5", "lab-6", "lab-7", "capstone",
  ]);
  for (const entry of Object.values(CORE_LAB_PARITY)) {
    expect(entry.interactions.length).toBeGreaterThan(0);
    expect(entry.requiredCheckpoints.length).toBeGreaterThan(0);
    expect(entry.legacySources.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run the test to confirm RED**

Run: `cd frontend && npm test -- legacyParity.test.ts`

Expected: FAIL because `legacyParity.ts` does not exist.

- [ ] **Step 3: Implement the complete inventory**

Define each entry with `title`, `legacySources`, `apiEndpoints`, `interactions`, and `requiredCheckpoints`. Use these checkpoint IDs:

| Module | Required checkpoints |
|---|---|
| `lab-1` | `analyze-identifier`, `identify-country`, `identify-bank` |
| `lab-2` | `validate-original`, `break-checksum`, `find-valid-iban` |
| `lab-3` | `run-match`, `run-close-match`, `identify-fraud-risk` |
| `lab-4` | `route-demo`, `route-japan` |
| `lab-5` | `lookup-ssi`, `identify-correspondent` |
| `lab-6` | `create-payment`, `read-fee-deduction` |
| `lab-7` | `load-schemes`, `complete-seven-scenarios` |
| `capstone` | `validate`, `verify`, `route`, `settle`, `decide`, `track` |

- [ ] **Step 4: Verify GREEN and commit**

Run: `cd frontend && npm test -- legacyParity.test.ts`

Expected: PASS with eight entries in curriculum order.

```bash
git add frontend/src/features/learn/legacyParity.ts frontend/src/features/learn/legacyParity.test.ts
git commit -m "test(learn): define core lab parity contract"
```

### Task 2: Build the Completion Contract and Typed Lab Registry

**Files:**
- Create: `frontend/src/features/learn/labTypes.ts`
- Create: `frontend/src/features/learn/useLabCompletion.ts`
- Create: `frontend/src/features/learn/useLabCompletion.test.tsx`
- Create: `frontend/src/features/learn/labRegistry.ts`
- Create: `frontend/src/features/learn/labRegistry.test.ts`

**Interfaces:**
- Produces: interfaces above, `useLabCompletion`, `LAB_REGISTRY`, and `getLabDefinition(moduleId)`.

- [ ] **Step 1: Write completion tests**

```tsx
it("calls onComplete once after every required checkpoint", () => {
  const onComplete = vi.fn();
  const { result } = renderHook(() =>
    useLabCompletion(["first", "second"], onComplete),
  );
  act(() => result.current.markCheckpoint("first"));
  expect(onComplete).not.toHaveBeenCalled();
  act(() => result.current.markCheckpoint("second"));
  act(() => result.current.markCheckpoint("second"));
  expect(onComplete).toHaveBeenCalledTimes(1);
});
```

Also assert unknown checkpoint IDs are ignored and an empty requirement set never auto-completes.

- [ ] **Step 2: Implement `useLabCompletion`**

Use a `Set`, functional state updates, and a `useRef` completion latch. Call `onComplete` only when the new set contains every required ID.

- [ ] **Step 3: Write registry completeness tests**

Assert every `CURRICULUM` module has one registry definition, its checkpoint list equals `CORE_LAB_PARITY`, and no extra registry IDs exist.

- [ ] **Step 4: Implement the registry with temporary content adapters**

Create one `UnavailableLabContent` component for the initial RED/GREEN state and map all eight IDs to it. Later tasks replace one mapping at a time. Do not add a switch to `LearnModulePage`.

- [ ] **Step 5: Verify and commit**

Run: `cd frontend && npm test -- useLabCompletion.test.tsx labRegistry.test.ts`

Expected: completion and registry contract tests pass.

```bash
git add frontend/src/features/learn/labTypes.ts frontend/src/features/learn/useLabCompletion.ts frontend/src/features/learn/useLabCompletion.test.tsx frontend/src/features/learn/labRegistry.ts frontend/src/features/learn/labRegistry.test.ts
git commit -m "feat(learn): add typed lab registry and completion contract"
```

### Task 3: Build Accessible Shared Lab Primitives

**Files:**
- Create: `frontend/src/features/learn/components/Exercise.tsx`
- Create: `frontend/src/features/learn/components/Exercise.test.tsx`
- Create: `frontend/src/features/learn/components/MultipleChoice.tsx`
- Create: `frontend/src/features/learn/components/MultipleChoice.test.tsx`
- Create: `frontend/src/features/learn/components/Decompose.tsx`
- Create: `frontend/src/features/learn/components/Decompose.test.tsx`
- Create: `frontend/src/features/learn/components/ScoreBar.tsx`
- Create: `frontend/src/features/learn/components/ScoreBar.test.tsx`
- Create: `frontend/src/features/learn/components/StepIndicator.tsx`
- Create: `frontend/src/features/learn/components/StepIndicator.test.tsx`
- Create: `frontend/src/features/learn/components/LabComponents.css`

**Interfaces:**
- Consumes: `ExerciseChecker`, existing `Button`, `StatusChip`, and tokens.
- Produces: reusable primitives with no lab-specific copy.

- [ ] **Step 1: Write `Exercise` state-machine tests**

Test visible label, Enter submission, whitespace rejection, hint disclosure, async checking state, duplicate-submit prevention, success status, error alert, thrown checker recovery, AbortController cancellation on resubmit/unmount, input-edit clearing stale feedback, and exactly-once `onCorrect`.

The public props are:

```ts
interface ExerciseProps {
  id: string;
  title: string;
  prompt: React.ReactNode;
  label: string;
  placeholder?: string;
  hint: React.ReactNode;
  checkAnswer: ExerciseChecker;
  onCorrect?: () => void;
}
```

- [ ] **Step 2: Implement `Exercise` and verify**

Run: `cd frontend && npm test -- Exercise.test.tsx`

Expected: all state-machine tests pass with no act warnings.

- [ ] **Step 3: Write and implement `MultipleChoice`**

Props contain `id`, `question`, `options: { id; label; correct; explanation }[]`, and `onCorrect`. Use a `<fieldset>` and `<legend>`. Test arrow-independent Tab navigation, selected state, correct/wrong explanation, locked answers after correct selection, reset after wrong selection, and exactly-once completion.

- [ ] **Step 4: Write and implement semantic visual primitives**

`Decompose` renders a `<dl>` so each segment value is associated with its label; `tone` is a closed union `accent | info | warning | danger`. `ScoreBar` uses `<meter min={0} max={1}>` plus visible percent text and clamps invalid values. `StepIndicator` uses an ordered list with `aria-current="step"` and explicit complete/current/upcoming text.

- [ ] **Step 5: Verify all primitive tests, mobile CSS, and commit**

Run: `cd frontend && npm test -- src/features/learn/components && npm run build`

Expected: all tests pass; CSS contains no raw colors, `transition: all`, or text-only decorative circles.

```bash
git add frontend/src/features/learn/components
git commit -m "feat(learn): add accessible lab interaction primitives"
```

### Task 4: Add Missing API Schemas, Fixtures, and Reusable Timeline

**Files:**
- Modify: `frontend/src/api/schemas.ts`
- Modify: `frontend/src/api/schemas.test.ts`
- Modify: `frontend/src/test/handlers.ts`
- Create: `frontend/src/features/operate/tracking/PaymentTimeline.tsx`
- Create: `frontend/src/features/operate/tracking/PaymentTimeline.test.tsx`
- Modify: `frontend/src/features/operate/tracking/TrackingPage.tsx`

**Interfaces:**
- Produces: `SchemesResponseSchema`, `SchemesResponse`, `SchemeInfo`, `TrackCreateRequest`, existing `TrackPaymentResponse`, and reusable `PaymentTimeline`.

- [ ] **Step 1: Capture the real `/api/schemes` response in a schema test fixture**

Use the field names asserted in `tests/test_schemes.py` and returned by `app/data/payment_schemes.py`: top-level `currency`, `country`, `countryCode`, `iban`, `localIdentifier`, and `schemes`; each scheme has `name`, `speed`, `limit`, `cost`, `useCase`, and `operator`. The Zod schema must match the FastAPI response exactly rather than the legacy card markup.

- [ ] **Step 2: Add scheme and tracking-create types**

Add `SchemesResponseSchema` and inferred types to `schemas.ts`. Define `TrackCreateRequest` exactly as shown in Shared Interfaces, matching `TrackPaymentRequest` in `app/schemas.py`; validate request construction in lab tests rather than parsing it with Zod. Keep `intermediary_bics` and `intermediary_names` equal in length.

- [ ] **Step 3: Add deterministic MSW fixtures**

Add handlers for valid/invalid IBAN, bank lookup, four VoP outcomes, successful/empty route, SSI with placeholders, tracking create, tracking lookup, schemes by currency, and prepare-payment recommendations. Each handler must assert required query/body fields and return 400 when a test sends the wrong contract.

- [ ] **Step 4: Extract and test `PaymentTimeline`**

Move timeline rendering out of `TrackingPage.tsx` without changing output. Props: `{ payment: TrackPaymentResponse }`. Test event order, sent/final amounts, fee display, terminal state, missing optional values, and simulation notice ownership (page owns notice; timeline does not duplicate it).

- [ ] **Step 5: Verify and commit**

Run: `cd frontend && npm test -- schemas.test.ts PaymentTimeline.test.tsx TrackingPage`

Expected: schemas, extraction regression, and tracking page tests pass.

```bash
git add frontend/src/api frontend/src/test/handlers.ts frontend/src/features/operate/tracking
git commit -m "feat(learn): add lab API contracts and reusable timeline"
```

### Task 5: Port Lab 1 — BIC and IBAN Identity

**Files:**
- Create: `frontend/src/features/learn/labs/Lab1Content.tsx`
- Create: `frontend/src/features/learn/labs/Lab1Content.test.tsx`
- Create: `frontend/src/features/learn/labs/LabContent.css`
- Modify: `frontend/src/features/learn/labRegistry.ts`
- Reference: `app/static/js/learn-labs.js`

**Interfaces:**
- Consumes: `ValidateResponseSchema`, `LookupResponseSchema`, `Decompose`, `Exercise`, `AsyncRegion`.
- Produces checkpoints: `analyze-identifier`, `identify-country`, `identify-bank`.

- [ ] **Step 1: Write behavior tests before markup**

Test static decompositions for `CITIUS33XXX` and `GB29NWBK60161331926819`; successful BIC analysis; IBAN validation followed by BIC lookup; invalid response; network retry; stale result cleared after input edit; Nigeria country answer acceptance (`Nigeria` and `NG`); NatWest bank answer acceptance; three checkpoints emitted exactly once.

- [ ] **Step 2: Run RED**

Run: `cd frontend && npm test -- Lab1Content.test.tsx`

Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement concept → demo → exercises**

Keep the legacy examples, but use semantic headings and `Decompose`. The analyzer calls `/api/validate?value=…`; when a BIC is returned, call `/api/lookup?bic=…`. Abort the older request when the input changes or a new analysis starts.

- [ ] **Step 4: Replace the registry adapter and verify vertical slice**

Run: `cd frontend && npm test -- Lab1Content labRegistry LearnModulePage && npm run build && npm run test:e2e -- --grep "Lab 1"`

Expected: Lab 1 content renders through the real route, completion persists after all checkpoints, and reload shows completed status.

```bash
git add frontend/src/features/learn/labs frontend/src/features/learn/labRegistry.ts
git commit -m "feat(learn): port BIC and IBAN lab"
```

### Task 6: Port Lab 2 — MOD-97 Checksum

**Files:**
- Create: `frontend/src/features/learn/labs/Lab2Content.tsx`
- Create: `frontend/src/features/learn/labs/Lab2Content.test.tsx`
- Create: `frontend/src/features/learn/labs/mod97.ts`
- Create: `frontend/src/features/learn/labs/mod97.test.ts`
- Modify: `frontend/src/features/learn/labRegistry.ts`
- Reference: `app/static/js/learn-labs-2-3.js`

**Interfaces:**
- Produces: `normalizeIban`, `ibanToNumericString`, `mod97Remainder`; checkpoints `validate-original`, `break-checksum`, `find-valid-iban`.

- [ ] **Step 1: Test MOD-97 as pure domain logic**

Cover spaces/lowercase normalization, valid UK sample remainder 1, a mutated checksum, non-alphanumeric rejection, and long-number chunking without JavaScript integer overflow.

- [ ] **Step 2: Test lab interactions**

Verify the prefilled valid check, editable break-it input, server validation disagreement warning, valid-vs-invalid multiple choice, request cancellation, and completion only after all three checkpoints.

- [ ] **Step 3: Implement without duplicating backend authority**

Show the client MOD-97 steps for education, then call `/api/validate` as the authoritative simulation result. If client and server disagree, show an unavailable state and do not emit a checkpoint.

- [ ] **Step 4: Verify and commit**

Run: `cd frontend && npm test -- mod97 Lab2Content && npm run test:e2e -- --grep "Lab 2"`

Expected: algorithm, API, exercise, and completion tests pass.

```bash
git add frontend/src/features/learn/labs frontend/src/features/learn/labRegistry.ts
git commit -m "feat(learn): port MOD-97 checksum lab"
```

### Task 7: Port Lab 3 — Verification of Payee

**Files:**
- Create: `frontend/src/features/learn/labs/Lab3Content.tsx`
- Create: `frontend/src/features/learn/labs/Lab3Content.test.tsx`
- Modify: `frontend/src/features/learn/labRegistry.ts`
- Reference: `app/static/js/learn-labs-2-3.js`

**Interfaces:**
- Consumes: `VoPResponseSchema`, `ScoreBar`, `Exercise`, `StatusChip`.
- Produces checkpoints: `run-match`, `run-close-match`, `identify-fraud-risk`.

- [ ] **Step 1: Write outcome-table and scenario tests**

Assert MATCH, CLOSE_MATCH, NO_MATCH, and NOT_CHECKED definitions are visible. Quick scenarios submit `John Smith`, `Jon Smyth`, and `Fraudster` to `/api/verify-payee`; each renders its returned outcome, advice, and score where present.

- [ ] **Step 2: Test safety and completion behavior**

NO_MATCH must use failed semantics and explicit stop advice; NOT_CHECKED must not look successful; score 0 and 1 render correctly; the close-match exercise accepts only a returned score from 0.75 through 0.90 inclusive; three checkpoints complete the lab once.

- [ ] **Step 3: Implement and verify**

Run: `cd frontend && npm test -- Lab3Content && npm run test:e2e -- --grep "Lab 3"`

Expected: all outcome, score, API error, and completion tests pass.

```bash
git add frontend/src/features/learn/labs/Lab3Content.tsx frontend/src/features/learn/labs/Lab3Content.test.tsx frontend/src/features/learn/labRegistry.ts
git commit -m "feat(learn): port verification of payee lab"
```

### Task 8: Port Lab 4 — Correspondent Routing

**Files:**
- Create: `frontend/src/features/learn/labs/Lab4Content.tsx`
- Create: `frontend/src/features/learn/labs/Lab4Content.test.tsx`
- Modify: `frontend/src/features/learn/labRegistry.ts`
- Reference: `app/static/js/learn-labs-4-6.js`

**Interfaces:**
- Consumes: `RouteResponseSchema`, `PaymentRoute`, `PaymentRouteNode`.
- Produces checkpoints: `route-demo`, `route-japan`.

- [ ] **Step 1: Write route-mapping tests**

Test response-to-node mapping: sender, every suggested intermediary, beneficiary; confidence maps to explicit text; empty suggestions render the backend advisory; invalid route uses failed semantics. Test the Japan exercise sends `BOTKJPJTXXX` and `USD` and verifies the returned intermediary, not a hard-coded DOM answer.

- [ ] **Step 2: Implement the route demo**

Use labeled BIC/currency controls and `PaymentRoute`. Do not recreate route arrows or animation. Editing either input clears the old route and its checkpoint until rerun.

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npm test -- Lab4Content PaymentRoute && npm run test:e2e -- --grep "Lab 4"`

Expected: desktop/mobile route presentation, empty/error states, Japan exercise, and completion pass.

```bash
git add frontend/src/features/learn/labs/Lab4Content.tsx frontend/src/features/learn/labs/Lab4Content.test.tsx frontend/src/features/learn/labRegistry.ts
git commit -m "feat(learn): port correspondent routing lab"
```

### Task 9: Port Lab 5 — Settlement Instructions

**Files:**
- Create: `frontend/src/features/learn/labs/Lab5Content.tsx`
- Create: `frontend/src/features/learn/labs/Lab5Content.test.tsx`
- Modify: `frontend/src/features/learn/labRegistry.ts`
- Reference: `app/static/js/learn-labs-4-6.js`

**Interfaces:**
- Consumes: `SSIResponseSchema`, `SSIRecord`, `Exercise`.
- Produces checkpoints: `lookup-ssi`, `identify-correspondent`.

- [ ] **Step 1: Write content and safety tests**

Test SSI rows expose beneficiary, intermediary, currency, charge code, value date, and placeholder account label. Assert the canonical placeholder warning is visible and no copy contains “real account”. Test OUR/SHA/BEN definitions as text, not color alone.

- [ ] **Step 2: Write lookup and exercise tests**

Cover successful lookup, empty instructions, API error/retry, stale input, and the Emirates NBD correspondent exercise using returned `intermediary_bank_name`. Do not accept an answer when the lookup failed.

- [ ] **Step 3: Implement, verify, and commit**

Run: `cd frontend && npm test -- Lab5Content && npm run test:e2e -- --grep "Lab 5"`

Expected: safety copy, lookup states, charge-code semantics, exercise, and completion pass.

```bash
git add frontend/src/features/learn/labs/Lab5Content.tsx frontend/src/features/learn/labs/Lab5Content.test.tsx frontend/src/features/learn/labRegistry.ts
git commit -m "feat(learn): port settlement instructions lab"
```

### Task 10: Port Lab 6 — Simulated UETR Tracking

**Files:**
- Create: `frontend/src/features/learn/labs/Lab6Content.tsx`
- Create: `frontend/src/features/learn/labs/Lab6Content.test.tsx`
- Modify: `frontend/src/features/learn/labRegistry.ts`
- Reference: `app/static/js/learn-labs-4-6.js`

**Interfaces:**
- Consumes: `TrackCreateRequest`, `TrackPaymentResponseSchema`, `PaymentTimeline`, `Exercise`.
- Produces checkpoints: `create-payment`, `read-fee-deduction`.

- [ ] **Step 1: Write request-contract tests**

Assert the default BOFA → GTBank form sends every required FastAPI field, numeric positive amount, charge code, and aligned intermediary BIC/name arrays. Test duplicate-submit prevention and input preservation after 500.

- [ ] **Step 2: Write timeline and fee-reading tests**

After creation, render `PaymentTimeline`, the UETR, terminal status, sent/final amounts, and total fees. The exercise’s expected deduction is derived from `sent_amount - final_amount` or `total_fees`; do not hard-code a fixture amount.

- [ ] **Step 3: Implement, verify, and commit**

Run: `cd frontend && npm test -- Lab6Content PaymentTimeline && npm run test:e2e -- --grep "Lab 6"`

Expected: creation, retry, timeline, derived answer, simulation labeling, and completion pass.

```bash
git add frontend/src/features/learn/labs/Lab6Content.tsx frontend/src/features/learn/labs/Lab6Content.test.tsx frontend/src/features/learn/labRegistry.ts
git commit -m "feat(learn): port UETR tracking lab"
```

### Task 11: Port Lab 7 — Payment Schemes

**Files:**
- Create: `frontend/src/features/learn/labs/Lab7Content.tsx`
- Create: `frontend/src/features/learn/labs/Lab7Content.test.tsx`
- Create: `frontend/src/features/learn/labs/schemeScenarios.ts`
- Create: `frontend/src/features/learn/labs/schemeScenarios.test.ts`
- Modify: `frontend/src/features/learn/labRegistry.ts`
- Reference: `app/static/js/learn-lab-schemes.js`

**Interfaces:**
- Consumes: `SchemesResponseSchema`, `MultipleChoice`.
- Produces checkpoints: `load-schemes`, `complete-seven-scenarios`.

- [ ] **Step 1: Encode seven scenarios as typed data**

Each scenario has stable ID, question, options, one correct option, and explanation. Test exactly seven scenarios, unique IDs, at least two choices, and exactly one correct answer each.

- [ ] **Step 2: Write currency and scheme tests**

Test all ten currency buttons have accessible names and 44px targets; selection updates `/api/schemes?currency=…`; rapid changes cancel stale requests; empty/unknown currency and server error render correctly; returned scheme values render without unsafe HTML.

- [ ] **Step 3: Write quiz aggregation tests**

Wrong answers explain and reset locally. Correct answers lock that scenario. The aggregate checkpoint fires only when all seven unique scenario IDs are correct and fires once.

- [ ] **Step 4: Implement, verify, and commit**

Run: `cd frontend && npm test -- schemeScenarios Lab7Content && npm run test:e2e -- --grep "Lab 7"`

Expected: API, cancellation, all seven scenarios, keyboard interaction, and completion pass.

```bash
git add frontend/src/features/learn/labs frontend/src/features/learn/labRegistry.ts
git commit -m "feat(learn): port payment schemes lab"
```

### Task 12: Port the Capstone as a Resumable State Machine

**Files:**
- Create: `frontend/src/features/learn/labs/CapstoneContent.tsx`
- Create: `frontend/src/features/learn/labs/CapstoneContent.test.tsx`
- Create: `frontend/src/features/learn/labs/capstoneMachine.ts`
- Create: `frontend/src/features/learn/labs/capstoneMachine.test.ts`
- Modify: `frontend/src/features/learn/labRegistry.ts`
- Modify: `frontend/src/lib/persistence/storage.ts`
- Modify: `frontend/src/lib/persistence/persistence.test.ts`
- Reference: `app/static/js/learn-capstone.js`

**Interfaces:**
- Produces: `CapstoneState`, `CapstoneAction`, `capstoneReducer`, versioned session key `relay:capstone:v1`.
- Produces checkpoints: `validate`, `verify`, `route`, `settle`, `decide`, `track`.

- [ ] **Step 1: Define and test the reducer before UI**

States are `details`, `validating`, `verifying`, `routing`, `settling`, `deciding`, `tracking`, `complete`, and `error`. Test legal transitions, rejected validation preventing verification, upstream edit clearing downstream results, retry returning to the failed step, and hydration discarding corrupt/obsolete session data.

- [ ] **Step 2: Test each API boundary independently**

Validate uses `/api/validate`; verify uses `/api/verify-payee`; route uses `/api/route`; settle uses `/api/ssi`; decide uses `/api/prepare-payment`; track uses `/api/track/create`. Assert exact request bodies and that a step cannot advance on malformed schema or API error.

- [ ] **Step 3: Implement the six-step UI**

Use `StepIndicator`, `PaymentRoute`, `PaymentTimeline`, existing result components where their public interface fits, persistent simulation labeling, and an alternative link to `/app/operate/prepare`. Only the current and completed step summaries render; upcoming step controls stay unavailable.

- [ ] **Step 4: Implement safe session persistence**

Persist after successful transitions and user input edits. Do not persist AbortControllers, errors, or transient loading state. Clear session state after completion only when the user selects “Start another simulation”.

- [ ] **Step 5: Verify and commit**

Run: `cd frontend && npm test -- capstoneMachine CapstoneContent persistence && npm run test:e2e -- --grep "Capstone"`

Expected: happy path, blocked/rejected path, retry, resume after reload, upstream invalidation, tracking, and completion pass.

```bash
git add frontend/src/features/learn/labs frontend/src/features/learn/labRegistry.ts frontend/src/lib/persistence
git commit -m "feat(learn): port resumable payment capstone"
```

### Task 13: Wire Registry Content into the Module Shell

**Files:**
- Modify: `frontend/src/features/learn/LearnModulePage.tsx`
- Create: `frontend/src/features/learn/LearnModulePage.test.tsx`
- Modify: `frontend/src/features/learn/LearnPage.css`

**Interfaces:**
- Consumes: `getLabDefinition`, persisted progress, `LabContentProps`.
- Produces: one shell that renders all registered modules and persists completion idempotently.

- [ ] **Step 1: Write shell integration tests**

Test unknown module, locked module, Lab 1 registry render, Capstone registry render, header status before/after callback, duplicate callback protection, reload persistence, previous/next navigation, and no placeholder sentence `This module covers the fundamentals`.

- [ ] **Step 2: Replace placeholder content with registry rendering**

Create `completeModule()` using a functional state update; return the same array when the ID already exists. Resolve the definition with `getLabDefinition(module.id)`, call `useLabCompletion(definition.requiredCheckpoints, completeModule)`, and render its component with `{ moduleId, isComplete, onCheckpoint: markCheckpoint }`. Keep outcomes before content. Remove the manual “Mark as complete” toggle; display read-only completion status instead.

- [ ] **Step 3: Run integration and full frontend tests**

Run: `cd frontend && npm test && npm run build`

Expected: all tests pass; no placeholder module body remains; production build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/learn/LearnModulePage.tsx frontend/src/features/learn/LearnModulePage.test.tsx frontend/src/features/learn/LearnPage.css
git commit -m "feat(learn): render interactive content through module registry"
```

### Task 14: End-to-End Parity, Accessibility, and Legacy Retirement Gate

**Files:**
- Create: `frontend/e2e/learn-content.spec.ts`
- Modify: `frontend/e2e/learn.spec.ts`
- Modify: `frontend/README.md`
- Modify: `docs/superpowers/plans/2026-07-17-relay-ui-rebuild.md`
- Do not delete legacy files in this task

**Interfaces:**
- Produces: the evidence required before deleting the five legacy core-lab scripts.

- [ ] **Step 1: Add one desktop and mobile journey per module**

For Labs 1–7 and Capstone, assert the distinctive concept, run the primary demo, complete required exercises, observe completion, reload, and confirm persistence. Run projects at 1440×900 and 390×844.

- [ ] **Step 2: Add cross-cutting accessibility checks**

Run axe on each module’s initial and completed state. Keyboard-only journeys must open hints, submit exercises, answer quizzes, navigate capstone steps, and reach previous/next links. Assert no serious/critical violations and no horizontal document overflow.

- [ ] **Step 3: Add screenshot assertions for high-risk visual states**

Capture decomposition, score meter at 0/close/1, desktop/mobile route, SSI table/mobile records, tracking timeline, scheme grid, wrong quiz answer, capstone incomplete recommendation, and all API error states.

- [ ] **Step 4: Run the entire repository gate**

Run: `.venv/bin/pytest tests -q && cd frontend && npm test && npm run build && npm run test:e2e && npm run check:bundle`

Expected: Python tests, frontend tests, production build, desktop/mobile E2E, accessibility, screenshots, and bundle gate all pass.

- [ ] **Step 5: Record parity without deleting the rollback source**

Update the main Relay plan’s Task 12 as complete and list the five legacy scripts now covered. Keep them until the final global cutover task, when `/learn` redirects to Relay and rollback no longer needs the legacy shell.

- [ ] **Step 6: Commit documentation and E2E evidence**

```bash
git add frontend/e2e frontend/README.md docs/superpowers/plans/2026-07-17-relay-ui-rebuild.md
git commit -m "test(learn): verify interactive core lab parity"
```

---

## Lab Acceptance Matrix

| Module | Distinctive behavior | Completion evidence | Failure evidence |
|---|---|---|---|
| Lab 1 | validate → optional lookup → decomposition | analyzer + 2 exercises | invalid identifier, lookup error |
| Lab 2 | client MOD-97 + server validation | valid, broken, valid-choice | client/server disagreement |
| Lab 3 | four VoP outcomes + score | match, close match, fraud risk | 500, NOT_CHECKED, NO_MATCH |
| Lab 4 | route response → `PaymentRoute` | demo + Japan route | empty route, invalid BIC |
| Lab 5 | SSI records + charge codes | lookup + correspondent | empty SSI, placeholder warning |
| Lab 6 | create → reusable timeline | payment + derived deduction | create failure, missing amounts |
| Lab 7 | schemes by currency + 7 quizzes | load + all unique scenarios | empty currency, stale request |
| Capstone | resumable six-step reducer | all six steps + tracking | reject, blocked, retry, reload |

## Final Acceptance Checklist

- [ ] All eight registry entries render real content; `UnavailableLabContent` has no production references.
- [ ] `LearnModulePage.tsx` contains no lab-specific switch, endpoint, or exercise copy.
- [ ] No core lab calls `fetch` directly.
- [ ] Every API demo clears stale results on input edit and cancels superseded requests.
- [ ] Every required checkpoint is covered by a behavior test, not only a render assertion.
- [ ] Completion is idempotent, persists across reload, and cannot occur merely by opening a module.
- [ ] All interactive feedback is announced correctly and can be reached by keyboard.
- [ ] Labs work at 390×844 and 1440×900 without horizontal page overflow.
- [ ] Placeholder settlement safety wording is present and unsafe “real account” wording is absent.
- [ ] All repository quality gates pass from a clean checkout.
