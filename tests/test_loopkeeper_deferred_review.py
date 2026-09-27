"""Immediate Loopkeeper publication must not silently defer a PR review.

The caller forces direct PR events through Loopkeeper's documented no-CI
fallback so the review artifact is available to the writer immediately. A
later ``workflow_run`` waits for that direct run: successful direct runs are
left alone, while failed direct runs re-enter through the real CI identity.
The caller must require an artifact for every selected event; a missing
artifact is a failed publication, not a successful deferral.
"""

import os
import stat
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = yaml.safe_load(
    (ROOT / ".github" / "workflows" / "loopkeeper-pr-review.yml").read_text(
        encoding="utf-8"
    )
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
        'if [[ "${2:-}" == *"/jobs?per_page=100" ]]; then\n'
        '  if [[ -n "${FAKE_JOBS_JSON+x}" ]]; then printf "%s\\n" "$FAKE_JOBS_JSON"; else printf "{\\"jobs\\":[]}\\n"; fi\n'
        'else\n'
        '  printf "%s\\n" "$FAKE_ARTIFACT_COUNT"\n'
        'fi\n'
    )
    fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IEXEC)
    output = tmp_path / "github_output"
    output.write_text("")
    summary = tmp_path / "github_summary"
    summary.write_text("")
    log = tmp_path / "gh.log"
    result = subprocess.run(
        ["bash", "-c", script],
        env={
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "GITHUB_OUTPUT": str(output),
            "GITHUB_STEP_SUMMARY": str(summary),
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
        "PR_NUMBER": "159",
    }
    return _run(step["run"], env, tmp_path, artifact_count)


def test_rebind_requires_the_artifact_before_anything_else():
    steps = JOBS["rebind"]["steps"]
    assert steps[0].get("id") == "presence"
    assert JOBS["rebind"]["outputs"]["ineligible"].startswith("${{ steps.presence.outputs.ineligible")
    assert "deferred" not in JOBS["rebind"]
    assert all(step.get("if") == "${{ steps.presence.outputs.ineligible != 'true' }}" for step in steps[1:])


def test_targets_can_read_direct_review_run_status():
    assert JOBS["targets"]["permissions"]["actions"] == "read"


@pytest.mark.parametrize("event_name", ["pull_request_target", "workflow_run", "workflow_dispatch"])
def test_a_missing_artifact_fails_instead_of_defer(tmp_path, event_name):
    result, outputs, calls = _presence(tmp_path, event_name, "0")
    assert result.returncode != 0
    assert "deferred" not in outputs
    assert calls and f"actions/runs/{RUN_ID}/artifacts?name=loopkeeper-review-{RUN_ID}" in calls[0]
    assert "immediate publication cannot be skipped" in result.stderr


@pytest.mark.parametrize("event_name", ["pull_request_target", "workflow_run", "workflow_dispatch"])
def test_an_existing_artifact_is_required_for_every_event(tmp_path, event_name):
    result, outputs, calls = _presence(tmp_path, event_name, "1")
    assert result.returncode == 0, result.stderr
    assert outputs == {"ineligible": "false"}
    assert calls and f"actions/runs/{RUN_ID}/artifacts?name=loopkeeper-review-{RUN_ID}" in calls[0]


def test_ineligible_review_skip_is_green_without_an_artifact(tmp_path):
    step = _step("rebind", "presence")
    jobs = '{"jobs":[{"name":"review (159) / eligibility","conclusion":"success"},{"name":"review (159) / review","conclusion":"skipped"}]}'
    env = {
        "GH_TOKEN": "t",
        "GH_REPO": "nifabulous/Relay",
        "RUN_ID": RUN_ID,
        "EVENT_NAME": "pull_request_target",
        "PR_NUMBER": "159",
        "FAKE_JOBS_JSON": jobs,
    }
    result, outputs, calls = _run(step["run"], env, tmp_path, "0")
    assert result.returncode == 0, result.stderr
    assert outputs["ineligible"] == "true"
    assert any(f"actions/runs/{RUN_ID}/jobs?per_page=100" in call for call in calls)


def test_direct_and_ci_events_use_different_workflow_identities():
    review_inputs = JOBS["review"]["with"]
    writer_env = next(
        step["env"]
        for step in JOBS["publish"]["steps"]
        if step["name"] == "Publish Loopkeeper review"
    )
    expected_name = "${{ github.event_name == 'pull_request_target' && (github.event.action == 'opened' || github.event.action == 'synchronize') && 'LoopkeeperImmediate' || 'CI' }}"
    expected_file = "${{ github.event_name == 'pull_request_target' && (github.event.action == 'opened' || github.event.action == 'synchronize') && '__loopkeeper_immediate__.yml' || 'ci.yml' }}"
    assert review_inputs["ci_workflow_name"] == expected_name
    assert review_inputs["ci_workflow_file"] == expected_file
    assert writer_env["LOOPKEEPER_CI_WORKFLOW_NAME"] == expected_name
    assert writer_env["LOOPKEEPER_CI_WORKFLOW_FILE"] == expected_file


def test_publish_requires_a_successful_rebind():
    condition = JOBS["publish"]["if"]
    assert "needs.rebind.result == 'success'" in condition
    assert "needs.rebind.outputs.ineligible != 'true'" in condition
    assert "needs.rebind.outputs.deferred" not in condition


def _gate(tmp_path, **env):
    step = JOBS["publication-gate"]["steps"][0]
    base = {
        "SELECTED": "[162]",
        "TARGETS_RESULT": "success",
        "REVIEW_RESULT": "success",
        "REBIND_RESULT": "success",
        "INELIGIBLE": "false",
        "PUBLISH_RESULT": "success",
    }
    result, _, _ = _run(step["run"], {**base, **env}, tmp_path)
    return result


@pytest.mark.parametrize(
    "overrides",
    [
        {"PUBLISH_RESULT": "skipped"},
        {"REBIND_RESULT": "failure", "PUBLISH_RESULT": "skipped"},
        {"REBIND_RESULT": "skipped", "PUBLISH_RESULT": "skipped"},
        {"REVIEW_RESULT": "failure"},
    ],
    ids=["published-nothing", "rebind-failed", "rebind-skipped", "review-failed"],
)
def test_the_gate_fails_without_a_publication(tmp_path, overrides):
    result = _gate(tmp_path, **overrides)
    assert result.returncode != 0


def test_the_gate_passes_a_published_review(tmp_path):
    assert _gate(tmp_path).returncode == 0


def test_the_gate_passes_a_verified_ineligible_skip(tmp_path):
    result = _gate(
        tmp_path,
        INELIGIBLE="true",
        PUBLISH_RESULT="skipped",
    )
    assert result.returncode == 0, result.stderr
