# Coss Foundation Slice 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #41 with real PreferencesMenu integration and browser coverage, then establish a Tailwind v4/Coss source foundation that is opt-in, Relay-token-driven, and safe for the existing application shell.

**Architecture:** Keep `RelayPopover` as the behavior boundary for menus and dialogs. Add Coss as a shadcn-compatible source/registry and styling foundation, not as an opaque runtime dependency. Tailwind utilities are available from the existing design-system stylesheet, while Relay’s base CSS, fonts, theme switching, and semantic tokens remain authoritative. This implementation PR is intentionally limited to Slice 0 and Slice 1; visual component migration is a later PR.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Playwright, Tailwind CSS v4, `@tailwindcss/vite`, pinned shadcn CLI, shadcn-compatible Coss registry configuration, existing Relay design tokens.

## Global Constraints

- Work from the clean UI worktree at `/Users/olaniyi.oladokun/Leatherback/swift-routing-ui`.
- Preserve the existing `RelayPopover` API and all `PreferencesMenu` user-facing behavior.
- Do not add Coss Menu, Dialog, Popover, or other behavior primitives in this slice. New interaction behavior must continue to flow through `RelayPopover` and existing Relay wrappers.
- Do not import Tailwind Preflight. Import only Tailwind’s theme and utilities layers. Keep utility scanning opt-in for this foundation slice with `source(none)` plus an explicit `@source "./coss"`; general `frontend/src` utility scanning begins when a real Relay-owned Coss consumer is introduced.
- Preserve Instrument Sans and IBM Plex Mono. Do not import Inter, Geist, Cal Sans, or any Coss default font.
- Preserve `data-theme` plus system-preference theme behavior. Do not introduce an unmapped `.dark` selector or raw `dark:` utilities.
- Do not rename existing Relay variables, replace the token system, or introduce default Coss shadows/gradients/motion.
- Do not generate unused Coss components. The first source component migration belongs to Slice 2.
- Keep `frontend/src/design-system/global.css` as the single global style entry point.
- Keep direct Base UI imports behind the existing behavior boundary check. Slice 1 should add no new direct Base UI imports.
- Keep the new Playwright specs as local/pre-merge verification in this PR. The existing CI workflow is intentionally unchanged; the PR description must include the exact browser commands and their results.
- Each task ends with a focused verification command and a small commit. Do not combine unrelated cleanup with these changes.

## Repository Map

Relevant existing files:

- `frontend/src/app-shell/PreferencesMenu.tsx` — migrated menu using `RelayPopover`.
- `frontend/src/app-shell/PreferencesMenu.test.tsx` — existing jsdom coverage for the real Preferences menu; extend it with the missing integration contract instead of creating a duplicate generic harness.
- `frontend/src/design-system/behavior/RelayPopover.tsx` — Relay-owned interaction boundary.
- `frontend/src/design-system/global.css` — global CSS entry point, reset, typography, focus, and Relay base rules.
- `frontend/src/design-system/tokens.css` — light/dark Relay semantic tokens.
- `frontend/src/design-system/contrast.test.ts` — existing token/contrast checks.
- `frontend/src/design-system/theme.ts` — stamps and removes `data-theme`.
- `frontend/src/vite.config.ts` — existing Vite plugin list.
- `frontend/tsconfig.json` — TypeScript compiler configuration.
- `frontend/playwright.config.ts` — existing projects, including `case-mobile-390` at 390×844.
- `frontend/e2e/` — existing Playwright specs.
- `frontend/package.json` and `frontend/package-lock.json` — npm scripts and lockfile.

Files to add or modify in this plan:

- Modify `frontend/src/app-shell/PreferencesMenu.test.tsx`.
- Add `frontend/e2e/preferences-menu.spec.ts`.
- Add `frontend/components.json`.
- Modify `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.ts`, and `frontend/tsconfig.json`.
- Add `frontend/src/design-system/coss-theme.css`.
- Modify `frontend/src/design-system/global.css` and `frontend/src/design-system/tokens.css`.
- Modify `frontend/src/design-system/contrast.test.ts`.
- Add `frontend/src/design-system/tailwindFoundation.test.ts`.
- Add `frontend/e2e/design-system-foundation.spec.ts`.

## What Already Exists

- `RelayPopover` already owns portal mounting, positioning, Escape/outside dismissal, and final-focus restoration; the plan tests that wrapper through the real PreferencesMenu instead of creating a second interaction layer.
- `PreferencesMenu.test.tsx` already covers first-item focus, arrow navigation, Escape restoration, outside dismissal, checked states, the reduced-motion switch, and the Settings link; Slice 0 adds only the missing final-popup contract assertions.
- `frontend/playwright.config.ts` already supplies the backend-backed web server and the `desktop`/`case-mobile-390` viewport projects; the plan reuses those projects and adds the required production build prerequisite.
- `global.css`, `tokens.css`, `theme.ts`, `check:base-ui-boundary`, and `check:bundle` already own the CSS entry point, theme state, behavior boundary, and bundle budget; Slice 1 adapts them rather than introducing parallel infrastructure.
- Existing CI runs build, Vitest, bundle, and Base UI boundary checks. Per the approved review decision, the new browser checks remain local/pre-merge evidence in this PR and are documented explicitly rather than adding a CI job.

## Execution and Test Flow

```text
Preferences trigger
        |
        v
RelayPopover.Root -- open --> Portal -> Positioner -> Popup[role=menu]
        |                                      |
        |                                      +--> onOpenChangeComplete -> focus first real item
        |                                      +--> ArrowUp/Down -> moveFocus(real menu items)
        |                                      +--> real radio/checkbox/link controls
        |
        +--> Escape/outside -> close -> finalFocus -> Preferences trigger

global.css
    |
    +--> Tailwind theme layer
    +--> Relay tokens + Coss aliases + explicit data-theme dark variant
    +--> Tailwind utilities scanning the opt-in Coss source directory
    +--> Relay reset/typography/focus rules after utilities
    |
    v
eager CSS bundle -> check:bundle -> local browser cascade checks
```

The unit tests cover the popup semantics and control state. Playwright covers the real portal, browser focus/dismissal behavior, 390px geometry, and the global cascade. The build and bundle checks cover the generated CSS/JS artifact path.

---

## Task 1: Add the real PreferencesMenu integration contract

**Files:**

- Modify `frontend/src/app-shell/PreferencesMenu.test.tsx`

The existing tests already exercise several menu behaviors. Add one explicit integration-contract test that ties those assertions to the final `PreferencesMenu` render and the actual `RelayPopover` portal. This creates the coverage delta requested in issue #41 without duplicating the existing generic wrapper tests.

- [ ] Add a test beside the existing PreferencesMenu keyboard/dismissal coverage with this shape:

  ```tsx
  it("exposes the RelayPopover menu contract around the real Preferences content", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /preferences/i }));

    const trigger = screen.getByRole("button", { name: /preferences/i });
    const menu = screen.getByRole("menu", { name: /preferences/i });

    expect(menu).toHaveAttribute("id", "app-shell-preferences-menu");
    expect(menu).toHaveAttribute("aria-labelledby", trigger.id);
    expect(menu.parentElement).toHaveClass("app-shell__prefs-positioner");
    expect(menu).toContainElement(
      screen.getByRole("menuitemradio", { name: /system/i }),
    );
    expect(menu).toContainElement(
      screen.getByRole("menuitemcheckbox", { name: /reduce motion/i }),
    );
    expect(menu).toContainElement(
      screen.getByRole("menuitem", { name: /all settings/i }),
    );
  });
  ```

  Use the file’s existing `renderMenu` helper and imports. Do not introduce a second test harness or mock `RelayPopover`.

- [ ] Keep the existing real-menu tests for first-item focus, `ArrowDown`/`ArrowUp` movement, Escape restoration, and outside dismissal. They already cover those behavior paths; the new contract test above supplies the missing final-popup semantics, actual controls, and positioner assertions without duplicating them.

- [ ] Run the focused suite from `frontend`:

  ```bash
  npm test -- --run src/app-shell/PreferencesMenu.test.tsx
  ```

  Expected result: the PreferencesMenu suite passes, including the new contract test. Because the runtime migration already exists, a green result is expected for this coverage-only task; no production behavior change should be required.

- [ ] Run the test once with the existing focused test name filter to verify the new test is discoverable:

  ```bash
  npm test -- --run src/app-shell/PreferencesMenu.test.tsx -t "RelayPopover menu contract"
  ```

  Expected result: one matching test passes.

- [ ] Commit only the integration-test change:

  ```bash
  git add frontend/src/app-shell/PreferencesMenu.test.tsx
  git commit -m "test(ui): cover real preferences menu contract"
  ```

---

## Task 2: Add browser-level PreferencesMenu behavior and 390px geometry coverage

**Files:**

- Add `frontend/e2e/preferences-menu.spec.ts`

Use the existing Playwright configuration and the existing `/app` route. The spec must exercise the real application shell, not a unit-test fixture.

- [ ] Add a desktop/browser behavior test with this structure:

  ```ts
  import { expect, test } from "@playwright/test";

  test.describe("Preferences menu", () => {
    test("exposes the real menu semantics and restores focus", async ({ page }) => {
      await page.goto("/app");

      const trigger = page.getByRole("button", { name: /preferences/i });
      await trigger.click();

      const menu = page.getByRole("menu", { name: /preferences/i });
      const system = page.getByRole("menuitemradio", { name: /system/i });
      const light = page.getByRole("menuitemradio", { name: "Light" });

      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute("id", "app-shell-preferences-menu");
      await expect(system).toBeFocused();

      await page.keyboard.press("ArrowDown");
      await expect(light).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(system).toBeFocused();

      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  });
  ```

  Use the exact accessible names exposed by the app if the current copy differs; do not weaken the test to arbitrary text or CSS selectors.

- [ ] Add an outside-dismissal assertion to the browser suite. Re-open the menu, click the real `Overview` link in the primary navigation, and assert that the menu is hidden and the page remains on `/app`:

  ```ts
  await page.getByRole("button", { name: /preferences/i }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("menu", { name: /preferences/i })).toBeHidden();
  await expect(page).toHaveURL(/\/app\/?$/);
  ```

  Do not click the portal positioner or `document.body` as a substitute for a real outside target.

- [ ] Add the mobile geometry test. It must run only under the existing `case-mobile-390` project so the viewport contract is explicit:

  ```ts
  test("keeps the portalled menu inside the 390px viewport", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "case-mobile-390",
      "This geometry contract is owned by the 390px Playwright project",
    );

    await page.goto("/app");
    await page.getByRole("button", { name: /preferences/i }).click();

    const menu = page.getByRole("menu", { name: /preferences/i });
    await expect(menu).toBeVisible();

    const box = await menu.boundingBox();
    const viewport = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(box).not.toBeNull();
    expect(box!.right).toBeLessThanOrEqual(viewport.innerWidth);
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
  });
  ```

- [ ] Run the behavior test against the existing app server configuration:

  ```bash
  npm run build
  npm run test:e2e -- e2e/preferences-menu.spec.ts --project=desktop
  ```

  The build is required because the existing Playwright `webServer` targets FastAPI on port 8000, which serves the production bundle from `app/static/relay`; it does not target the Vite dev server. Expected result: the real menu opens, receives initial focus, supports arrow navigation, dismisses on Escape/outside interaction, and restores trigger focus.

- [ ] Run the mobile geometry test using the project already defined in `frontend/playwright.config.ts`:

  ```bash
  npm run test:e2e -- e2e/preferences-menu.spec.ts --project=case-mobile-390
  ```

  Expected result: the menu remains within the 390px viewport and does not increase document width.

- [ ] Commit the browser coverage separately:

  ```bash
  git add frontend/e2e/preferences-menu.spec.ts
  git commit -m "test(ui): cover preferences menu in browser"
  ```

---

## Task 3: Install Tailwind v4 and register the Coss source foundation

**Files:**

- Modify `frontend/package.json` and `frontend/package-lock.json`.
- Modify `frontend/vite.config.ts`.
- Modify `frontend/tsconfig.json`.
- Add `frontend/components.json`.

This task establishes the source/registry path without generating any Coss behavior component.

- [ ] Capture the pre-Tailwind eager-shell bundle baseline before installing or changing the foundation:

  ```bash
  npm run build
  npm run check:bundle | tee /tmp/relay-coss-bundle-before.txt
  ```

  Expected result: the existing build and bundle gate pass, and `/tmp/relay-coss-bundle-before.txt` contains the current `Total eager gzip` value for the later before/after comparison. This is a measurement only; do not change the existing budget.

- [ ] Install the Tailwind v4 Vite integration and the pinned shadcn CLI used to resolve Coss source items:

  ```bash
  npm install --save-dev tailwindcss @tailwindcss/vite shadcn
  ```

  Expected result: all three packages are added to `devDependencies`, the lockfile records exact versions, and no runtime UI package is introduced.

- [ ] Add the Tailwind Vite plugin to the existing plugin array in `frontend/vite.config.ts` without removing the redirect, React, Sentry, or source-map assertion plugins:

  ```ts
  import tailwindcss from "@tailwindcss/vite";

  plugins: [
    tailwindcss(),
    appBaseRedirectPlugin(),
    react(),
    // existing optional plugins remain here
  ],
  ```

  Preserve the current Vite server and build settings.

- [ ] Add a single `@/*` source alias in `frontend/tsconfig.json`. The repository pins TypeScript 7, where `baseUrl` has been removed, so use the supported relative path target without adding a legacy `baseUrl` key:

  ```json
  {
    "compilerOptions": {
      "paths": {
        "@/*": ["./src/*"]
      }
    }
  }
  ```

  Merge these keys into the existing `compilerOptions`; do not replace the current strictness, JSX, module, or test settings.

- [ ] Add the matching Vite alias in `frontend/vite.config.ts` so generated source imports resolve in both Vite and TypeScript:

  ```ts
  resolve: {
    alias: {
      "@": resolve(process.cwd(), "src"),
    },
  },
  ```

  Merge with any existing `resolve` configuration rather than creating a second key.

- [ ] Add `frontend/components.json` with this shadcn-compatible registry configuration:

  ```json
  {
    "$schema": "https://ui.shadcn.com/schema.json",
    "style": "new-york",
    "rsc": false,
    "tsx": true,
    "tailwind": {
      "config": "",
      "css": "src/design-system/global.css",
      "baseColor": "neutral",
      "cssVariables": true,
      "prefix": ""
    },
    "aliases": {
      "components": "@/design-system/coss",
      "utils": "@/lib/coss/cn",
      "ui": "@/design-system/coss",
      "lib": "@/lib",
      "hooks": "@/hooks"
    }
  }
  ```

  Do not add a `darkMode` field; the app’s `data-theme` contract is handled by the explicit variant in Task 4. Do not add a Coss component to the repository in this task.

- [ ] Verify that the official Coss namespace resolves through the shadcn registry without writing files:

  ```bash
  npm exec shadcn -- view @coss/ui
  ```

  Expected result: the pinned local CLI resolves and prints the Coss UI registry item metadata and file/dependency information. This command must not add generated components, Coss fonts, or behavior packages to the repository. If the CLI requires an explicit namespace entry, record the exact URL it reports in `components.json` under `registries` and rerun the command; do not invent a registry URL.

- [ ] Run the existing type/build checks before changing CSS so configuration errors are isolated:

  ```bash
  npm run build
  npm run check:base-ui-boundary
  ```

  Expected result: the build succeeds, and the Base UI boundary check reports no new violations.

- [ ] Commit the toolchain and registry foundation:

  ```bash
  git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.json frontend/components.json
  git commit -m "build(ui): add tailwind and coss registry foundation"
  ```

---

## Task 4: Add the Relay token bridge and preserve the CSS cascade

**Files:**

- Modify `frontend/src/design-system/global.css`.
- Modify `frontend/src/design-system/tokens.css`.
- Add `frontend/src/design-system/coss-theme.css`.
- Modify `frontend/src/design-system/contrast.test.ts`.
- Add `frontend/src/design-system/tailwindFoundation.test.ts`.
- Add `frontend/e2e/design-system-foundation.spec.ts`.

- [ ] Change only the import/layer preamble of `frontend/src/design-system/global.css` first. Keep all existing Relay reset, typography, focus, and application rules below it:

  ```css
  @layer theme, base, components, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "./tokens.css";
  @import "./coss-theme.css";
  @import "tailwindcss/utilities.css" layer(utilities) source(none);
  @source "./coss";
  ```

  Do not use `@import "tailwindcss"`; that would include Preflight. Keep Relay’s font ownership and existing base rules; load the existing Google Fonts stylesheet from the document head so it does not become a late CSS import.

- [ ] Add the semantic Coss aliases to `frontend/src/design-system/tokens.css`, mapping only to Relay variables. Keep them in the existing token scope so both light and dark values follow the existing theme switching:

  ```css
  :root {
    --background: var(--color-canvas);
    --foreground: var(--color-ink);
    --card: var(--color-surface);
    --card-foreground: var(--color-ink);
    --popover: var(--color-surface);
    --popover-foreground: var(--color-ink);
    --primary: var(--color-action);
    --primary-foreground: var(--color-on-action);
    --secondary: var(--color-surface-2);
    --secondary-foreground: var(--color-ink-strong);
    --muted: var(--color-surface-2);
    --muted-foreground: var(--color-ink-muted);
    --accent: var(--color-action-surface);
    --accent-foreground: var(--color-action);
    --destructive: var(--color-danger);
    --destructive-foreground: var(--color-on-danger);
    --border: var(--color-border);
    --input: var(--color-border-strong);
    --ring: var(--color-action);
    --coss-radius-sm: var(--radius-control);
    --coss-radius-md: var(--radius-control);
    --coss-radius-lg: var(--radius-region);
    --coss-radius-xl: var(--radius-region);
    --coss-font-sans: var(--font-ui);
    --coss-font-heading: var(--font-ui);
    --coss-font-mono: var(--font-mono);
  }
  ```

  Add the required status aliases using the existing Relay semantic colors:

  ```css
  --success: var(--color-success);
  --success-foreground: var(--color-on-action);
  --warning: var(--color-warning);
  --warning-foreground: var(--color-ink-strong);
  --info: var(--color-action);
  --info-foreground: var(--color-on-action);
  ```

  Do not hard-code alternate light/dark values in the bridge. Do not add Coss shadow variables.

- [ ] Add `frontend/src/design-system/coss-theme.css` with the Tailwind v4 theme namespace and the explicit Relay dark variant:

  ```css
  @theme inline {
    --font-sans: var(--coss-font-sans);
    --font-heading: var(--coss-font-heading);
    --font-mono: var(--coss-font-mono);
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-card: var(--card);
    --color-card-foreground: var(--card-foreground);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-destructive: var(--destructive);
    --color-destructive-foreground: var(--destructive-foreground);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);
    --color-success: var(--success);
    --color-success-foreground: var(--success-foreground);
    --color-warning: var(--warning);
    --color-warning-foreground: var(--warning-foreground);
    --color-info: var(--info);
    --color-info-foreground: var(--info-foreground);
    --radius-sm: var(--coss-radius-sm);
    --radius-md: var(--coss-radius-md);
    --radius-lg: var(--coss-radius-lg);
    --radius-xl: var(--coss-radius-xl);
  }

  @custom-variant relay-dark (&:where([data-theme="dark"], [data-theme="dark"] *));
  ```

  If the installed Tailwind version rejects the `@custom-variant` syntax, stop and use the syntax documented by that installed version; do not silently fall back to `.dark` or unscoped `dark:` utilities. The resulting selector must still be rooted in `[data-theme="dark"]`.

- [ ] Extend `frontend/src/design-system/contrast.test.ts` with source-level assertions that the bridge includes the expected aliases and that light/dark Relay token blocks remain present. Add assertions for `--background`, `--primary`, `--border`, `--ring`, the radius aliases, and the non-circular font mappings from `--coss-font-sans`/`--coss-font-heading`/`--coss-font-mono` to Relay’s `--font-ui`/`--font-mono`. Keep the existing WCAG calculations intact.

- [ ] Add `frontend/src/design-system/tailwindFoundation.test.ts` to guard the import contract without rendering CSS:

  ```ts
  import { readFileSync } from "node:fs";
  import { resolve } from "node:path";
  import { describe, expect, it } from "vitest";

  const componentsConfig = JSON.parse(
    readFileSync(resolve(process.cwd(), "components.json"), "utf8"),
  ) as {
    aliases: Record<string, string>;
  };
  const tsconfig = JSON.parse(
    readFileSync(resolve(process.cwd(), "tsconfig.json"), "utf8"),
  ) as {
    compilerOptions: { paths: Record<string, string[]> };
  };
  const globalCss = readFileSync(
    resolve(process.cwd(), "src/design-system/global.css"),
    "utf8",
  );
  const cossThemeCss = readFileSync(
    resolve(process.cwd(), "src/design-system/coss-theme.css"),
    "utf8",
  );

  describe("Tailwind foundation", () => {
    it("imports theme and utilities without importing Preflight", () => {
      expect(globalCss).toContain('@import "tailwindcss/theme.css"');
      expect(globalCss).toContain('@import "tailwindcss/utilities.css"');
      expect(globalCss).not.toContain('@import "tailwindcss"');
      expect(globalCss).not.toContain("preflight.css");
      expect(globalCss).toContain('source(none)');
      expect(globalCss).toContain('@source "./coss"');
      expect(cossThemeCss).toContain('--font-sans: var(--coss-font-sans)');
      expect(cossThemeCss).toContain('--font-heading: var(--coss-font-heading)');
      expect(cossThemeCss).toContain('--font-mono: var(--coss-font-mono)');
      expect(cossThemeCss).toContain('@custom-variant relay-dark');
      expect(cossThemeCss).toContain('[data-theme="dark"]');
      expect(cossThemeCss).not.toMatch(/\.dark\b/);
      expect(globalCss).toContain(":focus-visible");
      expect(globalCss).toContain("outline: 2px solid var(--color-action)");
      expect(globalCss).toContain("outline-offset: 2px");
    });

    it("keeps Relay base rules after the Tailwind layer imports", () => {
      const utilityImport = globalCss.indexOf("tailwindcss/utilities.css");
      const relayBaseRule = globalCss.indexOf("box-sizing");

      expect(utilityImport).toBeGreaterThanOrEqual(0);
      expect(relayBaseRule).toBeGreaterThan(utilityImport);
    });

    it("keeps registry output and TypeScript aliases aligned", () => {
      expect(componentsConfig.aliases.components).toBe("@/design-system/coss");
      expect(componentsConfig.aliases.ui).toBe("@/design-system/coss");
      expect(componentsConfig.aliases.utils).toBe("@/lib/coss/cn");
      expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["./src/*"]);
    });
  });
  ```

- [ ] Add `frontend/e2e/design-system-foundation.spec.ts` to verify the browser cascade on the real app. Insert a temporary off-screen probe and assert that Relay typography remains active, an unstyled list still has a marker, the user-agent button border was not zeroed by Preflight, and keyboard focus retains the Relay outline contract. Remove the probe after reading computed styles:

  ```ts
  import { expect, test } from "@playwright/test";

  test("preserves Relay base styles without Tailwind Preflight", async ({ page }) => {
    await page.goto("/app");

    await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.id = "relay-foundation-probe";
      probe.style.position = "fixed";
      probe.style.left = "-10000px";
      probe.innerHTML =
        '<h1>Probe</h1><ul><li>Item</li></ul><button id="relay-foundation-probe-before" type="button">Before</button><button id="relay-foundation-probe-button" type="button">Probe</button><button id="relay-foundation-probe-after" type="button">After</button>';
      document.body.append(probe);
    });

    const styles = await page.evaluate(() => {
      const probe = document.querySelector<HTMLElement>("#relay-foundation-probe");
      if (!probe) throw new Error("Relay foundation probe was not mounted");
      const heading = probe.querySelector("h1");
      const list = probe.querySelector("ul");
      const button = probe.querySelector("button");
      return {
        headingFont: heading ? getComputedStyle(heading).fontFamily : "",
        headingSize: heading ? getComputedStyle(heading).fontSize : "",
        listStyle: list ? getComputedStyle(list).listStyleType : "",
        buttonBorderWidth: button
          ? getComputedStyle(button).borderTopWidth
          : "",
      };
    });

    expect(styles.headingFont).toContain("Instrument Sans");
    expect(styles.headingSize).toBe("36px");
    expect(styles.listStyle).not.toBe("none");
    expect(styles.buttonBorderWidth).not.toBe("0px");

    const probeButton = page.locator("#relay-foundation-probe-button");
    await probeButton.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const focusStyles = await probeButton.evaluate((button) => {
      const style = getComputedStyle(button);
      return {
        matchesFocusVisible: button.matches(":focus-visible"),
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineOffset: style.outlineOffset,
      };
    });

    expect(focusStyles).not.toBeNull();
    expect(focusStyles!.matchesFocusVisible).toBe(true);
    expect(focusStyles!.outlineWidth).toBe("2px");
    expect(focusStyles!.outlineStyle).toBe("solid");
    expect(focusStyles!.outlineOffset).toBe("2px");

    await page.evaluate(() => {
      document.querySelector("#relay-foundation-probe-button")?.parentElement?.remove();
    });
  });
  ```

- [ ] Run the focused CSS and token tests:

  ```bash
  npm test -- --run src/design-system/contrast.test.ts src/design-system/tailwindFoundation.test.ts
  ```

  Expected result: all existing contrast checks and the new import/token safeguards pass.

- [ ] Run the browser cascade check:

  ```bash
  npm run test:e2e -- e2e/design-system-foundation.spec.ts --project=desktop
  ```

  Expected result: Instrument Sans, Relay heading sizing, list markers, and non-Preflight button borders remain intact.

- [ ] Commit the CSS foundation separately:

  ```bash
  git add frontend/src/design-system/global.css frontend/src/design-system/tokens.css frontend/src/design-system/coss-theme.css frontend/src/design-system/contrast.test.ts frontend/src/design-system/tailwindFoundation.test.ts frontend/e2e/design-system-foundation.spec.ts
  git commit -m "feat(ui): bridge relay tokens into tailwind"
  ```

---

## Task 5: Run the complete Slice 0–1 verification and prepare the implementation PR

**Files:**

- No new source files. Only adjust the preceding task’s files if verification identifies a defect directly caused by this plan.

- [ ] Run the complete unit suite:

  ```bash
  npm test -- --run
  ```

  Expected result: all Vitest tests pass.

- [ ] Run the production build:

  ```bash
  npm run build
  ```

  Expected result: TypeScript emits no errors and Vite produces the production bundle.

- [ ] Run the Base UI boundary check:

  ```bash
  npm run check:base-ui-boundary
  ```

  Expected result: no direct behavior-layer imports are introduced outside the approved wrapper locations.

- [ ] Run the bundle budget check:

  ```bash
  npm run check:bundle
  ```

  Expected result: the existing bundle budget passes. Since no Coss behavior component is generated in Slice 1, there should be no material runtime bundle increase.

- [ ] Compare the final eager-shell size with the baseline captured in Task 3 and record the delta in the PR description:

  ```bash
  npm run check:bundle | tee /tmp/relay-coss-bundle-after.txt
  before="$(awk '/^Total eager gzip:/ { gsub(",", "", $4); print $4 }' /tmp/relay-coss-bundle-before.txt)"
  after="$(awk '/^Total eager gzip:/ { gsub(",", "", $4); print $4 }' /tmp/relay-coss-bundle-after.txt)"
  test -n "$before"
  test -n "$after"
  printf 'eager gzip before=%s bytes after=%s bytes delta=%s bytes\n' "$before" "$after" "$((after - before))"
  test "$after" -le 204800
  ```

  Expected result: both values are present, the final value remains at or below the existing 200KB budget, and any material increase is called out for review rather than hidden behind the unchanged budget.

- [ ] Run all new browser specs under the relevant projects:

  ```bash
  npm run test:e2e -- e2e/preferences-menu.spec.ts e2e/design-system-foundation.spec.ts --project=desktop
  npm run test:e2e -- e2e/preferences-menu.spec.ts --project=case-mobile-390
  ```

  Expected result: desktop behavior, mobile placement, and cascade checks pass.

  These browser checks are local/pre-merge evidence for this PR, not a new CI job. Record the two commands and their passing results in the PR description so the omission from `.github/workflows/ci.yml` is explicit.

- [ ] Inspect the final diff and history:

  ```bash
  git diff origin/main...HEAD --check
  git diff --stat origin/main...HEAD
  git log --oneline --decorate -8
  ```

  Confirm the implementation PR contains only Slice 0–1, has no generated unused components, no font changes, no `.dark` selector, no Preflight import, and no unrelated formatting churn.

- [ ] Confirm the working tree is clean:

  ```bash
  git status --short
  ```

  Expected result: no output.

- [ ] Open the implementation PR with a focused summary:

  - Closes issue #41 with real PreferencesMenu unit/browser coverage.
  - Adds 390px geometry and no-horizontal-overflow assertions.
  - Adds Tailwind v4 + Coss registry/source configuration only.
  - Preserves Relay tokens, fonts, `data-theme`, base rules, behavior wrappers, and bundle boundaries.
  - Explicitly defers Coss-derived visual component migration to Slice 2.

## Execution Dependencies and Parallelization

| Workstream | Modules touched | Depends on |
| --- | --- | --- |
| Preferences coverage | `src/app-shell/`, `e2e/preferences-menu.spec.ts` | Baseline app behavior; Task 2 browser run also depends on a fresh build |
| Tailwind/Coss configuration | `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `components.json` | Bundle baseline before installation |
| CSS/token foundation | `src/design-system/` and `e2e/design-system-foundation.spec.ts` | Tailwind/Coss configuration |
| Final verification | build output, bundle checks, all test suites | All prior workstreams |

The first two workstreams can be developed in separate worktrees, but the browser run and final verification must be sequential because they share the generated `app/static/relay` build output. In the current single worktree, execute Tasks 1–2 and Task 3 sequentially, then Task 4, then Task 5.

## Coverage and Failure-Mode Review

```text
CODE PATHS                                      USER FLOWS / CHECKS

[+] PreferencesMenu integration                 [+] Open Preferences
  ├── popup role + aria-labelledby                 ├── [★★★] Unit contract test
  ├── real radio/checkbox/link controls            ├── [★★★] Browser semantics test
  ├── first focus + ArrowUp/ArrowDown              ├── [★★★] Escape restores trigger
  ├── Escape + outside dismissal                   ├── [★★★] Overview outside dismissal
  └── portal positioner + 390px bounds             └── [★★★] 390px right edge/scroll width

[+] Tailwind/Coss foundation                     [+] Build and source generation
  ├── Vite plugin + utility scan                   ├── [★★★] production build
  ├── components.json + aliases                   ├── [★★★] static config assertions
  ├── Relay token aliases                          ├── [★★★] contrast/token tests
  ├── font mappings                                ├── [★★★] Coss theme source checks
  ├── explicit data-theme dark variant             └── [★★★] no Preflight/focus/cascade checks
  └── eager CSS output                             └── [★★★] before/after bundle measurement

GAPS intentionally deferred: no Coss visual component or Coss behavior primitive
is generated in Slice 1; those paths are tested when Slice 2 adds its first real
Relay consumer.
```

Failure modes and planned handling:

| Failure | Test/check | Handling | User impact |
| --- | --- | --- | --- |
| Missing/stale production bundle | Build prerequisite before Playwright | Build fails before browser assertions | Clear developer failure |
| Coss registry unavailable or namespace changes | `npm exec shadcn -- view @coss/ui` | CLI exits non-zero; no source files are generated | Clear developer failure |
| Alias/config drift | `tailwindFoundation.test.ts` JSON assertions | Test fails before Slice 2 generation | No shipped user impact |
| Tailwind Preflight or ordering regression | Static import test plus browser probe | Test/build gate fails | Could alter all surfaces; blocked before merge |
| Focus ring is overwritten | CSS assertion plus keyboard focus probe | Test fails | Keyboard users lose visible focus; blocked |
| Dark selector or token bridge drifts | Source assertions plus existing contrast tests | Test fails | Theme can become unreadable; blocked |
| Eager CSS grows unexpectedly | Before/after gzip measurement plus bundle budget | PR must call out material delta; budget still fails hard | Slower initial shell; review required |

No implementation file needs an inline ASCII diagram. The changed behavior is already represented by the plan-level flow above, and the existing wrapper comments document the non-obvious focus and portal decisions at their source.

---

## Rollback

If the Tailwind foundation changes the existing cascade or build behavior, revert the CSS foundation commit and remove the Tailwind Vite plugin/dependencies. The PreferencesMenu tests and browser coverage can remain independently because they document the already-merged RelayPopover contract. Do not remove `RelayPopover`, the Relay token system, or the PreferencesMenu migration as part of rollback.

## Completion Criteria

This plan is complete only when:

- issue #41’s real menu integration contract is covered in Vitest and Playwright;
- the menu passes the 390px bounds/no-overflow check;
- Tailwind v4 is installed through the Vite plugin with no Preflight;
- `components.json` points future Coss source generation at Relay’s design-system paths;
- the official `@coss/ui` namespace resolves through the shadcn CLI without generating unused files or importing Coss’s default fonts;
- all Coss semantic aliases resolve through Relay tokens in both themes;
- the explicit `[data-theme="dark"]` variant is used instead of an unmapped `.dark` contract;
- Instrument Sans, IBM Plex Mono, Relay typography, list markers, button borders, and existing base rules remain intact;
- full unit, build, boundary, bundle, and browser verification passes.

## NOT in scope

- **Playwright CI merge gate:** explicitly deferred by review decision. The new browser checks remain local/pre-merge evidence and their commands/results must be recorded in the PR description.
- **Coss default style preset installation:** not applied because it brings default font and theme choices that conflict with Relay ownership. The approved bridge is the source of truth for Slice 1.
- **Coss Menu, Dialog, Popover, or other behavior primitives:** deferred because `RelayPopover` and `RelayDialog` remain the only public behavior boundary.
- **Generated Coss visual components:** deferred until Slice 2 has a real Relay consumer, avoiding unused source and bundle churn.
- **Tutor, Button, surface, and cross-surface visual migrations:** deferred to Slice 2 and Slice 3 for independent rollback and review.
- **Application-root isolation changes:** deferred until a Coss-derived portalled visual component is actually introduced; the existing Relay wrappers and z-index contracts remain unchanged in Slice 1.

## TODOs Review

No new `TODOS.md` entry is required. The deferred work is already captured as Slice 2/Slice 3, the CI choice is explicit above, and no unresolved architecture or test gap remains for Slice 0–1.

## GSTACK REVIEW REPORT

**Review target:** `docs/superpowers/plans/2026-08-20-coss-foundation-slice-0-1.md` on `codex/coss-foundation-design`.

**Status:** DONE_WITH_CONCERNS

**What was corrected during review:**

- Added a pinned local shadcn CLI and a non-mutating `npm exec shadcn -- view @coss/ui` registry check.
- Added explicit non-circular mappings for Coss font utilities to Relay’s Instrument Sans and IBM Plex Mono variables.
- Added a production build prerequisite before backend-backed Playwright tests.
- Corrected all Playwright project names to the existing `desktop` and `case-mobile-390` projects.
- Added focus-visible, dark-selector, alias, and registry-path assertions.
- Added pre/post eager-bundle measurement alongside the existing hard budget check.
- Added plan-level flow, coverage, failure-mode, and worktree dependency diagrams.
- Made the local-only browser verification decision explicit and documented it in the PR handoff.

**Architecture:** Existing Relay wrappers, tokens, global CSS, Playwright server, and bundle checks are reused. Coss remains a source/registry and styling foundation; no new behavior boundary is introduced.

**Code quality:** The plan keeps the first implementation PR bounded to verification and foundation work, avoids unused generated components, pins the repeatable CLI workflow, and keeps the token bridge as an adapter rather than a second palette.

**Test coverage:** Preferences behavior, portal semantics, keyboard focus, dismissal, controls, mobile geometry, Tailwind import ordering, font ownership, dark selector ownership, alias configuration, focus-visible styles, contrast, build, bundle size, and boundary rules are covered. The only intentionally untested paths are future Coss-derived components deferred to Slice 2.

**Performance:** Tailwind’s eager CSS impact is measured against a pre-change baseline, and the existing 200KB gzip budget remains a hard failure gate. No runtime Coss behavior package is added in this slice.

**Standing concern:** Browser tests are not added to CI by explicit user decision. They remain a local/pre-merge requirement and must be reported in the PR description; future regressions can return if maintainers stop running that command.
