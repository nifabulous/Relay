"""Agent runner: per-agent model binding and role-prompt handling.

The runner exists so the `.claude/agents/` roles are not Claude-locked: the
same definition file must be executable headlessly against any provider the
transport can reach. These tests pin the binding chain, the frontmatter
split, and the fail-closed paths.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parents[1] / "scripts" / "agent_runner.py"
SPEC = importlib.util.spec_from_file_location("agent_runner", SCRIPT)
assert SPEC and SPEC.loader
agent_runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(agent_runner)


@pytest.fixture
def agent_file(tmp_path, monkeypatch):
    """A minimal agent definition in a redirected agents directory."""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "test-researcher.md").write_text(
        "---\nname: test-researcher\nmodel: sonnet\n---\n\nRole prompt body.\n"
    )
    monkeypatch.setattr(agent_runner, "AGENTS_DIR", agents_dir)
    return agents_dir / "test-researcher.md"


def test_role_text_excludes_frontmatter(agent_file):
    role = agent_runner.load_role_text(agent_file)

    assert role == "Role prompt body.\n"
    assert "model:" not in role


def test_missing_or_unterminated_frontmatter_fails_closed(tmp_path):
    no_fence = tmp_path / "a.md"
    no_fence.write_text("just prose")
    unterminated = tmp_path / "b.md"
    unterminated.write_text("---\nname: x\nnever closed")

    with pytest.raises(ValueError, match="frontmatter"):
        agent_runner.load_role_text(no_fence)
    with pytest.raises(ValueError, match="frontmatter"):
        agent_runner.load_role_text(unterminated)


def test_model_binding_prefers_flag_then_per_agent_env_then_shared_env(
    agent_file, monkeypatch
):
    monkeypatch.delenv("RELAY_AGENT_MODEL", raising=False)
    monkeypatch.delenv("RELAY_AGENT_TEST_RESEARCHER_MODEL", raising=False)

    with pytest.raises(ValueError, match="RELAY_AGENT_TEST_RESEARCHER_MODEL"):
        agent_runner.resolve_model("test-researcher", None)

    monkeypatch.setenv("RELAY_AGENT_MODEL", "shared-model")
    assert agent_runner.resolve_model("test-researcher", None) == "shared-model"

    monkeypatch.setenv("RELAY_AGENT_TEST_RESEARCHER_MODEL", "agent-model")
    assert agent_runner.resolve_model("test-researcher", None) == "agent-model"

    assert agent_runner.resolve_model("test-researcher", "flag-model") == "flag-model"


def test_model_binding_rejects_unsupported_characters(agent_file, monkeypatch):
    monkeypatch.setenv("RELAY_AGENT_TEST_RESEARCHER_MODEL", "bad model; rm -rf")
    with pytest.raises(ValueError, match="unsupported characters"):
        agent_runner.resolve_model("test-researcher", None)


def test_agent_name_is_rejected_before_any_path_is_built():
    with pytest.raises(ValueError, match="agent name"):
        agent_runner.agent_path("../escape")


def test_unknown_agent_names_its_file(tmp_path):
    with pytest.raises(ValueError, match="no agent definition"):
        agent_runner.agent_path("does-not-exist")


def test_main_end_to_end_uses_resolved_model_and_style(
    agent_file, tmp_path, monkeypatch
):
    """The full path: role prompt rides the instructions channel, the input
    file the user channel, and the model comes from the per-agent env var."""
    sent: dict = {}

    def capture(
        model, effort, instructions, prompt, api_key, tokens, out_bytes, timeout,
        api_style="responses", api_url=None,
    ):
        sent.update(
            model=model,
            instructions=instructions,
            prompt=prompt,
            api_style=api_style,
            api_url=api_url,
        )
        return "memo text"

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("RELAY_AGENT_TEST_RESEARCHER_MODEL", "bound-model-id")
    monkeypatch.setenv("CODEX_API_STYLE", "chat")
    monkeypatch.setattr(agent_runner.codex_responses, "request_response", capture)

    inbox = tmp_path / "input.md"
    inbox.write_text("the research question")
    outbox = tmp_path / "memo.md"

    exit_code = agent_runner.main(
        [
            "--agent", "test-researcher",
            "--input", str(inbox),
            "--output", str(outbox),
        ]
    )

    assert exit_code == 0
    assert sent["model"] == "bound-model-id"
    assert sent["instructions"] == "Role prompt body.\n"
    assert sent["prompt"] == "the research question"
    assert sent["api_style"] == "chat"
    assert sent["api_url"] == agent_runner.codex_responses.CHAT_COMPLETIONS_API_URL
    assert outbox.read_text() == "memo text"


def test_main_fails_closed_when_no_model_is_bound(agent_file, tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("RELAY_AGENT_MODEL", raising=False)
    monkeypatch.delenv("RELAY_AGENT_TEST_RESEARCHER_MODEL", raising=False)

    inbox = tmp_path / "input.md"
    inbox.write_text("q")
    exit_code = agent_runner.main(
        [
            "--agent", "test-researcher",
            "--input", str(inbox),
            "--output", str(tmp_path / "out.md"),
        ]
    )

    assert exit_code == 1


def test_role_prompt_is_never_truncated(agent_file, tmp_path, monkeypatch):
    """A truncated role prompt is a different agent; the runner must refuse
    rather than dispatch a silently altered contract."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("RELAY_AGENT_TEST_RESEARCHER_MODEL", "m")

    inbox = tmp_path / "input.md"
    inbox.write_text("q")
    exit_code = agent_runner.main(
        [
            "--agent", "test-researcher",
            "--input", str(inbox),
            "--output", str(tmp_path / "out.md"),
            "--max-input-bytes", "4",
        ]
    )

    assert exit_code == 1
