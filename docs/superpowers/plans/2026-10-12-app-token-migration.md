# App token migration (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `/app` shell, the Tutor surface and every workspace to the landing tokens, then swap `tokens.css` to the landing values.

**Architecture:** `design-system/landing-scope.css` already defines the landing tokens and the app-token remap under `.surface-landing` (Phase 2). The shell's chrome elements, the Tutor surface and each workspace root carry that class in turn. The content outlet never carries it until the final step. Theme follows `data-theme` on the document root through the scope's root-level selectors.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + jsdom, Playwright, the existing `design-system/` CSS.

## Global Constraints

- One PR per step: font fix, shell, Tutor (with shell), each workspace, final swap.
- No `.surface-landing` on the `<main>` / `Outlet` wrapper before the final step (spec: Mechanism).
- Scope CSS is imported only from lazy modules or from the shell module; the eager shell stays within `check:bundle` (215,040 bytes gzip).
- Contrast pairs for each step pass WCAG 2.2 AA (4.5:1) in light, dark and black, through `contrast.test.ts`.
- Each step checks 390px and 1440px for no horizontal overflow.
- Do not change the landing page, the card `PaymentRoute`, or `app/static/`.

## Interfaces

- `landing-scope.css` (exists): class `.surface-landing`; token block; remap block; root-level `:root[data-theme]` selectors.
- `AppShell.tsx` (exists): renders `.sim-banner`, `.app-shell__topbar`, `.app-shell__rail`, `.app-shell__mobile-nav`, `<main class="app-shell__main">` with `<Outlet>`.
- `PreferencesMenu.tsx` (exists): renders through `RelayPopover` (`design-system/behavior/RelayPopover`); the popover content is outside the shell tree and needs its own scope root.
- `FloatingTutorLauncher.tsx`, `TutorPanel.tsx` (exist, `features/tutor/`).

---

### Task 1: Load Geist in the app

**Files:**
- Modify: `frontend/index.html` (line 58, the font stylesheet)
- Modify: `frontend/src/design-system/tailwindFoundation.test.ts` (the test that pins the font link, line ~69)
- Test: the same test file

- [ ] **Step 1: Write the failing test**

In `frontend/src/design-system/tailwindFoundation.test.ts`, next to the existing font-link assertion, add:

```ts
it("loads Geist and Geist Mono for the scoped landing tokens", () => {
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
  expect(html).toContain("family=Geist:wght@400;500;600;700");
  expect(html).toContain("family=Geist+Mono:wght@400;500;600");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/design-system/tailwindFoundation.test.ts`
Expected: FAIL on the new assertion.

- [ ] **Step 3: Add the stylesheet**

In `frontend/index.html`, keep the existing Instrument Sans and IBM Plex Mono link (the old tokens still use them) and add a second link directly after it:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" />
```

- [ ] **Step 4: Run the test and the design-system suite**

Run: `cd frontend && npx vitest run src/design-system`
Expected: PASS.

- [ ] **Step 5: Verify the route font on a build**

Run: `cd frontend && npm run build && npm run check:bundle`
Expected: build succeeds; bundle check PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/src/design-system/tailwindFoundation.test.ts
git commit -m "fix(app): load Geist for the scoped landing tokens (phase 3)" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scope the shell chrome and the Preferences popover

**Files:**
- Modify: `frontend/src/app-shell/AppShell.tsx` (add `surface-landing` to the chrome elements only)
- Modify: `frontend/src/app-shell/PreferencesMenu.tsx` (scope the popover content root)
- Test: `frontend/src/app-shell/AppShell.test.tsx`

- [ ] **Step 1: Write the failing test**

In `AppShell.test.tsx`, add a test that renders the shell and asserts:
- `.sim-banner`, `.app-shell__topbar`, `.app-shell__rail` and `.app-shell__mobile-nav` each have class `surface-landing`;
- `.app-shell__main` does not have class `surface-landing`, and neither does any ancestor of it other than the chrome elements.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/app-shell/AppShell.test.tsx`
Expected: FAIL: the chrome elements lack the class.

- [ ] **Step 3: Add the class to the chrome elements**

In `AppShell.tsx` add `surface-landing` to the className of the `sim-banner` div, the `app-shell__topbar` header, the `app-shell__rail` nav and the `app-shell__mobile-nav` nav. Do not touch `app-shell__main`.

- [ ] **Step 4: Scope the Preferences popover**

Open `PreferencesMenu.tsx`. Find the element `RelayPopover` renders for its content (it is outside the shell tree). Add `surface-landing` to that content element's className. If `RelayPopover` takes no className prop, add a wrapper `<div className="surface-landing">` around its content inside the component. Add a test that the popover content has the class when open.

- [ ] **Step 5: Import the scope stylesheet from the shell**

In `AppShell.tsx`, add `import "../design-system/landing-scope.css";` at the top. The shell module is eager, so this adds the scope CSS to the eager shell; confirm the size stays in budget in Step 7.

- [ ] **Step 6: Run the shell tests and the design-system suite**

Run: `cd frontend && npx vitest run src/app-shell src/design-system`
Expected: PASS.

- [ ] **Step 7: Check the bundle and the landing boundary**

Run: `cd frontend && npm run build && npm run check:bundle && npm run check:landing-boundary`
Expected: PASS. If the eager shell exceeds 215,040 bytes, stop and report the size before continuing.

- [ ] **Step 8: Visual check at 390px and 1440px**

Run the dev server or use the production preview. Check: rail, top bar, bottom nav and the simulation banner show landing colours in light and dark; the workspace content below (for example `/app/settings`) is unchanged; no horizontal overflow at either width. Record screenshots in the step report.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app-shell/AppShell.tsx frontend/src/app-shell/PreferencesMenu.tsx frontend/src/app-shell/AppShell.test.tsx frontend/src/app-shell/PreferencesMenu.test.tsx
git commit -m "feat(app): scope the shell chrome to the landing tokens (phase 3)" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tutor with the shell

**Files:**
- Modify: `frontend/src/features/tutor/FloatingTutorLauncher.tsx`
- Modify: `frontend/src/features/tutor/TutorPanel.tsx`
- Test: `FloatingTutorLauncher.test.tsx`, `TutorPanel.test.tsx`

- [ ] **Step 1: Write the failing tests** — the launcher button and the open panel root each have class `surface-landing`.
- [ ] **Step 2: Run them and watch them fail** — `cd frontend && npx vitest run src/features/tutor`.
- [ ] **Step 3: Add the class** to the launcher's root element and to the panel's root element. If the panel renders through a portal, add the class to its portal root element.
- [ ] **Step 4: Run the tutor tests and the design-system suite** — expected PASS.
- [ ] **Step 5: Check the tutor at 390px and 1440px**, closed and open, light and dark. Confirm the chat stays readable and nothing overflows. Note the tutor's own colour and status states in the report.
- [ ] **Step 6: Commit** — `feat(app): scope the Tutor surface to the landing tokens (phase 3)`.

---

### Task 4: Workspace steps (one PR each, in this order)

Order: `settings`, `overview`, `explore`, `learn`, `operate`. Each step follows the same template. Do not start a workspace until Tasks 1–3 are merged.

For each workspace `W` (the route list is in the spec):

- [ ] **Step 1: Find the workspace's page roots.** The lazy page modules listed for `W` in `frontend/src/app-shell/App.tsx`. Each page's root element is the first element it returns.
- [ ] **Step 2: Write the failing test.** Each page root for `W` has class `surface-landing` and imports `landing-scope.css` through its lazy module. The test for `W` fails until the class is added.
- [ ] **Step 3: Run it and watch it fail.**
- [ ] **Step 4: Add `surface-landing` to each page root and import the scope stylesheet in each page module.** Do not add the class to the shared outlet or to `<main>`.
- [ ] **Step 5: Run the workspace tests and `src/design-system`.** Expected PASS.
- [ ] **Step 6: Check `W` at 390px and 1440px**, light, dark and black, against the previous state. Check for overflow, wrapping and contrast. Record screenshots in the step report.
- [ ] **Step 7: Check the bundle and commit** — `npm run check:bundle`, then `feat(<W>): scope the <W> workspace to the landing tokens (phase 3)`.

`operate` specifically: Prepare, Tracking and Atlas already carry `surface-landing` from Phase 2. Remove only a duplicate class where it nests inside a root that already has it, and check those three screens again.

---

### Task 5: Final swap

**Files:**
- Modify: `frontend/src/design-system/tokens.css` (values to the landing set)
- Modify: `frontend/src/design-system/landing-scope.css` (remove the scope stylesheet's app remap, now unused)
- Modify: `frontend/index.html` (remove the Instrument Sans and IBM Plex Mono link)
- Modify: `frontend/src/design-system/contrast.test.ts`
- Modify: `DESIGN.md` (adoption table; retire Appendix A)
- Modify: every page root, the shell and the Tutor to remove `surface-landing` and the scope imports

- [ ] **Step 1: Write the failing contrast test** for the app values in light, dark and black.
- [ ] **Step 2: Move `tokens.css` to the landing values and Geist**, keeping variable names the components read.
- [ ] **Step 3: Remove the scope class and the scope imports**, then run the full frontend suite.
- [ ] **Step 4: Update DESIGN.md** (adoption table: the app is on the new system; Appendix A is retired) and `contrast.test.ts`, in the same commit as Step 2.
- [ ] **Step 5: Full verification:** `npx tsc --noEmit`, `npx vitest run --no-file-parallelism`, `npm run build`, `npm run check:bundle`, `npm run check:landing-boundary`, and the E2E specs at 390px and 1440px.
- [ ] **Step 6: Commit** — `feat(app): move tokens.css to the landing values (phase 3)`.

## Done when

- No `/app` surface reads the old `--color-*` values, the Instrument Sans or IBM Plex Mono fonts, or `#3157D5`.
- Shell, Tutor and every workspace pass the contrast and E2E checks at 390px and 1440px in light, dark and black.
- The eager shell stays within budget; DESIGN.md's adoption table says the app is on the new system.
