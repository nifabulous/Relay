# Task 3 — Learn module page restyle

## Status

Implemented and verified on `codex/redesign-remaining-pages`.

## What changed

- Added a token-based module badge, title/subtitle hierarchy, duration metadata, and accessible completion progress meter.
- Added a responsive lesson outline derived from the existing curriculum outcomes. Items expose completed, current, and upcoming states through text, shape, color, `data-state`, and `aria-current`.
- Grouped existing outcomes, lab completion checklist, and lazy-loaded registry content inside a bounded content-card treatment with a duration footer.
- Added responsive layout rules: two columns at 1024px+, stacked outline/content below that breakpoint, and narrow-screen progress wrapping.
- Added a focused test covering the new badge, progress meter, lesson outline, and content region.
- Preserved curriculum, lab registry, checkpoint completion, persistence, telemetry, and module navigation behavior.

## Verification

- `cd frontend && npx vitest run src/features/learn/LearnModulePage.test.tsx` — 7 tests passed.
- `cd frontend && npm test` — 95 test files / 1,381 tests passed.
- `git diff --check` — clean.

## Notes

The module data model currently persists completion at module/checkpoint granularity, not individual lesson granularity. The outline therefore marks the first outcome current while a module is in progress and marks all outcomes complete once the existing module completion gate is reached; no new progress state was introduced.

## Fix round 1 (review findings)

- Lifted `useLabCompletion` into `LearnModulePage`; checkpoint state now drives the header meter and lesson outline while the lab renderer receives `markCheckpoint` and the completed set.
- Derived rounded checkpoint progress and checkpoint-indexed complete/current/upcoming lesson states; preserved no-checkpoint fallback, telemetry, persistence, and one-shot completion semantics. Outline keys now use indexes.
- Added focused coverage for partial 50% progress and checkpoint-derived lesson states.

Verification:

- `cd frontend && npx vitest run src/features/learn/LearnModulePage.test.tsx` — 7 tests passed.
- `cd frontend && npm test` — 95 test files / 1,381 tests passed.
- `cd frontend && npm run build` — TypeScript check and Vite build passed (existing chunk-size warning only).
- `git diff --check` — clean.
