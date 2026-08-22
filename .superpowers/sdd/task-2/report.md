# Task 2 implementation report

## Result

Implemented the Learn Case Desk Launchpad integration. `LearnIndexPage` now loads the existing `CASE_CATALOG` sessions once, adds stable catalog indices, and passes the snapshots through the completed `selectDominantCase` selector. The retired all-cases grid and standalone practice strip are no longer in the active render path.

## RED evidence

Added `frontend/src/features/learn/LearnCaseLaunchpad.test.tsx` before production wiring. The first focused run failed because the new `LearnCaseLaunchpad` module did not yet exist:

```text
Error: Failed to resolve import "./LearnCaseLaunchpad"
Test Files  0 passed
Tests       0
```

This established the pre-implementation failure for the new component boundary. After the component was added, the focused assertions ran and drove the implementation.

## GREEN evidence

Focused verification:

```text
Test Files  4 passed
Tests       53 passed
```

Command:

```sh
cd frontend
npm test -- --run src/features/learn/LearnCaseLaunchpad.test.tsx src/features/learn/LearnIndexPage.test.tsx src/features/learn/cases/caseRoutes.test.tsx src/features/learn/cases/accessibility.test.tsx
```

Build and responsive Learn Playwright verification also passed:

```text
npm run build                 passed
Playwright: 9 passed
Projects: desktop, case-desktop-1024, case-mobile-390
```

## Changed files

- `frontend/src/features/learn/LearnCaseLaunchpad.tsx` — new launchpad component with active, secondary, practice, safe alternatives, list semantics, and route links.
- `frontend/src/features/learn/LearnCaseLaunchpad.test.tsx` — focused launchpad coverage for active/resume, fallback, secondary cases, under-review alternatives, list structure, routes, and legacy markup absence.
- `frontend/src/features/learn/LearnIndexPage.tsx` — selector wiring, launchpad integration, and stable `technical-labs` anchor.
- `frontend/src/features/learn/LearnPage.css` — Relay-token launchpad layout and responsive behavior for 1024px and 390px requirements.
- `frontend/src/features/learn/LearnIndexPage.test.tsx` — updated production presentation expectations.
- `frontend/src/features/learn/cases/caseRoutes.test.tsx` — updated production grouping expectations while retaining case route and state coverage.

`CaseEntry.tsx` required no behavioral changes: its existing Start/Resume/Review actions, listitem ownership, and under-review safe alternative are reused directly.

## Self-review

- Dominant selection is delegated to `selectDominantCase`; no ranking logic was duplicated.
- Case sessions remain read-only and loaded once through the existing `loadCaseSession` path.
- Active and secondary containers explicitly use `role="list"`; `CaseEntry` continues to own `role="listitem"`.
- Practice remains a real `/learn/practice` route, and Cases, Technical labs, and Practice are exposed as links.
- No active empty case panel is rendered when the selector returns `null`; practice, routes, and the technical-lab anchor remain useful, while under-review entries retain their verified lab alternative.
- No changes were made to Explore, Operate, backend contracts, dependencies, AppShell, Overview, or Case Desk internals.

## Concerns

- The existing production build reports its pre-existing large-chunk warning; this task did not add dependencies or alter bundle strategy.
- The initial RED was a module-resolution failure because the new component file intentionally did not exist yet; the subsequent focused run provided the feature-level assertions and all passed.

## Commit

`cdd11d5 feat: build learn case desk launchpad`

## Review fix

Added the two focused regression tests requested in review:

- `LearnIndexPage.test.tsx` now verifies production wiring by asserting that the rendered `Technical labs` navigation link targets `#technical-labs` and that the actual `id="technical-labs"` element is present in the same page render.
- `LearnCaseLaunchpad.test.tsx` now injects a session-level `under_review` case session and verifies that the stale-draft message and related `Which Rail? Payment Schemes` alternative remain visible.

No production behavior or production files were changed.

Focused verification:

```sh
cd frontend
npm test -- --run src/features/learn/LearnCaseLaunchpad.test.tsx src/features/learn/LearnIndexPage.test.tsx src/features/learn/cases/caseRoutes.test.tsx src/features/learn/cases/accessibility.test.tsx
```

Result: `Test Files 4 passed (4)` and `Tests 55 passed (55)`.
