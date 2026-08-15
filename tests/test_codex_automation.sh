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
  require_text "$file" 'codex_truncate.py'
  # The marker check must be author-scoped, never a bare body match.
  refuse_text "$file" "--jq '.[].body'"
  # Byte-wise truncation can split a multi-byte character.
  refuse_text "$file" 'head -c'
done

require_text 'scripts/codex_review_pr.sh' 'CURRENT_SHA'

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
  # These workflows hold issues:write, pull-requests:write and OPENAI_API_KEY.
  # A mutable tag hands all three to whoever retags it upstream.
  require_text "$file" 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262'
  require_text "$file" 'actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065'
  refuse_text "$file" 'actions/checkout@v'
  refuse_text "$file" 'actions/setup-python@v'
done

require_text '.github/workflows/codex-issue-triage.yml' 'types: [opened, edited, labeled, reopened]'

# ci.yml is unprivileged, but a mutable tag there still lets a compromised
# action read the checkout and tamper with build output. Pinned for the same
# reason, and Dependabot is what keeps every pin in the repository from rotting.
for action in 'actions/checkout@v' 'actions/setup-python@v' 'actions/setup-node@v'; do
  refuse_text '.github/workflows/ci.yml' "$action"
done
require_text '.github/workflows/ci.yml' 'permissions:'
require_text '.github/dependabot.yml' 'package-ecosystem: github-actions'

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

# gh applies --jq to its own output; the stub has to do the same, or a caller
# asking for a single field gets the whole document back.
apply_jq() {
  local expression=""
  local previous=""
  for argument in "$@"; do
    [[ "$previous" == "--jq" ]] && expression="$argument"
    previous="$argument"
  done
  if [[ -n "$expression" ]]; then
    jq -r "$expression"
  else
    cat
  fi
}

case "${1:-}" in
  pr|issue)
    case "${2:-}" in
      view)
        # head-override simulates a push landing mid-run: the re-read of
        # headRefOid returns a different SHA than the initial metadata read.
        if [[ -s "$CODEX_STUB_DIR/head-override" && "$*" == *--jq* ]]; then
          cat "$CODEX_STUB_DIR/head-override"
        else
          apply_jq "$@" <"$CODEX_STUB_DIR/metadata.json"
        fi
        ;;
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
    if [[ -n "${CODEX_STUB_FINAL_HEAD:-}" ]]; then
      printf '%s\n' "$CODEX_STUB_FINAL_HEAD" >"$CODEX_STUB_DIR/head-override"
    fi
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
  : >"$STUB_DIR/head-override"
  printf '%s\n' "$(jq -n --arg login "$login" --arg marker "$marker" \
    '{login: $login, body: ($marker + "\n\nprior comment")}')" >"$STUB_DIR/comments.jsonl"

  # The script's own exit status is kept separate from the suppression signal.
  # An empty posted.log only means "suppressed" when the script succeeded;
  # otherwise the run failed for an unrelated reason and that reason is what
  # the developer needs to see.
  local status=0
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
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/$script" "$number" >"$STUB_DIR/run.log" 2>&1 || status=$?

  if (( status != 0 )); then
    printf '%s exited %d for #%s; this is not a suppression result:\n' \
      "$script" "$status" "$number" >&2
    cat "$STUB_DIR/run.log" >&2
    return 2
  fi

  [[ -s "$STUB_DIR/posted.log" ]]
}

# Exit 0 = posted, 1 = suppressed, 2 = the script failed for another reason.
expect_posted() {
  local message="$1"
  shift
  run_suppression_case "$@"
  case $? in
    0) ;;
    1) fail "$message" ;;
    *) fail "Suppression case could not be evaluated: $message" ;;
  esac
}

expect_suppressed() {
  local message="$1"
  shift
  run_suppression_case "$@"
  case $? in
    1) ;;
    0) fail "$message" ;;
    *) fail "Suppression case could not be evaluated: $message" ;;
  esac
}

printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"

jq -n '{number: 15, title: "t", body: "b", url: "u", baseRefName: "main",
        headRefName: "topic", headRefOid: "deadbeef"}' >"$STUB_DIR/metadata.json"
PR_MARKER='<!-- codex-pr-review:15:deadbeef -->'

expect_posted 'A non-bot comment carrying the marker suppressed the PR review.' \
  scripts/codex_review_pr.sh 15 "$PR_MARKER" "pr-author"
expect_suppressed 'A bot comment carrying the marker failed to suppress a duplicate PR review.' \
  scripts/codex_review_pr.sh 15 "$PR_MARKER" 'github-actions[bot]'

# A push landing mid-run must not produce a review of the new head posted under
# a marker naming the old one.
: >"$STUB_DIR/posted.log"
printf '%s\n' "$(jq -n --arg marker "$PR_MARKER" '{login: "pr-author", body: $marker}')" \
  >"$STUB_DIR/comments.jsonl"
printf 'cafebabe\n' >"$STUB_DIR/head-override"
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
  CODEX_MAX_OUTPUT_TOKENS=32000 \
  CODEX_MAX_OUTPUT_BYTES=50000 \
  CODEX_BOT_LOGIN='github-actions[bot]' \
  "$ROOT/scripts/codex_review_pr.sh" 15 >"$STUB_DIR/run.log" 2>&1 || fail 'Head-moved run exited non-zero.'
if [[ -s "$STUB_DIR/posted.log" ]]; then
  fail 'A review was posted under the old head SHA after the PR head moved mid-run.'
fi
: >"$STUB_DIR/head-override"
env \
  PATH="$STUB_DIR:$PATH" \
  CODEX_STUB_DIR="$STUB_DIR" \
  CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
  CODEX_STUB_FINAL_HEAD=cafebabe \
  CODEX_REVIEW_ENABLED=true \
  OPENAI_API_KEY=stub-key \
  GH_TOKEN=stub-token \
  GH_REPO=nifabulous/Relay \
  CODEX_MODEL=gpt-5.3-codex \
  CODEX_REASONING_EFFORT=medium \
  CODEX_MAX_INPUT_BYTES=120000 \
  CODEX_MAX_OUTPUT_TOKENS=32000 \
  CODEX_MAX_OUTPUT_BYTES=50000 \
  CODEX_BOT_LOGIN='github-actions[bot]' \
  "$ROOT/scripts/codex_review_pr.sh" 15 >"$STUB_DIR/run.log" 2>&1 || fail 'Late head-moved run exited non-zero.'
if [[ -s "$STUB_DIR/posted.log" ]]; then
  fail 'A review was posted after the PR head moved during model generation.'
fi

jq -n '{number: 21, title: "t", body: "b", url: "u", state: "OPEN", labels: [],
        author: {login: "reporter"}, createdAt: "2026-08-15T00:00:00Z",
        updatedAt: "2026-08-15T00:00:00Z"}' >"$STUB_DIR/metadata.json"
ISSUE_FINGERPRINT="$(jq -cn '{title: "t", body: "b"}' | PATH="$STUB_DIR:$PATH" sha256sum | cut -d' ' -f1)"
ISSUE_MARKER="<!-- codex-issue-triage:21:${ISSUE_FINGERPRINT} -->"

expect_posted 'A non-bot comment carrying the marker suppressed the issue triage.' \
  scripts/codex_triage_issue.sh 21 "$ISSUE_MARKER" "issue-author"
expect_suppressed 'A bot comment carrying the marker failed to suppress a duplicate issue triage.' \
  scripts/codex_triage_issue.sh 21 "$ISSUE_MARKER" 'github-actions[bot]'

if (( FAILURES > 0 )); then
  printf '%d Codex automation assertions failed.\n' "$FAILURES" >&2
  exit 1
fi

echo 'Codex automation assertions passed.'
