#!/usr/bin/env bash
set -euo pipefail

if [[ "${LOOPKEEPER_CONTRACT_NETWORK:-0}" != "1" ]]; then
  echo 'Loopkeeper writer contract skipped (set LOOPKEEPER_CONTRACT_NETWORK=1 to run).'
  exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PINNED_SHA="ff1dbeb4f3eee1a45dc34ad1e02c062b93d26231"
ROOT_HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

LOOPKEEPER_ROOT="$STAGING/loopkeeper"
git clone --filter=blob:none --no-checkout https://github.com/nifabulous/loopkeeper.git "$LOOPKEEPER_ROOT" >/dev/null 2>&1
git -C "$LOOPKEEPER_ROOT" fetch --depth=1 origin "$PINNED_SHA" >/dev/null 2>&1
git -C "$LOOPKEEPER_ROOT" checkout --detach "$PINNED_SHA" >/dev/null 2>&1

ARTIFACT="$STAGING/review.md"
cat >"$ARTIFACT" <<'EOF'
Artifact-only writer contract.

<!-- loopkeeper-verdict: {"schema":2,"verdict":"CLEAN","findings":[]} -->
EOF

FAKE_BIN="$STAGING/bin"
mkdir -p "$FAKE_BIN"
ln -s "$ROOT/tests/fixtures/fake_loopkeeper_writer_gh" "$FAKE_BIN/gh"

REAL_PYTHON3="$(python3 -c 'import sys; print(sys.executable)')"
cat >"$FAKE_BIN/python3" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\$*" == *"-m loopkeeper.transport"* ]]; then
  echo 'loopkeeper.transport must not run in artifact-only mode' >&2
  exit 97
fi
exec "$REAL_PYTHON3" "\$@"
EOF
chmod +x "$FAKE_BIN/python3"

GH_LOG="$STAGING/gh.log"
touch "$GH_LOG"
LOOPKEEPER_ARTIFACT_DIR="$STAGING/writer-artifacts"

(
  cd "$ROOT"
  env \
    PATH="$FAKE_BIN:$PATH" \
    FAKE_GH_LOG="$GH_LOG" \
    FAKE_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    GH_TOKEN=fake \
    GH_REPO=nifabulous/Relay \
    LOOPKEEPER_ROOT="$LOOPKEEPER_ROOT" \
    PYTHONPATH="$LOOPKEEPER_ROOT/src" \
    LOOPKEEPER_REVIEW_ARTIFACT="$ARTIFACT" \
    LOOPKEEPER_REVIEW_ENABLED=true \
    LOOPKEEPER_TRUSTED_SHA="$ROOT_HEAD_SHA" \
    LOOPKEEPER_DEFAULT_BRANCH=main \
    LOOPKEEPER_MODEL=contract-model \
    LOOPKEEPER_REASONING_EFFORT=medium \
    LOOPKEEPER_MAX_INPUT_BYTES=600000 \
    LOOPKEEPER_MAX_OUTPUT_TOKENS=32000 \
    LOOPKEEPER_MAX_OUTPUT_BYTES=50000 \
    LOOPKEEPER_REQUEST_TIMEOUT=1 \
    LOOPKEEPER_JOB_TIMEOUT_SECONDS=30 \
    LOOPKEEPER_CI_WORKFLOW_NAME=CI \
    LOOPKEEPER_CI_WORKFLOW_FILE=ci.yml \
    LOOPKEEPER_POLICY_PATH=.github/codex/review-policy.md \
    LOOPKEEPER_CONTEXT_PATH=.github/codex/context-files.txt \
    LOOPKEEPER_CHECK_MAX_RAW_BYTES=1000000 \
    LOOPKEEPER_OPERATOR=1 \
    LOOPKEEPER_EVENT_NAME=pull_request_target \
    LOOPKEEPER_PR_ACTION=closed \
    LOOPKEEPER_EXPECTED_HEAD_SHA="$ROOT_HEAD_SHA" \
    LOOPKEEPER_ARTIFACT_DIR="$LOOPKEEPER_ARTIFACT_DIR" \
    "$LOOPKEEPER_ROOT/adapters/github/review_pr.sh" 159
)

grep -Fq 'gh pr comment 159' "$GH_LOG"
if grep -Fq 'loopkeeper.transport' "$GH_LOG"; then
  echo 'unexpected model transport invocation recorded by fake gh' >&2
  exit 1
fi
[[ -s "$LOOPKEEPER_ARTIFACT_DIR/comment.md" ]]
echo 'Pinned Loopkeeper writer artifact-only contract passed.'
