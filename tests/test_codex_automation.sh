#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
# Resolve the interpreter itself, not a version-manager shim: the stub below
# shadows `python3` on PATH, and a shim that re-resolves through PATH would
# recurse into the stub forever.
REAL_PYTHON3="$(python3 -c 'import sys; print(sys.executable)')"
STAGING="$(mktemp -d)"
TRUSTED_STAGING_ROOT="$STAGING/trusted"
mkdir -p "$TRUSTED_STAGING_ROOT"
# The SHA the script must see as its checkout to trust it. Tests run against
# this worktree, so the worktree HEAD is the trusted SHA.
ROOT_HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"

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
require_text 'scripts/codex_review_pr.sh' 'select(.event == "pull_request")'
refuse_text 'scripts/codex_review_pr.sh' '--paginate --slurp'
require_text 'scripts/verify_before_push.sh' 'git diff --check "$BASE_SHA" "$HEAD_SHA"'
require_text 'scripts/verify_before_push.sh' 'usage: $0 <base-ref-or-sha>'
require_text 'scripts/verify_before_push.sh' 'SENTRY_AUTH_TOKEN= SENTRY_ORG= SENTRY_PROJECT='
require_text 'scripts/verify_before_push.sh' 'FINAL_HEAD_SHA="$(git rev-parse --verify HEAD)"'
require_text 'scripts/verify_before_push.sh' './node_modules/.bin/tsc --noEmit'
require_text 'scripts/verify_before_push.sh' 'grep -R -E -l'
require_text 'scripts/verify_before_push.sh' 'case "$GREP_STATUS" in'
require_text 'scripts/verify_before_push.sh' 'required artifact scanner is unavailable'
require_text 'scripts/verify_before_push.sh' 'INITIAL_STATUS="$(git status --porcelain=v1)"'
require_text 'scripts/verify_before_push.sh' 'working tree changed during verification'

require_text 'scripts/codex_review_pr.sh' 'review-sanitized.md'
require_text 'scripts/codex_review_pr.sh' 'review-input.md'
require_text 'scripts/codex_review_pr.sh' '--instructions "$TEMP_DIR/review-instructions.md"'

# Finding memory (loop-engineering plan §5): the reviewer must read its own
# prior review of this PR and emit a lifecycle trailer, so the arbiter (T3)
# can count whether a finding recurs across rounds.
require_text 'scripts/codex_review_pr.sh' 'prev-review.md'
# prev-review-sanitized.md is written only by the codex_sanitize.py step and
# read only by the codex_untrusted.py --label previous-review step, so its
# presence proves the sanitize-before-wrap ordering for the prior review
# comment (same convention as review-sanitized.md above for the model's own
# output). The prior comment quotes PR diff content verbatim and can carry
# secrets/IBANs; codex_untrusted.py only defangs delimiters, it does not
# redact, so sanitizing first is a hard security requirement.
require_text 'scripts/codex_review_pr.sh' 'prev-review-sanitized.md'
require_text 'scripts/codex_review_pr.sh' '--label previous-review'
require_text 'scripts/codex_review_pr.sh' 'codex-verdict'
require_text 'scripts/codex_review_pr.sh' 'full accounting'

# A resolution is emitted ONCE. codex_arbiter.py's _apply_round deletes a
# RESOLVED-with-evidence finding from the open-set, so a prompt that asks for
# every past finding to reappear every round asks the reviewer to produce
# ORPHAN-STATE (tests/test_codex_arbiter.py::
# test_reemitting_an_already_resolved_finding_is_orphan_needs_human) and grows
# the comment without bound -- PR 56 reached 12 re-listed RESOLVED findings in
# an 18.6KB comment carrying 1 NEW and 1 OPEN. The accounting duty binds
# findings that are still open; 'silence is not resolution' still holds for
# those.
require_text 'scripts/codex_review_pr.sh' 'still unresolved'
require_text 'scripts/codex_review_pr.sh' 'already marked RESOLVED is closed'
require_text 'scripts/codex_review_pr.sh' 'Do not restate it'
require_text 'scripts/codex_review_pr.sh' 'Resolved this round'
refuse_text 'scripts/codex_review_pr.sh' 'previously raised on this PR must reappear'
# ...but a closed finding is not an untouchable one. Dropping resolved findings
# must not teach the reviewer to stay quiet about a defect an earlier round
# mistakenly closed or a later commit regressed; that would trade comment bloat
# for silent suppression. Re-raising as NEW is the sanctioned route and the
# arbiter accepts it (the key is no longer in the open-set, so it is not an
# AMBIGUOUS-IDENTITY rename).
require_text 'scripts/codex_review_pr.sh' 'Closed does not mean untouchable'
# The same lifecycle contract must also stand in the TRUSTED channel. The
# prompt heredoc and docs/loop/schemas.md are not injected as policy, so a
# reviewer reading only review-policy.md saw a lifecycle change as untrusted
# PR content with no trusted counterpart -- and reported a correct change as an
# unapproved protocol change twice.
require_text '.github/codex/review-policy.md' '## Finding lifecycle'
require_text '.github/codex/review-policy.md' 'Silence is not resolution'
require_text '.github/codex/review-policy.md' 'reported exactly once'
require_text '.github/codex/review-policy.md' 'Closed is not untouchable'
require_text 'scripts/codex_review_pr.sh' 'raise it again as NEW'

# T5: the per-branch Contract (docs/contracts/<branch>.md) is read from THIS
# checkout -- main's version by construction of the review workflow's
# default-branch checkout -- and injected into the TRUSTED instructions
# channel, appended after the trusted review policy. It must never be routed
# through codex_untrusted.py, which is reserved for PR-controlled input.
# The default-branch tip is read over the authenticated API channel
# (GH_TOKEN + GH_REPO), never from the local `origin` remote: `origin` is
# caller-controlled, so consulting it to authenticate the checkout asks the
# same untrusted party twice. Content integrity then follows from git's
# content addressing -- show_trusted reads `git show $TRUSTED_SHA:<path>`, and
# no repository can hold different bytes under the real tip's commit SHA.
require_text 'scripts/codex_review_pr.sh' 'git/ref/heads/'
# The branch name is the FORGE's answer, never the caller's claim: GH_REPO is
# bound to the output side too (a substituted repository takes the comment with
# it, so nothing reaches the real PR), but the branch name only selects where
# trusted policy is read from -- push access to any branch would otherwise be
# enough to inject policy while still posting to the real PR.
require_text 'scripts/codex_review_pr.sh' 'ACTUAL_DEFAULT_BRANCH'
require_text 'scripts/codex_review_pr.sh' 'default_branch'
require_text 'scripts/codex_review_pr.sh' 'refusing to read trusted policy from a non-default branch'
refuse_text 'scripts/codex_review_pr.sh' 'heads/${CODEX_DEFAULT_BRANCH}'
require_text 'scripts/codex_review_pr.sh' '^[0-9a-f]{40}$'
refuse_text 'scripts/codex_review_pr.sh' 'ls-remote'

require_text 'scripts/codex_review_pr.sh' 'CONTRACT_PATH'
require_text 'scripts/codex_review_pr.sh' 'docs/contracts/'
require_text 'scripts/codex_review_pr.sh' '## Contract'
require_text 'scripts/codex_review_pr.sh' 'Disambiguation:'
# Wording must be robust to both the "## Contract (from main)" and plain
# "## Contract" headings the script can emit, and must cover a PR that ADDS a
# brand-new contract file with no main-side counterpart, not only one that
# modifies an existing one.
require_text 'scripts/codex_review_pr.sh' 'report any divergence from the Contract section below'
require_text 'scripts/codex_review_pr.sh' 'adds or modifies the PR branch'
refuse_text 'scripts/codex_review_pr.sh' '--label contract'
# Review fix: a present-but-not-a-contract file at the resolved path (e.g.
# docs/contracts/README.md itself, for a branch literally named "README")
# must never be injected as a signed-off contract, and a bare `-s` check
# (true for a directory too) must never be able to abort the script.
require_text 'scripts/codex_review_pr.sh' '"# Contract: $HEAD_REF_NAME"'
require_text 'scripts/codex_review_pr.sh' 'show_trusted "$CONTRACT_PATH"'

require_text 'scripts/codex_triage_issue.sh' 'triage-sanitized.md'
require_text 'scripts/codex_triage_issue.sh' 'triage-input.md'
require_text 'scripts/codex_triage_issue.sh' '--instructions "$TEMP_DIR/triage-instructions.md"'
require_text 'scripts/codex_responses.py' 'https://api.openai.com/v1/responses'
require_text 'scripts/codex_responses.py' '"store": False'
# A hardcoded socket timeout aborted a 32000-token generation mid-call.
refuse_text 'scripts/codex_responses.py' 'timeout=120'

# The reviewer worker cannot establish its own trust root. GH_REPO and
# CODEX_DEFAULT_BRANCH decide which repository and which branch supply the
# trusted policy and contract, and a shell script cannot prove its own
# environment -- that anchor has to come from the invoker. The workflow IS the
# invoker, and pull_request_target reads it from the base ref, so a PR author
# cannot reach either value. Assert the anchor instead of assuming it: reading
# only the script, these are two ordinary environment variables with no visible
# provenance, which is exactly how a reviewer with no sight of this file
# concluded the trust root was caller-controlled.
require_text '.github/workflows/codex-pr-review.yml' 'GH_REPO: ${{ github.repository }}'
require_text '.github/workflows/codex-pr-review.yml' 'CODEX_DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}'
# Nothing may redirect the API host either: GH_HOST/GH_ENTERPRISE_TOKEN would
# point every `gh` read AND the `gh pr comment` write at another forge.
refuse_text '.github/workflows/codex-pr-review.yml' 'GH_HOST'
refuse_text '.github/workflows/codex-pr-review.yml' 'GH_ENTERPRISE_TOKEN'
refuse_text 'scripts/codex_review_pr.sh' 'GH_HOST'

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

require_text '.github/workflows/codex-pr-review.yml' 'targets:'
require_text '.github/workflows/codex-pr-review.yml' 'arbiter:'
require_text '.github/workflows/codex-pr-review.yml' 'needs: [targets]'
require_text '.github/workflows/codex-pr-review.yml' 'actions: read'
require_text '.github/workflows/codex-pr-review.yml' 'checks: read'
require_text '.github/workflows/codex-pr-review.yml' '  schedule:'
require_text '.github/workflows/codex-pr-review.yml' 'cron: "17 2 * * 1-5"'
require_text '.github/workflows/codex-pr-review.yml' \
  'ARBITER_OPERATOR: ${{ vars.ARBITER_AUTOPOST }}'
for arbiter_knob in ARBITER_SOFT_GATE ARBITER_HARD_CAP ARBITER_STUCK_P1_ROUNDS ARBITER_UNVERIFIABLE_ROUNDS; do
  require_text '.github/workflows/codex-pr-review.yml' "$arbiter_knob: \${{ vars.$arbiter_knob ||"
done
require_text '.github/workflows/codex-pr-review.yml' 'scripts/codex_arbiter.py'
require_text '.github/workflows/codex-pr-review.yml' 'GITHUB_STEP_SUMMARY'
refuse_text '.github/workflows/codex-pr-review.yml' 'ARBITER_OPERATOR: 1'

# Text checks can be fooled by content in the model-calling review job, so
# isolate the arbiter job and prove it stays deterministic and write-minimal.
ARBITER_BLOCK="$(awk '
  /^  arbiter:$/ { in_arbiter=1 }
  in_arbiter && /^  [A-Za-z][A-Za-z0-9_-]*:$/ && $0 !~ /^  arbiter:$/ { exit }
  in_arbiter { print }
' "$ROOT/.github/workflows/codex-pr-review.yml")"
if [[ -z "$ARBITER_BLOCK" ]]; then
  fail 'Could not extract the arbiter job from codex-pr-review.yml.'
fi
for forbidden in OPENAI_API_KEY codex_responses.py 'codex exec' pytest 'npm test' 'swift test' --gap-issues; do
  if grep -Fq -- "$forbidden" <<<"$ARBITER_BLOCK"; then
    fail "The arbiter job must not contain $forbidden."
  fi
done

# The bounded PR set must flow directly from target selection into both matrix
# jobs. Per-PR concurrency and fail-fast=false are what keep a scheduled batch
# from racing event-driven work and keep one failure from suppressing later PRs.
ruby_status=0
ruby -ryaml <<'RUBY' || ruby_status=1
workflow = YAML.load_file(".github/workflows/codex-pr-review.yml")
jobs = workflow.fetch("jobs")
targets = jobs.fetch("targets")
review = jobs.fetch("review")
arbiter = jobs.fetch("arbiter")
raise if workflow.key?("concurrency")
raise unless targets.fetch("outputs").fetch("pr_numbers") ==
  "${{ steps.targets.outputs.pr_numbers }}"
raise unless targets.fetch("outputs").fetch("expected_head_sha") ==
  "${{ steps.targets.outputs.expected_head_sha }}"
raise unless Array(review.fetch("needs")) == ["targets"]
raise unless review.fetch("strategy").fetch("fail-fast") == false
raise unless review.fetch("strategy").fetch("matrix").fetch("pr_number") ==
  "${{ fromJSON(needs.targets.outputs.pr_numbers) }}"
raise unless review.fetch("concurrency").fetch("group") ==
  "codex-pr-review-${{ matrix.pr_number }}"
raise unless Array(arbiter.fetch("needs")).sort == ["review", "targets"]
raise unless arbiter.fetch("strategy").fetch("fail-fast") == false
raise unless arbiter.fetch("strategy").fetch("matrix").fetch("pr_number") ==
  "${{ fromJSON(needs.targets.outputs.pr_numbers) }}"
raise unless arbiter.fetch("concurrency").fetch("group") ==
  "codex-pr-review-${{ matrix.pr_number }}"
raise if arbiter.fetch("env").key?("PR_NUMBERS_JSON")
%w[ARBITER_SOFT_GATE ARBITER_HARD_CAP ARBITER_STUCK_P1_ROUNDS ARBITER_UNVERIFIABLE_ROUNDS].each do |name|
  raise unless arbiter.fetch("env").fetch(name).include?("vars.#{name}")
end
raise unless arbiter.fetch("if").include?("always()")
raise unless arbiter.fetch("if").include?("needs.review.result == 'cancelled'")
RUBY
if (( ruby_status != 0 )); then
  fail 'Arbiter workflow is structurally disconnected from the review PR set.'
fi

require_text '.github/workflows/codex-pr-review.yml' 'workflow_run:'
require_text '.github/workflows/codex-pr-review.yml' 'workflows: [CI]'
require_text '.github/workflows/codex-pr-review.yml' 'types: [completed]'
require_text '.github/workflows/codex-pr-review.yml' 'CODEX_EXPECTED_HEAD_SHA='
require_text '.github/workflows/codex-pr-review.yml' 'CODEX_PR_ACTION:'
require_text '.github/workflows/codex-pr-review.yml' 'CODEX_CONTEXT_MAX_FILES:'
require_text '.github/workflows/codex-pr-review.yml' 'CODEX_CONTEXT_MAX_BYTES:'
require_text '.github/workflows/codex-pr-review.yml' 'CODEX_CHECK_MAX_PAGES:'
require_text '.github/workflows/codex-pr-review.yml' 'CODEX_CHECK_MAX_RAW_BYTES:'
# Coverage invariant: direct push events remain for heads whose conflicting
# merge ref prevents GitHub from creating a CI pull_request run at all.
require_text '.github/workflows/codex-pr-review.yml' \
  'types: [opened, synchronize, reopened, ready_for_review]'
require_text '.github/workflows/codex-pr-review.yml' \
  'WORKFLOW_RUN_PULL_REQUESTS: ${{ toJSON(github.event.workflow_run.pull_requests) }}'
require_text '.github/workflows/codex-pr-review.yml' \
  "jq -r '[.[]? | .number? | tostring] | unique | .[]'"
require_text '.github/workflows/codex-pr-review.yml' \
  'head -n "$CODEX_MAX_ITEMS" /tmp/codex-pr-candidates'
refuse_text '.github/workflows/codex-pr-review.yml' \
  'workflow_run.pull_requests[0].number'
require_text 'scripts/codex_review_pr.sh' 'deferring to the CI-completion review'
require_text 'scripts/codex_review_pr.sh' \
  'actions/workflows/${CODEX_CI_WORKFLOW_FILE}/runs'
require_text 'scripts/codex_review_pr.sh' 'commits/${HEAD_SHA}/check-runs'
require_text 'scripts/codex_review_pr.sh' '--label verification-results'
require_text 'scripts/codex_review_pr.sh' 'not available at review time'
require_text 'scripts/codex_review_pr.sh' 'unverifiable'
require_text '.github/codex/review-policy.md' 'unverifiable'
require_text 'docs/loop/schemas.md' 'exact-head check result was not available at review time'
require_text 'scripts/codex_review_pr.sh' 'show_trusted ".github/codex/context-files.txt"'
require_text 'scripts/codex_review_pr.sh' '## Trusted reference material (not policy)'
refuse_text 'scripts/codex_review_pr.sh' 'cat .github/codex/context-files.txt'
require_text '.github/codex/context-files.txt' '.github/workflows/codex-pr-review.yml'
refuse_text '.github/workflows/codex-pr-review.yml' 'actions/download-artifact'
refuse_text 'scripts/codex_review_pr.sh' 'pytest'
refuse_text 'scripts/codex_review_pr.sh' 'npm test'
refuse_text 'scripts/codex_review_pr.sh' 'swift test'

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
          jq '.state //= "OPEN"' "$CODEX_STUB_DIR/metadata.json" | apply_jq "$@"
        fi
        ;;
      diff) cat "$CODEX_STUB_DIR/pr.diff" ;;
      comment)
        printf 'posted\n' >>"$CODEX_STUB_DIR/posted.log"
        previous=""
        for argument in "$@"; do
          if [[ "$previous" == "--body-file" ]]; then
            cp "$argument" "$CODEX_STUB_DIR/captured-comment.md"
          fi
          previous="$argument"
        done
        ;;
      *) exit 1 ;;
    esac
    ;;
  api)
    # Two distinct API reads share this verb. The default-branch tip is the
    # trust root; the comment list is ordinary data. Route on the path so the
    # trust root can never be satisfied by the comment fixture.
    printf '%s\n' "$*" >>"$CODEX_STUB_DIR/api.log"
    if [[ "$*" == *"--method PATCH"*"/issues/comments/"* ]]; then
      printf '%s\n' "$*" >>"$CODEX_STUB_DIR/patched.log"
    elif [[ "$*" == *"/commits/"*"/check-runs"* ]]; then
      requested_sha=""
      requested_page=""
      requested_per_page=""
      if [[ "$*" =~ /commits/([0-9a-f]{40})/check-runs ]]; then
        requested_sha="${BASH_REMATCH[1]}"
      fi
      if [[ "$*" =~ check-runs\?per_page=([0-9]+)\&page=([0-9]+) ]]; then
        requested_per_page="${BASH_REMATCH[1]}"
        requested_page="${BASH_REMATCH[2]}"
      fi
      printf '%s\n' "$requested_sha" >>"$CODEX_STUB_DIR/check-sha.log"
      printf '%s\t%s\t%s\n' "$requested_sha" "$requested_page" "$requested_per_page" \
        >>"$CODEX_STUB_DIR/check-query.log"
      page_fixture="$CODEX_STUB_DIR/check-runs-${requested_sha}-page-${requested_page}.json"
      sha_fixture="$CODEX_STUB_DIR/check-runs-${requested_sha}.json"
      if [[ -n "$requested_sha" && -n "$requested_page" && -f "$page_fixture" ]]; then
        jq '.' <"$page_fixture"
      elif [[ -n "$requested_sha" && -f "$sha_fixture" ]]; then
        jq '.' <"$sha_fixture"
      else
        jq '.' <"$CODEX_STUB_DIR/check-runs.json"
      fi
    elif [[ "$*" == *"/actions/workflows/"*"/runs"* ]]; then
      apply_jq "$@" <"$CODEX_STUB_DIR/workflow-runs.json"
    elif [[ "$*" == *"/git/ref/heads/"* ]]; then
      jq -n --arg sha "$(cat "$CODEX_STUB_DIR/remote-tip")" \
            --arg branch "$(cat "$CODEX_STUB_DIR/default-branch")" \
            '{ref: ("refs/heads/" + $branch), object: {sha: $sha, type: "commit"}}' \
        | apply_jq "$@"
    elif [[ "$*" != *"/issues/"* ]]; then
      # The repository document. This is what names the default branch, and it
      # is the forge's answer -- never the caller's CODEX_DEFAULT_BRANCH.
      jq -n --arg branch "$(cat "$CODEX_STUB_DIR/default-branch")" \
            '{default_branch: $branch}' | apply_jq "$@"
    else
      cat "$CODEX_STUB_DIR/comments.jsonl"
    fi
    ;;
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
    instructions=""
    input_file=""
    prev=""
    for candidate in "$@"; do
      [[ "$prev" == "--output" ]] && out="$candidate"
      [[ "$prev" == "--instructions" ]] && instructions="$candidate"
      [[ "$prev" == "--input" ]] && input_file="$candidate"
      prev="$candidate"
    done
    printf '%s\n' "$*" >"$CODEX_STUB_DIR/responses-argv.log"
    # Captured before the caller's own mktemp TEMP_DIR (distinct from
    # CODEX_STUB_DIR) is deleted by the caller's EXIT trap, so a test can
    # assert which channel content actually reached the API call.
    [[ -n "$instructions" ]] && cp "$instructions" "$CODEX_STUB_DIR/captured-instructions.md"
    [[ -n "$input_file" ]] && cp "$input_file" "$CODEX_STUB_DIR/captured-input.md"
    printf 'stub review\n' >"$out"
    if [[ -n "${CODEX_STUB_FINAL_HEAD:-}" ]]; then
      printf '%s\n' "$CODEX_STUB_FINAL_HEAD" >"$CODEX_STUB_DIR/head-override"
    fi
    exit 0
  fi
done
exec "$CODEX_REAL_PYTHON3" "$@"
STUB

cat >"$STUB_DIR/git" <<'GSTUB'
#!/usr/bin/env bash
# The reviewer script reads trusted content from GIT OBJECTS at the stamped
# SHA. The stub serves those reads from a staging directory recorded at
# stub-creation time, so tests exercise the object-read path without
# committing fixtures into the developer's worktree.
STUB_CFG="$(dirname "$(command -v git)")"
REAL_GIT="$(cat "$STUB_CFG/real-git")"
GIT_STUB_ROOT="$(cat "$STUB_CFG/git-root")"
TRUSTED_STAGING="$(cat "$STUB_CFG/trusted-staging")"
for arg in "$@"; do
  if [[ "$arg" == "--show-toplevel" ]]; then
    printf '%s\n' "$GIT_STUB_ROOT"
    exit 0
  fi
done
if [[ "${*: -1}" == "HEAD" && " $* " == *" rev-parse "* ]]; then
  printf '%s\n' "$(cat "$STUB_CFG/trusted-sha")"
  exit 0
fi
if [[ "$1" == "ls-remote" || ("$1" == "-C" && "$3" == "ls-remote") ]]; then
  # The trust root is the authenticated GitHub API, not the local remote. A
  # stray ls-remote means caller-controlled `origin` is back in the trust
  # path, so refuse instead of serving it a plausible answer.
  echo "git ls-remote is not available to the reviewer worker" >&2
  exit 127
fi
if [[ "$1" == "show" || ("$1" == "-C" && "$3" == "show") ]]; then
  ref="${@: -1}"
  path="${ref#*:}"
  staging_file="$TRUSTED_STAGING/$path"
  if [[ -f "$staging_file" ]]; then
    cat "$staging_file"
    exit 0
  fi
  exit 1
fi
exec "$REAL_GIT" "$@"
GSTUB

# Resolved NOW, before any PATH stubbing exists: resolving inside the stub
# would find the stub itself (it is first on PATH at runtime) and exec-loop.
REAL_GIT_PATH="$(command -v git)"
printf '%s\n' "$ROOT" >"$STUB_DIR/git-root"
printf '%s\n' "$ROOT_HEAD_SHA" >"$STUB_DIR/trusted-sha"
printf '%s\n' "$TRUSTED_STAGING_ROOT" >"$STUB_DIR/trusted-staging"
printf '%s\n' "$REAL_GIT_PATH" >"$STUB_DIR/real-git"
printf '%s\n' "$ROOT_HEAD_SHA" >"$STUB_DIR/remote-tip"
printf '%s\n' "main" >"$STUB_DIR/default-branch"
printf '%s\n' '{"total_count": 0, "workflow_runs": []}' >"$STUB_DIR/workflow-runs.json"
jq -n '{total_count: 1, check_runs: [{id: 1, name: "quality-gate", status: "completed", conclusion: "success", completed_at: "2026-08-25T10:00:00Z"}]}' >"$STUB_DIR/check-runs.json"
# The policy file is genuinely part of the trusted checkout; serve the real one.
mkdir -p "$TRUSTED_STAGING_ROOT/.github/codex"
cp "$ROOT/.github/codex/review-policy.md" "$TRUSTED_STAGING_ROOT/.github/codex/review-policy.md"
mkdir -p "$TRUSTED_STAGING_ROOT/.github/workflows"
{
  printf '# TRUSTED_WORKFLOW_CONTEXT_SENTINEL\n'
  cat "$ROOT/.github/workflows/codex-pr-review.yml"
} >"$TRUSTED_STAGING_ROOT/.github/workflows/codex-pr-review.yml"
printf '# Trusted reference material supplied to the PR reviewer.\n.github/workflows/codex-pr-review.yml\n' \
  >"$TRUSTED_STAGING_ROOT/.github/codex/context-files.txt"
chmod +x "$STUB_DIR/gh" "$STUB_DIR/python3" "$STUB_DIR/git"

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
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
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
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
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
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
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
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=40000 \
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

# ---------------------------------------------------------------------------
# Task 5: completed-CI sequencing, exact-head binding, coverage fallback, and
# sanitize-before-wrap behavior are exercised through the same fake gh/API
# boundary used by the suppression tests.
# ---------------------------------------------------------------------------
CI_HEAD="$(printf 'a%.0s' {1..40})"
NEWER_CI_HEAD="$(printf 'b%.0s' {1..40})"
CI_REVIEW_STATUS=0

prepare_ci_review_case() {
  : >"$STUB_DIR/posted.log"
  : >"$STUB_DIR/head-override"
  : >"$STUB_DIR/api.log"
  : >"$STUB_DIR/responses-argv.log"
  rm -f "$STUB_DIR/captured-input.md" "$STUB_DIR/captured-comment.md" "$STUB_DIR/patched.log"
  rm -f "$STUB_DIR/check-sha.log" "$STUB_DIR/check-query.log" "$STUB_DIR"/check-runs-*.json
  printf '%s\n' "$(jq -n --arg sha "$CI_HEAD" \
    '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"
  printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"
  jq -n --arg sha "$CI_HEAD" \
    '{number: 15, title: "t", body: "b", url: "u", baseRefName: "main",
      headRefName: "topic", headRefOid: $sha}' >"$STUB_DIR/metadata.json"
}

invoke_ci_review_case() {
  CI_REVIEW_STATUS=0
  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$@" \
    "$ROOT/scripts/codex_review_pr.sh" 15 >"$STUB_DIR/run.log" 2>&1 || CI_REVIEW_STATUS=$?
}

check_matching_completed_ci_head_reaches_model() {
  prepare_ci_review_case
  jq -n '{total_count: 1, workflow_runs: []}' >"$STUB_DIR/workflow-runs.json"
  # This is a syntactically valid address; [EMAIL] is reserved for the
  # redactor's output and must never be used as the fixture input.
  jq -n '{total_count: 3, check_runs: [
    {id: 2, name: "frontend@owner.example", status: "completed",
     conclusion: "failure", completed_at: "2026-08-25T10:01:00Z"},
    {id: 1, name: "quality-gate", status: "completed",
     conclusion: "success", completed_at: "2026-08-25T10:00:00Z"},
    {id: 3, name: "external-wait", status: "in_progress",
     conclusion: null, completed_at: null}
  ]}' >"$STUB_DIR/check-runs.json"
  cp "$STUB_DIR/check-runs.json" "$STUB_DIR/check-runs-${CI_HEAD}.json"
  jq -n '{total_count: 1, check_runs: [{id: 202, name: "wrong-head-evidence", status: "completed",
    conclusion: "failure", completed_at: "2026-08-25T10:03:00Z"}]}' \
    >"$STUB_DIR/check-runs-${NEWER_CI_HEAD}.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=workflow_run \
    CODEX_EXPECTED_HEAD_SHA="$CI_HEAD" \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )); then
    fail 'A matching completed-CI head did not review successfully.'
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if [[ ! -s "$STUB_DIR/captured-input.md" ]]; then
    fail 'The CI-completion path did not reach the model.'
    return
  fi
  if ! grep -Fq 'UNTRUSTED_DATA verification-results' "$STUB_DIR/captured-input.md"; then
    fail 'Completed CI evidence was not wrapped as untrusted input.'
  fi
  if grep -Fq 'frontend@owner.example' "$STUB_DIR/captured-input.md"; then
    fail 'A valid email-shaped check name reached the model unsanitized.'
  fi
  if ! grep -Fq '[EMAIL]' "$STUB_DIR/captured-input.md"; then
    fail 'A valid email-shaped check name was not replaced with the documented redaction marker.'
  fi
  if ! grep -Fq "/commits/${CI_HEAD}/check-runs" "$STUB_DIR/api.log" ||
    ! grep -Fq "$CI_HEAD" "$STUB_DIR/check-sha.log"; then
    fail 'Exact-head check evidence was not requested for the completed CI head.'
  fi
  if grep -Fq "$NEWER_CI_HEAD" "$STUB_DIR/check-sha.log"; then
    fail 'Check evidence was requested for a different head.'
  fi
  if grep -Fq 'wrong-head-evidence' "$STUB_DIR/captured-input.md" ||
    ! grep -Fq 'quality-gate' "$STUB_DIR/captured-input.md"; then
    fail 'The check-run fixture was not bound to the requested exact head.'
  fi
  if ! grep -Fq '"unsettled_count": 1' "$STUB_DIR/captured-input.md"; then
    fail 'An unsettled external check was not counted without erasing completed evidence.'
  fi
}

check_stale_workflow_run_exits_before_model() {
  prepare_ci_review_case
  jq -n '{count: 1, check_runs: [{id: 1, name: "quality-gate", status: "completed",
    conclusion: "success", completed_at: "2026-08-25T10:00:00Z"}]}' \
    >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=workflow_run \
    CODEX_EXPECTED_HEAD_SHA="$NEWER_CI_HEAD" \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )); then
    fail 'A stale workflow-run/head pairing failed instead of exiting zero.'
    cat "$STUB_DIR/run.log" >&2
  fi
  if [[ -s "$STUB_DIR/responses-argv.log" ]]; then
    fail 'A stale workflow-run/head pairing reached the model.'
  fi
  if grep -Fq '/check-runs' "$STUB_DIR/api.log"; then
    fail 'A stale workflow-run/head pairing collected verification evidence.'
  fi
}

check_direct_path_without_ci_run_reviews() {
  prepare_ci_review_case
  printf '{"total_count": 0, "workflow_runs": []}' >"$STUB_DIR/workflow-runs.json"
  printf '{"count": 0, "check_runs": []}' >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=pull_request_target \
    CODEX_PR_ACTION=synchronize \
    CODEX_CI_WORKFLOW_FILE=ci.yml \
    CODEX_CI_DISCOVERY_SECONDS=1 \
    CODEX_CI_DISCOVERY_POLL_SECONDS=1 \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )); then
    fail 'A conflicting head with no CI run was not reviewed as required.'
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if [[ ! -s "$STUB_DIR/captured-input.md" ]] || \
    ! grep -Fq 'CI produced no run' "$STUB_DIR/captured-input.md"; then
    fail 'The no-CI-run fallback did not explicitly state that CI produced no run.'
  fi
  if [[ ! -s "$STUB_DIR/captured-comment.md" ]] || \
    ! grep -Fq 'codex-pr-review-no-ci:' "$STUB_DIR/captured-comment.md"; then
    fail 'The no-CI-run fallback did not mark its review for later replacement.'
  fi
}

check_non_pr_ci_run_does_not_defer() {
  prepare_ci_review_case
  jq -n --arg sha "$CI_HEAD" \
    '{workflow_runs: [{event: "push", head_sha: $sha}]}' >"$STUB_DIR/workflow-runs.json"
  printf '{"count": 0, "check_runs": []}' >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=pull_request_target \
    CODEX_PR_ACTION=synchronize \
    CODEX_CI_WORKFLOW_FILE=ci.yml \
    CODEX_CI_DISCOVERY_SECONDS=1 \
    CODEX_CI_DISCOVERY_POLL_SECONDS=1 \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )); then
    fail 'A same-head non-PR CI run caused the direct review to fail.'
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if [[ ! -s "$STUB_DIR/responses-argv.log" ]]; then
    fail 'A same-head non-PR CI run incorrectly deferred the direct review.'
  fi
}

check_delayed_ci_completion_replaces_fallback_review() {
  prepare_ci_review_case
  local marker fallback_marker
  marker="<!-- codex-pr-review:15:${CI_HEAD} -->"
  fallback_marker="<!-- codex-pr-review-no-ci:15:${CI_HEAD} -->"
  jq -n --arg marker "$marker" --arg fallback "$fallback_marker" \
    '{id: 41, login: "github-actions[bot]", body: ($marker + "\\n" + $fallback)}' \
    >"$STUB_DIR/comments.jsonl"
  printf '{"count": 1, "check_runs": [{"id": 1, "name": "quality-gate", "status": "completed", "conclusion": "success", "completed_at": "2026-08-25T10:00:00Z"}]}' \
    >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=workflow_run \
    CODEX_EXPECTED_HEAD_SHA="$CI_HEAD" \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )) || [[ ! -s "$STUB_DIR/captured-input.md" ]]; then
    fail 'A completed CI run did not replace the earlier no-CI fallback review.'
    cat "$STUB_DIR/run.log" >&2
  fi
  if [[ ! -s "$STUB_DIR/patched.log" ]] || [[ -s "$STUB_DIR/posted.log" ]]; then
    fail 'A completed CI run did not edit the existing no-CI fallback comment in place.'
  fi
}

check_ci_completion_replaces_ordinary_review() {
  prepare_ci_review_case
  local marker
  marker="<!-- codex-pr-review:15:${CI_HEAD} -->"
  jq -n --arg marker "$marker" \
    '{id: 42, login: "github-actions[bot]", body: ($marker + "\nordinary review")}' \
    >"$STUB_DIR/comments.jsonl"
  printf '{"count": 1, "check_runs": [{"id": 1, "name": "quality-gate", "status": "completed", "conclusion": "success", "completed_at": "2026-08-25T10:00:00Z"}]}' \
    >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=workflow_run \
    CODEX_EXPECTED_HEAD_SHA="$CI_HEAD" \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )) || [[ ! -s "$STUB_DIR/captured-input.md" ]]; then
    fail 'A completed CI run did not regenerate an ordinary same-head review.'
    cat "$STUB_DIR/run.log" >&2
  fi
  if [[ ! -s "$STUB_DIR/patched.log" ]] || [[ -s "$STUB_DIR/posted.log" ]]; then
    fail 'A completed CI run did not replace the ordinary same-head review in place.'
  fi
}

check_closed_pr_workflow_run_is_skipped() {
  prepare_ci_review_case
  jq '.state = "CLOSED"' "$STUB_DIR/metadata.json" >"$STUB_DIR/metadata.closed.json"
  mv "$STUB_DIR/metadata.closed.json" "$STUB_DIR/metadata.json"
  printf '{"count": 1, "check_runs": [{"id": 1, "name": "quality-gate", "status": "completed", "conclusion": "success", "completed_at": "2026-08-25T10:00:00Z"}]}' \
    >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=workflow_run \
    CODEX_EXPECTED_HEAD_SHA="$CI_HEAD" \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )); then
    fail 'A closed PR workflow_run failed instead of being skipped.'
    cat "$STUB_DIR/run.log" >&2
  fi
  if [[ -s "$STUB_DIR/responses-argv.log" ]] || grep -Fq '/check-runs' "$STUB_DIR/api.log"; then
    fail 'A closed PR workflow_run reached review or evidence collection.'
  fi
}

check_direct_path_with_ci_run_defers() {
  prepare_ci_review_case
  jq -n --arg sha "$CI_HEAD" \
    '{workflow_runs: [{event: "pull_request", head_sha: $sha}]}' >"$STUB_DIR/workflow-runs.json"
  printf '{"count": 0, "check_runs": []}' >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=pull_request_target \
    CODEX_PR_ACTION=synchronize \
    CODEX_CI_WORKFLOW_FILE=ci.yml \
    CODEX_CI_DISCOVERY_SECONDS=1 \
    CODEX_CI_DISCOVERY_POLL_SECONDS=1 \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )); then
    fail 'The direct push path did not exit zero while deferring to CI completion.'
    cat "$STUB_DIR/run.log" >&2
  fi
  if [[ -s "$STUB_DIR/responses-argv.log" ]] || grep -Fq '/check-runs' "$STUB_DIR/api.log"; then
    fail 'A direct push covered by CI was reviewed twice.'
  fi
}

check_failed_ci_run_probe_fails_safe_toward_review() {
  prepare_ci_review_case
  printf 'not-json' >"$STUB_DIR/workflow-runs.json"
  printf '{"count": 0, "check_runs": []}' >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=pull_request_target \
    CODEX_PR_ACTION=synchronize \
    CODEX_CI_WORKFLOW_FILE=ci.yml \
    CODEX_CI_DISCOVERY_SECONDS=1 \
    CODEX_CI_DISCOVERY_POLL_SECONDS=1 \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )) || [[ ! -s "$STUB_DIR/responses-argv.log" ]]; then
    fail 'A failed CI discovery probe did not fail safe toward reviewing.'
    cat "$STUB_DIR/run.log" >&2
  fi
}

check_workflow_run_path_never_probes_for_a_run() {
  prepare_ci_review_case
  printf 'sentinel-if-probed' >"$STUB_DIR/workflow-runs.json"
  printf '{"count": 0, "check_runs": []}' >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=workflow_run \
    CODEX_EXPECTED_HEAD_SHA="$CI_HEAD" \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )) || grep -Fq '/actions/workflows/' "$STUB_DIR/api.log"; then
    fail 'The workflow_run path probed for a second CI run.'
    cat "$STUB_DIR/run.log" >&2
  fi
}

check_empty_ci_evidence_is_explicit() {
  prepare_ci_review_case
  printf '{"count": 0, "check_runs": []}' >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=workflow_run \
    CODEX_EXPECTED_HEAD_SHA="$CI_HEAD" \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )) || \
    ! grep -Fiq 'not available at review time' "$STUB_DIR/captured-input.md"; then
    fail 'Absent completed checks were not made explicit to the reviewer.'
    cat "$STUB_DIR/run.log" >&2
  fi
}

check_oversized_raw_ci_evidence_degrades_explicitly() {
  prepare_ci_review_case
  jq -n --arg payload "$(printf 'raw-sensitive-payload-%.0s' {1..300})" \
    '{total_count: 1, check_runs: [], payload: $payload}' >"$STUB_DIR/check-runs.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=workflow_run \
    CODEX_EXPECTED_HEAD_SHA="$CI_HEAD" \
    CODEX_CHECK_MAX_ITEMS=50 \
    CODEX_CHECK_MAX_BYTES=20000 \
    CODEX_CHECK_MAX_RAW_BYTES=128
  if (( CI_REVIEW_STATUS != 0 )); then
    fail 'An oversized raw check-run response failed the review instead of degrading explicitly.'
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if ! grep -Fiq 'not available at review time' "$STUB_DIR/captured-input.md"; then
    fail 'An oversized raw check-run response did not become explicit unavailable evidence.'
  fi
  if grep -Fq 'raw-sensitive-payload' "$STUB_DIR/captured-input.md"; then
    fail 'An oversized raw check-run response reached the model input.'
  fi
}

check_check_run_item_and_page_limits_are_enforced() {
  prepare_ci_review_case
  jq -n '{total_count: 4, check_runs: [
    {id: 1, name: "check-a", status: "completed", conclusion: "success"},
    {id: 2, name: "check-b", status: "completed", conclusion: "success"},
    {id: 3, name: "check-c", status: "completed", conclusion: "failure"},
    {id: 4, name: "check-d", status: "completed", conclusion: "success"}
  ]}' >"$STUB_DIR/check-runs-${CI_HEAD}.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=workflow_run \
    CODEX_EXPECTED_HEAD_SHA="$CI_HEAD" \
    CODEX_CHECK_MAX_ITEMS=2 \
    CODEX_CHECK_MAX_PAGES=10 \
    CODEX_CHECK_MAX_BYTES=20000 \
    CODEX_CHECK_MAX_RAW_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )); then
    fail 'The check-run item-limit case failed.'
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if [[ "$(wc -l <"$STUB_DIR/check-query.log" | tr -d ' ')" != 1 ]] ||
    ! grep -Fq $'\t1\t2' "$STUB_DIR/check-query.log"; then
    fail 'The check-run item limit did not stop after one bounded page request.'
  fi
  if ! grep -Fq '"omitted_count": 2' "$STUB_DIR/captured-input.md"; then
    fail 'The check-run item limit did not report the omitted count.'
  fi

  prepare_ci_review_case
  jq -n '{total_count: 4, check_runs: [
    {id: 1, name: "page-one-a", status: "completed", conclusion: "success"},
    {id: 2, name: "page-one-b", status: "completed", conclusion: "success"}
  ]}' >"$STUB_DIR/check-runs-${CI_HEAD}-page-1.json"
  jq -n '{total_count: 4, check_runs: [
    {id: 3, name: "page-two-a", status: "completed", conclusion: "failure"},
    {id: 4, name: "page-two-b", status: "completed", conclusion: "success"}
  ]}' >"$STUB_DIR/check-runs-${CI_HEAD}-page-2.json"

  invoke_ci_review_case \
    CODEX_EVENT_NAME=workflow_run \
    CODEX_EXPECTED_HEAD_SHA="$CI_HEAD" \
    CODEX_CHECK_MAX_ITEMS=4 \
    CODEX_CHECK_MAX_PAGES=1 \
    CODEX_CHECK_MAX_BYTES=20000 \
    CODEX_CHECK_MAX_RAW_BYTES=20000
  if (( CI_REVIEW_STATUS != 0 )); then
    fail 'The check-run page-limit case failed.'
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if [[ "$(wc -l <"$STUB_DIR/check-query.log" | tr -d ' ')" != 1 ]] ||
    ! grep -Fq $'\t1\t4' "$STUB_DIR/check-query.log"; then
    fail 'The check-run page limit did not stop after the configured page count.'
  fi
  if ! grep -Fq '"omitted_count": 2' "$STUB_DIR/captured-input.md" ||
    ! grep -Fq '"truncated": true' "$STUB_DIR/captured-input.md"; then
    fail 'The check-run page limit did not report truncated evidence.'
  fi
}

# ---------------------------------------------------------------------------
# Task 6: trusted context references are read from the stamped Git object,
# bounded by count/bytes, and kept in the trusted instructions channel.
# ---------------------------------------------------------------------------
prepare_context_case() {
  : >"$STUB_DIR/posted.log"
  : >"$STUB_DIR/head-override"
  : >"$STUB_DIR/api.log"
  : >"$STUB_DIR/responses-argv.log"
  rm -f "$STUB_DIR/captured-input.md" "$STUB_DIR/captured-instructions.md"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"
  printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"
  jq -n --arg sha "$CI_HEAD" \
    '{number: 15, title: "t", body: "b", url: "u", baseRefName: "main",
      headRefName: "topic", headRefOid: $sha}' >"$STUB_DIR/metadata.json"
}

invoke_context_case() {
  local status=0
  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$@" \
    "$ROOT/scripts/codex_review_pr.sh" 15 >"$STUB_DIR/run.log" 2>&1 || status=$?
  return "$status"
}

check_context_allowlist_comes_from_trusted_sha() {
  local root_allowlist="$ROOT/.github/codex/context-files.txt"
  local attacker_path="$ROOT/docs/codex-context-attacker.md"
  local saved_allowlist="$STUB_DIR/context-files.saved"
  local had_allowlist=0
  local status=0

  if [[ -f "$root_allowlist" ]]; then
    cp "$root_allowlist" "$saved_allowlist"
    had_allowlist=1
  fi
  mkdir -p "$(dirname "$root_allowlist")" "$(dirname "$attacker_path")"
  printf 'docs/codex-context-attacker.md\n' >"$root_allowlist"
  printf 'PR-SIDE-CONTEXT-MUST-NOT-REACH-TRUSTED-CHANNEL\n' >"$attacker_path"

  prepare_context_case
  invoke_context_case \
    CODEX_CONTEXT_MAX_FILES=10 \
    CODEX_CONTEXT_MAX_BYTES=50000 || status=$?

  if (( had_allowlist )); then
    cp "$saved_allowlist" "$root_allowlist"
  else
    rm -f "$root_allowlist"
  fi
  rm -f "$attacker_path"

  if (( status != 0 )); then
    fail 'Trusted context review failed while testing allowlist provenance.'
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if ! grep -Fq '## Trusted reference material (not policy)' \
    "$STUB_DIR/captured-instructions.md"; then
    fail 'Trusted context heading was missing from the instructions channel.'
  fi
  if ! grep -Fq 'TRUSTED_WORKFLOW_CONTEXT_SENTINEL' \
    "$STUB_DIR/captured-instructions.md"; then
    fail 'The allowlist from TRUSTED_SHA did not include the trusted workflow.'
  fi
  if grep -Fq 'PR-SIDE-CONTEXT-MUST-NOT-REACH-TRUSTED-CHANNEL' \
    "$STUB_DIR/captured-instructions.md"; then
    fail 'A working-tree/PR-side allowlist entry reached trusted instructions.'
  fi
}

check_trusted_missing_context_path_is_skipped() {
  local allowlist="$TRUSTED_STAGING_ROOT/.github/codex/context-files.txt"
  printf '# trusted fixture\nmissing/from-trusted-object.md\n.github/workflows/codex-pr-review.yml\n' \
    >"$allowlist"

  prepare_context_case
  local status=0
  invoke_context_case \
    CODEX_CONTEXT_MAX_FILES=10 \
    CODEX_CONTEXT_MAX_BYTES=50000 || status=$?

  printf '# Trusted reference material supplied to the PR reviewer.\n.github/workflows/codex-pr-review.yml\n' \
    >"$allowlist"

  if (( status != 0 )); then
    fail 'A missing trusted context path failed the review.'
    cat "$STUB_DIR/run.log" >&2
  elif grep -Fq 'missing/from-trusted-object.md' "$STUB_DIR/captured-instructions.md"; then
    fail 'A missing trusted context path was emitted as reference material.'
  elif ! grep -Fq 'TRUSTED_WORKFLOW_CONTEXT_SENTINEL' \
    "$STUB_DIR/captured-instructions.md"; then
    fail 'A valid trusted context path was lost beside a missing path.'
  fi
}

check_trusted_context_caps() {
  local allowlist="$TRUSTED_STAGING_ROOT/.github/codex/context-files.txt"
  local context_dir="$TRUSTED_STAGING_ROOT/trusted-context"
  mkdir -p "$context_dir"
  : >"$allowlist"
  local index path
  for index in $(seq 1 11); do
    path="trusted-context/small-${index}.md"
    printf '%s\n' "small trusted context ${index}" >"$TRUSTED_STAGING_ROOT/$path"
    printf '%s\n' "$path" >>"$allowlist"
  done
  printf '%*s' 60000 '' | tr ' ' x >"$TRUSTED_STAGING_ROOT/trusted-context/oversized.md"
  printf '%s\n' 'trusted-context/oversized.md' >>"$allowlist"

  prepare_context_case
  local status=0
  invoke_context_case \
    CODEX_CONTEXT_MAX_FILES=10 \
    CODEX_CONTEXT_MAX_BYTES=50000 || status=$?

  printf '# Trusted reference material supplied to the PR reviewer.\n.github/workflows/codex-pr-review.yml\n' \
    >"$allowlist"

  if (( status != 0 )); then
    fail 'Trusted context caps caused the review to fail.'
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  local context_material="$STUB_DIR/context-material.md"
  awk '/## Trusted reference material \(not policy\)/{capture=1} capture{print}' \
    "$STUB_DIR/captured-instructions.md" >"$context_material"
  local included_count context_bytes
  included_count="$(grep -c '^### Reference:' "$context_material" || true)"
  context_bytes="$(wc -c <"$context_material" | tr -d ' ')"
  if (( included_count > 10 )); then
    fail "Trusted context included $included_count files despite CODEX_CONTEXT_MAX_FILES=10."
  fi
  if (( context_bytes > 50000 )); then
    fail "Trusted context included $context_bytes bytes despite CODEX_CONTEXT_MAX_BYTES=50000."
  fi
  if grep -Fq 'oversized.md' "$context_material"; then
    fail 'An oversized trusted context file was not skipped.'
  fi
}

check_trusted_context_wrapper_counts_toward_cap() {
  local allowlist="$TRUSTED_STAGING_ROOT/.github/codex/context-files.txt"
  local context_path="trusted-context/boundary.md"
  mkdir -p "$TRUSTED_STAGING_ROOT/trusted-context"
  printf '%s\n' "$context_path" >"$allowlist"
  printf '%*s' 49850 '' | tr ' ' x >"$TRUSTED_STAGING_ROOT/$context_path"

  prepare_context_case
  local status=0
  invoke_context_case \
    CODEX_CONTEXT_MAX_FILES=10 \
    CODEX_CONTEXT_MAX_BYTES=50000 || status=$?

  printf '# Trusted reference material supplied to the PR reviewer.\n.github/workflows/codex-pr-review.yml\n' \
    >"$allowlist"

  if (( status != 0 )); then
    fail 'Trusted context wrapper-boundary review failed.'
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  local context_material="${STUB_DIR}/context-material.md"
  awk '/## Trusted reference material \(not policy\)/{capture=1} capture{print}' \
    "$STUB_DIR/captured-instructions.md" >"$context_material"
  if grep -Fq "$context_path" "$context_material"; then
    fail 'A raw trusted file that exceeded the complete wrapper cap was emitted.'
  fi
  local context_bytes
  context_bytes="$(wc -c <"$context_material" | tr -d ' ')"
  if (( context_bytes > 50000 )); then
    fail "Trusted context wrapper exceeded CODEX_CONTEXT_MAX_BYTES: $context_bytes."
  fi
}

# ---------------------------------------------------------------------------
# T5: the per-branch Contract (docs/contracts/<branch>.md) must be read from
# THIS checkout -- main's version by construction, never fetched from the PR
# branch -- and must land only in the TRUSTED --instructions file, never in
# the untrusted --input file alongside the PR diff/metadata.
# ---------------------------------------------------------------------------
# Review P1 (head 2afd089): T5's contract injection is only tamper-proof if
# the checkout really is the trusted default branch. The script must refuse
# to run at all when the SHA it stands on differs from the stamped trusted
# SHA — a branch-controlled checkout must not be able to supply either the
# contract or the review policy to the instructions channel.
check_refuses_untrusted_checkout() {
  local branch="zz-codex-automation-test/untrusted-checkout"
  local status=0

  : >"$STUB_DIR/posted.log"
  printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"
  jq -n --arg branch "$branch" \
    '{number: 16, title: "t", body: "b", url: "u", baseRefName: "main",
      headRefName: $branch, headRefOid: "cafebabe"}' >"$STUB_DIR/metadata.json"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"

  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_TRUSTED_SHA="0000000000000000000000000000000000000000" \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/scripts/codex_review_pr.sh" 16 >"$STUB_DIR/run.log" 2>&1 || status=$?

  if (( status == 0 )); then
    fail 'codex_review_pr.sh ran on a checkout that does not match the trusted SHA.'
  fi
  if [[ -s "$STUB_DIR/posted.log" ]]; then
    fail 'An untrusted checkout still reached comment publication.'
  fi
}

# Issue #48: the workflow's stamp proves intent, but only the REMOTE proves
# where the default branch actually points. A feature checkout that stamps
# its own HEAD (CODEX_TRUSTED_SHA=$(git rev-parse HEAD)) must still be
# refused because origin's default-branch tip differs.
check_refuses_non_default_branch_head() {
  local branch="zz-codex-automation-test/feature-checkout"
  local status=0

  : >"$STUB_DIR/posted.log"
  printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"
  jq -n --arg branch "$branch" \
    '{number: 17, title: "t", body: "b", url: "u", baseRefName: "main",
      headRefName: $branch, headRefOid: "beefcace"}' >"$STUB_DIR/metadata.json"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"

  # The self-attacked setup: the caller stamps its own checkout's HEAD.
  local self_sha
  self_sha="$(git -C "$ROOT" rev-parse HEAD)"
  printf '%s\n' "0000000000000000000000000000000000000000" >"$STUB_DIR/remote-tip"

  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_TRUSTED_SHA="$self_sha" \
    CODEX_DEFAULT_BRANCH=main \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/scripts/codex_review_pr.sh" 17 >"$STUB_DIR/run.log" 2>&1 || status=$?

  # Restore the honest remote for subsequent checks.
  printf '%s\n' "$ROOT_HEAD_SHA" >"$STUB_DIR/remote-tip"

  if (( status == 0 )); then
    fail 'codex_review_pr.sh accepted a self-stamped SHA that origin contradicts.'
  fi
  if [[ -s "$STUB_DIR/posted.log" ]]; then
    fail 'A self-stamped non-default checkout still reached comment publication.'
  fi
}

# The trust root must fail CLOSED when the forge cannot be consulted or
# answers with something that is not a commit SHA (an error document, an empty
# body, a truncated value). Without the shape check, a garbage answer would
# fall through to a string comparison and merely produce a confusing refusal
# instead of the honest "cannot verify" one.
check_refuses_unresolvable_default_branch_tip() {
  local branch="zz-codex-automation-test/unresolvable-tip"
  local status=0

  : >"$STUB_DIR/posted.log"
  printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"
  jq -n --arg branch "$branch" \
    '{number: 18, title: "t", body: "b", url: "u", baseRefName: "main",
      headRefName: $branch, headRefOid: "beefcace"}' >"$STUB_DIR/metadata.json"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"

  # The API answers, but not with a SHA -- the shape a rate-limit or
  # not-found body would produce once --jq finds no .object.sha.
  printf '%s\n' "null" >"$STUB_DIR/remote-tip"

  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/scripts/codex_review_pr.sh" 18 >"$STUB_DIR/run.log" 2>&1 || status=$?

  # Restore the honest tip for subsequent checks.
  printf '%s\n' "$ROOT_HEAD_SHA" >"$STUB_DIR/remote-tip"

  if (( status == 0 )); then
    fail 'codex_review_pr.sh ran with a default-branch tip it could not resolve.'
  fi
  if ! grep -q 'independently verified default branch' "$STUB_DIR/run.log"; then
    fail 'An unresolvable default-branch tip did not produce the verification refusal.'
  fi
  if [[ -s "$STUB_DIR/posted.log" ]]; then
    fail 'An unresolvable default-branch tip still reached comment publication.'
  fi
}

# A caller naming a NON-default branch must be refused. Without this, push
# access to any branch of the real repository is enough to have
# branch-controlled text injected as trusted policy -- the review still posts
# to the real PR, because only GH_REPO is bound to the output side.
check_refuses_non_default_policy_branch() {
  local branch="zz-codex-automation-test/policy-branch"
  local status=0

  : >"$STUB_DIR/posted.log"
  printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"
  jq -n --arg branch "$branch" \
    '{number: 19, title: "t", body: "b", url: "u", baseRefName: "main",
      headRefName: $branch, headRefOid: "beefcace"}' >"$STUB_DIR/metadata.json"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"

  # The forge still says the default branch is main; the caller claims another.
  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=attacker-controlled \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/scripts/codex_review_pr.sh" 19 >"$STUB_DIR/run.log" 2>&1 || status=$?

  if (( status == 0 )); then
    fail 'codex_review_pr.sh read trusted policy from a caller-named non-default branch.'
  fi
  if ! grep -q 'non-default branch' "$STUB_DIR/run.log"; then
    fail 'A non-default policy branch did not produce the default-branch refusal.'
  fi
  if [[ -s "$STUB_DIR/posted.log" ]]; then
    fail 'A non-default policy branch still reached comment publication.'
  fi
}

check_contract_lands_in_trusted_channel_only() {
  local branch="zz-codex-automation-test/contract-fixture"
  # Same slug-and-hash derivation as codex_review_pr.sh's CONTRACT_PATH.
  local contract_hash
  contract_hash="$(python3 -c 'import hashlib, sys; sys.stdout.write(hashlib.sha256(sys.argv[1].encode()).hexdigest()[:12])' "$branch")"
  local contract_rel="docs/contracts/${branch//\//-}-${contract_hash}.md"
  local contract_path="$TRUSTED_STAGING_ROOT/$contract_rel"
  local sentinel="ZZ_T5_CONTRACT_SENTINEL_DO_NOT_MATCH_ELSEWHERE"
  local status=0

  mkdir -p "$(dirname "$contract_path")"
  printf '# Contract: %s\n\nOut of scope: %s\n' "$branch" "$sentinel" >"$contract_path"

  : >"$STUB_DIR/posted.log"
  : >"$STUB_DIR/head-override"
  rm -f "$STUB_DIR/captured-instructions.md" "$STUB_DIR/captured-input.md"
  printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"
  jq -n --arg branch "$branch" \
    '{number: 15, title: "t", body: "b", url: "u", baseRefName: "main",
      headRefName: $branch, headRefOid: "deadbeef"}' >"$STUB_DIR/metadata.json"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"

  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/scripts/codex_review_pr.sh" 15 >"$STUB_DIR/run.log" 2>&1 || status=$?

  rm -f "$contract_path"

  if (( status != 0 )); then
    fail "codex_review_pr.sh exited $status while checking contract channel placement"
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if [[ ! -s "$STUB_DIR/captured-instructions.md" ]]; then
    fail 'codex_review_pr.sh did not pass an --instructions file to codex_responses.py'
  elif ! grep -Fq -- "$sentinel" "$STUB_DIR/captured-instructions.md"; then
    fail 'A present docs/contracts/<branch>.md did not land in the trusted instructions file.'
  fi
  if [[ -s "$STUB_DIR/captured-input.md" ]] && grep -Fq -- "$sentinel" "$STUB_DIR/captured-input.md"; then
    fail 'The per-branch Contract leaked into the untrusted review-input.md channel.'
  fi
}

# ---------------------------------------------------------------------------
# Review fix: docs/contracts/ is a flat namespace keyed on the branch name
# alone, so a PR branch that happens to resolve to a stray non-contract file
# at that path (mirrors docs/contracts/README.md's own real shape: present,
# non-empty, but headed "# Contracts" -- plural, no colon -- not
# "# Contract:") must NOT have that file's content injected as a signed-off
# scope contract. It must fall back to the same "no contract" text a missing
# file produces.
# ---------------------------------------------------------------------------
check_non_contract_file_is_ignored() {
  local branch="zz-codex-automation-test/not-a-contract"
  local contract_path="$ROOT/docs/contracts/${branch//\//-}.md"
  local sentinel="ZZ_T5_NOT_A_CONTRACT_SENTINEL_DO_NOT_MATCH_ELSEWHERE"
  local status=0

  mkdir -p "$(dirname "$contract_path")"
  # Mirrors the real format doc's own header: "# Contracts" (plural, no
  # colon) is not "# Contract:" and must not be treated as a per-branch
  # contract just because a file happens to sit at this path.
  printf '# Contracts\n\nSome unrelated body text: %s\n' "$sentinel" >"$contract_path"

  : >"$STUB_DIR/posted.log"
  : >"$STUB_DIR/head-override"
  rm -f "$STUB_DIR/captured-instructions.md" "$STUB_DIR/captured-input.md"
  printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"
  jq -n --arg branch "$branch" \
    '{number: 15, title: "t", body: "b", url: "u", baseRefName: "main",
      headRefName: $branch, headRefOid: "deadbeef"}' >"$STUB_DIR/metadata.json"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"

  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/scripts/codex_review_pr.sh" 15 >"$STUB_DIR/run.log" 2>&1 || status=$?

  rm -f "$contract_path"

  if (( status != 0 )); then
    fail "codex_review_pr.sh exited $status while checking the non-contract fallback"
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if [[ ! -s "$STUB_DIR/captured-instructions.md" ]]; then
    fail 'codex_review_pr.sh did not pass an --instructions file to codex_responses.py'
    return
  fi
  if grep -Fq -- "$sentinel" "$STUB_DIR/captured-instructions.md"; then
    fail 'A present-but-not-"# Contract:"-headed file was injected as a signed-off contract.'
  fi
  if ! grep -Fq -- 'No contract on main for this branch; nothing is out of scope.' "$STUB_DIR/captured-instructions.md"; then
    fail 'A non-contract file present at the contract path did not fall back to "no contract".'
  fi
}

# MINOR fail-safe: `-s` alone is true for a directory too. If CONTRACT_PATH
# ever resolved to a directory, a bare `-s` guard would let the following
# `cat` fail and abort the whole script under `set -euo pipefail` (a loud CI
# failure with no review posted) instead of falling back to "no contract".
check_contract_path_as_directory_is_ignored() {
  local branch="zz-codex-automation-test/dir-not-a-file"
  local contract_path="$ROOT/docs/contracts/${branch//\//-}.md"
  local status=0

  rm -rf "$contract_path"
  mkdir -p "$contract_path"

  : >"$STUB_DIR/posted.log"
  : >"$STUB_DIR/head-override"
  rm -f "$STUB_DIR/captured-instructions.md" "$STUB_DIR/captured-input.md"
  printf 'diff --git a/a b/a\n+line\n' >"$STUB_DIR/pr.diff"
  jq -n --arg branch "$branch" \
    '{number: 15, title: "t", body: "b", url: "u", baseRefName: "main",
      headRefName: $branch, headRefOid: "deadbeef"}' >"$STUB_DIR/metadata.json"
  printf '%s\n' "$(jq -n '{login: "someone-else", body: "no marker here"}')" \
    >"$STUB_DIR/comments.jsonl"

  env \
    PATH="$STUB_DIR:$PATH" \
    CODEX_STUB_DIR="$STUB_DIR" \
    CODEX_REAL_PYTHON3="$REAL_PYTHON3" \
    CODEX_REVIEW_ENABLED=true \
    OPENAI_API_KEY=stub-key \
    GH_TOKEN=stub-token \
    GH_REPO=nifabulous/Relay \
    CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
    CODEX_MODEL=gpt-5.3-codex \
    CODEX_REASONING_EFFORT=medium \
    CODEX_MAX_INPUT_BYTES=120000 \
    CODEX_MAX_OUTPUT_TOKENS=32000 \
    CODEX_MAX_OUTPUT_BYTES=50000 \
    CODEX_BOT_LOGIN='github-actions[bot]' \
    "$ROOT/scripts/codex_review_pr.sh" 15 >"$STUB_DIR/run.log" 2>&1 || status=$?

  rm -rf "$contract_path"

  if (( status != 0 )); then
    fail "codex_review_pr.sh exited $status when the contract path resolved to a directory"
    cat "$STUB_DIR/run.log" >&2
    return
  fi
  if [[ ! -s "$STUB_DIR/captured-instructions.md" ]]; then
    fail 'codex_review_pr.sh did not pass an --instructions file to codex_responses.py'
    return
  fi
  if ! grep -Fq -- 'No contract on main for this branch; nothing is out of scope.' "$STUB_DIR/captured-instructions.md"; then
    fail 'A directory at the contract path did not fall back to "no contract".'
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
  CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
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
  CODEX_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    CODEX_DEFAULT_BRANCH=main \
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

check_refuses_untrusted_checkout
check_refuses_non_default_branch_head
check_refuses_unresolvable_default_branch_tip
check_refuses_non_default_policy_branch
check_contract_lands_in_trusted_channel_only

check_non_contract_file_is_ignored

check_contract_path_as_directory_is_ignored

check_oversized_review_input_is_refused

check_matching_completed_ci_head_reaches_model
check_stale_workflow_run_exits_before_model
check_direct_path_without_ci_run_reviews
check_non_pr_ci_run_does_not_defer
check_delayed_ci_completion_replaces_fallback_review
check_ci_completion_replaces_ordinary_review
check_closed_pr_workflow_run_is_skipped
check_direct_path_with_ci_run_defers
check_failed_ci_run_probe_fails_safe_toward_review
check_workflow_run_path_never_probes_for_a_run
check_empty_ci_evidence_is_explicit
check_oversized_raw_ci_evidence_degrades_explicitly
check_check_run_item_and_page_limits_are_enforced
check_context_allowlist_comes_from_trusted_sha
check_trusted_missing_context_path_is_skipped
check_trusted_context_caps
check_trusted_context_wrapper_counts_toward_cap

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
