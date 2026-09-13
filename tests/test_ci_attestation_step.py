"""
The workflow's attestation command, checked as a command.

This step is the authority for what the cited source currently says: if it
silently stops verifying, every downstream claim about the evidence rests on
nothing. It was reported three times as invoking the verifier with no
argument, which was never true — a folded YAML scalar put the evidence path
on a continuation line, and every truncated view of the patch showed the
command without it.

The step is one line now so nothing can hide the argument, and these tests
read the workflow rather than trusting either reading. They parse the command
out of `ci.yml` and exercise it, so a future edit that drops the path fails
here instead of in CI, and nobody has to argue from a diff again.
"""

import importlib.util
import shlex
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/ci.yml"
STEP = "Verify live SSI source attestation"


def _attestation_command() -> list[str]:
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    for job in workflow["jobs"].values():
        for step in job.get("steps", []):
            if step.get("name") == STEP:
                return shlex.split(step["run"])
    raise AssertionError(f"no {STEP!r} step in {WORKFLOW}")


def test_the_workflow_still_has_the_attestation_step():
    assert _attestation_command()


def test_the_command_passes_an_evidence_path_that_exists():
    """The defect that was reported three times, pinned so it cannot happen."""
    command = _attestation_command()

    assert command[0] == "python"
    assert command[1].endswith("verify_source_attestation.py")
    assert len(command) >= 3, f"no evidence argument in {command!r}"

    evidence = ROOT / command[2]
    assert evidence.is_file(), f"{command[2]} does not exist"


def test_the_command_parses_under_the_verifier_own_parser():
    """
    Argument parsing is where a missing path would actually fail, so run the
    workflow's own argv through the parser rather than eyeballing the YAML.
    """
    command = _attestation_command()
    spec = importlib.util.spec_from_file_location(
        "ssi_source_attestation", ROOT / "scripts/ssi-autopilot/verify_source_attestation.py"
    )
    attestation = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(attestation)

    args = attestation.parse_args(command[2:])

    assert args.evidence == Path(command[2])
    assert args.refresh is False, "CI must verify, never refresh"
    assert args.record is None, "CI must not write records"


def test_the_verifier_refuses_the_command_without_its_evidence_path():
    """Confirms the argument is load-bearing rather than decorative."""
    spec = importlib.util.spec_from_file_location(
        "ssi_source_attestation", ROOT / "scripts/ssi-autopilot/verify_source_attestation.py"
    )
    attestation = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(attestation)

    with pytest.raises(SystemExit):
        attestation.parse_args([])


def test_the_step_is_a_single_line_so_truncation_cannot_hide_the_argument():
    """
    Not style. A folded scalar is what made a correct step read as broken in
    every truncated diff of it.
    """
    raw = WORKFLOW.read_text(encoding="utf-8")
    marker = f"- name: {STEP}"
    tail = raw[raw.index(marker) :]
    run_line = next(line for line in tail.splitlines() if line.strip().startswith("run:"))

    assert ">" not in run_line and "|" not in run_line, (
        "keep the attestation command on one line; a folded scalar hides the "
        "evidence path from any truncated view of this file"
    )
    assert "verify_source_attestation.py" in run_line
    assert ".json" in run_line
