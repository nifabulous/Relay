# Task 1 — Case Desk visual pass

## Implemented

- Added a token-based Case Desk workflow rail with completed, current, and locked states, progress metadata, progress bar, accessible current-step semantics, and reduced-motion handling.
- Added case title and supporting investigation copy while preserving the existing phase heading used by focus management and tests.
- Reworked desktop investigation layout into a progress rail plus two bounded work surfaces (task/recommendation and evidence), with single-column/tablet fallbacks.
- Added selected-rail visual treatment, evidence section dividers, and visible focus states using existing Relay tokens.
- Preserved all reducer, evaluator, persistence, routes, and control semantics.

## Files changed

- `frontend/src/features/learn/cases/CaseDesk.tsx`
- `frontend/src/features/learn/cases/CaseDesk.css`
- `frontend/src/features/learn/cases/EvidenceRail.css`
- `frontend/src/features/learn/cases/RailShortlist.css`

## Tests

- `cd frontend && npx vitest run src/features/learn/cases` — could not start because the worktree has no installed frontend dependencies (`vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, and `@sentry/vite-plugin` unresolved).
- `git diff --check` — passed.

## Self-review

- New styling is token-only for color, spacing, radius, type, and motion; no hardcoded color values or dependencies were added.
- Existing accessibility targets and focus destinations remain intact; workflow adds `aria-current` and a labelled progressbar.
- No business logic or route behavior changed.

## Concerns

- Full and focused Vitest suites require dependency installation in the shared frontend environment before they can run.

## Fix round 1 (review findings)

- Important 1: Reassigned the desktop split's evidence surface to the middle grid column and task/recommendation surface to the right column. The DOM order remains task before evidence for keyboard traversal; mobile/tablet stacking is unchanged.
- Important 2: Added a token-styled, read-only transaction-under-review summary that maps amount, currency, decline code, beneficiary BIC, and scheme facts when authored, plus an evidence timeline sourced from visible fact claim verification dates. Both sections gracefully omit when no matching data exists, and hidden requestable values remain undisclosed.
- Important 3 / Minor 2: Initial investigation now presents Step 1 (Evidence collected) as current at 20% progress with no duration estimate. Later investigation remains Step 3 and uses neutral “In progress” text; the fabricated “12 min remaining” label is removed.
- Minor 1: Replaced the non-token `font-weight: 650` with standard token-consistent `600`.
- Added regression coverage in `EvidenceRail.test.tsx` and `CaseDesk.test.tsx`; updated two existing exact-text/broad-heading selectors to account for the new summary/timeline presentation.

### Verification

- `cd frontend && npx vitest run src/features/learn/cases` — passed: 10 files, 360 tests.
- `cd frontend && npm test` — passed: 95 files, 1,379 tests.
