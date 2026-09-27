"""A Loopkeeper review deferred to the CI-completion run must not fail the PR.

On pull_request_target, the reusable review defers to the workflow_run
(CI-completion) review whenever CI already runs for the head, and uploads no
artifact. The caller's `rebind` job still demanded that artifact, so every PR
push showed red `rebind` and `review publication gate` checks while the real
review arrived later from the CI-completion run.

These tests run the workflow's own step scripts, extracted from the YAML,
against a fake `gh` that records its arguments.
"""
import os
import stat
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = yaml.safe_load(
    (ROOT / ".github" / "workflows" / "loopkeeper-pr-review.yml").read_text(encoding="utf-8")
)
JOBS = WORKFLOW["jobs"]
RUN_ID = "36282798361"


def _step(job, step_id):
    for step in JOBS[job]["steps"]:
        if step.get("id") == step_id:
            return step
    raise AssertionError(f"{job} has no step with id {step_id!r}")


def _run(script, env, tmp_path, artifact_count="0"):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    fake_gh = bin_dir / "gh"
    fake_gh.write_text(
        "#!/usr/bin/env bash\n"
        'printf "%s\\n" "$*" >>"$FAKE_GH_LOG"\n'
        'printf "%s\\n" "$FAKE_ARTIFACT_COUNT"\n'
    )
    fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IEXEC)
    output = tmp_path / "github_output"
    output.write_text("")
    log = tmp_path / "gh.log"
    result = subprocess.run(
        ["bash", "-c", script],
        env={
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "GITHUB_OUTPUT": str(output),
            "FAKE_GH_LOG": str(log),
            "FAKE_ARTIFACT_COUNT": artifact_count,
            **env,
        },
        capture_output=True,
        text=True,
        timeout=30,
    )
    outputs = dict(
        line.split("=", 1) for line in output.read_text().splitlines() if "=" in line
    )
    calls = log.read_text().splitlines() if log.exists() else []
    return result, outputs, calls


def _presence(tmp_path, event_name, artifact_count):
    step = _step("rebind", "presence")
    env = {
        "GH_TOKEN": "t",
        "GH_REPO": "nifabulous/Relay",
        "RUN_ID": RUN_ID,
        "EVENT_NAME": event_name,
    }
    return _run(step["run"], env, tmp_path, artifact_count)


def test_rebind_checks_for_the_artifact_before_anything_else():
    steps = JOBS["rebind"]["steps"]
    assert steps[0].get("id") == "presence"
    for step in steps[1:]:
        assert step.get("if") == "steps.presence.outputs.deferred != 'true'", step["name"]
    assert JOBS["rebind"]["outputs"]["deferred"] == "${{ steps.presence.outputs.deferred }}"


def test_a_pull_request_target_run_without_an_artifact_is_deferred(tmp_path):
    result, outputs, calls = _presence(tmp_path, "pull_request_target", "0")
    assert result.returncode == 0, result.stderr
    assert outputs["deferred"] == "true"
    assert calls and f"actions/runs/{RUN_ID}/artifacts?name=loopkeeper-review-{RUN_ID}" in calls[0]


@pytest.mark.parametrize("event_name", ["workflow_run", "workflow_dispatch"])
def test_a_missing_artifact_on_any_other_event_still_fails(tmp_path, event_name):
    result, outputs, _ = _presence(tmp_path, event_name, "0")
    assert result.returncode != 0
    assert "deferred" not in outputs


@pytest.mark.parametrize("event_name", ["pull_request_target", "workflow_run"])
def test_an_existing_artifact_is_rebound_normally(tmp_path, event_name):
    result, outputs, _ = _presence(tmp_path, event_name, "1")
    assert result.returncode == 0, result.stderr
    assert outputs["deferred"] == "false"


def test_publish_skips_a_deferred_review():
    condition = JOBS["publish"]["if"]
    assert "needs.rebind.result == 'success'" in condition
    assert "needs.rebind.outputs.deferred != 'true'" in condition


def _gate(tmp_path, **env):
    step = JOBS["publication-gate"]["steps"][0]
    base = {
        "SELECTED": "[162]",
        "TARGETS_RESULT": "success",
        "REVIEW_RESULT": "success",
        "REBIND_RESULT": "success",
        "REBIND_DEFERRED": "false",
        "PUBLISH_RESULT": "success",
    }
    result, _, _ = _run(step["run"], {**base, **env}, tmp_path)
    return result


def test_the_gate_passes_a_deferred_review(tmp_path):
    assert JOBS["publication-gate"]["steps"][0]["env"]["REBIND_DEFERRED"] == (
        "${{ needs.rebind.outputs.deferred }}"
    )
    result = _gate(tmp_path, REBIND_DEFERRED="true", PUBLISH_RESULT="skipped")
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    "overrides",
    [
        {"PUBLISH_RESULT": "skipped"},
        {"REBIND_RESULT": "failure", "REBIND_DEFERRED": "", "PUBLISH_RESULT": "skipped"},
        {"REBIND_RESULT": "skipped", "REBIND_DEFERRED": "true", "PUBLISH_RESULT": "skipped"},
        {"REVIEW_RESULT": "failure"},
    ],
    ids=["published-nothing", "rebind-failed", "deferral-without-rebind", "review-failed"],
)
def test_the_gate_still_fails_without_a_publication_or_deferral(tmp_path, overrides):
    result = _gate(tmp_path, **overrides)
    assert result.returncode != 0


def test_the_gate_passes_a_published_review(tmp_path):
    assert _gate(tmp_path).returncode == 0
