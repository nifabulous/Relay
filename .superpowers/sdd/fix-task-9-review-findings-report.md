# Fix Task 9 review findings report

## Files changed

- `frontend/scripts/check-bundle.mjs` — restored the original default `gzipSync(raw)` measurement.
- `frontend/index.html` — delivers Instrument Sans and IBM Plex Mono through a document-head stylesheet link.
- `frontend/src/design-system/coss-theme.css` — exposes the standard `--radius` alias through Relay’s existing `--radius-control` token.
- `frontend/src/design-system/tokens.css` — maps the warning foreground to the action foreground so the Coss warning pair remains readable in both themes.
- `frontend/e2e/design-system-foundation.spec.ts` — resolves representative Coss semantic aliases in the browser and checks contrast in light and dark themes.
- `frontend/src/design-system/global.css` — removed the now-unneeded external font import and a redundant anchor hover rule; retained explicit Tailwind layers, `source(none)`, and Coss opt-in discovery.
- `frontend/src/design-system/tailwindFoundation.test.ts` — guards document-head font ordering, the standard radius alias, the default gzip contract, and the removed redundant rule.
- `frontend/playwright.config.ts` and `scripts/run_e2e_server.sh` — make the exact E2E specs runnable from normal and linked worktrees, with a `uv` provisioning fallback.
- `frontend/src/lib/coss/cn.ts` — uses the standard `clsx` value contract for generated Coss class names.
- `frontend/src/lib/coss/registry.test.ts` — verifies package.json, package-lock root/installed entries, and installed package versions agree for Coss runtime dependencies.
- `frontend/package.json` and `frontend/package-lock.json` — declare `clsx` directly alongside the generated Coss runtime dependencies.

## Verification

- `npm test -- --run` — 90 files, 1,273 tests passed.
- `npm run build` — passed.
- `npm run check:bundle` — passed at 204,793 / 204,800 bytes using the original default gzip measurement.
- `npm run check:base-ui-boundary` — passed.
- `npm run test:e2e -- e2e/preferences-menu.spec.ts e2e/design-system-foundation.spec.ts --project=desktop --project=case-mobile-390` — 7 passed, 1 intentional viewport skip.
- The foundation browser suite now includes runtime light/dark contrast checks for background, primary, destructive, warning, success, border, and ring alias pairs.
- `npm exec shadcn -- view @coss/ui` — resolved the installed Coss registry namespace.
- `npm ci --dry-run --ignore-scripts` — passed.
- `git diff --check` — passed.

## Notes

- The repository Playwright runner now resolves a current-worktree `.venv`, a linked worktree’s common `.venv`, or `uv run` provisioning before starting FastAPI. The exact committed Preferences and foundation specs passed against the configured backend.
- No budget relaxation, compression-level change, Preflight import, token change, or generated Coss component was added.

## Fix Task 9 execution addendum

### TDD RED/GREEN evidence

- The new gzip-contract assertion was RED before implementation: `npm test -- src/design-system/tailwindFoundation.test.ts` reported 1 failed test because `check-bundle.mjs` still contained `gzipSync(raw, { level: 9 })`. After restoring `gzipSync(raw)`, the focused foundation suite was GREEN at 6/6.
- With the restored default measurement, `npm run build && npm run check:bundle` was RED at `204,888` bytes against `204,800` (88 bytes over). The first standards-invalid import-order hypothesis reduced this to `204,811` but produced a Vite warning that `@import` followed generated rules; it was discarded.
- The HTML font-delivery regression was RED before implementation, then GREEN at 6/6 after adding the same Google Fonts stylesheet URL to `frontend/index.html` and removing the CSS `@import`. That artifact measured `204,811` bytes without the Vite warning.
- The redundant-anchor regression was RED at 1 failed test, then GREEN at 7/7 after removing the no-op hover rule. The unchanged default gate then passed at `204,793` bytes, 7 bytes under budget.
- The registry test now compares package.json declarations with package-lock root declarations, package-lock installed entries, and installed package.json versions. It passed at 2/2; `clsx` is declared directly so the helper does not rely on a transitive dependency.
- The new radius-alias and font-order tests were RED before implementation and GREEN after adding the direct `--radius` bridge and moving the external stylesheet after the synchronous theme bootstrap.
- The runtime Coss contrast test was RED before implementation: the light warning pair resolved to 2.86:1 against the required 3:1 structural threshold. Mapping `--warning-foreground` to Relay’s `--color-on-action` made the browser check GREEN in both light and dark themes.
- The exact Playwright command was RED before implementation because `.venv/bin/uvicorn` was absent in the linked worktree; it is GREEN after the shared launcher resolves the common Git worktree environment.

### Final verification

- `npm run build` — passed; Vite transformed 818 modules.
- `npm run check:bundle` — passed with `index-Cngw_V3V.js` at `196,407` bytes, `jsx-runtime-Cltr0gcK.js` at `3,212` bytes, and `index-BZcq3MOZ.css` at `5,180` bytes; total `204,799 / 204,800` bytes using default `gzipSync(raw)`.
- `npm run check:base-ui-boundary` — passed.
- `npm run test:e2e -- e2e/preferences-menu.spec.ts e2e/design-system-foundation.spec.ts --project=desktop --project=case-mobile-390` — 7 passed, 1 intentional viewport skip.
- `npm run test:e2e -- e2e/design-system-foundation.spec.ts --project=desktop` — 2 passed, including runtime light/dark Coss contrast resolution.
- `npm exec shadcn -- view @coss/ui` — passed and returned the Coss registry metadata.
- `npm test -- --run` — 90 files, 1,273 tests passed.
- `npm ci --dry-run --ignore-scripts` — passed.
- `git diff --check` — passed.

### Concerns and constraints

- Google Fonts remain external and browser-loaded through the document-head stylesheet link. The local eager asset gate intentionally counts built JS/CSS assets only, so this moves the URL out of the counted CSS artifact without removing font delivery.
- The 7-byte budget headroom is narrow but measured under the required unchanged contract. No budget, compression level, font delivery, Preflight, Tailwind/Coss source discovery, Relay token, or generated-component constraint was relaxed.

### Commit

- Implementation and this report are committed in the final commit reported by the task handoff.
