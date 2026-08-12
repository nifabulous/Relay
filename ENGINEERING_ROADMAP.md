# Engineering Roadmap — SWIFT Routing Lab

> Post-review engineering health roadmap. Derived from a 10-panel cross-functional review (23 reviewers) and a 3-reviewer superpowers plan audit. The original baseline is preserved below; the current verification and shipped learning work are called out separately.

**Last updated:** 2026-08-12 · **Current verification:** 638 backend + 922 frontend + 271 chromium E2E passing (11 intentional skips) · **Current curriculum:** 16 entries (15 modules + capstone) · **Case Desk:** 5 scenarios

---

## ✅ Completed — Tier 0 (Blocking / Liability)

These were the highest-convergence findings, flagged by 4-5 panels independently.

| # | Item | Commit | What shipped |
|---|------|--------|-------------|
| 0.1 | git init | `eb49a36` | `.gitignore` + baseline commit (522 tests) |
| 0.2 | SSI account masking | `f86367f` | 470 account values → `ACCT-NNNNN`, 36 IBANs in notes masked, ROADMAP reconciled |
| 1.3 | Input validation | `2694bde` | `gt=0` on amounts, `max_length` on free-text, decode-in-try (no more 500 on binary upload) |
| 0.3 | Auth gate | `e5d281c` | `admin_required` dependency on `/import/*` + `/track/create`; dev-open, prod-401 |
| 0.3.5 | fed_importer pin | `b104473` | No GitHub default URL; fail-closed `ValueError` with clear message |
| 0.4 | SIMULATION disclaimers | `1057256` | API title/description, response `disclaimer` fields, UI banners on `/ui` + `/learn` |

## ✅ Completed — Tier 1 (Engineering Foundation)

| # | Item | Commit | What shipped |
|---|------|--------|-------------|
| 1.1 | CI pipeline | `6c93e2d` | GitHub Actions (pytest + ruff, Python 3.9-3.12), dev deps added |
| 1.5a | Alembic baseline | `1398ea5` | Migration `914225a8c624`, prod/dev gate in lifespan |
| 1.4 | Idempotency | `3c742dd` | `Idempotency-Key` header on `/track/create` + `/prepare-payment`, `IdempotencyKey` model + migration |
| 1.6 | Docs reconciliation | `045e0a1` | README endpoint table (13→19), ROADMAP test count (416→550+) |
| 1.2 | Router split | `4ed508d` | 921-line `lookup.py` → 10 domain routers + `_shared.py` |
| 1.5b | Logging | `3dec81e` | `logger` in all 15 services, `/health` reports `degraded` on seed failure |

## ✅ Completed — Tier 2 (Product, Accessibility & Learning Quality)

| # | Item | Commit | What shipped |
|---|------|--------|-------------|
| 2.1 | Front door fix | `1265e63` | `/` → 302 redirect to `/learn`, `/ui` sidebar links to `/learn`, JSON manifest → `/api/manifest` |
| 2.6 | Frontend shared-utils | `89d69a5` | `learn-utils.js`: `esc()`, `fmtMoney()`, `api()`, `getProgress()`, `completeButton()`. 15 copies of `esc()` eliminated. |
| 2.4 | Chain amounts | `05e6cae` | Per-hop `$5,000 → $4,985 → $4,970` in the animated chain + pause-on-hover |
| 2.2 | Accessibility | `1775d9a` | Contrast: `--ink-3`/badges darkened to WCAG AA. `:focus-visible` ring. `prefers-reduced-motion`. |
| 2.3 | Mobile responsive | `49c66c3` | `@media (max-width: 768px)` in both CSS files: sidebar collapses, tables scroll |
| 2.8 | Prerequisite gating | `f517442` | Core labs locked until previous lab completed; "go deeper" modules ungated |

## ✅ Current shipped work since this baseline

- MOD-97 has a visual step-through explainer in Lab 2.
- Lab 5 is a guided SSI lesson with a worked example, charge-code decisions, live lookup, and a
  capstone Settle link.
- Assessment integrity now requires a correct answer for every lab's completion path; Lab 3 and
  Lab 5 have explicit decision drills.
- The Learn curriculum includes Labs 1–9, UK/Eurozone rails, Canada rails, Fees & FX, and the
  capstone. The daily practice route adds a 30-question bank, spaced review, and local streaks.
- The React Relay app includes five Case Desk scenarios, while the legacy `/learn` and `/ui`
  surfaces remain available for parity and rollback.
- Modules 13–15 shipped: Sanctions Screening (`/api/screen`), Exceptions & Returns
  (rejects/returns/recalls on the tracking simulator), and The Ops Desk (STP repair +
  Nostro reconciliation). The practice bank grew to 52 questions covering every module.

---

## 🔲 Remaining — Tier 2 items deferred

| # | Item | Why deferred | Effort |
|---|------|-------------|--------|
| 2.5 | Rebuild capstone to reuse `PaymentViz` | XL (6 subtasks: reuse chain/timeline, 5 branched scenarios, back-nav, localStorage, button-disable, error prose) | 3-4 days |
| 2.7 | Unify design tokens (one file, extract 348 inline styles) | L (depends on 2.6 being deeper; 348 inline styles across 15 JS files) | 2-3 days |

---

## 🔲 Backlog — Tier 3 (Domain Fidelity & Depth)

Pick by appetite. No hard dependencies between these items.

| # | Item | Panel | Notes |
|---|------|-------|-------|
| 3.1 | Fix VoP docstrings (remove "EPC guidance" claim) | Payments | `name_matcher.py:32`, `vop.py` header |
| 3.2 | Fix dead `fee_type` data path | Payments | `fee_calculator.py:48` — either implement pct or drop the field |
| 3.3 | Unify fee logic (tracking → `simulate_fees`) | Payments | `tracking.py:144` hardcodes $2.50/hop |
| 3.4 | Expand MT103 STP checker + relabel | Payments | Validate field 23B; note 50A/F, 59F, 71F/G; relabel as "12-rule primer" |
| 3.5 | Fix value-date holiday fallback + GBP default | Payments | `value_date.py:154` empty set for unsupported currencies |
| 3.6 | Clarify sanctions threshold drift | Payments | `screening.py:152` — threshold gets stricter (lower) per hop; comment intent |
| 3.7 | ~~MOD-97 visual step-through explainer~~ ✅ Done | Education | Shipped in Lab 2 with a step-by-step remainder view and digit-flip exercise |
| 3.8 | ~~Enrich Lab 5 (SSI) into a real lesson~~ ✅ Done | Education | Now a guided lesson: worked example, decision points, capstone link |
| 3.9 | ~~Ops-workflow module (Nostro recon / STP repair)~~ ✅ Done | Users/Ops | Shipped as module 15 "The Ops Desk": live STP repair queue + Nostro break-hunting |
| 3.10 | French localization (i18n) | Education | Francophone Africa audience named twice in ROADMAP |
| 3.11 | Telemetry + assessment layer | Product | Every ROADMAP success metric is currently unmeasurable |
| 3.12 | Migrate `seed.py` SSI data to CSV/JSON | Backend | 1,863-line Python data file → `app/data/ssi.csv` |

---

## Engineering health scorecard

| Dimension | Before review | After Tier 0-2 | Target |
|---|---|---|---|
| Version control | ❌ Not a git repo | ✅ Git, 19-commit baseline | Maintain; current tree is actively changing |
| Tests | ✅ 522 passing, 92% coverage | ✅ 550+ passing, 29 new tests | ✅ Current counts in the header above; keep CI aligned |
| CI | ❌ None | ✅ GitHub Actions (pytest + ruff) | Add coverage gate |
| Auth | ❌ Zero (anyone could wipe tables) | ✅ `admin_required` on all mutating endpoints | Add rate limiting |
| Security | ❌ Real accounts, GitHub default URL | ✅ ACCT- placeholders, fail-closed importer | Add checksum verification |
| Accessibility | ❌ WCAG AA failures, no focus, no reduced-motion | ✅ AA contrast, `:focus-visible`, `prefers-reduced-motion` | Audit with axe-core |
| Mobile | ❌ Zero `@media` queries | ✅ Responsive breakpoint ≤768px | Test on real devices |
| Architecture | ❌ 921-line god-router | ✅ 10 domain routers, largest 248 lines | — |
| Migrations | ❌ `create_all` only | ✅ Alembic baseline + 1 migration | Add migration CI check |
| Logging | ❌ None (errors swallowed) | ✅ Logger in all services, `/health` reports degraded | Add request middleware |
| Frontend duplication | ❌ 15 copies of `esc()` | ✅ One `LearnUtils.esc()` | Keep legacy and Relay paths explicit during cutover |
| Product positioning | ❌ Two products, muddled story | ✅ Education is flagship, `/` → `/learn` | Continue Relay migration when parity criteria are met |

---

## Sequencing rules (from the 3-reviewer audit)

1. **`lookup.py` citation staleness** — RESOLVED. The god-router is split; future items cite new file paths.
2. **`1.5a` before `1.4`** — RESOLVED. Alembic landed before idempotency.
3. **`2.2` before `2.3`** — RESOLVED. Both done; they edit the same CSS files and were serialized.
4. **`2.6` before `2.7`** — DEFERRED. Token unification (2.7) needs the inline-style extraction first; 2.6 only extracted `esc()`.
5. **`2.4` before `2.5`** — DEFERRED. The capstone rebuild (2.5) should reuse the improved chain from 2.4.

- Routing is now SSI-first: `/api/route` returns the beneficiary bank's full published
  correspondent list (labeled `published-ssi`) when seeded, falling back to the corridor
  heuristic. A settlement directory exposes CHIPS participant numbers and ABA routing
  numbers on `/api/lookup`, `/api/route`, and `/api/ssi`; Lab 4 gained a CHIPS-vs-Fedwire
  settlement-layer section and a serial-vs-cover drill.
