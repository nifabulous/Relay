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

# Every `uses:` in a workflow, not a list of names to look for. An allowlist
# only guards the actions someone remembered to enumerate, so the first action
# added under a new name lands unpinned with CI still green.
action_references() {
  grep -hE '^[[:space:]]*(-[[:space:]]*)?uses:' "$@" || true
}

require_every_action_pinned() {
  local file="$1"
  local line ref
  while IFS= read -r line; do
    ref="${line#*uses:}"
    ref="${ref%%#*}"
    ref="${ref//[[:space:]]/}"
    ref="${ref//\"/}"
    ref="${ref//\'/}"
    # A local composite action or reusable workflow ships with this repository
    # and carries no upstream ref to pin.
    [[ -z "$ref" || "$ref" == ./* ]] && continue
    if [[ ! "$ref" =~ @[0-9a-f]{40}$ ]]; then
      printf 'unpinned action %s in %s\n' "$ref" "$file" >&2
      FAILURES=$((FAILURES + 1))
    fi
  done < <(action_references "$ROOT/$file")
}

# A 40-hex run is only a shape. Nothing about it says the commit is the release
# its trailing comment claims, so the comment stays an unverified annotation
# unless something resolves it. Network-gated: a definitive mismatch fails, an
# unreachable API skips, so an offline developer run stays deterministic.
verify_pins_match_comments() {
  local file="$1"
  local line ref tag action sha object kind resolved
  while IFS= read -r line; do
    [[ "$line" =~ uses:[[:space:]]*[\"\']?([^[:space:]\"\'#]+)[\"\']?[[:space:]]*#[[:space:]]*(v[^[:space:]]+) ]] || continue
    ref="${BASH_REMATCH[1]}"
    tag="${BASH_REMATCH[2]}"
    action="${ref%@*}"
    sha="${ref#*@}"
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || continue
    # Only owner/repo actions resolve through the repository tag API.
    [[ "$action" == */* && "$action" != */*/* ]] || continue
    object="$(gh api "repos/${action}/git/ref/tags/${tag}" --jq '.object.type + " " + .object.sha' 2>/dev/null)"
    if [[ -z "$object" ]]; then
      printf 'note: %s@%s did not resolve upstream; pin left unverified\n' "$action" "$tag" >&2
      continue
    fi
    kind="${object%% *}"
    resolved="${object##* }"
    if [[ "$kind" == tag ]]; then
      resolved="$(gh api "repos/${action}/git/tags/${resolved}" --jq '.object.sha' 2>/dev/null)"
    fi
    if [[ -z "$resolved" ]]; then
      printf 'note: %s@%s did not dereference; pin left unverified\n' "$action" "$tag" >&2
      continue
    fi
    if [[ "$resolved" != "$sha" ]]; then
      printf 'pin mismatch in %s: %s is pinned to %s but %s is %s\n' \
        "$file" "$action" "$sha" "$tag" "$resolved" >&2
      FAILURES=$((FAILURES + 1))
    fi
  done < <(action_references "$ROOT/$file")
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
  require_text "$file" '--request-timeout "$CODEX_REQUEST_TIMEOUT"'
  require_text "$file" '--job-deadline "$CODEX_JOB_DEADLINE_EPOCH"'
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
require_text 'scripts/codex_review_pr.sh' '--require-complete-input'
require_text 'scripts/verify_before_push.sh' 'git diff --check "$BASE_SHA" "$HEAD_SHA"'
require_text 'scripts/verify_before_push.sh' 'usage: $0 <base-ref-or-sha>'
require_text 'scripts/verify_before_push.sh' 'SENTRY_AUTH_TOKEN= SENTRY_ORG= SENTRY_PROJECT='
require_text 'scripts/verify_before_push.sh' 'FINAL_HEAD_SHA="$(git rev-parse --verify HEAD)"'
require_text 'scripts/verify_before_push.sh' './node_modules/.bin/tsc --noEmit'
require_text 'scripts/verify_before_push.sh' "rg -q --hidden --glob '!*.map'"
refuse_text 'scripts/verify_before_push.sh' "rg -n --hidden --glob '!*.map'"

require_text 'scripts/codex_review_pr.sh' 'review-sanitized.md'
require_text 'scripts/codex_review_pr.sh' 'review-input.md'
require_text 'scripts/codex_review_pr.sh' '--instructions "$TEMP_DIR/review-instructions.md"'
require_text 'scripts/codex_triage_issue.sh' 'triage-sanitized.md'
require_text 'scripts/codex_triage_issue.sh' 'triage-input.md'
require_text 'scripts/codex_triage_issue.sh' '--instructions "$TEMP_DIR/triage-instructions.md"'
require_text 'scripts/codex_responses.py' 'https://api.openai.com/v1/responses'
require_text 'scripts/codex_responses.py' '"store": False'
# A hardcoded socket timeout aborted a 32000-token generation mid-call.
refuse_text 'scripts/codex_responses.py' 'timeout=120'

for file in .github/workflows/codex-pr-review.yml .github/workflows/codex-issue-triage.yml; do
  require_text "$file" 'CODEX_MODEL:'
  require_text "$file" 'CODEX_REASONING_EFFORT:'
  require_text "$file" 'CODEX_MAX_ITEMS:'
  require_text "$file" 'CODEX_MAX_OUTPUT_TOKENS:'
  require_text "$file" 'CODEX_MAX_OUTPUT_BYTES:'
  require_text "$file" 'CODEX_REQUEST_TIMEOUT:'
  require_text "$file" 'CODEX_JOB_TIMEOUT_SECONDS:'
  # Stamped before checkout, or the elapsed setup time it exists to measure is
  # itself excluded from the measurement.
  require_text "$file" 'CODEX_JOB_DEADLINE_EPOCH='
  # timeout-minutes is what GitHub enforces; CODEX_JOB_TIMEOUT_SECONDS is what
  # the worker validates against. If they drift, the worker approves a request
  # timeout the job will not survive.
  job_minutes="$(grep -E '^ *timeout-minutes:' "$ROOT/$file" | head -1 | grep -oE '[0-9]+')"
  declared="$(grep -E "^ *CODEX_JOB_TIMEOUT_SECONDS:" "$ROOT/$file" | grep -oE "[0-9]+" | head -1)"
  if [[ -z "$job_minutes" || -z "$declared" ]]; then
    fail "$file: could not read timeout-minutes / CODEX_JOB_TIMEOUT_SECONDS"
  elif (( job_minutes * 60 != declared )); then
    fail "$file: timeout-minutes $job_minutes ($((job_minutes * 60))s) != CODEX_JOB_TIMEOUT_SECONDS ${declared}s"
  fi
  require_text "$file" 'CODEX_BOT_LOGIN:'
  require_text "$file" 'GITHUB_STEP_SUMMARY'
  # These workflows hold issues:write, pull-requests:write and OPENAI_API_KEY.
  # A mutable tag hands all three to whoever retags it upstream. Pinning itself
  # is asserted over every workflow below; these two keep the steps from being
  # dropped, which the generic sweep cannot notice.
  require_text "$file" 'actions/checkout@'
  require_text "$file" 'actions/setup-python@'
done

require_text '.github/workflows/codex-issue-triage.yml' 'types: [opened, edited, labeled, reopened]'

# ci.yml is unprivileged, but a mutable tag there still lets a compromised
# action read the checkout and tamper with build output. Pinned for the same
# reason, and Dependabot is what keeps every pin in the repository from rotting.
# Every workflow is swept, so a new file or a new action is covered on arrival.
WORKFLOW_COUNT=0
for workflow in "$ROOT"/.github/workflows/*.yml "$ROOT"/.github/workflows/*.yaml; do
  [[ -e "$workflow" ]] || continue
  WORKFLOW_COUNT=$((WORKFLOW_COUNT + 1))
  require_every_action_pinned ".github/workflows/$(basename "$workflow")"
  if [[ "${CODEX_VERIFY_ACTION_PINS:-}" == "1" ]]; then
    verify_pins_match_comments ".github/workflows/$(basename "$workflow")"
  fi
done
if (( WORKFLOW_COUNT == 0 )); then
  fail 'No workflow files were swept for action pins.'
fi
if [[ "${CODEX_VERIFY_ACTION_PINS:-}" != "1" ]]; then
  printf 'note: set CODEX_VERIFY_ACTION_PINS=1 to resolve each pin against its version comment\n' >&2
fi
require_text '.github/workflows/ci.yml' 'permissions:'
require_text '.github/workflows/ci.yml' 'scripts/verify_before_push.sh origin/main'
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
    # Passthrough runs the real worker so its argument validation is what
    # decides the outcome, rather than the stub always succeeding.
    if [[ -n "${CODEX_STUB_PASSTHROUGH:-}" ]]; then
      exec "$CODEX_REAL_PYTHON3" "$@"
    fi
    out=""
    prev=""
    for candidate in "$@"; do
      [[ "$prev" == "--output" ]] && out="$candidate"
      prev="$candidate"
    done
    printf '%s\n' "$*" >"$CODEX_STUB_DIR/responses-argv.log"
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

# ---------------------------------------------------------------------------
# The timeout must reach the Python worker, not merely appear in the script.
# Textual wiring passes even if the value never leaves the shell.
# ---------------------------------------------------------------------------
check_timeout_propagates() {
  local script="$1" number="$2" timeout="$3"
  : >"$STUB_DIR/posted.log"
  : >"$STUB_DIR/head-override"
  : >"$STUB_DIR/responses-argv.log"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"

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
    CODEX_REQUEST_TIMEOUT="$timeout" \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/$script" "$number" >"$STUB_DIR/run.log" 2>&1 || status=$?

  if (( status != 0 )); then
    fail "$script exited $status while checking timeout propagation"
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if ! grep -Fq -- "--request-timeout $timeout" "$STUB_DIR/responses-argv.log"; then
    fail "$script did not pass --request-timeout $timeout to codex_responses.py"
    cat "$STUB_DIR/responses-argv.log" >&2
  fi
  if ! grep -Fq -- "--job-deadline" "$STUB_DIR/responses-argv.log"; then
    fail "$script did not pass --job-deadline to codex_responses.py"
    cat "$STUB_DIR/responses-argv.log" >&2
  fi
}

# A configured override the job cannot outlive must fail fast, not be accepted
# and then killed mid-request by GitHub.
check_override_beyond_job_deadline_is_refused() {
  local script="$1" number="$2"
  : >"$STUB_DIR/posted.log"
  : >"$STUB_DIR/head-override"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"

  local status=0
  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_STUB_PASSTHROUGH=1 \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_REQUEST_TIMEOUT=1800 \
    CODEX_JOB_TIMEOUT_SECONDS=1200 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/$script" "$number" >"$STUB_DIR/run.log" 2>&1 || status=$?

  if (( status == 0 )); then
    fail "$script accepted CODEX_REQUEST_TIMEOUT=1800 inside a 1200s job"
  elif ! grep -q 'does not fit the' "$STUB_DIR/run.log"; then
    fail "$script failed for the wrong reason on an over-long request timeout"
    cat "$STUB_DIR/run.log" >&2
  fi
  if [[ -s "$STUB_DIR/posted.log" ]]; then
    fail "$script posted a comment despite an invalid timeout configuration"
  fi
}

# A PR review must never be posted for a partial diff. Exercise the wrapper
# with a real Responses worker and an oversized sanitized payload; the worker
# must fail before opening a network request or reaching gh pr comment.
check_oversized_review_input_is_refused() {
  : >"$STUB_DIR/posted.log"
  : >"$STUB_DIR/head-override"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"
  printf '%*s' 20000 '' | tr ' ' x >"$STUB_DIR/pr.diff"

  local status=0
  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_STUB_PASSTHROUGH=1 \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=20000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/scripts/codex_review_pr.sh" 15 >"$STUB_DIR/run.log" 2>&1 || status=$?

  if (( status == 0 )); then
    fail 'Oversized PR input was accepted as a complete review.'
  elif ! grep -q 'complete review input' "$STUB_DIR/run.log"; then
    fail 'Oversized PR input failed for the wrong reason.'
    cat "$STUB_DIR/run.log" >&2
  fi
  if [[ -s "$STUB_DIR/posted.log" ]]; then
    fail 'Oversized PR input reached comment publication.'
  fi
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

check_timeout_propagates scripts/codex_review_pr.sh 15 1234
check_override_beyond_job_deadline_is_refused scripts/codex_review_pr.sh 15

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

check_oversized_review_input_is_refused

jq -n '{number: 21, title: "t", body: "b", url: "u", state: "OPEN", labels: [],
        author: {login: "reporter"}, createdAt: "2026-08-15T00:00:00Z",
        updatedAt: "2026-08-15T00:00:00Z"}' >"$STUB_DIR/metadata.json"
ISSUE_FINGERPRINT="$(jq -cn '{title: "t", body: "b"}' | PATH="$STUB_DIR:$PATH" sha256sum | cut -d' ' -f1)"
ISSUE_MARKER="<!-- codex-issue-triage:21:${ISSUE_FINGERPRINT} -->"

check_timeout_propagates scripts/codex_triage_issue.sh 21 4321
check_override_beyond_job_deadline_is_refused scripts/codex_triage_issue.sh 21

expect_posted 'A non-bot comment carrying the marker suppressed the issue triage.' \
  scripts/codex_triage_issue.sh 21 "$ISSUE_MARKER" "issue-author"
expect_suppressed 'A bot comment carrying the marker failed to suppress a duplicate issue triage.' \
  scripts/codex_triage_issue.sh 21 "$ISSUE_MARKER" 'github-actions[bot]'

if (( FAILURES > 0 )); then
  printf '%d Codex automation assertions failed.\n' "$FAILURES" >&2
  exit 1
fi

echo 'Codex automation assertions passed.'
