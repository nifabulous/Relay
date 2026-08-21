"""Reviewer -> collector -> core round-trip harness.

Every other arbiter test feeds the core hand-authored schema-1 history. This
harness instead starts from a REVIEWER COMMENT BODY (the artifact the T2
reviewer actually posts) and drives it through the real collector parse path
(extract_trailer -> validate_trailer) into schema-1 history the core accepts.
It is the one test that exercises the emit->parse seam rather than assuming it.

The live gap it closes: drop a REAL captured reviewer comment into
tests/fixtures/arbiter/live_reviewer_capture.md and the `test_live_capture_*`
tests stop skipping and validate the real gpt-5.6-luna trailer against the
shipped collector. Until then the canonical-example test proves the harness
itself and the schema-doc example round-trip.

Capture command (run with OPENAI_API_KEY set, from a real branch):
    CODEX_REVIEW_ENABLED=true OPENAI_API_KEY=... GH_REPO=<owner/repo> \
      bash scripts/codex_review_pr.sh <pr>
then copy the posted comment body into the fixture file above.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT / "scripts"))

import codex_arbiter as arb  # noqa: E402,I001  (import after sys.path setup)

_LIVE_CAPTURE = _REPO_ROOT / "tests" / "fixtures" / "arbiter" / "live_reviewer_capture.md"

# The schema-doc canonical example, as the reviewer is instructed to emit it
# (multi-line trailer, HTML comment). Reconstruction, not a live capture.
_CANONICAL_COMMENT = """\
<!-- codex-pr-review:99:0000000000000000000000000000000000000000 -->

**Verdict: BLOCK**

### Findings
- P1 published-self-assert (app/models.py): still open.

<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[
  {"sev":"P1","state":"OPEN","file":"app/models.py","cat":"authorization",
   "id":"published-self-assert"}]} -->
"""


def _roundtrip(comment_body: str):
    """Reviewer comment body -> parsed trailer -> validated -> core-accepted."""
    trailer, err = arb.extract_trailer(comment_body)
    assert err is None, f"extract_trailer rejected the comment: {err}"
    assert trailer is not None, "no trailer extracted from the comment body"
    validated, verr = arb.validate_trailer(trailer)
    assert verr is None, f"validate_trailer rejected a real reviewer trailer: {verr}"
    assert validated is not None
    return validated


def test_canonical_reviewer_comment_round_trips_through_the_collector():
    validated = _roundtrip(_CANONICAL_COMMENT)
    assert validated["schema"] == 2
    assert validated["findings"], "canonical trailer parsed to zero findings"
    ids = {f["id"] for f in validated["findings"]}
    assert "published-self-assert" in ids


def test_multiline_trailer_is_parsed_whole():
    # The reviewer emits the trailer across physical lines; the parser must
    # scan open->close, not assume one line. This is the seam that would break
    # silently if a future reviewer prompt reflowed the JSON.
    assert "\n" in _CANONICAL_COMMENT.split("codex-verdict:")[1].split("-->")[0]
    validated = _roundtrip(_CANONICAL_COMMENT)
    assert len(validated["findings"]) == 1


@pytest.mark.skipif(
    not _LIVE_CAPTURE.exists(),
    reason=(
        "no live reviewer capture yet — drop a real posted comment into "
        "tests/fixtures/arbiter/live_reviewer_capture.md to activate "
        "(see module docstring for the capture command)"
    ),
)
def test_live_capture_round_trips_through_the_collector():
    body = _LIVE_CAPTURE.read_text(encoding="utf-8")
    validated = _roundtrip(body)
    # A real reviewer trailer must be schema 2 and every finding must carry the
    # fields the core keys identity on. If the live model drifts from the
    # schema doc, THIS is the test that catches it before a merge trusts it.
    assert validated["schema"] == 2
    for finding in validated["findings"]:
        assert finding["sev"] in ("P0", "P1", "P2", "P3")
        assert finding["state"] in ("NEW", "OPEN", "RESOLVED")
        assert finding["file"] and finding["cat"] and finding["id"]
