# Codex GitHub Automation

Relay has opt-in Codex workflows for pull-request review and GitHub issue triage.

## Enable it

In the repository settings:

1. Add an Actions secret named `OPENAI_API_KEY`.
2. Add a repository Actions variable named `CODEX_REVIEW_ENABLED` with the value `true`.
3. Optionally add `CODEX_MODEL` as a repository variable. It defaults to `gpt-5.3-codex`.
4. Optionally add `CODEX_REASONING_EFFORT`. It defaults to `medium` and accepts `none`, `low`, `medium`, `high`, or `xhigh`.
5. Optionally add `CODEX_MAX_ITEMS`. It defaults to `10` scheduled items per workflow run.
6. Optionally add `CODEX_MAX_INPUT_BYTES`. It defaults to `120000` bytes per review or triage request. It is one budget for the whole request: the trusted instructions are drawn first and the untrusted payload receives the remainder.
7. Optionally add `CODEX_MAX_OUTPUT_TOKENS`. It defaults to `32000` and is sent to the API as `max_output_tokens`, so it caps generation cost and latency rather than only trimming the reply afterwards. On a reasoning model this budget covers reasoning tokens as well as the visible reply, so it must stay well above the reasoning reserve; a value that starves the reply produces an `incomplete` response instead of a review.
8. Optionally add `CODEX_MAX_OUTPUT_BYTES`. It defaults to `50000`. A response larger than this is rejected before it is written or posted. It must be reachable within `CODEX_MAX_OUTPUT_TOKENS` (four bytes per token); an unreachable ceiling is refused at startup so raising one cap forces a decision about the other.
9. Optionally add `CODEX_REQUEST_TIMEOUT`. It defaults to `900` seconds. It must cover the generation `CODEX_MAX_OUTPUT_TOKENS` allows — roughly 20 seconds per 1000 tokens — and the script refuses a pair that cannot, so raising the token cap forces a decision about the timeout. A timeout shorter than the generation aborts the request mid-call and posts no review at all.

   Two limits sit either side of it and neither is enforced by this variable alone. It is `urlopen`'s **socket-inactivity** timeout, not a wall-clock deadline: a response that keeps trickling bytes can outlive it, so the real ceiling is the job's `timeout-minutes` (20, deliberately above the 900s default so there is room to sanitize and post the comment after the call returns). `tests/test_codex_automation.sh` fails if that relation ever inverts. The 20s-per-1000-tokens floor is a heuristic for a reasoning model, not a measured rate — if a model or effort level generates more slowly, raise the variable rather than assume the floor protects you.
10. Optionally add `CODEX_BOT_LOGIN`. It defaults to `github-actions[bot]` and is the only comment author whose duplicate-suppression marker is honoured.
11. Create the labels `codex-review` and `codex-triage` if scheduled review is wanted.

`CODEX_MODEL`, `CODEX_REASONING_EFFORT`, `CODEX_MAX_INPUT_BYTES`, `CODEX_MAX_OUTPUT_TOKENS`, `CODEX_MAX_OUTPUT_BYTES`, `CODEX_REQUEST_TIMEOUT`, and `CODEX_BOT_LOGIN` are configuration, not secrets. Use `none` when selecting a model that does not support reasoning effort; this omits the reasoning parameter from the API request. Higher effort improves difficult payment/security reviews but increases latency and cost; `low` is better for high-volume scheduled triage.

The workflows are disabled at the job level until the variable is enabled. The API key is scoped only to the API worker step and is never given to a model-controlled shell, repository tool, or agent. It is never intentionally placed in the repository, PR diff, issue comment, frontend bundle, or application telemetry.

## What runs

### Pull requests

`.github/workflows/codex-pr-review.yml` runs on PR open, update, reopen, ready-for-review, manual dispatch, and weekday schedule. PR events use `pull_request_target`, check out only the trusted default branch, and fetch a sanitized PR diff through the GitHub API. Codex runs read-only with the configured model and reasoning effort, then posts one marked review comment per PR head commit.

Scheduled runs review only open PRs with the `codex-review` label. To rerun manually, use the workflow’s **Run workflow** button and provide the PR number. The head SHA is re-read after the diff is fetched and the run aborts if it moved, so a review can never be posted under a marker naming a commit it did not review; the push that moved the head triggers its own run. The request contains the sanitized metadata, diff, policy, and is bounded by `CODEX_MAX_INPUT_BYTES`; it does not permit the model to inspect the checkout.

### Issues

`.github/workflows/codex-issue-triage.yml` triages newly opened, edited, and reopened issues, issues labeled `codex-triage`, manual runs, and twice-weekly scheduled issues carrying that label. Codex posts a marked comment with classification, evidence, likely code areas, a reproduction/test plan, and the next recommended action. Title and body changes produce a new triage fingerprint.

## Trust boundary in the request

The request is split across two API channels rather than one string:

- `instructions` carries only repository-controlled text: the review or triage contract, `.github/codex/review-policy.md`, and (for triage) the `git ls-files` index.
- `input` carries PR and issue content, each artifact enclosed in a `<<<UNTRUSTED_DATA label>>> … <<<END_UNTRUSTED_DATA label>>>` block. `scripts/codex_untrusted.py` defangs every delimiter-shaped run in the payload first, so content cannot close its own block and pose as policy. The contract tells the model to treat an in-block instruction attempt as a finding to report, not an instruction to follow.

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

Codex does not modify code, push branches, merge pull requests, or deploy. A review comment is not an approval. PR and issue content is sanitized before submission: `scripts/codex_sanitize.py` reuses `app/tutor/redaction.py` — the repository's established redactor for IBANs (contiguous and grouped), UETRs, account numbers, emails, and phone numbers — and adds the credential classes a GitHub payload carries: PEM key blocks, vendor API keys, `Authorization` headers under any scheme (Bearer, Basic, Token, Digest and the rest, taken to end of line because Digest spreads its credential across a parameter list), `Cookie` values, quoted secret assignments whose value contains spaces, and card-shaped numbers.

Header names are matched structurally rather than enumerated: any vendor prefix (`Proxy-`, `X-`, `X-Amz-`) and the non-standard `Authentication` spelling are covered, and a cookie's value is consumed across embedded quotes so an RFC 6265 quoted cookie cannot leave its contents behind a redaction marker. `WWW-Authenticate` is deliberately excluded — it is a server challenge, not a credential. Segment repetitions in these rules are bounded, because an unbounded one is quadratic on a long hyphenated line (a minified bundle or lockfile entry in a diff) and a hostile PR could stack those to burn the job timeout.

The exemptions below are deliberate, because the corpus is source diffs rather than learner prose. BIC/SWIFT codes are preserved: they are public directory data already committed to this repository, and collapsing them would hide the values a payment-domain review has to compare. Git metadata lines (`index …`) and numeric hunk headers (`@@ -a,b +c,d @@`) are preserved too: neither can carry a personal identifier, while source context after the closing `@@` is sanitized normally. Three numeric shapes are exempt for the same reason — each is nine-or-more digits with separators, which is the phone rule's shape, so each was reaching the reviewer labelled `[PHONE]`: ISO-8601 date/times (a migration's `Create Date`), standard references (`ISO 20022 2019`), and SVG coordinate lists (`points="20 6 9 17 4 12"`). The coordinate exemption is gated on shape rather than on the attribute name, so an account number parked inside a `points=` attribute is still redacted. The tutor path still redacts BICs unconditionally — `redact_sensitive_text` is unchanged and `redact_sensitive_text_preserving_bic` is reachable only from this code-review path.

Sanitization is defense in depth, not a guarantee; do not paste sensitive data into GitHub.

The comment is trimmed to `CODEX_MAX_OUTPUT_BYTES` by `scripts/codex_truncate.py`, which cuts on a character boundary. A byte-wise cut can split a multi-byte code point and produce a comment the GitHub API rejects or mangles. For a fix, ask Codex in a reviewed task to implement the change, or create a separate explicitly approved fix workflow later. Keep payment, sanctions, authentication, migrations, tutor policy, and sensitive-data changes human-controlled.

## Cost and operations

The integration invokes the OpenAI Responses API only after the repository variable is enabled. Duplicate suppression prevents a repeated run for the same PR head SHA or issue title/body fingerprint from creating another comment. Scheduled labels, `CODEX_MAX_ITEMS`, and `CODEX_MAX_INPUT_BYTES` are deliberate cost controls: do not label every issue or PR unless that volume is intended. Failed items are reported in the Actions step summary and fail the automation job; they do not block merges unless a repository administrator explicitly makes the workflow a required check.

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
