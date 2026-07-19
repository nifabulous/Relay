# Overview / Explore Data-Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Overview progress bar (always 0/N), populate "recent activity" from a new local log, and turn the Explore→Schemes stub into a real rails table — with local `completedModuleIds` as the single source of truth for progress.

**Architecture:** Progress count/%/next computed client-side from `CURRICULUM`; the stateless `/api/progress` is called only for badges, fed correctly-mapped ids. A new capped local activity log records module completions + tool runs. The Schemes stub becomes a currency-picker + `AsyncRegion` table over the existing `/api/schemes`.

**Tech Stack:** React 19, TypeScript 7 strict, TanStack Query 5, Zod 4, Vitest 4 + RTL + MSW; Python 3.9+/FastAPI/pytest (one data-only backend change).

## Global Constraints

- **Single source of truth:** local `relay:progress.completedModuleIds`. `/api/progress` is a stateless calculator used only for badges.
- **TypeScript 7 strict**; match existing patterns (Zod `.catch/.passthrough`, `AsyncRegion`, `safeLoad/safeSave`).
- **Python 3.9+** for the backend change; `List[...]` typing.
- **TDD**; failing test first. **No new dependencies.**
- **One commit per task**, `type(scope): description`; end body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Purity:** `computeProgress`, `toBackendModuleId`, `relativeTime` are pure and total (never throw).
- **Additive/non-breaking:** existing lab completion + checkpoint mechanism untouched; storage stays versioned (`schemaVersion: 1`, corrupt-discard).
- **Verify commands:** frontend from `frontend/` — `npm test -- --run <path>` and `npx tsc --noEmit`; backend from repo root in venv — `source .venv/bin/activate && python -m pytest tests/ -q && ruff check app/`.

---

## Task 1: `computeProgress` client-side progress helper

**Files:**
- Modify: `frontend/src/features/learn/curriculum.ts` (append)
- Test: `frontend/src/features/learn/curriculum.test.ts` (append)

**Interfaces:**
- Consumes: existing `CURRICULUM`, `getModuleById`, `getNextModule` in the same file.
- Produces:
  ```ts
  export interface ProgressStats { completedCount: number; totalCount: number; percentage: number; nextModuleId: string | null; }
  export function computeProgress(completedIds: string[]): ProgressStats;
  ```

- [ ] **Step 1: Write the failing test** — append to `curriculum.test.ts`:

```ts
import { computeProgress } from "./curriculum";

describe("computeProgress", () => {
  it("reports 0% for a fresh learner and points at lab-1", () => {
    const s = computeProgress([]);
    expect(s.completedCount).toBe(0);
    expect(s.totalCount).toBe(CURRICULUM.length);
    expect(s.percentage).toBe(0);
    expect(s.nextModuleId).toBe("lab-1");
  });

  it("counts completed modules including lab-8 and ignores unknown ids", () => {
    const s = computeProgress(["lab-1", "lab-2", "lab-8", "bogus"]);
    expect(s.completedCount).toBe(3);
    expect(s.percentage).toBe(Math.round((3 / CURRICULUM.length) * 100));
  });

  it("reaches 100% when every module is complete", () => {
    const all = CURRICULUM.map((m) => m.id);
    const s = computeProgress(all);
    expect(s.completedCount).toBe(CURRICULUM.length);
    expect(s.percentage).toBe(100);
    expect(s.nextModuleId).toBeNull();
  });
});
```

(`CURRICULUM` is already imported at the top of `curriculum.test.ts` from Task 5 of the earlier lab-8 work; if not, add `import { CURRICULUM } from "./curriculum";`.)

- [ ] **Step 2: Run to verify it fails** — `npm test -- --run src/features/learn/curriculum.test.ts` → FAIL (`computeProgress` undefined).

- [ ] **Step 3: Implement** — append to `curriculum.ts`:

```ts
export interface ProgressStats {
  completedCount: number;
  totalCount: number;
  percentage: number;
  nextModuleId: string | null;
}

/**
 * Derive progress from the local list of completed module ids. Local storage
 * is the single source of truth; this is a pure function over CURRICULUM.
 */
export function computeProgress(completedIds: string[]): ProgressStats {
  const totalCount = CURRICULUM.length;
  const completedCount = CURRICULUM.filter((m) => completedIds.includes(m.id)).length;
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const nextModuleId = getNextModule(completedIds)?.id ?? null;
  return { completedCount, totalCount, percentage, nextModuleId };
}
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/learn/curriculum.ts frontend/src/features/learn/curriculum.test.ts
git commit -m "feat(learn): computeProgress client-side progress helper (#8)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: id mapping + backend catalogue includes lab-8

**Files:**
- Create: `frontend/src/features/overview/badgeIds.ts`
- Test: `frontend/src/features/overview/badgeIds.test.ts`
- Modify: `app/services/progress.py` (`ALL_MODULE_IDS`, the `payment-operator` badge)
- Test: `tests/test_progress.py` (append; create if absent)

**Interfaces:**
- Produces: `export function toBackendModuleId(labId: string): string;` — `lab-1`→`"1"` … `lab-8`→`"8"`, `capstone`→`"capstone"`, anything else returned unchanged.
- Backend: `ALL_MODULE_IDS` gains `"8"`; the `payment-operator` badge requires all 8 labs.

- [ ] **Step 1: Write the failing frontend test** — `frontend/src/features/overview/badgeIds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toBackendModuleId } from "./badgeIds";

describe("toBackendModuleId", () => {
  it("maps lab ids to their numeric backend id", () => {
    expect(toBackendModuleId("lab-1")).toBe("1");
    expect(toBackendModuleId("lab-8")).toBe("8");
  });
  it("passes capstone and unknown ids through unchanged", () => {
    expect(toBackendModuleId("capstone")).toBe("capstone");
    expect(toBackendModuleId("fees")).toBe("fees");
  });
});
```

- [ ] **Step 2: Write the failing backend test** — append to (or create) `tests/test_progress.py`:

```python
def test_all_module_ids_includes_lab_8():
    from app.services.progress import ALL_MODULE_IDS
    assert "8" in ALL_MODULE_IDS


def test_payment_operator_badge_requires_all_eight_labs():
    from app.services.progress import get_progress_summary
    # Labs 1-7 + capstone but NOT lab-8 -> operator badge not yet earned.
    seven = get_progress_summary(["1", "2", "3", "4", "5", "6", "7", "capstone"])
    assert "payment-operator" not in {b.id for b in seven.earned_badges}
    # All 8 labs + capstone -> earned.
    eight = get_progress_summary(["1", "2", "3", "4", "5", "6", "7", "8", "capstone"])
    assert "payment-operator" in {b.id for b in eight.earned_badges}
```

- [ ] **Step 3: Run both to verify they fail**
  - Frontend: `npm test -- --run src/features/overview/badgeIds.test.ts` → FAIL (module missing).
  - Backend: `python -m pytest tests/test_progress.py -q` → FAIL (`"8"` absent; operator badge earned at 7).

- [ ] **Step 4: Implement the frontend map** — `frontend/src/features/overview/badgeIds.ts`:

```ts
/**
 * Map a frontend curriculum module id to the backend progress-service id.
 * Labs are numeric backend ids ("lab-3" -> "3"); capstone and non-lab ids
 * pass through unchanged.
 */
export function toBackendModuleId(labId: string): string {
  return labId.startsWith("lab-") ? labId.slice(4) : labId;
}
```

- [ ] **Step 5: Implement the backend change** — in `app/services/progress.py`:

Add `"8"` to `ALL_MODULE_IDS` immediately after `"7"`:

```python
    "7",          # Lab 7: Payment Schemes
    "8",          # Lab 8: Message Standards (MT103 -> ISO 20022)
    "capstone",   # Capstone: Full Payment
```

Update the `payment-operator` badge to require all 8 labs:

```python
    Badge(
        id="payment-operator",
        name="Payment Operator",
        description="You can route a payment end-to-end through the full chain.",
        requirement="Complete all 8 labs and the capstone.",
        required_ids=["1", "2", "3", "4", "5", "6", "7", "8", "capstone"],
    ),
```

- [ ] **Step 6: Run both to verify they pass** — frontend test PASS; `python -m pytest tests/test_progress.py -q && ruff check app/` PASS + clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/overview/badgeIds.ts frontend/src/features/overview/badgeIds.test.ts app/services/progress.py tests/test_progress.py
git commit -m "feat(progress): map lab ids to backend + add lab-8 to catalogue (#8)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: OverviewPage uses local progress + mapped badges query

**Files:**
- Modify: `frontend/src/features/overview/OverviewPage.tsx`
- Test: `frontend/src/features/overview/OverviewPage.test.tsx` (create if absent; otherwise append)

**Interfaces:**
- Consumes: `computeProgress` (Task 1), `toBackendModuleId` (Task 2), `loadProgress`, existing `apiKeys.progress`, `ProgressResponseSchema`.
- Produces: no new exports. The progress row + primary CTA are driven by local data; the `/api/progress` query is issued with a mapped `?completed=` string and used only for badges.

- [ ] **Step 1: Write the failing test** — `OverviewPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { OverviewPage } from "./OverviewPage";
import { saveProgress } from "../../lib/persistence/storage";

function renderOverview() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><OverviewPage /></MemoryRouter></QueryClientProvider>,
  );
}

describe("OverviewPage progress", () => {
  beforeEach(() => localStorage.clear());

  it("shows real local progress, not the server's empty count", async () => {
    saveProgress({ schemaVersion: 1, completedModuleIds: ["lab-1", "lab-2", "lab-3"] });
    // Server would (wrongly) return 0 if not fed ids; assert the UI shows local 3.
    renderOverview();
    await waitFor(() => expect(screen.getByText(/3 \//)).toBeInTheDocument());
  });

  it("feeds mapped ids to the badges query", async () => {
    saveProgress({ schemaVersion: 1, completedModuleIds: ["lab-1", "lab-8"] });
    let requestedUrl = "";
    server.use(
      http.get("/api/progress", ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({
          completed_count: 2, total_count: 9, percentage: 22,
          earned_badges: [], next_recommended: null, all_badges: [],
        });
      }),
    );
    renderOverview();
    await waitFor(() => expect(requestedUrl).toContain("completed="));
    expect(requestedUrl).toContain("1");
    expect(requestedUrl).toContain("8");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- --run src/features/overview/OverviewPage.test.tsx` → FAIL (currently the count comes from the unfed server query = 0; no `completed=` param sent).

- [ ] **Step 3: Implement** — edit `OverviewPage.tsx`:

Add imports:

```tsx
import { computeProgress } from "../../features/learn/curriculum";
import { toBackendModuleId } from "./badgeIds";
```

(If the import path for `curriculum` from this file resolves differently, use the correct relative path — `OverviewPage.tsx` is in `features/overview/`, so `../learn/curriculum`.)

Replace the body from `const progress = loadProgress();` through the `action` declaration with:

```tsx
  const progress = loadProgress();
  const stats = computeProgress(progress.completedModuleIds);
  const completedParam = progress.completedModuleIds.map(toBackendModuleId).join(",");

  // Health check
  const healthQuery = useQuery({
    queryKey: apiKeys.health,
    queryFn: () => apiRequest<HealthResponse>("/api/health", undefined, HealthResponseSchema),
  });

  // Badges only — count/%/next come from local `stats`. The endpoint is a
  // stateless calculator, so we feed it the learner's mapped module ids.
  const badgesQuery = useQuery({
    queryKey: [...apiKeys.progress, completedParam],
    queryFn: () =>
      apiRequest<ProgressResponse>(
        `/api/progress?completed=${encodeURIComponent(completedParam)}`,
        undefined,
        ProgressResponseSchema,
      ),
  });

  const isFirstVisit = progress.completedModuleIds.length === 0;
  const curriculumComplete = stats.percentage === 100;

  const action = selectPrimaryAction({
    firstVisit: isFirstVisit,
    curriculumComplete,
    nextModuleId: stats.nextModuleId ?? undefined,
  });
```

Replace the "Your progress" section body (the `progressQuery.isLoading ? … : progressQuery.data ? …` block) with a local-driven row:

```tsx
        <div className="overview__progress-row">
          <span className="overview__progress-count mono">
            {stats.completedCount} / {stats.totalCount}
          </span>
          <span className="overview__progress-label">modules completed</span>
          <div className="overview__progress-bar">
            <div className="overview__progress-fill" style={{ width: `${stats.percentage}%` }} />
          </div>
        </div>
```

Leave the badges available via `badgesQuery.data?.earned_badges` for the existing/future badge UI (if the page renders badges elsewhere, point them at `badgesQuery`; otherwise no badge UI is added here). Remove the now-unused `progressQuery` and any now-unused imports (`ProgressResponse` type stays; drop nothing still referenced). Run `npx tsc --noEmit` to catch unused symbols.

- [ ] **Step 4: Run to verify it passes** — `npm test -- --run src/features/overview/OverviewPage.test.tsx && npx tsc --noEmit` → PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/overview/OverviewPage.tsx frontend/src/features/overview/OverviewPage.test.tsx
git commit -m "fix(overview): drive progress from local source, feed badges mapped ids (#8)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Local activity log (storage)

**Files:**
- Modify: `frontend/src/lib/persistence/storage.ts`
- Test: `frontend/src/lib/persistence/storage.test.ts` (append; create if absent)

**Interfaces:**
- Produces:
  ```ts
  export interface RelayActivityEntry { type: "module" | "tool"; label: string; at: number; }
  export interface RelayActivityLog { schemaVersion: 1; entries: RelayActivityEntry[]; }
  export function loadActivity(): RelayActivityLog;
  export function recordActivity(entry: RelayActivityEntry): void; // prepend, cap 20
  ```
- New storage key `relay:activity`. Reuses `safeLoad`/`safeSave`.

- [ ] **Step 1: Write the failing test** — append/create `storage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadActivity, recordActivity } from "./storage";

describe("activity log", () => {
  beforeEach(() => localStorage.clear());

  it("returns an empty log when absent", () => {
    expect(loadActivity().entries).toEqual([]);
  });

  it("prepends newest-first and caps at 20", () => {
    for (let i = 0; i < 25; i++) recordActivity({ type: "tool", label: `t${i}`, at: i });
    const log = loadActivity();
    expect(log.entries.length).toBe(20);
    expect(log.entries[0].label).toBe("t24"); // newest first
    expect(log.entries[19].label).toBe("t5");
  });

  it("survives corrupt data", () => {
    localStorage.setItem("relay:activity", "{not json");
    expect(loadActivity().entries).toEqual([]);
    recordActivity({ type: "module", label: "Lab 1", at: 1 });
    expect(loadActivity().entries[0].label).toBe("Lab 1");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- --run src/lib/persistence/storage.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `storage.ts`:

Add the key to `STORAGE_KEYS`:

```ts
  activity: "relay:activity",
```

Add after the Progress section:

```ts
// ─── Activity log ─────────────────────────────────────────

export interface RelayActivityEntry {
  type: "module" | "tool";
  label: string;
  at: number; // epoch ms
}
export interface RelayActivityLog {
  schemaVersion: 1;
  entries: RelayActivityEntry[]; // newest-first, capped
}

const ACTIVITY_CAP = 20;
const defaultActivity: RelayActivityLog = { schemaVersion: 1, entries: [] };

export function loadActivity(): RelayActivityLog {
  return safeLoad(STORAGE_KEYS.activity, defaultActivity);
}

export function recordActivity(entry: RelayActivityEntry): void {
  const current = loadActivity();
  const entries = [entry, ...current.entries].slice(0, ACTIVITY_CAP);
  safeSave(STORAGE_KEYS.activity, { schemaVersion: 1, entries });
}
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/persistence/storage.ts frontend/src/lib/persistence/storage.test.ts
git commit -m "feat(persistence): local activity log (loadActivity/recordActivity) (#7a)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Record activity at completion + tool success

**Files:**
- Modify: `frontend/src/features/learn/LearnModulePage.tsx`
- Modify: the six Operate tool pages —
  `features/operate/prepare/PreparePaymentPage.tsx`,
  `features/operate/tools/FeePage.tsx`, `ScreeningPage.tsx`, `ValueDatePage.tsx`, `StpPage.tsx`,
  `features/operate/tracking/TrackingPage.tsx`
- Test: `frontend/src/features/learn/LearnModulePage.test.tsx` (append/create) and one tool test (`OperateTools.test.tsx`, append)

**Interfaces:**
- Consumes: `recordActivity` (Task 4). No new exports.

- [ ] **Step 1: Write the failing tests**

Append to `LearnModulePage.test.tsx` (model the render on the existing tests in that file; if none, use a `MemoryRouter` + `QueryClientProvider` wrapper and route to a module whose checkpoints you can fire):

```tsx
it("records a module activity entry on completion", async () => {
  localStorage.clear();
  // Render lab-1 and complete it (fire its checkpoints), then assert activity.
  // (Use the file's existing helper to complete a module; if it drives completion
  //  via the child lab's onCheckpoint, fire all required checkpoints.)
  // After completion:
  const { loadActivity } = await import("../../lib/persistence/storage");
  await waitFor(() => {
    const labels = loadActivity().entries.filter((e) => e.type === "module").map((e) => e.label);
    expect(labels.some((l) => /Identifiers|BIC/i.test(l))).toBe(true);
  });
});
```

Append to `OperateTools.test.tsx` (reuse its local `renderWithProviders`):

```tsx
it("StpPage records a tool activity entry on a successful check", async () => {
  localStorage.clear();
  renderWithProviders(<StpPage />);
  await userEvent.type(screen.getByLabelText(/transaction reference/i), "REF1");
  await userEvent.type(screen.getByLabelText(/value date/i), "2026-07-20");
  await userEvent.type(screen.getByLabelText(/interbank amount/i), "1000");
  await userEvent.click(screen.getByRole("button", { name: /check stp/i }));
  const { loadActivity } = await import("../../../lib/persistence/storage");
  await waitFor(() =>
    expect(loadActivity().entries.some((e) => e.type === "tool" && /STP/i.test(e.label))).toBe(true),
  );
});
```

(Ensure `userEvent`, `waitFor`, and MSW handlers for `/api/message/stp-check` are available — the file already exercises `StpPage`; add a `server.use(...)` handler returning a CLEAN verdict if one isn't already present.)

- [ ] **Step 2: Run to verify they fail** — FAIL (no activity recorded yet).

- [ ] **Step 3: Implement — LearnModulePage**

Import: `import { recordActivity } from "../../lib/persistence/storage";` (and the module title is available via `mod.title`). In `completeModule(id)`, record only when the module is newly completed. The current shape is roughly:

```tsx
const completeModule = (id: string) => {
  setCompleted((prev) => {
    if (prev.includes(id)) return prev;              // already complete — no re-record
    const next = Array.from(new Set([...prev, id]));
    saveProgress({ schemaVersion: 1, completedModuleIds: next });
    const title = getModuleById(id)?.title ?? id;
    recordActivity({ type: "module", label: title, at: Date.now() });
    return next;
  });
};
```

Read the actual `completeModule` and adapt: the record + `saveProgress` must run only on the newly-completed branch (guarded by `prev.includes(id)`), never on re-entry.

- [ ] **Step 4: Implement — each tool page**

In each tool's success handler (the `useMutation`'s `onSuccess`, or after a successful `useQuery`/manual fetch), add one line. Import `recordActivity` in each file. Labels:

| File | Label |
|---|---|
| `PreparePaymentPage.tsx` | `"Prepare payment"` |
| `FeePage.tsx` | `"Fee simulator"` |
| `ScreeningPage.tsx` | `"Sanctions screening"` |
| `ValueDatePage.tsx` | `"Value date calculator"` |
| `StpPage.tsx` | `"MT103 STP check"` |
| `TrackingPage.tsx` | `"Payment tracking"` |

Pattern (StpPage example — its mutation currently does `onSuccess: setResult`):

```tsx
    onSuccess: (data) => {
      setResult(data);
      recordActivity({ type: "tool", label: "MT103 STP check", at: Date.now() });
    },
```

For pages that fetch on a button via `apiRequest` inside a `useCallback` (e.g. some tools), record on the success path of that callback (after the result state is set, before the `catch`). Read each file and place the call on the genuine success branch only (never in the error/catch path).

- [ ] **Step 5: Run to verify they pass** — the two new tests PASS; then run the touched suites: `npm test -- --run src/features/learn src/features/operate && npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/learn/LearnModulePage.tsx frontend/src/features/learn/LearnModulePage.test.tsx frontend/src/features/operate
git commit -m "feat(activity): record module completions and tool runs (#7a)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Overview recent-activity rendering + relativeTime

**Files:**
- Create: `frontend/src/features/overview/relativeTime.ts`
- Test: `frontend/src/features/overview/relativeTime.test.ts`
- Modify: `frontend/src/features/overview/OverviewPage.tsx` (the `overview__activity` section)
- Test: `frontend/src/features/overview/OverviewPage.test.tsx` (append)

**Interfaces:**
- Produces: `export function relativeTime(at: number, now: number): string;` — pure; `now` is injected for deterministic tests.

- [ ] **Step 1: Write the failing tests** — `relativeTime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { relativeTime } from "./relativeTime";

const NOW = 1_000_000_000_000;
describe("relativeTime", () => {
  it("says just now under a minute", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now");
  });
  it("uses minutes then hours", () => {
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5 min ago");
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3 h ago");
  });
  it("falls back to a date beyond a day", () => {
    const out = relativeTime(NOW - 3 * 86_400_000, NOW);
    expect(out).not.toMatch(/ago|just now/);
  });
});
```

Append to `OverviewPage.test.tsx`:

```tsx
it("renders recorded activity newest-first", async () => {
  localStorage.clear();
  const { recordActivity } = await import("../../lib/persistence/storage");
  recordActivity({ type: "module", label: "Lab 1: Identifiers", at: Date.now() - 60_000 });
  recordActivity({ type: "tool", label: "Fee simulator", at: Date.now() });
  renderOverview();
  await waitFor(() => expect(screen.getByText("Fee simulator")).toBeInTheDocument());
  expect(screen.getByText(/Lab 1: Identifiers/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail** — FAIL (`relativeTime` missing; activity not rendered).

- [ ] **Step 3: Implement `relativeTime`** — `relativeTime.ts`:

```ts
/**
 * Human-friendly elapsed time. `now` is a parameter so callers/tests are
 * deterministic. Beyond a day, falls back to a locale date string.
 */
export function relativeTime(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString();
}
```

- [ ] **Step 4: Implement the Overview activity section** — in `OverviewPage.tsx`:

Add imports:

```tsx
import { loadActivity } from "../../lib/persistence/storage";
import { relativeTime } from "./relativeTime";
```

Compute once in the component body:

```tsx
  const activity = loadActivity().entries;
  const now = Date.now();
```

Replace the `overview__activity` section body:

```tsx
      <section className="overview__activity">
        <h2 className="overview__section-title">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="overview__muted">
            {isFirstVisit
              ? "No activity yet. Start by exploring how payments move."
              : "Your recent simulations and learning activity will appear here."}
          </p>
        ) : (
          <ul className="overview__activity-list">
            {activity.map((e, i) => (
              <li key={i} className="overview__activity-item">
                <span className={`overview__activity-tag overview__activity-tag--${e.type}`}>
                  {e.type === "module" ? "Module" : "Tool"}
                </span>
                <span className="overview__activity-label">{e.label}</span>
                <span className="overview__activity-time">{relativeTime(e.at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
```

Add minimal CSS to `OverviewPage.css`:

```css
.overview__activity-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2, 8px); }
.overview__activity-item { display: flex; align-items: center; gap: var(--space-2, 8px); }
.overview__activity-tag { font-size: 0.75rem; padding: 1px 6px; border: 1px solid var(--color-border, #d8d8d8); border-radius: 4px; }
.overview__activity-time { margin-left: auto; color: var(--color-text-muted, #666); font-size: 0.8125rem; }
```

- [ ] **Step 5: Run to verify they pass** — `npm test -- --run src/features/overview && npx tsc --noEmit` → PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/overview/relativeTime.ts frontend/src/features/overview/relativeTime.test.ts frontend/src/features/overview/OverviewPage.tsx frontend/src/features/overview/OverviewPage.test.tsx frontend/src/features/overview/OverviewPage.css
git commit -m "feat(overview): render recent activity list with relative time (#7a)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Explore Schemes page — rails table

**Files:**
- Modify: `frontend/src/features/explore/ExplorePage.tsx` (the `SchemesPage` export, ~line 152)
- Test: `frontend/src/features/explore/SchemesPage.test.tsx` (create)

**Interfaces:**
- Consumes: `apiKeys.schemes`, `SchemesResponseSchema`/`SchemesResponse`, `AsyncRegion`, `apiRequest`.
- Produces: no new exports; `SchemesPage` becomes a currency-picker + rails table.

- [ ] **Step 1: Write the failing test** — `SchemesPage.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { SchemesPage } from "./ExplorePage";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><SchemesPage /></MemoryRouter></QueryClientProvider>,
  );
}

describe("SchemesPage", () => {
  it("shows a currency's rails table with the verified-as-of stamp", async () => {
    server.use(
      http.get("/api/schemes", () => HttpResponse.json({
        currency: "KES", country: "Kenya", countryCode: "KE", iban: false,
        localIdentifier: "Account no.", verifiedAsof: "2026-07",
        schemes: [{ name: "KEPSS", speed: "RTGS", limit: "No limit", cost: "Bank-set", useCase: "High-value", operator: "CBK" }],
      })),
    );
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "KES" }));
    expect(await screen.findByText("KEPSS")).toBeInTheDocument();
    expect(screen.getByText(/verified as of 2026-07/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- --run src/features/explore/SchemesPage.test.tsx` → FAIL (stub renders no table).

- [ ] **Step 3: Implement** — replace the `SchemesPage` function in `ExplorePage.tsx`. First ensure these imports exist at the top of the file (add any missing): `useState` from react, `useQuery` from `@tanstack/react-query`, `apiRequest` from `../../api/client`, `apiKeys` from `../../api/queryKeys`, `SchemesResponseSchema` + `SchemesResponse` type from `../../api/schemas`, `AsyncRegion` from `../../design-system/AsyncRegion` (confirm the export path/name used elsewhere).

```tsx
const SCHEME_CURRENCIES = ["GBP", "CAD", "USD", "EUR", "NGN", "KES", "INR", "AUD", "JPY", "AED"];

export function SchemesPage() {
  const [currency, setCurrency] = useState<string | null>(null);

  const query = useQuery({
    queryKey: apiKeys.schemes(currency ?? ""),
    enabled: currency !== null,
    queryFn: () =>
      apiRequest<SchemesResponse>(
        `/api/schemes?currency=${encodeURIComponent(currency as string)}`,
        undefined,
        SchemesResponseSchema,
      ),
  });

  return (
    <div className="explore-page">
      <h1>Payment Schemes</h1>
      <p className="measure">
        Pick a currency to compare its domestic payment rails. Educational reference —
        always check the operator's current rules.
      </p>
      <div className="lab-currency-pills">
        {SCHEME_CURRENCIES.map((ccy) => (
          <button
            key={ccy}
            type="button"
            className={["lab-currency-pill", currency === ccy && "lab-currency-pill--active"].filter(Boolean).join(" ")}
            aria-pressed={currency === ccy}
            onClick={() => setCurrency(ccy)}
          >
            {ccy}
          </button>
        ))}
      </div>

      {currency && (
        <AsyncRegion
          isLoading={query.isLoading}
          error={query.error ? "Could not load schemes for this currency." : null}
          isEmpty={!!query.data && query.data.schemes.length === 0}
          emptyMessage={`No scheme data for ${currency}.`}
        >
          {query.data && (
            <>
              <table className="schemes-table">
                <thead>
                  <tr><th>Rail</th><th>Speed</th><th>Limit</th><th>Cost</th><th>Use case</th><th>Operator</th></tr>
                </thead>
                <tbody>
                  {query.data.schemes.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td><td>{s.speed}</td><td>{s.limit}</td>
                      <td>{s.cost}</td><td>{s.useCase}</td><td>{s.operator}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {query.data.verifiedAsof && (
                <p className="lab-caption">Rail data verified as of {query.data.verifiedAsof}. Always check the operator's current rules.</p>
              )}
            </>
          )}
        </AsyncRegion>
      )}
    </div>
  );
}
```

Important: read `AsyncRegion`'s actual prop contract before finalizing — match its real prop names (the codebase's `AsyncRegion` handles idle/loading/error/empty/success; adapt the props above to its true signature). If its API differs, keep the same states but use its real props.

- [ ] **Step 4: Run to verify it passes** — `npm test -- --run src/features/explore/SchemesPage.test.tsx && npx tsc --noEmit` → PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/explore/ExplorePage.tsx frontend/src/features/explore/SchemesPage.test.tsx
git commit -m "feat(explore): schemes rails table with currency picker (#7b)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes (for the executor)

- **Coverage:** #8 → T1 (computeProgress) + T2 (id map + backend lab-8) + T3 (OverviewPage). #7a → T4 (storage) + T5 (record points) + T6 (render). #7b → T7 (Schemes table). Bonus fix folded into T3: the primary CTA now uses the client-side `nextModuleId` (a `lab-N` id) instead of the backend numeric `next_recommended`.
- **Verify-before-code anchors (read the real code first):** `completeModule`'s exact shape in `LearnModulePage.tsx` (T5) — the record must sit on the newly-completed branch only; each tool page's genuine success branch (T5); `AsyncRegion`'s real prop names (T7); whether `curriculum.test.ts` already imports `CURRICULUM` (T1). Everything else (storage helpers, `apiKeys`, `ProgressResponseSchema`, `ALL_MODULE_IDS`, the badge list, the SchemesPage stub location) was read from source.
- **Type/name consistency:** `toBackendModuleId`, `computeProgress`/`ProgressStats`, `RelayActivityEntry`/`recordActivity`/`loadActivity`, `relativeTime(at, now)` are used with identical signatures across tasks. `apiKeys.progress` stays a tuple; T3 composes `[...apiKeys.progress, completedParam]` rather than changing the factory.
- **Invariant:** local progress is the single source; `/api/progress` is used only for badges; lab completion/checkpoint logic is untouched (T5 only appends a record call on the new-completion branch). Backend change is data-only (catalogue + one badge).
