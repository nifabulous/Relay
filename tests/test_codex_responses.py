from __future__ import annotations

import importlib.util
import io
import json
import socket
import urllib.error
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


def test_incomplete_response_with_text_is_posted_as_a_marked_truncated_review() -> None:
    result = codex_responses.extract_output(
        {
            "status": "incomplete",
            "incomplete_details": {"reason": "max_output_tokens"},
            "output_text": "partial",
        }
    )

    assert result.startswith("partial")
    assert "TRUNCATED OUTPUT" in result
    assert "max_output_tokens" in result


def test_incomplete_response_with_no_text_is_fatal() -> None:
    with pytest.raises(RuntimeError, match="incomplete"):
        codex_responses.extract_output(
            {
                "status": "incomplete",
                "incomplete_details": {"reason": "max_output_tokens"},
                "output_text": "",
            }
        )


def test_output_larger_than_the_byte_ceiling_is_rejected() -> None:
    with pytest.raises(RuntimeError, match="exceeded"):
        codex_responses.enforce_output_bytes("y" * 200, 100)


def args_for(max_output_tokens: str, max_output_bytes: str) -> list[str]:
    return [
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
        max_output_tokens,
        "--max-output-bytes",
        max_output_bytes,
    ]


def test_parse_args_rejects_a_non_positive_output_token_cap() -> None:
    with pytest.raises(SystemExit):
        codex_responses.parse_args(args_for("0", "100"))


def test_parse_args_rejects_a_byte_ceiling_the_token_cap_cannot_reach() -> None:
    with pytest.raises(SystemExit):
        codex_responses.parse_args(args_for("6000", "50000"))


def test_parse_args_accepts_coherent_output_ceilings() -> None:
    args = codex_responses.parse_args(args_for("32000", "50000"))

    assert args.max_output_tokens == 32000
    assert args.max_output_bytes == 50000


def test_input_budget_is_shared_between_instructions_and_payload(tmp_path) -> None:
    instructions = tmp_path / "instructions.md"
    payload = tmp_path / "input.md"
    instructions.write_text("i" * 60, encoding="utf-8")
    payload.write_text("p" * 500, encoding="utf-8")

    sent: dict[str, object] = {}

    def capture(model, effort, instructions_text, prompt, api_key, tokens, out_bytes, timeout=None):
        sent["instructions"] = instructions_text
        sent["prompt"] = prompt
        return "review"

    original = codex_responses.request_response
    codex_responses.request_response = capture
    try:
        import os

        os.environ["OPENAI_API_KEY"] = "test-key"
        exit_code = codex_responses.main(
            [
                "--model",
                "gpt-5.3-codex",
                "--reasoning-effort",
                "medium",
                "--instructions",
                str(instructions),
                "--input",
                str(payload),
                "--output",
                str(tmp_path / "out.md"),
                "--max-input-bytes",
                "100",
                "--max-output-tokens",
                "32000",
                "--max-output-bytes",
                "50000",
            ]
        )
    finally:
        codex_responses.request_response = original

    assert exit_code == 0
    total = len(str(sent["instructions"]).encode("utf-8")) + len(
        str(sent["prompt"]).encode("utf-8")
    )
    assert total <= 100


# ── Request timeout must fit the output budget ───────────────────────────────
def test_request_timeout_is_configurable_and_defaults_above_the_socket_floor():
    """A 32000-token reasoning generation routinely runs past 120s. The old
    hardcoded socket timeout aborted the request mid-generation, and the job
    failed with no review posted."""
    args = codex_responses.parse_args([
        "--model", "gpt-5.3-codex",
        "--reasoning-effort", "medium",
        "--instructions", "i.md",
        "--input", "in.md",
        "--output", "out.md",
        "--max-input-bytes", "120000",
        "--max-output-tokens", "32000",
        "--max-output-bytes", "50000",
    ])
    assert args.request_timeout >= 600, (
        f"default timeout {args.request_timeout}s is too small for a "
        "32000-token reasoning budget"
    )


def test_request_timeout_must_cover_the_token_budget(capsys):
    """The timeout and the token cap are one decision: raising the cap without
    raising the timeout just moves the failure from 'incomplete' to 'timeout'."""
    with pytest.raises(SystemExit):
        codex_responses.parse_args([
            "--model", "gpt-5.3-codex",
            "--reasoning-effort", "medium",
            "--instructions", "i.md",
            "--input", "in.md",
            "--output", "out.md",
            "--max-input-bytes", "120000",
            "--max-output-tokens", "32000",
            "--max-output-bytes", "50000",
            "--request-timeout", "60",
        ])
    # argparse writes the reason to stderr and exits 2, so the message is there.
    assert "--request-timeout" in capsys.readouterr().err


def _raising_urlopen(seen, error):
    def fake_urlopen(request, **kwargs):
        seen.update(kwargs)
        raise error
    return fake_urlopen


def test_socket_timeout_is_actually_passed_to_urlopen(monkeypatch):
    """The message alone proves nothing: a hardcoded `timeout=120` still
    produces the right text. Assert the value urlopen was really called with."""
    seen: dict = {}
    monkeypatch.setattr(
        codex_responses.urllib.request, "urlopen",
        _raising_urlopen(seen, TimeoutError("timed out")))
    with pytest.raises(RuntimeError):
        codex_responses.request_response(
            model="gpt-5.3-codex", reasoning_effort="medium", instructions="i",
            prompt="p", api_key="k", max_output_tokens=32000,
            max_output_bytes=50000, request_timeout=600)
    assert seen.get("timeout") == 600, f"urlopen got timeout={seen.get('timeout')!r}"


def test_timeout_and_connection_failures_are_distinguishable(monkeypatch):
    """The CI log said only 'OpenAI Responses request failed', which does not
    say whether the request timed out or never connected."""
    seen: dict = {}
    monkeypatch.setattr(
        codex_responses.urllib.request, "urlopen",
        _raising_urlopen(seen, TimeoutError("timed out")))
    with pytest.raises(RuntimeError) as exc:
        codex_responses.request_response(
            model="gpt-5.3-codex", reasoning_effort="medium", instructions="i",
            prompt="p", api_key="k", max_output_tokens=32000,
            max_output_bytes=50000, request_timeout=600)
    message = str(exc.value)
    assert "timed out" in message.lower()
    assert "600" in message, "the message should name the timeout that fired"


def test_urlerror_wrapping_a_socket_timeout_is_reported_as_a_timeout(monkeypatch):
    """urllib raises URLError(socket.timeout) rather than a bare TimeoutError on
    some paths; that is still a timeout, not a connection failure."""
    seen: dict = {}
    monkeypatch.setattr(
        codex_responses.urllib.request, "urlopen",
        _raising_urlopen(seen, urllib.error.URLError(socket.timeout("timed out"))))
    with pytest.raises(RuntimeError) as exc:
        codex_responses.request_response(
            model="gpt-5.3-codex", reasoning_effort="medium", instructions="i",
            prompt="p", api_key="k", max_output_tokens=32000,
            max_output_bytes=50000, request_timeout=600)
    assert "timed out" in str(exc.value).lower()
    assert seen.get("timeout") == 600


def test_non_timeout_connection_failure_is_not_reported_as_a_timeout(monkeypatch):
    seen: dict = {}
    monkeypatch.setattr(
        codex_responses.urllib.request, "urlopen",
        _raising_urlopen(seen, urllib.error.URLError("Name or service not known")))
    with pytest.raises(RuntimeError) as exc:
        codex_responses.request_response(
            model="gpt-5.3-codex", reasoning_effort="medium", instructions="i",
            prompt="p", api_key="k", max_output_tokens=32000,
            max_output_bytes=50000, request_timeout=600)
    message = str(exc.value)
    assert "timed out" not in message.lower(), message
    assert "failed to connect" in message


# ── Coherence boundary ───────────────────────────────────────────────────────
def _parse(timeout: str, tokens: str = "32000"):
    return codex_responses.parse_args([
        "--model", "gpt-5.3-codex", "--reasoning-effort", "medium",
        "--instructions", "i.md", "--input", "in.md", "--output", "out.md",
        "--max-input-bytes", "120000", "--max-output-tokens", tokens,
        "--max-output-bytes", "50000", "--request-timeout", timeout,
    ])


def test_timeout_exactly_at_the_required_floor_is_accepted():
    # 32000 tokens * 20s / 1000 = 640s
    assert _parse("640").request_timeout == 640


def test_timeout_one_second_below_the_floor_is_rejected(capsys):
    with pytest.raises(SystemExit):
        _parse("639")
    assert "--request-timeout" in capsys.readouterr().err


# ── The request timeout must also fit inside the job's wall clock ────────────
def _parse_with_job(timeout: str, job: str, tokens: str = "32000"):
    return codex_responses.parse_args([
        "--model", "gpt-5.3-codex", "--reasoning-effort", "medium",
        "--instructions", "i.md", "--input", "in.md", "--output", "out.md",
        "--max-input-bytes", "120000", "--max-output-tokens", tokens,
        "--max-output-bytes", "50000", "--request-timeout", timeout,
        "--job-timeout", job,
    ])


def test_request_timeout_above_the_job_deadline_is_rejected(capsys):
    """A configured override the job cannot outlive recreates the exact
    'no review posted' failure this change exists to prevent."""
    with pytest.raises(SystemExit):
        _parse_with_job("1800", "1200")
    assert "--job-timeout" in capsys.readouterr().err


def test_request_timeout_leaving_no_posting_headroom_is_rejected(capsys):
    # Equal to the job deadline: the request would consume the whole job and
    # leave nothing to sanitize and post the comment.
    with pytest.raises(SystemExit):
        _parse_with_job("1200", "1200")
    assert "--job-timeout" in capsys.readouterr().err


def test_request_timeout_exactly_at_the_headroom_boundary_is_accepted():
    fits = 1200 - codex_responses.POSTING_HEADROOM_SECONDS
    assert _parse_with_job(str(fits), "1200").request_timeout == fits


def test_request_timeout_one_second_over_the_headroom_boundary_is_rejected(capsys):
    over = 1200 - codex_responses.POSTING_HEADROOM_SECONDS + 1
    with pytest.raises(SystemExit):
        _parse_with_job(str(over), "1200")
    assert "--job-timeout" in capsys.readouterr().err


def test_job_timeout_is_optional_so_local_runs_still_work():
    assert _parse("900").request_timeout == 900


def test_socket_timeout_while_reading_the_body_is_reported_as_a_timeout(monkeypatch):
    """urlopen can connect and then stall mid-body; the inactivity timeout
    fires during read(), not at connect."""
    class StallingResponse:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self, *args):
            raise TimeoutError("timed out")

    monkeypatch.setattr(
        codex_responses.urllib.request, "urlopen",
        lambda request, **kwargs: StallingResponse())
    with pytest.raises(RuntimeError) as exc:
        codex_responses.request_response(
            model="gpt-5.3-codex", reasoning_effort="medium", instructions="i",
            prompt="p", api_key="k", max_output_tokens=32000,
            max_output_bytes=50000, request_timeout=600)
    assert "timed out" in str(exc.value).lower()
