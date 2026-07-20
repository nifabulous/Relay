# Roadmap — Relay Educational Payment Simulation

> **What this is:** The unified project roadmap tracking what's built, what's reviewed, and what remains.

**Last updated:** 2026-07-20 · **Tests:** 913+ total (608 backend + 283+ frontend + 22 E2E) · **Commits:** 117+ · **Modules:** 10

---

## Project identity

**Relay** is a responsive educational payment simulation. It teaches how cross-border payments work by letting users do each step — validate, verify, route, settle, track — and see the results.

**It is NOT a production payment system.** No real money moves. Every "payment" is simulated. Account numbers are `ACCT-` placeholders. The persistent label is **Educational payment simulation**.

### Who it's for

| Audience | What they get |
|---|---|
| Fintech engineers new to payments | Understand the domain before building payment features |
| Payment operations staff | Hands-on feel for BICs, Nostro/Vostro, SSI, VoP |
| Students / bootcampers | A concrete playground instead of abstract theory |
| Product managers | Understand what happens "under the hood" of a transfer |

---

## ✅ Phase 1 — Backend Remediation (Complete)

All items from the original 23-reviewer, 10-panel cross-functional review.

| Area | What shipped |
|---|---|
| Blocking/Liability | git init, SSI masking (470 accounts), auth gate, SIMULATION disclaimers |
| Engineering Foundation | CI pipeline, router split (921→10 modules), Alembic, idempotency, logging |
| Product/A11y | Front door fix, WCAG AA contrast, mobile responsive, prerequisite gating |

---

## ✅ Phase 2 — Relay Frontend Rebuild (Complete)

Full plan at `docs/superpowers/plans/2026-07-17-relay-ui-rebuild.md`. Design contract at `DESIGN.md`.

### All 14 tasks shipped

| Task | Deliverable |
|---|---|
| T1-T2 | Vite 8 + React 19 + TS 7 toolchain, FastAPI `/app` serving |
| T3-T5 | Design tokens, Button/StatusChip/AsyncRegion, typed API client, versioned persistence |
| T6-T7 | Responsive shell (desktop rail + mobile bottom nav), adaptive Overview |
| T8-T9 | Explore workspace (CommandSearch), PaymentRoute visualization |
| T10-T11 | Operate workspace (PreparePayment, Fees, Screening, ValueDate, STP, Tracking) |
| T12-T13 | Learn curriculum (8 modules), E2E tests, bundle gate |
| T14 | Documentation, branding, manifest test |

### Code review (4 expert reviewers — all findings resolved)

10 Critical (P0) + 11 Important (P1) issues found and fixed: WCAG contrast, schema mismatches, domain overrides, ARIA, error boundary, code splitting, API tests, capstone branching, basename doubling, CSS chunk wiring.

---

## ✅ Phase 3 — Learn Content Parity (Complete)

Full plan at `docs/superpowers/plans/2026-07-18-learn-content-parity.md`.

### All 14 tasks shipped

8 interactive labs with checkpoint-based completion, real API integration, and accessible primitives (Exercise, MultipleChoice, Decompose, ScoreBar, StepIndicator). Capstone is a 6-step state machine with NO_MATCH branching.

### Lab 8 — MT103 → ISO 20022 (Complete)

Translator service, pacs.008 validator, two new API endpoints, full lab content. Teaches the Nov 2025 MT retirement and Nov 2026 structured-address mandate.

### Lab 9 — Rails Deep-Dive: Canada & UK (Complete)

Enriched CAD/GBP rail data (limits, processing windows, protections, roadmaps). 6 interactive mechanics: Autodeposit↔VoP, CHAPS→pacs.008, EFT window simulator, limit checker, APP reimbursement, rail-chooser quiz.

---

## ✅ Phase 4 — Overview/Explore Data-Truth (Complete)

Full plan at `docs/superpowers/plans/2026-07-19-overview-explore-data-truth.md`.

- Overview progress driven from local storage (was always 0/N)
- Activity log records module completions + tool runs
- Schemes page is a real rails comparison table (was a stub)
- Badge IDs mapped correctly between frontend and backend

---

## ✅ Design Audit (Complete)

2-reviewer visual + code audit. Design Score: B+, AI Slop Score: A.

Quick wins shipped: touch targets (40→44px), emoji→SVG, font scale cleanup, visited links, sticky sim banner.

---

## ✅ 20-Expert Review (Complete)

3 panels (Finance/Payments ×6, Education ×7, UX ×7) reviewed the full project. Findings documented below.

---

## 🔲 Remaining work

### From the 20-expert review — prioritized

**Phase A — Data fixes (1 hour):**
1. Add Labs 8-9 to capstone prerequisites
2. Fix Lab 9 Interac limit to match scheme data ($3,000)
3. Fix tracking.py to use LIFT_FEES table instead of hardcoded $2.50
4. Align backend module catalog (16→10 modules, remove phantom badges)

**Phase B — Domain accuracy (2 hours):**
5. Map gpi statuses to ISO 20022 TransactionStatus codes (ACSP/ACSC/PDNG/RJCT)
6. Fix GBP value-date default to T+2 for non-CHAPS
7. Fix 23B→CdtDbtInd mapping + add GrpHdr mandatory elements

**Phase C — Assessment integrity (product change):**
8. Gate at least one checkpoint per lab on a correct answer, not just interaction
9. Fix MultipleChoice answer leakage in wrong-option explanations
10. Add worked examples to Labs 4 and 9

**Phase D — Missing curriculum track:**
11. Fees/FX module (badge catalog promises it)
12. Sanctions screening lab (badge catalog promises it)
13. Exceptions/returns workflow

### Deferred

| Item | Why |
|---|---|
| Dark theme | Not required for initial rebuild |
| User accounts / cloud sync | No real payment initiation (spec §16) |
| French i18n | Francophone Africa audience — separate effort |
| Instructor dashboard / cohort management | Converts free tool to paid product |
| Serial-vs-cover correspondent model | Advanced domain concept |
| FX margin/spread modeling | Where fintechs make money — separate module |
| Cross-device persistence | Currently localStorage only |

---

## Engineering health scorecard

| Dimension | Phase 0 | Phase 1 | Phase 2 | Phase 3-4 | Current |
|---|---|---|---|---|---|
| Version control | ❌ | ✅ Git | ✅ Maintained | ✅ | ✅ 117+ commits |
| Tests | ✅ 522 | ✅ 570+ | ✅ 689 | ✅ 850+ | ✅ 913+ |
| CI | ❌ | ✅ GitHub Actions | ✅ + Vitest | ✅ + Playwright | ✅ Full pipeline |
| Auth | ❌ | ✅ admin_required | ✅ | ✅ | ✅ |
| Security | ❌ Real accounts | ✅ ACCT- placeholders | ✅ | ✅ | ✅ |
| Accessibility | ❌ | ✅ AA contrast | ✅ + ARIA + keyboard | ✅ | ✅ WCAG 2.2 AA |
| Mobile | ❌ | ✅ Responsive | ✅ Bottom nav + 44px | ✅ | ✅ |
| Architecture | ❌ God-router | ✅ 10 routers | ✅ + typed React | ✅ + lazy-loaded | ✅ |
| Frontend | ❌ Vanilla JS | ✅ Shared utils | ✅ React 19 + TS + design system | ✅ + 10 labs | ✅ |
| Bundle | N/A | N/A | ✅ 111KB | ✅ 108KB | ✅ Under 200KB |

---

## Historical references

The following documents are archived as historical references:

- `IMPLEMENTATION_PLAN.md` — the original 23-reviewer remediation plan (Tiers 0-2 complete)
- `ENGINEERING_ROADMAP.md` — the post-review tracking document (all items shipped)
- `docs/superpowers/specs/2026-07-16-corridor-labs-redesign.md` — interim design spec (superseded by Relay)
- `docs/superpowers/specs/2026-07-17-relay-ui-rebuild-design.md` — approved Relay design spec (still authoritative)
- `docs/superpowers/plans/2026-07-17-relay-ui-rebuild.md` — 14-task implementation plan (all tasks complete)
- `docs/superpowers/plans/2026-07-18-learn-content-parity.md` — 14-task content plan (all tasks complete)
- `docs/superpowers/plans/2026-07-19-overview-explore-data-truth.md` — 7-task data-truth plan (all tasks complete)
- `docs/superpowers/plans/2026-07-19-lab9-rails-deep-dive.md` — 7-task Lab 9 plan (all tasks complete)
- `DESIGN.md` — canonical design contract (still authoritative)
