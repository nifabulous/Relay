# Relay Design System

Relay is a responsive educational payment simulation. Its interface is precise, explainable and built
on visible structure. It must serve first-time learners and experienced payment practitioners without
splitting them into separate products.

The product descriptor is **Educational payment simulation**. Recommendation and tracking results also
display **Simulation — not a real payment**.

## Adoption status

This document was rewritten on 2026-10-01. The new language is adopted surface by surface. Until a
surface migrates, its current values stay authoritative.

| Surface | System in force | Source of values |
|---|---|---|
| Landing page `/` (Phase 1) | This document | `frontend/src/landing/client/styles/tokens.css` (values defined below) |
| Route showpiece in Prepare, Tracking, Atlas (Phase 2) | This document once shipped | Landing tokens shared through `design-system/` |
| App workspaces `/app` (Phase 3) | Previous system until migrated | `frontend/src/design-system/tokens.css` (Instrument Sans, IBM Plex Mono, `#3157D5`) |

**Two kinds of rule.**

- Rules marked **(new system)** apply only to surfaces that have migrated: the landing page now, the
  others by phase. This covers all of **Visual foundations** and **Surfaces**, and the marked rules in
  **Route signature**, **Content** and **Responsive and accessibility**.
- Every other rule applies to every surface now: the principles except 1 and 6, status, accessibility,
  the application hierarchy, the component contract, anti-template constraints and floating surfaces.

Until a workspace migrates, it follows **Appendix A**. New work inside that workspace matches
Appendix A, not the new system, so one screen never mixes the two. When Phase 3 migrates `tokens.css`,
it becomes the single authoritative source again; this table, Appendix A and `contrast.test.ts` change
in the same commit.

Specification: [Relay landing page and visual language](docs/superpowers/specs/2026-10-01-relay-landing-and-visual-language-design.md).

## Principles

1. **Structure is visible (new system).** Hairline rails, rules and cells organise the page. The lines are real
   borders of real boxes, never decoration laid over content.
2. **The route is the visual signature.** Payments move along lines: the page's own lines, a route
   diagram, an arc on the globe.
3. **One screen, one dominant action.**
4. **Dense information is grouped, not decorated.**
5. **Status is expressed with text, icon and colour, never colour alone.**
6. **Every number is true (new system).** Facts about Relay come from repository data, never typed by
   hand. Demonstration values are labelled as fictional or illustrative.
7. **Guidance appears at the moment of use** and never blocks experienced users.
8. **Desktop and mobile are equal product surfaces.**
9. **Every asynchronous region has stable states:** loading, empty, error, success and partial.

## Visual foundations

### Typography

- **Geist** for interface, headings, controls and learning content. **Geist Mono** for IBANs, BICs,
  UETRs, account identifiers, raw messages, code, labels and aligned amounts. Both are SIL OFL 1.1,
  self-hosted from `@fontsource/geist` and `@fontsource/geist-mono`. The `geist` npm package targets
  Next.js and ships no Latin subset, so it is not used.
- **Loading:** self-host woff2 with a Latin subset, `font-display: swap` and metric-compatible fallbacks.
  The app's current fonts load from Google Fonts in `frontend/index.html`; Phase 3 replaces that with
  self-hosting.
- **Weights:** headings use 500. Body uses 400. Semibold 600 is for the wordmark and rare emphasis only.
- **Mono:** disable ligatures. Use tabular numerals in any aligned numeric column.
- **Form controls** stay at 16px or larger on mobile.
- **Measure:** body copy uses a 45–75 character measure, 66 being the target.

| Role | Size / line | Tracking | At 980px and below | At 640px and below |
|---|---|---|---|---|
| Display (H1) | 60 / 64 | −0.3px | 48 / 52 | 38 / 42 |
| Section (H2) | 52 / 56 | −0.52px | 40 / 44 | 32 / 36 |
| Stat value | 40 / 44 | −0.4px | 40 / 44 | 34 / 38 |
| Heading (H3) | 20 / 26 | −0.1px | same | same |
| Body | 16 / 24 | 0 | same | same |
| Small | 14 / 21 | 0 | same | same |
| Label (mono, uppercase) | 12 / 16 | +0.06em | same | same |

**Labels.** Mono labels in brackets name and number sections and fields, for example `[ 01 / 06 ]` and
`[ corridor ]`. The bracket or number takes the accent token; the words take the muted text token.

### Colour

All values are hex, generated in OKLCH with the hue held, and checked for contrast.

**Primary (blurple).** Step 600 is the brand value, pinned exactly.

| 50 | 100 | 200 | 300 | 400 | 500 | **600** | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| `#F5F6FE` | `#EAEDFF` | `#D8DEFF` | `#BBC4FF` | `#95A0FF` | `#7277FF` | **`#533AFD`** | `#472CDD` | `#351DAE` | `#23107D` | `#16065A` |

Primary is reserved for actions, selection, progress, focus, the route, and structural markers (rule
crosshairs and label indices). Primary 200 is the tinted hairline around primary elements. Primary 50
is the selected or active surface.

**Neutral (cool navy ink).** Text is navy, never pure grey or black.

| 0 | 25 | 50 | 100 | 200 | 300 | 400 | **500** | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `#F9FAFC` | `#F4F7FA` | `#EFF3F8` | `#E5EAF1` | `#D1D8E1` | `#B2BCC8` | `#8693A5` | **`#5F6F85`** | `#4D5F76` | `#354962` | `#1F344F` | `#0B223E` | `#021732` |

| Role | Token | Value |
|---|---|---|
| Canvas | `n0` | `#F9FAFC` |
| Surface (panels, active cells) | white | `#FFFFFF` |
| Tint surface | `n25` / `n50` | `#F4F7FA` / `#EFF3F8` |
| Hairline (rails, rules, cell borders) | `n100` | `#E5EAF1` |
| Strong boundary (controls, plates) | `n200` | `#D1D8E1` |
| Faint cell lines | — | `#EEF1F6` |
| Headings and primary text | `n950` | `#021732` |
| Body text | `n600` | `#4D5F76` |
| Muted text and labels | `n500` | `#5F6F85` |
| Non-text only (icons beside text, large decorative numerals) | `n400` | `#8693A5` |
| Dark band | `n950` | `#021732` |

**Status.** Status colours are reserved meaning, always shown with an icon and a label.

| State | Text | On white | On canvas `n0` | On tint `n25` |
|---|---|---|---|---|
| Success | `#0A7D52` | 5.16:1 | 4.94:1 | 4.80:1 |
| Warning | `#A35200` | 5.58:1 | 5.34:1 | 5.19:1 |
| Danger | `#CE0045` | 5.66:1 | 5.42:1 | 5.26:1 |

**Data colours (categorical).** These are for corridors, series and any other identity encoding. They
are used in this fixed order, never cycled, and capped at eight.

| Slot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Hue | blurple | coral | magenta | amber | sky | green | violet | teal |
| Light | `#533AFD` | `#EF5F2F` | `#BF3784` | `#E3A200` | `#3394F2` | `#178F4F` | `#A05DF2` | `#0FB3A2` |

| Dark and black | `#6B52FF` | `#EF5F2F` | `#BF3784` | `#C08A00` | `#3394F2` | `#178F4F` | `#A05DF2` | `#0E9E8F` |

Both rows keep the same hues in the same order; only blurple, amber and teal are re-stepped for dark
surfaces. Both were validated on 2026-10-01 with the dataviz validator, including the wraparound pair
because the globe tour loops.

| Check | Light, on white | Dark, on `#040A15` and `#000000` |
|---|---|---|
| Worst adjacent pair, colour-blind (target 8) | ΔE 18.3 (deuteranopia) | ΔE 17.4 |
| Worst adjacent pair, normal vision (floor 15) | ΔE 18.4 | ΔE 18.4 |
| Lightness band and chroma floor | pass | pass |
| Contrast vs surface (3:1 for marks) | amber 2.23:1 and teal 2.63:1 below | all pass (lowest 3.87:1) |

Because amber and teal fall below 3:1 in light mode, every mark in this palette carries a visible text
label in every theme.

Rules:

- **Slot 1 is the primary hue on purpose.** It belongs to the first entity, which on the landing page is
  Relay's own demonstration corridor. Because it matches the selection colour, a selected or active state
  in a data context must also change the surface or the text weight. It is never shown by colour alone.
- Colour follows the entity, never its rank.
- Text never takes a series colour. Labels stay in ink, with a swatch beside them.
- A ninth series folds into "Other" or a facet.
- Status colours are never used as series colours.
- Data colours never decorate chrome.

**Contrast band.** One section per page may sit on a band that contrasts with the page. In light mode
the band is `n950`. In dark it is the primary-tinted `#0E0C32`, and in black `#0B0920`, so the band
still reads against a dark canvas.

| Band text | Light band | Dark and black bands |
|---|---|---|
| Headings | `#FFFFFF` | `#FFFFFF` |
| Body | `#AEB9C9` (9.04:1) | `#B4BFCE` (10.10:1) |
| Muted | `#8794A8` (5.83:1) | `#8A97AB` (6.35:1) |
| Hairlines | `rgba(255,255,255,.10)` | `rgba(149,160,255,.14)` | Primary shifts to 300 (`#BBC4FF`, 10.63:1) or 400
(`#95A0FF`, 7.47:1) for text and marks.

### Dark and black themes

The new system ships three themes, matching the app's preference values. `black` is the OLED variant:
it has its own surfaces and lines (below), takes every other value from dark, and answers any binary
question as dark. Its selector block, `:root[data-theme="black"]`, is self-contained: it repeats every
dark value it uses. That way it renders correctly when the OS is set to light, where the dark media
query does not apply.

| Role | Light | Dark | Black |
|---|---|---|---|
| Canvas | `#F9FAFC` | `#040A15` | `#000000` |
| Surface | `#FFFFFF` | `#0A1322` | `#0B0B0F` |
| Tint surface | `#F4F7FA` | `#0F1A2C` | `#121217` |
| Hairline | `#E5EAF1` | `#172234` | `#1C1C22` |
| Strong boundary | `#D1D8E1` | `#25334B` | `#2A2A31` |
| Faint cell lines | `#EEF1F6` | `#0B1526` | `#0A0A0E` |
| Headings | `#021732` | `#F3F6FA` | `#F5F5F7` |
| Body | `#4D5F76` | `#B4BFCE` | `#B5B7C0` |
| Muted and labels | `#5F6F85` | `#8A97AB` | `#8E909B` |
| Accent text, links, route, focus | `#533AFD` | `#95A0FF` | `#95A0FF` |
| Primary fill (buttons) | `#533AFD` | `#533AFD` | `#533AFD` |
| Selected surface | `#F5F6FE` | `rgba(83,58,253,.16)` | same as dark |
| Tinted hairline | `#D8DEFF` | `rgba(149,160,255,.32)` | same as dark |
| Success / warning / danger | `#0A7D52` / `#A35200` / `#CE0045` | `#43C98F` / `#F0B44C` / `#FF6B8B` | same as dark |
| Dark band | `#021732` | `#0E0C32` | `#0B0920` |

Measured in the dark theme, on its canvas / surface / tint: body text 10.65 / 9.99 / 9.37:1, muted text
6.70 / 6.28 / 5.89:1, accent text 8.26 / 7.75 / 7.26:1, and status colours at least 6.42:1. In black:
body 10.50 / 9.82 / 9.34:1, muted 6.61 / 6.19 / 5.88:1, accent 8.75 / 8.19 / 7.78:1, and status at least
6.87:1. White on the primary fill is 6.19:1 in every theme. The primary
fill against the dark canvas is 3.20:1, which clears 3:1 for a control boundary.

**Rules for dark surfaces:**

- Accent text, links and route lines use primary 400, never 600: 600 on the dark canvas is only 3.20:1.
- Elevation is a lighter surface, never a shadow (see **Floating surfaces**).
- Pending and inactive states use the muted token, never reduced opacity. This holds in every theme:
  opacity below 1 drops text under AA.
- The globe reads its colours from the theme tokens and redraws when the theme changes. Dots are
  `rgb(168,180,198)` at 10–58% alpha in dark; labels sit on a surface-coloured plate with heading-colour
  text.

### Theme preference

All Relay surfaces on the same origin share one preference contract, defined by the app:

- **Storage:** `localStorage["relay:preferences"]` holds an object with `schemaVersion: 1`, `theme`
  (`system`, `light`, `dark` or `black`), `reducedMotion`, `navigationDensity` and
  `firstRunGuidanceSeen`.
- **Pre-paint:** a synchronous inline script stamps `data-theme`, or leaves it absent for `system`, and
  sets `color-scheme` before first paint. Each HTML entry carries a copy of the same script, and a test
  executes every copy against `applyTheme()`.
- **Dark palette selectors:** the dark palette applies under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and under
  `:root[data-theme="dark"]`. Black overrides under `:root[data-theme="black"]`.
- **Writes:** the app's loader does not merge defaults. Any surface that writes the theme must:
  - re-read storage at the moment of the write;
  - merge only `theme` into a valid schemaVersion 1 record, never adding, removing or repairing other
    fields;
  - write the complete default record when nothing is stored.

  It must never overwrite a record that is corrupt, is not an object, or has another `schemaVersion`.
  In those cases, and whenever storage throws, it changes the theme for the current page only.
- **Open tabs:** the app keeps an in-memory copy of preferences and does not listen for `storage` events.
  A theme changed in one tab can be overwritten by another open tab's next write, so preferences carry
  across page loads, not between tabs that are open at the same time.
- **Reduced motion:** a stored `reducedMotion: true` counts as reduced motion, in addition to the
  `prefers-reduced-motion` media query.

**Measured text contrast (WCAG 2.2).**

| Pair | Ratio |
|---|---|
| `n950` on `n25` | 16.68:1 |
| `n600` on white | 6.53:1 |
| `n600` on canvas | 6.26:1 |
| `n500` on white | 5.12:1 |
| `n500` on canvas | 4.91:1 |
| `n500` on `n50` | 4.60:1 |
| `p600` on white, and white on `p600` | 6.19:1 |
| `p600` on `p50` | 5.75:1 |
| `p700` on `p50` | 7.30:1 |

Hairlines are deliberately quiet: `n100` measures 1.16:1 and `n200` 1.38:1 against the canvas. They
separate regions of a known layout and are never the only boundary of an interactive control. Controls
use a fill or the `n200` boundary plus a text label. Do not restate this as blanket AA compliance for
borders.

**Themes in the app.** `tokens.css` ships light, `dark` and `black` (OLED) themes. `theme.ts` answers
binary questions about `black` as dark while it paints from its own palette. Until Phase 3, those
themes keep their current values; Phase 3 migrates them to the values in **Dark and black themes**.
Any surface that depends on a canvas-to-surface step must be checked in `black`, where that step is
narrowest.

### Lines system

The lines are the structure. There are four kinds, all 1px in the hairline colour unless stated.

1. **Rails.** Vertical lines fixed to the viewport for the full page height.
   - Container rails sit on the content container's edges at every width, using the same formula as the
     container: `calc(50% ± min(1080px, 100% − 2 × gutter) / 2)`.
   - Outer rails sit at `calc(50% ± 680px)` and show only at 1400px and wider.
   - Rails sit above content in z-order but take no pointer events.
2. **Rules.** Full-bleed horizontal lines between sections. Each rule carries a 13px crosshair in primary
   where it crosses the container rails.
3. **Cell borders.** Grids of content are divided by the borders of their cells. Cells size to their
   content: no fixed heights and no absolutely positioned text inside a cell. The grid's lines are the
   cells' own borders.
4. **Faint cells.** A 120px square lattice in `#EEF1F6`, used only behind a hero, a call to action or a
   diagram stage, and masked to fade at its edges. Never behind body text.

**Containment rule.** Nothing overflows its bordered box at 390, 768, 1024 or 1440px, and the page never
scrolls horizontally. Long strings wrap (`overflow-wrap: anywhere` for identifiers). Code blocks scroll
inside their own box.

### Spacing and shape

- **Spacing:** use a 4px base scale of 4, 8, 12, 16, 24, 32, 48, 64, 72 and 104px. Cells pad 24px, or
  20px at 640px and below. Section heads pad 72px top and 40px bottom.
- **Gutters:** page gutters are 16px, or 12px at 640px and below.
- **Radii:** buttons and inputs use 10px. Small controls and chips inside cells use 6–8px. Pills and
  status chips use a full radius. Cells and sections are square: their edges are the lines.
- **Nested radii** equal the outer radius minus the inset gap.
- **No decorative shadows.** The primary button may carry one inset shade for press affordance. Floating
  surfaces follow **Floating surfaces** below.

### Motion

- **Animate** transform, opacity, stroke-dashoffset and canvas drawing only. Never use
  `transition: all`.
- **Scroll-driven pieces** (route, plates) map their state to scroll position and run no timers.
- **Ambient motion** (the globe tour) pauses when off screen and on any user interaction. Anything that
  starts by itself and moves for more than 5 seconds carries a visible, keyboard-reachable pause control
  (WCAG 2.2.2). Short demonstrations play once and offer a replay rather than looping.
- **Reduced motion** shows each animated element's final state, with no tour, sway or count-up.
  User-initiated motion such as dragging the globe still works.
- **Durations:** UI state changes take 150–350ms. Narrative motion takes 1–2s per beat.

## Surfaces

**Persuade surfaces** (the landing page, launch material) may use display type, faint cells, the globe,
the dark band and ambient motion.

**Operate surfaces** (the four workspaces) keep information density. They use rails, rules and cell
borders as layout, and mono labels, but no faint cells behind working content, no ambient motion and no
display type above 40px.

## Application hierarchy

```text
Shell
├── Overview: adaptive primary action → current context → utility row → activity
├── Learn: current module → lesson or exercise → sequence and progress
├── Explore: search or categories → results or detail → related actions
└── Operate: active payment step → result → prior-step summaries → next action
```

The shell has exactly four workspaces. Desktop uses a persistent left rail and top bar. Mobile uses a
four-item bottom bar for Overview, Learn, Explore and Operate. Search, recent activity, Help and
secondary actions live in a top sheet.

## Components

Feature code uses shared components for navigation, buttons, form controls, panels, status, tables,
mobile record lists, timelines, steppers, route diagrams, geographic instruments, alerts, skeletons and
empty states.

A **geographic instrument** renders data onto real topology: the Atlas map or the landing globe. It
earns its place only when position carries a fact. It pairs with a synced text equivalent that carries
every value the geometry encodes; for the globe, that is the corridor legend. It keeps its own marks out
of the accessibility tree, and it never takes a reserved colour for a data scale. Selection is reachable
without hitting geometry.

**Cards** are allowed only when the surface is independently selectable, movable or meaningfully
bounded. Layout grouping alone does not justify a card. A ruled cell in a grid is not a card: it has no
radius, no shadow and no surface of its own unless it is active.

Every component defines:

- Default, hover, pressed, focus-visible, disabled, loading, error and success behaviour where applicable.
- Keyboard interaction and focus restoration.
- Accessible name and status announcement behaviour.
- Desktop, tablet and mobile behaviour.
- Long-label, large-number and localisation overflow behaviour.

## Route signature

The payment route is Relay's primary visual signature. It uses a continuous directional path,
institution nodes, explicit currency and amount, and stepped or moving payment state.

- **Lines (new system).** On persuade surfaces the route runs along the page's own grid lines and turns at
  intersections. Nodes are 14px squares in primary, filled when reached.
- **Motion.** Desktop may animate state changes using transform, opacity and stroke-dashoffset.
  Reduced-motion mode uses equivalent stepped states without travel animation.
- **Mobile.** Mobile uses a vertical stepper in document order. Every institution stays visible. The
  active hop expands with amount, fee, timing and status, while completed and upcoming hops stay compact.
- **Screen readers** receive a concise origin, intermediary, beneficiary, currency, amount and outcome
  summary.
- **Failures.** Reject and incomplete paths explain where movement stopped and why.
- **Demonstrations (new system).** Demonstration routes on persuade surfaces use only fictional
  institutions: Harborline Bank (Lagos), Meridian Clearing (London) and Northstar Bank (UK). Real bank
  names do not appear there. The app's labs may name real correspondent banks as reference data, for
  teaching.

## Content

- **Operational labels:** "Prepare payment", "Retry routing", "Edit beneficiary", not "Continue" or
  "Submit".
- **No filler:** remove welcome copy, aspiration claims and instructions that restate visible controls.
- **Errors** state what happened, what remains safe and what the user can do next.
- **Empty states** provide context and one relevant action.
- **In-progress labels** use "…".
- **Numbers (new system)** that describe Relay come from generated data with a drift test. A number with no source
  is removed, not estimated. Demonstration values (a fictional payment, its timestamps, an example IBAN)
  are allowed when the page presents them as fictional or illustrative.
- **Links** point at something that exists. Do not show controls for features Relay does not have, such
  as "Sign in": Relay has no learner accounts.
- **Simulation.** Every payment-shaped surface states that it is a simulation, including each
  payment-shaped section of a long page. Account numbers shown are
  `ACCT-` placeholders.

## Responsive and accessibility

- **Acceptance viewports:** 390×844, 768px wide, 1024px wide and 1440×900.
- **Touch targets:** primary touch targets are at least 44×44px.
- **Zoom:** do not disable browser zoom.
- **Safe areas:** use safe-area insets for fixed and sticky navigation.
- **Tables** become labelled record lists when their columns cannot stay legible.
- **Labels:** preserve visible labels when fields contain values.
- **Keyboard and structure:** provide complete keyboard operation, logical focus order, landmarks,
  headings, live regions and focus trapping where appropriate. Tabs follow the WAI-ARIA tabs pattern.
- **Focus (new system):** a 2px outline in the theme's accent token (primary 600 in light, primary 400
  in dark and black) with a 2px offset. App workspaces keep their current focus style
  (`frontend/src/design-system/global.css`) until they migrate.
- **Motion:** respect `prefers-reduced-motion`.
- **Visited links** have a distinguishable state.

## Anti-template constraints

- No dashboard mosaic of floating cards. Ruled cells are the grid; cards need a reason (see
  **Components**).
- No three-column promotional feature grid of icon, title and blurb.
- No decorative icon circles, coloured card edges, gradients, blobs or ornamental illustrations. Masks
  that fade faint cells are allowed.
- No generic hero copy and no centred-everything composition below the hero.
- No emoji as interface icons.
- No uniform large radius on every surface.
- No chart when the route or a direct value comparison communicates the point better.
- No categorical colour on navigation or tabs.

## Floating surfaces

A floating surface sits above content the system does not control and cannot predict. The hairline that
separates an inline panel from a known canvas is not enough here: hairlines are deliberately quiet (see
**Colour**), and over arbitrary scrolling content that quiet stops being cosmetic.

**A floating surface gets exactly one step of elevation, expressed as an effect rather than a
mechanism.** In light mode the step is a shadow. In dark mode the step is a lighter surface, because a
shadow works by being darker than its backdrop: on the dark canvas the shadow colour is around five times
lighter and reads as a smudge or as nothing. One rule, two correct expressions. This is not a licence for
decorative shadows; the rule in **Spacing and shape** still holds for every surface that is not floating.
The app's floating tutor surfaces use `--color-floating-border` from `tokens.css`, which clears 3:1
against their light and dark surfaces.

**Specify what a floating surface obscures.** An open panel covers content, and which content is a design
decision, not an accident of z-index:

| Viewport | The panel occupies | It must never cover |
| --- | --- | --- |
| `≥1024px` | a right column; page content reflows beside it | the primary navigation rail, the top bar, the simulation banner |
| `<1024px` | a bottom sheet above the fixed bottom navigation | the bottom navigation itself, the simulation banner |

The simulation banner is on both never-cover lists deliberately. It is the one element on screen stating
that none of this is real, and a panel that hides it while answering questions about payments removes
that statement at exactly the moment it matters most.

## Source specifications

- [Relay landing page and visual language](docs/superpowers/specs/2026-10-01-relay-landing-and-visual-language-design.md):
  this system, Phase 1.
- [Relay UI rebuild design](docs/superpowers/specs/2026-07-17-relay-ui-rebuild-design.md): product
  journeys, application architecture, state matrix, migration strategy and testing gates.

## Appendix A: app workspaces until Phase 3

Until Phase 3 migrates them, the `/app` workspaces keep the visual foundations below. These are the
foundations this document carried before the 2026-10-01 rewrite. `frontend/src/design-system/tokens.css`
is the authoritative source for them; it also defines hover, pressed, surface and border variants and
the `-bg` and `-border` companions for each semantic colour. Change values there, then mirror them here.

| Token | Value | Use |
|---|---|---|
| `--color-action` | `#3157D5` | Primary actions, selected navigation, links, progress |
| `--color-ink-strong` | `#16233D` | Strong emphasis and primary text |
| `--color-ink` | `#2D3A52` | Body text |
| `--color-canvas` | `#F6F8FC` | Application background |
| `--color-surface` | `#FFFFFF` | Navigation, panels, data regions |
| `--color-border` | `#DCE2EB` | Structural boundaries |
| `--color-border-strong` | `#C4CDD9` | Boundaries that must stay perceivable on canvas |
| `--color-floating-border` | `#667085` light / `#6E82AD` dark | 3:1+ boundary for floating tutor surfaces |
| `--color-ink-muted` | `#586273` | Secondary text |
| `--color-success` | `#0E5C44` | Passed and proceed states |
| `--color-warning` | `#9A5A0C` | Needs-attention and review states |
| `--color-danger` | `#9E2B34` | Failed, stop and destructive states |

- **Do not revert the semantic values.** The four semantic values above are deliberately darker than the
  original palette (`#68748A`, `#16825D`, `#C87B16`, `#C8424D`), which did not clear WCAG 2.2 AA against
  their own `-bg` surfaces. `tokens.css` records the measured ratio for each.
- **Semantic colours** are used only with an explicit label and icon.
- **Contrast, measured 2026-08-14.** All text pairings meet WCAG 2.2 AA. Ordinary structural borders are
  intentionally lighter: `--color-border` measures 1.23:1 and `--color-border-strong` 1.51:1 against the
  canvas. The floating tutor surfaces use `--color-floating-border`, which clears 3:1 against their light
  and dark surfaces. Do not restate this as blanket AA compliance.
- **Themes.** `tokens.css` defines light, `dark` and `black` (`--color-canvas: #000000`,
  `--color-surface: #18181b`). In `dark` and `black`, ordinary borders match the light theme's perceptual
  weight.
- **Typography.** Instrument Sans for interface, headings, controls and learning content. IBM Plex Mono
  for IBANs, BICs, UETRs, account identifiers, raw messages, code and comparison amounts. Both currently
  load from Google Fonts (`frontend/index.html`). Monospace ligatures off; tabular numerals in aligned
  numeric columns.
- **Spacing and shape.** A 4px base scale: 4, 8, 12, 16, 24, 32, 48 and 64px. Controls use an 8px radius;
  bounded work regions use 10–12px; status chips use a full radius. Nested radii equal the outer radius
  minus the inset gap. Thin structural borders and no decorative shadows. Related items group tightly,
  and distinct sections are separated by a larger spacing step.
