# Design Audit — Relay Case Desk (corrected, post-fix-pass)

- **Date:** 2026-07-21
- **Branch:** `fix/case-desk-phase-1-premise`
- **Target:** `http://127.0.0.1:8000/app/learn/cases/canada-us-supplier`
- **Scope:** Case Desk vertical slice (brief → investigate → recommend → resolve → debrief + transfer)
- **Classifier:** **APP UI** (workspace-driven, task-focused, dense). App UI rules apply throughout.
- **Calibration:** every finding checked against `DESIGN.md` (Relay Design System). Deviations from stated tokens/principles are higher severity than generic issues.

## Headline scores

| Metric | Grade | Verdict |
|---|---|---|
| **Design Score** | **B+** | Solid fundamentals, one medium contradiction exposed by the fix-pass (the "Verified" chip logic pre-dates it; T1's value-hiding made the contradiction visible), plus pre-existing interaction-state debt. |
| **AI Slop Score** | **A** | No slop patterns present. No gradients, no card grids, no emoji, no centered-everything, no default font stacks, no decorative icon circles. |

## Phase 1 — First impression

**Screenshot:** `screenshots/01-brief-first-impression.png`

- The site communicates **calm, precise, explainable**. That is the stated DESIGN.md goal, and the brief phase delivers it.
- I notice **one dominant action** ("Start investigation") sitting at the foot of the customer request, exactly as DESIGN.md Principle 1 demands ("One screen, one dominant action").
- The first 3 things my eye goes to are: **the customer request prose**, **the "Start investigation" button**, **the "Verified" status chips on each fact row**. Two of those three are the intended hierarchy; the third (Verified chips) is **incidentally the seed of FINDING-001 below** — it pre-dates the fix-pass but now reads as a contradiction.
- One word: **professional**.

**Trunk test (brief phase):** PARTIAL — 5/6 clear.
- Site ID ✓ (Relay brand top-left)
- Page name ✓ ("Canada → US supplier payment")
- Major sections ✓ (Overview / Learn / Explore / Operate bottom bar on mobile, left rail on desktop)
- Options at this level ✓ (single CTA)
- "You are here" ✗ — **no breadcrumb** on a deep Learn URL (`/app/learn/cases/canada-us-supplier`). DESIGN.md's hierarchy lists `Learn: current module → lesson or exercise → sequence and progress`; a case buried two levels deep should show the path. **Noted as deferred** — pre-dates the fix-pass and is an app-wide pattern, not Case-Desk-specific.
- Search ✗ — DESIGN.md places search in the "top sheet," so its absence at desk width is by design, not a finding.

## Phase 2 — Inferred design system

Extracted from the live DOM and cross-checked against `tokens.css`:

- **Fonts:** `--font-ui` (Instrument Sans) and `--font-mono` (IBM Plex Mono), both with metric-compatible fallbacks per DESIGN.md. All *visible* text uses `--font-ui`. (A phantom `Times New Roman` shows up on `<html>/<head>/<title>` because no rule overrides the browser default there — it never renders visibly. **Not a finding.**)
- **Colors:** every surface routes through `--color-*` tokens. `grep` for `#[0-9a-f]{3,8}` and `rgba?(` in Case Desk + design-system CSS (excluding `tokens.css`) returns **nothing**. Clean.
- **Heading scale:** h1 = 28px/700, h2 = 18px/600. Systematic, on-scale.
- **Spacing:** 4px base scale via tokens, with one recurring off-scale value (`2px` micro-gaps — see FINDING-005).
- **Radii:** three tokens (`--radius-control` 8px, `--radius-region` 12px, `--radius-full` chips), used purposefully — not uniform bubbly radius.

**Offer:** DESIGN.md already exists and is richer than what I'd infer. No update needed; the implementation matches it closely.

## Phase 3 — Page-by-page audit

### Brief phase (`01-brief-first-impression.png`)
- Hierarchy: clean. Customer request is the loudest text; the action sits beneath it.
- One issue: every fact row carries a "Verified" chip. On the brief this reads naturally because all values are visible. See FINDING-001 for where it breaks.

### Investigate phase (`02-investigate.png`, `03-investigate-requested.png`)
- Three-pane layout (FactRequest | RailShortlist | Reasoning) + EvidenceRail aside. Each region has one job.
- T1 UI fix verified at the rendered layer: the four requestable facts show "Not yet requested" with the Open-reference button suppressed. After requesting, values appear and a "Requested" tag surfaces.
- **FINDING-001 (medium)** — see below. The contradiction surfaces here.

### Recommend phase (`04-recommend-filled.png`)
- Textarea + rail shortlist + send button. Calm, single-action composition.

## Findings

### FINDING-001 — "Verified" chip renders on facts whose value is hidden (medium) `[primary-review]`
**Evidence:** DOM scrape of the investigate phase, pre-request:

```
Fee sensitivity       Verified   Not yet requested
Tracking requirement  Verified   Not yet requested
Intermediary correspondent  Verified  Not yet requested
Institution variation       Verified  Not yet requested
```

**Why it matters:** The T1 fix correctly hides the *value* until requested, but the "Verified" chip is gated on `fact.claim` (`EvidenceRail.tsx:109`), not on whether the value is visible. Every authored fact has a `claim` (catalog lines 80–160), so the chip shows even when the value is literally "Not yet requested." A learner reads "Verified — Not yet requested" as a contradiction: verified by whom, of what? It undermines the fix-pass's core premise (investigation is load-bearing).

**Source:** `frontend/src/features/learn/cases/EvidenceRail.tsx:107-120` — the chip renders whenever `fact.claim` is truthy; `valueHidden` is computed at `:103-104` but not consulted by the chip.

**Provenance:** Found by the primary `/design-review` pass via a live DOM scrape of the investigate phase; not corroborated by an outside voice (Codex timed out; the Claude subagent source audit did not flag this one). Re-running Codex before any re-grade would be worthwhile.

**Severity:** medium (semantic contradiction, not a crash; but it directly weakens the fix-pass's load-bearing-investigation premise).

### FINDING-002 — `role="note"` is non-standard; intended AT announcement doesn't fire (high) `[subagent]`
**Evidence:** `CaseDebrief.tsx:114`, `AsyncRegion.tsx:97`. `role="note"` is not in WAI-ARIA 1.2; most browser/AT combos ignore it. The surrounding code comment says the region is "so AT announces the…" — currently it does not, reliably.

**Severity:** high (DESIGN.md §Responsive and accessibility requires correct live regions). **Deferred** — pre-existing, not introduced or worsened by the fix-pass; fixing correctly requires choosing between `role="status"` (polite, live) vs a labelled region, which is its own small design call.

### FINDING-003 — Transfer-rail control has no selected/hover/active state (high) `[subagent]`
**Evidence:** `CaseDesk.css:469-490` — `.case-desk__transfer-rail` has `cursor: pointer` only. No visual feedback for the primary Resolve-phase action. DESIGN.md §Components requires pressed/selected states.

**Severity:** high. **Deferred** — pre-existing; touches transfer UI that the fix-pass deliberately left as "completion, not graded" (Group D). Re-styling it now would risk re-introducing the "this is being graded" signal the fix-pass removed.

### FINDING-004 — Nested-radius rule (`outer − gap`) never encoded (medium) `[subagent]`
**Evidence:** DESIGN.md line 48: "Nested radii equal the outer radius minus the inset gap." Outer regions use `--radius-region` (12px) with 24px padding; inset controls use `--radius-control` (8px). `12 − 24 ≠ 8`. The rule is stated but unenforced anywhere in the codebase.

**Severity:** medium. **Deferred** — either the rule or the implementation is wrong; resolving requires a design-system decision, not a one-line CSS fix. Out of scope for the premise-fix branch.

### FINDING-005 — `2px` micro-spacing used ~16× but not tokenized (polish) `[subagent]`
**Evidence:** `--space-0.5` (2px) absent from `tokens.css:44-52`. Value appears consistently in label/term rows across `CaseDesk.css`, `EvidenceRail.css`, `FactRequest.css`, `RailShortlist.css`, `AsyncRegion.css`.

**Severity:** polish. **Deferred** — easy add, but purely janitorial and unrelated to the fix-pass.

### FINDING-006 — Custom controls rely solely on global `:focus-visible` ring (polish) `[subagent]`
**Evidence:** `.case-desk__input`, `.case-desk__textarea`, `.case-desk__transfer-rail`, `.fact-request__checkbox`, `.rail-shortlist__radio` define no per-control hover/active/focus styling; they inherit `global.css:78`. `Button.css` styles its own. Inconsistent.

**Severity:** polish. **Deferred** — global ring is sufficient for AA; consistency-only.

## Phase 4 — Interaction flow review

Walked brief → investigate (request facts) → recommend (fill reasoning + shortlist) → send. Playwright E2E (`case-desk.spec.ts`) covers the full journey including resolve → revise → debrief, restart recovery, and corrupt-draft recovery — **all 11 active tests pass** (1 skipped on desktop). The flow *feels* responsive; no missing loading or success states observed.

**Goodwill reservoir:** 70 → 78 over the flow.
- +5 obvious primary action on brief
- +5 clear evidence-gathering loop (request → values appear → reason → send)
- -2 minor: the Verified-chip contradiction is a small "wait, what?" moment (FINDING-001)

**Final: 78/100 — healthy.** Above the 60 threshold.

## Phase 5 — Cross-page consistency

- Brand, nav, and footer consistent across brief/investigate/recommend (single-page app, same shell).
- Tone consistent: operational labels throughout ("Start investigation," "Request facts," "Open reference"), no welcome/aspiration copy.
- Spacing rhythm carries across phases.

## Phase 6 — Triage

| ID | Finding | Impact | Disposition |
|---|---|---|---|
| 001 | "Verified" chip on hidden-value facts | medium | **Fix in this branch** (directly contradicts the fix-pass premise) |
| 002 | `role="note"` non-standard | high | Deferred — pre-existing, design-system decision |
| 003 | Transfer-rail no selected state | high | Deferred — pre-existing, touches deliberately-regraded UI |
| 004 | Nested-radius rule unenforced | medium | Deferred — design-system decision |
| 005 | `2px` not tokenized | polish | Deferred — janitorial |
| 006 | Custom controls rely on global focus ring | polish | Deferred — AA met, consistency-only |

**Quick wins (<30 min each):** FINDING-001 (the only one in scope for this branch).

## Outside voices

- **CODEX SAYS:** *(unavailable — `codex exec` produced no output within the 5-minute budget and was killed; proceeding single-model per skill error handling).*
- **CLAUDE SUBAGENT (design consistency):** thorough source audit; surfaced FINDING-002 through FINDING-006 with file:line evidence. Quoted inline above. Confirmed: zero hardcoded colors, zero default font stacks, zero AI-slop patterns, clean token usage. The Case Desk is a high-fidelity implementation of DESIGN.md; the real gaps are interaction-state coverage on custom controls and the non-standard `role="note"`.

### Litmus scorecard

| # | Check | Y/N |
|---|---|---|
| 1 | Brand/product unmistakable in first screen? | Y |
| 2 | One strong visual anchor present? | Y (customer request) |
| 3 | Page understandable by scanning headlines only? | Y |
| 4 | Each section has one job? | Y |
| 5 | Are cards actually necessary? | Y (rails are independently selectable) |
| 6 | Does motion improve hierarchy or atmosphere? | N/A (no motion in scope — acceptable for App UI) |
| 7 | Would design feel premium with all decorative shadows removed? | Y (no decorative shadows exist) |

## Status

**DONE_WITH_CONCERNS.** The corrected Case Desk is a high-fidelity implementation of DESIGN.md: zero AI slop, zero hardcoded colors, consistent typography, calm composition, and the fix-pass premise (load-bearing investigation) is visible at the rendered layer. One finding (FINDING-001) is in scope for this branch because it directly contradicts the fix-pass intent; five others are pre-existing design debt, deferred so they don't get silently bundled into a premise-fix branch.
