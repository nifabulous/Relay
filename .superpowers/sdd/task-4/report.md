# Task 4 — Operate Guided Payment Builder

Date: 2026-08-22

## Implementation

- Added `PrepareRequestState` with the exact `idle | validating | checking | success | partial | error | stale` union.
- Added pure request-state derivation, explicit unavailable/not-checked detection, and stage mapping helpers. Active validation and requests take precedence over stale results; request errors take precedence over an old result; empty optional arrays do not produce `partial`.
- Added the accessible three-stage indicator (`Payment details`, `Run checks`, `Review route`) with `aria-current="step"` and a stable polite live status.
- Updated page copy to `Prepare a payment` and `Prepare, validate, and understand a simulated payment.`.
- Added a `role="alert"` validation summary with field links while retaining field-level `aria-describedby` errors and first-invalid focus.
- Preserved one `/api/prepare-payment` mutation, duplicate-submit guard, manual request retry, RHF behavior, API schemas, recommendation state, check statuses, SSI/currency behavior, and simulation-only framing.
- Debounced settled BIC input before SSI lookup while retaining fallback currency choices and explicit SSI retry.
- Added dominant-form/supporting-context layout at 1024px+, stacked layout below 1024px, and a 44px full-width mobile sticky action with safe-area padding and reserved space.
- Updated focused page and browser coverage for copy, stages, validation, checking, partial results, request retry, SSI debounce, simulation-only wording, and mobile action reachability.

## TDD evidence

1. Added `prepareRequestState.test.ts` first.
2. Ran the expected RED command:

   `npm test -- --run src/features/operate/prepare/prepareRequestState.test.ts`

   Result: failed because `./prepareRequestState` did not exist yet.
3. Implemented the pure helper module; the helper suite then passed 14/14.
4. Added page regressions and fixed the existing duplicate-text assertion introduced by the validation summary.

## Verification

- Focused Vitest: **38/38 passed** across 2 files.
- Production build: **passed** (`tsc --noEmit && vite build`). Vite emitted the existing non-blocking large-chunk warning.
- Operate Playwright smoke run: **5/5 passed** with `--project=desktop --workers=1`. This included the 390px sticky-action test.
- Full browser viewport matrix was intentionally not run to keep the requested scope/time bound; 768px, 1024px, 1440px, and reduced-motion browser projects remain for follow-up verification.
- `git diff --check`: passed before report/commit finalization.

## Scope notes

Only the requested Operate page, stylesheet, focused tests, browser suite, new state helper/tests, and this report are intended for the Task 4 commit. Existing unrelated worktree changes (`task-3/report.md` and the untracked shared plan) are left untouched and excluded from the commit. No backend, schema, AppShell, dependency manifest, or generated output changes were added.

## Fix / TDD

- Addressed the Luna review P1 stale-validation finding with an explicit `hasValidationError` presentation signal. Active validation/request/error states retain their required `validating`/`checking`/`error` semantics; a completed validation error maps the current stage to `Payment details` even when the prior result is stale. Added the page regression for a valid result → edited stale form → invalid re-submit.
- Addressed the Luna review P1 mobile sticky-action finding by offsetting the action above `var(--nav-height-mobile)` plus safe-area inset and reserving the combined action/nav space. Added a 390px after-scroll geometry assertion that the action and button remain above the fixed shell nav, the result remains reachable, and the button can be clicked.
- Extended `frontend/e2e/prepare.spec.ts` with production-route browser scenarios for success, explicit `NOT_CHECKED` partial, 503 request error/retry, stale re-check with current request payload, and mobile result/action reachability. Deterministic `page.route` handlers control only the API responses; navigation remains `/app/operate/prepare`.

TDD evidence:

1. RED: the new helper and stale-invalid-submit regressions failed (the stage mapper returned `Review route`, and the page kept Review current).
2. GREEN: focused Vitest passed **40/40** across `prepareRequestState.test.ts` and `PreparePaymentPage.test.tsx`.
3. Production build passed (`tsc --noEmit && vite build`); Vite emitted the existing large-chunk warning.
4. Prepare browser matrix passed **40/40** across `desktop`, `case-mobile-390`, `case-tablet-768`, and `case-desktop-1024`.
5. `git diff --check` passed.
