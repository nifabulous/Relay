#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
common_git_dir="$(git -C "$repo_root" rev-parse --git-common-dir 2>/dev/null || true)"
common_root="$repo_root"

if [[ -n "$common_git_dir" ]]; then
  if [[ "$common_git_dir" != /* ]]; then
    common_git_dir="$repo_root/$common_git_dir"
  fi
  common_root="$(cd -- "$(dirname -- "$common_git_dir")" && pwd)"
fi

server_args=(app.main:app --host 127.0.0.1 --port 8000)

for uvicorn_path in "$repo_root/.venv/bin/uvicorn" "$common_root/.venv/bin/uvicorn"; do
  if [[ -x "$uvicorn_path" ]]; then
    exec "$uvicorn_path" "${server_args[@]}"
  fi
done

if command -v python3 >/dev/null 2>&1 && python3 -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  exec python3 -m uvicorn "${server_args[@]}"
fi

if command -v uv >/dev/null 2>&1; then
  exec uv run --project "$repo_root" uvicorn "${server_args[@]}"
fi

printf '%s\n' "Unable to start the E2E backend: no usable uvicorn environment was found." "Create .venv and install the project with: python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'" "Or install uv so the runner can provision the project environment automatically." >&2
exit 127
