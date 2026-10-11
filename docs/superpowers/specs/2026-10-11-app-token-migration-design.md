# App token migration (Phase 3) — design

Status: revised after review, 2026-10-12. Awaiting approval.
Parent: [Relay landing page and visual language](2026-10-01-relay-landing-and-visual-language-design.md), Phase 3.
Visual contract: [DESIGN.md](../../../DESIGN.md), "Adoption status" and Appendix A.
Earlier phases: Phase 2 moved the route screens (Prepare, Tracking, Atlas) to the landing tokens under `.surface-landing`.

## Summary

Move the rest of `/app` to the landing tokens: Geist and Geist Mono, the DESIGN.md palette in light, dark and black, and the landing spacing and radius.

Order:
1. **Shell first.** The app shell (left rail, top bar, Preferences, bottom nav) and the Tutor launcher and panel move to the landing tokens. The shell is scoped with `.surface-landing` on its chrome elements only, never on the content outlet.
2. **Workspaces one at a time.** Each workspace is scoped and checked alone.
3. **Final step.** `tokens.css` takes the landing values, the scope class is removed, and DESIGN.md, Appendix A and `contrast.test.ts` change in one commit.

Until step 2 finishes, a migrated shell wraps unmigrated workspaces. That is a deliberate, temporary exception to Appendix A's rule that one screen never mixes systems. It ends when the last workspace migrates.

## Decisions

| Question | Decision |
|---|---|
| Rollout | Shell first, then workspaces one at a time, scoped with `.surface-landing`. |
| Shell and mixing | Shell migrates first. The mixed screens during step 2 are an accepted exception, named here so it cannot be read as an oversight. |
| Tutor | Migrates with the shell. It is a floating surface (DESIGN.md "Floating surfaces"), not a workspace route. |
| Dark and black themes | Each step migrates its own scope's dark and black through the scope's root-level theme selectors. The final step only swaps `tokens.css`. |

## Scope

In scope:
- Font loading in `frontend/index.html`: add Geist and Geist Mono from Google Fonts. The app already loads its current fonts from Google Fonts, so this adds no new host.
- Shell step: `AppShell.tsx` chrome (rail, top bar, Preferences, bottom nav), `PreferencesMenu.tsx`, `PageLoader.tsx`, `AppErrorBoundary.tsx`, `NotFoundPage.tsx`, and the Tutor launcher and panel in `features/tutor/`.
- Workspace steps for six route trees, listed below.
- Final step: `tokens.css` values, scope class removal, contrast tests, DESIGN.md adoption table, Appendix A retirement.

Workspace route trees, from `frontend/src/app-shell/App.tsx`:

| Workspace | Routes |
|---|---|
| overview | `/app` (index) |
| learn | `learn`, `learn/cases/:caseId`, `learn/practice`, `learn/:moduleId` |
| explore | `explore`, `explore/atlas`, `explore/ssi-quality`, `explore/banks`, `explore/banks/:bic`, `explore/schemes`, `explore/glossary` |
| operate | `operate`, `operate/prepare`, `operate/tools`, `operate/fees`, `operate/screening`, `operate/value-date`, `operate/stp`, `operate/tracking` |
| settings | `settings` |

Operate's three route screens (Prepare, Tracking, Atlas, the latter under explore) already carry `.surface-landing` from Phase 2. Their step only removes the duplicate wrapper where it sits inside a shell-scoped root, and checks them.

Out of scope:
- The landing page, the bank detail card `PaymentRoute`, and the legacy `/learn` and `/ui` surfaces (`app/static/`).
- New features, new data, or API changes.

## Mechanism

- **Shell scope on chrome only.** `.surface-landing` goes on the shell's chrome elements, not on the `<Outlet>` content wrapper. The scope CSS remaps app tokens to landing tokens inside the scope, so scoping the whole shell would silently migrate every workspace at once and defeat the rollout.
- **Workspace scope per route tree.** Each workspace's page roots carry `.surface-landing` and import the scope stylesheet, the same lazy pattern as Phase 2's route pages.
- **Shared components.** A component used by both migrated and unmigrated code keeps its old look outside the scope (Phase 2 rule).
- **Theme.** Root-level selectors in `landing-scope.css` follow `data-theme` on the document root, so each scope's dark and black follow the app setting without per-element rules.

## Defect to fix first

Phase 2 scoped the route to `.surface-landing`, and `landing-scope.css` names Geist. `frontend/index.html` loads only Instrument Sans and IBM Plex Mono, so on the live site the route falls back to system fonts. The first step loads Geist and Geist Mono and confirms the route's font resolves.

## Per-step checks

- Unit: the scoped contrast pairs for that step, in light, dark and black, through `contrast.test.ts`.
- Visual: a screenshot pass at 390px and 1440px for that step, light and dark.
- E2E: that step's existing specs, plus a no-overflow check at both widths.
- Bundle: `npm run check:bundle` stays within the 215,040-byte budget. Scope CSS for workspaces ships in lazy chunks, not the eager shell.

## Final step

1. Move `tokens.css` to the landing values and Geist.
2. Remove `.surface-landing` from the shell, workspace roots and route screens, and drop the scope stylesheet imports.
3. Update `contrast.test.ts` for the app values, update the DESIGN.md adoption table, and retire Appendix A, in one commit.

The palette validator named in the parent spec is not in this repository. This spec does not depend on it; the contrast tests are the check. If the validator lives elsewhere, it is added to this step once identified.

## Done when

- No `/app` surface reads the old `--color-*` values, the Instrument Sans or IBM Plex Mono fonts, or the old `#3157D5` action colour.
- The shell, Tutor and every workspace pass the contrast and E2E checks at 390px and 1440px in light, dark and black.
- The eager shell stays within budget.
- DESIGN.md's adoption table says the app is on the new system.

## Risks

- The shell touches every screen. Its step is checked on every workspace route before the first workspace step starts.
- The mixed-system exception is visible during step 2. Each workspace step removes it for that workspace.
- Fonts change text metrics. Each step's screenshot pass catches overflow and wrapping before the next step starts.
