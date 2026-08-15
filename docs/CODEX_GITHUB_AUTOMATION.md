# Codex GitHub Automation

Relay has opt-in Codex workflows for pull-request review and GitHub issue triage.

## Enable it

In the repository settings:

1. Add an Actions secret named `OPENAI_API_KEY`.
2. Add a repository Actions variable named `CODEX_REVIEW_ENABLED` with the value `true`.
3. Create the labels `codex-review` and `codex-triage` if scheduled review is wanted.

The workflows are intentionally disabled until the variable is enabled. The API key is used only by the GitHub-hosted workflow and is never placed in the repository, PR diff, issue comment, frontend bundle, or application telemetry.

## What runs

### Pull requests

`.github/workflows/codex-pr-review.yml` runs on PR open, update, reopen, ready-for-review, manual dispatch, and weekday schedule. PR events use `pull_request_target`, check out only the trusted default branch, and fetch the PR diff through the GitHub API. Codex runs read-only and posts one marked review comment per PR head commit.

Scheduled runs review only open PRs with the `codex-review` label. To rerun manually, use the workflow’s **Run workflow** button and provide the PR number.

### Issues

`.github/workflows/codex-issue-triage.yml` triages newly opened issues, issues labeled `codex-triage`, manual runs, and twice-weekly scheduled issues carrying that label. Codex posts a marked comment with classification, evidence, likely code areas, a reproduction/test plan, and the next recommended action.

## Safety boundary

Codex does not modify code, push branches, merge pull requests, or deploy. A review comment is not an approval. For a fix, ask Codex in a reviewed task to implement the change, or create a separate explicitly approved fix workflow later. Keep payment, sanctions, authentication, migrations, tutor policy, and sensitive-data changes human-controlled.

## Cost and operations

The integration invokes Codex only after the repository variable is enabled. Duplicate suppression prevents a repeated run for the same PR head SHA or issue-body hash from creating another comment. Scheduled labels are deliberate cost controls: do not label every issue or PR unless that volume is intended.

## Local verification

```bash
bash -n scripts/codex_review_pr.sh
bash -n scripts/codex_triage_issue.sh
```

The normal repository CI remains the merge gate: Ruff, pytest, frontend typecheck/build/tests, and bundle checks. Codex findings supplement those checks; they do not replace them.
