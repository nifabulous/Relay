#!/usr/bin/env python3
"""Call the OpenAI Responses API with explicitly supplied, bounded context."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

API_URL = "https://api.openai.com/v1/responses"
MODEL_PATTERN = re.compile(r"^[A-Za-z0-9._:/-]+$")
EFFORTS = {"none", "low", "medium", "high", "xhigh"}
TRUNCATION_MARKER = "\n[TRUNCATED INPUT]"


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


def build_payload(model: str, reasoning_effort: str, prompt: str) -> dict[str, object]:
    """Build a Responses request, omitting reasoning for ``none``."""
    payload: dict[str, object] = {"model": model, "input": prompt}
    if reasoning_effort != "none":
        payload["reasoning"] = {"effort": reasoning_effort}
    return payload


def extract_output(response: dict[str, object]) -> str:
    """Extract output text without echoing arbitrary response content."""
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


def request_response(model: str, reasoning_effort: str, prompt: str, api_key: str) -> str:
    payload = build_payload(model, reasoning_effort, prompt)
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
        with urllib.request.urlopen(request, timeout=120) as response:
            body = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"OpenAI Responses request failed with HTTP {error.code}") from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        raise RuntimeError("OpenAI Responses request failed") from None
    if not isinstance(body, dict):
        raise RuntimeError("OpenAI Responses returned an invalid response")
    result = extract_output(body)
    if not result:
        raise RuntimeError("OpenAI Responses returned no text")
    return result


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True)
    parser.add_argument("--reasoning-effort", required=True, choices=sorted(EFFORTS))
    parser.add_argument("--input", required=True, dest="input_path", type=Path)
    parser.add_argument("--output", required=True, dest="output_path", type=Path)
    parser.add_argument("--max-input-bytes", required=True, type=int)
    args = parser.parse_args(argv)
    if not MODEL_PATTERN.fullmatch(args.model):
        parser.error("--model contains unsupported characters")
    if args.max_input_bytes <= 0:
        parser.error("--max-input-bytes must be positive")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is required", file=sys.stderr)
        return 1
    try:
        prompt = bound_input(args.input_path.read_text(encoding="utf-8"), args.max_input_bytes)
        result = request_response(args.model, args.reasoning_effort, prompt, api_key)
        args.output_path.write_text(result, encoding="utf-8")
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
