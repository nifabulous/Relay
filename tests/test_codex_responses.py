from __future__ import annotations

import importlib.util
import io
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parents[1] / "scripts" / "codex_responses.py"
SPEC = importlib.util.spec_from_file_location("codex_responses", SCRIPT)
assert SPEC and SPEC.loader
codex_responses = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(codex_responses)


def build(**overrides: object) -> dict[str, object]:
    kwargs: dict[str, object] = {
        "model": "gpt-5.3-codex",
        "reasoning_effort": "medium",
        "instructions": "trusted policy",
        "prompt": "untrusted data",
        "max_output_tokens": 4000,
    }
    kwargs.update(overrides)
    return codex_responses.build_payload(**kwargs)


def test_none_effort_omits_reasoning_configuration() -> None:
    payload = build(model="gpt-4.1", reasoning_effort="none")

    assert payload["model"] == "gpt-4.1"
    assert "reasoning" not in payload


def test_reasoning_effort_is_sent_for_supported_reasoning_models() -> None:
    payload = build(reasoning_effort="high")

    assert payload["reasoning"] == {"effort": "high"}


def test_input_is_bounded_with_an_explicit_truncation_marker() -> None:
    bounded = codex_responses.bound_input("0123456789" * 10, 32)

    assert len(bounded.encode("utf-8")) <= 32
    assert "TRUNCATED" in bounded


def test_response_storage_is_disabled_by_default() -> None:
    assert build()["store"] is False


def test_trusted_instructions_are_separated_from_untrusted_input() -> None:
    payload = build(instructions="TRUSTED POLICY", prompt="UNTRUSTED DIFF")

    assert payload["instructions"] == "TRUSTED POLICY"
    assert payload["input"] == "UNTRUSTED DIFF"
    assert "UNTRUSTED DIFF" not in str(payload["instructions"])


def test_output_tokens_are_capped_at_the_api() -> None:
    assert build(max_output_tokens=1234)["max_output_tokens"] == 1234


def test_oversized_responses_are_rejected_before_the_body_is_parsed() -> None:
    body = json.dumps({"output_text": "x" * 10_000}).encode("utf-8")

    with pytest.raises(RuntimeError, match="exceeded"):
        codex_responses.read_bounded_body(io.BytesIO(body), 100)


def test_bounded_body_reads_a_response_within_the_limit() -> None:
    body = json.dumps({"output_text": "ok"}).encode("utf-8")

    assert codex_responses.read_bounded_body(io.BytesIO(body), 4096) == {"output_text": "ok"}


def test_incomplete_responses_are_reported_rather_than_silently_truncated() -> None:
    with pytest.raises(RuntimeError, match="incomplete"):
        codex_responses.extract_output(
            {
                "status": "incomplete",
                "incomplete_details": {"reason": "max_output_tokens"},
                "output_text": "partial",
            }
        )


def test_output_larger_than_the_byte_ceiling_is_rejected() -> None:
    with pytest.raises(RuntimeError, match="exceeded"):
        codex_responses.enforce_output_bytes("y" * 200, 100)


def test_parse_args_rejects_a_non_positive_output_token_cap() -> None:
    with pytest.raises(SystemExit):
        codex_responses.parse_args(
            [
                "--model",
                "gpt-5.3-codex",
                "--reasoning-effort",
                "medium",
                "--instructions",
                "instructions.md",
                "--input",
                "input.md",
                "--output",
                "out.md",
                "--max-input-bytes",
                "100",
                "--max-output-tokens",
                "0",
                "--max-output-bytes",
                "100",
            ]
        )
