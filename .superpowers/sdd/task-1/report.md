# Task 1 implementation report: deterministic dominant-case selector

## Outcome

Implemented the pure `selectDominantCase` Learn selector. It chooses in-progress cases by newest valid `updatedAt`, uses catalog `index` for deterministic ties and unavailable timestamps, falls back to the first actionable fresh case, and then selects the newest completed case for review. Empty and unavailable catalogs return `null`.

The selector imports the existing `AuthoredCaseDefinition` and `CaseSession` types, performs no storage access, and does not change UI code or introduce a new data model.

## TDD evidence

### RED

Tests were written first in `frontend/src/features/learn/cases/selectDominantCase.test.ts` and run with:

```sh
cd frontend
npm test -- --run src/features/learn/cases/selectDominantCase.test.ts
```

Expected RED result:

```text
FAIL src/features/learn/cases/selectDominantCase.test.ts
Error: Failed to resolve import "./selectDominantCase"
```

This confirmed the focused test targeted the missing selector module before production implementation existed.

### GREEN

After implementing the smallest pure selector, the same focused command passed:

```text
Test Files  1 passed (1)
Tests       7 passed (7)
```

## Verification

- Focused selector test: 1 file, 7 tests passed.
- Existing Learn case tests: 9 files, 356 tests passed.
- `npm run build`: passed (`tsc --noEmit` and Vite build).
- `git diff --check`: passed.

The build reports an existing Vite warning about chunks larger than 500 kB. No task files caused or addressed that warning.

## Changed files

- `frontend/src/features/learn/cases/selectDominantCase.ts` — pure selector and required `CaseEntrySnapshot` interface.
- `frontend/src/features/learn/cases/selectDominantCase.test.ts` — coverage for all required selection rules, including explicit catalog-index tie-breaking.
- `.superpowers/sdd/task-1/report.md` — this implementation report.

## Self-review

- Selection precedence follows the brief: in-progress, fresh, then completed review.
- Invalid, empty, or missing timestamps are older than valid timestamps.
- Equal timestamps and unavailable timestamps use the explicit catalog `index`, not input iteration order.
- Catalog-level `under_review` entries are excluded only from fresh fallback; completed entries remain eligible for review, and in-progress sessions retain the highest-priority behavior specified by step 1.
- Empty input and all-under-review input with no completed session return `null`.
- No localStorage, rendering, UI changes, dependencies, or unrelated refactors were added.

## Concerns

- The build’s pre-existing large-chunk warning remains, but the build exits successfully and is unrelated to Task 1.
- The worktree contained an unrelated untracked plan file at `docs/superpowers/plans/2026-08-22-learn-explore-operate-workspace-redesign-implementation.md`; it was intentionally left unchanged and uncommitted.
