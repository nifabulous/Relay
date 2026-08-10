# Lab 3 VoP Form Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Lab 3 VoP demo with an accessible editable IBAN/payee form, explicit submit-to-result behavior, and clearer spacing.

**Architecture:** Keep the existing `Lab3Content` component, VoP API client, response schema, checkpoint logic, scenario data, and decision drill. Add local IBAN state and native form submission; scope layout changes to Lab 3 through a modifier class so other labs retain their current spacing.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, MSW, shared Relay CSS tokens, existing `/api/verify-payee` endpoint.

## Global Constraints

- Both fields must be ordinary editable `type="text"` inputs with visible labels.
- Scenario shortcuts fill the form and never submit automatically.
- Empty-field validation must block the request and announce an inline alert.
- Existing VoP outcomes, checkpoints, decision drill, and completion checklist must remain intact.
- No backend or API schema changes.

---

### Task 1: Lock the new form behavior with tests

**Files:**
- Modify: `frontend/src/features/learn/labs/Lab3Content.test.tsx`
- Test: `frontend/src/features/learn/labs/Lab3Content.test.tsx`

**Interfaces:**
- Consumes: Existing `Lab3Content`, MSW server, and VoP fixtures.
- Produces: Regression coverage for editable inputs, submit payload/result, empty validation, and non-submitting shortcuts.

- [ ] **Step 1: Update the input test**

Assert the IBAN and payee inputs are visible, have `type="text"`, and the IBAN is not read-only.

- [ ] **Step 2: Add a failing submit test**

Use an MSW POST handler to capture the JSON body, fill both fields, submit `Verify payee`, then assert the body contains the entered IBAN/name and the returned outcome is rendered.

- [ ] **Step 3: Add a failing validation test**

Submit with an empty payee name and assert an alert appears, the MSW handler is not called, and no checkpoint is emitted.

- [ ] **Step 4: Add a failing shortcut test**

Click the close-match shortcut and assert the payee-name field is filled while the request handler has not been called.

- [ ] **Step 5: Run the focused tests and confirm RED**

Run:

```bash
npm test -- --no-file-parallelism src/features/learn/labs/Lab3Content.test.tsx
```

Expected: the new assertions fail because the IBAN is read-only, the current controls are not a native submit form, and shortcuts currently submit immediately.

### Task 2: Implement the editable submit form

**Files:**
- Modify: `frontend/src/features/learn/labs/Lab3Content.tsx`

**Interfaces:**
- Consumes: Existing `apiPost`, `VoPResponseSchema`, `VoPResponse`, scenario definitions, and checkpoint callbacks.
- Produces: A native form that submits `{ iban, name }` and preserves existing result/checkpoint behavior.

- [ ] **Step 1: Add editable IBAN state**

Replace the constant-only request value with `const [iban, setIban] = useState(DEMO_IBAN)` while retaining the constant as the initial teaching example.

- [ ] **Step 2: Make request execution consume submitted values**

Change `runCheck` to accept the submitted IBAN and name, trim both values, clear stale result/error, and call `/api/verify-payee` with those values. Keep the existing response parsing and outcome checkpoint branches.

- [ ] **Step 3: Add local form validation**

Add `handleSubmit(event)` that prevents the browser navigation, rejects missing IBAN/name with `setError("Enter an IBAN and payee name before verifying.")`, and otherwise calls `runCheck(iban, name)`.

- [ ] **Step 4: Convert shortcuts to fill-only controls**

Make each scenario shortcut `type="button"`; its handler sets the scenario name, clears stale result/error, and does not call `runCheck`.

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run the same Lab 3 test command and confirm all tests pass.

### Task 3: Apply the approved layout and accessibility treatment

**Files:**
- Modify: `frontend/src/features/learn/labs/Lab3Content.tsx`
- Modify: `frontend/src/features/learn/labs/LabContent.css`

**Interfaces:**
- Consumes: The form state and result from Task 2 plus existing shared CSS tokens.
- Produces: A scoped payment-details card, responsive two-column/one-column fields, separated shortcuts, and an announced result panel.

- [ ] **Step 1: Add semantic form markup**

Wrap the two fields and primary action in `<form className="lab-vop-form" onSubmit={handleSubmit}>`; use visible labels, ordinary `type="text"` inputs, stable `name` attributes, and `type="submit"` on `Verify payee`.

- [ ] **Step 2: Add result and error semantics**

Keep the validation/error alert inline. Give the rendered result a stable class and `role="status"` so the returned outcome is announced without changing its existing content.

- [ ] **Step 3: Scope spacing styles**

Add Lab 3-specific classes for the form card, fields grid, shortcut divider, and result panel. Use a media query to stack fields below the mobile breakpoint. Increase the gap before the decision drill without changing other labs.

- [ ] **Step 4: Run Lab 3 tests and build**

Run:

```bash
npm test -- --no-file-parallelism src/features/learn/labs/Lab3Content.test.tsx
npm run build
```

Expected: focused tests pass and TypeScript/Vite build exits successfully.

### Task 4: Full verification and browser smoke test

**Files:**
- Inspect only: `frontend/src/features/learn/labs/Lab3Content.tsx`, `frontend/src/features/learn/labs/LabContent.css`, and related tests.

**Interfaces:**
- Consumes: Completed Tasks 1–3.
- Produces: Verified implementation with no regressions.

- [ ] **Step 1: Run the full frontend test suite**

```bash
npm test -- --no-file-parallelism
```

Expected: zero failures.

- [ ] **Step 2: Run the production build and whitespace check**

```bash
npm run build
git diff --check
```

Expected: build succeeds and `git diff --check` reports no errors.

- [ ] **Step 3: Verify the live Lab 3 flow**

Open `/app/learn/lab-3`, confirm both inputs are editable, enter an IBAN and name, submit, and confirm the VoP result appears below the form. Click a scenario shortcut and confirm it fills the name without making a request. Check the layout at desktop and narrow widths.
