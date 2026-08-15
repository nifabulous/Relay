# Relay Design System

Relay is a responsive educational payment simulation. Its interface is calm, precise, and explainable. It must support first-time learners and experienced payment practitioners without splitting them into separate products.

The product descriptor is **Educational payment simulation**. Recommendation and tracking results also display **Simulation — not a real payment**.

## Principles

1. One screen, one dominant action.
2. Dense information is grouped, not decorated.
3. The route is the visual signature.
4. Status is expressed with text, icon, and color.
5. Guidance appears at the moment of use and never blocks experienced users.
6. Desktop and mobile are equal product surfaces.
7. Every asynchronous region has stable loading, empty, error, success, and partial states.

## Visual foundations

### Color tokens

`frontend/src/design-system/tokens.css` is the authoritative source. The table below
lists the core tokens; `tokens.css` additionally defines hover/pressed/surface/border
variants and the `-bg`/`-border` companions for each semantic color. Change values
there, then mirror them here.

| Token | Value | Use |
|---|---|---|
| `--color-action` | `#3157D5` | Primary actions, selected navigation, links, progress |
| `--color-ink-strong` | `#16233D` | Strong emphasis and primary text |
| `--color-ink` | `#2D3A52` | Body text |
| `--color-canvas` | `#F6F8FC` | Application background |
| `--color-surface` | `#FFFFFF` | Navigation, panels, data regions |
| `--color-border` | `#DCE2EB` | Structural boundaries |
| `--color-border-strong` | `#C4CDD9` | Boundaries that must stay perceivable on canvas |
| `--color-ink-muted` | `#586273` | Secondary text |
| `--color-success` | `#0E5C44` | Passed and proceed states |
| `--color-warning` | `#9A5A0C` | Needs-attention and review states |
| `--color-danger` | `#9E2B34` | Failed, stop, and destructive states |

The four semantic values above are deliberately darker than the original palette
(`#68748A`, `#16825D`, `#C87B16`, `#C8424D`), which did not clear WCAG 2.2 AA against
their own `-bg` surfaces. `tokens.css` records the measured ratio for each. Do not
revert them to the lighter originals.

Use semantic colors only with an explicit label and icon.

**Contrast status, measured 2026-08-14.** All *text* pairings meet WCAG 2.2 AA, most with
room to spare. *Boundaries* do not: `--color-border` measures 1.23:1 and
`--color-border-strong` 1.51:1 against the canvas, against the 3:1 that WCAG 1.4.11 asks
for a border that identifies a control. This is a known, tracked gap, not an oversight —
raising borders to 3:1 would make them visibly heavier than the hairline this system is
built on. Do not restate this as blanket AA compliance. When dark mode lands, its borders
match this same perceptual weight so the two themes stay one product.

### Typography

- Instrument Sans: interface, headings, controls, and learning content.
- IBM Plex Mono: IBANs, BICs, UETRs, account identifiers, raw messages, code, and comparison amounts.
- Self-host and subset both families. Use `font-display: swap` and metric-compatible fallbacks.
- Disable monospace ligatures. Use tabular numerals in aligned numeric columns.
- Form controls remain at least 16px on mobile.
- Body copy uses a 45–75 character measure; 66 characters is the target.

### Spacing and shape

- Use a 4px base scale: 4, 8, 12, 16, 24, 32, 48, and 64px.
- Controls use an 8px radius. Bounded work regions use 10–12px. Status chips use a full radius.
- Nested radii equal the outer radius minus the inset gap.
- Use thin structural borders. Do not use decorative shadows.
- Group related items tightly and separate distinct sections with a larger spacing step.

## Application hierarchy

```text
Shell
├── Overview: adaptive primary action → current context → utility row → activity
├── Learn: current module → lesson or exercise → sequence and progress
├── Explore: search or categories → results or detail → related actions
└── Operate: active payment step → result → prior-step summaries → next action
```

Desktop uses a persistent left rail and top bar. Mobile uses a four-item bottom bar for Overview, Learn, Explore, and Operate. Search, recent activity, Help, and secondary actions live in a top sheet.

## Components

Feature code uses shared components for navigation, buttons, form controls, panels, status, tables, mobile record lists, timelines, steppers, route diagrams, alerts, skeletons, and empty states.

Cards are allowed only when the surface is independently selectable, movable, or meaningfully bounded. Layout grouping alone does not justify a card.

Every component defines:

- Default, hover, pressed, focus-visible, disabled, loading, error, and success behavior where applicable.
- Keyboard interaction and focus restoration.
- Accessible name and status announcement behavior.
- Desktop, tablet, and mobile behavior.
- Long-label, large-number, and localization overflow behavior.

## Route signature

The payment route is Relay’s primary visual signature. It uses a continuous directional path, institution nodes, explicit currency and amount, and stepped or moving payment state.

- Desktop may animate state changes using transform and opacity.
- Reduced-motion mode uses equivalent stepped states without travel animation.
- Mobile uses a vertical stepper in document order. Every institution remains visible; the active hop expands with amount, fee, timing, and status while completed and upcoming hops remain compact.
- Screen readers receive a concise origin, intermediary, beneficiary, currency, amount, and outcome summary.
- Reject and incomplete paths explain where movement stopped and why.

## Content

- Use operational labels: “Prepare payment,” “Retry routing,” “Edit beneficiary,” not “Continue” or “Submit.”
- Remove welcome copy, aspiration claims, and instructions that restate visible controls.
- Error messages state what happened, what remains safe, and what the user can do next.
- Empty states provide context and one relevant action.
- Use “…” for in-progress labels.

## Responsive and accessibility

- Acceptance viewports: 390×844, 768px wide, 1024px wide, and 1440×900.
- Primary touch targets are at least 44×44px.
- Do not disable browser zoom.
- Use safe-area insets for fixed mobile navigation.
- Tables become labeled record lists when columns cannot remain legible.
- Preserve visible labels when fields contain values.
- Provide complete keyboard operation, logical focus order, landmarks, headings, live regions, and focus trapping where appropriate.
- Respect `prefers-reduced-motion`; never use `transition: all`.
- Visited reference links have a distinguishable state.

## Anti-template constraints

- No dashboard mosaic of equal cards.
- No three-column promotional feature grid.
- No decorative icon circles, colored card edges, gradients, blobs, or ornamental illustrations.
- No generic hero copy or centered-everything composition.
- No emoji as interface icons.
- No uniform large radius on every surface.
- No chart when the payment route or a direct value comparison communicates the point better.

## Source specification

The product journeys, application architecture, state matrix, migration strategy, and testing gates live in [Relay UI Rebuild Design](docs/superpowers/specs/2026-07-17-relay-ui-rebuild-design.md).

## Floating surfaces

A floating surface sits above content the system does not control and cannot
predict. The hairline that separates an inline panel from a known canvas is not
enough here: `--color-border` measures 1.23:1 and `--color-border-strong`
1.51:1, which the Color section already records as a tracked gap, and over
arbitrary scrolling content that gap stops being cosmetic.

**A floating surface gets exactly one step of elevation, expressed as an effect
rather than a mechanism.** In light mode the step is a shadow. In dark mode the
step is a lighter surface, because a shadow works by being darker than its
backdrop and on the dark canvas (#080b12) the shadow colour is around five
times lighter — it reads as a smudge or as nothing. One rule, two correct
expressions. This is not a licence for decorative shadows: the rule in Visual
foundations still holds for every surface that is not floating.

**Specify what a floating surface obscures.** An open panel covers content, and
which content is a design decision rather than an accident of z-index:

| Viewport | The panel occupies | It must never cover |
| --- | --- | --- |
| `≥1024px` | a right column, page content reflows beside it | the primary navigation rail, the top bar, the simulation banner |
| `<1024px` | a bottom sheet above the fixed bottom navigation | the bottom navigation itself, the simulation banner |

The simulation banner is on both never-cover lists deliberately. It is the one
element on screen stating that none of this is real, and a panel that hides it
while answering questions about payments removes that statement at exactly the
moment it matters most.
