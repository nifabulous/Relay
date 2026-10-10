# App route showpiece (Phase 2) — design

Status: approved by the user on 2026-10-10 (design sections). Written spec for review.
Parent: [Relay landing page and visual language](2026-10-01-relay-landing-and-visual-language-design.md), Phase 2.
Visual contract: [DESIGN.md](../../../DESIGN.md), "Route signature" and "Adoption status".

## Summary

Port the landing page's lines-based payment route into the app as one shared, presentational component. Show it on three screens: Prepare (in the result, after checks pass), Tracking (in place of the event timeline), and the Correspondent Atlas (over the map for the selected corridor). The three screens move to the landing tokens together, including their shared components, so no screen mixes the two token systems. The rest of `/app` keeps the old tokens until Phase 3.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Token mixing on the three screens | Migrate the three screens together | Appendix A forbids a screen that mixes systems |
| Component approach | One shared lines route, scoped tokens | One component to keep in step; no drift |
| Existing card `PaymentRoute` | Unchanged, stays on the bank detail page | Out of scope; a different page |
| Prepare placement | In the result, after checks pass | The route is shown only once checks confirm it |
| Tracking placement | Replaces the timeline; event text kept in the stepper and summary | No information lost |
| Atlas placement | Over the map for the selected corridor (URL `selected`) | Ties the route to the existing selection |

## Scope

In scope:
- `design-system/payment-route`: a new presentational `LinesRoute` and its CSS.
- A scoped landing token layer for those screens.
- Landing variants of the shared components the three screens use (`Button`, `StatusChip`, and the screen headers, cards and tables on those pages).
- Adapters that map each screen's data into route stops.
- Tests (see Testing).

Out of scope:
- Any other `/app` screen, and the Phase 3 migration of `tokens.css`.
- The bank detail page and its card `PaymentRoute`.
- Changes to the landing page.
- New data sources or API endpoints. Each screen uses data it already has.

## Component: `LinesRoute`

`design-system/payment-route/LinesRoute.tsx`. Pure presentation; it fetches nothing.

Props:
- `stops`: ordered list of `{ role: "origin" | "correspondent" | "beneficiary", name, detail?, status }`. Two to eight stops; the component renders any count in that range. `status` uses the existing `CheckStatus` vocabulary, rendered as text plus icon plus colour.
- `progress?`: 0 to 1. Drives how far the packet has travelled. Omitted means the route is drawn in full.
- `summary`: the screen-reader sentence, built by the existing `routeSummary` helper.

Rendering:
- Wide screens: the lines path with nodes at the stops, as on the landing page.
- Narrow screens: the vertical stepper in document order, with the same stop content.
- One semantic model, two compositions. The DOM order is the stepper order on both sizes.

Motion:
- Animates only when motion is allowed (`html.motion`, the same gate as the landing page).
- Without motion or JavaScript, shows the final state.
- Any animated route has a pause control (WCAG 2.2.2). Pausing holds the current state.

## Token scope

- The landing token set moves to `design-system/landing-scope.css` and is applied under a `.surface-landing` class, never on `:root`.
- The two names that clash with the app's tokens, `--font-mono` and `--muted`, exist only inside the scope.
- The three screens' root elements carry `.surface-landing`.
- Shared components the three screens use get landing variants under the same scope. Outside the scope, their existing styles are unchanged.
- `contrast.test.ts` gains the scoped pairs, so every text pair in the scope passes WCAG 2.2 AA in light, dark and black.

## Per-screen integration

Each screen gets an adapter (`prepareRoute.ts`, `trackingRoute.ts`, `atlasRoute.ts`) that maps the screen's data to `stops`. Adapters are pure functions with unit tests.

- **Prepare** (`features/operate/prepare/PreparePaymentPage.tsx`): the route renders in the result panel after checks pass. Stops come from the route evidence the page already loads for its "Review route" stage. Before checks pass, no route is shown.
- **Tracking** (`features/operate/tracking/TrackingPage.tsx`): the route replaces `PaymentTimeline` as the main view. `progress` follows the events already revealed. The event list stays as the mobile stepper's content and in the summary. The page keeps its existing reveal controls and never fabricates events.
- **Atlas** (`features/explore/AtlasPage.tsx`, `atlas/`): when a corridor is selected (`selected` in the URL), the route is drawn over the map from the origin through the correspondent to the beneficiary. Stops come from data the Atlas already holds. The table and filters are unchanged.

## Accessibility

- The stepper and the summary sentence carry the meaning on every screen, so the route is never the only carrier of information.
- Node status is text plus icon plus colour.
- Focus order follows the stepper.
- The mobile contract matches the landing page's `#route-steps` behaviour.

## Error and empty states

- No stops: the screen's existing empty state. No empty route is drawn.
- Two stops (the correspondent is unknown): the route is drawn with a short note.
- Stops with no status: shown as "not checked", never as passed.

## Testing

- Unit tests: each adapter (inputs, missing data, partial data) and `LinesRoute` (stepper order, summary text, status rendering).
- Contrast: the scoped text pairs in light, dark and black, through `contrast.test.ts`.
- Bundle: `check:bundle` stays within budget. The landing route code is not added to the `/app` eager shell.
- E2E: the three screens at 390px and 1440px. No horizontal overflow, route present with a summary, the final state with motion off, and the pause control on Tracking if it animates.
- Regression: existing Prepare, Tracking and Atlas tests pass with the new markup.

## Open items for the implementation plan

- Which exact existing components the three screens use, so the landing variants cover all of them.
- Confirm in the plan that each screen's data never exceeds eight stops, and what the adapter does above that.
