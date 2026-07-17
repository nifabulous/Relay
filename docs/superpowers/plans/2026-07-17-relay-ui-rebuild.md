# Relay UI Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate Corridor Labs `/learn` and `/ui` shells with one responsive Relay React application covering Overview, Learn, Explore, and Operate while preserving the existing FastAPI domain APIs.

**Architecture:** Add a Vite React TypeScript application in `frontend/`, built to `app/static/relay/` and served by FastAPI under `/app`. Migrate one vertical feature slice at a time; legacy `/learn` and `/ui` remain available until parity gates pass, then redirect to Relay. Shared contracts live in a typed API client, React Query cache, versioned local persistence, and the `DESIGN.md` component system.

**Tech Stack:** Node.js 24 LTS; React 19.2.7; TypeScript 7.0.2; Vite 8.1.5; React Router 7.18.1; TanStack Query 5.101.2; React Hook Form 7.81.0; Zod 4.4.3; Vitest 4.1.10; React Testing Library 16.3.2; MSW 2.15.0; Playwright 1.61.1; FastAPI/Python 3.9+.

## Global Constraints

- The canonical design contract is `DESIGN.md`; feature-local substitutes for shared tokens or components are prohibited.
- Relay is an **Educational payment simulation**. Recommendation and tracking screens display **Simulation — not a real payment**.
- Primary acceptance viewports are 1440×900 and 390×844; verify intermediate behavior at 768px and 1024px.
- Meet WCAG 2.2 AA, full keyboard operation, visible focus, reduced-motion alternatives, semantic statuses, and 44×44px minimum primary mobile targets.
- Use Instrument Sans for interface and learning content and IBM Plex Mono for identifiers and comparison amounts; self-host, subset, disable mono ligatures, and use metric-compatible fallbacks.
- Do not add user accounts, real payment initiation, cloud sync, native apps, or dark theme.
- Do not change FastAPI domain behavior except for static asset serving, route cutover, and manifest branding.
- Keep legacy `/learn` and `/ui` usable until their replacements pass unit, MSW, Playwright, accessibility, screenshot, parity, and manual acceptance gates.
- Initial shell JavaScript must be at most 200KB gzip, excluding lazy feature routes.
- Never commit generated `node_modules/`, Playwright browsers, coverage, or local visual-audit artifacts.

---

## File Map

```text
frontend/
  package.json                    pinned scripts and dependencies
  vite.config.ts                  build to app/static/relay, /api proxy
  playwright.config.ts            desktop/mobile E2E projects
  src/
    main.tsx                       application bootstrap
    app-shell/                     routes, layouts, nav, search, boundaries
    design-system/                 tokens, primitives, status, route diagram
    api/                           transport, schemas, query keys, hooks
    lib/persistence/               versioned local data and legacy migration
    features/overview/             adaptive home
    features/explore/              search, banks, corridors, schemes, glossary
    features/operate/              prepare, checks, fees, tracking, tools
    features/learn/                curriculum, labs, progress, capstone
    test/                           render helper and MSW server
app/static/relay/                  generated production assets, not hand-edited
app/main.py                        serves /app and performs final redirects
tests/test_frontdoor.py            FastAPI asset and cutover contracts
```

## Shared Interfaces

```ts
export type AsyncStatus = "idle" | "loading" | "success" | "empty" | "error" | "partial" | "unavailable";
export type CheckStatus = "passed" | "needs_attention" | "failed" | "unavailable";
export type Workspace = "overview" | "learn" | "explore" | "operate";
export type RecommendationState = "conclusive" | "incomplete";

export interface PrimaryAction {
  kind: "explore_intro" | "resume_learn" | "resume_operate" | "next_learn" | "prepare_payment";
  href: string;
  label: string;
}

export interface PrepareDraft {
  schemaVersion: 1;
  id: string;
  updatedAt: string;
  beneficiaryIban: string;
  beneficiaryName: string;
  beneficiaryBic?: string;
  currency: string;
  amount: number | null;
  strictness: "lenient" | "standard" | "strict";
}

export interface ApiProblem {
  status: number;
  title: string;
  detail: string;
  fieldErrors: Record<string, string[]>;
  retryable: boolean;
}

export interface RelayPreferences {
  schemaVersion: 1;
  reducedMotion: boolean;
  navigationDensity: "comfortable" | "compact";
  firstRunGuidanceSeen: string[];
}

export interface PaymentRouteNode {
  id: string;
  kind: "originator" | "intermediary" | "beneficiary";
  bic: string;
  name: string;
  status: CheckStatus;
  amount?: string;
  fee?: string;
  timing?: string;
}
```

---

### Task 1: Frontend Toolchain and FastAPI Development Integration

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/app-shell/App.tsx`
- Create: `frontend/src/app-shell/App.test.tsx`
- Create: `frontend/src/test/setup.ts`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm run test`, and a React root at `/app/`.

- [ ] **Step 1: Add the failing bootstrap test**

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the Relay simulation identity", () => {
  render(<App />);
  expect(screen.getByText("Relay")).toBeVisible();
  expect(screen.getByText("Educational payment simulation")).toBeVisible();
});
```

- [ ] **Step 2: Create the pinned package manifest and configs**

```json
{
  "name": "relay-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@hookform/resolvers": "5.4.0",
    "@tanstack/react-query": "5.101.2",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "react-hook-form": "7.81.0",
    "react-router-dom": "7.18.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.1",
    "jsdom": "28.1.0",
    "msw": "2.15.0",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vitest": "4.1.10"
  }
}
```

Configure Vite with `base: "/app/"`, output directory `../app/static/relay`, `emptyOutDir: true`, and a development proxy from `/api` to `http://127.0.0.1:8000`. Configure Vitest for `jsdom`, `src/test/setup.ts`, and restored mocks.

- [ ] **Step 3: Implement the smallest Relay root**

```tsx
export function App() {
  return <main><h1>Relay</h1><p>Educational payment simulation</p></main>;
}
```

- [ ] **Step 4: Install and verify**

Run: `cd frontend && npm install && npm test && npm run build`

Expected: bootstrap test passes; `app/static/relay/index.html` exists; TypeScript reports no errors.

- [ ] **Step 5: Document two-terminal development and commit**

Document `.venv/bin/uvicorn app.main:app --reload` and `cd frontend && npm run dev`. Add `frontend/node_modules/`, `frontend/coverage/`, `frontend/test-results/`, and `frontend/playwright-report/` to `.gitignore`.

```bash
git add .gitignore README.md frontend frontend/package-lock.json
git commit -m "build(frontend): bootstrap Relay React application"
```

### Task 2: Production Asset Serving and Front-Door Contract

**Files:**
- Modify: `app/main.py`
- Modify: `tests/test_frontdoor.py`
- Create: `app/static/relay/.gitkeep`

**Interfaces:**
- Consumes: Vite output from Task 1.
- Produces: `GET /app` and `GET /app/{rest:path}` returning `app/static/relay/index.html` without changing `/api/*`.

- [ ] **Step 1: Write failing FastAPI tests**

```py
def test_relay_app_serves_built_shell(client):
    response = client.get("/app")
    assert response.status_code == 200
    assert '<div id="root"></div>' in response.text

def test_relay_deep_link_serves_shell(client):
    response = client.get("/app/operate/prepare")
    assert response.status_code == 200
    assert '<div id="root"></div>' in response.text
```

- [ ] **Step 2: Run the focused tests**

Run: `.venv/bin/pytest tests/test_frontdoor.py -q`

Expected: both new tests fail with 404.

- [ ] **Step 3: Add static serving with a missing-build development response**

Define `RELAY_DIR = STATIC_DIR / "relay"`. Mount assets only when the directory exists. Both `/app` routes return `index.html`; when it is absent, return a 503 HTML response that tells developers to run `cd frontend && npm run build`.

- [ ] **Step 4: Build, test, and commit**

Run: `cd frontend && npm run build && cd .. && .venv/bin/pytest tests/test_frontdoor.py -q`

Expected: all front-door tests pass and existing `/learn` and `/ui` tests remain unchanged.

```bash
git add app/main.py app/static/relay tests/test_frontdoor.py
git commit -m "feat(frontend): serve Relay application from FastAPI"
```

### Task 3: Design Tokens, Fonts, and Primitive Components

**Files:**
- Create: `frontend/src/design-system/tokens.css`
- Create: `frontend/src/design-system/global.css`
- Create: `frontend/src/design-system/Button.tsx`
- Create: `frontend/src/design-system/StatusChip.tsx`
- Create: `frontend/src/design-system/AsyncRegion.tsx`
- Create: `frontend/src/design-system/primitives.test.tsx`
- Create: `frontend/src/assets/fonts/` with subset WOFF2 files and licenses
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Produces: `Button`, `StatusChip`, and `AsyncRegion` with the state contracts in `DESIGN.md`.

- [ ] **Step 1: Write failing accessibility and state tests**

```tsx
it("exposes a busy async region", () => {
  render(<AsyncRegion status="loading" loadingLabel="Loading banks">content</AsyncRegion>);
  expect(screen.getByRole("status", { name: "Loading banks" })).toHaveAttribute("aria-busy", "true");
});

it("does not encode status with color alone", () => {
  render(<StatusChip status="needs_attention" />);
  expect(screen.getByText("Needs attention")).toBeVisible();
});
```

- [ ] **Step 2: Implement exact tokens and typography**

Use the token values from `DESIGN.md`, the 4/8/12/16/24/32/48/64px spacing scale, 8px control radius, and 10–12px region radius. Define `@font-face` for Instrument Sans and IBM Plex Mono with `font-display: swap`; disable mono ligatures and enable tabular numbers.

- [ ] **Step 3: Implement primitives with explicit states**

`Button` accepts `variant: "primary" | "secondary" | "danger"`, `isLoading`, and native button props. `StatusChip` accepts `CheckStatus`. `AsyncRegion` accepts all `AsyncStatus` values plus `onRetry`, `emptyAction`, and `error: ApiProblem | null`.

- [ ] **Step 4: Verify and commit**

Run: `cd frontend && npm test -- primitives.test.tsx && npm run build`

Expected: tests pass; CSS has no `transition: all`; build succeeds.

```bash
git add DESIGN.md frontend/src/design-system frontend/src/assets frontend/src/main.tsx
git commit -m "feat(design-system): add Relay foundations and primitives"
```

### Task 4: Typed API Transport, Schemas, and MSW Harness

**Files:**
- Create: `frontend/src/api/problem.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/schemas.ts`
- Create: `frontend/src/api/queryKeys.ts`
- Create: `frontend/src/api/client.test.ts`
- Create: `frontend/src/test/handlers.ts`
- Create: `frontend/src/test/server.ts`
- Create: `frontend/src/test/render.tsx`

**Interfaces:**
- Produces: `apiRequest<T>(path, init, schema): Promise<T>`, `ApiProblem`, `apiKeys`, and `renderRelay()`.

- [ ] **Step 1: Write transport tests for success, FastAPI validation, retryability, and cancellation**

```ts
it("normalizes a FastAPI validation error", async () => {
  server.use(http.post("/api/prepare-payment", () => HttpResponse.json({
    detail: [{ loc: ["body", "currency"], msg: "invalid currency", type: "value_error" }]
  }, { status: 422 })));
  await expect(apiRequest("/api/prepare-payment", { method: "POST" }, PreparePaymentSchema))
    .rejects.toMatchObject({ status: 422, fieldErrors: { currency: ["invalid currency"] }, retryable: false });
});
```

- [ ] **Step 2: Define Zod response schemas matching `app/schemas.py`**

Cover health, validation, lookup, route, SSI, VoP, prepare, fees, screening, value date, STP, schemes, progress, and tracking. Export inferred TypeScript types from the schemas so request hooks and views cannot invent alternate names.

- [ ] **Step 3: Implement transport and QueryClient test wrapper**

Use an `Accept: application/json` header, pass `AbortSignal`, parse JSON once, turn non-2xx responses into `ApiProblem`, and set `retryable` only for 408, 429, and 5xx. The test QueryClient uses `retry: false` and `gcTime: Infinity`.

- [ ] **Step 4: Run all API harness tests and commit**

Run: `cd frontend && npm test -- src/api`

Expected: success, malformed response, 422, 500, and abort cases pass.

```bash
git add frontend/src/api frontend/src/test
git commit -m "feat(frontend): add typed FastAPI client and test harness"
```

### Task 5: Versioned Persistence and Legacy Progress Migration

**Files:**
- Create: `frontend/src/lib/persistence/storage.ts`
- Create: `frontend/src/lib/persistence/schemas.ts`
- Create: `frontend/src/lib/persistence/migrateLegacy.ts`
- Create: `frontend/src/lib/persistence/persistence.test.ts`

**Interfaces:**
- Produces: `loadPreferences()`, `savePreferences()`, `loadProgress()`, `saveProgress()`, `loadDraft(id)`, `saveDraft(draft)`, and `migrateLegacyProgressOnce()`.

- [ ] **Step 1: Write failing tests for defaults, corrupt data, schema version, and one-time import**

```ts
it("discards corrupt persisted preferences", () => {
  localStorage.setItem("relay:preferences", "not-json");
  expect(loadPreferences()).toEqual(defaultPreferences);
});

it("imports legacy progress once", () => {
  localStorage.setItem("swift-lab-progress", JSON.stringify({ completed: ["lab-1"] }));
  expect(migrateLegacyProgressOnce().completedModuleIds).toContain("lab-1");
  expect(migrateLegacyProgressOnce().didImport).toBe(false);
});
```

- [ ] **Step 2: Implement safe versioned storage**

Every stored object has `schemaVersion: 1`. Catch storage denial and quota errors. Never persist transient UI state, API responses, or secrets. Drafts contain user-entered simulated payment fields only.

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npm test -- persistence`

Expected: default, round-trip, corrupt, obsolete, denied-storage, and one-time migration tests pass.

```bash
git add frontend/src/lib/persistence
git commit -m "feat(frontend): add versioned Relay persistence"
```

### Task 6: Responsive Application Shell and Routing

**Files:**
- Create: `frontend/src/app-shell/router.tsx`
- Create: `frontend/src/app-shell/AppShell.tsx`
- Create: `frontend/src/app-shell/DesktopNavigation.tsx`
- Create: `frontend/src/app-shell/MobileNavigation.tsx`
- Create: `frontend/src/app-shell/TopSheet.tsx`
- Create: `frontend/src/app-shell/AppErrorBoundary.tsx`
- Create: `frontend/src/app-shell/AppShell.test.tsx`
- Modify: `frontend/src/app-shell/App.tsx`

**Interfaces:**
- Produces routes `/app`, `/app/learn/*`, `/app/explore/*`, `/app/operate/*`; `Workspace`; persistent navigation with active state.

- [ ] **Step 1: Write desktop, mobile, deep-link, and keyboard tests**

Test that desktop exposes the left rail, mobile exposes exactly Overview/Learn/Explore/Operate, active routes use `aria-current="page"`, Escape closes the top sheet, focus returns to its trigger, and unknown routes show recovery actions.

- [ ] **Step 2: Implement lazy route boundaries**

Use route-level `lazy()` imports for Learn, Explore, and Operate. The shell itself is eager. Root redirects internally to Overview without a network redirect.

- [ ] **Step 3: Implement intentional breakpoints**

Desktop rail appears at 1024px. Mobile/tablet use the bottom bar with safe-area padding. Content reserves navigation space; verify FINDING-001 cannot recur. Primary targets are at least 44×44px.

- [ ] **Step 4: Verify and commit**

Run: `cd frontend && npm test -- AppShell && npm run build`

Expected: shell tests pass; Learn, Explore, and Operate are separate output chunks.

```bash
git add frontend/src/app-shell
git commit -m "feat(frontend): build responsive Relay application shell"
```

### Task 7: Adaptive Overview and Contextual First Run

**Files:**
- Create: `frontend/src/features/overview/selectPrimaryAction.ts`
- Create: `frontend/src/features/overview/OverviewPage.tsx`
- Create: `frontend/src/features/overview/RecentActivity.tsx`
- Create: `frontend/src/features/overview/FirstRunRoute.tsx`
- Create: `frontend/src/features/overview/OverviewPage.test.tsx`

**Interfaces:**
- Produces: `selectPrimaryAction(context): PrimaryAction` with kinds `explore_intro`, `resume_learn`, `resume_operate`, `next_learn`, `prepare_payment`.

- [ ] **Step 1: Write the primary-action decision table as tests**

```ts
it.each([
  [{ firstVisit: true }, "explore_intro"],
  [{ unfinishedOperateAt: 20, unfinishedLearnAt: 10 }, "resume_operate"],
  [{ unfinishedOperateAt: 10, unfinishedLearnAt: 20 }, "resume_learn"],
  [{ curriculumComplete: false }, "next_learn"],
  [{ curriculumComplete: true }, "prepare_payment"]
])("selects the expected action", (context, expected) => {
  expect(selectPrimaryAction(context).kind).toBe(expected);
});
```

- [ ] **Step 2: Implement Overview without a card mosaic**

Render one dominant action, one current-context region, Search/Directory/Track utility row, and chronological recent activity. Empty activity explains how to create the first entry.

- [ ] **Step 3: Implement contextual route guidance**

The first route example uses inline stepped guidance; Search and Operate stay available. Dismissal persists in `RelayPreferences` and Help can reopen it.

- [ ] **Step 4: Verify and commit**

Run: `cd frontend && npm test -- OverviewPage`

Expected: all five primary-action cases and first-run dismissal/recovery pass.

```bash
git add frontend/src/features/overview
git commit -m "feat(frontend): add adaptive Relay overview"
```

### Task 8: Explore Workspace and Command Search

**Files:**
- Create: `frontend/src/features/explore/search/searchIndex.ts`
- Create: `frontend/src/features/explore/search/CommandSearch.tsx`
- Create: `frontend/src/features/explore/banks/BankDirectoryPage.tsx`
- Create: `frontend/src/features/explore/banks/BankDetailPage.tsx`
- Create: `frontend/src/features/explore/corridors/CorridorPage.tsx`
- Create: `frontend/src/features/explore/schemes/SchemesPage.tsx`
- Create: `frontend/src/features/explore/Explore.test.tsx`

**Interfaces:**
- Produces: grouped `SearchResult` values for bank, corridor, scheme, lesson, glossary, and UETR; stable query-string routes.

- [ ] **Step 1: Write search, zero-result, keyboard, and API-state tests**

Test grouped ordering, ArrowDown/ArrowUp movement, Enter selection, Escape close/focus restore, query persistence in `?q=`, warm zero results, 47-character names, and partial result groups.

- [ ] **Step 2: Implement query hooks and pages**

Use `apiKeys` and Zod types. Results and detail pages render through `AsyncRegion`. Cross-links connect bank/corridor details to relevant Learn and Operate routes.

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npm test -- Explore && npm run build`

Expected: search and all MSW state tests pass; command search is keyboard complete.

```bash
git add frontend/src/features/explore frontend/src/app-shell
git commit -m "feat(frontend): add Relay Explore workspace"
```

### Task 9: Payment Route Visualization

**Files:**
- Create: `frontend/src/design-system/payment-route/PaymentRoute.tsx`
- Create: `frontend/src/design-system/payment-route/HorizontalRoute.tsx`
- Create: `frontend/src/design-system/payment-route/VerticalRoute.tsx`
- Create: `frontend/src/design-system/payment-route/routeSummary.ts`
- Create: `frontend/src/design-system/payment-route/PaymentRoute.test.tsx`

**Interfaces:**
- Consumes: `PaymentRouteNode[]`, `currency`, `amount`, `activeNodeId`.
- Produces: one semantic route model with horizontal desktop and vertical mobile presentations.

- [ ] **Step 1: Write semantic, responsive, overflow, and reduced-motion tests**

Verify the accessible summary names origin, every intermediary, beneficiary, currency, and amount; the vertical stepper keeps all nodes visible; only the active mobile hop expands; 47-character institution names wrap; reduced motion disables travel animation.

- [ ] **Step 2: Implement the route signature**

At 768px and wider use the horizontal path. Below 768px use document-order vertical steps. Animate transform/opacity only. Reject and incomplete paths state where movement stopped and why.

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npm test -- PaymentRoute`

Expected: semantic and viewport tests pass; no text-filled decorative circles remain, preventing FINDING-002.

```bash
git add frontend/src/design-system/payment-route
git commit -m "feat(design-system): add responsive payment route"
```

### Task 10: Operate Prepare-Payment Workspace and Partial Results

**Files:**
- Create: `frontend/src/features/operate/prepare/prepareSchema.ts`
- Create: `frontend/src/features/operate/prepare/usePreparePayment.ts`
- Create: `frontend/src/features/operate/prepare/PreparePaymentPage.tsx`
- Create: `frontend/src/features/operate/prepare/CheckResult.tsx`
- Create: `frontend/src/features/operate/prepare/Recommendation.tsx`
- Create: `frontend/src/features/operate/prepare/PreparePaymentPage.test.tsx`

**Interfaces:**
- Produces: `PrepareDraft`, check statuses, stale-dependency invalidation, targeted retry, and `RecommendationState = conclusive | incomplete`.

- [ ] **Step 1: Write validation and dependency tests**

Test required beneficiary fields, positive amount, currency normalization, focus on first invalid field, draft restoration, duplicate-submit prevention, and downstream staleness after editing an upstream field.

- [ ] **Step 2: Write mixed-result tests**

MSW returns validation passed, VoP unavailable, route passed, and SSI warning. Assert completed results remain visible, VoP alone offers Retry, and Recommendation says `Incomplete` with no conclusive proceed/stop result.

- [ ] **Step 3: Implement the guided workspace**

Use React Hook Form and Zod. Completed steps collapse to summaries. Mutation preserves inputs on failure, passes AbortSignal, persists explicit drafts, and invalidates exact dependent query keys.

- [ ] **Step 4: Verify and commit**

Run: `cd frontend && npm test -- PreparePaymentPage`

Expected: validation, success, delayed, server failure, duplicate, partial, and targeted retry tests pass.

```bash
git add frontend/src/features/operate/prepare
git commit -m "feat(frontend): add Relay payment preparation workspace"
```

### Task 11: Remaining Operate Tools and Tracking

**Files:**
- Create: `frontend/src/features/operate/tools/ToolIndexPage.tsx`
- Create: `frontend/src/features/operate/tools/FeePage.tsx`
- Create: `frontend/src/features/operate/tools/ScreeningPage.tsx`
- Create: `frontend/src/features/operate/tools/ValueDatePage.tsx`
- Create: `frontend/src/features/operate/tools/StpPage.tsx`
- Create: `frontend/src/features/operate/tracking/TrackingPage.tsx`
- Create: `frontend/src/features/operate/tracking/PaymentTimeline.tsx`
- Create: `frontend/src/features/operate/OperateTools.test.tsx`

**Interfaces:**
- Consumes: typed schemas and shared form/status components.
- Produces: direct routes for each tool and a tracking timeline labeled as simulated.

- [ ] **Step 1: Write one behavioral matrix test per tool**

For every tool cover valid submit, 422 field error, 500 retry, and stale result after input edit. Tracking additionally covers unknown UETR, empty timeline, partial/stale timeline, and terminal status.

- [ ] **Step 2: Implement tools using shared boundaries**

Each page has one task, specific button labels, persisted query inputs only where useful, and related Learn/Explore links. Tracking always displays `Simulation — not a real payment` and uses text/icon/color statuses.

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npm test -- OperateTools`

Expected: every tool’s state matrix passes.

```bash
git add frontend/src/features/operate
git commit -m "feat(frontend): migrate Relay operational tools"
```

### Task 12: Learn Workspace, Curriculum, Progress, and Capstone

**Files:**
- Create: `frontend/src/features/learn/curriculum.ts`
- Create: `frontend/src/features/learn/LearnIndexPage.tsx`
- Create: `frontend/src/features/learn/LearnModulePage.tsx`
- Create: `frontend/src/features/learn/Exercise.tsx`
- Create: `frontend/src/features/learn/ProgressPage.tsx`
- Create: `frontend/src/features/learn/CapstonePage.tsx`
- Create: `frontend/src/features/learn/Learn.test.tsx`
- Migrate content from: `app/static/js/learn-labs*.js`, `learn-lab-*.js`, `learn-capstone.js`, `glossary.js`

**Interfaces:**
- Produces: typed `CurriculumModule`, prerequisite gating, completion records, exercise attempts, and capstone draft bridge to Operate.

- [ ] **Step 1: Create an explicit legacy parity table in the test**

Assert all current modules appear exactly once: labs 1–7, capstone, fees, FX, sanctions, settlement, MT103, cases, glossary, and progress. Each entry declares route, prerequisites, completion contract, and estimated duration.

- [ ] **Step 2: Write curriculum and accessibility tests**

Cover first incomplete module, prerequisite lock explanation, revisit completed module, exercise success/failure, reduced-motion visualizers, prior/next navigation, and migrated legacy progress.

- [ ] **Step 3: Implement Learn while preserving the strongest legacy qualities**

Keep the existing readable measure, concept-to-exercise pacing, inline diagrams, and explicit prior/next controls. Replace the repetitive card catalogue with current module, curriculum sequence, and compact completed work. Status markers use numbers/icons, never overflowing words.

- [ ] **Step 4: Implement capstone handoff**

The capstone creates a versioned `PrepareDraft`, opens `/app/operate/prepare?draft=<id>`, and returns to completion feedback after the simulated result.

- [ ] **Step 5: Verify and commit**

Run: `cd frontend && npm test -- Learn`

Expected: parity, gating, exercises, progress migration, capstone, and reduced-motion tests pass.

```bash
git add frontend/src/features/learn frontend/src/lib/persistence
git commit -m "feat(frontend): migrate Relay learning workspace"
```

### Task 13: End-to-End, Accessibility, Visual, and Performance Gates

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/overview.spec.ts`
- Create: `frontend/e2e/explore.spec.ts`
- Create: `frontend/e2e/prepare.spec.ts`
- Create: `frontend/e2e/learn.spec.ts`
- Create: `frontend/e2e/tracking.spec.ts`
- Create: `frontend/e2e/accessibility.spec.ts`
- Create: `frontend/scripts/check-bundle.mjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: Chromium projects `desktop` at 1440×900 and `mobile` at 390×844; bundle budget gate.

- [ ] **Step 1: Configure Playwright web servers**

Start FastAPI on 8000 and Vite preview on 4173. Record traces and screenshots on first retry. Add `@axe-core/playwright` version `4.12.1` to `frontend/devDependencies`.

- [ ] **Step 2: Implement primary journeys**

Test first run, adaptive return, grouped search, bank-to-corridor cross-link, successful preparation, partial preparation retry, simulated tracking, lesson completion, progress reload, and capstone handoff on both projects.

- [ ] **Step 3: Add visual regression assertions**

Capture shell top regions, Overview, Learn index, module, Explore detail, Prepare form/result, horizontal route, vertical route, and tracking. These assertions must catch legacy FINDING-001, FINDING-002, and undersized navigation regressions.

- [ ] **Step 4: Add bundle gate**

Read Vite manifest assets, gzip eager shell chunks, fail above 204800 bytes, and print each eager asset’s compressed size.

- [ ] **Step 5: Run the complete frontend gate and commit**

Run: `cd frontend && npm test && npm run build && npm run test:e2e && npm run check:bundle`

Expected: all unit/integration/E2E/a11y/visual tests pass; eager shell ≤200KB gzip.

```bash
git add frontend/e2e frontend/playwright.config.ts frontend/scripts frontend/package.json frontend/package-lock.json
git commit -m "test(frontend): add Relay release quality gates"
```

### Task 14: Documentation, Branding, Cutover, and Legacy Retirement

**Files:**
- Modify: `app/main.py`
- Modify: `tests/test_frontdoor.py`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Create: `frontend/README.md`
- Delete after parity approval: `app/static/index.html`, `app/static/learn.html`, `app/static/css/app.css`, `app/static/css/learn.css`, legacy JS files replaced by Relay
- Preserve until import audit completes: any static data fixture still consumed by React build tooling

**Interfaces:**
- Produces: `/`, `/learn`, and `/ui` redirects to `/app`; manifest identifies Relay; no dormant legacy shell remains.

- [ ] **Step 1: Write failing cutover tests**

```py
import pytest

@pytest.mark.parametrize("path", ["/", "/learn", "/ui"])
def test_legacy_front_doors_redirect_to_relay(client, path):
    response = client.get(path, follow_redirects=False)
    assert response.status_code in {301, 302, 307, 308}
    assert response.headers["location"].startswith("/app")

def test_manifest_uses_relay_identity(client):
    body = client.get("/api/manifest").json()
    assert body["service"] == "Relay — Educational payment simulation"
```

- [ ] **Step 2: Run every parity and quality gate before deletion**

Run: `.venv/bin/pytest tests -q && cd frontend && npm test && npm run build && npm run test:e2e && npm run check:bundle`

Expected: all Python and frontend gates pass. Stop retirement if any command fails.

- [ ] **Step 3: Perform trademark/domain clearance outside code**

Record the approved public name in the release ticket. If Relay fails clearance, update only brand copy tokens, document title, manifest identity, and wordmark tests; do not reopen layout or interaction decisions.

- [ ] **Step 4: Switch routes and remove replaced legacy files**

Update FastAPI redirects and manifest. Delete only files mapped as replaced in the parity table. Search built and source output for `Corridor Labs` and `SWIFT Routing Lab`; allowed matches are historical docs only.

- [ ] **Step 5: Update operating documentation**

Document architecture boundaries, token/component rules, local development, tests, production build, deployment, local persistence, accessibility verification, and legacy removal.

- [ ] **Step 6: Run final verification and commit**

Run: `rg -n "Corridor Labs|SWIFT Routing Lab" frontend app/main.py app/static/relay || true`

Expected: no production identity matches.

Run: `.venv/bin/pytest tests -q && cd frontend && npm test && npm run build && npm run test:e2e && npm run check:bundle`

Expected: all gates pass from a clean checkout.

```bash
git add -A app/main.py app/static README.md CLAUDE.md frontend tests/test_frontdoor.py
git commit -m "feat(frontend): cut over to Relay and retire legacy shells"
```

---

## Final Acceptance Checklist

- [ ] Overview selects the correct action for first visit, unfinished Learn, unfinished Operate, incomplete curriculum, and completed curriculum.
- [ ] Learn, Explore, Operate, and Overview have stable URLs and restore committed query state.
- [ ] Every feature renders loading, empty, error, success, and partial/unavailable behavior defined by the spec.
- [ ] Partial Operate checks retain successful evidence, retry narrowly, and never produce a conclusive recommendation with required missing evidence.
- [ ] Desktop and mobile routes render from one semantic model with complete screen-reader summaries.
- [ ] All legacy capabilities have a mapped Relay route and passing parity test.
- [ ] Desktop and mobile Playwright journeys pass with no serious or critical accessibility violations.
- [ ] Primary screenshot comparisons pass at 1440×900 and 390×844.
- [ ] Eager shell bundle is ≤200KB gzip.
- [ ] Production UI contains Relay only and keeps simulation labeling persistent.
- [ ] Python tests pass after legacy removal.
- [ ] `git status --short` is clean.
