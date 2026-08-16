## What changed

<!-- State the user-visible behavior and the exact scope. -->

## Why

<!-- State the root cause or requirement. Include explicit out-of-scope items. -->

## Validation evidence

- [ ] Focused regression test added and run (or explain why not applicable).
- [ ] Full relevant backend/frontend suite run.
- [ ] Typecheck, lint, and production build run.
- [ ] Bundle/deployment artifacts inspected for secrets, source maps, and
      public references where applicable.
- [ ] Tests exercise the real boundary; mocks/fakes record inputs and enforce
      limits instead of replacing the behavior under test.
- [ ] Final diff reviewed top-to-bottom after tests; only intended files are
      included and `git diff --check` passes.
- [ ] Current-head CI, review comments, and mergeability checked after the
      latest push.

Commands and results:

```text
scripts/verify_before_push.sh origin/main
# Paste exact results and any additional commands here.
```

## Review notes

- Known risks or remaining verification gaps:
- Required human/deployment verification:

## Merge gate

This PR is not ready to merge until the exact head SHA has passing required
checks, no unresolved actionable comments, and explicit human approval.
