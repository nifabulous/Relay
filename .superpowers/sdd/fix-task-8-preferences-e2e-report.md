# Task 8: PreferencesMenu E2E coverage report

## Files changed

- `frontend/e2e/preferences-menu.spec.ts`
  - Added the missing left-edge assertion to the existing 390px geometry test.
  - Exercised the real `All settings` link with accessible role/name locators and asserted menu dismissal plus navigation to `/settings`.
  - Preserved Overview outside-dismissal, Escape focus restoration, arrow navigation, right-edge, and document-width assertions.
- `.superpowers/sdd/fix-task-8-preferences-e2e-report.md`
  - Added this report as required by the task.

## RED

Command:

```text
npx playwright test e2e/preferences-menu.spec.ts --project=desktop --project=case-mobile-390
```

Output:

```text
[WebServer] /bin/sh: .venv/bin/uvicorn: No such file or directory
Error: Process from config.webServer was not able to start. Exit code: 127
```

The focused browser assertions could not reach test execution because the repository backend required by `frontend/playwright.config.ts` is unavailable. The same prerequisite failure occurred when running the 390px geometry test alone.

## GREEN

The focused Vitest contract test passed:

Command:

```text
npm test -- --run src/app-shell/PreferencesMenu.test.tsx
```

Output:

```text
Test Files  1 passed (1)
Tests       14 passed (14)
```

The browser suite could not produce a GREEN result for the same missing `.venv/bin/uvicorn` prerequisite.

## Other verification

- `git diff --check` passed.
- Self-review confirmed the change is limited to the requested browser assertions and uses accessible roles/names.
- The pre-existing modification in `frontend/src/design-system/tailwindFoundation.test.ts` was left untouched.

## Commit SHA

Implementation commit: `b81c3706a82211259c97d748f9ff93d57848d660`

## Concerns

- Playwright verification remains pending until the repository `.venv/bin/uvicorn` executable is available or a backend is already running for reuse.
