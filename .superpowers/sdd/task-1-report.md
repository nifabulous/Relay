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
