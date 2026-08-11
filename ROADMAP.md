# Roadmap — Relay Educational Payment Simulation

> **What this is:** The unified project roadmap tracking what's built, what's reviewed, and what remains.

**Last updated:** 2026-08-12 · **Verified locally:** 621 backend + 911 frontend + 271 chromium E2E passing (11 intentional skips; WebKit project runs on machines with WebKit) · **Curriculum:** 16 entries (15 modules + capstone) · **Case Desk:** 5 scenarios

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
| T12-T13 | Initial Learn curriculum foundation, E2E tests, bundle gate |
| T14 | Documentation, branding, manifest test |

### Code review (4 expert reviewers — all findings resolved)

10 Critical (P0) + 11 Important (P1) issues found and fixed: WCAG contrast, schema mismatches, domain overrides, ARIA, error boundary, code splitting, API tests, capstone branching, basename doubling, CSS chunk wiring.

---

## ✅ Phase 3 — Learn Content Parity (Complete)

Full plan at `docs/superpowers/plans/2026-07-18-learn-content-parity.md`.

### All 14 tasks shipped

The initial 8 interactive labs grew into a 13-entry curriculum with checkpoint-based completion,
real API integration, and accessible primitives (Exercise, MultipleChoice, Decompose, ScoreBar,
StepIndicator). Capstone is a 6-step state machine with NO_MATCH branching.

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

## ✅ Phase 5 — Syllabus refinement and retention (Complete for this update)

- Curriculum expanded to Labs 1–9, UK/Eurozone rails, Canada rails, Fees & FX, and capstone.
- Capstone sequencing and every lab's correct-answer completion gate are covered by tests.
- Lab 5 now includes a field-by-field SSI example, charge-code decisions, live lookup, and a
  forward link to the capstone Settle step.
- `/app/learn/practice` provides a five-question daily drill, a 30-question bank, 1/3/7-day
  missed-question review, and device-local streaks.
- Relay learner-state portability is now shipped for anonymous browser-local use: Overview can
  export/import learning backups as JSON for progress, practice, activity, and Case Desk sessions,
  while payment drafts and UI preferences remain local-only.
- GBP, CAD, and EUR rail data and the generated Relay build are up to date with the shipped UI.

---

## ✅ Design Audit (Complete)

2-reviewer visual + code audit. Design Score: B+, AI Slop Score: A.

Quick wins shipped: touch targets (40→44px), emoji→SVG, font scale cleanup, visited links, sticky sim banner.

---

## ✅ 20-Expert Review (Complete)

3 panels (Finance/Payments ×6, Education ×7, UX ×7) reviewed the full project. Findings documented below.

---

## 🔲 Current focus and remaining work

The next contribution slice is content-led rather than a rebuild:

1. Case Desk learner research: five scenarios are authored (CA→US, UK→DE, NG→UK, US→MX, US→NG); observe how learners use them before adding more.
2. ~~Add sanctions-screening content as the next technical track.~~ ✅ Done (module 13).
3. ~~Add exceptions/returns and an operations workflow such as Nostro reconciliation or STP repair.~~ ✅ Done (modules 14 and 15).
4. Extend practice questions (bank is at 50) and expose review outcomes through telemetry/assessment reporting.

### From the 20-expert review — prioritized

**Phase A — Data and consistency follow-up:**
1. ~~Add Labs 8-9 to capstone prerequisites~~ ✅ Done (curriculum.ts; capstone now requires Labs 1–9)
2. ~~Fix Lab 9 Interac limit to match scheme data ($3,000)~~ ✅ Done (scheme data and lesson agree)
3. Fix tracking.py to use LIFT_FEES table instead of hardcoded $2.50
4. Align the legacy backend module catalogue and badge bridge with the Relay curriculum (the
   backend still carries legacy IDs such as `fees`, `fx`, `settlement`, `mt103`, and `cases`)

**Phase B — Domain accuracy (2 hours):**
5. Map gpi statuses to ISO 20022 TransactionStatus codes (ACSP/ACSC/PDNG/RJCT)
6. Fix GBP value-date default to T+2 for non-CHAPS
7. Fix 23B→CdtDbtInd mapping + add GrpHdr mandatory elements

**Phase C — Assessment integrity (product change):**
8. ~~Gate at least one checkpoint per lab on a correct answer, not just interaction~~ ✅ Done (Lab 3 decision drill, Lab 5 decision points; all other labs already had a correct-answer gate)
9. Fix MultipleChoice answer leakage in wrong-option explanations
10. Add worked examples to Labs 4 and 9 where the current lesson still needs more guided practice

**Phase D — Missing curriculum track:**
11. ~~Fees/FX module (badge catalog promises it)~~ ✅ Done (module 12 "Follow the Money: Fees & FX" — earns the fees + fx badges)
12. ~~Sanctions screening lab (badge catalog promises it)~~ ✅ Done (module 13 — earns "Compliance Aware"; per-hop screening, grey-zone exercise, escalation + false-positive drills)
13. ~~Exceptions/returns workflow~~ ✅ Done (module 14 — rejects vs returns vs recalls, pacs.004 reason codes, doomed-payment timeline)
14. ~~Ops workflow (Nostro recon / STP repair)~~ ✅ Done (module 15 "The Ops Desk" — repair queue on the live STP checker + ledger-vs-statement reconciliation)

### Deferred

| Item | Why |
|---|---|
| Dark theme | Not required for initial rebuild |
| User accounts / cloud sync | Manual browser-local learner backup/import is shipped; account-based sync is still future work |
| French i18n | Francophone Africa audience — separate effort |
| Instructor dashboard / cohort management | Converts free tool to paid product |
| Serial-vs-cover correspondent model | Advanced domain concept |
| FX margin/spread modeling | Where fintechs make money — separate module |
| Automatic cross-device persistence | Manual JSON backup/export-import exists today; automatic sync between devices does not |

---

## Engineering health scorecard

| Dimension | Phase 0 | Phase 1 | Phase 2 | Phase 3-4 | Current |
|---|---|---|---|---|---|
| Version control | ❌ | ✅ Git | ✅ Maintained | ✅ | ✅ Maintained |
| Tests | ✅ 522 | ✅ 570+ | ✅ 689 | ✅ 850+ | ✅ 621 backend + 911 frontend + 271 chromium E2E (11 intentional skips) |
| CI | ❌ | ✅ GitHub Actions | ✅ + Vitest | ✅ + Playwright | ✅ Full pipeline |
| Auth | ❌ | ✅ admin_required | ✅ | ✅ | ✅ |
| Security | ❌ Real accounts | ✅ ACCT- placeholders | ✅ | ✅ | ✅ |
| Accessibility | ❌ | ✅ AA contrast | ✅ + ARIA + keyboard | ✅ | ✅ WCAG 2.2 AA |
| Mobile | ❌ | ✅ Responsive | ✅ Bottom nav + 44px | ✅ | ✅ |
| Architecture | ❌ God-router | ✅ 10 routers | ✅ + typed React | ✅ + lazy-loaded | ✅ |
| Frontend | ❌ Vanilla JS | ✅ Shared utils | ✅ React 19 + TS + design system | ✅ + 10 labs | ✅ 13 curriculum entries + Case Desk |
| Bundle | N/A | N/A | ✅ 111KB | ✅ 108KB | ✅ 114,893 bytes gzip, under 200KB |

---

## Historical references

The following documents are archived as historical references:

- `IMPLEMENTATION_PLAN.md` — the original 23-reviewer remediation plan (Tiers 0-2 complete)
- `ENGINEERING_ROADMAP.md` — the post-review engineering baseline and current depth backlog
- `docs/superpowers/specs/2026-07-16-corridor-labs-redesign.md` — interim design spec (superseded by Relay)
- `docs/superpowers/specs/2026-07-17-relay-ui-rebuild-design.md` — approved Relay design spec (still authoritative)
- `docs/superpowers/plans/2026-07-17-relay-ui-rebuild.md` — 14-task implementation plan (all tasks complete)
- `docs/superpowers/plans/2026-07-18-learn-content-parity.md` — 14-task content plan (all tasks complete)
- `docs/superpowers/plans/2026-07-19-overview-explore-data-truth.md` — 7-task data-truth plan (all tasks complete)
- `docs/superpowers/plans/2026-07-19-lab9-rails-deep-dive.md` — 7-task Lab 9 plan (all tasks complete)
- `DESIGN.md` — canonical design contract (still authoritative)
