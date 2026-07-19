# Overview / Explore Data-Truth — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan
**Covers backlog items:** #8 (progress source-of-truth), #7a (recent activity), #7b (Explore Schemes page)

## Problem

Three related defects on the Overview and Explore surfaces, all rooted in how local
learner data is (mis)used:

1. **#8 — the Overview progress bar always shows 0/N.** `OverviewPage` calls
   `GET /api/progress` with **no query parameter**, so the stateless backend computes
   progress from an empty completed-list and always returns `completed_count: 0`,
   `percentage: 0`. The real local source (`loadProgress().completedModuleIds`) is read
   but only used for the first-visit check. Two further mismatches compound it: the
   frontend stores IDs as `lab-1`…`lab-8`/`capstone`, while the backend catalogue uses
   `"1"`…`"7"`/`"capstone"` (numeric, and **missing lab-8**).

2. **#7a — "recent activity" is a permanent placeholder.** There is no server event log
   (confirmed: no activity/events endpoint) and local storage records no timestamps or
   activity — only `completedModuleIds`. So the section can never populate.

3. **#7b — Explore → Schemes is a redirect stub.** It tells the user to go to Operate
   instead of showing scheme data, even though `/api/schemes?currency=X` already serves it
   (and now carries a `verifiedAsof` stamp).

## Governing principle

**Local `relay:progress.completedModuleIds` is the single source of truth for learning
progress.** The backend `/api/progress` is a stateless calculator (its own docstring:
"The frontend is the source of truth… we just compute the derived summary"). We stop
treating it as an independent source and use it only for the one thing it uniquely
provides — badges — fed the correct IDs.

## Non-goals

- No server-side progress persistence (the model stays: client is authoritative).
- No new backend event/activity store — recent activity is local-only.
- No cross-currency mega-matrix for Schemes (single-currency table; `/api/schemes` serves
  one currency per call).
- Not touching the Learn lab completion/checkpoint mechanism itself — only reading its
  output and recording an activity entry alongside it.

## Part A — Progress source-of-truth (#8)

### A1. Client-side progress computation

New pure helper (co-located with the curriculum logic it depends on):
`frontend/src/features/learn/curriculum.ts` gains:

```ts
export interface ProgressStats {
  completedCount: number;
  totalCount: number;
  percentage: number;      // 0–100, integer
  nextModuleId: string | null;
}

export function computeProgress(completedIds: string[]): ProgressStats;
```

- `totalCount` = `CURRICULUM.length` (includes lab-8).
- `completedCount` = count of `completedIds` that are real curriculum module ids
  (ignore unknowns).
- `percentage` = `Math.round(completedCount / totalCount * 100)` (0 when total is 0).
- `nextModuleId` = existing `getNextModule(completedIds)?.id ?? null`.

### A2. OverviewPage uses local data for count / % / next

`OverviewPage` derives the displayed progress row and next-module CTA from
`computeProgress(loadProgress().completedModuleIds)` instead of `progressQuery.data`.
The always-0 bug disappears and lab-8 counts. `isFirstVisit` stays as-is
(`completedModuleIds.length === 0`).

### A3. Badges, fed correctly

Badges remain server-computed but are now fed the learner's real IDs, mapped to backend
ids:

- New map in the frontend (co-located with the progress query, e.g.
  `frontend/src/features/overview/badgeIds.ts`):
  ```ts
  // Frontend curriculum id -> backend progress-service module id.
  export function toBackendModuleId(labId: string): string; // "lab-1"->"1" … "lab-7"->"7", "lab-8"->"8", "capstone"->"capstone"
  ```
- The Overview badges query calls
  `GET /api/progress?completed=${localIds.map(toBackendModuleId).join(",")}`.
- Backend: add `"8"` to `ALL_MODULE_IDS` in `app/services/progress.py` so the catalogue
  and any "complete all / complete N labs" badge rule accounts for lab-8. Confirm no badge
  rule hard-codes a total that would now be wrong; adjust the one badge (if any) that
  encodes the lab count.
- The Overview count/percentage no longer read from this response — only the badges.

### A4. Boundaries

- `computeProgress` is pure, depends only on `CURRICULUM`; unit-testable in isolation.
- `toBackendModuleId` is a pure total function.
- Backend change is data-only (catalogue list + at most one badge threshold).

## Part B — Recent activity (#7a)

### B1. Local activity log

Extend `frontend/src/lib/persistence/storage.ts`:

```ts
export interface RelayActivityEntry {
  type: "module" | "tool";
  label: string;   // e.g. "Lab 3: Verification of Payee" or "Fee simulator"
  at: number;      // epoch ms (Date.now())
}
export interface RelayActivityLog {
  schemaVersion: 1;
  entries: RelayActivityEntry[]; // newest-first, capped
}

export function loadActivity(): RelayActivityLog;      // corrupt/absent -> empty
export function recordActivity(entry: RelayActivityEntry): void; // prepend, cap at 20, save
```

- New storage key `relay:activity`, versioned like the others; corrupt data is discarded
  (reuse the existing `safeLoad`/`safeSave` pattern).
- Cap: keep the 20 newest entries.

### B2. Record points

- **Module completion:** in `LearnModulePage` where a module is marked complete and
  `saveProgress` runs, also call `recordActivity({ type: "module", label: <module title>, at: Date.now() })`.
  Record once per completion (guard against re-recording an already-completed module — a
  module that is already in `completedModuleIds` before this completion does not log
  again).
- **Tool runs:** each Operate tool page records on a *successful* run (its mutation/query
  `onSuccess`): Prepare, Fee, Screening, ValueDate, STP, Tracking →
  `recordActivity({ type: "tool", label: <tool name>, at: Date.now() })`.

### B3. Overview rendering

The existing `overview__activity` section renders `loadActivity().entries` newest-first:
each row shows the label, a small type tag (Module / Tool), and a relative time
("2 min ago") computed from `at`. When `entries` is empty, keep the current empty-state
copy. A tiny pure `relativeTime(at, now)` helper (frontend) formats the timestamp; it
takes `now` as an argument so it is deterministically testable.

## Part C — Explore Schemes page (#7b)

`SchemesPage` becomes a reference tool:

- A currency picker (the set of currencies with scheme data — the same 10 currencies the
  `/api/schemes` list-all returns; reuse the pill/select pattern already used in
  `Lab7Content`).
- On selection, `GET /api/schemes?currency=X` validated by `SchemesResponseSchema`.
- Render a comparison table: one row per scheme with Name, Speed, Limit, Cost, Use case,
  Operator; below it the `verifiedAsof` caption ("Rail data verified as of YYYY-MM…").
- Wrap the fetch in `AsyncRegion` so idle/loading/error/empty states are handled
  consistently with the rest of the app. Keep the SIMULATION/educational framing.

This page is a *reference* (Explore), distinct from Lab 7's guided lesson; they may share
the `SchemeInfo` rendering shape but not state.

## Data flow

```
completedModuleIds (local, single source)
   ├─ computeProgress(...)            -> Overview count / % / next CTA
   └─ map(toBackendModuleId) -> GET /api/progress?completed=... -> badges only

module complete / tool success -> recordActivity() -> relay:activity (local)
   -> Overview recent-activity list

Schemes page: currency -> GET /api/schemes?currency=X -> table + verifiedAsof
```

## Error handling

- `computeProgress`, `toBackendModuleId`, `relativeTime` are pure and total (no throw).
- Badges query failure degrades gracefully: Overview still shows local progress; the
  badges area shows its existing loading/empty treatment (progress count never depends on
  it).
- Activity storage: corrupt/absent → empty log (never throws), matching existing
  persistence behavior.
- Schemes page: `AsyncRegion` renders error + retry; a 404 for an unknown currency shows
  the empty/unavailable state.

## Testing

**Frontend (Vitest + RTL + MSW):**
- `computeProgress`: 0-of-9, some complete, all complete (100%), unknown ids ignored,
  lab-8 counted, `nextModuleId` correctness.
- `toBackendModuleId`: each mapping incl. `lab-8`→`"8"` and `capstone`.
- Overview: progress row reflects local `completedModuleIds` (not the server 0); badges
  query is issued with the mapped `?completed=` string (assert the request URL via MSW).
- Activity storage: `recordActivity` prepends, caps at 20, survives corrupt data;
  `loadActivity` on absent key returns empty.
- Module completion records exactly one activity entry (and not for an already-complete
  module); a tool page records on success.
- `relativeTime(at, now)`: "just now" / "N min ago" / "N h ago" / date fallback.
- `SchemesPage`: renders the table + `verifiedAsof` on success; loading/error/empty via
  `AsyncRegion`; currency switch refetches.

**Backend (pytest):**
- `ALL_MODULE_IDS` includes `"8"`; `get_progress_summary(["1".."8","capstone"])` counts
  lab-8 and any lab-count badge accounts for it.

## Rollout / sequencing

One commit per task, `type(scope): description`; TDD; additive. Suggested task order:
1. `computeProgress` + tests.
2. `toBackendModuleId` + backend `ALL_MODULE_IDS` "8" + tests.
3. OverviewPage wired to local progress + mapped badges query.
4. Activity storage (`loadActivity`/`recordActivity`) + tests.
5. Record points (LearnModulePage + the 6 tool pages) + tests.
6. Overview recent-activity rendering + `relativeTime` + tests.
7. Explore SchemesPage table + AsyncRegion + tests.

## Open questions

None blocking. The one judgement call — which badge rule (if any) hard-codes a lab total
— is resolved at implementation time by reading `app/services/progress.py`'s badge
definitions; if none encode a fixed count, the backend change is just adding `"8"` to the
catalogue.
