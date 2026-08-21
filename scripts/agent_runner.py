#!/usr/bin/env python3
"""Run one `.claude/agents/` role definition through the configured model API.

The agent definitions are plain Markdown — YAML frontmatter for dispatch
metadata, then the role prompt — so Claude Code is one dispatcher for them,
not the only one. This runner executes the same role headlessly through the
same transport the reviewer uses (`codex_responses.py`), which makes every
agent slot a settings change rather than a rewrite: point `--model` (or the
per-agent env) at any provider the endpoint can serve.

The frontmatter `model:` key is a Claude tier alias consumed by Claude Code's
own dispatcher and is deliberately ignored here; this runner has no tier
vocabulary, only explicit model ids bound per agent.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import codex_responses  # noqa: E402

AGENTS_DIR = Path(__file__).resolve().parent.parent / ".claude" / "agents"
AGENT_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")

# A research memo is an order of magnitude smaller than a full review; the
# defaults follow the artifact, not the reviewer's budget. Every one is
# overridable because the ceilings are coherence-checked downstream.
DEFAULT_MAX_INPUT_BYTES = 120_000
DEFAULT_MAX_OUTPUT_TOKENS = 8_000
DEFAULT_MAX_OUTPUT_BYTES = 32_000


def agent_path(name: str) -> Path:
    if not AGENT_NAME_PATTERN.fullmatch(name):
        raise ValueError(
            f"agent name {name!r} must match {AGENT_NAME_PATTERN.pattern}"
        )
    path = AGENTS_DIR / f"{name}.md"
    if not path.is_file():
        raise ValueError(f"no agent definition at {path}")
    return path


def load_role_text(path: Path) -> str:
    """Return the role prompt: everything after the frontmatter fence.

    The frontmatter is dispatch metadata for interactive agents (name,
    description, tools, Claude tier alias). The body is the actual contract —
    and it is trusted instructions, so it rides the same channel the review
    policy does and is never silently truncated.
    """
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"{path.name}: missing YAML frontmatter fence")
    end = text.find("\n---", 4)
    if end == -1:
        raise ValueError(f"{path.name}: unterminated YAML frontmatter fence")
    return text[end + 4:].lstrip("\n")


def resolve_model(agent_name: str, override: str | None) -> str:
    """Bind a model id: flag > per-agent env > shared env, else fail loudly.

    The per-agent variable is derived from the definition's filename, so a
    new agent gains an override slot without code changing:
    ``domain-researcher`` binds through ``RELAY_AGENT_DOMAIN_RESEARCHER_MODEL``.
    """
    per_agent_env = "RELAY_AGENT_" + agent_name.upper().replace("-", "_") + "_MODEL"
    candidates = (
        ("--model", override),
        (per_agent_env, os.environ.get(per_agent_env)),
        ("RELAY_AGENT_MODEL", os.environ.get("RELAY_AGENT_MODEL")),
    )
    for source, value in candidates:
        if not value:
            continue
        if not codex_responses.MODEL_PATTERN.fullmatch(value):
            raise ValueError(
                f"model bound via {source} contains unsupported characters: {value!r}"
            )
        return value
    tried = ", ".join(name for name, _ in candidates)
    raise ValueError(
        f"no model bound for agent {agent_name!r}; pass --model or set one "
        f"of: {tried}"
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", required=True, help="agent definition stem under .claude/agents/")
    parser.add_argument("--input", required=True, dest="input_path", type=Path)
    parser.add_argument("--output", required=True, dest="output_path", type=Path)
    parser.add_argument(
        "--model", default=None,
        help="model id; defaults to RELAY_AGENT_<NAME>_MODEL, then RELAY_AGENT_MODEL",
    )
    parser.add_argument(
        "--reasoning-effort", default="none", choices=sorted(codex_responses.EFFORTS),
    )
    parser.add_argument(
        "--api-style", choices=sorted(codex_responses.API_STYLES), default=None,
        help="wire format: responses (default) or chat completions; "
        "defaults from CODEX_API_STYLE",
    )
    parser.add_argument(
        "--api-url", default=None,
        help="endpoint URL; defaults from CODEX_API_BASE_URL, else the "
        "per-style default endpoint",
    )
    parser.add_argument(
        "--max-input-bytes", type=int, default=DEFAULT_MAX_INPUT_BYTES,
    )
    parser.add_argument(
        "--max-output-tokens", type=int, default=DEFAULT_MAX_OUTPUT_TOKENS,
    )
    parser.add_argument(
        "--max-output-bytes", type=int, default=DEFAULT_MAX_OUTPUT_BYTES,
    )
    parser.add_argument(
        "--request-timeout", type=int, default=codex_responses.DEFAULT_REQUEST_TIMEOUT,
    )
    args = parser.parse_args(argv)
    # An unset --model is resolved later, against the env chain; a set one is
    # validated here so a bad id fails before anything is read.
    if args.model is not None and not codex_responses.MODEL_PATTERN.fullmatch(args.model):
        parser.error("--model contains unsupported characters")
    if args.max_input_bytes <= 0:
        parser.error("--max-input-bytes must be positive")
    if args.max_output_tokens <= 0:
        parser.error("--max-output-tokens must be positive")
    if args.max_output_bytes <= 0:
        parser.error("--max-output-bytes must be positive")
    if args.max_output_bytes > args.max_output_tokens * codex_responses.BYTES_PER_TOKEN:
        parser.error(
            "--max-output-bytes is unreachable at this --max-output-tokens "
            f"(ceiling must be at most {args.max_output_tokens * codex_responses.BYTES_PER_TOKEN})"
        )
    if args.request_timeout <= 0:
        parser.error("--request-timeout must be positive")
    required = (args.max_output_tokens * codex_responses.SECONDS_PER_1K_TOKENS) // 1000
    if args.request_timeout < required:
        parser.error(
            f"--request-timeout {args.request_timeout}s is too short for "
            f"--max-output-tokens {args.max_output_tokens} "
            f"(need at least {required}s)"
        )
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is required", file=sys.stderr)
        return 1
    try:
        agent_name = args.agent
        role_text = load_role_text(agent_path(agent_name))
        model = resolve_model(agent_name, args.model)
        api_style = codex_responses.resolve_api_style(args.api_style)
        api_url = codex_responses.resolve_api_url(api_style, args.api_url)

        # Same single-budget rule as the reviewer: the trusted role prompt is
        # drawn first and must arrive whole — a truncated role is a different
        # agent — and the untrusted input gets whatever is left.
        instructions = codex_responses.bound_input(role_text, args.max_input_bytes)
        if instructions != role_text:
            raise RuntimeError(
                "--max-input-bytes is too small for the complete role prompt"
            )
        remaining = args.max_input_bytes - len(instructions.encode("utf-8"))
        if remaining <= 0:
            raise RuntimeError(
                "--max-input-bytes leaves no room for the request payload after the role prompt"
            )
        prompt_text = args.input_path.read_text(encoding="utf-8")
        prompt = codex_responses.bound_input(prompt_text, remaining)

        result = codex_responses.request_response(
            model,
            args.reasoning_effort,
            instructions,
            prompt,
            api_key,
            args.max_output_tokens,
            args.max_output_bytes,
            args.request_timeout,
            api_style=api_style,
            api_url=api_url,
        )
        args.output_path.write_text(result, encoding="utf-8")
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
