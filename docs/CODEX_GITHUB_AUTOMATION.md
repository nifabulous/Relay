# Codex GitHub Automation

Relay has opt-in Codex workflows for pull-request review and GitHub issue triage.

> **Status (PR review):** pull-request review moved to
> [Loopkeeper](https://github.com/nifabulous/loopkeeper) v0.1.1 — the standalone
> extraction of this repository's own review harness — via the thin caller
> `.github/workflows/loopkeeper-pr-review.yml`. The inlined
> `.github/workflows/codex-pr-review.yml` is kept on standby, not deleted:
> every job in it is gated on `CODEX_PR_REVIEW_ENABLED`, which is unset, so
> nothing in it runs. It also remains a required fixture for
> `tests/test_codex_automation.sh`, `tests/test_model_pinning.py`, and the
> arbiter tests. **Issue triage still runs
> on the Codex workflow described below and still uses every `CODEX_*` variable
> listed here.** The review-specific parts of this document describe the retired
> implementation and have not been rewritten for Loopkeeper yet; "Pull requests"
> below states what actually runs today.

## Enable it

In the repository settings:

1. Add an Actions secret named `OPENAI_API_KEY`.
2. Add a repository Actions variable named `CODEX_REVIEW_ENABLED` with the value `true`.
3. Optionally add `CODEX_MODEL` as a repository variable. It defaults to `gpt-5.3-codex`.
4. Optionally add `CODEX_REASONING_EFFORT`. It defaults to `medium` and accepts `none`, `low`, `medium`, `high`, or `xhigh`.
5. Optionally add `CODEX_MAX_ITEMS`. It defaults to `10` scheduled items per workflow run.
6. Optionally add `CODEX_MAX_INPUT_BYTES`. It defaults to `600000` bytes per PR review request (`120000` for the issue-triage workflow). It is one budget for the whole request: the trusted instructions are drawn first and the untrusted payload receives the remainder. PR review fails closed if the sanitized diff does not fit; raise this budget within the model's context limit or split the PR rather than accepting a partial review.
7. Optionally add `CODEX_MAX_OUTPUT_TOKENS`. It defaults to `32000` and is sent to the API as `max_output_tokens`, so it caps generation cost and latency rather than only trimming the reply afterwards. On a reasoning model this budget covers reasoning tokens as well as the visible reply, so it must stay well above the reasoning reserve; a value that starves the reply produces an `incomplete` response instead of a review.
8. Optionally add `CODEX_MAX_OUTPUT_BYTES`. It defaults to `50000`. A response larger than this is rejected before it is written or posted. It must be reachable within `CODEX_MAX_OUTPUT_TOKENS` (four bytes per token); an unreachable ceiling is refused at startup so raising one cap forces a decision about the other.
9. Optionally add `CODEX_REQUEST_TIMEOUT`. It defaults to `900` seconds. It must cover the generation `CODEX_MAX_OUTPUT_TOKENS` allows — roughly 20 seconds per 1000 tokens — and the script refuses a pair that cannot, so raising the token cap forces a decision about the timeout. A timeout shorter than the generation aborts the request mid-call and posts no review at all.

   It is bounded above as well as below, and the upper bound is measured rather than assumed. `CODEX_JOB_TIMEOUT_SECONDS` (default `1200`, required to equal the workflow's `timeout-minutes` — the automation test fails on drift) is the job's wall clock; the workflow stamps `CODEX_JOB_DEADLINE_EPOCH` *before checkout*, and the worker refuses a request timeout that does not fit in what is actually left, reserving `180` seconds to post the comment. Because the deadline is absolute, whatever checkout, setup and sanitization really cost is already priced in — there is no separate "setup headroom" constant to get wrong. A configured `CODEX_REQUEST_TIMEOUT` the job cannot outlive fails fast instead of being killed mid-request.

   The two bounds can conflict: if too little of the job remains to satisfy both the token floor and the posting reserve, no valid timeout exists and the run fails saying so, rather than silently honouring one bound.

   Two limits sit either side of it and neither is enforced by this variable alone. It is `urlopen`'s **socket-inactivity** timeout, not a wall-clock deadline: a response that keeps trickling bytes can outlive it, so the real ceiling is the job's `timeout-minutes` (20, deliberately above the 900s default so there is room to sanitize and post the comment after the call returns). `tests/test_codex_automation.sh` fails if that relation ever inverts. The 20s-per-1000-tokens floor is a heuristic for a reasoning model, not a measured rate — if a model or effort level generates more slowly, raise the variable rather than assume the floor protects you.
10. Optionally add `CODEX_BOT_LOGIN`. It defaults to `github-actions[bot]` and is the only comment author whose duplicate-suppression marker is honoured.
11. Optionally add `CODEX_CHECK_MAX_ITEMS` (default `50`) and `CODEX_CHECK_MAX_BYTES` (default `20000`) to bound exact-head CI evidence.
12. Optionally add `CODEX_CONTEXT_MAX_FILES` (default `10`) and `CODEX_CONTEXT_MAX_BYTES` (default `50000`) to bound trusted default-branch reference material.
13. Optionally add `CODEX_CHECK_MAX_PAGES` (default `10`) and `CODEX_CHECK_MAX_RAW_BYTES` (default `200000`) to bound the number and raw byte size of exact-head check-run API pages before evidence rendering. If a page exceeds the raw cap or is malformed, the review proceeds with an explicit unavailable-evidence note.
14. The production CI workflow identity is fixed to `ci.yml`, matching the `workflow_run` trigger; it is not a repository-variable override. Optionally add `CODEX_CI_DISCOVERY_SECONDS` (default `60`) and `CODEX_CI_DISCOVERY_POLL_SECONDS` (default `10`) for the direct-event fallback probe.
15. Set `ARBITER_AUTOPOST=1` only when the repository should allow the model-free arbiter to create or edit its per-PR disposition comment. Unset means summary-only evaluation. `ARBITER_SOFT_GATE` (default `5`), `ARBITER_HARD_CAP` (default `10`), `ARBITER_STUCK_P1_ROUNDS` (default `3`), and `ARBITER_UNVERIFIABLE_ROUNDS` (default `2`) are strict positive-integer termination controls.
16. Create the labels `codex-review` and `codex-triage` if scheduled review is wanted.

`CODEX_MODEL`, `CODEX_REASONING_EFFORT`, `CODEX_MAX_INPUT_BYTES`, `CODEX_MAX_OUTPUT_TOKENS`, `CODEX_MAX_OUTPUT_BYTES`, `CODEX_REQUEST_TIMEOUT`, `CODEX_JOB_TIMEOUT_SECONDS`, `CODEX_BOT_LOGIN`, `CODEX_CHECK_MAX_PAGES`, and `CODEX_CHECK_MAX_RAW_BYTES` are configuration, not secrets. Use `none` when selecting a model that does not support reasoning effort; this omits the reasoning parameter from the API request. Higher effort improves difficult payment/security reviews but increases latency and cost; `low` is better for high-volume scheduled triage.

The workflows are disabled at the job level until the variable is enabled. The API key is scoped only to the API worker step and is never given to a model-controlled shell, repository tool, or agent. It is never intentionally placed in the repository, PR diff, issue comment, frontend bundle, or application telemetry.

## What runs

### Pull requests

`.github/workflows/loopkeeper-pr-review.yml` is a thin caller for Loopkeeper's
reusable `pr-review-posting.yml`, pinned to the immutable release SHA
`ff1dbeb4f3eee1a45dc34ad1e02c062b93d26231` (tag `v0.1.1`). It triggers on
`pull_request_target`, on `workflow_run` completion for `CI`, and on manual
dispatch. There is no scheduled sweep: a schedule carries no pull-request
number and the reusable workflow refuses to infer one.

The reusable workflow separates trust across jobs. `eligibility` holds no model
secret and re-reads the pull request rather than trusting the event payload,
because an event is a snapshot and label state can change after it fires.
`review` runs with `LOOPKEEPER_OPERATOR=0` and read-only permissions, and
re-verifies eligibility immediately before invoking the model. Only `writer`
receives `pull-requests: write` and `LOOPKEEPER_OPERATOR=1`.

A same-repository pull request is eligible on its own. A fork is eligible only
while the `loopkeeper-approved` label is present AND the actor who applied the
currently effective label holds the `maintain` or `admin` repository role —
read from the permission endpoint's `role_name`, never the legacy `permission`
field, which collapses Maintain to `write`. Removing the label revokes
eligibility before the next model call.

Configuration: the model key is `secrets.OPENAI_API_KEY`, passed as the reusable
workflow's `model_api_key` secret. Every `LOOPKEEPER_*` repository variable is
optional and defaults inside the reusable workflow; `LOOPKEEPER_MODEL` defaults
to the same model this repository already selected for Codex. Set the
repository variable `LOOPKEEPER_REVIEW_ENABLED` to `true` to enable review;
an unset variable means off, so paid model execution is never the default. Trusted reference material is still the bounded
file list in `.github/codex/context-files.txt`, and the review policy is still
`.github/codex/review-policy.md`.

To roll back to the inlined reviewer:

```bash
gh variable set CODEX_PR_REVIEW_ENABLED --body true
gh variable set LOOPKEEPER_REVIEW_ENABLED --body false
```

Both reviewers are opt-in and both are off unless their own variable reads
exactly `true`, so neither a rollback nor a fresh clone can start paid model
execution by accident, and the two can never run at once by default.

`CODEX_REVIEW_ENABLED` is deliberately not the standby gate: it stays `true`
for issue triage, so reusing it would start both reviewers at once.

The standby inlined implementation is described below. It is accurate for that
workflow, which does not run while its gate is unset:

`.github/workflows/codex-pr-review.yml` runs normal push reviews from `workflow_run: completed` for `CI`. It checks the completed run's `head_sha`, resolves the open PR, and reviews only that exact head. `reopened`, `ready_for_review`, manual, and scheduled paths remain available without polling. `opened` and `synchronize` remain as a coverage fallback for conflicting heads whose `CI` workflow is never created; they probe for the exact-head CI run and defer with exit zero only when a matching run whose event is `pull_request` exists or appears during the discovery window. Same-head `push` or manually dispatched runs do not count, because their completion events are not accepted as review triggers. A probe error is treated as no run and reviews proceed, so a failed lookup cannot silently delete coverage. A fallback review carries a separate bot-authored no-CI marker; if the CI run is created after the fallback window, the later completion event is allowed to replace that review with exact-head evidence. Every selection path rejects closed PRs, and the arbiter rechecks the PR state before collecting or posting a disposition.

All review paths use a PR-keyed concurrency group, including workflow runs whose payload has no pull-request number. Target selection fans out into bounded per-PR review and arbiter matrices with `fail-fast: false`, so one failed or cancelled target does not suppress dispositions for the others. The trusted job checks out only the default branch, executes no PR code, downloads no CI artifacts or caches, and reads exact-head check runs only from `repos/{repo}/commits/{head_sha}/check-runs`. Check-run pages are acquired one at a time through a raw byte cap and bounded page/item budget before rendering; if a page is malformed or exceeds the raw cap, the input says verification was not available at review time. Completed checks are sanitized and passed as bounded untrusted evidence; if no completed check is visible, the same explicit unavailable-evidence wording is used. The named files in `.github/codex/context-files.txt` are a separate, bounded reference set read from `TRUSTED_SHA`; they are reference material, not policy.

Scheduled runs review only open PRs with the `codex-review` label. To rerun manually, use the workflow’s **Run workflow** button and provide the PR number. The head SHA is re-read after the diff is fetched and the run aborts if it moved, so a review can never be posted under a marker naming a commit it did not review; the push that moved the head triggers its own run. The request contains the sanitized metadata, diff, and policy. PR reviews require the complete sanitized input to fit within `CODEX_MAX_INPUT_BYTES`; an oversized diff fails rather than being silently truncated. The model does not inspect the checkout.
The workflow never supplies `--gap-issues`. The arbiter's `--post` flag is the explicit operator-gated create/update of the single `codex-arbiter:{pr}` comment; adding `--gap-issues` is a second explicit choice that permits durable `proposed-gap` issue creation. Neither path is a merge gate, automatic merge, deployment, or policy self-update.

### Issues

`.github/workflows/codex-issue-triage.yml` triages newly opened, edited, and reopened issues, issues labeled `codex-triage`, manual runs, and twice-weekly scheduled issues carrying that label. Codex posts a marked comment with classification, evidence, likely code areas, a reproduction/test plan, and the next recommended action. Title and body changes produce a new triage fingerprint.

## Trust boundary in the request

The request is split across two API channels rather than one string:

- `instructions` carries only repository-controlled text: the review or triage contract, `.github/codex/review-policy.md`, and (for triage) the `git ls-files` index. For PR review it also carries the bounded files named by the default-branch `.github/codex/context-files.txt` allowlist. Each file is read with `show_trusted` from `TRUSTED_SHA`; branch-side edits to the allowlist or files cannot enter this channel.
- `input` carries PR and issue content, each artifact enclosed in a `<<<UNTRUSTED_DATA label>>> … <<<END_UNTRUSTED_DATA label>>>` block. `scripts/codex_untrusted.py` defangs every delimiter-shaped run in the payload first, so content cannot close its own block and pose as policy. Exact-head check names and conclusions stay here as sanitized evidence: a green check reports only what that named check reported on that head; it never proves correctness or closes a finding. If evidence is genuinely unavailable, the reviewer uses schema-2 `unverifiable: {"missing": "..."}` on `NEW` or `OPEN`, never `RESOLVED`; the arbiter keeps it open, routes high severity to a human, and escalates a minor finding after the configured consecutive-round cap. The missing-artifact text is normalized to one line, bounded to 512 characters, redacted for credentials/payment data, and escaped again at both rendered output paths.

This contains review-integrity manipulation; it does not eliminate it. The worker still has no repository, shell, network, or tool access, so a successful injection can at worst distort the advisory comment a human then reads.

## Supply chain

Both Codex workflows hold `issues: write`, `pull-requests: write` and `OPENAI_API_KEY`, so every action they use is pinned to a full commit SHA rather than a mutable tag. A retagged or compromised `@v4` would otherwise hand an attacker a write-capable GitHub token and the OpenAI secret. `ci.yml` is pinned the same way: it is unprivileged and declares `permissions: contents: read`, but a compromised action there could still read the checkout and tamper with build output. `tests/test_codex_automation.sh` fails if any of the three workflows reverts to a tag.

A pin does not expire, so `.github/dependabot.yml` runs the `github-actions` ecosystem weekly: without it the pins rot and an upstream security release never reaches the repository. Dependabot opens a PR moving the SHA and updating the trailing version comment on each `uses:` line, which is what keeps the pin auditable.

## Data retention

`scripts/codex_responses.py` sends `"store": false`. Without it the Responses API retains application state — the request and response — for 30 days by default, which is not a default a payment project should inherit silently. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

`store: false` does not remove all retention. OpenAI separately retains data for abuse monitoring under its own policy and schedule, independent of this flag. If that residual retention is unacceptable for this repository, the control is an organization-level zero-data-retention agreement with OpenAI, not a request parameter.

## Duplicate suppression

Each comment carries a marker keyed to the PR head SHA or the issue title/body fingerprint. The marker is honoured **only** when the comment author is `CODEX_BOT_LOGIN`. A body-only match would let a PR author paste the marker and silence review of their own head commit; a GitHub login cannot be forged the way comment text can. `tests/test_codex_automation.sh` runs both directions against stubbed `gh` calls: a marker from a non-bot login must not suppress, and a marker from the bot login must.

## Safety boundary

Codex does not execute PR code, modify code, push branches, merge pull requests, deploy, or act as a merge gate. A review comment is not an approval. PR and issue content is sanitized before submission: `scripts/codex_sanitize.py` reuses `app/tutor/redaction.py` — the repository's established redactor for IBANs (contiguous and grouped), UETRs, account numbers, emails, and phone numbers — and adds the credential classes a GitHub payload carries: PEM key blocks, vendor API keys, `Authorization` headers under any scheme (Bearer, Basic, Token, Digest and the rest, taken to end of line because Digest spreads its credential across a parameter list), `Cookie` values, quoted secret assignments whose value contains spaces, and card-shaped numbers.

Header names are matched structurally rather than enumerated: any vendor prefix (`Proxy-`, `X-`, `X-Amz-`) and the non-standard `Authentication` spelling are covered, and a cookie's value is consumed across embedded quotes so an RFC 6265 quoted cookie cannot leave its contents behind a redaction marker. `WWW-Authenticate` is deliberately excluded — it is a server challenge, not a credential. Segment repetitions in these rules are bounded, because an unbounded one is quadratic on a long hyphenated line (a minified bundle or lockfile entry in a diff) and a hostile PR could stack those to burn the job timeout.

The exemptions below are deliberate, because the corpus is source diffs rather than learner prose. BIC/SWIFT codes are preserved: they are public directory data already committed to this repository, and collapsing them would hide the values a payment-domain review has to compare. Git metadata lines (`index …`) and numeric hunk headers (`@@ -a,b +c,d @@`) are preserved too: neither can carry a personal identifier, while source context after the closing `@@` is sanitized normally. Three numeric shapes are exempt for the same reason — each is nine-or-more digits with separators, which is the phone rule's shape, so each was reaching the reviewer labelled `[PHONE]`: ISO-8601 date/times (a migration's `Create Date`), standard references (`ISO 20022 2019`), and SVG coordinate lists (`points="20 6 9 17 4 12"`). The coordinate exemption is gated on shape rather than on the attribute name, so an account number parked inside a `points=` attribute is still redacted. The tutor path still redacts BICs unconditionally — `redact_sensitive_text` is unchanged and `redact_sensitive_text_preserving_bic` is reachable only from this code-review path.

Sanitization is defense in depth, not a guarantee; do not paste sensitive data into GitHub.

The comment is trimmed to `CODEX_MAX_OUTPUT_BYTES` by `scripts/codex_truncate.py`, which cuts on a character boundary. A byte-wise cut can split a multi-byte code point and produce a comment the GitHub API rejects or mangles. For a fix, ask Codex in a reviewed task to implement the change, or create a separate explicitly approved fix workflow later. Keep payment, sanctions, authentication, migrations, tutor policy, and sensitive-data changes human-controlled.

## Cost and operations

The integration invokes the OpenAI Responses API only after the repository variable is enabled. Duplicate suppression prevents a repeated run for the same PR head SHA or issue title/body fingerprint from creating another comment. Scheduled labels, `CODEX_MAX_ITEMS`, and `CODEX_MAX_INPUT_BYTES` are deliberate cost controls: do not label every issue or PR unless that volume is intended. Failed items are reported in the Actions step summary and fail the review job; the separate deterministic arbiter still runs for the bounded set when individual reviews fail, so successful reviews do not lose their disposition. They do not block merges unless a repository administrator explicitly makes the workflow a required check.

## Local verification

```bash
bash -n scripts/codex_review_pr.sh
bash -n scripts/codex_triage_issue.sh
bash tests/test_codex_automation.sh
.venv/bin/pytest -q tests/test_codex_sanitize.py
.venv/bin/pytest -q tests/test_codex_responses.py
.venv/bin/pytest -q tests/test_codex_untrusted.py
.venv/bin/pytest -q tests/test_codex_truncate.py
```

The normal repository CI remains the merge gate: Ruff, pytest, frontend typecheck/build/tests, and bundle checks. Codex findings supplement those checks; they do not replace them.
