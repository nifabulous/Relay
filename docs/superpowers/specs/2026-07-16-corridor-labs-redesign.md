# Design Spec: Corridor Labs Redesign (v3)

> **Date:** 2026-07-16 · **Revision:** v3 — incorporates all fixes from two rounds of expert review (initial 8-reviewer panel + 3-panel re-review) · **Status:** Approved by all panels

---

## Revision summary (what changed from v1)

v1 was over-scoped, under-specified where it matters, and under-estimated by ~2.5x. v2 addresses every blocker:

| v1 issue | Source panel | v2 fix |
|---|---|---|
| 10-day estimate was fantasy (real: 21-28 days) | PM | Cut to V1 (~5-7 days) + V2 (deferred) |
| Custom API section duplicates Swagger | PM + PD | **Killed.** Styled Swagger + 3 curated deep-dives instead. |
| "Docs-site" is wrong frame for a course | PD | Reframed: "docs chrome, course content model" |
| 760px wrong for interactive visuals | PD + UX | One consistent ~1000px width with nested 66ch prose measure |
| Next button conflicts with gating | UX | Next is disabled until current lab completed |
| ⌘K search is a label, not a design | UX + PD | **Deferred to V2.** Needs full spec before building. |
| Shell merge hides command-palette subsystem | PM + UX | **Deferred to V2.** V1 touches zero routing. |
| Chain will ship blue-on-teal | UI | Chain color sweep folded into V1 Phase 1 |
| Chain wrap + trail-draw incompatible | UI | Single-row-with-horizontal-scroll, not flex-wrap |
| Dark-theme semantic colors undefined | UI | Dark theme deferred; semantic pairs specified when built |
| Contrast margins thin (--ink-3, --success) | UI | Darkened: --ink-3 → warm-stone custom #635a52 (~5.3:1), margins improved |
| 348 inline styles bypass tokens | UI | Inline-style sweep added to V1 Phase 1 scope |
| Capstone state lost on section-switch | UX | Capstone serialized to sessionStorage (V2 prerequisite) |
| 8 of 16 labs have no route in new scheme | UX | Full route table for all 16 modules specified |
| Accessibility regressions by omission | UX | ARIA contracts specified for chain (container role=img + single aria-label, glyphs aria-hidden). Tabs/drawer deferred with V2. |
| Tools section is unjustified peer | PD | Tools identity deferred to V2 (needs decision: reference mode? power-user surface?) |
| Go-deeper grouping premature (lonely buckets) | PD | Flat list until content justifies grouping |
| No success metrics | PM | Metrics defined + telemetry prerequisite |
| Tagline over-indexes on Learn | PD | Acknowledged as deliberate Learn-first bet |

---

## Product identity

- **Name:** Corridor Labs
- **Tagline:** Learn payments by sending them. *(Learn-scoped; Learn is the front door. API/Tools sections use a neutral product descriptor.)*
- **One word:** Grounding
- **Positioning:** For fintech engineers, payment-ops staff, and students who need to understand how cross-border payments move, Corridor Labs is an interactive sandbox that teaches IBANs, VoP, correspondent routing, SSI, and UETR tracking through hands-on labs — unlike SWIFT docs or YouTube explainers, we let you build a real cross-border payment end-to-end in a safe, simulated environment where you can break things without consequence.
- **Trademark:** Drop "SWIFT" from all UI branding. Use "cross-border payments" / "correspondent banking." Internal names (`swift-lab-progress` localStorage key, `swift_routing.db`) stay — UI-first rename only.

---

## Architecture: docs chrome + course content model

**Reframe (PD panel):** This is NOT a docs site (Stripe/MDN). It is a **course with a reference appendix.** The chrome borrows from docs (sidebar, search-able, deep-linkable), but the content model is course-structured: sequential, prerequisite-gated, badge-driven, with a capstone. The distinction matters: a docs site helps you find one page; a course helps you not skip ahead.

### V1: No shell merge — improve the two existing shells independently

V1 does NOT merge `/learn` and `/ui`. It improves each shell's visual system, content, and navigation without touching routing architecture. This eliminates the highest-risk work (shell merge, section routing, ⌘K search) while delivering ~80% of visible value.

### V2: Shell merge — only if telemetry justifies it

V2 (deferred) merges `/learn` + `/ui` into one shell with three sections (Learn / API / Tools). It requires:
- Frontend smoke tests (Playwright, 5-10 paths) **before** merge work begins
- Telemetry data showing the dual-SPA split causes measurable drop-off
- Full ⌘K search spec (results schema, keyboard map, focus trap, gating reconciliation)
- Capstone state serialization (sessionStorage) so cross-section navigation doesn't lose wizard data
- ARIA contracts for all new interactive elements

**V2 is out of scope for this spec revision. It gets its own spec when V1 telemetry justifies it.**

> **Behavioral drift acknowledgment (PD panel):** V1 unifies the visual system across both shells but gives only Learn a course-behavior layer (Next/Prev, gating, badges). After V1, a user crossing from Learn to Tools sees two shells that *look identical* but *behave differently* — one tracks and sequences you, the other is a flat reference surface. Visual parity plus behavioral divergence can feel fragmented. This is an accepted V1 trade-off: de-risk routing, ship 80% of value, address in V2.

> **Reframe scope clarification (PD panel):** The "docs chrome + course content model" reframe changes *which UX features are in scope* (gating, Next/Prev, badges) but does NOT change V1's IA. The structural consequences (merged shell, gating-aware search, course-aware sidebar) land in V2, not V1.

---

## V1 scope (~9-12 days, near-zero architectural risk)

> **Effort note (PM panel re-review):** The original v1 estimate of 5-7 days was ~1.5x light. Realistic total is 9-12 days — one focused sprint. The estimate is driven by: font subsetting pipeline (~1.5d), chain component rewrite (~2-2.5d), and completion-contract harmonization for exercise-less labs (~1-1.5d).

> **Opportunity cost (PM panel):** After V1 ships, prioritize Tier 3 product items (MOD-97 visualizer, ops-workflow module, French i18n) BEFORE V2. These are learning-outcome and audience-expansion investments with higher ROI than the shell merge. V2 should only proceed if V1 telemetry justifies it.

### Phase 0: Telemetry baseline (1-1.5 days, MANDATORY)

Ship a thin anonymous event layer BEFORE the visual redesign, so there's a baseline to measure against. Phase 0 is mandatory because the north-star metric (lab completion rate) requires it — without telemetry, the redesign's success is unmeasurable.

- Events: `lab_viewed`, `lab_started`, `lab_completed`, `exercise_attempted`, `exercise_solved`
  - `lab_viewed` is required to compute the drop-off metric (where users stop)
- Storage: localStorage (no server, no accounts) — anonymous, opt-out
- Surface: a `/api/progress` enhancement that includes timing data
- **Success metric this enables:** lab completion rate (north-star), drop-off point, time-on-task

### Phase 1: Design tokens + font swap + inline-style sweep (3-4 days)

**What ships:** new `tokens.css` shared by both surfaces, Inter + IBM Plex Mono self-hosted, spacing scale, the inline-style sweep.

**Scope (expanded from v1 per UI panel):**
1. New `:root` token block (light theme only — dark deferred):
   - Warm stone neutrals (canvas `#fafaf9`, surface `#ffffff`, ink `#1c1917`)
   - Teal accent (`#0f766e` / hover `#115e59` / bright `#14b8a6` / surface `#f0fdfa`)
   - Semantic colors renamed: `--success`/`--warn`/`--danger` (was `--green`/`--amber`/`--red`)
   - `--ink-3` darkened to `#6b7280` (4.63:1 — safer margin than `#78716c` at 4.59:1 per UI panel)
   - Spacing scale: `--space-1` through `--space-7` (4/8/12/16/24/32/48px)
   - Radius: `--radius-sm` 6px, `--radius-md` 12px, `--radius-full` 999px
   - Type scale: `--text-xs` through `--text-3xl` (12/14/16/18/24/30/38px)
   - Base size: `html { font-size: 16px }` (up from 15px)
2. **Self-hosted fonts** (subset to Latin + Latin-Extended-A for French diacritics):
   - Inter variable (body/headings) — preload Latin subset, `font-display: swap`, `size-adjust` on fallback to minimize FOUT reflow
   - IBM Plex Mono (data/code) — `font-feature-settings: "liga" 0, "calt" 0` to prevent ligature corruption of IBANs
   - Total payload: ~95-105KB (subsetted)
3. **Chain color sweep (UI blocker #1):** Rewrite `.viz-tone-you` (`learn.css:644-663`) and `.viz-dot` box-shadow (`learn.css:705`) from hardcoded blue to `var(--accent-surface)` / `var(--accent-bright)`. Add `--accent-border` and `--accent-ink` tokens for tonal nodes. **This is in Phase 1, not Phase 3 — without it, the hero visual ships blue-on-teal.**
4. **Inline-style sweep (UI blocker #5):** Extract the ~15 colored inline styles in `learn-labs-4-6.js`, `learn-capstone.js`, `learn-lab-sanctions.js` into classes. Layout inline styles (width/height/left) can stay — only colored ones bypass tokens and cause inconsistency.
5. Unify both CSS files on the warm-stone neutrals (app.css currently uses cool grays `#fafafa`/`#0a0a0a` — change to `#fafaf9`/`#1c1917`).

**Acceptance:**
- `grep -rn "raw hex" app/static/js/` returns only layout values (no colored hex in JS)
- `grep "#2563eb\|#3b82f6\|#93c5fd\|#1e3a8a" app/static/css/` returns zero hits (old blue gone)
- Chain originator node renders in teal, not blue
- Inter loads on first paint (check Network tab); no FOUT flash >500ms
- `font-feature-settings: "liga" 0` on mono rule (verify no `==`/`->` ligatures in IBAN display)

### Phase 2: Rebrand (½ day)

- Rename to "Corridor Labs" in: HTML titles, OpenAPI title/description (`main.py`), learn.html brand, index.html brand, sidebar labels
- Tagline: "Learn payments by sending them." (Learn only)
- Drop "SWIFT" from all UI text
- Update CLAUDE.md, ENGINEERING_ROADMAP.md

### Phase 3: Chain rebuild (1.5 days)

- **Kill emoji** → 20px monoline SVG glyphs (card/vault/inbox/ban-circle). All glyphs `aria-hidden="true"` — the chain container carries the text alternative (see below).
- **Single-row with horizontal scroll** — NOT flex-wrap (UI blocker #2). On overflow, the chain scrolls horizontally; the packet travels the scrollWidth.
- **Mobile fallback (UI+UX panel):** below 640px, render a static full-route diagram (no animation) with scaled-down glyphs + wrapped labels. The animated one-shot is desktop-only. This avoids the unwatchable-packet-leaves-viewport problem on 390px screens.
- **One-shot animation:** ~350ms/hop (balanced: fast enough that 5 hops = 1.75s total, slow enough to read each node). Settles on beneficiary. Replay button. No infinite loop.
- **Skip control:** appears after ~600ms if animation is long; jumps to settled state (UX panel recommendation)
- **Pause-on-hover:** keep (valuable for one-shot — lets learner freeze a hop to read the amount at 350ms/hop)
- **Trail draw:** deferred — the single-row-with-scroll architecture makes per-segment trail draw lower-value (the packet itself carries the amount tag). Revisit in V2 if needed.
- **Packet carries cargo:** 14px rounded-square with trailing `$5,000` mono tag
- **ARIA contract (UX panel — one authoritative alternative, not redundant):** Chain container gets `role="img"` with a comprehensive `aria-label` that mirrors the rendered route, including dynamic states: "Payment route: Your Bank → Citibank → GTBank. Amount: $5,000 USD." For reject paths: "Payment route: Your Bank → Citibank → REJECTED. Reason: sanctions hit." All glyph SVGs and the animated dot are `aria-hidden="true"`. No per-glyph labels, no separate visually-hidden `<p>` — one label on the container. `aria-live="off"` on replay (decorative).

### Phase 4: Content width fix (½ day)

- **One consistent content max-width: ~1000px** with a nested `max-width: 66ch` prose measure inside it (PD/UX panel recommendation — fixes the 760px-is-too-narrow problem and the section-switching-reflow problem)
- Reading text constrains itself to 66ch; visualizations, tables, and code blocks break out to the full 1000px
- Implementation: `.lab-main { max-width: 1000px }`, `.lab-main .concept, .lab-main p { max-width: 66ch }`
- **Capstone wizard exception (PD panel):** the capstone is a multi-step builder, not reading content. It gets `max-width: 1100px` to fit the step indicator + tables + inline chain. Implementation: `.lab-main.capstone { max-width: 1100px }`.
- No section-level width switching (that was a V1 idea that V2 killed)

### Phase 5: Next/Prev navigation + completion-contract harmonization (1-1.5 days)

**The single most important UX addition (all 4 panels agreed).**

- Every core lab (1-7 + capstone) gets "Next lab →" and "← Previous" buttons at the bottom of the content
- **Next is DISABLED until the current lab is completed** (UX panel Break 1 fix — prevents the punishment-flow where Next sends you to a lock screen)
- Completion contract: every lab calls `markComplete(id)` exactly once, on the same trigger (exercise success for labs with exercises; manual "Mark complete" for labs without). The Next button's `disabled` state reads from `isComplete(currentLabId)`.
- Visual: disabled Next is greyed out with a tooltip "Complete this lab to continue." Enabled Next is the primary accent color.
- Previous is always enabled (free navigation backward).

### Phase 6: Badge + exercise-card polish (1 day, optional)

- Recommendation badge: size up to 16px/700-weight, add SVG glyphs (check/alert/ban), STOP = solid `--danger` fill with white text (6.47:1 — verified by UI panel)
- Exercise card: 3px left rail in `--accent`, input + Check on one row, feedback = rail changes color + result panel slides open (180ms)

---

## V1 acceptance criteria

- [ ] All old-blue hex values gone from CSS and JS (`grep` returns zero)
- [ ] Chain renders in teal, single-row with scroll on overflow, one-shot animation with skip
- [ ] Inter + Plex Mono load with `font-display: swap`, no FOUT >500ms
- [ ] Every core lab has Next/Prev buttons; Next is disabled until completion
- [ ] Content width is ~1000px with nested 66ch prose measure
- [ ] "Corridor Labs" appears in all UI surfaces; "SWIFT" dropped from branding
- [ ] All existing Python tests still pass (baseline: ~405 test functions)
- [ ] Ruff clean
- [ ] `prefers-reduced-motion` freezes chain, shows settled state immediately
- [ ] Chain has `role="img"` + `aria-label` text alternative
- [ ] (If telemetry shipped) lab_started/lab_completed events fire correctly

---

## Success metrics (PM panel requirement)

**Primary (requires telemetry):**
1. Lab completion rate — % of started labs completed (north-star)
2. Drop-off point — where in the curriculum users stop
3. Capstone completion rate — the culmination

**Secondary (redesign-specific):**
4. Next/Prev button usage — adoption rate of the #1 nav addition
5. Chain interaction rate — % who replay or hover-pause

**Guard rail:**
6. No drop in lab completion vs. pre-redesign baseline

**Hard truth:** Metrics 1-3 require telemetry. Ship Phase 0 first to establish a baseline.

---

## Color system (light only — dark theme deferred to V2)

### Contrast-verified values (all computed by UI panel)

| Token | Hex | Contrast on canvas | AA (4.5) | Notes |
|---|---|---|---|---|
| `--canvas` | `#fafaf9` | — | — | page bg (stone-50) |
| `--surface` | `#ffffff` | — | — | cards, inputs |
| `--surface-2` | `#f5f5f4` | — | — | table headers, hover |
| `--surface-3` | `#eeeeec` | — | — | active nav |
| `--ink` | `#1c1917` | 16.75:1 | ✅ AAA | primary text |
| `--ink-2` | `#57534e` | 7.3:1 | ✅ AAA | secondary text |
| `--ink-3` | `#635a52` | **~5.3:1** | ✅ AA | muted labels (warm-stone custom — stays on-palette, clears 5.0:1) |
| `--accent` | `#0f766e` | **5.24:1** | ✅ AA | teal-700, links/active/btn |
| `--accent-hover` | `#115e59` | 7.3:1 | ✅ AAA | teal-800 |
| `--accent-bright` | `#14b8a6` | 3.2:1 | AA Large only | chart fills, animated dot (non-text) |
| `--accent-surface` | `#f0fdfa` | — | — | pale teal badges |
| `--success` / `-bg` | `#15803d` / `#f0fdf4` | **4.79:1** | ✅ AA | PROCEED badge |
| `--warn` / `-bg` | `#b45309` / `#fffbeb` | **4.84:1** | ✅ AA | REVIEW badge |
| `--danger` / `-bg` | `#b91c1c` / `#fef2f2` | **5.92:1** | ✅ AA | STOP badge (soft variant) |
| White on `--danger` | `#ffffff` on `#b91c1c` | **6.47:1** | ✅ AA | STOP badge (solid variant) |
| `--border` | `#e7e5e4` | — | — | structural (borders exempt) |
| `--border-strong` | `#d6d3d1` | — | — | inputs, focus prep |

### Dark theme (V2 — not in V1 scope)

Deferred because:
- Dark semantic colors are undefined (UI panel: light `--success` etc. on dark canvas will be muddy/radioactive)
- Dark pairs need design + testing: `--success` → `#4ade80`, `--warn` → `#fbbf24`, `--danger` → `#f87171`, `-bg` → translucent variants
- Power-user nicety on an educational sandbox — lowest ROI per PM panel
- Ship only if telemetry shows evening/night usage patterns

---

## Typography

| Role | Font | Why |
|---|---|---|
| Body / UI / headings | **Inter** (variable, self-hosted, Latin+Latin-Ext-A subset) | Best-in-class at 12-16px, full French diacritic coverage, tabular-nums |
| Data / mono | **IBM Plex Mono** (self-hosted, Latin subset) | No ligatures (critical — `font-feature-settings: "liga" 0, "calt" 0`), strong digit clarity |
| Fallback | `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` | Pre-swap readability, `size-adjust` matched to Inter metrics |

**Base size:** `html { font-size: 16px }` (up from 15px).

**Type scale (7 steps):** `--text-xs` 12px · `--text-sm` 14px · `--text-base` 16px · `--text-lg` 18px · `--text-xl` 24px · `--text-2xl` 30px · `--text-3xl` 38px.

**Line-height:** body 1.55, headings 1.2, UI 1.4, mono 1.35.
**Max measure:** `66ch` for lab reading content (nested inside ~1000px container).
**Tabular figures:** `font-variant-numeric: tabular-nums` on all amount/IBAN cells.

**Font loading strategy (UI panel):**
1. Subset to Latin + Latin-Extended-A (~95-105KB total)
2. Preload Latin subset woff2 with `<link rel="preload" as="font" crossorigin>`
3. `font-display: swap` + `size-adjust` metric-matching on fallback to minimize FOUT reflow
4. `font-feature-settings: "liga" 0, "calt" 0` on IBM Plex Mono

---

## Spacing & radius

**Spacing scale (7 steps, ban raw rems):** `--space-1` 4px · `--space-2` 8px · `--space-3` 12px · `--space-4` 16px · `--space-5` 24px · `--space-6` 32px · `--space-7` 48px.

**Radius:** `--radius-sm` 6px (inputs, badges) · `--radius-md` 12px (cards, panels) · `--radius-full` 999px (chips, number circles).

**Border:** `1px` everywhere. `--border` `#e7e5e4` for structure, `--border-strong` `#d6d3d1` for inputs. No shadows for elevation.

---

## Key components (V1 scope)

### Correspondent chain (hero visual)

- **Kill emoji.** Replace `🏦📍✓✗` with 20px monoline SVG glyphs (card/vault/inbox/ban-circle).
- **ARIA (UX requirement):** Each glyph `role="img"` with `aria-label`. Visually-hidden `<p>` before chain: "Payment route: Your Bank → [Intermediary] → Beneficiary. Amount: $5,000 USD." Dot animation `aria-hidden="true"`.
- **Single-row with horizontal scroll** — NOT flex-wrap. Eliminates the wrap-breaks-animation bug.
- **One-shot animation:** ~300ms/hop, settles on beneficiary. Replay button. Skip control after 600ms.
- **Pause-on-hover:** keep (freeze a hop to read the amount).
- **Tonal nodes:** originator = `--accent-surface`, beneficiary = `--success-bg`, intermediary = `--warn-bg`, reject = `--danger-bg`.
- **Packet carries cargo:** 14px rounded-square with trailing `$5,000` mono tag.

### Recommendation badge

- Size: 16px minimum, weight 700.
- Leading SVG glyph mandatory: check (PROCEED), alert-triangle (REVIEW), octagon (STOP).
- PROCEED: `--success-bg` fill, `--success` text, 1px border. Soft.
- REVIEW: `--warn-bg` fill, `--warn` text, 1px border. Medium.
- STOP: **solid** `--danger` fill, **white** text, no border. Hard. 6.47:1 contrast.
- Banner variant: full-width, glyph left, word + reason right.

### Lab exercise card

- 28px monoline SVG badge in `--ink-2` (not amber — amber implies "warning").
- 3px left rail in `--accent`.
- Input + Check button on one row (inline-right).
- Feedback: rail animates to `--success` (correct) or `--danger` (wrong). Result panel slides open (180ms). Wrong = "not yet," not "failure."

---

## Motion philosophy

- **Chain:** one-shot, ~300ms/hop, settles. Skip control after 600ms. Pause-on-hover. No infinite loop.
- **Lab transitions:** 180ms `opacity` cross-fade + `translateY(4px)` settle.
- **Feedback reveals:** 180ms `max-height` + `opacity`.
- **Data resolution:** fee bars, score bars settle at 300-500ms ease-out.
- **Hard caps:** no transition > 500ms. No parallax. No autoplay. No entrance animations on text.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` — chain shows settled state immediately; lab transitions and feedback reveals collapse to instant (0ms duration). All new animations added to this rule.

---

## Full route table (V2 — for reference, not V1)

The UX panel found 8 of 16 labs had no route in v1's scheme. Complete table (for when V2 ships):

| Module | Current hash | V2 path | Section |
|---|---|---|---|
| Lab 1: BICs & IBANs | `#lab-1` | `/learn/labs/1` | Learn |
| Lab 2: Checksums | `#lab-2` | `/learn/labs/2` | Learn |
| Lab 3: VoP | `#lab-3` | `/learn/labs/3` | Learn |
| Lab 4: Routing | `#lab-4` | `/learn/labs/4` | Learn |
| Lab 5: SSI | `#lab-5` | `/learn/labs/5` | Learn |
| Lab 6: Tracking | `#lab-6` | `/learn/labs/6` | Learn |
| Lab 7: Schemes | `#lab-7` | `/learn/labs/7` | Learn |
| Capstone | `#lab-capstone` | `/learn/capstone` | Learn |
| Fees | `#fees` | `/learn/deeper/fees` | Learn |
| FX | `#fx` | `/learn/deeper/fx` | Learn |
| Sanctions | `#sanctions` | `/learn/deeper/sanctions` | Learn |
| Settlement | `#settlement` | `/learn/deeper/settlement` | Learn |
| MT103 | `#mt103` | `/learn/deeper/mt103` | Learn |
| Cases | `#cases` | `/learn/deeper/cases` | Learn |
| Glossary | `#glossary` | `/learn/deeper/glossary` | Learn |
| Progress | `#progress` | (sidebar chip, not a page) | Learn |

---

## V2 deferred items (require their own spec + telemetry justification)

| Item | Blocker | Disposition |
|---|---|---|
| Shell merge (Learn + API + Tools) | Frontend tests needed first; telemetry must show drop-off | Defer to V2 spec |
| ⌘K search | Needs full spec: results schema, keyboard map, focus trap, gating reconciliation | Defer to V2 spec |
| Custom API docs | Killed — styled Swagger + 3 curated deep-dives (`/api/prepare-payment`, `/api/track/create`, `/api/validate`) instead | If built at all |
| Dark theme | Needs dark semantic pairs + QA | Defer indefinitely |
| Tools as top-level section | Needs identity decision (reference mode? power-user surface?) | Defer |
| Capstone sessionStorage | Needed for cross-section navigation in V2 | V2 prerequisite |
| Progress reconciliation across merged shell | Decide: shared state across Learn/API/Tools, or Learn-scoped? | V2 spec must answer |
| Go-deeper grouping | Flat list until content justifies grouping (3 of 5 groups had 1 item) | When content grows |

---

## What's explicitly NOT in scope

- Framework migration (React/Vue/Svelte) — vanilla JS stays
- Shell merge — V1 improves both shells independently
- ⌘K search — deferred (needs full interaction spec)
- Custom API docs — killed (Swagger suffices)
- Dark theme — deferred (needs semantic color design)
- Trail-draw animation — deferred (single-row-scroll makes it lower-value)
- Tools section promotion — deferred (needs identity decision)
