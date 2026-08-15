#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
# Resolve the interpreter itself, not a version-manager shim: the stub below
# shadows `python3` on PATH, and a shim that re-resolves through PATH would
# recurse into the stub forever.
REAL_PYTHON3="$(python3 -c 'import sys; print(sys.executable)')"

require_text() {
  local file="$1"
  local text="$2"
  if ! grep -Fq -- "$text" "$ROOT/$file"; then
    printf 'missing %s in %s\n' "$text" "$file" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

refuse_text() {
  local file="$1"
  local text="$2"
  if grep -Fq -- "$text" "$ROOT/$file"; then
    printf 'unexpected %s in %s\n' "$text" "$file" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

fail() {
  printf '%s\n' "$1" >&2
  FAILURES=$((FAILURES + 1))
}

for file in scripts/codex_review_pr.sh scripts/codex_triage_issue.sh; do
  require_text "$file" '--model "$CODEX_MODEL"'
  require_text "$file" '--reasoning-effort "$CODEX_REASONING_EFFORT"'
  require_text "$file" 'codex_responses.py'
  require_text "$file" 'CODEX_MAX_INPUT_BYTES'
  require_text "$file" '--max-output-tokens "$CODEX_MAX_OUTPUT_TOKENS"'
  require_text "$file" '--max-output-bytes "$CODEX_MAX_OUTPUT_BYTES"'
  require_text "$file" 'codex_sanitize.py'
  require_text "$file" 'codex_untrusted.py'
  require_text "$file" 'CODEX_BOT_LOGIN'
  require_text "$file" 'comments.jsonl'
  # The marker check must be author-scoped, never a bare body match.
  refuse_text "$file" "--jq '.[].body'"
done

require_text 'scripts/codex_review_pr.sh' 'review-sanitized.md'
require_text 'scripts/codex_review_pr.sh' 'review-input.md'
require_text 'scripts/codex_review_pr.sh' '--instructions "$TEMP_DIR/review-instructions.md"'
require_text 'scripts/codex_triage_issue.sh' 'triage-sanitized.md'
require_text 'scripts/codex_triage_issue.sh' 'triage-input.md'
require_text 'scripts/codex_triage_issue.sh' '--instructions "$TEMP_DIR/triage-instructions.md"'
require_text 'scripts/codex_responses.py' 'https://api.openai.com/v1/responses'
require_text 'scripts/codex_responses.py' '"store": False'

for file in .github/workflows/codex-pr-review.yml .github/workflows/codex-issue-triage.yml; do
  require_text "$file" 'CODEX_MODEL:'
  require_text "$file" 'CODEX_REASONING_EFFORT:'
  require_text "$file" 'CODEX_MAX_ITEMS:'
  require_text "$file" 'CODEX_MAX_OUTPUT_TOKENS:'
  require_text "$file" 'CODEX_MAX_OUTPUT_BYTES:'
  require_text "$file" 'CODEX_BOT_LOGIN:'
  require_text "$file" 'GITHUB_STEP_SUMMARY'
done

require_text '.github/workflows/codex-issue-triage.yml' 'types: [opened, edited, labeled, reopened]'

if grep -Fq 'printf '\''%s\n'\'' "$METADATA" >"$TEMP_DIR/metadata.json"' "$ROOT/scripts/codex_review_pr.sh"; then
  fail 'PR script still writes unsanitized metadata.'
fi

if grep -REn 'codex exec|continue-on-error: true' "$ROOT/scripts/codex_review_pr.sh" "$ROOT/scripts/codex_triage_issue.sh" "$ROOT/.github/workflows/codex-pr-review.yml" "$ROOT/.github/workflows/codex-issue-triage.yml"; then
  fail 'Codex automation still uses the shell-capable CLI or hides failures.'
fi

# ---------------------------------------------------------------------------
# Marker-suppression regression: a marker posted by anyone other than the bot
# must not stop the automation from reviewing or triaging.
# ---------------------------------------------------------------------------

STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

cat >"$STUB_DIR/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  pr|issue)
    case "${2:-}" in
      view) cat "$CODEX_STUB_DIR/metadata.json" ;;
      diff) cat "$CODEX_STUB_DIR/pr.diff" ;;
      comment) printf 'posted\n' >>"$CODEX_STUB_DIR/posted.log" ;;
      *) exit 1 ;;
    esac
    ;;
  api) cat "$CODEX_STUB_DIR/comments.jsonl" ;;
  *) exit 1 ;;
esac
STUB

cat >"$STUB_DIR/python3" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
for arg in "$@"; do
  if [[ "$arg" == *codex_responses.py ]]; then
    out=""
    prev=""
    for candidate in "$@"; do
      [[ "$prev" == "--output" ]] && out="$candidate"
      prev="$candidate"
    done
    printf 'stub review\n' >"$out"
    exit 0
  fi
done
exec "$CODEX_REAL_PYTHON3" "$@"
STUB

chmod +x "$STUB_DIR/gh" "$STUB_DIR/python3"

# The triage script fingerprints with sha256sum, which is GNU-only. Shim it so
# the regression test runs on a developer machine as well as in CI.
if ! command -v sha256sum >/dev/null 2>&1; then
  printf '#!/usr/bin/env bash\nexec shasum -a 256\n' >"$STUB_DIR/sha256sum"
  chmod +x "$STUB_DIR/sha256sum"
fi

run_suppression_case() {
  local script="$1"
  local number="$2"
  local marker="$3"
  local login="$4"

  : >"$STUB_DIR/posted.log"
  printf '%s\n' "$(jq -n --arg login "$login" --arg marker "$marker" \
    '{login: $login, body: ($marker + "\n\nprior comment")}')" >"$STUB_DIR/comments.jsonl"

  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=6000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/$script" "$number" >/dev/null 2>&1

  [[ -s "$STUB_DIR/posted.log" ]]
}

printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"

jq -n '{number: 15, title: "t", body: "b", url: "u", baseRefName: "main",
        headRefName: "topic", headRefOid: "deadbeef"}' >"$STUB_DIR/metadata.json"
PR_MARKER='<!-- codex-pr-review:15:deadbeef -->'

if ! run_suppression_case scripts/codex_review_pr.sh 15 "$PR_MARKER" "pr-author"; then
  fail 'A non-bot comment carrying the marker suppressed the PR review.'
fi
if run_suppression_case scripts/codex_review_pr.sh 15 "$PR_MARKER" 'github-actions[bot]'; then
  fail 'A bot comment carrying the marker failed to suppress a duplicate PR review.'
fi

jq -n '{number: 21, title: "t", body: "b", url: "u", state: "OPEN", labels: [],
        author: {login: "reporter"}, createdAt: "2026-08-15T00:00:00Z",
        updatedAt: "2026-08-15T00:00:00Z"}' >"$STUB_DIR/metadata.json"
ISSUE_FINGERPRINT="$(jq -cn '{title: "t", body: "b"}' | PATH="$STUB_DIR:$PATH" sha256sum | cut -d' ' -f1)"
ISSUE_MARKER="<!-- codex-issue-triage:21:${ISSUE_FINGERPRINT} -->"

if ! run_suppression_case scripts/codex_triage_issue.sh 21 "$ISSUE_MARKER" "issue-author"; then
  fail 'A non-bot comment carrying the marker suppressed the issue triage.'
fi
if run_suppression_case scripts/codex_triage_issue.sh 21 "$ISSUE_MARKER" 'github-actions[bot]'; then
  fail 'A bot comment carrying the marker failed to suppress a duplicate issue triage.'
fi

if (( FAILURES > 0 )); then
  printf '%d Codex automation assertions failed.\n' "$FAILURES" >&2
  exit 1
fi

echo 'Codex automation assertions passed.'
