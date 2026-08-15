from __future__ import annotations

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "codex_responses.py"
SPEC = importlib.util.spec_from_file_location("codex_responses", SCRIPT)
assert SPEC and SPEC.loader
codex_responses = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(codex_responses)


def test_none_effort_omits_reasoning_configuration() -> None:
    payload = codex_responses.build_payload("gpt-4.1", "none", "review this")

    assert payload["model"] == "gpt-4.1"
    assert "reasoning" not in payload


def test_reasoning_effort_is_sent_for_supported_reasoning_models() -> None:
    payload = codex_responses.build_payload("gpt-5.3-codex", "high", "review this")

    assert payload["reasoning"] == {"effort": "high"}


def test_input_is_bounded_with_an_explicit_truncation_marker() -> None:
    bounded = codex_responses.bound_input("0123456789" * 10, 32)

    assert len(bounded.encode("utf-8")) <= 32
    assert "TRUNCATED" in bounded
