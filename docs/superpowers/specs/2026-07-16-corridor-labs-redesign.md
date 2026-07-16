# Design Spec: Corridor Labs Redesign

> **Date:** 2026-07-16 · **Status:** Approved by user · **Source:** 3-expert panel (brand strategist + UX architect + visual designer)

## Product identity

- **Name:** Corridor Labs
- **Tagline:** Learn payments by sending them.
- **One word:** Grounding
- **Positioning:** For fintech engineers, payment-ops staff, and students who need to understand how cross-border payments move, Corridor Labs is an interactive sandbox that teaches IBANs, VoP, correspondent routing, SSI, and UETR tracking through hands-on labs — unlike SWIFT docs or YouTube explainers, we let you build a real cross-border payment end-to-end in a safe, simulated environment where you can break things without consequence.
- **Trademark:** Drop "SWIFT" from all branding. Use "cross-border payments" / "correspondent banking" instead.

## Architecture: docs-site shell (Stripe/MDN pattern)

**One shell, three sections.** Kill the dual-SPA split (`/learn` + `/ui`). Merge into a single app:

```
┌──────────────────────────────────────────────────────────────────┐
│ ⚠ SIMULATION — educational sandbox, not for real payments         │ ← 36px sticky banner
├──────────────────────────────────────────────────────────────────┤
│  Corridor Labs          [Learn] [API] [Tools]    [⌘K Search]     │ ← 52px sticky top bar
├───────────┬──────────────────────────────────────────────────────┤
│           │                                                      │
│  SIDEBAR  │              CONTENT                                 │
│  (280px)  │         (760px learn / 1100px api+tools)             │
│           │                                                      │
│  Section- │                                                      │
│  scoped   │                                                      │
│  tree     │                                                      │
│           │                                                      │
│  ───────  │                                                      │
│  3/8 core │                                                      │
│  [Resume] │                                                      │
└───────────┴──────────────────────────────────────────────────────┘
```

### Three sections

1. **Learn** (default landing) — the guided course. Sequential, prerequisite-gated core path (Labs 1–7 + Capstone) + ungated "Go deeper" modules regrouped by topic (Cost / Compliance / Messages / Practice / Reference).
2. **API** — Stripe-style endpoint pages. Each endpoint gets: description, params, live "Try it" panel, curl example, error responses. Content width widens to ~1100px for side-by-side docs + response.
3. **Tools** — the former `/ui` admin dashboard. Directory, Corridors, SSI, VoP, Prepare Payment, Tracking. Absorbed into the same shell.

### Navigation

- **Top bar (52px sticky):** wordmark, three section tabs (Learn/API/Tools), ⌘K search, SIM toggle.
- **Left sidebar (280px, collapsible):** section-scoped tree. "Go deeper" modules collapsed by default under topic groups. Progress chip at bottom ("3/8 · Resume Lab 3").
- **In-content navigation:** every lab ends with "Next lab →" and "← Previous" buttons. This is the single most important navigation addition.
- **Landing page:** hero + one primary CTA ("Start Lab 1" or "Resume") + progress summary. No 16-item wall.

### Routes

| Old | New | Notes |
|-----|-----|-------|
| `/` → `/learn` | `/` → `/learn` (stays) | Root redirects to Learn landing |
| `/learn` | `/learn` | Section: Learn (landing + labs) |
| `/learn#lab-N` | `/learn/labs/N` | Deep-linkable lab pages |
| `/ui` | `/tools` | Section: Tools (was admin SPA) |
| `/docs` (Swagger) | `/api` | Section: API (Stripe-style endpoint pages) |
| `/api/manifest` | `/api/manifest` (stays) | JSON endpoint manifest |

## Color system

**Warm neutrals (stone family) + teal accent.** Light-first, dark theme as first-class peer.

### Light theme (default)

| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#fafaf9` | page bg |
| `--surface` | `#ffffff` | cards, inputs |
| `--surface-2` | `#f5f5f4` | table headers, hover |
| `--surface-3` | `#eeeeec` | active nav |
| `--ink` | `#1c1917` | primary text |
| `--ink-2` | `#57534e` | secondary text |
| `--ink-3` | `#78716c` | muted labels (AA ~4.6:1) |
| `--accent` | `#0f766e` | teal-700 — links, active, primary btn |
| `--accent-hover` | `#115e59` | teal-800 |
| `--accent-bright` | `#14b8a6` | teal-500 — chart fills, animated dot |
| `--accent-surface` | `#f0fdfa` | pale teal badges |
| `--success` / `-bg` | `#15803d` / `#f0fdf4` | PROCEED |
| `--warn` / `-bg` | `#b45309` / `#fffbeb` | REVIEW |
| `--danger` / `-bg` | `#b91c1c` / `#fef2f2` | STOP |
| `--border` | `#e7e5e4` | structural separation |
| `--border-strong` | `#d6d3d1` | inputs, focus prep |

### Dark theme (`[data-theme="dark"]`)

| Token | Hex |
|---|---|
| `--canvas` | `#1c1917` |
| `--surface` | `#292524` |
| `--surface-2` | `#232020` |
| `--surface-3` | `#44403c` |
| `--ink` | `#fafaf9` |
| `--ink-2` | `#d6d3d1` |
| `--ink-3` | `#a8a29e` |
| `--accent` | `#2dd4bf` |
| `--accent-hover` | `#5eead4` |
| `--accent-surface` | `rgba(45,212,191,0.12)` |
| `--border` | `#44403c` |

## Typography

| Role | Font | Why |
|---|---|---|
| Body / UI / headings | **Inter** (variable, self-hosted) | Best-in-class at 12–16px, full French diacritic coverage, tabular-nums |
| Data / mono | **IBM Plex Mono** (self-hosted) | No ligatures (critical — ligatures corrupt IBANs), strong digit clarity |
| Fallback | `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` | Pre-swap readability |

**Base size:** `html { font-size: 16px }` (up from 15px).

**Type scale (7 steps):**

| Token | Size | Use |
|---|---|---|
| `--text-xs` | 12px | captions, mono data, timestamps |
| `--text-sm` | 14px | secondary text, nav, buttons |
| `--text-base` | 16px | body, inputs |
| `--text-lg` | 18px | lead paragraph, concept body |
| `--text-xl` | 24px | h2, section heads |
| `--text-2xl` | 30px | h1 (labs), landing title |
| `--text-3xl` | 38px | landing hero only |

**Line-height:** body 1.55, headings 1.2, UI 1.4, mono 1.35.
**Max measure:** `66ch` for lab reading content.
**Tabular figures:** `font-variant-numeric: tabular-nums` on all amount/IBAN cells.

## Spacing & radius

**Spacing scale (7 steps, ban raw rems):**

| Token | px | Use |
|---|---|---|
| `--space-1` | 4 | icon-to-text gap |
| `--space-2` | 8 | inline gaps, input padding-y |
| `--space-3` | 12 | card internal gaps, nav padding |
| `--space-4` | 16 | default rhythm, card padding |
| `--space-5` | 24 | section sub-heads |
| `--space-6` | 32 | page section spacing |
| `--space-7` | 48 | between major sections |

**Radius (2 + 1 semantic):**

| Token | px | Use |
|---|---|---|
| `--radius-sm` | 6 | inputs, badges, pills |
| `--radius-md` | 12 | cards, modals, result panels, viz containers |
| `--radius-full` | 999 | nav number circles, chips |

**Border:** `1px` everywhere, `--border` for structure, `--border-strong` for inputs. No shadows for elevation (flat-surface principle stays).

## Key components

### Correspondent chain (hero visual)

- **Kill emoji.** Replace `🏦📍✓✗` with 20px monoline SVG glyphs (card, vault, inbox, ban-circle).
- **Tonal nodes:** originator = `--accent-surface`, beneficiary = `--success-bg`, intermediary = `--warn-bg`, reject = `--danger-bg`.
- **The packet carries cargo:** a 14px rounded-square (not circle) carrying the amount label (`$5,000`) as a mono tag.
- **One-shot animation:** packet travels origin → beneficiary, ~450ms per hop, ease-in-out. Settles on beneficiary. No infinite loop. Replay button provided.
- **Trail draw:** each segment's dash-offset animates as the packet crosses, leaving a lit trail in `--accent-bright`.

### Lab exercise card

- 28px monoline SVG badge (not emoji) in `--ink-2`.
- 3px left rail in `--accent` for visual scannability.
- Input + Check button on one row (inline-right).
- Feedback: rail animates to `--success` (correct) or `--danger` (wrong). Result panel slides open (180ms, `max-height` + `opacity`). Wrong = "not yet," not "failure."

### Recommendation badge (PROCEED / REVIEW / STOP)

- Size up: 16px minimum, weight 700, padding `--space-2 --space-4`.
- Leading glyph mandatory: check / alert-triangle / octagon.
- Three treatments:
  - **PROCEED** — soft: `--success-bg` fill, `--success` text, 1px border.
  - **REVIEW** — medium: `--warn-bg` fill, `--warn` text, 1px border.
  - **STOP** — hard: **solid** `--danger` fill, **white** text, no border. The one place you break "flat soft."
- Banner variant for top-of-result-panel (full-width, glyph left, word + reason right).

## Motion philosophy

- **Chain:** one-shot (not infinite), ~450ms per hop, settles on beneficiary.
- **Lab transitions:** 180ms `opacity` cross-fade + `translateY(4px)` settle.
- **Feedback reveals:** 180ms `max-height` + `opacity`.
- **Data resolution:** fee bars, score bars settle at 300–500ms ease-out.
- **Hard caps:** no transition > 500ms. No parallax. No autoplay. No entrance animations on text.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` — already implemented, keep. One-shot chain users see the resting state immediately.

## Implementation phasing

This is a large redesign. Recommended order (each phase delivers standalone value):

1. **Design tokens** — new color system, fonts, spacing scale, radius. One `tokens.css` shared by all surfaces. (~1 day)
2. **Rename + rebrand** — "Corridor Labs" everywhere, drop "SWIFT," new tagline. (~½ day)
3. **Component upgrades** — chain SVG + one-shot motion, recommendation badge, exercise card. (~2 days)
4. **Shell merge** — unify `/learn` + `/ui` into one app with top nav + section tabs + ⌘K search. (~3-4 days)
5. **API section** — Stripe-style endpoint pages with live "Try it." (~2 days)
6. **Dark theme** — `[data-theme="dark"]` token overrides + toggle. (~1 day)

Total: ~10 days for the full redesign. Phases 1-3 deliver visible improvement without the architectural risk of the shell merge.
