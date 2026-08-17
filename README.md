# Relay — Educational Payment Simulation

> **Explore the network behind every payment.**

Relay is a hands-on, browser-based simulator that teaches how cross-border payments actually work — not by reading slides, but by validating real-format IBANs, running VoP checks, tracing correspondent chains, and decoding MT103/pacs.008 messages against live API endpoints.

**It is NOT a production payment system.** No real money moves. Every "payment" is simulated. Account numbers are `ACCT-` placeholders. The persistent label is **Educational payment simulation**.

---

## Current status

**Status as of 2026-08-15:** Relay is a working educational learning prototype. The platform,
backend APIs, Relay frontend, a 16-entry curriculum (15 learning modules plus a capstone), a daily-practice retention loop,
and five Case Desk scenarios are implemented. The three curriculum tracks the prior review named as gaps
— sanctions screening, exceptions/returns, and an ops workflow (STP repair + Nostro reconciliation) —
shipped as modules 13-15 with correct-answer gating and tests; the project
remains a learning prototype — not production payment processing.

| Area | Status | What that means |
|---|---|---|
| Core platform | Shipped | FastAPI backend plus the React Relay app at `/app` |
| Technical syllabus | Refined | Labs 1–9, UK/Eurozone rails, Canada rails, Fees & FX, Sanctions Screening, Exceptions & Returns, the Ops Desk, and a capstone — interactive, gated on correct answers, and tested |
| Applied learning | Expanded | Five Case Desk scenarios (CA→US, UK→DE, NG→UK, US→MX, US→NG) at `/app/learn/cases/:caseId` |
| Learning persistence | Shipped (browser-local) | Anonymous learner profiles and local progress/activity/practice/case-session storage. Manual JSON backup import/export is built but its Overview panel is hidden for now |
| Legacy migration | Front door cut over | `/` now lands on Relay at `/app`. Vanilla `/learn` and `/ui` remain reachable, and `/` falls back to `/learn` when the Relay build is absent |
| Retention loop | Shipped | Daily practice drill, spaced review of missed questions, and streaks at `/app/learn/practice` |
| Learning analytics | Shipped (provider-neutral) | Privacy-bounded app, module, practice, and Case Desk instrumentation behind a no-op sink; provider integration remains deferred |
| Next focus | Open for contribution | Run and synthesize the approved five-case learner research, alongside French i18n |

The syllabus handoff is in [Syllabus handoff](#syllabus-handoff) below.

### Verified health snapshot

These numbers were run against the current checkout on 2026-08-15:

| Metric | Result |
|---|---|
| Backend tests | **1,302 passed** (`.venv/bin/pytest -q`) |
| Frontend unit/integration tests | **1,172 passing** (`cd frontend && npm test -- --run --no-file-parallelism`; the default parallel run is still load-sensitive for the Case Desk preferred-tier scenario) |
| Playwright E2E | **289 passed, 10 intentional skips, 1 pre-existing axe failure** — six-project Chromium matrix; the generic WebKit `mobile` project was not run because its browser binary is not installed. The axe failure is `scrollable-region-focusable` on the bank-detail SSI table scroll. |
| TypeScript + production build | Passed (`tsc --noEmit` + Vite) |
| Eager shell bundle | **133,366 bytes gzip** (budget: 204,800 bytes) |
| Learning curriculum | **16 entries** (15 learning modules plus capstone) + daily practice drill (52-question bank) |
| Backend API endpoints | **27** |

The frontend suite is currently verified with the standard Vitest command above.

The provider-neutral instrumentation from the approved [telemetry and learner-research design](docs/superpowers/specs/2026-08-12-relay-telemetry-and-learner-research-design.md)
is shipped. The next product-learning step is to run and synthesize its five-case research
protocol. Provider integration is deliberately deferred.

Every E2E skip is intentional, and the total depends on how many projects you run rather than on
anything being broken. Two tests skip by rule:

- **Learner-state round trip** — runs in the `desktop` project. The five case-viewport projects skip it because coverage is not viewport-dependent.
- **Reduced-motion case journey** — skips in every project *except* `case-reduced-motion`.

So the six-project Chromium matrix skips `5 + 5 = 10`. A full seven-project run adds the WebKit
`mobile` project, which requires the WebKit browser binary. Quote the rule and matrix used, not a
bare total. See [Testing](#testing) for the recommended commands.

---

## What's been built

### The numbers

| Metric | Value |
|---|---|
| Backend tests | 1,302 passing |
| Frontend tests | 1,172 passing (serial-file mode) |
| E2E tests (Playwright) | 289 passing on the six-project Chromium matrix (10 intentional skips; 1 pre-existing SSI-table axe failure) |
| Eager shell bundle | 133,366 bytes gzip (budget: 204,800 bytes) |
| Learning curriculum | 16 entries (15 learning modules plus capstone) |
| Case Desk scenarios | 5 |
| Backend API endpoints | 27 |

### Architecture

```
swift-routing/
  app/                        FastAPI backend (Python 3.10+)
    routers/                  11 domain routers under /api/*
    services/                 Domain logic (validator, routing, vop, prepare, iso20022, ...)
    models.py                 SQLAlchemy 2.0 models
    schemas.py                Pydantic v2 schemas
    auth.py                   API key auth (X-Admin-Key)
    data/payment_schemes.py   Enriched rail data (CAD, GBP, EUR with limits/protections/roadmaps)
    static/                   Legacy vanilla JS frontend (/learn, /ui) — still served
    static/relay/             Built Relay React app (generated by Vite)
  frontend/                   Relay React frontend (TypeScript 7, Vite 8)
    src/
      app-shell/              Shell, navigation, error boundary, routing
      design-system/          Tokens, Button, StatusChip, AsyncRegion, PaymentRoute, ScoreBar
      api/                    Typed client, Zod schemas, MSW test harness
      lib/persistence/        Versioned localStorage + local learner profile + backup/export import
      features/
        overview/             Adaptive home (selectPrimaryAction decision table)
        explore/              CommandSearch, BankDirectory, Glossary, SchemesTable
        operate/              PreparePayment, Fees, Screening, ValueDate, STP+Pacs008, Tracking
        learn/                Curriculum, cases, prerequisite gating, progress, capstone
          labs/               Labs 1–9 + UK/Eurozone + Canada + Fees/FX + Capstone
          practice/           Daily drill, question bank, spaced review, streaks
          cases/              Case Desk, supplier case catalog, evidence and debrief flow
          components/         Exercise, MultipleChoice, Decompose, ScoreBar, StepIndicator
  tests/                      Backend test suite (pytest)
  DESIGN.md                   Canonical design contract
  alembic/                    Database migrations
  .github/workflows/          CI (pytest + ruff, plus frontend build/tests)
```

### Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 |
| Frontend | React 19, TypeScript 7 (strict), Vite 8 |
| State | TanStack Query 5 (server), React Hook Form 7 (forms) |
| Validation | Zod 4 (frontend), Pydantic v2 (backend) |
| Testing | pytest (backend), Vitest + RTL + MSW (frontend), Playwright (E2E) |
| CI | GitHub Actions — pytest + ruff on Python 3.10-3.12, plus a frontend job (typecheck, build, vitest, bundle budget) |

---

## Quick start

### Backend (FastAPI)

```bash
cd swift-routing
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

- API docs: <http://127.0.0.1:8000/docs>
- SQLite (`swift_routing.db`, auto-created + seeded). No Docker/Postgres needed.

### Frontend (Relay — React + TypeScript + Vite)

```bash
# Terminal 2 — frontend dev server (proxies /api to backend)
cd frontend && npm install && npm run dev
```

Vite serves Relay at `http://127.0.0.1:5173/app/` with `/api` proxied to port 8000.

For production build (served by FastAPI at `/app`):
```bash
cd frontend && npm run build
```

---

## Deploying to Vercel

Import the repository at [vercel.com/new](https://vercel.com/new). Vercel
auto-detects the FastAPI instance exported as `app` in `app/main.py`, so the
whole project — API, Relay SPA, and the legacy `/learn` and `/ui` surfaces —
deploys as a single Vercel Function. `vercel.json` supplies the frontend build
step and trims the function bundle.

### Environment variables

| Variable | Value | Why |
| --- | --- | --- |
| `ADMIN_API_KEY` | any strong random string | **Required on a public deploy.** With it unset, `app/auth.py` treats the deployment as dev mode and leaves `/api/import/*` and `/api/track/create` open to anyone. |
| `DATABASE_URL` | `sqlite:////tmp/swift_routing.db` | The project filesystem is read-only; `/tmp` is the only writable path. `app/config.py` falls back to this automatically when `VERCEL` is set, but that system variable is opt-in per project — setting `DATABASE_URL` explicitly is the reliable route. |
| `SENTRY_DSN` | Sentry backend project DSN | Optional. Sentry error monitoring is disabled when this is unset. Store it in Vercel/GitHub environment configuration, not source control. |
| `SENTRY_ENVIRONMENT` | `production` | Optional environment label shown in Sentry. |
| `SENTRY_TRACES_SAMPLE_RATE` | `0` | Optional performance-trace sampling rate from `0` to `1`; keep `0` to collect errors without tracing. |
| `SENTRY_SEND_DEFAULT_PII` | `false` | Optional. Keep false unless the privacy implications of sending request user data have been reviewed. |

The React frontend uses its own Sentry project and only reads these public
Vite variables at build time:

| Variable | Value | Why |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | Frontend project DSN | Optional. The browser SDK stays disabled when this is unset. The DSN is safe to expose in a browser bundle. |
| `VITE_SENTRY_ENVIRONMENT` | `production` or `preview` | Optional environment label; set separately for Vercel Production and Preview. |
| `VITE_SENTRY_RELEASE` | deployment/release identifier | Optional. The same value is used by the browser SDK and source-map upload; when unset, Vercel/CI commit metadata is used when available. |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Optional rate from `0` to `1`; keep low in production to control volume. |

For private frontend source maps, set these build-time Vercel variables as
well. They must not use the `VITE_` prefix: `SENTRY_ORG`, `SENTRY_PROJECT`
(the frontend project slug), and `SENTRY_AUTH_TOKEN`. When all three are
present, Vite uploads maps to Sentry and deletes them from the public output.
Without them, the build still succeeds but skips source-map upload.

The frontend deliberately does not enable Session Replay or browser logs yet.
Errors and sampled route/API tracing are collected with request bodies, query
parameters, cookies, headers, breadcrumbs, user identity, and stack-frame
variables disabled, with an additional event scrubber before send.

Sentry is initialized before the FastAPI app is constructed. To verify a local
setup, set `SENTRY_DSN` in your shell and run this isolated smoke test:

```bash
SENTRY_DSN="$SENTRY_DSN" .venv/bin/python - <<'PY'
import sentry_sdk

from app.observability import init_sentry

if not init_sentry():
    raise SystemExit("Sentry is disabled; set SENTRY_DSN first")

try:
    raise RuntimeError("local Sentry verification")
except RuntimeError:
    sentry_sdk.capture_exception()
    sentry_sdk.flush(timeout=5)
PY
```

The integration removes HTTP request bodies, query strings, cookies, headers,
URLs, logging payloads, breadcrumbs, exception text, exception locals, and
transaction/span payloads before sending events. If tracing is enabled, only
timing and non-content span fields remain. Do not add a public debug route that
deliberately raises an exception to a deployed app.

Note the four slashes in the SQLite URL: `sqlite://` plus the absolute path
`/tmp/swift_routing.db`.

### What the ephemeral database means

Each function instance gets its own `/tmp`, recreated and reseeded on cold
start. Everything the app reads — 237 banks, 559 SSI records, 72 corridor
rules — comes from `seed.py`, so reads behave identically to local. Writes do
not persist: a simulated gpi timeline created through `/api/track/create` can
return 404 from `/api/track/{uetr}` if the follow-up request lands on a
different instance. Point `DATABASE_URL` at managed Postgres (and run
`alembic upgrade head`) if you need writes to survive.

---

## The learning curriculum (16 entries: 15 learning modules plus capstone)

Each lab teaches one concept through concept → demo → exercise → feedback, with checkpoint-based
completion. The Learn index currently puts the Case Desk entry above these technical modules;
the case is an applied scenario and is not counted in the curriculum total.

| # | Lab | Teaches | Key API |
|---|---|---|---|
| 1 | Identifiers: BICs & IBANs | BIC/IBAN decomposition, live validation | `/api/validate`, `/api/lookup` |
| 2 | MOD-97 Checksums | IBAN checksum algorithm (chunked modulo) | `/api/validate` |
| 3 | Verification of Payee | MATCH/CLOSE_MATCH/NO_MATCH/NOT_CHECKED + score bars | `/api/verify-payee` |
| 4 | Correspondent Routing | Nostro/Vostro, SSI-first routing, CHIPS vs Fedwire, serial vs cover | `/api/route` |
| 5 | Settlement Instructions | SSI tables, OUR/SHA/BEN charge codes | `/api/ssi` |
| 6 | UETR Tracking | SWIFT gpi tracking, payment timelines, fee deduction | `/api/track/create` |
| 7 | Payment Schemes | 7 scenario quizzes comparing global payment rails | `/api/schemes` |
| 8 | MT103 → ISO 20022 | pacs.008 translation, structured addresses, Nov 2025 migration | `/api/message/translate`, `/api/message/pacs008-check` |
| 9 | Rails Deep-Dive: Canada & UK | Interac Autodeposit, CHAPS pacs.008, EFT windows, APP reimbursement | `/api/schemes` (enriched), `/api/verify-payee`, `/api/message/pacs008-check` |
| 10 | Rails Deep-Dive: UK & Eurozone | CHAPS, Bacs, Faster Payments, TARGET2, SEPA, SCT Inst, and cut-offs | `/api/schemes` (enriched), `/api/value-date` |
| 11 | Rails Deep-Dive: Canada | Lynx, EFT/ACSS, Interac, and the Real-Time Rail | `/api/schemes` (enriched) |
| 12 | Follow the Money: Fees & FX | Lift-fee chains under OUR/SHA/BEN, predict-then-verify, hidden FX margin | `/api/fees/simulate` |
| 13 | Stopped at the Border: Sanctions Screening | Watchlist decision bands, per-hop re-screening, grey-zone exercise, false positives | `/api/screen` |
| 14 | When Payments Fail: Exceptions & Returns | pacs.002 rejects vs pacs.004 returns vs camt.056 recalls, return reason codes, NO_MATCH aftermath | `/api/track/create` |
| 15 | The Ops Desk: STP Repair & Nostro Recon | Repair-queue workflow on the live STP checker, ledger-vs-statement break hunting | `/api/message/stp-check` |
| ★ | Capstone | 6-step full payment simulation with NO_MATCH branching (requires Labs 1–9) | All endpoints |

Every lab now gates completion on at least one correct answer — opening demos alone never
completes a module. A daily five-question drill at `/app/learn/practice` draws from completed
modules (from a 52-question bank), resurfaces missed questions on a 1/3/7-day review schedule, and tracks streaks locally.

### Four workspaces

| Workspace | Routes | Purpose |
|---|---|---|
| **Overview** | `/app` | Adaptive primary action, local progress, activity log, badges |
| **Learn** | `/app/learn`, `/app/learn/:id`, `/app/learn/practice`, `/app/learn/cases/:caseId` | Technical curriculum, daily practice drill, applied Case Desk |
| **Explore** | `/app/explore`, `/app/explore/banks`, `/app/explore/glossary`, `/app/explore/schemes` | Command search, bank directory, glossary, rails table |
| **Operate** | `/app/operate`, `/app/operate/*` | Prepare payment, fees, screening, value date, STP checker, tracking |

---

## Learning state and backups

Relay keeps learning state anonymous and browser-local. There are no learner accounts, no backend learner database, and no automatic cross-device sync yet.

A manual learning-backup flow is implemented, but **its Overview panel is hidden
for now**, so there is currently no way to reach it from the UI. The behaviour
below describes the flow as built (`LearnerDataPanel`, `learnerStateTransfer`,
`learnerStateMerge`); restore the panel in `OverviewPage.tsx` to expose it again.

- Included in backup JSON: completed modules, daily-practice history/review state, recent learning activity, and Case Desk sessions
- Excluded from backup JSON: payment drafts, UI preferences, telemetry, secrets, caches, and transient UI state
- Transfer model: download a JSON backup from one browser/device, then import it manually into another browser/device

If browser storage is unavailable, Relay falls back to a session-only learner profile. In that mode the current tab still works, but progress may not survive closing the browser — and with the backup panel hidden there is no in-app way to export before leaving.

---

## Syllabus handoff

If you want to work on the syllabus, start with these files rather than the legacy vanilla-JS
lesson scripts:

| File | Role |
|---|---|
| [`frontend/src/features/learn/curriculum.ts`](frontend/src/features/learn/curriculum.ts) | Module order, titles, durations, prerequisites, outcomes, and categories — the syllabus source of truth |
| [`frontend/src/features/learn/labRegistry.tsx`](frontend/src/features/learn/labRegistry.tsx) | Maps each module ID to its lazy-loaded content and required completion checkpoints |
| [`frontend/src/features/learn/legacyParity.ts`](frontend/src/features/learn/legacyParity.ts) | Behavioral contract: interactions, APIs, and checkpoints each lab must cover |
| [`frontend/src/features/learn/labs/`](frontend/src/features/learn/labs/) | Interactive lesson content for Labs 1–9, the rail deep dives, Fees & FX, and the capstone |
| [`frontend/src/features/learn/labs/*.test.tsx`](frontend/src/features/learn/labs/) | Content and interaction tests for each module |
| [`frontend/src/features/learn/cases/caseCatalog.ts`](frontend/src/features/learn/cases/caseCatalog.ts) | Applied case facts, rails, references, and scenario data |
| [`ROADMAP.md`](ROADMAP.md) | Product-level shipped work, open curriculum gaps, and deferred decisions |
| [`ENGINEERING_ROADMAP.md`](ENGINEERING_ROADMAP.md) | Engineering/content-depth backlog, including the SSI lesson gap |

### Recommended syllabus work order

1. **Confirm the shape of the course.** Keep the current split explicit: a structured technical
   sequence plus a case-based application track. The Case Desk currently has one supplier case;
   its Phase 2 plan waits for observed learner research before adding more cases.
2. ~~**Fix the progression rule.**~~ Done — the capstone now requires Labs 1–9 in
   `curriculum.ts`, so ISO 20022 and the rails deep-dive can no longer be skipped.
3. ~~**Make completion assess understanding.**~~ Done — every lab gates completion on at
   least one correct answer (Lab 3 gained a two-question decision drill; Lab 5 gained
   charge-code decision points).
4. ~~**Deepen Lab 5.**~~ Done — Lab 5 is now a guided lesson: a field-by-field worked
   example, two decision points, the live lookup, and a forward link to the capstone's
   Settle step.
5. ~~**Choose the next track deliberately.**~~ Done — all three named candidates shipped:
   Sanctions Screening (module 13, on `/api/screen`, earning "Compliance Aware"),
   Exceptions & Returns (module 14, earning "Exception Handler"), and the Ops Desk
   (module 15, STP repair + Nostro recon, earning "Ops Ready").
6. **Grow the retention loop.** The daily drill, spaced review, and streaks shipped
   (`frontend/src/features/learn/practice/`). The question bank has 52 questions —
   extend it as modules deepen, and consider surfacing review stats in telemetry.

### What is intentionally not finished

- The legacy `/learn` and `/ui` surfaces are still kept for rollback and parity comparison.
- Learning state is local to the browser; manual JSON backup/export is built but its panel is hidden for now, and there are still no accounts or automatic cross-device sync.
- The Case Desk has five authored scenarios; learner research on how they're used is still open.
- The project simulates payment behavior and reference data; it must not be treated as a live
  payment system.

---

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Service + data status |
| `GET` | `/api/validate` | IBAN/BIC validation |
| `GET` | `/api/lookup` | Bank directory lookup by BIC |
| `GET` | `/api/route` | Published SSI correspondents (SSI-first) with corridor-heuristic fallback |
| `GET` | `/api/ssi` | Standard Settlement Instructions |
| `POST` | `/api/verify-payee` | Verification of Payee |
| `POST` | `/api/prepare-payment` | One-call orchestration: validate + VoP + route + SSI → recommendation |
| `POST` | `/api/track/create` | **Instant** admin/demo path — create a simulated payment with its full gpi timeline immediately |
| `GET` | `/api/track/{uetr}` | Retrieve the events of a payment's timeline that are *visible now* |
| `POST` | `/api/track/{uetr}/skip` | Advance a prepared (scheduled) payment by exactly one event |
| `POST` | `/api/track/{uetr}/complete` | Reveal a prepared payment's entire remaining timeline |
| `GET` | `/api/schemes` | Domestic payment schemes by currency (ten currencies, sources verified 2026-08) |
| `GET` | `/api/schemes/international` | International / SWIFT gpi catalogue entry |
| `POST` | `/api/fees/simulate` | Fee simulation (OUR/SHA/BEN) |
| `POST` | `/api/screen` | Sanctions screening |
| `POST` | `/api/value-date` | Settlement value date calculator |
| `POST` | `/api/message/stp-check` | MT103 STP compliance checker (12 rules) |
| `POST` | `/api/message/translate` | MT103 → pacs.008 XML translation |
| `POST` | `/api/message/pacs008-check` | pacs.008 structured-field validator |
| `GET` | `/api/progress` | Learning progress + badges |
| `POST` | `/api/telemetry` | Anonymous learning event tracking (also carries bounded `tutor_feedback` events) |
| `POST` | `/api/tutor/chat` | Grounded AI tutor — **disabled by default**, answers 503 until configured |

---

## AI tutor

A quote-grounded payments tutor that explains, hints, and quizzes, requiring
verbatim evidence and deterministic quote-coverage checks for factual answers.
It cannot initiate, approve, advance, or settle a payment, and it says so.

**Off by default.** The base install carries no AI dependency at all. Full spec:
[`docs/superpowers/specs/2026-08-13-relay-ai-tutor.md`](docs/superpowers/specs/2026-08-13-relay-ai-tutor.md).

### Turning it on

```bash
pip install '.[ai]'
export TUTOR_ENABLED=true
export TUTOR_MODEL=gpt-5
export OPENAI_API_KEY=sk-...
```

All three variables are required together — any one missing answers 503 "not
configured", which is a deliberately different message from 503 "not enabled" so
an operator can tell "I turned it off" from "I forgot the key".

Every variable the tutor reads is listed in [`.env.example`](.env.example). In
production (`VERCEL` set) two more are required and enforced with a 503:
`TUTOR_RATE_LIMIT_REDIS_URL`/`_TOKEN` (in-process buckets reset on every cold
start, so they are a limit in name only) and `TUTOR_DAILY_REQUEST_CEILING` (a
per-caller rate limit does nothing about a thousand callers each behaving
reasonably).

### The guarantee

A factual answer must include verbatim evidence from a retrieved Relay document
and pass deterministic quote-coverage checks, or it is not delivered. A
citation naming a source that was not retrieved is stripped; a citation quoting
text that is not in its source is stripped; and an answer that fails the
quote-coverage check is *replaced* with a clarification rather than merely
flagged. This is source-backed lexical validation, not semantic entailment or a
live operational guarantee.

Identifiers are redacted at the provider boundary — unconditionally, with no
flag that can disable it. Retrieval runs on the raw text first, because it keys
on the very tokens redaction removes.

The model can call exactly three read-only lookups (lesson, glossary, scheme).
Every argument is checked for membership in a Relay catalogue and never
interpolated into a query, a path, or a URL.

### Evaluation

```bash
python scripts/evaluate_tutor_retrieval.py   # retrieval recall and latency
python scripts/run_tutor_eval.py --provider fake
python scripts/run_tutor_eval.py --provider live --output /tmp/eval.json
```

The 62-question golden set runs in ordinary CI against a fake engine — no
provider, no key. The live evaluation is opt-in and never gates a merge: a job
that fails during someone else's outage is not a signal about Relay.

### API examples — tracking & payment schemes

All responses below are **simulated educational data** — not a production
payment system. See the interactive OpenAPI docs at
<http://127.0.0.1:8000/docs> for the full schemas.

#### 1. Instant admin/demo timeline — `POST /api/track/create`

```bash
curl -s http://127.0.0.1:8000/api/track/create \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "originator_bic": "CITIUS33",
    "originator_name": "Citi US",
    "beneficiary_bic": "NWBKGB2L",
    "beneficiary_name": "NatWest",
    "currency": "USD",
    "amount": 5000.00,
    "charge_code": "SHA",
    "intermediary_bics": ["BARCGB22"],
    "intermediary_names": ["Barclays"],
    "outcome": "credited"
  }'
```

This is the **instant admin/demo path**: the full chain — INITIATED → ACCEPTED →
IN_PROGRESS → FORWARDED → … → CREDITED (`outcome: "rejected"` terminates at the
first intermediary instead) — is visible immediately and the response is
terminal. Replaying the request with the same `Idempotency-Key` header returns
the same timeline rather than creating a second one. In a public deployment
this endpoint is gated behind the `X-Admin-Key` header.

#### 2. Scheduled flow — prepare a payment, then watch it progress

`POST /api/prepare-payment` persists a *scheduled* timeline when its
recommendation is sendable and a destination bank is known. The `uetr` in the
response is what the UI hands to the tracking endpoint ("Track payment"):

```bash
curl -s http://127.0.0.1:8000/api/prepare-payment \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "beneficiary_iban": "GB29NWBK60161331926819",
    "beneficiary_name": "John Smith",
    "currency": "GBP",
    "amount": 5000.00,
    "strictness": "standard"
  }'
```

```bash
curl -s http://127.0.0.1:8000/api/track/<uetr>
```

Only **INITIATED** is visible at first. Further events surface as their
planned timestamps arrive (first hop ~50s, then ~45–90s per hop), so the journey unwinds in
front of the learner instead of appearing fully-formed. Two learner controls
reveal hidden events early:

```bash
curl -s -X POST http://127.0.0.1:8000/api/track/<uetr>/skip       # reveal exactly one event
curl -s -X POST http://127.0.0.1:8000/api/track/<uetr>/complete    # reveal the whole remaining chain
```

Both return the same `TrackPaymentResponse` shape as `GET /api/track/{uetr}`,
are safe to repeat (they become no-ops once the plan is terminal or already
fully visible), and return 404 for unknown UETRs. Hidden plan rows are never
exposed beyond these controls — they become visible only on schedule or on
explicit reveal.

#### 3. Domestic payment schemes — `GET /api/schemes`

Ten domestic currencies are catalogued: **USD, GBP, EUR, CAD, NGN, KES, INR,
AUD, JPY, AED**. Every rail carries official source references and a
`verifiedAsof` (2026-08) date-stamp:

```bash
curl -s "http://127.0.0.1:8000/api/schemes?currency=NGN"   # e.g. NIBSS Instant Pay, NEFT, CBN RTGS
curl -s "http://127.0.0.1:8000/api/schemes"                # currency list
```

This is educational data — always check the operator's current rules for
production routing.

#### 4. International / SWIFT catalogue — `GET /api/schemes/international`

```bash
curl -s http://127.0.0.1:8000/api/schemes/international
```

Returns the single International / SWIFT entry (SWIFT gpi): cross-border
correspondent payments with UETR end-to-end tracking and MT103 / pacs.008
references. Its roadmap section describes the CBPR+ / ISO 20022 direction of
travel — explicitly roadmap, not current behaviour.

---

## Design system

The canonical design contract is [`DESIGN.md`](DESIGN.md).

- **Color:** Blue `#3157D5` reserved for actions/selection/progress only
- **Typography:** Instrument Sans (UI) + IBM Plex Mono (identifiers/amounts)
- **Borders:** Thin (1px), low-opacity — no decorative shadows
- **Anti-template:** No card mosaics, no colored edges, no emoji icons, no uniform radius
- **Status:** Text + icon + color (never color alone)
- **WCAG 2.2 AA:** All semantic tokens contrast-verified
- **Route visualization:** Horizontal desktop + vertical mobile from one semantic model

---

## Testing

```bash
# Backend tests
source .venv/bin/activate && python -m pytest tests/ -q

# Frontend unit/integration tests
cd frontend && npm test -- --run

# E2E tests (Playwright starts FastAPI through playwright.config.ts)
cd frontend && npm run test:e2e

# Bundle budget check (≤200KB gzip)
cd frontend && npm run build && npm run check:bundle
```

---

## Engineering health

Test counts, bundle size, and curriculum totals are not repeated here — see the
[Verified health snapshot](#verified-health-snapshot) and [The numbers](#the-numbers), so a
count can never go stale in a third table. This one covers qualitative dimensions only.

| Dimension | Status |
|---|---|
| Version control | Git, `main` plus short-lived feature branches |
| CI | GitHub Actions — pytest + ruff on Python 3.10-3.12, plus a frontend job (typecheck, build, vitest, bundle budget) |
| Auth | `admin_required` on mutating endpoints |
| Security | ACCT- placeholders, fail-closed importer |
| Accessibility | WCAG AA contrast, focus-visible, reduced-motion, keyboard nav |
| Mobile | Responsive (390px), bottom nav, 44px touch targets |
| Architecture | 11 domain routers, typed React frontend, design-system tokens |
| Frontend | React 19 + TS strict + lazy-loaded labs and Case Desk |
| Learning | Gated module completion, daily practice loop, spaced review, Case Desk scenarios |

---

## Legacy migration status

The front door has cut over: `/` redirects to Relay at `/app`, so first visitors
land on Relay rather than the surface it replaces. When the Relay build is absent
— a fresh clone that has not run `npm run build` — `/` falls back to `/learn` so
the root still serves a working page.

The legacy vanilla JS frontend stays reachable at `/learn` and `/ui`. File
removal remains deferred until full content parity is confirmed; only the default
landing changed.

---

## Known limitations

- **Simulated data only** — SSI accounts are `ACCT-` placeholders; routing is SSI-first where a bank's published instructions are seeded and curated/heuristic elsewhere
- **Browser-local learning state** — backups are manual JSON export/import and the panel is hidden for now; there is still no account-based or automatic cross-device sync
- **No FX margin/spread modeling in the API** — the fee calculator models lift fees only;
  the Fees & FX lab teaches margin arithmetic client-side
- **Capstone is happy-path only** — exceptions/returns are taught in module 14, but the capstone wizard itself doesn't branch into returns
- **gpi status vocabulary** uses simplified names, not ISO 20022 TransactionStatus codes
- **Sanctions screening** is name-only (no DOB/address/phonetic matching)
- **Session-only fallback exists** — if browser storage is unavailable, Relay keeps the current session usable but cannot promise persistence after the tab/browser closes

---

## License

Educational use. Not for production payment processing.
