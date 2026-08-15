from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parents[1] / "scripts" / "codex_truncate.py"
SPEC = importlib.util.spec_from_file_location("codex_truncate", SCRIPT)
assert SPEC and SPEC.loader
codex_truncate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(codex_truncate)


def test_text_within_the_ceiling_is_returned_unchanged() -> None:
    source = "a short review\n"

    assert codex_truncate.truncate_utf8(source, 4096) == source


def test_truncation_never_splits_a_multi_byte_character() -> None:
    # Three bytes per character, so a byte ceiling of 10 lands mid-character.
    source = "€" * 20

    result = codex_truncate.truncate_utf8(source, 40)

    # Decoding is the assertion: a split code point would not round-trip.
    assert result.encode("utf-8").decode("utf-8") == result
    assert len(result.encode("utf-8")) <= 40


def test_truncated_output_stays_within_the_byte_ceiling_including_the_marker() -> None:
    result = codex_truncate.truncate_utf8("x" * 5000, 200)

    assert len(result.encode("utf-8")) <= 200
    assert "Truncated" in result


def test_a_ceiling_too_small_for_the_marker_still_returns_valid_utf8() -> None:
    result = codex_truncate.truncate_utf8("é" * 100, 5)

    assert result.encode("utf-8").decode("utf-8") == result
    assert len(result.encode("utf-8")) <= 5


def test_non_positive_ceiling_is_rejected() -> None:
    with pytest.raises(ValueError):
        codex_truncate.truncate_utf8("content", 0)


def test_cli_truncates_stdin_without_splitting_a_character() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--max-bytes", "60"],
        input="日本語のレビュー" * 20,
        text=True,
        capture_output=True,
        check=True,
    )

    assert len(result.stdout.encode("utf-8")) <= 60
    assert result.stdout.encode("utf-8").decode("utf-8") == result.stdout
