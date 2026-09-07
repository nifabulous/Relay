# Loopkeeper improvements

This is the consumer-side backlog for the standalone Loopkeeper extraction.
Behavior changes stay in the Loopkeeper repository; this file records the
request, the intended contract, and the Relay evidence that motivated it.

## Requested changes

- [x] **Append-only arbiter history.** Implemented in the standalone
  Loopkeeper adapter candidate. New decisions append an immutable comment with
  a canonical SHA-256 decision fingerprint; an exact retry for the same PR,
  head, and decision is suppressed. Historical comments are never patched.

- [x] **Move the arbiter's five-review boundaries.** The requested semantics
  are now explicit and implemented in the standalone candidate:

  1. `STUCK-P1` requires five consecutive rounds;
  2. five consecutive unverifiable rounds are allowed, with
     `UNVERIFIABLE-ROUND-CAP` on the sixth;
  3. the existing soft gate remains 5, and this change does not delay arbiter
     invocation independently of the deterministic rules.

  The defaults are covered by regression tests; explicit `ArbiterConfig`
  overrides retain their existing `more-than-cap` semantics.

## External implementation and verification

The two completed items above are implemented on immutable Loopkeeper commit
[`ce89e906d3e3809f76deb329603831a05d6e7461`](https://github.com/nifabulous/loopkeeper/commit/ce89e906d3e3809f76deb329603831a05d6e7461),
currently proposed in [Loopkeeper PR #36](https://github.com/nifabulous/loopkeeper/pull/36).
That candidate is not released or pinned into Relay yet; production activation
still requires the separate merge/release/pin step.

- Append-only writer: [`arbiter_io.py`](https://github.com/nifabulous/loopkeeper/blob/ce89e906d3e3809f76deb329603831a05d6e7461/src/loopkeeper/adapters/github/arbiter_io.py),
  `test_arbiter_comment_appends_changed_decision_for_same_head`, and
  `test_arbiter_comment_suppresses_exact_decision_retry` in
  [`test_arbiter_io.py`](https://github.com/nifabulous/loopkeeper/blob/ce89e906d3e3809f76deb329603831a05d6e7461/tests/github/test_arbiter_io.py).
- Five-round boundaries: [`arbiter.py`](https://github.com/nifabulous/loopkeeper/blob/ce89e906d3e3809f76deb329603831a05d6e7461/src/loopkeeper/arbiter.py),
  `test_default_stuck_p1_boundary_is_four_five_and_six_rounds`,
  `test_default_unverifiable_round_cap_allows_five_then_escalates_on_sixth`,
  and `test_arbiter_config_defaults_use_five_round_review_boundaries` in
  [`test_arbiter.py`](https://github.com/nifabulous/loopkeeper/blob/ce89e906d3e3809f76deb329603831a05d6e7461/tests/unit/test_arbiter.py).
- The candidate's Python 3.10–3.12, lint, shell, and workflow-validation checks
  are recorded on [PR #36](https://github.com/nifabulous/loopkeeper/pull/36).

## Recommended next improvements

These are separate from the two requested changes and are ordered by how much
they improve auditability or reduce the chance of a false disposition.

1. [x] **P1 — make arbiter idempotency reads bounded and paginated.** Implemented
   at `ce89e906d3e3809f76deb329603831a05d6e7461`: comment history is paginated,
   stdout is streamed within a shared byte budget, and an oversized response
   terminates the child process before JSON parsing. Page- and byte-cap
   exhaustion fail closed instead of guessing that the event is new.

2. **P1 — serialize the writer per PR and expose the event id.** The final
   read-before-create prevents stale-head writes but cannot make two concurrent
   GitHub comment creates atomic. Keep `cancel-in-progress: false` for the
   PR-scoped writer, include the decision digest in the step summary/artifact,
   and add a replay test that runs two writers against the same head.

3. [x] **P1 — preserve complete `workflow_run` coverage with bounded fan-out.**
   Implemented in the caller templates, reusable workflow contract, and Relay
   caller. The selector de-duplicates associated numbers, re-fetches each PR,
   keeps only open exact-head matches, and sends one explicit PR number per
   matrix job. An empty association payload recovers all open PR candidates at
   the run head, then applies the same exact-head filter and fans out every
   verified match. The caller does not impose a smaller association cap: it
   supports 256 unique targets, matching
   GitHub's maximum matrix job count, and fails visibly above that contract.
   Run-head recovery reads at most three 100-item API pages and also fails if a
   full third page means selection would be incomplete. Lookup failures are
   nonzero and retryable rather than successful empty reviews.

4. **P2 — wire arbiter thresholds through one visible configuration path.**
   `ArbiterConfig` now has the correct defaults, but the CLI still constructs
   it directly. Parse `LOOPKEEPER_ARBITER_*` in one place, reject invalid values,
   and record the effective thresholds in the artifact and workflow summary so
   a five-round decision is explainable after the fact.

5. **P2 — add an explicit human acknowledgement for `pending-human`.** Keep
   the arbiter fail-closed for cost/data-sharing and permission decisions, but
   give an authorized human a documented, auditable acknowledgement action that
   records actor, timestamp, head SHA, and decision digest. This avoids treating
   a reviewer's “fixed” label as approval of a policy decision.

6. **P2 — publish a compatibility migration note for legacy markers.** The
   new writer reads old two-part arbiter markers but never edits them. Document
   that mixed histories are expected during rollout and add a dashboard/query
   that distinguishes legacy comments from fingerprinted events.

7. **P3 — maintain a replay matrix for the boundary cases.** Keep fixtures for
   4/5/6 stuck-P1 rounds, 4/5/6 unverifiable rounds, head changes between the
   two reads, same-decision retries, changed decisions, closed PRs, fork
   authorization, and malformed trailers. Run it against both the pure arbiter
   and the GitHub writer before every release.

## PR #64 human decisions

These are decisions/verification steps, not more fixer commits:

- [x] Confirm paid review remains explicit opt-in (`LOOPKEEPER_REVIEW_ENABLED
  == 'true'`). The reviewer marked `paid-review-opt-out` fixed, but the arbiter
  keeps the P1 resolution `pending-human` by design. **Approved.**
- [x] Independently approve the pinned Loopkeeper reusable workflow at
  `ff1dbeb4f3eee1a45dc34ad1e02c062b93d26231`, including its
  `pull-requests: write` comment-posting contract and job-level permissions.
  **Approved.**
- [x] Require complete associated-PR coverage for `workflow_run` before merge
  (`workflow-run-first-pr-only` is not sufficient). Every GitHub-supplied
  association must reach exact-head filtering without a smaller caller-owned
  drop cap. **Approved.**
- After merge, validate a same-repository PR, an approved fork, an
  unapproved/revoked fork, a multi-PR `workflow_run`, and one successful posted
  review/arbiter result on the exact new head.

## Open input

The final item in the request was truncated after “and the”. Add it here once
the remaining requirement is supplied, before the backlog is treated as
complete.
