# Relay — Developer Handoff (2026-07-19)

Read this alongside the repo's root **`CLAUDE.md`** (project conventions) and **`DESIGN.md`**
(frontend design contract). This doc is the "where we are / what's next / what will bite you"
map for whoever implements the current plan. It is not a replacement for `CLAUDE.md` — it
complements it.

---

## 1. What this project is

**Relay** is an **educational payment simulation** for learning how cross-border payments
work. **No real money moves.** Every payment is simulated; all account numbers are `ACCT-`
placeholders. Three surfaces:

1. **FastAPI backend** (`app/`) — validates IBAN/BIC, looks up banks, suggests correspondents,
   simulates VoP / fees / sanctions / value-date / tracking / MT103 STP / (new) ISO 20022
   pacs.008. ~21 endpoints under `/api/*`.
2. **Relay frontend** (`frontend/`) — React 19 + TypeScript 7 (strict) + Vite 8, four
   workspaces: **Overview, Learn, Explore, Operate**. Served at `/app`.
3. **Legacy frontend** (`app/static/`) — vanilla HTML/JS at `/learn` and `/ui`. Being replaced
   by Relay; still present until parity.

Architecture is **Router → Service → Model** on the backend; services are pure functions taking
a `Session` (many need no DB at all). Frontend is feature-sliced under `frontend/src/features/*`
with a typed API client (`src/api/`) and versioned localStorage (`src/lib/persistence/`).

---

## 2. Where we are (state as of this handoff)

Current branch: **`main`**, HEAD ≈ `ebed98f`.
Backend suite: **601 passing** (`python -m pytest tests/ -q`), `ruff` clean.
Frontend suite: **254 passing** (`npm test -- --run`), `tsc --noEmit` clean.

### Shipped this cycle (all merged to `main`)
- **MT103 → ISO 20022 reframe** (`app/services/iso20022.py`, endpoints `/api/message/translate`
  + `/api/message/pacs008-check`, Learn **Lab 8** "Message Standards", Operate STP "View as
  pacs.008" toggle). STP checker relabeled as a "12-rule primer" noting MT103's **22 Nov 2025**
  cross-border retirement. Spec: `docs/superpowers/specs/2026-07-18-mt103-iso20022-reframe-design.md`.
- **Backlog correctness cluster**: VoP legal-basis docstrings (IPR vs EPC vs UK CoP), STP field-23B
  validation + 32A/33B amount-divergence rule, BIC 8-vs-11 confirmation, Kenya **KEPSS** RTGS +
  corrected M-Pesa limits, per-scheme `verifiedAsof` date-stamps, and the **MOD-97 visual
  step-through** in Lab 2. Plan: `docs/superpowers/plans/2026-07-19-relay-backlog-correctness.md`.
- **Vitest flake fix**: `frontend/vite.config.ts` now sets `testTimeout`/`hookTimeout: 15000`.
  Root cause was CPU starvation under 8-way jsdom parallelism (tests passed in isolation, timed
  out in the full run). If you see "flaky" frontend failures with ~5–7s durations, this is why —
  do not chase them as product bugs.

### In progress — the plan your developer is implementing
**`docs/superpowers/plans/2026-07-19-overview-explore-data-truth.md`** (7 tasks). It fixes:
- **#8** the Overview progress bar (currently always shows **0/N** — see §5),
- **#7a** "recent activity" (currently a permanent placeholder),
- **#7b** the Explore → Schemes redirect stub.

**Status: Task 1 is already committed** (`ebed98f feat(learn): computeProgress …`). **Tasks 2–7
remain.** Design rationale is in `docs/superpowers/specs/2026-07-19-overview-explore-data-truth-design.md`.
Read the spec before the plan.

---

## 3. The active plan — task map + the traps in each

Single source of truth for progress = **local `relay:progress.completedModuleIds`**. `/api/progress`
is a *stateless calculator*; we use it only for badges.

| Task | What | Watch out for |
|---|---|---|
| 1 ✅ | `computeProgress()` in `curriculum.ts` | Done (`ebed98f`). Uses `CURRICULUM` (has lab-8) + `getNextModule`. |
| 2 | `toBackendModuleId` (frontend) + add `"8"` to backend `ALL_MODULE_IDS` + `payment-operator` badge | Backend `app/services/progress.py` uses **numeric** module ids (`"1".."8"`, `"capstone"`), frontend uses `lab-1..lab-8`. The map strips `lab-`. Adding lab-8 to `payment-operator` means learners who did 1-7+capstone no longer auto-earn it until lab-8 (correct, acceptable — badges are derived, not stored). |
| 3 | OverviewPage: drive count/%/next from local `computeProgress`; call `/api/progress?completed=<mapped>` for **badges only** | **The bug being fixed:** OverviewPage currently calls `/api/progress` with **no params**, so the server always returns 0. Also folds in a bonus fix: the primary CTA currently feeds the backend numeric `next_recommended` into `selectPrimaryAction` (wrong id for frontend routes) — switch to `stats.nextModuleId` (a `lab-N` id). Compose the query key as `[...apiKeys.progress, completedParam]` (don't change the `apiKeys.progress` tuple factory). |
| 4 | Activity log in `storage.ts` (`loadActivity`/`recordActivity`, key `relay:activity`, cap 20) | Reuse existing `safeLoad`/`safeSave`; keep `schemaVersion: 1` + corrupt-discard. `Date.now()` is fine in-browser. |
| 5 | Record activity on module completion (`LearnModulePage`) + 6 tool pages' success handlers | **Record on the newly-completed branch only** (guard on `prev.includes(id)`) — never on re-entry, never in a `catch`. The 6 tools: Prepare, Fee, Screening, ValueDate, STP, Tracking. Read each file's real success path first. |
| 6 | Overview recent-activity list + `relativeTime(at, now)` | `relativeTime` takes `now` as a param for deterministic tests — keep it pure. |
| 7 | Explore Schemes page → currency-picker + rails table | `SchemesPage` lives in **`features/explore/ExplorePage.tsx`** (~line 152), not its own file. Reuse `/api/schemes?currency=X` + the new `verifiedAsof` field. **Confirm `AsyncRegion`'s real prop names before wiring** — the plan's props are illustrative. |

---

## 4. Deferred backlog (NOT in the active plan) — each blocked on a decision

From `docs/superpowers/plans/2026-07-19-relay-backlog-correctness.md` (its "Deferred" section). Each
has one blocking question; answering it (a short design pass) converts it to tasks. Do **not** start
these without a decision — they'd otherwise be built on guesswork.

- **3.6 — Sanctions vs Travel-Rule split.** The disclaimer half is already done. The valuable half
  (model sanctions + Travel Rule as **two independent** pass/fail outcomes, all four combinations) is
  a new feature. **Blocking:** what does the Travel-Rule check consume (which fields, what completeness
  rule), and is it a new endpoint or an addition to `/api/screen`? **Also:** the per-hop screening
  threshold drift at `app/services/screening.py:155` (`hop_hard = HARD_HIT_THRESHOLD - (i*0.01)`) makes
  deeper hops *stricter* — that is defensibly correct; do **not** flip the sign without confirming intent.
- **#6 — First-run onboarding.** `firstRunGuidanceSeen` is scaffolded in storage but no UI reads it
  (DESIGN.md principle 5 unfulfilled). **Blocking:** what's the surface — dismissible banner, coach-mark
  tour, or first-visit panel — and what copy?
- **#11 — ETB / Ethiopia.** Net-new and fast-moving (EthioPay-IPS launched 9 Dec 2025). **Recommendation:
  defer** — re-check the research in 2–3 months rather than encode data that will be stale. If built,
  it mirrors the Kenya scheme-block shape.

(#7 and #8 are now the active plan, so they've moved out of "deferred".)

---

## 5. Things you will hit that aren't obvious ("gotchas")

**Backend / Python**
- **Use the venv.** System `python3` has no pytest. Always `source .venv/bin/activate` first. Lint:
  `ruff check app/ tests/` (rules `E,F,I`; `UP` is intentionally disabled for py3.9 compat).
- **Python 3.9 target.** Use `Optional[str]`, `List[...]` from `typing` — **not** `str | None`. `ruff`
  won't always catch it but the CI matrix runs 3.9–3.12.
- **`/api/progress` is stateless.** Its own docstring: *"the frontend is the source of truth… we just
  compute the derived summary."* Never treat it as stored state. Its module ids are numeric
  (`"1".."8"`, `"capstone"`, plus legacy tool ids `fees/fx/sanctions/settlement/mt103/cases/glossary`).
- **`iso20022.py` XML is illustrative,** not XSD-validated — that's deliberate ("primer" framing).
  Keep that honesty in any copy you add.
- **Disclaimers are load-bearing.** Every payment-shaped response must carry a SIMULATION/primer
  disclaimer; SSI account numbers must stay `ACCT-` placeholders. Tests enforce both.

**Frontend / tests**
- **Two test render patterns, know which to copy.** Learn **lab** tests use plain `render()` +
  per-test `server.use(http.…)` from `../../../test/server` (see `Lab2Content.test.tsx`). Operate
  tool tests use a **local** `renderWithProviders` inside `OperateTools.test.tsx`. There is a shared
  `renderRelay` helper in `src/test/render.tsx` (QueryClient wrapper) — but **there is no global
  `renderWithProviders` export**; don't import one. MSW handlers can be global (`src/test/handlers.ts`)
  or per-test via `server.use`.
- **The vitest flake is fixed via `testTimeout`.** If a full-suite run shows a couple of ~5–7s
  timeouts, re-run the failing file in isolation to confirm it's the environment, not your change.
- **`app/static/relay/` is a gitignored build artifact.** The dev server (Vite) serves from source,
  but the FastAPI `/app` route serves the built bundle. After frontend changes, `npm run build`
  (outputs to `../app/static/relay`) if you need `/app` to reflect them; **do not commit that dir**.
- **Bundle gate:** new Learn labs must be `lazy()`-loaded; `npm run check:bundle` must stay green.
- **E2E (Playwright) boots the real backend** (webServer in `frontend/playwright.config.ts`). Seed
  learner progress via `localStorage["relay:progress"] = {schemaVersion:1, completedModuleIds:[...]}`
  — the field is `completedModuleIds`, **not** `completed`.

**Process / conventions (from `CLAUDE.md`)**
- **TDD**: failing test first, then minimal code. **One commit per item**, message format
  `type(scope): description`. This session's commits end with a `Co-Authored-By: Claude …` trailer —
  match or drop per your team's preference.
- **Specs live in** `docs/superpowers/specs/`, **plans in** `docs/superpowers/plans/`. Read the spec
  before the plan; the plan assumes the spec's decisions.
- `.superpowers/sdd/` is gitignored orchestration scratch (progress ledger + task briefs from the
  subagent-driven runs) — ignore it; it's not part of the product.

---

## 6. How to run everything

```bash
# Backend
cd swift-routing
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload            # http://127.0.0.1:8000  (docs at /docs)
python -m pytest tests/ -q               # 601 passing
ruff check app/ tests/

# Frontend (separate terminal)
cd frontend && npm install
npm run dev                              # http://127.0.0.1:5173/app/
npm test -- --run                        # 254 passing
npx tsc --noEmit
npm run check:bundle
npm run test:e2e                         # Playwright (boots backend)
```

Relay app: `http://127.0.0.1:8000/app` (prod-style) or `http://127.0.0.1:5173/app/` (Vite dev).

---

## 7. Quick pointers

- Project conventions: **`CLAUDE.md`** (root). Design contract: **`DESIGN.md`** (root).
- Remediation backlog with file:line citations: **`IMPLEMENTATION_PLAN.md`** (Tiers 0–3).
- Product roadmap: **`ROADMAP.md`**; engineering health: **`ENGINEERING_ROADMAP.md`**.
- Active plan to implement now: **`docs/superpowers/plans/2026-07-19-overview-explore-data-truth.md`**
  (Task 1 done, 2–7 remain) + its spec.
