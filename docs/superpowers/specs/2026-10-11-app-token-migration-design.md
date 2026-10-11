# App token migration (Phase 3) — design

Status: draft for review, 2026-10-11.
Parent: [Relay landing page and visual language](2026-10-01-relay-landing-and-visual-language-design.md), Phase 3.
Visual contract: [DESIGN.md](../../../DESIGN.md), "Adoption status" and Appendix A.
Earlier phases: Phase 2 moved the route screens (Prepare, Tracking, Atlas) to the landing tokens under `.surface-landing`.

## Summary

Move the rest of `/app` to the landing tokens: Geist and Geist Mono, the DESIGN.md palette in light, dark and black, and the landing spacing and radius. Migrate one workspace at a time. Each workspace is scoped with `.surface-landing` and checked alone. The app shell (left rail, top bar, Preferences, bottom nav) stays on the old tokens until every workspace is migrated; then it moves in its own step. Last, `tokens.css` takes the new values, the scope class is removed, and DESIGN.md, Appendix A and `contrast.test.ts` change in the same commit.

## Decisions (from the review questions)

| Question | Decision |
|---|---|
| Rollout | Workspace by workspace, scoped with `.surface-landing`, as in Phase 2. |
| Shell | Stays on the old tokens until the last workspace is done. |
| Dark and black themes | Migrate with the rest, to the landing values (parent spec, Phase 3). |

## Scope

In scope:
- Font loading in `frontend/index.html`: add Geist and Geist Mono (Google Fonts, the only stylesheet host the CSP allows).
- Per-workspace scoping for six workspaces: `explore`, `learn`, `operate`, `overview`, `settings`, `tutor`.
- The shell migration (final step).
- `tokens.css` value migration and removal of the scope class (final step).
- Contrast tests, the palette validator, DESIGN.md adoption table, Appendix A retirement.

Out of scope:
- The landing page, the bank detail page's card `PaymentRoute`, and the legacy `/learn` and `/ui` surfaces (`app/static/`).
- New features, new data, or API changes.

## Defect to fix first

Phase 2 scoped the route to `.surface-landing`, and `landing-scope.css` names Geist. `frontend/index.html` loads only Instrument Sans and IBM Plex Mono, so on the live site the route falls back to system fonts. The first step loads Geist and Geist Mono in the app and confirms the route's font resolves.

## Mechanism

- `landing-scope.css` already defines the landing tokens and the app-token remap under `.surface-landing` (Phase 2). Each workspace root gets the class, and its lazy entry imports the scope stylesheet, the same pattern as the three route pages.
- Components inside a migrated workspace read the scoped values. Components shared with unmigrated workspaces keep their old look outside the scope (Phase 2 rule).
- The scope is removed only when `tokens.css` itself carries the landing values, so no workspace ever mixes the two systems.

## Order

Lowest risk first: `settings`, `tutor`, `overview`, `explore`, `learn`, `operate` (the three Phase 2 screens are already scoped; migrate the rest of `operate`). Each step is one PR, one workspace, with its own check. The order can change at review.

## Per-step checks

- Unit: the scoped contrast pairs for that workspace, in light, dark and black, through `contrast.test.ts`.
- Visual: a screenshot pass at 390px and 1440px for that workspace, light and dark.
- E2E: the workspace's existing specs, plus a no-overflow check at both widths.
- Bundle: `npm run check:bundle` stays within the 215,040-byte budget.

## Final step

1. Move `tokens.css` to the landing values and Geist.
2. Remove the `.surface-landing` class from workspace roots and from the route screens, and drop the scope stylesheet import.
3. Migrate the shell (rail, top bar, Preferences, bottom nav) to the new tokens.
4. Update `contrast.test.ts` for the app values, re-run the palette validator, update the DESIGN.md adoption table, and retire Appendix A, in one commit.

## Done when

- No `/app` surface reads the old `--color-*` values, the Instrument Sans or IBM Plex Mono fonts, or the old `#3157D5` action colour.
- Every workspace and the shell pass the contrast and E2E checks at 390px and 1440px in light, dark and black.
- The eager shell stays within budget.
- DESIGN.md's adoption table says the app is on the new system.

## Risks

- The shell touches every screen, so it moves last, after every workspace is verified.
- Fonts change text metrics. Each step's screenshot pass catches overflow and wrapping before the next workspace starts.
- Dark and black themes change for every workspace at the final step; that step gets its own review.
