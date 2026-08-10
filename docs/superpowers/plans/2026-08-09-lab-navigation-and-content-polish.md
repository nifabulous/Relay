# Lab Navigation and Content Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish Lab 3 content hierarchy and make module navigation sticky with a completion-gated next action.

**Architecture:** Keep the Lab 3 copy and spacing changes scoped to `Lab3Content` and `LabContent.css`. Keep navigation behavior in `LearnModulePage`, deriving the next action from the existing `isComplete` state and preserving the current curriculum unlock model. Add focused tests beside the existing Learn route and Lab 3 tests.

**Tech Stack:** React, TypeScript, React Router, Vitest, Testing Library, CSS design tokens.

## Global Constraints

- Preserve the existing checkpoint IDs and completion persistence.
- Do not change the VoP API request or response schema.
- Do not add dependencies or introduce a fixed viewport overlay.
- Keep navigation usable on narrow screens and with keyboard/screen-reader interaction.

---

### Task 1: Define the expected header, content, and navigation behavior in tests

**Files:**
- Modify: `frontend/src/features/learn/labs/Lab3Content.test.tsx`
- Modify: `frontend/src/features/learn/cases/caseRoutes.test.tsx`

**Interfaces:**
- Tests consume the existing `Lab3Content` and `LearnModulePage` public render paths.
- Tests produce regression coverage for the approved UI behavior before production changes.

- [ ] **Step 1: Add Lab 3 copy and spacing assertions**

Assert that Lab 3 renders `Choose the safest next step`, the revised supporting copy, and a decision question using the shorter CLOSE_MATCH wording. Assert that the VoP error remains separated from the prepared-example controls through the existing scoped class structure.

- [ ] **Step 2: Add navigation state assertions**

Render `/learn/lab-3` with empty progress and assert that the next module is not a link, is marked unavailable, and explains that the lab must be completed. Render with `lab-3` already present in persisted progress and assert that the next module is a working link.

- [ ] **Step 3: Run the focused tests and confirm the new expectations fail**

Run:

```bash
npm test -- --no-file-parallelism src/features/learn/labs/Lab3Content.test.tsx src/features/learn/cases/caseRoutes.test.tsx
```

Expected: the new assertions fail because the current copy and navigation remain unchanged.

### Task 2: Implement the Lab 3 content polish

**Files:**
- Modify: `frontend/src/features/learn/labs/Lab3Content.tsx`
- Modify: `frontend/src/features/learn/labs/LabContent.css`

**Interfaces:**
- Keep `Lab3Content` props and checkpoint behavior unchanged.
- Keep the existing `SCENARIOS`, API call, result rendering, and decision answer logic intact except for presentation copy.

- [ ] **Step 1: Move duration presentation into the module header**

Update the module header in `LearnModulePage` during Task 3; Lab 3 itself only receives scoped content changes here.

- [ ] **Step 2: Replace the decision heading and supporting copy**

Use the approved heading and concise instruction. Rewrite the two decision question strings to preserve the facts and correct actions while reducing the long sentence structure.

- [ ] **Step 3: Add scoped error spacing**

Add a Lab 3 section rule that gives `.lab-error` a top margin after the prepared examples, without changing global error spacing.

- [ ] **Step 4: Run focused Lab 3 tests**

Run the focused Lab 3 test file and confirm the content assertions pass.

### Task 3: Implement the duration pill and sticky gated navigation

**Files:**
- Modify: `frontend/src/features/learn/LearnModulePage.tsx`
- Modify: `frontend/src/features/learn/LearnPage.css`

**Interfaces:**
- Consume the existing `isComplete`, `prevModule`, and `nextModule` values.
- Preserve previous navigation and last-module back-to-curriculum behavior.

- [ ] **Step 1: Render the duration pill beside the title**

Replace the separate `~N min` metadata block with a title-row pill containing `N min`, with an accessible label identifying it as an estimated duration.

- [ ] **Step 2: Render the next action as gated navigation**

When `nextModule` exists and `isComplete` is false, render a non-interactive disabled presentation with `aria-disabled="true"`, muted styling, and an accessible label explaining `Complete this lab to unlock`. When complete, render the existing link unchanged.

- [ ] **Step 3: Add sticky and disabled styles**

Make `.learn-nav` sticky at the bottom of the module content with a surface background, top border, and stacking context. Add disabled next styles and preserve the existing mobile column layout.

- [ ] **Step 4: Run route and focused tests**

Run the Lab 3 and route test files and confirm both gated and unlocked states pass.

### Task 4: Verify the complete change

**Files:**
- No additional source files.

- [ ] **Step 1: Run the complete frontend test suite**

Run `npm test -- --no-file-parallelism` from `frontend/` and require zero failures.

- [ ] **Step 2: Build and check the diff**

Run `npm run build && git diff --check` from `frontend/` and require exit code 0.

- [ ] **Step 3: Smoke-test the live Lab 3 page**

Confirm the duration pill, error spacing, shortened decision copy, sticky navigation, disabled next state, and enabled next state after completion in the browser.
