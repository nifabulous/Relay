# Codex GitHub Automation

Relay has opt-in Codex workflows for pull-request review and GitHub issue triage.

## Enable it

In the repository settings:

1. Add an Actions secret named `OPENAI_API_KEY`.
2. Add a repository Actions variable named `CODEX_REVIEW_ENABLED` with the value `true`.
3. Optionally add `CODEX_MODEL` as a repository variable. It defaults to `gpt-5.3-codex`.
4. Optionally add `CODEX_REASONING_EFFORT`. It defaults to `medium` and accepts `none`, `low`, `medium`, `high`, or `xhigh`.
5. Optionally add `CODEX_MAX_ITEMS`. It defaults to `10` scheduled items per workflow run.
6. Optionally add `CODEX_MAX_INPUT_BYTES`. It defaults to `120000` bytes per review or triage request.
7. Create the labels `codex-review` and `codex-triage` if scheduled review is wanted.

`CODEX_MODEL`, `CODEX_REASONING_EFFORT`, and `CODEX_MAX_INPUT_BYTES` are configuration, not secrets. Use `none` when selecting a model that does not support reasoning effort; this omits the reasoning parameter from the API request. Higher effort improves difficult payment/security reviews but increases latency and cost; `low` is better for high-volume scheduled triage.

The workflows are disabled at the job level until the variable is enabled. The API key is scoped only to the API worker step and is never given to a model-controlled shell, repository tool, or agent. It is never intentionally placed in the repository, PR diff, issue comment, frontend bundle, or application telemetry.

## What runs

### Pull requests

`.github/workflows/codex-pr-review.yml` runs on PR open, update, reopen, ready-for-review, manual dispatch, and weekday schedule. PR events use `pull_request_target`, check out only the trusted default branch, and fetch a sanitized PR diff through the GitHub API. Codex runs read-only with the configured model and reasoning effort, then posts one marked review comment per PR head commit.

Scheduled runs review only open PRs with the `codex-review` label. To rerun manually, use the workflow’s **Run workflow** button and provide the PR number. The request contains the sanitized metadata, diff, policy, and is bounded by `CODEX_MAX_INPUT_BYTES`; it does not permit the model to inspect the checkout.

### Issues

`.github/workflows/codex-issue-triage.yml` triages newly opened, edited, and reopened issues, issues labeled `codex-triage`, manual runs, and twice-weekly scheduled issues carrying that label. Codex posts a marked comment with classification, evidence, likely code areas, a reproduction/test plan, and the next recommended action. Title and body changes produce a new triage fingerprint.

## Safety boundary

Codex does not modify code, push branches, merge pull requests, or deploy. A review comment is not an approval. PR and issue content is sanitized for common secrets and personal identifiers before submission, but sanitization is defense in depth, not a guarantee; do not paste sensitive data into GitHub. For a fix, ask Codex in a reviewed task to implement the change, or create a separate explicitly approved fix workflow later. Keep payment, sanctions, authentication, migrations, tutor policy, and sensitive-data changes human-controlled.

## Cost and operations

The integration invokes the OpenAI Responses API only after the repository variable is enabled. Duplicate suppression prevents a repeated run for the same PR head SHA or issue title/body fingerprint from creating another comment. Scheduled labels, `CODEX_MAX_ITEMS`, and `CODEX_MAX_INPUT_BYTES` are deliberate cost controls: do not label every issue or PR unless that volume is intended. Failed items are reported in the Actions step summary and fail the automation job; they do not block merges unless a repository administrator explicitly makes the workflow a required check.

## Local verification

```bash
bash -n scripts/codex_review_pr.sh
bash -n scripts/codex_triage_issue.sh
bash tests/test_codex_automation.sh
.venv/bin/pytest -q tests/test_codex_sanitize.py
.venv/bin/pytest -q tests/test_codex_responses.py
```

The normal repository CI remains the merge gate: Ruff, pytest, frontend typecheck/build/tests, and bundle checks. Codex findings supplement those checks; they do not replace them.
