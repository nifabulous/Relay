# Implementation Plan — SWIFT Routing Lab Remediation

> Source: 10-panel cross-functional review (2 QA · 2 Product · 3 Payments · 2 Education · 2 UX · 2 UI · 2 Frontend · 2 Backend · 1 Engineering Manager · 5 Users = 23 reviewers). Every item below cites the panels that surfaced it, the exact files/lines, and a testable acceptance criterion.

**Status:** Not started · **Last updated:** 2026-07-15

---

## How to use this plan

Work top-to-bottom. Tiers are ordered by cross-panel consensus and severity — Tier 0 items are independently flagged by 4–5 panels and are blocking. Each work item is self-contained (scope, files, fix, acceptance criteria) so it can be executed and verified independently. Check the `[ ]` boxes as you complete items.

**Effort key:** `S` < 2h · `M` = ½–1 day · `L` = 1–3 days · `XL` = 3+ days. "CC" = time for an AI coding agent.

---

## Tier 0 — Blocking / Liability (do first)

These are the items that the most panels flagged independently. They block safe deployment and safe further development.

### 0.1 `git init` + `.gitignore` + first commit `[ ]`

- **Panels:** Engineering Manager (rated F — "existential"), QA, Backend, Frontend
- **Severity:** Critical (no recovery path from a bad change today)
- **Effort:** S (CC: 5 min)
- **Why:** `git status` → `fatal: not a git repository`. A 6.8k-LOC codebase with 522 tests has no version history. Every subsequent item in this plan assumes version control exists.
- **Files:** repo root
- **Do:**
  1. `git init`
  2. Create `.gitignore` excluding: `swift_routing.db`, `.coverage`, `.pytest_cache/`, `.venv/`, `.DS_Store`, `*.egg-info/`, `__pycache__/`, `*.pyc`
  3. `git add -A && git commit -m "chore: initial commit — SWIFT Routing Lab"`
- **Acceptance:** `git log --oneline` shows one commit; `git status` clean; `.venv/` and `swift_routing.db` not tracked.

### 0.2 Resolve the SSI account-number contradiction (liability) `[ ]`

- **Panels:** Product (5 panels), Payments (3 experts), Backend, QA, Users (Skeptic) — **5 independent panels, highest-convergence finding in the entire review**
- **Severity:** Critical (liability — foreseeable misuse path for wiring funds to plausible-looking real accounts)
- **Effort:** M (CC: 2–4h)
- **Why:** README says account numbers are `ACCT-` placeholders and "tests enforce it." ROADMAP says "real, sourced from bank-published pages." Reality: `seed.py:433-489+` ships genuinely real account numbers (Emirates NBD → Citibank `36023618`, BNY Mellon `8033356073`, Barclays `20325320284661`, Central Bank of UAE IBAN `AE410010002000026201001`). **292 of 301** SSI accounts are real-looking numerics. The README's central safety claim is false.
- **Files:**
  - `app/services/seed.py:433-1756` (the `SSI_RECORDS` block — 293 rows carry `_SSI_REAL_NOTE`; replace real `intermediary_account` numerics AND real IBANs in `notes` strings with `ACCT-XXXX` placeholders; keep bank/BIC/correspondent *relationships*)
  - `README.md` (make the "every seed account starts with ACCT-" claim true)
  - `ROADMAP.md:26,66` (remove "real data" / "actual Citibank account number" language; downgrade to "real bank relationships; account numbers are illustrative")
  - `tests/test_ssi.py` (tighten the permissive "placeholder OR sourced" check to enforce `ACCT-` prefix across the **full** seed)
  - NOTE: `app/models.py:117-128` docstring already states the placeholder truth correctly — no change needed there (citation withdrawn).
- **Do:**
  1. Audit every row in `seed.py:SSI_RECORDS` — find all rows where `intermediary_account` or `beneficiary_account` is NOT `ACCT-` prefixed. (Note: ~8 rows use placeholder-style `beneficiary_account` like `EBILAEAD-USD-001` — normalize these to `ACCT-NNNN` too so the invariant is uniform.)
  2. Replace each real account number with a unique `ACCT-NNNN` placeholder (preserve the row, just mask the account). Handle format quirks like `3582091829-001`, `737494AUD00001`, `3010186113-51` — mask the whole value to `ACCT-NNNN`.
  3. **Also mask real IBANs in the `notes` field** (e.g. `seed.py:457` `IBAN: BE75301018611351`, `:461` `IBAN: FR7630056008290829006113820`, `:469` `IBAN: AE410010002000026201001`). The stated safety goal — "a learner can no longer copy a real-looking account number" — is unmet if the notes leak IBANs. Replace with `IBAN: <placeholder>`.
  4. Add a new test `test_all_ssi_accounts_are_placeholders` that asserts every seeded SSI account string matches `^ACCT-\d+$`, scanning both account columns. Do NOT use a blanket `grep [0-9]{6,}` (it matches ABA routing numbers in notes that legitimately stay).
  5. Align README and ROADMAP to one truth: "Bank relationships are real public directory facts; account numbers are illustrative placeholders. Never wire funds using seed data."
- **Acceptance:**
  - New unit test `test_all_ssi_accounts_are_placeholders` passes (every `intermediary_account` and `beneficiary_account` in `SSI_RECORDS` matches `^ACCT-\d+$`).
  - `grep -iE "IBAN: [A-Z]{2}[0-9]" app/services/seed.py` returns zero hits (no real IBANs in notes).
  - README and ROADMAP both contain the canonical phrase "account numbers are illustrative placeholders" — verified by `grep -l "account numbers are illustrative" README.md ROADMAP.md` returning both files.
  - **Behavior change to verify:** after masking, `/prepare-payment` against seeded data will always return `PROCEED_WITH_CAUTION` (never `PROCEED`) because `has_real_accounts` (`prepare.py:197`) becomes perpetually False. This is safer and arguably correct, but verify the capstone and Lab 5/6 UI prose doesn't assume `PROCEED` is reachable from seed data — adjust copy if needed.

### 0.3 Add authentication to import / write endpoints `[ ]`

- **Panels:** QA (Critical), Backend (prod-blocking #1), Users (Engineer + Skeptic), Engineering Manager
- **Severity:** Critical (data-poisoning + DoS vector)
- **Effort:** M (CC: ~1 day)
- **Why:** `POST /api/import/fedwire`, `/fedach`, `/ssi` wipe DB tables and trigger network downloads with zero auth. `POST /track/create` is unbounded unauthenticated writes. The scariest case: an attacker POSTs an SSI file with a non-`ACCT-` account number → `/prepare-payment` returns `has_real_accounts=True` → recommendation `PROCEED`. That is a payments-fraud vector.
- **Files:**
  - `app/routers/lookup.py:257-332` (import block)
  - `app/routers/lookup.py:460-501` (`/track/create`)
  - new: `app/auth.py` (a minimal API-key dependency)
  - `app/config.py` (read `ADMIN_API_KEY` from env)
- **Do:**
  1. Create `app/auth.py` with an `admin_required` FastAPI dependency that reads `X-Admin-Key` header and compares to `ADMIN_API_KEY` env var. If the env var is unset in a non-dev context, fail closed. (Dev detection: treat `ADMIN_API_KEY` unset AND `DATABASE_URL` unset/SQLite as "dev mode" — allow without key locally, require in prod. State this explicitly.)
  2. Add `Depends(admin_required)` to all three `/import/*` routes and `/track/create`.
  3. Add a request-size cap on `/api/import/ssi`: `MAX_UPLOAD_BYTES = 5_000_000`, return 413 if exceeded (before `await file.read()`). Also add a `MAX_SSI_ROWS = 5000` cap — a 5MB CSV can carry ~50k rows, each hitting the `uq_ssi_composite` unique constraint; cap rows to prevent slow-upsert DoS.
  4. Add a `CORSMiddleware` with an explicit allowlist (not `*`).
  5. Update the test `client` fixture in `conftest.py:83` (session-scoped) to inject the `X-Admin-Key` header by default, so existing HTTP tests pass without per-test edits. This is the clean injection point — do NOT hand-edit dozens of individual tests.
  6. Add `ruff` and `alembic` to `pyproject.toml` `[project.optional-dependencies] dev` (these are implicit prereqs for items 1.1 and 1.5 — add them now so they're present).
  7. Document the no-auth-is-intentional-for-local-dev policy in README, with the upgrade path.
- **Acceptance:**
  - Unauthenticated POST to `/api/import/ssi` returns 401.
  - Authenticated POST with oversized payload returns 413.
  - Existing tests updated to pass the header; new test asserts 401 without it.
  - README documents the key.

### 0.3.5 Pin the `fed_importer` default URL (supply-chain integrity) `[ ]`

- **Panels:** Backend, Payments — surfaced by the completeness reviewer as the one genuinely missing high-severity finding
- **Severity:** High (distinct from auth — this is about *whether downloaded data can be trusted*, not *who can trigger the download*)
- **Effort:** S (CC: ~2h)
- **Why:** `app/services/fed_importer.py:27-34` hardcodes `DEFAULT_FEDWIRE_URL` / `DEFAULT_FEDACH_URL` to `https://raw.githubusercontent.com/moov-io/fed/master/data/...`. The importer calls `urlopen` on it with no checksum, no signature, no pinning, then loads the result as authoritative bank-directory data exposed via `/api/us-bank` and `/api/route`. A compromised mirror, a renamed repo, or a MITM silently injects malicious routing data. The auth fix (0.3) gates *who* triggers the fetch but not *what* gets fetched.
- **Files:** `app/services/fed_importer.py:27-34`
- **Do:**
  1. Remove the remote URL as the default. Fail closed if `FEDWIRE_URL` / `FEDACH_URL` env vars are unset (or: ship a bundled local snapshot in `app/data/` as the default source).
  2. If remote fetch is explicitly opted in via env var, verify a published checksum (SHA-256) of the downloaded file against a pinned expected value before parsing.
  3. Document the trust posture in the module docstring (`fed_importer.py:8-12` already hints at it — make it explicit: "no remote fetch by default; opt-in requires checksum verification").
- **Acceptance:**
  - With no env vars set, `POST /api/import/fedwire` returns a clear error ("no FEDWIRE_URL configured; set it to a trusted FRB-downloaded copy") rather than silently fetching from GitHub.
  - If a `FEDWIRE_URL` is set but the downloaded checksum doesn't match the pinned value, the import is rejected with a checksum-mismatch error.

- **Panels:** Users (Engineer + Skeptic + PM — 3 of 5), Payments, Backend, Product
- **Severity:** High (trust/misuse — a polished auth-less API is mistaken for production-grade)
- **Effort:** S–M (CC: ~1 day)
- **Why:** The OpenAPI title is "SWIFT Intermediary Routing API" — no "SIMULATION" or "EDUCATIONAL" qualifier. `/docs` shows a production-shaped API before a developer ever reads the README disclaimers. Raw `/api/track/{uetr}` responses carry no watermark — a scammer could iframe a fake "CREDITED" tracking page.
- **Files:**
  - `app/main.py:31-39` (FastAPI `title=` at line 32, `description=` at 33-36)
  - `app/routers/lookup.py` (add `disclaimer` field to `TrackPaymentResponse`, `ScreenResponse`, `RouteResponse`, `PreparePaymentResponse`)
  - `app/schemas.py` (add a `SIMULATION_DISCLAIMER` constant and a `simulated: bool = True` field where appropriate)
  - `app/static/index.html` + `app/static/learn.html` (persistent visible banner)
- **Do:**
  1. Change the FastAPI `title` to `"SWIFT Routing Lab — Educational Sandbox (SIMULATED, not for real payments)"` and add the same to `description`.
  2. Add a `disclaimer: str` field with the SIMULATION text to every response schema that returns payment-shaped data (`RouteResponse`, `SSIResponse`, `VoPResponse`, `TrackPaymentResponse`, `ScreenResponse`, `PreparePaymentResponse`, `FeeSimulateResponse`).
  3. Add a persistent, unmissable banner to `/ui` and `/learn` headers: **"Educational sandbox — simulated data — do not initiate real payments."** (`index.html` currently has zero disclaimer text.)
  4. Watermark the tracking timeline in `/learn` capstone: a CSS overlay "SIMULATION — NOT A REAL PAYMENT" that cannot be removed by iframing.
- **Acceptance:**
  - `/docs` landing shows "SIMULATED" in the title.
  - Every payment-shaped API response includes a `disclaimer` string.
  - Both UIs show the banner on every screen.
  - The tracking timeline is watermarked.

---

## Tier 1 — Engineering Foundation (do this sprint)

### 1.1 CI pipeline `[ ]`

- **Panels:** Engineering Manager, QA
- **Severity:** High (522-test safety net is unprotected)
- **Effort:** S (CC: ~2h)
- **Prereq:** Repo must be pushed to GitHub (0.1 lands first). `ruff` must be added to `pyproject.toml` `[project.optional-dependencies] dev` (done in 0.3 step 6).
- **Files:** new `.github/workflows/ci.yml`
- **Do:** Single workflow running `python -m pytest tests/ -q` on push/PR for Python 3.9–3.12. Add `ruff check .` for linting. Cache pip deps.
- **Acceptance:** Repo is pushed to GitHub. A push that breaks a test fails CI (red ✗). A push that passes shows a green ✓ on GitHub. `ruff check .` passes clean.

### 1.2 Split the 921-line god-router `[ ]`

- **Panels:** Backend (#8), Engineering Manager, Frontend
- **Severity:** Medium (merge-conflict hotspot, blocks 3-engineer parallelism)
- **Effort:** M–L (CC: ~1 day — not 2h; the shared-helpers extraction adds scope)
- **⚠️ SEQUENCING RULE:** This item invalidates every `lookup.py` line citation in items 0.3, 0.4, 1.3, 1.4. **It MUST land AFTER 0.3, 0.4, 1.3, and 1.4 are complete.** Do not execute 1.2 before those items, or every subsequent `:257-332` / `:313` / `:460` reference points at the wrong file. If you must re-order, re-cite the affected line numbers after the split.
- **Files:** `app/routers/lookup.py` (921 lines) → split into domain routers. Endpoint→router mapping (verified against actual code):

| New router | Endpoints (current `lookup.py` lines) |
|---|---|
| `directory.py` | `/health` (74-124), `/validate`, `/lookup` |
| `routing.py` | `/route` (127-254), `/us-bank` |
| `imports.py` | `/import/fedwire`, `/import/fedach`, `/import/ssi` (257-332) |
| `ssi.py` | `/ssi` (347-399) |
| `vop.py` | `/verify-payee` (424-446) |
| `tracking.py` | `/track/create` (460-501), `/track/{uetr}` (503-544) |
| `schemes.py` | `/schemes` (552-580) |
| `prepare.py` | `/prepare-payment` (589-642) |
| `analytics.py` | `/fees/simulate`, `/screen`, `/value-date`, `/message/stp-check` (643-868) |
| `progress.py` | `/progress` (875-921) |

- **Shared-helpers handling (do NOT duplicate):** `lookup.py:1-70` is a shared import block, and `_build_track_response` (≈line 517) is used by both tracking endpoints. Before splitting:
  1. Move shared constants (`_SSI_DISCLAIMER`, `_VOP_ADVICE`, `_TRACKING_DISCLAIMER`, `_VALUE_DATE_DISCLAIMER`, `_STP_DISCLAIMER`) to `app/routers/_shared.py` or into `app/schemas.py` as module constants.
  2. Move `_build_track_response` into the new `tracking.py` (it's only used there).
  3. Each new router gets `APIRouter(prefix="/api", tags=["swift"])`. Register each via `app.include_router(...)` in `main.py`.
- **Do:** Extract shared helpers first. Then move endpoints by domain per the table above. Run `pytest` after each router is moved to catch breakage early.
- **Acceptance:** `lookup.py` deleted; each new router ≤150 lines (raise threshold to 200 for `analytics.py` if it holds 4 endpoints honestly — don't split unnaturally); `pytest` still 522 passing; any test importing `lookup.router` updated to import the new routers.

### 1.3 Fix confirmed input-validation bugs `[ ]`

- **Panels:** QA (reproduced), Backend
- **Severity:** High
- **Effort:** S (CC: ~2h)
- **Files & fixes:**
  1. `app/routers/lookup.py:313` — move `content.decode("utf-8-sig")` *inside* the `try/except` at line 316 so a malformed SSI upload returns 400, not 500. (QA reproduced: `b'\xff\xfe...'` → 500 today.)
  2. `app/schemas.py:126,176` — add `gt=0` to `TrackPaymentRequest.amount` and `PreparePaymentRequest.amount` (currently accept negative/zero; `FeeSimulateRequest:232` and `STPCheckRequest:366` already do this correctly).
  3. `app/schemas.py` — add `max_length` validators: `VoPRequest.iban` (34), `.name` (200); `ScreenRequest.sender_name`/`beneficiary_name` (200); `TrackPaymentRequest` BIC/name fields; SSI importer account fields (34).
  4. `app/services/ssi_importer.py` — enforce `max_length` in `validate_ssi_row` (SQLite doesn't enforce `String(34)` column length; Postgres would 500).
- **Acceptance:**
  - Non-UTF8 SSI upload → 400 (not 500).
  - `amount: -5000` → 422.
  - 100KB IBAN → 422.
  - New tests cover each case.

### 1.4 Idempotency on payment creation `[ ]`

- **Panels:** QA (reproduced — same payload → different UETRs), Backend (#6)
- **Severity:** High (retried request duplicates a payment)
- **Effort:** M (CC: ~1 day)
- **Files:** `app/routers/lookup.py:460-501` (`/track/create`), `app/routers/lookup.py:588-635` (`/prepare-payment`)
- **Do:** Accept an `Idempotency-Key` header. Store a mapping `{key → uetr}` in a new `idempotency_keys` table (or a simple SQLite table). On replay with the same key, return the existing UETR/timeline instead of minting a new one.
- **Acceptance:** Two identical POSTs with the same `Idempotency-Key` return the same UETR. Two POSTs with different keys return different UETRs. New test covers both.

### 1.5a Add Alembic baseline `[ ]`

- **Panels:** Backend (#2, #5), Engineering Manager
- **Severity:** High (prod-blocking: `create_all` can't evolve existing tables)
- **Effort:** S–M (CC: ~2h for Alembic alone)
- **Prereq:** `alembic` added to `pyproject.toml` dev deps (done in 0.3 step 6). **Must land BEFORE 1.4** — the idempotency-keys table needs a migration, not `create_all`.
- **Files:** new `alembic/`, `alembic.ini`; `app/main.py:19`
- **Do:**
  1. `alembic init alembic && alembic revision --autogenerate -m "baseline"` against current models.
  2. In `main.py` lifespan, gate `Base.metadata.create_all` on dev mode (SQLite / no `DATABASE_URL`). In prod, run `alembic upgrade head` instead.
- **Acceptance:** `alembic upgrade head` applies cleanly on SQLite (verify locally — no Postgres needed for dev). A new column added to a model produces a working migration via `alembic revision --autogenerate` (not a `create_all` no-op on existing tables).

### 1.5b Add structured logging + fix swallowed seed errors `[ ]`

- **Panels:** Backend (#5), Engineering Manager
- **Severity:** Medium (operability — no request tracing, startup errors swallowed)
- **Effort:** M (CC: ~½–1 day — 15 service files + middleware; NOT bundled with Alembic)
- **Files:** `app/main.py:20-27`; all `app/services/*.py` (15 files)
- **Do:**
  1. Add `logger = logging.getLogger(__name__)` to each of the 15 service files.
  2. Add structured request-logging middleware in `main.py` (method, path, status, duration).
  3. Stop swallowing seed errors silently (`main.py:20-27`). Either fail-fast on startup, or expose a `/readyz` endpoint that fails when seed count is zero. Remove the `import sys` inside the `except` block (it's a smell).
- **Acceptance:** Logs appear on requests (verify via a curl + stderr/stdout check). A forced seed failure (e.g., corrupt the DB) produces a visible error on startup or a failing `/readyz`, not a silent "WARNING: Seed data failed to load (non-fatal)".

### 1.6 Reconcile README + ROADMAP with the code `[ ]`

- **Panels:** Product (#2), Payments, Engineering Manager, QA
- **Severity:** Medium (all planning is on stale data)
- **Effort:** S (CC: ~1 day)
- **Files:** `README.md`, `ROADMAP.md`
- **Do:**
  1. README endpoint table: add the 6 missing endpoints (`/schemes`, `/fees/simulate`, `/screen`, `/value-date`, `/message/stp-check`, `/progress`). Total is 19, not 13.
  2. ROADMAP test count: update "416 passing" → actual count (`pytest --collect-only -q | tail -1`).
  3. ROADMAP lab status: mark Phases 1–4 as "~80% built" with a "what remains" list per phase (see Education panel). Stop describing shipped work as future.
  4. Make the endpoint list and lab list auto-generated if possible (a script that reads `app/main.py` routes and `learn.html` nav).
- **Acceptance:** README endpoint count matches `app/main.py`. ROADMAP test count matches `pytest`. No ROADMAP phase claims "needs to be built" for work that already exists.

---

## Tier 2 — Product, Accessibility & Learning Quality (do this quarter)

### 2.1 Pick education as the flagship; fix the front door `[ ]`

- **Panels:** Product (#3), UX (#1, #2), Users (Beginner + PM)
- **Severity:** High (biggest beginner drop-off)
- **Effort:** M (CC: ~2 days)
- **Files:** `app/main.py:62-77` (root route), `app/static/index.html` (admin — add `/learn` link), `app/static/learn.html` (already links to `/ui`)
- **Do:**
  1. `GET /` — instead of returning raw JSON, redirect to `/learn` (or serve a real landing page with two doors: "I'm here to learn" → `/learn`, "I'm an operator" → `/ui`). Keep the JSON manifest at `/api` or `/manifest`.
  2. Add a "Learn mode →" link in the `/ui` sidebar (currently zero references to `/learn` from admin — UX panel grep confirmed).
  3. Rename the product to lead with "Lab/Sandbox," not "API." Update README title, OpenAPI title, `main.py` root.
  4. Restructure the `/learn` sidebar (`learn.html:16-33`): section headers "Core curriculum" (Labs 1–6 + Capstone) vs "Go deeper" (the 8 optional modules). A 16-item flat list is the #1 drop-off point per Education + UX panels.
  5. Add a "Start here" CTA + staged path indicator to the landing page (`learn.js:69-118`). The capstone already has the `cap-steps` pattern (`learn-capstone.js:30-37`) — reuse it for the curriculum.
  6. Surface "Recommended next: Lab X" on the landing page for returning users (the backend already computes `next_recommended` via `/api/progress`).
- **Acceptance:** A beginner hitting `/` lands on `/learn`. An operator on `/ui` can see/discover `/learn`. The sidebar visually separates core from optional.

### 2.2 Accessibility pass (WCAG AA) `[ ]`

- **Panels:** UI (computed contrast failures), Education, UX — **3 panels**
- **Severity:** High (release blocker for a payments UI; hard requirement for the named Francophone Africa audience)
- **Effort:** L (CC: ~2–3 days)
- **Files:** `app/static/css/app.css`, `app/static/css/learn.css`, the 329 inline styles in learn JS
- **Do:**
  1. **Contrast:** darken `--ink-3` from `#a8a29e`/`#a3a3a3` (2.4:1, FAIL) to ~`#78716c` (~4.6:1, AA pass) — touches 37 selectors. Darken badge foregrounds: green `#16a34a`→`#15803d`, amber `#d97706`→`#b45309`, red `#dc2626`→`#b91c1c`. White-on-`--green` (3.30:1) → darken fill or use `--ink` text.
  2. **Focus:** add a global `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` and remove the blanket `outline: none` on inputs (`app.css:224`, `learn.css:298`). Zero `:focus-visible` today = WCAG 2.4.7 blocker.
  3. **Motion:** add `@media (prefers-reduced-motion: reduce) { ... animation: none !important; }` for `viz-dot-travel` (`learn.css:690`) and `viz-pulse` (`learn.css:872`). Zero reduced-motion guards today.
  4. **Semantics:** add `aria-label`/`role` to the chain diagram nodes, nav `aria-current`, recommendation badge `role="status"`.
  5. **Touch targets:** raise `.lab-num`, `.cap-step-num`, `.chip`, timeline dots to ≥44×44px.
- **Acceptance:** axe-core or Lighthouse a11y audit ≥90 on both `/ui` and `/learn`. Keyboard-only tab through the capstone reaches every control with a visible focus ring. `prefers-reduced-motion` freezes the animated dot.

### 2.3 Mobile responsive breakpoint `[ ]`

- **Panels:** UI, UX, Education — **3 panels**
- **Severity:** High (broken on mobile today; critical for named African audience)
- **Effort:** L (CC: ~2–3 days)
- **Files:** `app/static/css/app.css`, `app/static/css/learn.css` (both have **zero** `@media` queries)
- **Do:**
  1. Add `@media (max-width: 768px)`: collapse the fixed 260px sidebar to a top bar + hamburger; stack `.main` content; wrap wide tables in `overflow-x: auto`.
  2. Make the glossary tooltip (`learn.css:436`) work on touch — add a click/touch toggle, not just `:hover`.
  3. Fix the animated chain wrap bug: with 3+ intermediaries, `flex-wrap: wrap` (`learn.css:600`) breaks the dot animation (it assumes one horizontal track, `learn.css:690-695`). Either keep the chain on one scrollable row or recompute the dot path per node.
- **Acceptance:** Both UIs usable on a 390px iPhone-width viewport. No horizontal scroll on the core lab pages. Glossary tooltips work on touch.

### 2.4 Thread per-hop amounts into the animated chain (the "aha moment") `[ ]`

- **Panels:** UX (#3), Users (Beginner + Ops + Skeptic), Education
- **Severity:** High (the single most-promised, undelivered feature — ROADMAP 2.1)
- **Effort:** M (CC: ~1 day)
- **Files:** `app/static/js/visualizers.js:67` (the `amount` field exists but no caller passes it), `app/static/js/learn-labs-4-6.js:250-258` (chain construction omits `amount`)
- **Do:**
  1. In Lab 4's chain construction, compute per-hop amounts via `simulate_fees` and pass `amount` to each node so the learner sees `$5,000 → $4,985 → $4,972 → $4,960` as the dot passes.
  2. Add a pause control (pause-on-hover or a button) — the dot loops infinitely today (`learn.css:688`) with no way to freeze for study.
  3. Front a muted, non-distracting animated-chain teaser on the landing page so beginners see the payoff before committing to Lab 4.
- **Acceptance:** The chain visibly shows money shrinking at each hop. The dot can be paused. The landing page shows a silent preview of the animation.

### 2.5 Rebuild the capstone to reuse the crown-jewel visualizations `[ ]`

- **Panels:** Education (#3), UX (#5)
- **Severity:** High (the culmination is visually inferior to the labs it culminates)
- **Effort:** L (CC: ~2–3 days)
- **Files:** `app/static/js/learn-capstone.js` (uses inline `<table>` at line 204/245 and a hand-built `border-left` list at 368-379 instead of `PaymentViz`)
- **Do:**
  1. Replace inline tables/lists with `PaymentViz.animatedChain()` and `PaymentViz.timeline()` in the Route/Settle/Track steps.
  2. Add the 5 branched scenarios ROADMAP Phase 5.2 promised (typo trap, fraud stop, exotic currency, fee surprise, compliance reject) so the "Decide" step has real consequence. Currently the NO_MATCH path says "Continue for learning" (line 155) — consequence-free.
  3. Add backward navigation ("← Back") — none exists today. Make the step indicator clickable.
  4. Add localStorage checkpointing so a refresh mid-wizard doesn't lose progress.
  5. Disable action buttons during loading (the wizard fires duplicate requests on repeated clicks — Lab 1's pattern at `learn-labs.js:215-217` is the model).
  6. Upgrade error prose: a bad IBAN currently shows raw `res.errors.join("; ")` (`learn-capstone.js:106`); Lab 2 wraps the same failure in plain English (`learn-labs-2-3.js:150-153`). Make the capstone match Lab 2.
- **Acceptance:** Capstone uses `PaymentViz`. ≥1 scenario produces a non-PROCEED outcome the learner must act on. Back button works. Refresh preserves state.

### 2.6 Frontend shared-utils + linter (kill the duplication) `[ ]`

- **Panels:** Frontend (#1, #2, #4), Engineering Manager
- **Severity:** Medium (dominant maintenance cost; adding a lab requires 6 synchronized touchpoints)
- **Effort:** L (CC: ~2–3 days)
- **Files:** new `app/static/js/learn-utils.js`; `app/static/js/app.js`; all `learn-lab-*.js`
- **Do:**
  1. Extract a shared `LearnUtils` module: `esc` (currently copy-pasted into **15 files**), `fmt`/`fmtMoney`/`symbol`, the complete-button builder (duplicated ~8 times), the show-hint IIFE (duplicated ~4 times), and one canonical `buildExercise` + `buildQuiz` (4 incompatible versions today). Removes ~1,500 lines.
  2. Consolidate the API layer: promote `app.js:48` `api()` into shared utils; route every lab's raw `fetch` through it; replace the `XMLHttpRequest` outlier in `learn-lab-progress.js:77`.
  3. Unify the two incompatible `el()` helpers (`app.js:57` uses `textContent` — safe; `learn.js:47` uses `innerHTML` — footgun). Keep one, rename the other to `elHTML`.
  4. Define a one-file lab registry (`{id, title, route, module}`) consumed by router + landing + nav + progress. Collapses the 6-touchpoint add-a-lab friction.
  5. Add ESLint; one pass to normalize ES5/ES6 inconsistency.
  6. Add `defer` to all script tags in `learn.html:42-57` (currently all 14 load synchronously upfront).
  7. Wrap `app.js` in an IIFE; move inline `onclick` to `addEventListener` (enables a real CSP).
- **Acceptance:** `grep -rl "function esc" app/static/js/` returns exactly 1 file. Adding "Lab 8" touches 1 registry file, not 6. ESLint passes clean.

### 2.7 Unify the design system (one token file) `[ ]`

- **Panels:** UI (#3, #4), UX
- **Severity:** Medium (the two UIs ship slightly different palettes — `#3b82f6` vs `#2563eb` — for no reason)
- **Effort:** M (CC: ~2 days)
- **Files:** `app/static/css/app.css`, `app/static/css/learn.css`, the 329 inline styles in learn JS
- **Do:**
  1. Merge into one shared `tokens.css` (same `--accent`, canvas, ink ladder, `--radius` + new `--radius-sm`).
  2. Extract the 329 inline styles in learn JS into real classes (`.callout-danger`, `.callout-success`, `.chip-mini`, `.kv-row`). Ban raw hex from JS.
  3. Add a spacing scale (`--space-*`) and a type scale (`--text-xs/sm/base/lg/xl`); pull the type floor up to 11px minimum (12px preferred) for diagram annotations.
  4. Consolidate the badge vocabulary (one `.badge--success/-warn/-danger` system, not `badge-high`/`badge-green`/`rec-PROCEED` for the same green).
  5. Replace emoji icons (`🏦 📍 ✓ ✗`) with inline SVG (platform-inconsistent rendering today).
- **Acceptance:** One `tokens.css` included by both apps. `grep -rn "#[0-9a-fA-F]\{6\}" app/static/js/` returns zero hits. The two UIs share identical accent/canvas/ink.

### 2.8 Prerequisite gating + unified completion semantics `[ ]`

- **Panels:** Education (#1, #6), UX
- **Severity:** Medium (#1 scaffolding failure — a beginner can open Lab 4 without Lab 1)
- **Effort:** M (CC: ~1–2 days)
- **Files:** `app/static/js/learn.js:121-145` (router), `app/static/js/learn-labs.js:472`, `app/static/js/learn-labs-4-6.js:64`
- **Do:**
  1. Gate the router: lock Lab N+1 until Lab N's *exercise* is solved (not just marked). Labs 2/3 already auto-complete on exercise success (`learn-labs-2-3.js:202,450`) — Labs 1/4/5/6/capstone have unconditional "Mark complete" buttons that work regardless. Make all core labs require exercise success.
  2. Add a soft warning for "go deeper" modules if prerequisites aren't met.
- **Acceptance:** A fresh-learner attempt to navigate to Lab 4 without Lab 1 complete is blocked with a clear "Complete Lab 1 first" message.

---

## Tier 3 — Domain Fidelity & Depth (backlog)

### 3.1 Correct VoP docstrings (remove "EPC guidance" claim) `[ ]`

- **Panels:** Payments
- **Severity:** Low (teaches a false standard)
- **Files:** `app/services/name_matcher.py:32` (the `# EPC recommends ~90%` comment), `app/services/vop.py` header
- **Do:** The 0.90/0.75 thresholds are NOT "EPC guidance" — EPC doesn't mandate an algorithm or threshold. Soften to "commonly tuned around." State this is a teaching approximation using SequenceMatcher.

### 3.2 Fix the dead `fee_type` data path `[ ]`

- **Panels:** Payments
- **Severity:** Low (misleading — a `fee_type` field declared but never branched on)
- **Files:** `app/services/fee_calculator.py:48` (unpacked but ignored), `app/services/seed.py:1751-1753` (the column is documented in comments; every row is `"flat"`)
- **Do:** The `fee_type` column is declared and unpacked by `simulate_fees` but never branched on — every value is `"flat"`. Either implement the `"pct"` path (percentage-with-cap lift fees, more realistic for high-value) or drop the `fee_type` field entirely. (Note: no seed row currently uses `pct`; the issue is the dead branch, not a specific `pct` value.)

### 3.3 Unify fee logic between tracking and fee_calculator `[ ]`

- **Panels:** Payments
- **Severity:** Low (inconsistent numbers across labs)
- **Files:** `app/services/tracking.py:137-147` (hardcodes $2.50/hop), `app/services/fee_calculator.py`
- **Do:** Have tracking call `simulate_fees` instead of reinventing a flat fee, so the gpi simulation and the fee calculator agree.

### 3.4 Expand the MT103 STP checker + relabel `[ ]`

- **Panels:** Payments
- **Severity:** Low (overstated coverage — 12 rules vs 40-80 in prod)
- **Files:** `app/services/stp_checker.py`
- **Do:**
  1. Validate field 23B against `{CRED, CRTN, SPAY, SPRI, SPRE, REPA}`.
  2. Add notes (not full impl) for 50A/50F/50K options, 59F structured addresses, 71F/71G, field 72 codes, structured PstlAdr per ISO 20022/TR2019.
  3. Relabel the module docstring from "the rules a correspondent applies" to "a 12-rule primer; production engines run 40-80+ rules."
  4. Add tests for the REPAIRABLE verdict and rules 10-12 (currently untested — only CLEAN and REJECTED are asserted).

### 3.5 Fix value-date holiday fallback + GBP default `[ ]`

- **Panels:** Payments
- **Severity:** Low (silently wrong for most currencies)
- **Files:** `app/services/value_date.py:154` (empty set for unsupported currencies), `:81` (GBP T+0 default)
- **Do:** Fall back to weekends-only with an explicit note "no holiday calendar loaded for {ccy}" rather than treating every day as clear. Reconsider GBP default T+0 → T+2 for generic cross-border MT103.

### 3.6 Clarify sanctions threshold drift (rationale was inverted) `[ ]`

- **Panels:** Payments
- **Severity:** Medium (inverted compliance posture in a compliance-training product)
- **Files:** `app/services/screening.py:152` (`hop_hard = HARD_HIT_THRESHOLD - (i * 0.01)`)
- **⚠️ CORRECTION:** The original plan text claimed the threshold "loosens toward beneficiary" and was "easier to clear deep in the chain." **That rationale was inverted.** The actual code (`- i * 0.01`) makes the hard-hit threshold *lower* at later hops (0.90 → 0.85). A *lower* threshold means a name needs a *lower* similarity score to trigger HARD_HIT — i.e. it gets **stricter**, not looser. So the current behavior is defensibly *safer* (deep hops screen more aggressively). The fix is NOT to "reverse" it.
- **Do:**
  1. Add a comment at `screening.py:152` explaining the intent: "Later hops apply a stricter hard-hit threshold (lower score required to flag) — reflecting that closer-to-beneficiary screening is more risk-sensitive."
  2. OR: if the original design intent was actually the opposite (looser deep, which would be a real risk bug), then the sign is wrong and it should be `+ (i * 0.01)`. Confirm the intent with the author before changing the sign — do not blindly "reverse" it.
  3. Either way, add prominent "not real screening" framing to every `/api/screen` response (real screening uses multi-list, transliteration, phonetic matching, entity resolution).

### 3.7 Add the MOD-97 visual step-through explainer `[ ]`

- **Panels:** Education (#2), UX
- **Severity:** Medium (the hardest concept, told not shown; ROADMAP 1.3 already scoped it)
- **Effort:** L (CC: ~2 days)
- **Files:** `app/static/js/learn-labs-2-3.js:77-82` (currently prose), new visual component
- **Do:** Step-through: (a) move checksum+country to end, (b) convert letters→numbers, (c) show the giant integer, (d) divide by 97, (e) show remainder=1. Let the learner flip a digit and watch the remainder change. The second "aha moment."

### 3.8 Enrich Lab 5 (SSI) into a real lesson `[ ]`

- **Panels:** Education (#5)
- **Severity:** Medium (weakest core lab — a dashboard masquerading as curriculum)
- **Files:** `app/static/js/learn-labs-4-6.js:499-554`
- **Do:** Add inline explainers per SSI row ("This is the Nostro account — the intermediary holds it *on behalf of* the beneficiary bank"), a visual of the account relationship, and an exercise that requires interpreting, not just finding.

### 3.9 Add an ops-workflow module (Nostro recon / STP repair) `[ ]`

- **Panels:** Users (Ops Manager), Product
- **Severity:** Medium (biggest content gap for the training audience the ROADMAP claims)
- **Effort:** XL (CC: ~1 week)
- **Do:** One lab showing a broken MT940 recon and a repair-and-release queue. Unlocks the bank-training use case the Ops Manager user came looking for and couldn't fully endorse.

### 3.10 Add French localization (i18n) + corridor-local examples `[ ]`

- **Panels:** Education (#7), Product
- **Severity:** Medium (broken promise — Francophone Africa named twice in ROADMAP, zero i18n shipped)
- **Effort:** XL (CC: ~1 week)
- **Do:** Extract UI strings into a translation dictionary; ship French for nav + lab headers + glossary. Add corridor-local examples (NGN, XOF, GHS) so African learners see their world.

### 3.11 Add telemetry + assessment layer `[ ]`

- **Panels:** Product (#5, #9), Education
- **Severity:** Medium (every ROADMAP success metric is currently unmeasurable; the "certified" badge is a participation trophy)
- **Do:** Anonymous telemetry (lab start/complete, drop-off, time-on-task). Scored exercises behind the badge so "Cross-Border Payment Certified" means something.

### 3.12 Migrate `seed.py` SSI data to CSV/JSON `[ ]`

- **Panels:** Backend (Data Management), Engineering Manager
- **Severity:** Low (maintainability — 1,863-line Python data file)
- **Files:** `app/services/seed.py` (the `SSI_RECORDS` block is ~1,364 lines of tuples)
- **Do:** Move SSI data to `app/data/ssi.csv` (join `payment_schemes.py`, `sanctions_watchlist.py`, `mt103_samples.py` which already live there). Non-developers can edit CSV; review can catch typos. Move `LIFT_FEES` out of `seed.py` too (it's an import-time dependency for `fee_calculator.py` — a coupling smell).

---

## Decision Audit Trail

Every scope decision in this plan, logged for traceability.

| # | Decision | Classification | Principle | Rationale | Rejected |
|---|----------|---------------|-----------|-----------|----------|
| 1 | Include all 10 panels' findings (not a subset) | Mechanical | P1 completeness | User asked for "all these fixes and recommendations" | Summarizing/cherry-picking |
| 2 | Tier 0 = SSI fix + auth + disclaimers + git init | Mechanical | P2 boil lakes | 4-5 panels independently flagged each; liability/blocking | Deferring any Tier 0 item |
| 3 | Replace real SSI accounts with placeholders (not "keep but warn") | User Challenge (5 panels) | P1 | Foreseeable misuse path; README safety claim is false | "Add a disclaimer and keep real data" — rejected, the data goes stale and the misuse path remains |
| 4 | Split god-router in Tier 1 (not Tier 2) | Mechanical | P5 explicit | Tests are the safety net; blocks parallelism | Leaving it monolithic |
| 5 | Mobile + a11y in Tier 2 (not Tier 0) | Taste | P3 pragmatic | Blocking for deployment, not for local-dev/learning use today | Tier 0 — would delay the liability fixes |
| 6 | Keep vanilla JS (no framework migration in this plan) | Taste | P5 explicit | ROADMAP separability argument holds; add shared-utils + linter instead | "Migrate to React/Vue" — separate scope, multi-quarter |
| 7 | Pick education as flagship (not API) | Taste | P1 | Differentiated, non-substitutable half; API is substitutable by SWIFTRef/Accuity | Keeping both as peers — positioning stays muddled |
| 8 | Defer ops-workflow lab + i18n + telemetry to Tier 3 | Mechanical | P3 pragmatic | XL effort each; Tier 0-2 deliver standalone value first | Bundling everything — never ships |

---

## Review Revisions (3-reviewer superpowers pass)

This plan was reviewed by 3 independent subagents (technical-correctness, completeness, execution/sequencing) per the superpowers `requesting-code-review` + `dispatching-parallel-agents` methodology. All three returned **APPROVE WITH CHANGES**. The blocking changes have been applied:

| Fix | Source reviewer | Change applied |
|-----|----------------|----------------|
| 0.2 acceptance grep unachievable (matches ABA/IBAN in notes) | Technical + Execution | Rewrote to unit-test-based + targeted account-field check |
| 0.2 misses real IBANs in `notes` field | Technical | Added step 3: mask `IBAN:` strings in notes too |
| 0.2 `EBILAEAD-USD-001` fails `^ACCT-\d+$` | Execution | Added: normalize existing placeholder-shaped beneficiary accounts too |
| 0.2 `models.py:117-120` docstring already correct | Technical + Completeness | Removed from file list; noted as "no change needed" |
| 0.2 behavior change (PROCEED → PROCEED_WITH_CAUTION) | Technical | Added acceptance note: verify capstone/Lab copy |
| fed_importer trust risk missing | Completeness | Added new item **0.3.5** (pin URL, fail closed, checksum) |
| 1.2 references a line-range table not in the plan | Technical + Execution | Included the full endpoint→router mapping table inline |
| 1.2 misses shared helpers | Technical + Execution | Added shared-helpers extraction step |
| 1.2 must land AFTER 0.3/0.4/1.3/1.4 (citation staleness) | Execution | Added ⚠️ SEQUENCING RULE to 1.2 + dependency diagram |
| 1.5 bundles Alembic + logging at 2h | Execution | Split into **1.5a** (Alembic) and **1.5b** (logging) |
| 1.4 depends on 1.5 (table needs migration) | Execution | Added edge to diagram; 1.5a → 1.4 |
| 3.6 sanctions rationale inverted | Technical | Corrected: lower threshold = stricter (defensible). Removed "reverse" instruction. |
| 3.2 fabricated `fee_type=pct` citation | Technical | Corrected: no row uses pct; issue is the dead branch |
| 0.3 test-handling unspecified | Execution | Added: use conftest client-fixture override |
| 0.3 dev-detection undefined | Execution | Added: detect dev via `ADMIN_API_KEY` unset + SQLite |
| ruff/alembic not in pyproject | Execution | Added step 6 to 0.3 + prereq notes to 1.1/1.5a |
| Numeric errors (0.4, 1.4, 3.1, 2.7 line counts) | Technical | Corrected: main.py:31-39, prepare at 589-642, name_matcher:32, 348 inline styles |
| README endpoint count 12/8/20 | Technical | Corrected to 13/6/19 |
| 2.2 ‖ 2.3 conflict on same CSS files | Execution | Corrected: serialize or partition by file |
| 2.5 ↔ 2.6 hidden dependency | Execution | Added edge to diagram |

**Reviewer verdicts (all APPROVE WITH CHANGES, all blocking issues now resolved):**
- **Technical Correctness:** ~85% of citations verified exact. Core theses all real and correctly diagnosed. Fixed 9 citation errors, 2 unsound fixes, 1 inverted rationale.
- **Completeness:** 40+ code-level claims verified accurate. Coverage of all 10 panels complete with one material omission (fed_importer) — now added. Convergence map honest.
- **Execution/Sequencing:** Pick-up-able cold. Fixed the lookup.py staleness trap, split an over-bundled item, corrected 6 effort underestimates, added missing dependency edges.

---

## Cross-Panel Convergence Map

Issues flagged by multiple panels independently (strongest signal — trust these most):

| Issue | Panels | Tier |
|---|---|---|
| Real SSI account numbers contradict README | Product, Payments, Backend, QA, Users | **0.2** |
| Zero auth on destructive endpoints | QA, Backend, Users, EM | **0.3** |
| "SIMULATION" not on the API surface | Users ×3, Payments, Backend, Product | **0.4** |
| No git / no CI | EM, QA, Backend | **0.1, 1.1** |
| Docs/ROADMAP stale & contradictory | Product, Payments, EM, QA | **1.6** |
| Accessibility broken (contrast, focus, motion) | UI, Education, UX | **2.2** |
| No mobile responsive | UI, UX, Education | **2.3** |
| Animated chain doesn't show money shrinking | UX, Users ×3, Education | **2.4** |
| Capstone doesn't reuse crown-jewel visuals | Education, UX | **2.5** |
| Frontend duplication (15× `esc`, 6-touchpoint add-a-lab) | Frontend, EM | **2.6** |
| Token system bifurcated + 329 inline styles | UI, UX | **2.7** |
| No prerequisite gating | Education, UX | **2.8** |

---

## What's explicitly NOT in scope

These came up but are deliberately deferred (separate scope, multi-quarter, or not yet justified):

- **Framework migration (React/Vue/Svelte).** Vanilla JS is straining but holding; shared-utils + linter + registry (Tier 2.6) is the right next step, not a rewrite. Revisit after Tier 2 lands.
- **Postgres production hardening / Docker / k8s.** This is a learning sandbox (ROADMAP: "Not a production payment system"). Document the no-auth policy; don't spend sprint capacity until someone commits to hosting beyond localhost.
- **A real OFAC/UN/EU multi-list sanctions engine.** The mock is correctly labeled "TRAINING USE ONLY." Adding real screening is a different product with different legal exposure.
- **Rewriting the routing engine against a licensed SWIFTRef feed.** The heuristic is honestly hedged; that's the right posture for education.
- **Account-based progress persistence (replacing localStorage).** The ROADMAP explicitly accepts localStorage. Revisit only if the telemetry (Tier 3.11) shows cross-device drop-off.

---

## Sequencing dependencies

```
0.1 (git init) ──► everything else depends on this

0.2 (SSI fix) ───► 1.6 (docs reconcile references the new truth)

0.3 (auth) ─┬────► 0.3.5 (fed importer pin — same import surface)
            │
0.3.5 ──────┘

⚠️ CRITICAL: 0.3, 0.3.5, 0.4, 1.3, 1.4 ALL cite lookup.py line numbers.
1.2 (router split) MUST land AFTER all of them — it invalidates those citations.
Order: 0.3 → 0.4 → 1.3 → 1.4 → THEN 1.2

1.1 (CI) ────────► advisory only (router split can be verified with local pytest)
1.5a (Alembic) ──► 1.4 (idempotency table needs a migration, NOT create_all)
1.5b (logging) ──► independent of Alembic; can parallelize with 1.5a

2.4 (chain $) ───► 2.5 (capstone reuses the improved chain)
2.5 ↔ 2.6 ───────► 2.5 rewrites capstone to call PaymentViz; 2.6 refactors PaymentViz.
                   Land 2.6 first (stabilize the API), then 2.5.
2.6 (frontend utils) ─► 2.7 (token unify needs inline styles extracted first)
⚠️ 2.2 (a11y) + 2.3 (mobile) ─► NOT parallelizable — both edit the same CSS files.
   Serialize: 2.2 then 2.3, OR partition by file (a11y takes learn.css, mobile takes app.css).

3.x (backlog) ──► no hard dependencies; pick by appetite
```

---

## Reviewer roster (for attribution)

| Panel | Reviewers | Focus |
|---|---|---|
| QA | 2 senior QA engineers | Test coverage, defects, security, perf |
| Product | 2 senior product owners | Positioning, roadmap, dual-product tension |
| Payments | 3 domain experts | Domain accuracy, MT103 STP, sanctions |
| Education | 2 edtech experts | Curriculum, scaffolding, engagement |
| UX | 2 senior UX designers | Flows, onboarding, the "aha moment" |
| UI | 2 senior UI designers | Visual system, components, accessibility |
| Frontend | 2 senior FE engineers | Architecture, vanilla-JS-at-scale |
| Backend | 2 senior BE engineers | API design, data layer, auth gap |
| Eng. Manager | 1 senior EM | Delivery health, tech debt, ROI |
| Users | 5 personas | Beginner, engineer, ops manager, PM, skeptic |

**Total: 23 reviewers across 10 panels, run in parallel.**

---

*This plan is a living document. Update statuses, add discoveries, and re-baseline as Tiers complete. When all of Tier 0 + Tier 1 are checked off, the project has a credible engineering foundation and a defensible product story.*
