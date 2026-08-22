# Relay Remaining-Page Redesign Implementation Plan

Date: 2026-08-22
Branch: `codex/redesign-remaining-pages`
Base: `origin/main` @ `9b1922d`
Spec: `docs/superpowers/specs/2026-08-21-learn-explore-operate-workspace-redesign-design.md` (shared contract) + approved concept mockups (dark-theme renders, listed per task in `docs/design-concepts/`)

## Goal

Restyle every page not covered by the 2026-08-21 workspace redesign so the whole app matches the approved concept mockups. These are **restyle tasks over existing functional pages**: preserve all data flow, routes, behavior, and tests; change presentation only. The already-redesigned pages (`OverviewPage`, `LearnIndexPage`, `ExplorePage`, `PreparePaymentPage`) define the visual language; this wave brings the remaining pages up to the same standard.

## Global Constraints (binding for every task)

1. **Token-only styling.** All colors, spacing, radius, typography, and motion come from `frontend/src/design-system/tokens.css`. No hardcoded hex values in component CSS. Every new rule must hold in light theme, dark theme (`data-theme="dark"`), and black theme (`data-theme="black"`) because tokens flip automatically.
2. **Concept mockups are dark-mode renders of token-based layouts.** Match their *structure* (regions, hierarchy, grouping), not literal pixel colors. Verify visually in dark mode (the user's default view) and confirm light mode remains coherent via tokens.
3. **Preserve functionality.** No changes to stores, API contracts, routing, or business logic. Existing tests keep passing except where a selector legitimately changed with the restyle; update such tests minimally and note it.
4. **Accessibility contract** from the shared spec: visible focus states, ≥44px interactive targets, labels never hidden by values, keyboard order follows reading order, status = text + icon/shape + color, `Escape` closes page-owned overlays, reduced-motion collapse.
5. **Responsive:** intentional layouts at 390px, 768px, 1024px, 1440px. No horizontal scroll at 390px; two-column treatments reserved for 1024px+ unless the mockup says otherwise.
6. **No new dependencies.** No `class-variance-authority`, `lucide-react`, no generated Coss components. Base UI only if a genuine focus/position/dismiss need arises (none expected).
7. **DESIGN.md discipline:** thin structural borders, no decorative shadows/gradients, cards only where surfaces are meaningfully bounded, one dominant action per screen.
8. Each task commits its own work. Focused vitest runs while iterating; full frontend suite once before committing each task.

## Tasks

### Task 1: Case Desk detail page visual pass

Files: `frontend/src/features/learn/cases/*` (CaseDesk.tsx, CaseDesk.css, EvidenceRail.*, RailShortlist.*, FactRequest.*)
Mockup: `docs/design-concepts/case-desk.png`
Scope: Restyle the case investigation surface toward the mockup's three-region intent: step workflow with completed/current/locked states, evidence card + timeline, recommendation panel with radio options and primary submit. Keep all existing evaluator/store logic untouched. Step states use success/action/muted tokens. This is an alignment pass on an already-rich page (1502-line component), not a rebuild — CSS-first, minimal TSX changes.

### Task 2: Daily practice drill restyle

Files: `frontend/src/features/learn/practice/PracticePage.tsx`, `PracticePage.css`, tests
Mockup: `docs/design-concepts/practice.png`
Scope: Stats column (streak / reviews due / today progress as compact stat blocks); flashcard region with question counter, question text, stacked answer options with selected state using the action token; footer actions primary Next + quiet End session. Preserve practiceStore logic and existing test behavior.

### Task 3: Learn module page restyle

Files: `frontend/src/features/learn/LearnModulePage.tsx`, `LearnPage.css` (module-scoped additions), tests
Mockup: `docs/design-concepts/learn-module.png`
Scope: Module badge + title header with completion progress; lesson outline list (completed/current/upcoming states); content card. Keep curriculum logic and lab registry intact.

### Task 4: Bank directory restyle

Files: bank-directory section inside `frontend/src/features/explore/ExplorePage.tsx` (BankDirectoryPage export) + `ExplorePage.css` additions
Mockup: `docs/design-concepts/bank-directory.png`
Scope: Search + filter chips above a bordered data-table card (Institution/BIC/Country/Capabilities), BICs in mono font, capability pills, pagination footer. Preserve BIC lookup handoff behavior and tests.

### Task 5: Bank detail page restyle

Files: `frontend/src/features/explore/BankDetailRoute.tsx` + related CSS
Mockup: `docs/design-concepts/bank-detail.png`
Scope: Breadcrumb; hero header (logo tile, name, mono BIC chip, country, verified pill); two-column body — scheme support rows with pills + about text on the left, details card with labeled rows on the right. Preserve SSI/settlement panels and heuristic fallback exactly.

### Task 6: Payment schemes page restyle

Files: schemes section inside `ExplorePage.tsx` (SchemesPage export), `SchemeDetails.css`, `SchemeTable.tsx` styling
Mockup: `docs/design-concepts/schemes.png`
Scope: Header + segmented filter tabs; responsive grid of scheme cards (tile, name, description, metadata, availability pill). Keep SchemeTabs controlled behavior and SWIFT gating intact.

### Task 7: Glossary page restyle

Files: glossary section inside `ExplorePage.tsx` (GlossaryPage export) + CSS
Mockup: `docs/design-concepts/glossary.png`
Scope: Desktop three-region treatment: alphabetical index rail, definition cards with term/tag/body/related chips, recently-viewed list. Single column ≤768px. Preserve search/filter behavior.

### Task 8: Operate tools index grid

Files: `frontend/src/features/operate/tools/ToolIndexPage.tsx`, `OperateTools.css`
Mockup: `docs/design-concepts/tool-index.png`
Scope: Card grid (icon tile, name, description, Open link); keep the five entries and hrefs identical; update OperateTools.test.tsx selectors minimally if needed.

### Task 9: Fee calculator restyle

Files: `frontend/src/features/operate/tools/FeePage.tsx` + OperateTools.css
Mockup: `docs/design-concepts/fees.png`
Scope: Two-column form/results layout — labeled form card + breakdown card with divider, emphasized total in action color, estimate footnote. Preserve OUR/SHA/BEN logic and tests.

### Task 10: Sanctions screening restyle

Files: `frontend/src/features/operate/tools/ScreeningPage.tsx` + CSS
Mockup: `docs/design-concepts/screening.png`
Scope: Form card (input, watchlist chips, run button) above results card (rows with status pills); stats column. Preserve fictional watchlist logic.

### Task 11: Value date checker restyle

Files: `frontend/src/features/operate/tools/ValueDatePage.tsx` + CSS
Mockup: `docs/design-concepts/value-date.png`
Scope: Two-column: form card + result card with emphasized value date, detail rows, week strip with legend. Preserve date logic and tests.

### Task 12: STP checker restyle

Files: `frontend/src/features/operate/tools/StpPage.tsx`, `Pacs008View.tsx` styling + CSS
Mockup: `docs/design-concepts/stp.png`
Scope: Validation checklist rows with pills, score progress bar, tips card with Re-validate button. Preserve MT103/pacs.008 toggle and validation logic.

### Task 13: Payment tracking restyle

Files: `frontend/src/features/operate/tracking/TrackingPage.tsx`, `PaymentTimeline.tsx`, `TrackingPage.css`
Mockup: `docs/design-concepts/tracking.png`
Scope: UETR search + track button; lifecycle timeline (completed/current/upcoming nodes); summary card with status pill. Preserve pacing simulation, controls, URL sync, pacing tests.

### Task 14: Settings page + NotFound polish

Files: `frontend/src/features/settings/SettingsPage.tsx` (+CSS), `frontend/src/app-shell/NotFoundPage.tsx` (+shell CSS)
Scope: Settings gets sectioned panel treatment consistent with redesigned pages. NotFound keeps explanatory copy verbatim (deliberate), improves hierarchy and CTA styling. Token-respecting in both themes.

## Execution notes

- Sequential dispatch, fresh implementer subagent per task, reviewer after each (model tier per user constraint).
- Final whole-branch review after Task 14, then finishing-a-development-branch flow.
- Ledger: `.superpowers/sdd/progress.md`.
