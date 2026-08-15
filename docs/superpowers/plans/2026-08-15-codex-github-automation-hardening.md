# Codex GitHub Automation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Codex GitHub automation so model selection and reasoning effort are explicit, untrusted content is sanitized, the API key is not inherited by model-spawned commands, and scheduled failures are visible.

**Architecture:** Keep the pinned Codex CLI and read-only agent workflow, but pass only sanitized PR/issue artifacts to the agent and explicitly configure `shell_environment_policy` so spawned commands do not inherit secrets. Add bounded target selection and summaries to the workflows, and use deterministic helper tests for redaction and duplicate-marker behavior.

**Tech Stack:** Bash, Python standard library, GitHub Actions, Codex CLI 0.147.0, pytest.

## Global Constraints

- Never stage or modify the unrelated `tmp/` directory.
- Keep the workflows opt-in through `CODEX_REVIEW_ENABLED=true`.
- Keep repository permissions limited to read contents and write PR/issue comments.
- Do not automatically edit code, push branches, merge pull requests, or deploy.
- Default model: `gpt-5.3-codex`; default reasoning effort: `medium`.
- Supported reasoning efforts: `none`, `low`, `medium`, `high`, `xhigh`; `none` is required for models that do not support reasoning effort.

---

### Task 1: Add tested sanitization for model inputs

**Files:**
- Create: `scripts/codex_sanitize.py`
- Test: `tests/test_codex_sanitize.py`

- [ ] **Step 1: Write failing tests**

  Cover redaction of bearer/API tokens, private-key blocks, IBAN-like values, email addresses, and preservation of ordinary source text. Also assert that already-redacted text remains stable.

- [ ] **Step 2: Run the sanitizer tests and verify they fail**

  Run: `.venv/bin/pytest -q tests/test_codex_sanitize.py`

  Expected: import or behavior failures because the sanitizer does not exist yet.

- [ ] **Step 3: Implement the minimal sanitizer**

  Read UTF-8 input from stdin, apply deterministic regex replacements, write UTF-8 sanitized text to stdout, and never log the original content. Replace secret/token values, private keys, IBANs, card-like numbers in payment contexts, emails, and phone numbers with stable placeholders.

- [ ] **Step 4: Run the sanitizer tests and verify they pass**

  Run: `.venv/bin/pytest -q tests/test_codex_sanitize.py`

  Expected: all sanitizer tests pass.

### Task 2: Harden PR and issue scripts

**Files:**
- Modify: `scripts/codex_review_pr.sh`
- Modify: `scripts/codex_triage_issue.sh`

- [ ] **Step 1: Add model and effort validation tests to the shell verification command**

  Verify that both scripts contain `--model "$CODEX_MODEL"`, `model_reasoning_effort`, the sanitized-input pipeline, and file-based duplicate checks. Verify no `grep -Fq` pipeline remains.

- [ ] **Step 2: Run the verification command and capture the expected failures**

  Run: `bash tests/test_codex_automation.sh`

  Expected: fail against the current scripts because model/effort, sanitizer, and safe duplicate handling are not yet present.

- [ ] **Step 3: Implement the hardened invocation**

  Validate `CODEX_MODEL` and `CODEX_REASONING_EFFORT`, sanitize PR/issue artifacts before writing them to the Codex-readable temp files, write GitHub comments to a file before checking markers, and invoke Codex with `--model "$CODEX_MODEL"`, `-c "model_reasoning_effort=\"$CODEX_REASONING_EFFORT\""`, and `-c 'shell_environment_policy.inherit="core"'` with default secret filtering enabled.

- [ ] **Step 4: Run shell syntax and behavior checks**

  Run: `bash -n scripts/codex_review_pr.sh scripts/codex_triage_issue.sh && bash tests/test_codex_automation.sh`

  Expected: all checks pass; disabled mode remains a zero-exit no-op.

### Task 3: Harden workflow configuration and scheduling

**Files:**
- Modify: `.github/workflows/codex-pr-review.yml`
- Modify: `.github/workflows/codex-issue-triage.yml`

- [ ] **Step 1: Add workflow assertions**

  Extend `tests/test_codex_automation.sh` to require `CODEX_MODEL`, `CODEX_REASONING_EFFORT`, `CODEX_MAX_ITEMS`, step-scoped `OPENAI_API_KEY`, issue `edited`/`reopened` triggers, bounded selection, and GitHub step summaries.

- [ ] **Step 2: Run the workflow assertions and verify they fail**

  Run: `bash tests/test_codex_automation.sh`

  Expected: fail because the current workflows lack these controls.

- [ ] **Step 3: Implement the workflow changes**

  Add repository-variable defaults for model, reasoning effort, and maximum scheduled items; keep the API key only on the Codex execution step; add issue edit/reopen triggers; bound scheduled targets; and summarize selected, successful, failed, and skipped work while preserving non-blocking merge behavior.

- [ ] **Step 4: Parse and inspect the workflows**

  Run: `ruby -e 'require "yaml"; ARGV.each { |path| YAML.load_file(path); puts "parsed #{path}" }' .github/workflows/codex-pr-review.yml .github/workflows/codex-issue-triage.yml`

  Expected: both workflow files parse successfully.

### Task 4: Update documentation and verify the full repository

**Files:**
- Modify: `docs/CODEX_GITHUB_AUTOMATION.md`
- Modify: `.github/codex/review-policy.md`

- [ ] **Step 1: Document model, effort, sanitization, limits, and limitations**

  Explain that `CODEX_MODEL` and `CODEX_REASONING_EFFORT` are repository variables, give recommended values, explain `none` for non-reasoning models, and state that sanitized artifacts and environment filtering reduce but do not replace human privacy review.

- [ ] **Step 2: Run focused verification**

  Run: `.venv/bin/pytest -q tests/test_codex_sanitize.py`, `bash -n scripts/codex_review_pr.sh scripts/codex_triage_issue.sh`, `bash tests/test_codex_automation.sh`, and `git diff --check`.

  Expected: all commands pass.

- [ ] **Step 3: Run the existing backend and frontend checks**

  Run: `.venv/bin/pytest -q`, `.venv/bin/ruff check .`, and the existing frontend test/build commands.

  Expected: no regressions.

- [ ] **Step 4: Inspect the final diff**

  Run: `git diff --stat origin/main...HEAD` and `git status --short`.

  Expected: only the planned files are changed; `tmp/` remains untouched and unstaged.
