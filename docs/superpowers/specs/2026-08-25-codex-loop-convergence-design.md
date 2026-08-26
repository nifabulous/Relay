# Codex review loop: convergence

Design for [#61](https://github.com/nifabulous/Relay/issues/61). Written
2026-08-25, branched from `6085554`.

## The invariant

Every review loop must reach a terminal state through a mechanism that runs
automatically, and every finding must be able to reach a terminal state
through actions available to the fixer.

Both halves are currently violated, independently.

## Evidence

PR 53 ran five review rounds. Four fix pushes landed between them. Zero
findings changed state — all five were `OPEN` in the final round, the same
five raised in round one. Three of them were fixed in the tree at the time
the reviewer re-raised them.

The loop had no way to stop. It ended because a human merged, not because
anything decided it was finished.

## Cause A: nothing invokes the arbiter

`scripts/codex_arbiter.py` is 1,227 lines behind 1,769 lines of tests. It
implements the complete termination system:

- `CLEAN` → `MERGE-CLEAN`
- `EXHAUSTED-NOVELTY` → `MERGE-WITH-GAPS` when every open finding is a
  repeated minor
- `SOFT-GATE` → `MERGE-WITH-GAPS` at round 5 with no open P1
- `HARD-CAP` → `ESCALATE-TO-SCOPING` at round 10
- `STUCK-P1` → `ESCALATE-TO-SCOPING` after 3 rounds with fixer pushes between

Nothing calls it. `grep -rn codex_arbiter .github/` returns no invocation;
the only matches anywhere are comments. Run by hand on PR 53 it returned
`ESCALATE-TO-SCOPING` / `STUCK-P1` / `needs_human: true` at round 5 — the
correct call, two rounds before the loop actually stopped.

This is the larger half of #61 and it is mostly wiring.

## Cause B: findings cannot reach a terminal state

The reviewer receives exactly three artifacts: sanitized PR metadata, the PR
diff, and its own previous review comment. Two classes of finding therefore
cannot be closed from a branch.

**B-i. Findings asking for evidence a diff cannot carry.** On PR 53 the
reviewer asked for "an exact-head test result demonstrating the stale-bundle
fix resolves the prior failure". The result existed and was recorded in
`66eb8d1`'s commit message. `gh pr diff` does not include commit messages, so
the reviewer never saw it and re-raised the finding unchanged.

**B-ii. Findings about files the diff does not touch.** The reviewer reported
the trust anchor as caller-controlled in four rounds. The anchor is pinned in
`.github/workflows/codex-pr-review.yml`, which no commit on that branch
modified, so it was never in the diff. Correct reasoning from an incomplete
artifact set.

A related lag, which is a safety property and not a defect: the trusted policy
and prompt are read from the default branch at `TRUSTED_SHA`. A PR that changes
review policy is reviewed by the old policy and correctly refuses to let its
own change take effect. Such a PR always carries an open finding until it
merges. The design must not try to remove this.

## Components

### 1. The arbiter comment is edited, never appended

`post_comment` shells `gh pr comment`, which appends. It writes a
`<!-- codex-arbiter:{pr} -->` marker but nothing reads it, so wiring the
arbiter as-is would put a fresh comment on every push — reproducing the
unbounded-growth problem that motivated `368f956`.

Change `post_comment` to find the existing bot comment carrying this PR's
arbiter marker and `PATCH` it, creating one only when absent. The marker is
already per-PR, which is the right granularity: one arbiter comment per PR,
edited as the disposition changes.

Author identity is checked as well as the marker, matching the duplicate
suppression in `codex_review_pr.sh`: a marker in a body anyone can write is
forgeable, a login is not.

### 2. Gap-issue filing becomes opt-in

`main()` coupling at `scripts/codex_arbiter.py:1209` posts the comment and
then unconditionally files gap issues when `decision.proposed_gaps` is
non-empty. There is no comment-only mode.

Split them: `--post` posts the comment; a new `--gap-issues` additionally
files the ledger issues. Default is comment only.

This is also a correctness requirement, not only a preference. Run against
PR 53 today, `--post` would file five `proposed-gap` issues, three of them for
findings already fixed in the tree — because the reviewer never marked them
`RESOLVED`. Auto-filing is unsafe until Cause B is addressed; commenting is
not.

### 3. The arbiter runs after each review

A second job in `.github/workflows/codex-pr-review.yml`, `needs: [review]`.
It makes no model call and executes no PR code — it reads comment history over
the authenticated API and evaluates a pure function.

The job passes `ARBITER_OPERATOR` from a repository variable
(`vars.ARBITER_AUTOPOST`), defaulting to unset. The arbiter's write path is
gated behind `ARBITER_OPERATOR=1` at two layers, and its own comments state
this is deliberate so automation cannot reach a GitHub write by skipping
`main()`'s check. Automating it reverses that decision, so the reversal is
made explicit and revocable: the feature ships off, and turning it off again
is a repository-settings change with no deploy.

When the variable is unset the job still runs and still evaluates the
disposition, writing it to the job summary. Only the comment is withheld. A
disposition nobody can see is the situation #61 describes, so the read-only
mode must still surface its answer somewhere.

The review job can exit zero without posting (duplicate suppression, head
moved mid-run). The arbiter job must tolerate an unchanged history and is
idempotent by component 1.

### 4. `Contract.from_env` reads every knob

`Contract.from_env` reads `bot_login` and `soft_gate` and silently drops
`hard_cap` and `stuck_p1_rounds` to their dataclass defaults, despite a
docstring describing all four as tunable knobs read from the environment.
Setting `ARBITER_HARD_CAP` today does nothing and reports nothing.

Read all four. Reject a non-positive integer rather than falling back, so a
misconfigured cap fails loudly instead of silently reverting to 10.

### 5. Verification results reach the reviewer (B-i)

The review job reads check runs for the exact head over the authenticated API
and supplies them as a new untrusted-input block.

**Security boundary.** The review job runs under `pull_request_target` with
`OPENAI_API_KEY` in scope. It must never execute PR-authored code. It
therefore reads the *results* of the separate `CI` workflow, which is
`pull_request`-triggered and runs the PR's code without secrets. The review
job runs nothing: `gh api repos/{repo}/commits/{sha}/check-runs`, and no more.

**Shape.** Name, conclusion, and completion time per check run. Structured and
small. Capped at a configured count and byte ceiling, sanitized through
`codex_sanitize.py`, and wrapped by `codex_untrusted.py` under the label
`verification-results`. It is untrusted input, not policy: the PR controls
what tests exist, so a green check is evidence that the named check passed and
never proof that the code is correct. The review policy already draws this
distinction and the prompt will cite it.

**Timing.** CI outlasts the review today — on `66eb8d1`, `test (3.10)` took
2m21s and `frontend` and `quality-gate` were still pending after the review
finished in 1m37s. Reserving the existing 900-second model timeout and
180-second posting headroom inside the 1,200-second job would leave only 120
seconds for polling, so an in-job wait would structurally finish before the
measured CI result this component exists to carry.

Push reviews therefore start from `workflow_run: completed` for the separate
`CI` workflow rather than directly from the PR's `opened` or `synchronize`
event. The privileged review workflow validates that the source event was
`pull_request`, binds the run's head SHA to the current PR head, and exits
without a model call when the PR has already advanced; the newer head's CI
completion owns that review.

`opened` and `synchronize` are kept as a coverage fallback, because sequencing
a review behind CI may delay it but must never delete it. A `pull_request` run
does not always exist: when a PR conflicts with its base, GitHub cannot build
the merge ref and creates no run, so no `workflow_run` event can fire for that
head. This repository has the case on record — every head on
`fix/coss-review-followups` has a `CI` run except `368f956`, pushed while PR 53
conflicted, which was reviewed only because `synchronize` was still a trigger.
The `schedule` path cannot substitute: it selects only PRs labelled
`codex-review`, and that label is not defined here.

The two paths are made mutually exclusive rather than merely both present. On
`opened` and `synchronize` the worker asks whether a `CI` run exists for the
exact head, waiting a short discovery window because GitHub creates runs
asynchronously, and defers with an exit-zero skip when one does. It reviews
immediately only when no run appears, and says in the verification block that
CI produced no run — which is a different statement from checks that exist but
have not settled. A probe that fails is treated as "no run found", so the
invariant fails safe toward reviewing rather than toward silence. It checks out only the trusted default branch,
downloads no CI artifacts or caches, and executes no PR code. `reopened`,
`ready_for_review`, manual, and scheduled runs may read the exact head's
currently completed checks once without polling. Any absent result reads as
"not available at review time", never as absence of evidence, and unsettled
external checks do not erase completed CI evidence.

### 6. Named context files reach the reviewer (B-ii)

`.github/codex/context-files.txt` lists repository-relative paths. The
allowlist and every file on it are read from `TRUSTED_SHA` with
`show_trusted`, the same content-addressed read that serves the review policy
and the contract, and land in the trusted instructions channel under their own
heading.

A PR cannot extend the allowlist, because the allowlist is read from the
trusted SHA and not from the branch. The files are capped in count and total
bytes. A listed path that does not resolve is skipped, matching the contract
reader's existing fail-safe behavior.

Seeded with `.github/workflows/codex-pr-review.yml`, the file whose absence
from the diff produced four rounds of a refuted finding.

These are reference material, not policy. The heading says so, so the reviewer
does not read a workflow's imperative YAML as instructions.

### 7. A finding may be marked unverifiable (B-iii)

`validate_trailer` checks required keys and the schema version; it does not
reject unknown keys. An optional field is therefore backward compatible and
needs no schema bump, which matters because history contains schema-2 trailers
that must keep parsing.

A finding may carry:

```json
{"sev": "P2", "state": "OPEN", "file": "...", "cat": "...", "id": "...",
 "unverifiable": {"missing": "the workflow file is not in the supplied diff"}}
```

`missing` must be a non-empty string naming the specific absent artifact. A
finding that cannot say what it is missing is not unverifiable, it is
unexamined.

**This must not close a finding.** It is a routing signal, not a resolution:

- A P0 or P1 marked unverifiable routes to `needs_human`. It never merges
  clean and never rides out under novelty exhaustion.
- A P2 or P3 marked unverifiable is eligible for the gap ledger, so it leaves
  the loop as a tracked issue rather than as silence.
- The arbiter caps consecutive rounds a finding may sit unverifiable
  (`ARBITER_UNVERIFIABLE_ROUNDS`, default 2). Past the cap it escalates.

The abuse risk is the whole design problem here. A model that can mark
findings unverifiable will reach for it to dodge work, which is precisely the
suppression the lifecycle states exist to prevent. Requiring a named artifact,
refusing to close anything, and capping the rounds are what keep it a
classification rather than an exit.

## Testing

`decide()` is pure and its history documents are synthetic, so components 4
and 7 are cheap to test directly, following the existing builders in
`tests/test_codex_arbiter.py`.

- **1** — two runs produce one comment; the second edits. A comment carrying
  the marker but authored by someone else is not adopted.
- **2** — `--post` alone files no issues; `--gap-issues` files them.
- **3** — workflow assertions in `tests/test_codex_automation.sh`, in the
  existing `require_text` style: the job exists, needs the review job, passes
  `ARBITER_OPERATOR` from a variable rather than a literal, and makes no model
  call.
- **4** — each knob is read; a non-positive value is rejected.
- **5** — `workflow_run` is restricted to completed `CI` runs sourced from a
  pull request; a stale run/head pairing exits before the model; the block is
  sanitized before wrapping and wrapped before sending; the privileged job
  never invokes a test runner or downloads CI artifacts/caches; an absent
  completed result produces explicit not-available text.
- **6** — the allowlist is read from the trusted SHA, a branch-side edit to it
  has no effect, an unresolvable path is skipped, and the caps hold.
- **7** — unverifiable does not close; P1 routes to `needs_human`; a missing
  or empty `missing` field is rejected; the round cap escalates.

Every guard added here gets a mutation test: break the guard, watch the named
check fail, restore. The session that produced this spec found two guards that
passed for the wrong reason before mutation testing them.

## Sequencing

Components 1, 2 and 4 are prerequisites for 3 — wiring the arbiter before
comment idempotency ships the clog again, and before the opt-in split it files
false gap issues.

5, 6 and 7 have no technical dependency on 3 or on each other, but 3 should
still land first: it is what bounds the loop, and 5 and 6 both enlarge what
the reviewer can find. Shipping them into an unbounded loop risks more rounds
rather than fewer.

7 is most useful after 5 and 6, because those two remove most of what is
genuinely unverifiable, leaving a smaller and more honest set behind.

## Out of scope

- Merge gating. The arbiter comments; it blocks nothing. Enforcement is a
  separate decision once the disposition has been observed to be right.
- Changing the trusted-policy lag. A PR being reviewed by the old policy is
  the correct safety property.
- Extracting the arbiter into its own repository. Discussed, not decided, and
  #61 must be fixed first regardless.

## Risks

**The reviewer treats check-run results as proof.** Mitigated by the policy
language and the untrusted framing, not eliminated. A model can still over-read
a green check.

**Component 7 becomes a suppression channel.** Mitigated by the named-artifact
requirement, by never closing a finding, and by the round cap. This is the
component to review hardest.

**Input growth.** Components 5 and 6 both add to a bounded input budget already
enforced by `--require-complete-input`. Both are capped, and the caps must be
chosen against `CODEX_MAX_INPUT_BYTES` rather than picked freely.

**More rounds, not fewer.** Giving the reviewer more artifacts could surface
more findings rather than closing existing ones. The arbiter's caps are what
bound that, which is another reason component 3 lands before 5 and 6.
