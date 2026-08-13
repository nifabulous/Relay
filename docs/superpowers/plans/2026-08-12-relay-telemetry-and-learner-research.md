# Relay Telemetry and Learner Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Close the review regression, reconcile project verification counts, and add a provider-neutral, privacy-safe analytics seam plus tested instrumentation for Relay's module, practice, and Case Desk funnels.

**Architecture:** Add a small typed analytics module under frontend/src/lib/analytics with a closed event union and injectable sink. The default sink is a no-op, so the product makes no network requests until a future PostHog adapter is explicitly configured. Instrument existing source-of-truth transitions in the app shell, module completion hook, practice flow, and Case Desk handlers; keep the legacy /learn telemetry path unchanged.

**Tech Stack:** React 19, TypeScript 7 strict mode, Vitest + Testing Library, FastAPI/Python pytest, Markdown documentation.

## Global Constraints

- No PostHog SDK or provider-specific dependency in this change.
- No account system, email, IP address, fingerprint, persistent learner ID, free text, account value, name, raw URL, or full learner state in analytics events.
- No telemetry data may be added to learner backup/export JSON.
- The default analytics sink must never make a network request.
- Existing legacy /learn telemetry endpoint and event format remain backward compatible.
- Completion and checkpoint truth remain owned by useLabCompletion, PracticePage, and the Case Desk reducer.
- Use test-first red/green cycles for every behavior change.

---

### Task 1: Close the review fix and reconcile documentation

**Files:**
- Modify tests/test_data_consistency.py
- Modify README.md, ROADMAP.md, ENGINEERING_ROADMAP.md
- Test tests/test_data_consistency.py

**Interfaces:**
- Consumes fresh local verification totals.
- Produces a maintained directory invariant and documentation whose counts match the checkout.

- [ ] Step 1: Confirm the regression test is present.

    Run:
    .venv/bin/pytest -q tests/test_data_consistency.py

    Expected: the suite passes and test_every_entry_names_its_bank asserts ids.get("bank_name") is present and non-blank.

- [ ] Step 2: Run authoritative counts.

    Run from the repository root:
    .venv/bin/pytest -q

    Run from frontend/:
    npm test -- --run

    Copy the exact passing totals into the documentation; do not use the stale PR body counts.

- [ ] Step 3: Update only stale count/focus lines.

    Update the Last updated, Current verification, Verified health snapshot, Numbers, and scorecard rows. Add a short pointer to the approved telemetry/research spec and state that provider integration is deferred. Do not rewrite unrelated roadmap history.

- [ ] Step 4: Verify and commit.

    Run:
    .venv/bin/pytest -q tests/test_data_consistency.py
    git diff --check
    git diff -- README.md ROADMAP.md ENGINEERING_ROADMAP.md tests/test_data_consistency.py

    Commit:
    git add README.md ROADMAP.md ENGINEERING_ROADMAP.md tests/test_data_consistency.py
    git commit -m "docs: reconcile verification counts and retain directory invariant"

---

### Task 2: Add the provider-neutral analytics contract

**Files:**
- Create frontend/src/lib/analytics/analytics.ts
- Create frontend/src/lib/analytics/analytics.test.ts

**Interfaces:**
- Produces AnalyticsEvent, AnalyticsSink, track, setAnalyticsSink, resetAnalyticsSink, getAnalyticsSink, TestAnalyticsSink, and createTestSink.
- track accepts only the closed event union.

- [ ] Step 1: Write failing tests.

    Test that an injected sink captures:
    track("module_completed", { module_id: "lab-1" })

    Test that resetAnalyticsSink restores an empty no-op sink by injecting a test sink, capturing one event, resetting, capturing a second event, and asserting the original sink saw only the first event. Test the serialized `event.properties` objects (not the envelope's intentional `name` field) for absence of account, explanation, customer, and other free-text fields. Add a TypeScript `@ts-expect-error` assertion for `track("unknown_event", {})` and use `satisfies` to prove object-literal property allowlists.

- [ ] Step 2: Verify red.

    Run:
    cd frontend && npx vitest run src/lib/analytics/analytics.test.ts

    Expected: failure because the module and exports do not exist.

- [ ] Step 3: Implement the closed union and sink.

    Export an AnalyticsEventMap and derive the union so the generic track signature remains type-safe:

    type AnalyticsEventMap = {
      app_viewed: { surface: "relay" };
      module_viewed: { module_id: string };
      module_started: { module_id: string };
      module_completed: { module_id: string };
      checkpoint_reached: { module_id: string; checkpoint_id: string };
      question_answered: { surface: "module" | "practice"; question_id: string; correct: boolean; attempt_index: number };
      practice_started: { question_count: number };
      practice_completed: { question_count: number; correct_count: number };
      case_started: { case_id: string };
      case_phase_entered: { case_id: string; phase: "investigate" | "recommend" | "resolve" | "debrief" };
      case_action: { case_id: string; action: "request-facts" | "open-reference" | "edit-draft" | "send-recommendation" | "complete-transfer" | "restart" };
      case_completed: { case_id: string; outcome: "invalid" | "possible" | "defensible" | "preferred" };
    };

    type AnalyticsEvent = {
      [Name in keyof AnalyticsEventMap]: { name: Name; properties: AnalyticsEventMap[Name] }
    }[keyof AnalyticsEventMap];

    The map must include exactly these entries:

    app_viewed: surface "relay"
    module_viewed, module_started, module_completed: module_id string
    checkpoint_reached: module_id and checkpoint_id strings
    question_answered: surface "module" or "practice", question_id string, correct boolean, attempt_index number
    practice_started: question_count number
    practice_completed: question_count and correct_count numbers
    case_started: case_id string
    case_phase_entered: case_id and phase investigate/recommend/resolve/debrief
    case_action: case_id and action request-facts/open-reference/edit-draft/send-recommendation/complete-transfer/restart
    case_completed: case_id and outcome invalid/possible/defensible/preferred

    Define AnalyticsSink with capture(event: AnalyticsEvent): void. Define a module-level no-op sink, active sink, and this type-safe signature:

    function track<Name extends keyof AnalyticsEventMap>(name: Name, properties: AnalyticsEventMap[Name]): void

    Also define setAnalyticsSink, resetAnalyticsSink, getAnalyticsSink, and a test sink that stores captured AnalyticsEvent values. The implementation must not access fetch, localStorage, sessionStorage, cookies, or browser identity APIs.

- [ ] Step 4: Verify green.

    Run:
    cd frontend && npx vitest run src/lib/analytics/analytics.test.ts && npx tsc --noEmit

    Expected: focused tests pass and TypeScript exits 0.

- [ ] Step 5: Commit.

    git add frontend/src/lib/analytics
    git commit -m "feat: add provider-neutral Relay analytics contract"

---

### Task 3: Instrument app, module, and checkpoint funnels

**Files:**
- Modify frontend/src/app-shell/App.tsx
- Modify frontend/src/features/learn/LearnModulePage.tsx
- Modify frontend/src/features/learn/useLabCompletion.ts
- Modify frontend/src/features/learn/useLabCompletion.test.tsx
- Create or modify frontend/src/features/learn/LearnModulePage.test.tsx

**Interfaces:**
- Consumes track from frontend/src/lib/analytics/analytics.ts.
- Extends useLabCompletion(required, onComplete, onCheckpointReached?) without breaking existing callers.

- [ ] Step 1: Write failing hook tests.

    Add a test that markCheckpoint("a") twice calls onCheckpointReached once. Add a test that an unknown checkpoint calls neither callback. Keep the existing one-call completion assertion.

- [ ] Step 2: Verify red.

    Run:
    cd frontend && npx vitest run src/features/learn/useLabCompletion.test.tsx

    Expected: the new callback test fails because the hook has no third parameter.

- [ ] Step 3: Implement instrumentation at source-of-truth boundaries.

    In useLabCompletion, add an optional onCheckpointReached callback and keep the latest callback in a ref. In the markCheckpoint state updater, ignore unknown IDs and duplicate IDs without side effects. Add an effect that compares the current completed set with a ref of already-reported IDs, calls the latest callback for each newly accepted ID, and updates that ref. This avoids stale callbacks and side effects inside a React state updater while preserving the required-set guard.

    In LearnModulePage, use an effect keyed by `mod?.id` to emit module_viewed and, when that module is incomplete, module_started; guard the missing-module case and ensure a reused page emits once per module ID. In completeModule, emit module_completed only inside the existing !prev.includes(id) branch. Pass moduleId and an accepted-checkpoint callback from LabContentRenderer.

    In App, add a mount effect that calls track("app_viewed", { surface: "relay" }) once per App mount/page-view boundary. Keep the semantics explicit for development remounts and reset the injected sink between tests.

- [ ] Step 4: Add module integration tests.

    Inject a test sink, render a module fixture, and assert the sink receives module_viewed, module_started, checkpoint_reached, and module_completed. Assert duplicate completion transitions do not add a second completion event. Assert the existing UI behavior remains unchanged.

- [ ] Step 5: Verify.

    Run:
    cd frontend && npx vitest run src/features/learn/useLabCompletion.test.tsx src/features/learn/LearnModulePage.test.tsx
    npm run build

- [ ] Step 6: Commit.

    git add frontend/src/app-shell/App.tsx frontend/src/features/learn/LearnModulePage.tsx frontend/src/features/learn/useLabCompletion.ts frontend/src/features/learn/useLabCompletion.test.tsx frontend/src/features/learn/LearnModulePage.test.tsx
    git commit -m "feat: instrument Relay app and module funnels"

---

### Task 4: Instrument practice answers and completion

**Files:**
- Modify frontend/src/features/learn/practice/PracticePage.tsx
- Modify frontend/src/features/learn/practice/PracticePage.test.tsx

**Interfaces:**
- Consumes track.
- Produces practice_started, question_answered, and practice_completed with IDs and counts only.

- [ ] Step 1: Write failing tests.

    Inject a test sink, start a five-question drill, answer one question, and assert:
    practice_started has question_count 5.
    question_answered has surface practice, a string question_id, boolean correct, and attempt_index 1.
    Finish the drill and assert practice_completed has question_count 5 and correct_count between 0 and 5.

- [ ] Step 2: Verify red.

    Run:
    cd frontend && npx vitest run src/features/learn/practice/PracticePage.test.tsx

- [ ] Step 3: Implement calls at existing transitions.

    Call track("practice_started", { question_count: questions.length }) in startDrill. Call question_answered immediately after resolving the selected option. In the finish branch, call practice_completed using outcomes.length and the count of correct outcomes, while keeping recordDrill as the persistence source of truth.

- [ ] Step 4: Verify.

    Run:
    cd frontend && npx vitest run src/features/learn/practice/PracticePage.test.tsx
    npm test -- --run
    npm run build

- [ ] Step 5: Commit.

    git add frontend/src/features/learn/practice/PracticePage.tsx frontend/src/features/learn/practice/PracticePage.test.tsx
    git commit -m "feat: instrument Relay practice funnel"

---

### Task 5: Instrument Case Desk research events

**Files:**
- Modify frontend/src/features/learn/cases/CaseDesk.tsx
- Modify frontend/src/features/learn/cases/CaseDesk.test.tsx

**Interfaces:**
- Consumes track and existing reducer transitions.
- Produces bounded case_started, case_phase_entered, case_action, and case_completed events without draft text or full session payloads.

- [ ] Step 1: Write failing tests.

    Inject a test sink, render canada-us-supplier, start the case, request a fact, and open a reference. Assert case_started and the corresponding bounded case_action events. Advance a fixture through a phase transition and terminal completion; assert event properties contain only allowed enum values and no customerExpectation, diagnosis, reasons, account, or name keys.

- [ ] Step 2: Verify red.

    Run:
    cd frontend && npx vitest run src/features/learn/cases/CaseDesk.test.tsx

- [ ] Step 3: Instrument accepted handler and phase boundaries.

    In handleStart, after the reducer accepts the transition, emit case_started. Extend the existing `prevPhaseRef` focus effect rather than adding a second phase ref; emit case_phase_entered only for investigate, recommend, resolve, and debrief on actual phase changes. In each accepted discrete bounded handler, emit case_action with only case_id and the action enum. Keep `handleDraftPatch` uninstrumented while the user types; emit the coarse `edit-draft` action once on blur or submit, guarded by an interaction ref so one edit does not produce duplicates. Make `handleOpenAllReferences` emit one `open-reference` action for the sheet-opening interaction, not one event per internal fact loop. In handleCompleteTransfer, emit case_completed only when the reducer advances, using outcome.quality.

- [ ] Step 4: Add sensitive-field assertions.

    Serialize captured event properties and assert absence of customerExpectation, diagnosis, reasoning, account, name, and the authored customer-request text. Do not reject the envelope's `name` discriminator. Assert duplicate no-op reducer transitions do not emit actions.

- [ ] Step 5: Verify.

    Run:
    cd frontend && npx vitest run src/features/learn/cases/CaseDesk.test.tsx
    npm test -- --run
    npm run build

- [ ] Step 6: Commit.

    git add frontend/src/features/learn/cases/CaseDesk.tsx frontend/src/features/learn/cases/CaseDesk.test.tsx
    git commit -m "feat: instrument Case Desk learning funnel"

---

### Task 6: Full verification and handoff

**Files:**
- Verify all changed files; no product behavior beyond Tasks 1–5.

- [ ] Step 1: Run backend verification.

    .venv/bin/pytest -q
    .venv/bin/ruff check app tests

- [ ] Step 2: Run frontend verification.

    cd frontend && npm test -- --run
    npm run build

- [ ] Step 3: Run hygiene checks.

    cd ..
    git diff --check
    git status --short

    Expected: all tests, build, and lint checks pass; only intentional source/docs changes remain; no generated telemetry storage or provider dependency is added.

- [ ] Step 4: Review against the approved spec.

    Confirm every event is emitted from its stated source of truth, sensitive fields are excluded, legacy telemetry is untouched, and learner backup serialization is unchanged.

- [ ] Step 5: Commit final corrections.

    git add README.md ROADMAP.md ENGINEERING_ROADMAP.md docs/superpowers/specs docs/superpowers/plans tests frontend/src
    git commit -m "feat: add Relay learning analytics foundation"
