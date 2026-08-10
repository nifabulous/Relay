# Honest Learn Duration Ranges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace misleading exact Learn module durations with validated self-paced ranges shown consistently in the curriculum and module headers.

**Architecture:** Store duration as `{ min, max }` in the curriculum model. Expose one pure `formatDuration` helper and one accessible-label helper so the Learn index and module page cannot drift.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Vite.

## Global Constraints

- Display ranges such as `15–20 min` for unequal bounds.
- Accessible labels must say `Estimated time: 15 to 20 minutes`.
- Estimates include required reading and checkpoints, excluding optional exploration.
- No telemetry or measured timing is added in this change.
- Minimum and maximum must be positive integers, with maximum greater than or equal to minimum.

---

### Task 1: Add the duration range model and formatter

**Files:**
- Modify: `frontend/src/features/learn/curriculum.ts`
- Test: `frontend/src/features/learn/curriculum.test.ts`

**Interfaces:**
- Produce `DurationRange`, `formatDuration(range)`, and `formatDurationAriaLabel(range)`.
- Preserve `CURRICULUM`, `getModuleById`, `getPrerequisiteChain`, and `isModuleUnlocked` exports.

- [ ] **Step 1: Write failing formatter and validation tests**

Add:

```ts
expect(formatDuration({ min: 15, max: 20 })).toBe("15–20 min");
expect(formatDuration({ min: 15, max: 15 })).toBe("15 min");
expect(formatDurationAriaLabel({ min: 15, max: 20 })).toBe(
  "Estimated time: 15 to 20 minutes",
);
for (const module of CURRICULUM) {
  expect(module.duration.min).toBeGreaterThan(0);
  expect(module.duration.max).toBeGreaterThanOrEqual(module.duration.min);
}
```

Run: `cd frontend && npm test -- --run src/features/learn/curriculum.test.ts`

Expected: FAIL because duration is currently a number and the helpers do not exist.

- [ ] **Step 2: Implement the range model and authored estimates**

Add:

```ts
export interface DurationRange {
  min: number;
  max: number;
}

export function formatDuration(range: DurationRange): string {
  return range.min === range.max
    ? `${range.min} min`
    : `${range.min}–${range.max} min`;
}

export function formatDurationAriaLabel(range: DurationRange): string {
  return range.min === range.max
    ? `Estimated time: ${range.min} minutes`
    : `Estimated time: ${range.min} to ${range.max} minutes`;
}
```

Change every curriculum duration to:

```ts
duration: { min: 10, max: 15 },
```

Use the approved values: lab-1 `10–15`, lab-2 `15–20`, lab-3 `15–20`, lab-4
`10–15`, lab-5 `15–20`, lab-6 `10–15`, lab-7 `15–20`, lab-8 `15–20`, lab-9
`25–35`, gbp-eur-rails `25–35`, cad-rails `20–25`, fees-fx `15–20`, and
capstone `30–45`.

- [ ] **Step 3: Run curriculum tests**

Run the focused curriculum test. Expected: PASS.

### Task 2: Use the formatter in both Learn surfaces

**Files:**
- Modify: `frontend/src/features/learn/LearnIndexPage.tsx`
- Modify: `frontend/src/features/learn/LearnModulePage.tsx`
- Test: `frontend/src/features/learn/LearnModulePage.test.tsx` if present, otherwise add `frontend/src/features/learn/curriculum.test.ts` render coverage.

**Interfaces:**
- Consume `formatDuration` and `formatDurationAriaLabel` from `curriculum.ts`.

- [ ] **Step 1: Write failing render assertions**

Assert the curriculum list contains `15–20 min` for lab-3 and the module header
contains `Estimated time: 15 to 20 minutes` on the lab-3 route.

Run the focused Learn page test. Expected: FAIL because the UI interpolates a
number with `min`.

- [ ] **Step 2: Replace direct duration interpolation**

Use:

```tsx
<span className="learn-module__duration">
  {formatDuration(mod.duration)}
</span>
```

and:

```tsx
<span
  className="learn-module-header__duration"
  aria-label={formatDurationAriaLabel(mod.duration)}
>
  {formatDuration(mod.duration)}
</span>
```

- [ ] **Step 3: Run Learn page tests**

Expected: PASS with no remaining `mod.duration` numeric interpolation.

### Task 3: Full verification

**Files:**
- No source changes expected; adjust only failing tests discovered above.

- [ ] **Step 1: Search for stale exact-duration consumers**

Run: `rg -n "duration} min|duration} minutes|duration: [0-9]" frontend/src/features/learn`

Expected: no stale UI interpolation or numeric duration declarations remain.

- [ ] **Step 2: Run the complete frontend test suite and build**

Run: `cd frontend && npm test -- --run && npm run build`

Expected: all tests and the production build PASS.
