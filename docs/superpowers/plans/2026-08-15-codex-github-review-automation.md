# Codex GitHub Review Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Relay’s GitHub repository to Codex for opt-in automatic pull-request reviews and issue triage, while keeping all code changes as human-reviewed work.

**Architecture:** GitHub Actions runs only on trusted `pull_request_target`, `issues`, scheduled, or manual events and checks out the default branch, never an untrusted PR branch. Small repository scripts collect PR/issue context with GitHub CLI, invoke a pinned Codex CLI in read-only mode, and publish a marked review/triage comment. An explicit repository variable enables the integration, and a human remains responsible for merge and deployment.

**Tech Stack:** GitHub Actions, GitHub CLI, pinned `@openai/codex` CLI, Bash, Python/TypeScript repository test commands.

## Global Constraints

- Codex must run in read-only mode for PR review and issue triage.
- PR review must use `pull_request_target` without checking out or executing PR head code.
- The workflows must be opt-in through `CODEX_REVIEW_ENABLED=true` and the `OPENAI_API_KEY` secret.
- The workflows may comment and read repository data, but must not merge, deploy, or push code.
- Prompts must treat PR and issue text as untrusted input and must not request or reproduce secrets, payment data, sanctions data, customer data, or tutor transcripts.
- Scheduled review must process only PRs/issues carrying the explicit `codex-review` or `codex-triage` label.
- Re-running the same review for the same commit/issue state must not create duplicate comments.

---

### Task 1: Add the Codex review contract

**Files:**
- Create: `.github/codex/review-policy.md`
- Create: `docs/CODEX_GITHUB_AUTOMATION.md`

**Interfaces:**
- Consumes: Relay’s existing repository guidance, test commands, and sensitive-domain boundaries.
- Produces: The review rubric and operator setup instructions used by the workflows and humans.

- [ ] **Step 1: Write the review rubric**

  Include severity definitions, required review dimensions (correctness, security, privacy, accessibility, regressions, tests, performance), and Relay-specific forbidden data handling.

- [ ] **Step 2: Write the operator guide**

  Document the required GitHub secret, repository variable, labels, workflow triggers, manual reruns, comment markers, and the rule that Codex comments are advisory until a human verifies them.

- [ ] **Step 3: Check the documents**

  Run: `git diff --check`

  Expected: no whitespace errors.

### Task 2: Implement read-only PR review

**Files:**
- Create: `scripts/codex_review_pr.sh`
- Create: `.github/workflows/codex-pr-review.yml`

**Interfaces:**
- Consumes: A PR number, `GH_TOKEN`, `OPENAI_API_KEY`, and the trusted default-branch checkout.
- Produces: One marked GitHub PR comment containing Codex’s findings, or no comment when disabled/already reviewed.

- [ ] **Step 1: Define the script contract**

  The script must accept exactly one PR number, fetch metadata/diff with `gh`, write a temporary diff outside the repository, run `codex exec --sandbox read-only`, and post one comment whose marker contains the PR head SHA.

- [ ] **Step 2: Add duplicate suppression**

  Query existing PR comments through `gh api`; skip posting if the marker for the same head SHA already exists.

- [ ] **Step 3: Add the PR workflow**

  Trigger on PR opened, synchronized, reopened, ready-for-review, manual dispatch, and a weekday schedule. Use `pull_request_target`, minimal permissions, concurrency per PR, an opt-in variable, a pinned Codex CLI version, and no PR-head checkout.

- [ ] **Step 4: Validate the shell contract**

  Run: `bash -n scripts/codex_review_pr.sh`

  Expected: exit 0.

### Task 3: Implement issue triage

**Files:**
- Create: `scripts/codex_triage_issue.sh`
- Create: `.github/workflows/codex-issue-triage.yml`

**Interfaces:**
- Consumes: An issue number, `GH_TOKEN`, `OPENAI_API_KEY`, and the trusted default-branch checkout.
- Produces: One marked issue comment with a summary, severity, suspected area, reproduction/test plan, and recommended next action.

- [ ] **Step 1: Define the issue script contract**

  The script must accept exactly one issue number, fetch issue metadata with `gh`, run Codex read-only, and post one marker-bearing comment while treating issue content as untrusted instructions.

- [ ] **Step 2: Add duplicate suppression**

  Skip triage when the same issue body hash is already present in an existing marker.

- [ ] **Step 3: Add the issue workflow**

  Trigger on newly opened issues, the `codex-triage` label, manual dispatch, and a twice-weekly schedule limited to open issues with that label. Grant only issue-comment and contents-read permissions.

- [ ] **Step 4: Validate the shell contract**

  Run: `bash -n scripts/codex_triage_issue.sh`

  Expected: exit 0.

### Task 4: Verify the integration and publish

**Files:**
- Modify: none beyond Tasks 1–3.

**Interfaces:**
- Consumes: The two workflows, two scripts, policy, and operator guide.
- Produces: A clean, reviewable PR targeting `main`; no automatic merge or deployment.

- [ ] **Step 1: Validate workflow structure and permissions**

  Run: `python - <<'PY' ...` with a dependency-free assertion script that checks both workflow files contain the required events, permissions, opt-in variable, pinned Codex version, and `pull_request_target` without `actions/checkout` using `ref: ${{ github.event.pull_request.head.sha }}`.

  Expected: all assertions pass.

- [ ] **Step 2: Run repository verification**

  Run: `.venv/bin/ruff check .`, `.venv/bin/pytest -q`, `npm run build`, and `npm test -- --no-file-parallelism` from `frontend/` with the repository’s Node runtime.

  Expected: existing suites pass; generated build output remains ignored.

- [ ] **Step 3: Review the final diff**

  Run: `git diff --check`, `git diff --stat origin/main`, and `git status --short`.

  Expected: only the planned files are staged; unrelated `tmp/` remains untouched.

- [ ] **Step 4: Commit, push, and open a draft PR**

  Use an explicit file list, commit with `feat: add Codex GitHub review automation`, push a new branch, and open a draft PR targeting `main` with setup and verification notes.
