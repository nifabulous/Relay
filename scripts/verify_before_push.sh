#!/usr/bin/env bash
set -euo pipefail

# Run the same high-signal local gates that should be completed before a
# maintainer asks for review or performs an externally visible write. This
# script never stages, commits, pushes, merges, deploys, or changes GitHub.

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <base-ref-or-sha>" >&2
  exit 2
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

BASE_REF="$1"
if ! BASE_SHA="$(git rev-parse --verify "${BASE_REF}^{commit}")"; then
  echo "unable to resolve verification base: $BASE_REF" >&2
  exit 1
fi
HEAD_SHA="$(git rev-parse --verify HEAD)"

echo "== Relay pre-push verification =="
echo "base: $BASE_REF ($BASE_SHA)"
echo "commit: $HEAD_SHA"
echo "range: $BASE_SHA..$HEAD_SHA"
echo "branch: $(git branch --show-current)"

echo "[1/10] Checking committed-range and working-tree whitespace errors"
git diff --check "$BASE_SHA" "$HEAD_SHA"
git diff --check
git diff --cached --check

echo "[2/10] Checking Python lint"
if [[ -x "$REPO_ROOT/.venv/bin/ruff" ]]; then
  "$REPO_ROOT/.venv/bin/ruff" check .
elif command -v ruff >/dev/null 2>&1; then
  ruff check .
else
  echo "ruff is required; install the development dependencies first." >&2
  exit 1
fi

PYTHON="python3"
if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
  PYTHON="$REPO_ROOT/.venv/bin/python"
fi

if [[ ! -x "$REPO_ROOT/frontend/node_modules/.bin/vite" ]]; then
  echo "frontend dependencies are missing; run 'npm ci' in frontend first." >&2
  exit 1
fi

echo "[3/10] Typechecking the frontend"
(cd "$REPO_ROOT/frontend" && ./node_modules/.bin/tsc --noEmit)

echo "[4/10] Building the production frontend with Sentry upload disabled"
env SENTRY_AUTH_TOKEN= SENTRY_ORG= SENTRY_PROJECT= \
  npm --prefix frontend run build

echo "[5/10] Running the full backend test suite in an isolated SQLite database"
TEST_DB_DIR="$(mktemp -d /tmp/relay-prepush-db.XXXXXX)"
trap 'rm -rf -- "$TEST_DB_DIR"' EXIT
TEST_DATABASE_URL="sqlite:////${TEST_DB_DIR#/}/swift_routing.db"
DATABASE_URL="$TEST_DATABASE_URL" "$PYTHON" -m pytest tests/ -q

echo "[6/10] Running the full frontend suite"
npm --prefix frontend test -- --run --no-file-parallelism

echo "[7/10] Checking the bundle budget"
npm --prefix frontend run check:bundle

PUBLIC_ASSETS="$REPO_ROOT/app/static/relay/assets"
if [[ -d "$PUBLIC_ASSETS" ]]; then
  echo "[8/10] Inspecting public build artifacts"
  for required_tool in find rg; do
    if ! command -v "$required_tool" >/dev/null 2>&1; then
      echo "required artifact scanner is unavailable: $required_tool" >&2
      exit 1
    fi
  done

  MAP_SCAN_OUTPUT=""
  if ! MAP_SCAN_OUTPUT="$(find "$PUBLIC_ASSETS" -type f -name '*.map' -print -quit 2>/dev/null)"; then
    echo "source-map artifact scan failed" >&2
    exit 1
  fi
  if [[ -n "$MAP_SCAN_OUTPUT" ]]; then
    echo "public source maps found in $PUBLIC_ASSETS" >&2
    exit 1
  fi

  RG_STATUS=0
  rg -q --hidden --glob '!*.map' 'SENTRY_AUTH_TOKEN|sntrys_[A-Za-z0-9._-]+' "$PUBLIC_ASSETS" || RG_STATUS=$?
  case "$RG_STATUS" in
    0)
      echo "Sentry credential material found in public assets" >&2
      exit 1
      ;;
    1)
      ;;
    *)
      echo "credential artifact scan failed" >&2
      exit 1
      ;;
  esac
else
  echo "public frontend output is missing after build" >&2
  exit 1
fi

FINAL_HEAD_SHA="$(git rev-parse --verify HEAD)"
if [[ "$FINAL_HEAD_SHA" != "$HEAD_SHA" ]]; then
  echo "HEAD changed during verification: started at $HEAD_SHA, now at $FINAL_HEAD_SHA" >&2
  exit 1
fi

echo "[9/10] Showing the final scope for human review"
git status --short
git diff --stat
git diff --cached --stat

echo "[10/10] Final base/head identity is $BASE_SHA..$FINAL_HEAD_SHA"

echo "Pre-push verification passed for $BASE_SHA..$FINAL_HEAD_SHA. A human must still inspect the diff, review current-head comments/checks, and authorize any external write."
