# Learn landing design QA

> The `artifacts/design-qa/*.png` captures referenced below are working
> evidence from the comparison runs and are deliberately not tracked (see
> `.gitignore`). This document records what they showed.

## Source and implementation

- Source visual truth: `artifacts/design-qa/learn-reference-image17.png` (copied from the attached Image #17 reference)
- Implementation screenshot: `artifacts/design-qa/learn-implementation-black-1067x1119.png`
- Combined comparison input: `artifacts/design-qa/learn-comparison.png`
- Route: `http://127.0.0.1:5173/app/learn`
- State: Learn landing page, active case in progress, one review due, 0 of 5 practice questions today, black/OLED theme, tutor launcher visible
- Source pixels: 1586 × 992; provided reference treated as 1× density
- Implementation pixels: 1067 × 1119; CSS viewport measured at 1067 × 1119; screenshot is 1× (pixel dimensions equal CSS viewport)
- Normalization: the source and implementation were placed into one comparison canvas at native capture pixels. The viewport widths differ because the Codex in-app browser panel is 1067px wide; content-region hierarchy was compared rather than treating the browser chrome or differing crop as a product mismatch.

## Comparison evidence

### Full view

The implementation preserves the reference hierarchy: Learn heading, dominant active case desk, daily-practice pulse, three route shortcuts, and a dense technical-labs status table. The existing Relay shell, simulation banner, black/OLED theme, and tutor launcher remain intentional product chrome outside the reference frame.

### Focused regions

- Active case desk: progress metadata (`Step 2 of 5`, status, progress bar) is visible before the primary Resume action. The reference's time estimate was dropped in review — no case in `caseCatalog.ts` carries a duration, so the figure could only be a literal repeated on every case.
- Daily practice: streak, review count, and today’s completion are grouped as a compact pulse with a single Start drill action.
- Technical labs: module title/subtitle, duration/prerequisite context, and Completed/Next module/Locked states are represented in a scan-friendly table row.
- Route shortcuts: Cases, Technical labs, and Practice retain named, keyboard-reachable links; the Technical labs shortcut scrolls to `#technical-labs`.

## Required fidelity surfaces

- Fonts and typography: existing Relay token family, hierarchy, weights, and line-height are reused; display headings and compact status text remain distinct and readable.
- Spacing and layout rhythm: two-column launchpad at the live width, bounded card surfaces, consistent token gaps, and no horizontal overflow (`scrollWidth === innerWidth === 1067`).
- Colors and visual tokens: all new styling uses Relay semantic tokens, including action, warning, success, surface, and border states. Black/OLED is the active user-selected theme; the source’s navy palette is represented by the same semantic roles.
- Image quality and asset fidelity: the target uses interface icons rather than product imagery; the implementation uses the existing COSS `Icon` system, with no placeholder imagery or CSS-drawn substitutes.
- Copy and content: case and lab copy remains data-driven. Singular review copy is grammatically correct (`1 review due`; plural values use `reviews due`).
- Icons and controls: route, book, check, flame, repeat, clock, and chevron affordances are present and aligned with the existing icon family.
- States and interactions: active/resume state, locked lab state, practice CTA, route anchors, and secondary case links are rendered; the Technical labs anchor was exercised and landed at the section heading.
- Accessibility: semantic regions and list roles, accessible names, progressbar values on the phase scale the learner sees, keyboard-reachable links, and hidden decorative icon labels are present. The labs grid renders as a list: review removed ARIA table roles whose ownership chain the markup could not satisfy (rows inside a plain `<ol>`, two column headers over four row children).

## Findings

No actionable P0, P1, or P2 findings remain.

P3 follow-up polish: a 1586px desktop capture would allow a closer typography and line-wrap comparison to the reference; the in-app browser panel used for this QA is 1067px wide. This does not affect the responsive structure or current interaction behavior.

## Comparison history

1. Initial implementation comparison: found the live singular label `1 reviews due` (copy/content P2-level polish issue).
2. Fix: changed the practice label to choose `review due` for one item and `reviews due` otherwise in `LearnCaseLaunchpad.tsx`.
3. Post-fix evidence: refreshed live screenshot, re-ran focused Learn tests and build, confirmed `review due` in the browser, and regenerated the combined comparison capture.

## Overview launchpad design QA

### Source and implementation

- Source visual truth: `artifacts/design-qa/overview-reference-image24.png` (Workspace Launchpad reference)
- Implementation screenshot: `artifacts/design-qa/overview-implementation-black-572x1119.png`
- Combined comparison input: `artifacts/design-qa/overview-comparison.png`
- Route: `http://127.0.0.1:5173/app/`
- State: Overview launchpad, current task with Needs attention status, four-item plan, three workspace columns, recent routes, system status, black/OLED theme, tutor launcher visible
- Source pixels: 1586 × 992; provided reference treated as 1× density
- Implementation pixels: 572 × 1119; CSS viewport measured at 572 × 1119 after the in-app panel resized; screenshot is 1×
- Normalization: the source and implementation were placed side by side at native capture pixels. The source is a wide desktop reference while the live panel is a narrow responsive capture; hierarchy, order, status treatment, and responsive stacking were compared rather than treating shell chrome or the theme as product mismatches.

### Comparison evidence

The redesigned page follows the reference’s operational reading order: task requiring attention and its action row first, Today’s plan beside it on wide screens, Learn/Explore/Operate launch destinations next, and Recent routes/System status last. At the narrow live width the focus and summary bands stack, while the workspace columns collapse to one column without clipping.

### Required fidelity surfaces

- Typography and spacing use Relay tokens with a large Overview heading, compact eyebrow/status labels, bounded cards, and consistent section gaps.
- Color and elevation use semantic action, warning, success, surface, and border tokens; no new hardcoded palette, gradients, or shadows were introduced.
- Icons use the existing COSS registry and remain decorative where adjacent text carries meaning.
- The adaptive action selection, learner progress/pulse contract, activity copy, and health query remain covered behind the visible launchpad so existing state behavior is not lost.
- Visible links are routed to existing Learn, Explore, Operate, and Settings destinations; the current task uses the available simulated case desk route.
- Browser checks confirmed `scrollWidth === innerWidth === 572` on the responsive capture and no runtime errors in the dev console.

### Findings

**Superseded by the 2026-09-06 code review.** The visual comparison above was
run against a first implementation whose current-task card, Today's plan,
Recent routes, and System status panels were hardcoded literals — an invented
incident ("approval rate dropped 12.4%"), four invented routes, and five
service rows that reported "All services normal" even when the `/api/health`
probe had failed. The adaptive action, learning pulse, and activity feed were
present only as visually-hidden copies, so the page a sighted learner saw and
the page assistive technology read were different pages.

Pixel comparison against the reference could not surface that: the reference
image and the implementation agreed precisely because both showed invented
operational data.

The launchpad composition was kept and every panel rebuilt on data Relay
holds — the `selectPrimaryAction` decision table, local learner state, and
`/api/health` — with the workspace tiles relabelled to name the routes they
actually open. `OverviewPage.test.tsx` now carries a regression test that
fails if the page states an operational fact it cannot source. The
implementation screenshot in `artifacts/design-qa/` predates that rebuild.

P3 follow-up polish: a wide 1586px browser capture would allow a closer line-wrap comparison to the desktop reference; the Codex in-app browser panel was 572px wide during the final capture. The responsive stack itself is intentional and verified.

## Verification

Re-run after the 2026-09-06 rebuild:

- Full frontend suite: 98 files, 1,417 tests passed.
- Playwright `desktop` project across overview, learner-state, design-system,
  learn, learn-content, case-desk, prepare, and tutor: 62 passed, 3 skipped
  (the intentional reduced-motion and mobile-tutor skips).
- TypeScript, production build, bundle budget (24.1KB under), and the Base UI
  boundary check: passed.
- Browser: no console errors, `scrollWidth === innerWidth` at 1280px and 375px,
  live inventory rendering 283 banks / 79 corridor rules / 1,209 SSI records.

Original pass (pre-rebuild):

- Full frontend suite: 98 files, 1,416 tests passed.
- Focused Learn suite after final copy fix: 2 files, 10 tests passed.
- Focused Overview suite: 19 tests passed.
- TypeScript and Vite production build: passed.
- Bundle budget check: passed (24.2KB under budget after moving Overview to its route-level chunk).
- Scoped Learn diff check: passed.
- Browser logs: no runtime errors; only Vite connection/debug and React DevTools informational messages.

final result: passed
