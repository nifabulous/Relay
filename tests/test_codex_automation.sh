#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0

require_text() {
  local file="$1"
  local text="$2"
  if ! grep -Fq -- "$text" "$ROOT/$file"; then
    printf 'missing %s in %s\n' "$text" "$file" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

for file in scripts/codex_review_pr.sh scripts/codex_triage_issue.sh; do
  require_text "$file" '--model "$CODEX_MODEL"'
  require_text "$file" '--reasoning-effort "$CODEX_REASONING_EFFORT"'
  require_text "$file" 'codex_responses.py'
  require_text "$file" 'CODEX_MAX_INPUT_BYTES'
  require_text "$file" 'codex_sanitize.py'
  require_text "$file" 'comments.txt'
done

require_text 'scripts/codex_review_pr.sh' 'review-sanitized.md'
require_text 'scripts/codex_review_pr.sh' 'review-input.md'
require_text 'scripts/codex_triage_issue.sh' 'triage-sanitized.md'
require_text 'scripts/codex_triage_issue.sh' 'triage-input.md'
require_text 'scripts/codex_responses.py' 'https://api.openai.com/v1/responses'

for file in .github/workflows/codex-pr-review.yml .github/workflows/codex-issue-triage.yml; do
  require_text "$file" 'CODEX_MODEL:'
  require_text "$file" 'CODEX_REASONING_EFFORT:'
  require_text "$file" 'CODEX_MAX_ITEMS:'
  require_text "$file" 'GITHUB_STEP_SUMMARY'
done

require_text '.github/workflows/codex-issue-triage.yml' 'types: [opened, edited, labeled, reopened]'

if grep -Fq 'printf '\''%s\n'\'' "$METADATA" >"$TEMP_DIR/metadata.json"' "$ROOT/scripts/codex_review_pr.sh"; then
  echo 'PR script still writes unsanitized metadata.' >&2
  FAILURES=$((FAILURES + 1))
fi

if rg -n 'codex exec|continue-on-error: true' "$ROOT/scripts/codex_review_pr.sh" "$ROOT/scripts/codex_triage_issue.sh" "$ROOT/.github/workflows/codex-pr-review.yml" "$ROOT/.github/workflows/codex-issue-triage.yml"; then
  echo 'Codex automation still uses the shell-capable CLI or hides failures.' >&2
  FAILURES=$((FAILURES + 1))
fi

if (( FAILURES > 0 )); then
  printf '%d Codex automation assertions failed.\n' "$FAILURES" >&2
  exit 1
fi

echo 'Codex automation assertions passed.'
