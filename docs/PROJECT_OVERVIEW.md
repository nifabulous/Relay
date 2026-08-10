# Relay — Project Overview, Features & Roadmap

**Relay** is an **educational payment simulation** that teaches how cross-border payments
actually work — identifiers, validation, correspondent routing, settlement, tracking,
compliance, and message standards. **It is not a production payment system. No real money
moves.** Every payment is simulated and all account numbers are `ACCT-` placeholders.

_Last updated: 2026-08-10._

---

## 1. Technology

### Backend
- **Python 3.9+** (syntax constrained to 3.9 — `Optional[...]`, `List[...]`, not `X | None`).
- **FastAPI** — ~22 endpoints under `/api/*`; OpenAPI docs at `/docs`.
- **Pydantic v2** — request/response schemas (`app/schemas.py`).
- **SQLAlchemy 2.0** — ORM models (`app/models.py`); **SQLite** in dev (`create_all` on startup),
  **Postgres + Alembic** in prod.
- **Architecture:** Router → Service → Model. Routers are thin (validation + error mapping);
  services are pure, mostly DB-free functions; models are anemic entities.
- **Auth:** `admin_required` (X-Admin-Key header) gates mutating/import endpoints. Dev mode
  (no `ADMIN_API_KEY`) is open.

### Frontend (Relay app, served at `/app`)
- **React 19 + TypeScript 7 (strict)** on **Vite 8**.
- **React Router 7** (basename `/app`), route-level code-splitting (`React.lazy` per feature).
- **TanStack Query 5** (server state), **React Hook Form 7 + Zod 4** (forms + response validation).
- **Typed API client** (`src/api/`): `apiRequest`/`apiPost`, Zod schemas, query-key factory,
  normalized `ApiProblem` errors.
- **Versioned localStorage** (`src/lib/persistence/`): schemaVersion-tagged, corrupt-discard,
  one-time legacy-progress migration.
- **Design system** (`src/design-system/`): CSS-variable tokens, `Button`, `StatusChip`,
  `AsyncRegion` (idle/loading/error/empty/unavailable/partial/success), `PaymentRoute` (SVG
  route signature). Contract in **`DESIGN.md`**; WCAG 2.2 AA, reduced-motion, mobile-first.

### Testing & tooling
- **Backend:** pytest (612 tests, in-memory SQLite, `StaticPool`), `ruff` (E/F/I).
- **Frontend:** Vitest 4 + React Testing Library + MSW 2 (808 unit/integration tests),
  Playwright + `@axe-core/playwright` (e2e + accessibility), bundle-size gate
  (`npm run check:bundle`), `tsc --noEmit`.
- **CI:** pytest + ruff across Python 3.9–3.12, plus a frontend job (typecheck, build, vitest, bundle budget) (`.github/workflows/ci.yml`).

### Legacy surface
- Vanilla HTML/JS/CSS at `/learn` and `/ui` (`app/static/`) — being replaced by Relay, kept
  until parity.

---

## 2. Features

### 2.1 Backend API (22 endpoints)

**Directory & validation**
- `GET /api/health` — bank/corridor/SSI counts + status.
- `GET /api/validate` — IBAN/BIC validation (MOD-97 checksum, BIC structure; delegates to schwifty).
- `GET /api/lookup` — bank lookup by BIC.
- `GET /api/us-bank` — Fedwire/FedACH US bank lookup.

**Routing & settlement instructions**
- `GET /api/route` — correspondent routing suggestions (curated corridor table).
- `GET /api/ssi` — Standard Settlement Instructions (Nostro/Vostro) by BIC + currency.
- `GET /api/schemes` — domestic payment rails per currency (now carries a `verifiedAsof` date-stamp).

**Verification & compliance**
- `POST /api/verify-payee` — Verification of Payee (name matching: MATCH / CLOSE_MATCH /
  NO_MATCH / NOT_CHECKED). Legal basis: EU Instant Payments Regulation (distinct from UK CoP).
- `POST /api/screen` — sanctions screening against a synthetic OFAC-style watchlist, per hop.

**Analytics & message standards**
- `POST /api/fees/simulate` — OUR/SHA/BEN fee deduction across the correspondent chain.
- `POST /api/value-date` — settlement value-date calculator (cut-offs, T+n, weekends/holidays).
- `POST /api/message/stp-check` — MT103 straight-through-processing check (12-rule primer;
  incl. field-23B validation and 32A-vs-33B amount-divergence).
- `POST /api/message/translate` — **MT103 → ISO 20022 `pacs.008`** field crosswalk + illustrative XML.
- `POST /api/message/pacs008-check` — structured pacs.008 field validation (incl. the Nov-2026
  structured-address rule).

**Orchestration, tracking, progress, ops**
- `POST /api/prepare-payment` — end-to-end orchestration: validate → VoP → route → SSI →
  recommendation (PROCEED / REVIEW / STOP), with a partial-results pattern.
- `POST /api/track/create` (admin) / `GET /api/track/{uetr}` — UETR creation + simulated SWIFT
  gpi tracking timeline.
- `GET /api/progress` — stateless learning-progress + badge calculator (client is the source of truth).
- `POST /api/telemetry` — lightweight learning/assessment telemetry sink.
- `POST /api/import/fedwire` · `POST /api/import/fedach` · `POST /api/import/ssi` (admin) — reference
  data import (fail-closed; requires env-configured source URLs).

**Domain services** (`app/services/`, 18): `validator`, `routing`, `ssi_importer`, `vop`,
`name_matcher`, `screening`, `fee_calculator`, `value_date`, `stp_checker`, `iso20022`,
`tracking`, `prepare`, `recommendation`, `idempotency`, `progress`, `telemetry`, `fed_importer`,
`seed`.

**Data model** (`app/models.py`, 8): `Bank`, `CorridorRule`, `FedwireBank`, `FedACHBank`, `SSI`,
`Account`, `PaymentEvent`, `IdempotencyKey`.

**Seed / reference data:** ~210 curated banks + 25,891 US Fedwire/FedACH banks, ~301 SSI records,
66 corridor rules across 28 destination countries, a synthetic sanctions watchlist, MT103 samples,
and domestic payment-scheme data for **10 currencies** (GBP, CAD, USD, EUR, NGN, KES, INR, AUD,
JPY, AED) — including Kenya's KEPSS/PesaLink/M-Pesa/EFT layers.

### 2.2 Frontend workspaces (Relay)

**Overview** — adaptive home: one dominant primary action (first-visit / next-module / complete),
progress summary, quick-links, recent activity, system status.

**Learn** — a guided curriculum of **12 learning modules + a capstone**, with typed prerequisite
chains, checkpoint-gated completion, and progress persistence:
1. Identifiers: BICs & IBANs
2. Is It Real? IBAN Checksums (MOD-97, with a visual step-through + live digit-flip)
3. Right Person? Verification of Payee
4. How Money Moves: Correspondent Routing
5. Where to Send: Standard Settlement Instructions
6. Did It Arrive? Tracking with UETR (SWIFT gpi)
7. Which Rail? Payment Schemes
8. Message Standards: MT103 → ISO 20022
- **Lab 9:** Rails Deep-Dive: Canada & UK (Interac, EFT, CHAPS, Faster Payments)
- **Module 10:** Rails Deep-Dive: UK & Eurozone (CHAPS, Bacs, Faster Payments, TARGET2, SEPA)
- **Module 11:** Rails Deep-Dive: Canada (Lynx, EFT/ACSS, Interac, Real-Time Rail)
- **Module 12:** Follow the Money: Fees & FX (lift fees, OUR/SHA/BEN, FX margin)
- **Capstone:** a reducer-driven 6-step full payment simulation (validate → verify → route →
  settle → decide → track).
- **Daily practice:** five-question drills from a 30-question bank, with 1/3/7-day review and
  device-local streaks.
- **Case Desk:** one Phase 1 supplier-payment scenario, separate from the technical curriculum.
- Shared interactive components: `Decompose`, `MultipleChoice`, `Exercise`, `StepIndicator`, `ScoreBar`.

**Explore** — reference tools: command search (indexed), bank directory (live `/api/lookup`),
glossary, and a payment-schemes rails table.

**Operate** — practitioner tools: Prepare Payment (partial-results orchestration), Fee simulator,
Sanctions screening, Value-date calculator, MT103 STP checker (with a "View as pacs.008" toggle),
and UETR tracking with a timeline.

### 2.3 Cross-cutting
- **Accessibility:** landmarks, aria roles, focus/keyboard support, WCAG-AA contrast (unit-tested),
  `prefers-reduced-motion`, first-class mobile (bottom nav, safe-area insets, responsive route view).
- **Honesty by design:** SIMULATION/primer disclaimers on every payment-shaped response and UI;
  illustrative (not XSD-validated) ISO 20022 output; `ACCT-` placeholder enforcement.

---

## 3. Domain concepts simulated

IBAN/BIC structure & MOD-97 checksums · correspondent (Nostro/Vostro) routing · Standard
Settlement Instructions · Verification of Payee / Confirmation of Payee · sanctions screening vs.
the Travel Rule · OUR/SHA/BEN charge models & fee lift · value dates, cut-offs & settlement cycles ·
SWIFT gpi / UETR tracking · MT103 fields & straight-through processing · the MT103 → ISO 20022
(pacs.008) migration (cross-border MT retired 22 Nov 2025) · domestic rails across 10 currencies
(RTGS vs instant vs batch vs mobile-money).

---

## 4. Roadmap

### ✅ Shipped
- Full Relay frontend rebuild (Overview / Learn / Explore / Operate) + design system.
- Backend API surface (directory, routing, SSI, VoP, screening, fees, value-date, tracking,
  prepare-payment, progress, imports, telemetry).
- Learn curriculum Labs 1–9, the UK/Eurozone and Canada rail deep dives, Fees & FX, and capstone,
  with checkpoint completion and progress persistence.
- **MT103 → ISO 20022 reframe** — `iso20022` translator + pacs.008 validator, translate/check
  endpoints, **Lab 8**, Operate pacs.008 toggle, STP "primer" relabel.
- **Correctness cluster** — VoP legal-basis docstrings (IPR vs EPC vs UK CoP); STP field-23B +
  32A/33B amount-divergence; BIC 8-vs-11 handling; Kenya **KEPSS** + corrected M-Pesa limits;
  per-scheme `verifiedAsof` date-stamps; **MOD-97 visual step-through** (Lab 2).
- **Assessment and retention:** every lab has a correct-answer completion path; daily practice
  adds spaced review and streaks.
- **Applied learning:** Phase 1 Case Desk supplier-payment scenario is live in Relay.
- **Test-infra:** fixed the vitest parallel-load flake (`testTimeout` 5s→15s); current verification
  uses file-parallelism-disabled frontend tests because the preferred-tier Case Desk test is load-sensitive.

### 🔲 Current focus

- Case Desk Phase 2: conduct learner research before adding more cases.
- Add a sanctions-screening learning track.
- Add exceptions/returns content and an operations workflow such as Nostro reconciliation or STP repair.
- Expand the practice bank and connect review outcomes to telemetry/assessment reporting.

### ⏸ Deferred — need a product/design decision before building
- **Sanctions vs Travel-Rule split (3.6)** — model the two as independent pass/fail outcomes (all
  four combinations). Blocking: what the Travel-Rule check consumes + endpoint shape. Note: the
  per-hop screening threshold drift (`screening.py:155`, stricter deeper) is defensibly correct —
  confirm intent before changing the sign.
- **First-run onboarding (#6)** — `firstRunGuidanceSeen` is scaffolded but no UI reads it
  (DESIGN.md principle 5 unfulfilled). Blocking: banner vs tour vs panel + copy.
- **ETB / Ethiopia currency expansion (#11)** — net-new and fast-moving (EthioPay-IPS launched
  9 Dec 2025). **Recommendation: defer** and re-check the research in 2–3 months rather than ship
  data that will be stale.

### 🔭 Backlog / future (from `IMPLEMENTATION_PLAN.md` Tier 3 and research)
- Unify fee logic between tracking and `fee_calculator`; remove the dead `fee_type` path (3.2/3.3).
- Value-date holiday-fallback + default-currency fix (3.5).
- Enrich the SSI lab into a full lesson (3.8); add an ops-workflow module — Nostro recon / STP
  repair (3.9).
- Internationalization (French) + corridor-local examples (3.10).
- Expand the telemetry/assessment layer (3.11).
- Migrate `seed.py` SSI data to CSV/JSON (3.12).
- Currency/rail expansion beyond the current set (KES fully modeled; ETB pending); keep every
  rail fact date-stamped (`verifiedAsof`) since some markets move fast.

---

## 5. Reference

- Conventions for contributors/agents: **`CLAUDE.md`** (root).
- Frontend design contract: **`DESIGN.md`** (root).
- Full remediation backlog with file:line citations: **`IMPLEMENTATION_PLAN.md`** (Tiers 0–3).
- Product & engineering roadmaps: **`ROADMAP.md`**, **`ENGINEERING_ROADMAP.md`**.
- Feature specs & implementation plans: **`docs/superpowers/specs/`**, **`docs/superpowers/plans/`**.

### Run it
```bash
# Backend
python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
uvicorn app.main:app --reload            # http://127.0.0.1:8000 (docs at /docs)
python -m pytest tests/ -q               # 612 tests

# Frontend
cd frontend && npm install && npm run dev # http://127.0.0.1:5173/app/
npm test -- --no-file-parallelism        # 808 tests
```
Relay app: `http://127.0.0.1:8000/app` · Legacy: `/learn`, `/ui`.
