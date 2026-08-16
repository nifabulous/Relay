#!/usr/bin/env python3
"""Call the OpenAI Responses API with explicitly supplied, bounded context."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import IO

API_URL = "https://api.openai.com/v1/responses"
MODEL_PATTERN = re.compile(r"^[A-Za-z0-9._:/-]+$")
EFFORTS = {"none", "low", "medium", "high", "xhigh"}
TRUNCATION_MARKER = "\n[TRUNCATED INPUT]"
OUTPUT_TRUNCATION_MARKER = "\n\n[TRUNCATED OUTPUT: the model hit max_output_tokens ({reason}). This review is incomplete.]"

# Rough bytes-per-token for Markdown. Used only to reject an output byte
# ceiling the token cap can never reach, so the two controls stay coherent.
BYTES_PER_TOKEN = 4

# The socket timeout and the token cap are one decision, not two. A reasoning
# model emits tokens slowly enough that a large budget legitimately outlives a
# short timeout, and aborting mid-generation loses the whole review rather than
# degrading it. This floor is deliberately conservative: at roughly 50 output
# tokens per second, 32000 tokens needs ~640s of headroom.
SECONDS_PER_1K_TOKENS = 20
DEFAULT_REQUEST_TIMEOUT = 900

# The socket timeout is bounded above as well as below. GitHub kills the job at
# its timeout-minutes regardless of what the request is doing, so a request
# allowed to run to the job deadline leaves nothing to sanitize and post the
# comment — the same "no review posted" outcome, reached from the other side.
#
# The budget is measured rather than assumed: the caller passes an absolute
# deadline stamped at job start, and what checkout, setup and sanitization
# actually cost is whatever has already elapsed by the time this runs. A static
# "setup headroom" constant would be one more guess to get wrong.
POSTING_HEADROOM_SECONDS = 180


def bound_input(text: str, max_bytes: int) -> str:
    """Return UTF-8 text no larger than max_bytes, marking truncation."""
    if max_bytes <= 0:
        raise ValueError("max_bytes must be positive")
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text

    marker = TRUNCATION_MARKER.encode("utf-8")
    if max_bytes <= len(marker):
        return marker[:max_bytes].decode("utf-8", errors="ignore")
    prefix = encoded[: max_bytes - len(marker)].decode("utf-8", errors="ignore")
    return prefix + TRUNCATION_MARKER


def build_payload(
    model: str,
    reasoning_effort: str,
    instructions: str,
    prompt: str,
    max_output_tokens: int,
) -> dict[str, object]:
    """Build a Responses request.

    ``instructions`` carries the trusted contract and ``input`` carries the
    untrusted GitHub payload, so a hostile diff cannot present itself as
    policy. ``store`` is explicitly false: the Responses API otherwise retains
    application state for 30 days, and for a payment project retention is a
    decision to make, not a default to inherit. Reasoning is omitted for
    ``none``, and generation is capped server-side rather than only trimmed
    after the fact.
    """
    payload: dict[str, object] = {
        "model": model,
        "instructions": instructions,
        "input": prompt,
        "store": False,
        "max_output_tokens": max_output_tokens,
    }
    if reasoning_effort != "none":
        payload["reasoning"] = {"effort": reasoning_effort}
    return payload


def read_bounded_body(stream: IO[bytes], max_bytes: int) -> dict[str, object]:
    """Read at most ``max_bytes`` of JSON, refusing anything larger."""
    raw = stream.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise RuntimeError(f"OpenAI Responses body exceeded {max_bytes} bytes")
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise RuntimeError("OpenAI Responses returned an invalid response") from None
    if not isinstance(body, dict):
        raise RuntimeError("OpenAI Responses returned an invalid response")
    return body


def enforce_output_bytes(text: str, max_bytes: int) -> str:
    """Reject an oversized model output instead of writing it out."""
    size = len(text.encode("utf-8"))
    if size > max_bytes:
        raise RuntimeError(f"OpenAI Responses output exceeded {max_bytes} bytes ({size})")
    return text


def extract_output(response: dict[str, object]) -> str:
    """Extract output text without echoing arbitrary response content.

    An ``incomplete`` response that still carries text is a truncated review,
    not a failure: posting it with an explicit marker is strictly better for a
    human reader than posting nothing. Only a truncation that produced no text
    at all — reasoning consumed the whole budget — is fatal.
    """
    text = _collect_output_text(response)
    if response.get("status") == "incomplete":
        details = response.get("incomplete_details")
        reason = details.get("reason") if isinstance(details, dict) else None
        reason = reason if isinstance(reason, str) else "unknown"
        if not text:
            raise RuntimeError(
                f"OpenAI Responses returned an incomplete response with no text ({reason})"
            )
        return text + OUTPUT_TRUNCATION_MARKER.format(reason=reason)
    return text


def _collect_output_text(response: dict[str, object]) -> str:
    direct = response.get("output_text")
    if isinstance(direct, str) and direct:
        return direct
    chunks: list[str] = []
    output = response.get("output")
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if isinstance(part, dict) and part.get("type") == "output_text":
                    text = part.get("text")
                    if isinstance(text, str):
                        chunks.append(text)
    return "\n".join(chunks)


def request_response(
    model: str,
    reasoning_effort: str,
    instructions: str,
    prompt: str,
    api_key: str,
    max_output_tokens: int,
    max_output_bytes: int,
    request_timeout: int = DEFAULT_REQUEST_TIMEOUT,
) -> str:
    payload = build_payload(model, reasoning_effort, instructions, prompt, max_output_tokens)
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=request_timeout) as response:
            # A response envelope is metadata plus the bounded output; allow
            # headroom over the output ceiling but never an unbounded read.
            body = read_bounded_body(response, max_output_bytes * 4)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"OpenAI Responses request failed with HTTP {error.code}") from None
    except TimeoutError:
        # Distinguished from a connection failure: the CI log for a timeout
        # read only "request failed", which cannot be acted on.
        raise RuntimeError(
            f"OpenAI Responses request timed out after {request_timeout}s "
            f"(max_output_tokens={max_output_tokens}); raise --request-timeout "
            f"or lower --max-output-tokens"
        ) from None
    except urllib.error.URLError as error:
        reason = getattr(error, "reason", error)
        if isinstance(reason, TimeoutError) or "timed out" in str(reason).lower():
            raise RuntimeError(
                f"OpenAI Responses request timed out after {request_timeout}s "
                f"(max_output_tokens={max_output_tokens}); raise --request-timeout "
                f"or lower --max-output-tokens"
            ) from None
        raise RuntimeError(f"OpenAI Responses request failed to connect: {reason}") from None
    result = extract_output(body)
    if not result:
        raise RuntimeError("OpenAI Responses returned no text")
    return enforce_output_bytes(result, max_output_bytes)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True)
    parser.add_argument("--reasoning-effort", required=True, choices=sorted(EFFORTS))
    parser.add_argument("--instructions", required=True, dest="instructions_path", type=Path)
    parser.add_argument("--input", required=True, dest="input_path", type=Path)
    parser.add_argument("--output", required=True, dest="output_path", type=Path)
    parser.add_argument("--max-input-bytes", required=True, type=int)
    parser.add_argument("--max-output-tokens", required=True, type=int)
    parser.add_argument("--max-output-bytes", required=True, type=int)
    parser.add_argument(
        "--request-timeout", type=int, default=DEFAULT_REQUEST_TIMEOUT,
        help="socket timeout in seconds; must cover the max-output-tokens budget",
    )
    parser.add_argument(
        "--job-deadline", type=int, default=None,
        help=(
            "epoch second at which the surrounding CI job is killed; the "
            "request timeout must fit in what is left of it, with posting "
            "headroom to spare"
        ),
    )
    args = parser.parse_args(argv)
    if not MODEL_PATTERN.fullmatch(args.model):
        parser.error("--model contains unsupported characters")
    if args.max_input_bytes <= 0:
        parser.error("--max-input-bytes must be positive")
    if args.max_output_tokens <= 0:
        parser.error("--max-output-tokens must be positive")
    if args.max_output_bytes <= 0:
        parser.error("--max-output-bytes must be positive")
    # A byte ceiling the token cap cannot reach is an inert control that still
    # reads as active. Failing here forces raising one to be a decision about
    # the other.
    if args.max_output_bytes > args.max_output_tokens * BYTES_PER_TOKEN:
        parser.error(
            "--max-output-bytes is unreachable at this --max-output-tokens "
            f"(ceiling must be at most {args.max_output_tokens * BYTES_PER_TOKEN})"
        )
    if args.request_timeout <= 0:
        parser.error("--request-timeout must be positive")
    # Raising the token cap without raising the timeout only moves the failure
    # from an "incomplete" response to an aborted request. Tie them together so
    # changing one forces a decision about the other.
    required = (args.max_output_tokens * SECONDS_PER_1K_TOKENS) // 1000
    if args.request_timeout < required:
        parser.error(
            f"--request-timeout {args.request_timeout}s is too short for "
            f"--max-output-tokens {args.max_output_tokens} "
            f"(need at least {required}s)"
        )
    # Bounded above by what is actually left of the job, not just below by the
    # token budget. The deadline is stamped at job start, so everything spent
    # on checkout, setup and sanitization is already priced in here.
    if args.job_deadline is not None:
        remaining = int(args.job_deadline - time.time())
        ceiling = remaining - POSTING_HEADROOM_SECONDS
        if ceiling <= 0:
            parser.error(
                f"--job-deadline leaves {remaining}s, which is not enough to "
                f"run a request and still have {POSTING_HEADROOM_SECONDS}s to "
                f"post the comment"
            )
        if args.request_timeout > ceiling:
            parser.error(
                f"--request-timeout {args.request_timeout}s does not fit the "
                f"{remaining}s left before --job-deadline "
                f"(must be at most {ceiling}s, reserving "
                f"{POSTING_HEADROOM_SECONDS}s to post the comment)"
            )
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is required", file=sys.stderr)
        return 1
    try:
        # One budget for the request, not one per channel: the trusted
        # instructions are drawn first and the untrusted payload gets whatever
        # is left, so --max-input-bytes bounds what is actually sent.
        instructions = bound_input(
            args.instructions_path.read_text(encoding="utf-8"), args.max_input_bytes
        )
        remaining = args.max_input_bytes - len(instructions.encode("utf-8"))
        if remaining <= 0:
            raise RuntimeError(
                "--max-input-bytes leaves no room for the request payload after instructions"
            )
        prompt = bound_input(args.input_path.read_text(encoding="utf-8"), remaining)
        result = request_response(
            args.model,
            args.reasoning_effort,
            instructions,
            prompt,
            api_key,
            args.max_output_tokens,
            args.max_output_bytes,
            args.request_timeout,
        )
        args.output_path.write_text(result, encoding="utf-8")
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
