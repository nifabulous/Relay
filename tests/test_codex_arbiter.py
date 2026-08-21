"""Tests for scripts/codex_arbiter.py — the deterministic review-loop arbiter.

Written before the implementation (TDD). Every §6.3 fixture in the T3 brief is
a test here. All decision cases exercise the PURE CORE (arb.decide) directly;
the collector's network path is never touched. The trailer parser and history
builder are pure string/data functions and are tested directly too.

The arbiter must NEVER call a model. Its value is being unarguable-with, so the
tests pin exact rules, not just recommendations.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "arbiter"
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import codex_arbiter as arb  # noqa: E402,I001  (deliberate import after sys.path setup)


# --------------------------------------------------------------------------- #
# Builders — synthetic schema-1 histories for the unit scenarios.             #
# --------------------------------------------------------------------------- #
DEFAULT_PR = 100
BOT = "github-actions[bot]"


def _sha(n: int) -> str:
    """A distinct 40-hex head SHA per round index."""
    return f"{n:040x}"


def _ts(n: int) -> str:
    return f"2026-08-17T09:{n:02d}:00Z"


def _finding(sev, state, file, cat, fid, evidence=None):
    obj = {"sev": sev, "state": state, "file": file, "cat": cat, "id": fid}
    if evidence is not None:
        obj["evidence"] = evidence
    return obj


def _comment(
    cid,
    n,
    findings=None,
    *,
    pr=DEFAULT_PR,
    verdict="BLOCK",
    author=BOT,
    head_sha=None,
    marker="auto",
    trailer="auto",
    created_at=None,
):
    head_sha = head_sha if head_sha is not None else _sha(n)
    if marker == "auto":
        marker = f"codex-pr-review:{pr}:{head_sha}"
    if trailer == "auto":
        trailer = {"schema": 2, "verdict": verdict, "findings": findings or []}
    return {
        "comment_id": cid,
        "created_at": created_at if created_at is not None else _ts(n),
        "author_login": author,
        "head_sha": head_sha,
        "marker": marker,
        "body": "[body elided]",
        "trailer": trailer,
    }


def _history(comments, *, pr=DEFAULT_PR, repo="leatherback/relay", diff_files=None, head_sha=None):
    return {
        "schema": 1,
        "repo": repo,
        "pr": pr,
        "current_head_sha": head_sha or (comments[-1]["head_sha"] if comments else _sha(0)),
        "current_diff_files": diff_files if diff_files is not None else [],
        "comments": comments,
    }


def _evidence(files, verification="tests/test_x.py::test_y"):
    return {"files": files, "verification": verification}


def _load(name):
    return json.loads((FIXTURES / name).read_text())


def _contract(**kw):
    return arb.Contract(**kw)


def _decide_prefix(history, k, contract):
    comments = sorted(history["comments"], key=lambda c: (c["created_at"], c["comment_id"]))
    trimmed = dict(history)
    trimmed["comments"] = comments[:k]
    if comments[:k]:
        trimmed["current_head_sha"] = comments[k - 1]["head_sha"]
    return arb.decide(trimmed, contract)


def _first_firing_round(history, contract):
    """Emulate the loop: run the core on growing prefixes; return the first
    canonical round where the recommendation stops being plain CONTINUE."""
    comments = sorted(history["comments"], key=lambda c: (c["created_at"], c["comment_id"]))
    for k in range(1, len(comments) + 1):
        decision = _decide_prefix(history, k, contract)
        if decision.recommendation != "CONTINUE":
            return k, decision
    return None, None


# --------------------------------------------------------------------------- #
# Replay traces — PRs 22, 24, 21.                                             #
# --------------------------------------------------------------------------- #
def test_pr22_converges_to_merge_clean_at_round_4():
    """PR 22 (reconstruction): 4 rounds, all findings RESOLVED with in-diff
    evidence by round 4 → MERGE-CLEAN citing CLEAN. The advisory BLOCK verdicts
    on rounds 1-3 do not block the clean disposition."""
    decision = arb.decide(_load("pr22_history.json"), _contract())
    assert decision.recommendation == "MERGE-CLEAN"
    assert decision.cited_rule == "CLEAN"
    assert decision.round_count == 4
    assert decision.needs_human is False


def test_pr24_escalates_stuck_p1_by_round_5_not_21():
    """PR 24 (reconstruction): a P1 recurring from round 1, never resolved.
    STUCK-P1 must fire by round 5 (NOT at the 21 rounds it really ran), and the
    cited rule must be STUCK-P1 even though HARD-CAP would also escalate."""
    history = _load("pr24_history.json")
    contract = _contract()

    final = arb.decide(history, contract)
    assert final.recommendation == "ESCALATE-TO-SCOPING"
    assert final.cited_rule == "STUCK-P1"
    assert final.needs_human is True

    firing_round, firing_decision = _first_firing_round(history, contract)
    assert firing_round is not None
    assert firing_round <= 5, f"STUCK-P1 must fire by round 5, fired at {firing_round}"
    assert firing_decision.cited_rule == "STUCK-P1"
    assert firing_decision.recommendation == "ESCALATE-TO-SCOPING"


def test_pr21_outcome_is_computed_then_pinned():
    """PR 21 (reconstruction): 7 rounds mixing a recurring P1 with minors.

    The T3 brief forbids asserting a *guessed* outcome for PR 21. The value
    below was COMPUTED by running arb.decide over the reconstructed trace on
    2026-08-17 and is PINNED here as a locked regression:

        recommendation = ESCALATE-TO-SCOPING
        cited_rule     = STUCK-P1
        first firing   = round 3

    Derivation: the P1 'sig-verify-bypass' (app/auth.py, authorization) is
    NEW in round 1 and OPEN through round 7, on a fresh head SHA each round
    (a fixer push between every appearance). By round 3 it has been open for
    3 consecutive rounds with pushes between, so rule 2 (STUCK-P1) fires and
    beats every merge rule and the hard cap for the remaining rounds. The P2
    'fee-rounding-drift' resolves in round 3 with in-diff evidence and the P3
    'auth-flow-doc-gap' rides along from round 4; neither changes the verdict.
    If this assertion ever breaks, RE-COMPUTE from the trace before editing it.
    """
    history = _load("pr21_history.json")
    contract = _contract()

    decision = arb.decide(history, contract)
    assert decision.recommendation == "ESCALATE-TO-SCOPING"  # computed & locked 2026-08-17
    assert decision.cited_rule == "STUCK-P1"  # computed & locked 2026-08-17
    assert decision.round_count == 7
    assert decision.needs_human is True

    firing_round, firing_decision = _first_firing_round(history, contract)
    assert firing_round == 3  # computed & locked 2026-08-17
    assert firing_decision.cited_rule == "STUCK-P1"  # computed & locked 2026-08-17


# --------------------------------------------------------------------------- #
# Fail-closed: malformed / missing trailers.                                  #
# --------------------------------------------------------------------------- #
def test_malformed_trailer_on_latest_round_is_continue_needs_human_never_merge():
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")]),
        _comment(2, 2, trailer=None),  # unparseable latest round
    ]
    decision = arb.decide(_history(comments), _contract())
    assert decision.loop_action == "CONTINUE"
    assert decision.needs_human is True
    assert decision.recommendation == "NEEDS-HUMAN"
    assert decision.cited_rule == "MALFORMED-TRAILER"
    assert not decision.recommendation.startswith("MERGE")


def test_unknown_schema_trailer_on_latest_round_needs_human():
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")]),
        _comment(2, 2, trailer={"schema": 99, "verdict": "BLOCK", "findings": []}),
    ]
    decision = arb.decide(_history(comments), _contract())
    assert decision.needs_human is True
    assert decision.cited_rule == "MALFORMED-TRAILER"


def test_missing_trailer_midhistory_counts_toward_cap_but_no_finding_states():
    """A round with no valid trailer counts as a round (toward the cap) but
    contributes no finding states; a later valid round decides normally."""
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")]),
        _comment(2, 2, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]),
        _comment(3, 3, trailer=None),  # invalid round mid-history
        _comment(4, 4, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]),
        _comment(5, 5, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]),
    ]
    decision = arb.decide(_history(comments), _contract())
    assert decision.round_count == 5  # the null round still counts
    assert decision.recommendation == "MERGE-WITH-GAPS"  # tracked across the gap
    assert any(g["id"] == "a" for g in decision.proposed_gaps)


# --------------------------------------------------------------------------- #
# Ordering, duplicates, force-push gaps.                                       #
# --------------------------------------------------------------------------- #
def test_out_of_order_created_at_is_sorted_before_folding():
    """Comments supplied newest-first must be sorted by created_at; otherwise
    the OPEN in round 2 would look like an orphan and force needs-human."""
    r1 = _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")])
    r2 = _comment(2, 2, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")])
    decision = arb.decide(_history([r2, r1]), _contract())  # reversed order
    assert decision.cited_rule != "ORPHAN-STATE"
    assert decision.recommendation == "MERGE-WITH-GAPS"


def test_duplicate_bot_comments_for_one_head_sha_is_needs_human():
    r1 = _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")], head_sha=_sha(7))
    r2 = _comment(2, 2, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")], head_sha=_sha(7))
    decision = arb.decide(_history([r1, r2]), _contract())
    assert decision.needs_human is True
    assert decision.cited_rule == "AMBIGUOUS-HISTORY"
    assert not decision.recommendation.startswith("MERGE")


def test_force_push_sha_gaps_are_fine():
    """Rounds are the comments that exist, in creation order; non-contiguous
    head SHAs (force-pushes/skips) are not an error."""
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")], head_sha="a" * 40),
        _comment(2, 2, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")], head_sha="f" * 40),
        _comment(3, 3, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")], head_sha="c" * 40),
    ]
    decision = arb.decide(_history(comments), _contract())
    assert decision.recommendation == "MERGE-WITH-GAPS"
    assert decision.cited_rule == "EXHAUSTED-NOVELTY"


# --------------------------------------------------------------------------- #
# The trust model: omission, rename, orphan.                                   #
# --------------------------------------------------------------------------- #
def test_dropped_open_p1_is_needs_human_never_merge_clean():
    """The omission attack: an open P1 simply absent from the latest trailer
    must read as a question, never a resolution."""
    comments = [
        _comment(1, 1, [
            _finding("P1", "NEW", "app/models.py", "authz", "p1"),
            _finding("P2", "NEW", "app/a.py", "cat-a", "a"),
        ]),
        _comment(2, 2, [
            _finding("P1", "OPEN", "app/models.py", "authz", "p1"),
            _finding("P2", "OPEN", "app/a.py", "cat-a", "a"),
        ]),
        _comment(3, 3, [
            _finding("P2", "OPEN", "app/a.py", "cat-a", "a"),  # P1 dropped
        ]),
    ]
    decision = arb.decide(_history(comments), _contract())
    assert decision.needs_human is True
    assert decision.cited_rule == "ACCOUNTING-GAP"
    assert decision.recommendation != "MERGE-CLEAN"
    assert not decision.recommendation.startswith("MERGE")


def test_renamed_slug_same_file_cat_as_new_is_ambiguous_identity():
    """Rename attack: the same (file, cat) reappears as NEW under a fresh id
    while the original is still open.

    The rename is refused OUTRIGHT at the fold step (AMBIGUOUS-IDENTITY →
    needs-human) before any rule is evaluated, so the STUCK-P1 counter is never
    consulted — a reviewer cannot rename a nearly-stuck P1 to silently restart
    the count and dodge escalation.

    Demonstrated by contrast on identical first two rounds (trailing run 2, one
    short of the 3-round STUCK-P1 threshold): keeping the SAME id OPEN in round 3
    tips it into STUCK-P1, whereas renaming it in round 3 does NOT reset into a
    fresh 1-round finding that keeps looping (which would read CONTINUE) — it is
    refused as ambiguous identity.
    """
    r1 = _comment(1, 1, [_finding("P1", "NEW", "app/models.py", "authz", "published-self-assert")])
    r2 = _comment(2, 2, [_finding("P1", "OPEN", "app/models.py", "authz", "published-self-assert")])

    # Control: holding the SAME id OPEN a third round tips it into STUCK-P1, so
    # the run at round 3 is genuinely at the escalation threshold.
    kept_open = arb.decide(
        _history([r1, r2, _comment(3, 3, [
            _finding("P1", "OPEN", "app/models.py", "authz", "published-self-assert")])]),
        _contract(),
    )
    assert kept_open.cited_rule == "STUCK-P1"
    assert kept_open.recommendation == "ESCALATE-TO-SCOPING"

    # Rename in round 3 must NOT silently restart the count into a fresh finding
    # (which would read CONTINUE); it is refused before any rule is consulted.
    renamed = arb.decide(
        _history([r1, r2, _comment(3, 3, [
            _finding("P1", "NEW", "app/models.py", "authz", "published-forgeable")])]),
        _contract(),
    )
    assert renamed.needs_human is True
    assert renamed.cited_rule == "AMBIGUOUS-IDENTITY"
    assert renamed.recommendation == "NEEDS-HUMAN"
    assert renamed.recommendation != "CONTINUE"
    assert not renamed.recommendation.startswith("MERGE")


def test_open_state_with_unknown_id_is_orphan_needs_human():
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/fees.py", "fee-calc", "fee-a")]),
        _comment(2, 2, [
            _finding("P2", "OPEN", "app/fees.py", "fee-calc", "fee-a"),
            _finding("P2", "OPEN", "app/routing.py", "routing-order", "route-b"),  # id matches nothing open
        ]),
    ]
    decision = arb.decide(_history(comments), _contract())
    assert decision.needs_human is True
    assert decision.cited_rule == "ORPHAN-STATE"


def test_resolved_state_with_unknown_id_is_orphan_needs_human():
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/fees.py", "fee-calc", "fee-a")]),
        _comment(2, 2, [
            _finding("P2", "OPEN", "app/fees.py", "fee-calc", "fee-a"),
            _finding("P2", "RESOLVED", "app/x.py", "cat-x", "ghost",
                     evidence=_evidence(["app/x.py"])),
        ]),
    ]
    decision = arb.decide(_history(comments, diff_files=["app/x.py"]), _contract())
    assert decision.needs_human is True
    assert decision.cited_rule == "ORPHAN-STATE"


# --------------------------------------------------------------------------- #
# Rule ordering.                                                               #
# --------------------------------------------------------------------------- #
def test_stuck_p1_beats_minor_repeats():
    """P1 open 3 rounds alongside repeated minors → STUCK-P1 wins (rule 2
    before the merge rules). This is the round-1 rule-ordering regression."""
    comments = [
        _comment(1, 1, [
            _finding("P1", "NEW", "app/models.py", "authz", "p1"),
            _finding("P2", "NEW", "app/a.py", "cat-a", "a"),
        ]),
        _comment(2, 2, [
            _finding("P1", "OPEN", "app/models.py", "authz", "p1"),
            _finding("P2", "OPEN", "app/a.py", "cat-a", "a"),
        ]),
        _comment(3, 3, [
            _finding("P1", "OPEN", "app/models.py", "authz", "p1"),
            _finding("P2", "OPEN", "app/a.py", "cat-a", "a"),
        ]),
    ]
    decision = arb.decide(_history(comments), _contract())
    assert decision.recommendation == "ESCALATE-TO-SCOPING"
    assert decision.cited_rule == "STUCK-P1"


def test_stuck_p1_beats_hard_cap():
    """At round >= 10 both STUCK-P1 (rule 2) and HARD-CAP (rule 5) escalate;
    the cited rule must be STUCK-P1, proving first-match ordering."""
    comments = [_comment(1, 1, [_finding("P1", "NEW", "app/models.py", "authz", "p1")])]
    for n in range(2, 11):  # rounds 2..10 keep the P1 OPEN
        comments.append(_comment(n, n, [_finding("P1", "OPEN", "app/models.py", "authz", "p1")]))
    decision = arb.decide(_history(comments), _contract())
    assert decision.round_count == 10
    assert decision.recommendation == "ESCALATE-TO-SCOPING"
    assert decision.cited_rule == "STUCK-P1"


def test_interspersed_malformed_round_breaks_stuck_p1_run_conservatively():
    """Documented conservative choice (_trailing_run): a malformed round between
    P1 appearances breaks the STUCK-P1 *consecutive* run. A P1 open in rounds
    1,2,[malformed 3],4,5 has a trailing run of only 2 (rounds 4,5), so STUCK-P1
    does NOT fire at round 5 — the loop keeps going, fail-closed (the P1 stays
    open and the hard cap remains the backstop). This pins the behavior so the
    choice lives in the suite, not only in a code comment.

    Contrast: the same P1 held OPEN across five *consecutive* rounds (no gap)
    does fire STUCK-P1, proving the interspersed malformed round is what breaks
    the run rather than the round count itself."""
    def p1(state):
        return [_finding("P1", state, "app/models.py", "authz", "p1")]

    # Interspersed malformed round 3: contributes no finding states, breaking the
    # run so the trailing run at round 5 is only length 2.
    gapped = [
        _comment(1, 1, p1("NEW")),
        _comment(2, 2, p1("OPEN")),
        _comment(3, 3, trailer=None),  # malformed — skipped, not in the P1's run
        _comment(4, 4, p1("OPEN")),
        _comment(5, 5, p1("OPEN")),
    ]
    decision = arb.decide(_history(gapped), _contract())
    assert decision.round_count == 5  # the malformed round still counts
    assert decision.cited_rule != "STUCK-P1"
    assert decision.recommendation == "CONTINUE"

    # Contrast: five consecutive P1-open rounds (no malformed gap) DO fire STUCK-P1.
    consecutive = [
        _comment(1, 1, p1("NEW")),
        _comment(2, 2, p1("OPEN")),
        _comment(3, 3, p1("OPEN")),
        _comment(4, 4, p1("OPEN")),
        _comment(5, 5, p1("OPEN")),
    ]
    contrast = arb.decide(_history(consecutive), _contract())
    assert contrast.cited_rule == "STUCK-P1"
    assert contrast.recommendation == "ESCALATE-TO-SCOPING"


def test_exhausted_novelty_merges_with_gaps_before_the_soft_gate():
    """No P1s, every open finding a repeated minor → MERGE-WITH-GAPS via
    EXHAUSTED-NOVELTY, even at round 3 (before the soft gate)."""
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")]),
        _comment(2, 2, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]),
        _comment(3, 3, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]),
    ]
    decision = arb.decide(_history(comments), _contract())
    assert decision.recommendation == "MERGE-WITH-GAPS"
    assert decision.cited_rule == "EXHAUSTED-NOVELTY"


def test_soft_gate_merges_with_gaps_when_a_new_minor_is_present():
    """At round >= 5 with only minor findings (one of them NEW, so not all
    repeated) and no P1 → MERGE-WITH-GAPS via the SOFT GATE."""
    comments = [_comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")])]
    for n in range(2, 5):
        comments.append(_comment(n, n, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]))
    comments.append(_comment(5, 5, [
        _finding("P2", "OPEN", "app/a.py", "cat-a", "a"),
        _finding("P3", "NEW", "app/b.py", "cat-b", "b"),  # new minor breaks "all repeated"
    ]))
    decision = arb.decide(_history(comments), _contract())
    assert decision.round_count == 5
    assert decision.recommendation == "MERGE-WITH-GAPS"
    assert decision.cited_rule == "SOFT-GATE"


def test_soft_gate_past_the_hard_cap_never_merges_at_the_cap():
    """Review P1 (head b73afd5): a soft gate configured past the fixed hard
    cap must never turn the cap into a merge gate. With soft_gate=12 and
    hard_cap=10, round 10 is the CAP — an unresolved loop escalates there no
    matter what the open findings look like. The previous implementation
    evaluated SOFT-GATE (with a clamp) before HARD-CAP and returned
    MERGE-WITH-GAPS at round 10, converting the fail-closed ceiling into a
    merge recommendation."""
    comments = [_comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")])]
    for n in range(2, 10):
        comments.append(_comment(n, n, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]))
    comments.append(_comment(10, 10, [
        _finding("P2", "OPEN", "app/a.py", "cat-a", "a"),
        _finding("P3", "NEW", "app/b.py", "cat-b", "b"),  # new minor: novelty does not fire
    ]))
    decision = arb.decide(_history(comments), _contract(soft_gate=12))  # hard_cap stays 10
    assert decision.round_count == 10
    assert decision.recommendation == "ESCALATE-TO-SCOPING"
    assert decision.cited_rule == "HARD-CAP"


def test_hard_cap_preempts_merge_rules_for_repeated_minors():
    """Review P1 (head b73afd5): at the cap, even a fully-repeated minors-only
    history — which would merge via EXHAUSTED-NOVELTY one round earlier —
    must escalate instead of merging AT the cap."""
    comments = [_comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")])]
    for n in range(2, 11):
        comments.append(_comment(n, n, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]))
    decision = arb.decide(_history(comments), _contract())
    assert decision.round_count == 10
    assert decision.recommendation == "ESCALATE-TO-SCOPING"
    assert decision.cited_rule == "HARD-CAP"


def test_exhausted_novelty_still_merges_the_round_before_the_cap():
    """The accept path for the reorder above: novelty exhaustion remains a
    legitimate merge rule when the loop has NOT reached the cap — this test
    fails if HARD-CAP was moved too early and now swallows round 9."""
    comments = [_comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")])]
    for n in range(2, 10):
        comments.append(_comment(n, n, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]))
    decision = arb.decide(_history(comments), _contract())  # soft_gate=5, hard_cap=10
    assert decision.round_count == 9
    assert decision.recommendation == "MERGE-WITH-GAPS"
    assert decision.cited_rule == "EXHAUSTED-NOVELTY"


def test_hard_cap_escalates_and_never_merges():
    """A non-stuck P1 arriving late keeps rules 1-4 from firing; at round 10
    the hard cap escalates (never merges) with the residual list."""
    comments = [_comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")])]
    for n in range(2, 9):
        comments.append(_comment(n, n, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]))
    comments.append(_comment(9, 9, [
        _finding("P2", "OPEN", "app/a.py", "cat-a", "a"),
        _finding("P1", "NEW", "app/models.py", "authz", "late-p1"),
    ]))
    comments.append(_comment(10, 10, [
        _finding("P2", "OPEN", "app/a.py", "cat-a", "a"),
        _finding("P1", "OPEN", "app/models.py", "authz", "late-p1"),
    ]))
    decision = arb.decide(_history(comments), _contract())
    assert decision.round_count == 10
    assert decision.recommendation == "ESCALATE-TO-SCOPING"
    assert decision.cited_rule == "HARD-CAP"
    assert {g["id"] for g in decision.proposed_gaps} == {"a", "late-p1"}


# --------------------------------------------------------------------------- #
# Bounded, risk-weighted resolution.                                          #
# --------------------------------------------------------------------------- #
def test_p1_resolution_is_pending_human_and_blocks_merge_clean():
    """A P1 RESOLVED with bounded evidence becomes pending-human; CLEAN is
    impossible while a P1 resolution is pending."""
    comments = [
        _comment(1, 1, [_finding("P1", "NEW", "app/models.py", "authz", "p1")]),
        _comment(2, 2, [_finding("P1", "RESOLVED", "app/models.py", "authz", "p1",
                                  evidence=_evidence(["app/models.py"]))]),
    ]
    decision = arb.decide(_history(comments, diff_files=["app/models.py"]), _contract())
    assert decision.recommendation != "MERGE-CLEAN"
    assert decision.recommendation == "NEEDS-HUMAN"
    assert decision.cited_rule == "P1-RESOLUTION-PENDING"
    assert decision.needs_human is True


def test_pending_human_p1_holds_needs_human_even_with_an_open_minor():
    """Finding-1 regression: a P1 RESOLVED with in-diff evidence moves to
    pending-human and leaves the open-set, but an UNRELATED minor is still open.

    The pending-human hold must fire regardless of coexisting open minors:
    P1-RESOLUTION-PENDING / NEEDS-HUMAN, never a merge-family headline. Before
    the fix, `not open_set and pending_human` was False (the minor kept the
    open-set non-empty), so control fell through to EXHAUSTED-NOVELTY and the
    unverified P1 resolution was surfaced as a proposed gap under a
    MERGE-WITH-GAPS headline — a fail-closed violation (§6.4: a P1 gap may be
    proposed only under STUCK-P1 / HARD-CAP escalation)."""
    comments = [
        _comment(1, 1, [
            _finding("P1", "NEW", "app/models.py", "authz", "p1"),
            _finding("P2", "NEW", "app/a.py", "cat-a", "a"),
        ]),
        _comment(2, 2, [
            _finding("P1", "RESOLVED", "app/models.py", "authz", "p1",
                     evidence=_evidence(["app/models.py"])),
            _finding("P2", "OPEN", "app/a.py", "cat-a", "a"),  # unrelated minor still open
        ]),
    ]
    decision = arb.decide(_history(comments, diff_files=["app/models.py"]), _contract())
    assert decision.recommendation == "NEEDS-HUMAN"
    assert decision.cited_rule == "P1-RESOLUTION-PENDING"
    assert decision.needs_human is True
    # The pending P1 is held for a human, NOT emitted under a merge headline.
    assert decision.recommendation != "MERGE-WITH-GAPS"
    assert not decision.recommendation.startswith("MERGE")
    pending = [g for g in decision.proposed_gaps if g["id"] == "p1"]
    assert pending and pending[0]["status"] == "pending-human"


def test_pending_human_p1_and_a_second_merely_open_p1_both_appear_in_gaps():
    """Two coexisting P1s, pinning the exact shape T4's gap-issue poster will
    consume. P1-A resolves with in-diff evidence at round 2 and moves to
    pending-human; P1-B stays merely OPEN for 2 rounds — below
    contract.stuck_p1_rounds (3), so STUCK-P1 does not fire for it. The
    pending-human hold (checked after STUCK-P1, before the merge-family rules)
    still wins: NEEDS-HUMAN / P1-RESOLUTION-PENDING, and loop_action never
    reaches a MERGE-* headline. proposed_gaps carries BOTH P1s in the same
    list — P1-B as "open" (from the open-set) and P1-A as "pending-human"
    (from the pending-human set) — proving a coexisting merely-open P1 can
    appear in proposed_gaps outside STUCK-P1/HARD-CAP escalation, contrary to
    a previously overbroad code comment (now corrected)."""
    comments = [
        _comment(1, 1, [
            _finding("P1", "NEW", "app/models.py", "authz", "p1-a"),
            _finding("P1", "NEW", "app/other.py", "authz-b", "p1-b"),
        ]),
        _comment(2, 2, [
            _finding("P1", "RESOLVED", "app/models.py", "authz", "p1-a",
                     evidence=_evidence(["app/models.py"])),
            _finding("P1", "OPEN", "app/other.py", "authz-b", "p1-b"),
        ]),
    ]
    decision = arb.decide(_history(comments, diff_files=["app/models.py"]), _contract())
    assert decision.round_count == 2
    assert decision.recommendation == "NEEDS-HUMAN"
    assert decision.cited_rule == "P1-RESOLUTION-PENDING"
    assert decision.loop_action == "CONTINUE"
    assert not decision.loop_action.startswith("MERGE")
    assert not decision.recommendation.startswith("MERGE")

    gaps_by_id = {g["id"]: g for g in decision.proposed_gaps}
    assert gaps_by_id["p1-b"]["status"] == "open"
    assert gaps_by_id["p1-a"]["status"] == "pending-human"


def test_p2_resolved_without_in_diff_evidence_stays_open():
    """A P2 RESOLVED whose evidence file is not in current_diff_files fails the
    bounded consistency check, so the finding stays open and cannot yield
    MERGE-CLEAN."""
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/fees.py", "fee-calc", "fee-a")]),
        _comment(2, 2, [_finding("P2", "RESOLVED", "app/fees.py", "fee-calc", "fee-a",
                                  evidence=_evidence(["app/unrelated.py"]))]),
    ]
    decision = arb.decide(_history(comments, diff_files=["app/fees.py"]), _contract())
    assert decision.recommendation != "MERGE-CLEAN"
    assert any(g["id"] == "fee-a" for g in decision.proposed_gaps)


def test_p2_resolved_with_in_diff_evidence_closes_and_can_merge_clean():
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/fees.py", "fee-calc", "fee-a")]),
        _comment(2, 2, [_finding("P2", "RESOLVED", "app/fees.py", "fee-calc", "fee-a",
                                  evidence=_evidence(["app/fees.py"]))]),
    ]
    decision = arb.decide(_history(comments, diff_files=["app/fees.py"]), _contract())
    assert decision.recommendation == "MERGE-CLEAN"
    assert decision.cited_rule == "CLEAN"


def test_advisory_clean_verdict_does_not_merge_while_a_p1_is_open():
    """The bot's own verdict is advisory only; an open P1 is not merged just
    because the reviewer labelled the round NO-ACTIONABLE-FINDINGS."""
    comments = [
        _comment(1, 1, [_finding("P1", "NEW", "app/models.py", "authz", "p1")],
                 verdict="NO-ACTIONABLE-FINDINGS"),
    ]
    decision = arb.decide(_history(comments), _contract())
    assert decision.recommendation == "CONTINUE"
    assert not decision.recommendation.startswith("MERGE")


def test_no_canonical_rounds_yet_is_continue():
    decision = arb.decide(_history([]), _contract())
    assert decision.recommendation == "CONTINUE"
    assert decision.round_count == 0
    assert decision.needs_human is False


def test_non_bot_and_unmarked_comments_do_not_count_as_rounds():
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")], author="random-user"),
        _comment(2, 2, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")], marker="not-a-marker"),
        _comment(3, 3, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")]),  # the only real round
    ]
    decision = arb.decide(_history(comments), _contract())
    assert decision.round_count == 1


# --------------------------------------------------------------------------- #
# Severity folds to the MAX ever recorded for an identity (upgrade never lost). #
# The reviewer re-emits sev every round and keeps only `id` stable, so a        #
# finding first raised P2 and later escalated to P1 must be treated as P1.      #
# --------------------------------------------------------------------------- #
def test_severity_folds_up_p2_new_then_p1_open_blocks_merge_at_soft_gate():
    """Item 1(a): a finding raised P2 NEW and later escalated to P1 OPEN must be
    tracked as P1. The arbiter used to freeze sev at the round the finding was
    first seen, so this finding stayed P2, dropped out of the open-P1 set, and
    reached a MERGE-family disposition at the soft gate while the latest trailer
    literally said P1 OPEN.

    With the max-fold it is P1 by round 5: STUCK-P1 blocks and the
    recommendation is NOT a merge. Pre-fix this exact history returned
    MERGE-WITH-GAPS (novelty-exhausted), a fail-closed violation."""
    comments = [_comment(1, 1, [_finding("P2", "NEW", "app/models.py", "authz", "esc")])]
    for n in range(2, 6):  # rounds 2..5 keep it OPEN, now escalated to P1
        comments.append(_comment(n, n, [_finding("P1", "OPEN", "app/models.py", "authz", "esc")]))
    decision = arb.decide(_history(comments), _contract())
    assert decision.round_count == 5
    assert not decision.recommendation.startswith("MERGE")  # the core fix
    assert decision.recommendation == "ESCALATE-TO-SCOPING"
    assert decision.cited_rule == "STUCK-P1"
    assert decision.needs_human is True
    # And it is carried as a P1 in the residual list, not a P2.
    esc = next(g for g in decision.proposed_gaps if g["id"] == "esc")
    assert esc["sev"] == "P1"


def test_severity_freezes_on_downgrade_p1_new_then_p2_open_stays_p1():
    """Item 1(b): the inverse — P1 NEW then P2 OPEN (a downgrade) — must keep P1.
    max(P1, P2) == P1, so the existing safe freeze-on-downgrade is preserved.
    Pinned so a future 'take the latest sev' refactor (which would de-escalate
    to P2 and let the soft gate merge) is caught: with P1 retained, round 5
    blocks as STUCK-P1, never a merge."""
    comments = [_comment(1, 1, [_finding("P1", "NEW", "app/models.py", "authz", "keep")])]
    for n in range(2, 6):  # rounds 2..5 report it as P2 (a downgrade attempt)
        comments.append(_comment(n, n, [_finding("P2", "OPEN", "app/models.py", "authz", "keep")]))
    decision = arb.decide(_history(comments), _contract())
    assert decision.round_count == 5
    assert not decision.recommendation.startswith("MERGE")
    assert decision.recommendation == "ESCALATE-TO-SCOPING"
    assert decision.cited_rule == "STUCK-P1"
    keep = next(g for g in decision.proposed_gaps if g["id"] == "keep")
    assert keep["sev"] == "P1"


def test_severity_escalated_and_resolved_same_round_routes_pending_human_as_p1():
    """Item 1(c): a finding raised P2 NEW, then in the next round marked RESOLVED
    but re-emitted at P1 (escalated and resolved in the SAME trailer), must fold
    to P1 BEFORE the RESOLVED-P1 -> pending-human routing, so it is held for a
    human as a P1 resolution — never silently closed as a P2.

    Pre-fix the tracked sev was frozen at P2, so the RESOLVED branch took the P2
    path (resolved, not pending-human) and the whole PR read MERGE-CLEAN — a
    fail-closed violation: a P1 resolution self-certified in a single round."""
    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/models.py", "authz", "esc")]),
        _comment(2, 2, [_finding("P1", "RESOLVED", "app/models.py", "authz", "esc",
                                  evidence=_evidence(["app/models.py"]))]),
    ]
    decision = arb.decide(_history(comments, diff_files=["app/models.py"]), _contract())
    assert decision.recommendation != "MERGE-CLEAN"
    assert decision.recommendation == "NEEDS-HUMAN"
    assert decision.cited_rule == "P1-RESOLUTION-PENDING"
    assert decision.needs_human is True
    pending = next(g for g in decision.proposed_gaps if g["id"] == "esc")
    assert pending["status"] == "pending-human"
    assert pending["sev"] == "P1"


# --------------------------------------------------------------------------- #
# P0 (the reviewer's prompt-injection tier) is accepted and normalized to P1.  #
# --------------------------------------------------------------------------- #
def test_validate_trailer_accepts_p0_and_keeps_sibling_findings():
    """Item 2 at the parser seam: a trailer carrying a P0 finding alongside a P2
    is structurally VALID (returns (trailer, None)), so the P2 sibling is not
    lost. Pre-fix P0 was not in the accepted set and validate_trailer returned
    (None, 'bad-sev'), discarding the whole round and every finding in it."""
    trailer = {
        "schema": 2,
        "verdict": "BLOCK",
        "findings": [
            {"sev": "P0", "state": "NEW", "file": "app/models.py",
             "cat": "prompt-injection", "id": "inj"},
            {"sev": "P2", "state": "NEW", "file": "app/a.py", "cat": "cat-a", "id": "a"},
        ],
    }
    validated, err = arb.validate_trailer(trailer)
    assert err is None
    assert validated is not None
    assert len(validated["findings"]) == 2


def test_p0_trailer_severity_is_accepted_and_blocks_as_p1():
    """Item 2 end-to-end: the reviewer prompt tells the model to 'Report P0' for
    a prompt-injection attempt, but the trailer parser only accepted P1/P2/P3,
    so a P0 finding made the WHOLE trailer malformed and the round's OTHER
    findings were lost. Now P0 is accepted and normalized to P1 (the highest
    blocking tier).

    A P0 injection finding coexisting with a P3 minor across 5 rounds (a) does
    not malform the round — BOTH findings survive into the residual list — and
    (b) the P0 gates the merge exactly like a P1 (STUCK-P1 escalation, never a
    merge). Pre-fix every round was malformed, so the residual list was empty
    and the P3 was silently dropped."""
    def rnd(n, inj_state, minor_state):
        return _comment(n, n, [
            _finding("P0", inj_state, "app/models.py", "prompt-injection", "inj"),
            _finding("P3", minor_state, "app/notes.py", "doc-gap", "minor"),
        ])
    comments = [rnd(1, "NEW", "NEW")]
    for n in range(2, 6):
        comments.append(rnd(n, "OPEN", "OPEN"))
    decision = arb.decide(_history(comments), _contract())
    assert decision.round_count == 5
    assert decision.cited_rule != "MALFORMED-TRAILER"  # P0 no longer malforms
    assert not decision.recommendation.startswith("MERGE")  # P0 blocks like a P1
    assert decision.recommendation == "ESCALATE-TO-SCOPING"
    assert decision.cited_rule == "STUCK-P1"
    gaps_by_id = {g["id"]: g for g in decision.proposed_gaps}
    assert set(gaps_by_id) == {"inj", "minor"}  # the minor was NOT lost
    assert gaps_by_id["inj"]["sev"] == "P1"  # P0 normalized to the blocking tier
    assert gaps_by_id["minor"]["sev"] == "P3"


# --------------------------------------------------------------------------- #
# Trailer parser (collector-side, pure). Multi-line is the T2-carried note.    #
# --------------------------------------------------------------------------- #
MULTILINE_TRAILER_BODY = """<!-- codex-pr-review:24:abc -->

_Codex read-only review._

## Verdict: BLOCK

Some findings here, quoting diff content.

<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[
  {"sev":"P1","state":"OPEN","file":"app/models.py","cat":"authorization",
   "id":"published-self-assert"},
  {"sev":"P2","state":"NEW","file":"alembic/versions/20260816_ssi_verified_by.py",
   "cat":"tz-consistency","id":"utc-preflight"},
  {"sev":"P2","state":"RESOLVED","file":"scripts/codex_sanitize.py",
   "cat":"redaction","id":"cookie-header",
   "evidence":{"files":["scripts/codex_sanitize.py"],
              "verification":"tests/test_codex_sanitize.py::test_cookie_header"}}]} -->
"""


def test_extract_trailer_parses_a_multiline_trailer():
    trailer, err = arb.extract_trailer(MULTILINE_TRAILER_BODY)
    assert err is None
    assert trailer is not None
    assert trailer["schema"] == 2
    assert trailer["verdict"] == "BLOCK"
    assert len(trailer["findings"]) == 3
    assert trailer["findings"][0]["id"] == "published-self-assert"
    assert trailer["findings"][2]["evidence"]["files"] == ["scripts/codex_sanitize.py"]


def test_extract_trailer_parses_a_single_line_trailer():
    body = 'Review text.\n<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[]} -->'
    trailer, err = arb.extract_trailer(body)
    assert err is None
    assert trailer["schema"] == 2
    assert trailer["findings"] == []


def test_extract_trailer_returns_none_when_absent():
    trailer, err = arb.extract_trailer("A review with no machine-readable trailer.\n")
    assert trailer is None
    assert err is not None


def test_extract_trailer_flags_more_than_one_trailer_as_malformed():
    body = (
        '<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[]} -->\n'
        '<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[]} -->\n'
    )
    trailer, err = arb.extract_trailer(body)
    assert trailer is None
    assert err is not None


def test_extract_trailer_returns_none_on_bad_json():
    body = "<!-- codex-verdict: {not valid json} -->"
    trailer, err = arb.extract_trailer(body)
    assert trailer is None
    assert err is not None


# --------------------------------------------------------------------------- #
# History builder (collector-side, pure — no network).                         #
# --------------------------------------------------------------------------- #
def test_build_history_filters_non_canonical_and_derives_marker():
    raw = [
        {  # canonical: bot + review marker on the FIRST line, trailer closing
            "id": 11,
            "created_at": "2026-08-17T09:02:00Z",
            "login": BOT,
            "body": "<!-- codex-pr-review:24:" + "a" * 40 + " -->\n"
                    "review\n"
                    '<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[]} -->',
        },
        {  # non-bot author — dropped
            "id": 12,
            "created_at": "2026-08-17T09:03:00Z",
            "login": "someone-else",
            "body": "<!-- codex-pr-review:24:" + "b" * 40 + " -->",
        },
        {  # bot but no review marker — dropped
            "id": 13,
            "created_at": "2026-08-17T09:04:00Z",
            "login": BOT,
            "body": "just a normal bot comment",
        },
        {  # canonical, earlier timestamp — must sort first
            "id": 10,
            "created_at": "2026-08-17T09:00:00Z",
            "login": BOT,
            "body": "<!-- codex-pr-review:24:" + "c" * 40 + " -->\n"
                    '<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[]} -->',
        },
    ]
    history = arb.build_history(24, "leatherback/relay", "d" * 40, ["app/models.py"], raw, _contract())
    assert history["schema"] == 1
    assert history["pr"] == 24
    assert [c["comment_id"] for c in history["comments"]] == [10, 11]  # sorted, filtered

    # Review P2 (head b73afd5): machine metadata is anchored. A bot comment
    # whose marker is NOT on the first line — the shape of a QUOTED marker
    # inside prose the bot legitimately reproduces — is not a canonical
    # round, and a trailer with prose after it is not a round trailer.
    quoted = [{
        "id": 21, "created_at": "2026-08-17T09:05:00Z", "login": BOT,
        "body": "The PR diff contains this line, quoted verbatim:\n"
                "> <!-- codex-pr-review:24:" + "e" * 40 + " -->\n"
                '<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[]} -->',
    }]
    spoofed_marker = arb.build_history(24, "leatherback/relay", "d" * 40,
                                       ["app/models.py"], quoted, _contract())
    assert spoofed_marker["comments"] == []

    trailing_prose = [{
        "id": 22, "created_at": "2026-08-17T09:06:00Z", "login": BOT,
        "body": "<!-- codex-pr-review:24:" + "f" * 40 + " -->\n"
                '<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[]} -->\n'
                "Thanks for reading!",
    }]
    non_final = arb.build_history(24, "leatherback/relay", "d" * 40,
                                  ["app/models.py"], trailing_prose, _contract())
    # The comment is still a canonical round (the marker is genuine), but its
    # trailer failed the close-of-comment anchor and must NOT be consumed:
    # the round records no trailer, which decide() fails closed on.
    assert len(non_final["comments"]) == 1
    assert non_final["comments"][0]["trailer"] is None
    assert history["comments"][0]["head_sha"] == "c" * 40
    assert history["comments"][0]["marker"] == "codex-pr-review:24:" + "c" * 40
    # And the core accepts what the collector emits.
    decision = arb.decide(history, _contract())
    assert decision.round_count == 2


# --------------------------------------------------------------------------- #
# Document validation, CLI, and the no-model invariant.                        #
# --------------------------------------------------------------------------- #
def test_core_rejects_unknown_history_schema():
    with pytest.raises(ValueError):
        arb.decide({"schema": 99, "repo": "x/y", "pr": 1, "comments": []}, _contract())


def test_core_rejects_non_object_history():
    with pytest.raises(ValueError):
        arb.decide([], _contract())


def test_cli_history_path_prints_recommendation(capsys):
    rc = arb.main(["--history", str(FIXTURES / "pr22_history.json")])
    out = capsys.readouterr().out
    assert rc == 0
    assert "MERGE-CLEAN" in out


def test_cli_post_refused_without_operator_mode(monkeypatch):
    monkeypatch.delenv("ARBITER_OPERATOR", raising=False)
    rc = arb.main(["--history", str(FIXTURES / "pr22_history.json"), "--post"])
    assert rc != 0


def test_arbiter_source_makes_no_model_or_http_calls():
    """The arbiter's whole value is being deterministic — it must never reach a
    model, and it must only touch the network through the `gh` CLI seam."""
    source = (REPO_ROOT / "scripts" / "codex_arbiter.py").read_text()
    for forbidden in ("openai", "anthropic", "pydantic_ai", "import requests",
                      "urllib.request", "http.client", "httpx"):
        assert forbidden not in source, f"arbiter must not reference {forbidden!r}"


def test_contract_reads_env_overrides():
    contract = arb.Contract.from_env({"CODEX_BOT_LOGIN": "custom[bot]", "ARBITER_SOFT_GATE": "7"})
    assert contract.bot_login == "custom[bot]"
    assert contract.soft_gate == 7


# --------------------------------------------------------------------------- #
# T4: the gap-issue ledger poster (post_gap_issues).                          #
#                                                                              #
# These are the only tests in this file that touch a subprocess boundary, so  #
# safety is layered on top of the usual `gh`-on-PATH stub from                #
# tests/test_codex_automation.sh: this machine's `gh` is a REAL, authenticated#
# CLI (a live GitHub token), so every test here (a) uses an obviously-fake    #
# "stub-org/stub-repo" repo string, never a real one, (b) prepends a fake     #
# executable named literally `gh` to PATH so subprocess.run(["gh", ...])      #
# finds the stub first, and (c) overrides GH_TOKEN/GITHUB_TOKEN to a garbage  #
# value so that even a PATH-stubbing mistake could not reach the real API.    #
# --------------------------------------------------------------------------- #
STUB_REPO = "stub-org/stub-repo"

_GH_STUB_SCRIPT = """#!/usr/bin/env python3
import json
import os
import sys

STUB_DIR = os.environ["GAP_STUB_DIR"]


def _log(name, argv):
    with open(os.path.join(STUB_DIR, "calls.jsonl"), "a") as fh:
        print(json.dumps({"cmd": name, "argv": argv}), file=fh)


def main():
    argv = sys.argv[1:]

    if argv[:2] == ["label", "create"]:
        _log("label-create", argv)
        return 0

    if argv[:2] == ["issue", "list"]:
        _log("issue-list", argv)
        path = os.path.join(STUB_DIR, "issue_list.json")
        if os.path.exists(path):
            with open(path) as fh:
                sys.stdout.write(fh.read())
        else:
            sys.stdout.write("[]")
        return 0

    if argv[:2] == ["issue", "create"]:
        _log("issue-create", argv)
        counter_path = os.path.join(STUB_DIR, "next_number.txt")
        if os.path.exists(counter_path):
            with open(counter_path) as fh:
                number = int(fh.read().strip())
        else:
            number = 1000
        with open(counter_path, "w") as fh:
            fh.write(str(number + 1))
        with open(os.path.join(STUB_DIR, "created.jsonl"), "a") as fh:
            print(json.dumps({"number": number, "argv": argv}), file=fh)
        print(f"https://github.com/stub-org/stub-repo/issues/{number}")
        return 0

    print("unstubbed gh invocation:", argv, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
"""


def _install_gh_stub(tmp_path, monkeypatch):
    """A real executable named `gh` on PATH, ahead of the real one (studied
    from tests/test_codex_automation.sh's fake-gh-on-PATH harness). Returns the
    stub directory so a test can seed issue_list.json and read back
    created.jsonl / calls.jsonl."""
    stub_dir = tmp_path / "gh_stub"
    stub_dir.mkdir()
    gh_path = stub_dir / "gh"
    gh_path.write_text(_GH_STUB_SCRIPT)
    gh_path.chmod(0o755)
    monkeypatch.setenv("GAP_STUB_DIR", str(stub_dir))
    monkeypatch.setenv("PATH", f"{stub_dir}{os.pathsep}{os.environ.get('PATH', '')}")
    # Defense in depth: this machine's `gh` is really authenticated. Even if
    # PATH resolution somehow missed the stub, these invalid credentials keep
    # any accidental call from reaching the real account.
    monkeypatch.setenv("GH_TOKEN", "test-stub-invalid-token")
    monkeypatch.setenv("GITHUB_TOKEN", "test-stub-invalid-token")
    return stub_dir


def _read_jsonl(path: Path) -> list:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def _created_body(record: dict) -> str:
    argv = record["argv"]
    return argv[argv.index("--body") + 1]


def _created_title(record: dict) -> str:
    argv = record["argv"]
    return argv[argv.index("--title") + 1]


def _calls_matching(stub_dir: Path, cmd: str) -> list:
    """argv lists recorded by the gh stub for a given logical command name
    (``"label-create"``, ``"issue-list"``, or ``"issue-create"``) — see
    _GH_STUB_SCRIPT's ``_log`` helper, which appends one JSON line per
    invocation to calls.jsonl regardless of which of the three it is."""
    return [c["argv"] for c in _read_jsonl(stub_dir / "calls.jsonl") if c["cmd"] == cmd]


def test_post_gap_issues_creates_one_issue_per_gap_with_marker_and_label(tmp_path, monkeypatch):
    """Brief assertion 1 (search-before-create): no existing issue carries any
    gap's marker, so exactly one `gh issue create` happens per gap, each body
    containing its own marker and the `proposed-gap` label."""
    stub_dir = _install_gh_stub(tmp_path, monkeypatch)
    monkeypatch.setenv("ARBITER_OPERATOR", "1")
    contract = _contract()

    comments = [
        _comment(1, 1, [
            _finding("P2", "NEW", "app/a.py", "cat-a", "gap-a"),
            _finding("P3", "NEW", "app/b.py", "cat-b", "gap-b"),
        ]),
        _comment(2, 2, [
            _finding("P2", "OPEN", "app/a.py", "cat-a", "gap-a"),
            _finding("P3", "OPEN", "app/b.py", "cat-b", "gap-b"),
        ]),
    ]
    history = _history(comments, pr=100, repo=STUB_REPO)
    decision = arb.decide(history, contract)
    assert decision.recommendation == "MERGE-WITH-GAPS"
    assert {g["id"] for g in decision.proposed_gaps} == {"gap-a", "gap-b"}

    (stub_dir / "issue_list.json").write_text("[]")

    results = arb.post_gap_issues(decision, 100, STUB_REPO, contract, history)

    assert {r["action"] for r in results} == {"created"}
    created = _read_jsonl(stub_dir / "created.jsonl")
    assert len(created) == 2
    bodies = [_created_body(rec) for rec in created]

    assert any(arb._gap_marker(100, "gap-a", "app/a.py", "cat-a") in b for b in bodies)
    assert any(arb._gap_marker(100, "gap-b", "app/b.py", "cat-b") in b for b in bodies)
    for rec in created:
        argv = rec["argv"]
        assert "--label" in argv
        assert argv[argv.index("--label") + 1] == "proposed-gap"
    # No contract_text was passed: the fallback line must render verbatim.
    assert all("no contract on main" in b for b in bodies)
    # gap-a's finding is OPEN as of comment_id 2 (round 2) — the latest
    # canonical round that carries it — so the permalink must point there.
    gap_a_body = next(b for b in bodies if "gap-a" in b)
    assert "https://github.com/stub-org/stub-repo/pull/100#issuecomment-2" in gap_a_body


def test_list_existing_gap_issues_invocation_scopes_label_and_all_states(tmp_path, monkeypatch):
    """Minor 4: `gh issue list` must be scoped with a ledger label AND
    `--state all`. A regression dropping `--state all` would silently
    narrow the search to open issues only, so a gap issue a maintainer already
    closed (e.g. as a documented accepted-gap) would no longer be found by
    _find_existing_issue and post_gap_issues would spuriously re-create it.
    Asserts on the actual argv the gh stub recorded for the issue-list calls,
    not on the search *result* — a passing search-before-create test does not
    prove the query was scoped correctly, only that today's stub happened to
    return the right thing."""
    stub_dir = _install_gh_stub(tmp_path, monkeypatch)
    monkeypatch.setenv("ARBITER_OPERATOR", "1")
    contract = _contract()

    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "gap-a")]),
        _comment(2, 2, [_finding("P2", "OPEN", "app/a.py", "cat-a", "gap-a")]),
    ]
    history = _history(comments, pr=100, repo=STUB_REPO)
    decision = arb.decide(history, contract)

    (stub_dir / "issue_list.json").write_text("[]")
    arb.post_gap_issues(decision, 100, STUB_REPO, contract, history)

    list_calls = _calls_matching(stub_dir, "issue-list")
    assert len(list_calls) == 2
    queried_labels = [
        argv[argv.index("--label") + 1]
        for argv in list_calls
        if "--label" in argv
    ]
    assert queried_labels == ["proposed-gap", "accepted-gap"]
    for argv in list_calls:
        assert "--state" in argv
        assert argv[argv.index("--state") + 1] == "all"


def test_post_gap_issues_skips_an_issue_relabelled_accepted_gap(tmp_path, monkeypatch):
    """Review P2 (head 2afd089): a maintainer's accepted-gap relabel REMOVES
    the proposed-gap label, so an issue carrying only accepted-gap — open or
    closed — must still be found by the marker search. A proposed-gap-only
    query made the next re-proposal of that gap open a duplicate."""
    stub_dir = _install_gh_stub(tmp_path, monkeypatch)
    monkeypatch.setenv("ARBITER_OPERATOR", "1")
    contract = _contract()

    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "gap-a")]),
        _comment(2, 2, [_finding("P2", "OPEN", "app/a.py", "cat-a", "gap-a")]),
    ]
    history = _history(comments, pr=100, repo=STUB_REPO)
    decision = arb.decide(history, contract)

    marker = arb._gap_marker(100, "gap-a", "app/a.py", "cat-a")
    # The relabel removed proposed-gap; this issue is what a
    # proposed-gap-only query could no longer see.
    (stub_dir / "issue_list.json").write_text(json.dumps([
        {"number": 77, "body": f"{marker}\naccepted by maintainer"}
    ]))

    results = arb.post_gap_issues(decision, 100, STUB_REPO, contract, history)

    assert results == [{"gap_id": "gap-a", "action": "skipped-existing", "issue_number": 77}]
    assert not (stub_dir / "created.jsonl").exists()


def test_post_gap_issues_is_idempotent_when_marker_already_exists(tmp_path, monkeypatch):
    """Brief assertion 2: an existing issue already carries the marker, so the
    re-run creates nothing for that gap (a no-op), and reports the existing
    issue number instead."""
    stub_dir = _install_gh_stub(tmp_path, monkeypatch)
    monkeypatch.setenv("ARBITER_OPERATOR", "1")
    contract = _contract()

    comments = [
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "gap-a")]),
        _comment(2, 2, [_finding("P2", "OPEN", "app/a.py", "cat-a", "gap-a")]),
    ]
    history = _history(comments, pr=100, repo=STUB_REPO)
    decision = arb.decide(history, contract)
    assert [g["id"] for g in decision.proposed_gaps] == ["gap-a"]

    marker = arb._gap_marker(100, "gap-a", "app/a.py", "cat-a")
    (stub_dir / "issue_list.json").write_text(json.dumps([
        {"number": 55, "body": f"{marker}\nalready tracked, unrelated body text"}
    ]))

    results = arb.post_gap_issues(decision, 100, STUB_REPO, contract, history)

    assert results == [{"gap_id": "gap-a", "action": "skipped-existing", "issue_number": 55}]
    assert not (stub_dir / "created.jsonl").exists()


def test_post_gap_issues_keys_on_finding_id_not_head_sha(tmp_path, monkeypatch):
    """Brief assertion 3: the marker carries no head SHA, so the SAME finding
    re-proposed at a later, different current_head_sha still resolves to the
    SAME existing issue rather than opening a twin."""
    stub_dir = _install_gh_stub(tmp_path, monkeypatch)
    monkeypatch.setenv("ARBITER_OPERATOR", "1")
    contract = _contract()

    history_round1 = _history([
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "gap-a")], head_sha="a" * 40),
        _comment(2, 2, [_finding("P2", "OPEN", "app/a.py", "cat-a", "gap-a")], head_sha="b" * 40),
    ], pr=100, repo=STUB_REPO)
    decision_round1 = arb.decide(history_round1, contract)

    (stub_dir / "issue_list.json").write_text("[]")
    first_results = arb.post_gap_issues(decision_round1, 100, STUB_REPO, contract, history_round1)
    assert first_results == [{"gap_id": "gap-a", "action": "created", "issue_number": 1000}]

    created = _read_jsonl(stub_dir / "created.jsonl")
    assert len(created) == 1
    marker = arb._gap_marker(100, "gap-a", "app/a.py", "cat-a")
    body = _created_body(created[0])
    assert marker in body
    assert re.search(r"[0-9a-fA-F]{40}", marker) is None  # no head SHA baked into the marker

    # A later round, a THIRD (still different) head SHA — the finding is still
    # open. The search step now finds the issue created above.
    history_round2 = _history(
        history_round1["comments"] + [
            _comment(3, 3, [_finding("P2", "OPEN", "app/a.py", "cat-a", "gap-a")], head_sha="c" * 40),
        ],
        pr=100, repo=STUB_REPO,
    )
    decision_round2 = arb.decide(history_round2, contract)
    assert decision_round2.round_count == 3
    assert history_round2["current_head_sha"] != history_round1["current_head_sha"]

    (stub_dir / "issue_list.json").write_text(json.dumps([{"number": 1000, "body": body}]))
    second_results = arb.post_gap_issues(decision_round2, 100, STUB_REPO, contract, history_round2)

    assert second_results == [{"gap_id": "gap-a", "action": "skipped-existing", "issue_number": 1000}]
    assert len(_read_jsonl(stub_dir / "created.jsonl")) == 1  # still just the one from round 1


def test_post_gap_issues_sanitizes_the_assembled_body(tmp_path, monkeypatch):
    """Brief assertion 4 (part 1): belt-and-suspenders sanitization. The gap's
    own fields are safe, so the IBAN is planted in contract_text — the one
    piece of the body this task does not fully control the contents of."""
    stub_dir = _install_gh_stub(tmp_path, monkeypatch)
    monkeypatch.setenv("ARBITER_OPERATOR", "1")
    contract = _contract()

    comments = [
        _comment(1, 1, [_finding("P3", "NEW", "app/a.py", "cat-a", "gap-a")]),
        _comment(2, 2, [_finding("P3", "OPEN", "app/a.py", "cat-a", "gap-a")]),
    ]
    history = _history(comments, pr=100, repo=STUB_REPO)
    decision = arb.decide(history, contract)

    (stub_dir / "issue_list.json").write_text("[]")
    planted_iban = "DE89370400440532013000"
    contract_text = f"Accepted limits:\n- legacy demo data hardcodes {planted_iban} (test fixture).\n"

    arb.post_gap_issues(decision, 100, STUB_REPO, contract, history, contract_text=contract_text)

    created = _read_jsonl(stub_dir / "created.jsonl")
    body = _created_body(created[0])
    assert planted_iban not in body
    assert "[IBAN]" in body


def test_post_gap_issues_sanitizes_the_title(tmp_path, monkeypatch):
    """Minor 3: the issue TITLE goes through the same sanitize() call as the
    body, not just the body. The identity fields are now schema-bounded at
    validate_trailer (kebab-case id/cat, single-line bounded file), so a
    hostile value is rejected upstream — but `file` still legally carries
    arbitrary non-newline text, so this plants an IBAN there and asserts it
    never reaches the `gh issue create --title` argv, mirroring
    test_post_gap_issues_sanitizes_the_assembled_body's treatment of the body."""
    stub_dir = _install_gh_stub(tmp_path, monkeypatch)
    monkeypatch.setenv("ARBITER_OPERATOR", "1")
    contract = _contract()

    planted_iban = "DE89370400440532013000"
    comments = [
        _comment(1, 1, [_finding("P3", "NEW", planted_iban, "cat-a", "gap-a")]),
        _comment(2, 2, [_finding("P3", "OPEN", planted_iban, "cat-a", "gap-a")]),
    ]
    history = _history(comments, pr=100, repo=STUB_REPO)
    decision = arb.decide(history, contract)
    assert decision.proposed_gaps  # sanity: there is something to post

    (stub_dir / "issue_list.json").write_text("[]")
    arb.post_gap_issues(decision, 100, STUB_REPO, contract, history)

    created = _read_jsonl(stub_dir / "created.jsonl")
    title = _created_title(created[0])
    assert planted_iban not in title
    assert "[IBAN]" in title


def test_post_gap_issues_bounds_body_size_with_a_truncation_marker(tmp_path, monkeypatch):
    """Brief assertion 4 (part 2): an oversized body (a huge contract_text) is
    truncated to the size bound with a visible marker, not silently rejected
    or posted over-length."""
    stub_dir = _install_gh_stub(tmp_path, monkeypatch)
    monkeypatch.setenv("ARBITER_OPERATOR", "1")
    contract = _contract()

    comments = [
        _comment(1, 1, [_finding("P3", "NEW", "app/a.py", "cat-a", "gap-a")]),
        _comment(2, 2, [_finding("P3", "OPEN", "app/a.py", "cat-a", "gap-a")]),
    ]
    history = _history(comments, pr=100, repo=STUB_REPO)
    decision = arb.decide(history, contract)

    (stub_dir / "issue_list.json").write_text("[]")
    huge_contract_text = "x" * 200_000

    arb.post_gap_issues(decision, 100, STUB_REPO, contract, history, contract_text=huge_contract_text)

    created = _read_jsonl(stub_dir / "created.jsonl")
    body = _created_body(created[0])
    assert len(body.encode("utf-8")) <= arb._GAP_ISSUE_MAX_BYTES
    assert "Truncated" in body
    marker = arb._gap_marker(100, "gap-a", "app/a.py", "cat-a")
    assert marker in body  # the marker survives truncation


def test_post_gap_issues_renders_both_open_and_pending_human_statuses(tmp_path, monkeypatch):
    """Brief assertion 5: a decision carrying both an 'open' gap and a
    'pending-human' gap (the T3 finding-1 regression shape) renders both
    without error, each showing its own status."""
    stub_dir = _install_gh_stub(tmp_path, monkeypatch)
    monkeypatch.setenv("ARBITER_OPERATOR", "1")
    contract = _contract()

    comments = [
        _comment(1, 1, [
            _finding("P1", "NEW", "app/models.py", "authz", "p1-pending"),
            _finding("P1", "NEW", "app/other.py", "authz-b", "p1-open"),
        ]),
        _comment(2, 2, [
            _finding("P1", "RESOLVED", "app/models.py", "authz", "p1-pending",
                     evidence=_evidence(["app/models.py"])),
            _finding("P1", "OPEN", "app/other.py", "authz-b", "p1-open"),
        ]),
    ]
    history = _history(comments, pr=100, repo=STUB_REPO, diff_files=["app/models.py"])
    decision = arb.decide(history, contract)
    gaps_by_id = {g["id"]: g for g in decision.proposed_gaps}
    assert gaps_by_id["p1-pending"]["status"] == "pending-human"
    assert gaps_by_id["p1-open"]["status"] == "open"

    (stub_dir / "issue_list.json").write_text("[]")
    results = arb.post_gap_issues(decision, 100, STUB_REPO, contract, history)

    assert {r["action"] for r in results} == {"created"}
    created = _read_jsonl(stub_dir / "created.jsonl")
    bodies_by_id = {}
    for rec in created:
        body = _created_body(rec)
        if "p1-pending" in body:
            bodies_by_id["p1-pending"] = body
        elif "p1-open" in body:
            bodies_by_id["p1-open"] = body

    assert "- Status: `pending-human`" in bodies_by_id["p1-pending"]
    assert "- Status: `open`" in bodies_by_id["p1-open"]


def test_two_distinct_gaps_sharing_an_id_get_separate_issues_and_markers(tmp_path, monkeypatch):
    """CRITICAL regression (drop-safety). The reviewer's `id` slug is NOT
    required to be globally unique — the arbiter's canonical finding identity
    is the TRIPLE (id, file, cat) (plan §6.1), and decide() legitimately
    allows two genuinely-distinct findings to share an `id` at different
    (file, cat): it only refuses a (file, cat) KEY collision
    (AMBIGUOUS-IDENTITY), never id reuse across different keys. Before the
    fix, `_gap_marker` built the idempotency marker from `id` ALONE, so two
    such findings produced byte-identical markers: the second issue-create's
    own marker was already "found" among the just-created first issue's body,
    so it silently collapsed onto the first finding's issue and was never
    created for its own — a PERMANENT silent drop, not a duplicate.

    Driven through the real decide() -> post_gap_issues path (never a
    hand-built gap list), under the DEFAULT contract: a 5-round history where
    a filler finding is repeated to reach the round-5 soft gate, and two
    brand-new findings sharing id="dup-id" at different (file, cat) appear
    together for the first time in the final round.
    """
    stub_dir = _install_gh_stub(tmp_path, monkeypatch)
    monkeypatch.setenv("ARBITER_OPERATOR", "1")
    contract = _contract()  # DEFAULT contract: soft_gate=5, hard_cap=10

    def filler(state):
        return _finding("P2", state, "app/filler.py", "filler-cat", "filler")

    comments = [_comment(1, 1, [filler("NEW")])]
    for n in (2, 3, 4):
        comments.append(_comment(n, n, [filler("OPEN")]))
    comments.append(_comment(5, 5, [
        filler("OPEN"),
        _finding("P2", "NEW", "app/a.py", "cat-a", "dup-id"),
        _finding("P3", "NEW", "app/b.py", "cat-b", "dup-id"),
    ]))
    history = _history(comments, pr=100, repo=STUB_REPO)

    decision = arb.decide(history, contract)
    assert decision.round_count == 5
    assert decision.recommendation == "MERGE-WITH-GAPS"
    assert decision.cited_rule == "SOFT-GATE"
    dup_gaps = [g for g in decision.proposed_gaps if g["id"] == "dup-id"]
    assert len(dup_gaps) == 2, "the fixture must produce two distinct gaps sharing an id"
    assert {(g["file"], g["cat"]) for g in dup_gaps} == {
        ("app/a.py", "cat-a"), ("app/b.py", "cat-b"),
    }

    (stub_dir / "issue_list.json").write_text("[]")
    results = arb.post_gap_issues(decision, 100, STUB_REPO, contract, history)

    # Three distinct findings (filler, dup-id@app/a.py, dup-id@app/b.py) must
    # yield three distinct issues. Before the fix this was 2: the second
    # dup-id finding silently collapsed onto the first's issue.
    assert {r["action"] for r in results} == {"created"}
    assert len(results) == 3
    assert len({r["issue_number"] for r in results}) == 3, (
        "two distinct findings sharing an id must not resolve to the same issue"
    )
    created = _read_jsonl(stub_dir / "created.jsonl")
    assert len(created) == 3

    bodies = [_created_body(rec) for rec in created]
    body_a = next(b for b in bodies if "app/a.py" in b and "cat-a" in b)
    body_b = next(b for b in bodies if "app/b.py" in b and "cat-b" in b)
    assert body_a != body_b

    marker_a = body_a.splitlines()[0]
    marker_b = body_b.splitlines()[0]
    assert marker_a != marker_b, "two distinct findings must never share a marker"
    # Same reviewer-proposed id, different canonical (id, file, cat) identity:
    # both markers carry the shared id prefix but resolve to different full
    # markers (a stable hash of (file, cat) appended).
    assert marker_a.startswith("<!-- codex-gap:100:dup-id:")
    assert marker_b.startswith("<!-- codex-gap:100:dup-id:")

    # Each finding's OWN (file, cat) is recorded in ITS OWN issue body, not the
    # other's — proving the fix does not just rename which issue "wins".
    assert "- File: `app/a.py`" in body_a
    assert "- Category: `cat-a`" in body_a
    assert "- File: `app/b.py`" in body_b
    assert "- Category: `cat-b`" in body_b


def test_post_gap_issues_refuses_without_operator_mode(monkeypatch):
    """Brief assertion 6: read-only by default. Without ARBITER_OPERATOR=1,
    post_gap_issues refuses outright — no `gh` invocation of any kind, proven
    here by never installing a stub at all (a real subprocess call would fail
    loudly rather than silently succeed)."""
    monkeypatch.delenv("ARBITER_OPERATOR", raising=False)
    contract = _contract()
    history = _history([
        _comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "gap-a")]),
        _comment(2, 2, [_finding("P2", "OPEN", "app/a.py", "cat-a", "gap-a")]),
    ], pr=100, repo=STUB_REPO)
    decision = arb.decide(history, contract)
    assert decision.proposed_gaps  # sanity: there IS something that would post

    with pytest.raises(PermissionError):
        arb.post_gap_issues(decision, 100, STUB_REPO, contract, history)


def test_cli_post_gap_issues_gate_matches_post_comment_gate(monkeypatch):
    """The CLI-level companion to the assertion above: `--post` without
    operator mode is refused by main() before collect() ever runs, so the
    gap-issue poster is unreachable through the CLI either — same gate,
    checked once, in one place."""
    monkeypatch.delenv("ARBITER_OPERATOR", raising=False)
    rc = arb.main(["--history", str(FIXTURES / "pr24_history.json"), "--post"])
    assert rc != 0


def test_load_contract_text_returns_none_for_a_branch_with_no_contract_on_main():
    """A branch name that can never have merged a contract to `main` must
    resolve to None (rendered as 'no contract on main'), never raise — this is
    the documented rollout-compatibility rule (docs/contracts/README.md),
    exercised against the real repo's real git history rather than a fake."""
    assert arb.load_contract_text("totally-nonexistent-branch-zzz-4821") is None


# --------------------------------------------------------------------------- #
# Review-fix: docs/contracts/ is a flat namespace keyed on the branch name    #
# alone. A branch literally named `README` resolves load_contract_text's     #
# `path` to docs/contracts/README.md — the FORMAT DOCUMENTATION file itself   #
# (header `# Contracts`, plural, no colon), not a signed-off per-branch       #
# contract. A resolved file must only be trusted as a contract when its      #
# first non-blank line is the literal template header `# Contract:`          #
# (singular, with a colon, per docs/contracts/README.md's own "Format"       #
# section) — anything else, including the README, degrades to None exactly   #
# like a missing file, never raised as an error.                             #
# --------------------------------------------------------------------------- #

def test_is_contract_document_requires_hash_contract_colon_header():
    """Direct unit coverage of the pure predicate load_contract_text delegates
    to. Exercised directly (no git, no subprocess) because it is the entire
    decision the fix adds; load_contract_text itself is a thin git-plumbing
    wrapper around it, covered separately below and by the pre-existing
    no-contract-on-main test above."""
    assert arb._is_contract_document("# Contract: feat/x\n\n## Goal\n", "feat/x") is True
    # First NON-BLANK line is what counts, not strictly the first line.
    assert arb._is_contract_document("\n   \n# Contract: feat/x\n", "feat/x") is True
    assert arb._is_contract_document("", "feat/x") is False
    assert arb._is_contract_document("   \n\n  \n", "feat/x") is False
    assert arb._is_contract_document("Some other doc\n# Contract: nope\n", "feat/x") is False
    # Exact branch match: a correctly shaped header naming a DIFFERENT
    # branch must not bind (review P2, head 9da9fc2).
    assert arb._is_contract_document("# Contract: other/branch\n", "feat/x") is False
    # A near-miss that must NOT pass: plural, no colon.
    assert arb._is_contract_document("# Contracts\n\nformat doc body\n", "feat/x") is False
    # The real repo's real format doc, read straight off disk (not via a git
    # ref) — ties this test to the actual exploit scenario: if this doc's
    # header ever drifted to satisfy the guard by accident, this assertion
    # would catch it.
    readme_text = (REPO_ROOT / "docs" / "contracts" / "README.md").read_text()
    assert readme_text.splitlines()[0] == "# Contracts"
    assert arb._is_contract_document(readme_text, "any-branch") is False


def _init_scratch_git_repo(tmp_path):
    """A throwaway repo with its own `main` branch, isolated from this
    repository's real history and from the host's global git config
    (user.email/user.name supplied inline, commit.gpgsign disabled inline so
    a host with global commit signing enabled cannot hang this test), so
    load_contract_text's git-show plumbing can be exercised against
    controlled content without anything needing to be merged to this repo's
    own main."""
    repo = tmp_path / "scratch-repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=repo, check=True)
    return repo


def _commit_file(repo, relative_path, content):
    path = repo / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(
        ["git",
         "-c", "user.email=test@example.com", "-c", "user.name=Test",
         "-c", "commit.gpgsign=false",
         "commit", "-q", "-m", "test commit"],
        cwd=repo, check=True,
    )


def test_load_contract_text_ignores_a_present_file_without_the_contract_header(tmp_path, monkeypatch):
    """The IMPORTANT fix under review, exercised end-to-end through the real
    git-plumbing wrapper: a branch name that resolves to a present, non-empty
    file that is NOT header-stamped `# Contract:` (mirrors
    docs/contracts/README.md's own real header, `# Contracts`) must degrade to
    None, never return that stray doc's content."""
    repo = _init_scratch_git_repo(tmp_path)
    _commit_file(repo, arb._contract_relative_path("readme-lookalike"),
                 "# Contracts\n\nThis is the FORMAT doc, not a contract.\n")
    monkeypatch.setattr(arb, "_REPO_ROOT", repo)
    assert arb.load_contract_text("readme-lookalike") is None


def test_load_contract_text_returns_a_properly_headed_contract(tmp_path, monkeypatch):
    """Boundary sibling of the test above: a file at the same shape of path
    that DOES start with the real template header must still be returned in
    full — the fix must reject the format doc without also rejecting real
    contracts."""
    repo = _init_scratch_git_repo(tmp_path)
    body = "# Contract: readme-lookalike\n\n## Goal\n\nExample.\n"
    _commit_file(repo, arb._contract_relative_path("readme-lookalike"), body)
    monkeypatch.setattr(arb, "_REPO_ROOT", repo)
    assert arb.load_contract_text("readme-lookalike") == body


def test_load_contract_text_rejects_a_header_naming_a_different_branch(tmp_path, monkeypatch):
    """Review P2 (head 9da9fc2): the header must name exactly the branch the
    path was derived for. A correctly located file declaring another branch
    is a mis-filed contract and binds nothing."""
    repo = _init_scratch_git_repo(tmp_path)
    body = "# Contract: some/other-branch\n\nOut of scope: everything.\n"
    _commit_file(repo, arb._contract_relative_path("readme-lookalike"), body)
    monkeypatch.setattr(arb, "_REPO_ROOT", repo)
    assert arb.load_contract_text("readme-lookalike") is None


def test_validate_trailer_rejects_hostile_identity_fields():
    """Review P2 (head 2afd089): id/cat are interpolated into markers, issue
    titles, and posted comments before sanitization sees them, so they must
    be the documented kebab-case slugs — bounded, no newlines, no markup.
    `file` may carry arbitrary non-newline text (paths do) but is bounded and
    single-line so a marker cannot be split from its search."""
    base = {"sev": "P2", "state": "OPEN", "file": "app/a.py", "cat": "cat-a", "id": "gap-a"}

    def trailer_with(**overrides):
        finding = {**base, **overrides}
        return {"schema": 2, "findings": [finding]}

    assert arb.validate_trailer(trailer_with())[0] is not None  # control passes

    hostile = [
        ("bad-id", {"id": "gap a"}),
        ("bad-id", {"id": "gap_a; rm -rf"}),
        ("bad-id", {"id": "gap\na"}),
        ("bad-id", {"id": "<script>alert(1)</script>"}),
        ("bad-id", {"id": "g" * 65}),
        ("bad-cat", {"cat": "Cat-A"}),
        ("bad-cat", {"cat": "cat\na"}),
        ("bad-cat", {"cat": "c" * 65}),
        ("bad-file", {"file": "app/a.py\napp/b.py"}),
        ("bad-file", {"file": "f" * 257}),
        ("bad-file", {"file": "app/a.py<!-- inject -->"}),
        ("bad-file", {"file": "`app/a.py`"}),
        ("bad-file", {"file": "app/a.py--><script>"}),
    ]
    for expected_reason, override in hostile:
        validated, reason = arb.validate_trailer(trailer_with(**override))
        assert validated is None, f"expected rejection for {override}"
        assert reason == expected_reason, f"{override}: got {reason}"


def test_rendered_arbiter_comment_sanitizes_untrusted_fields():
    """Review P2 (head 9da9fc2): gap issues are sanitized before posting but
    the recommendation comment was not — a trailer's `file` field could
    carry diff bytes or sensitive text straight into a public comment.
    The posting pipeline must run the same sanitize -> bound pass."""
    comments = [
        _comment(1, 1, [_finding("P3", "NEW", "DE89370400440532013000", "cat-a", "gap-a")]),
        _comment(2, 2, [_finding("P3", "OPEN", "DE89370400440532013000", "cat-a", "gap-a")]),
    ]
    history = _history(comments, pr=100, repo=STUB_REPO)
    decision = arb.decide(history, _contract())
    raw = arb.render_comment(decision, 100)

    posted = arb._truncate_gap_body(
        arb._sanitize_gap_body(raw), arb._ARBITER_COMMENT_MAX_BYTES
    )
    assert "DE89370400440532013000" not in posted
    assert "[IBAN]" in posted
    # The machine marker survives sanitization: downstream dedup and
    # permalink resolution depend on it.
    assert "<!-- codex-arbiter:100 -->" in posted


def test_contract_relative_path_is_injective_across_slug_collisions():
    """Review P2 (head 2afd089): the old slug-only mapping collapsed
    `feature/a-b` and `feature-a/b` onto one path, so one branch's contract
    could silently bind another. The slug-and-hash mapping must separate
    them, must never resolve onto the format doc, and must be stable."""
    a = arb._contract_relative_path("feature/a-b")
    b = arb._contract_relative_path("feature-a/b")
    assert a != b
    assert a.startswith("docs/contracts/feature-a-b-")
    assert b.startswith("docs/contracts/feature-a-b-")

    # No branch name resolves onto the format documentation itself.
    assert arb._contract_relative_path("README") != "docs/contracts/README.md"

    # Deterministic across calls: the same branch always binds the same path.
    assert arb._contract_relative_path("feat/loop-arbiter") == (
        arb._contract_relative_path("feat/loop-arbiter")
    )


def test_build_history_carries_the_pr_branch_name():
    """Review P2 (head b73afd5): gap issues cite the PR branch's contract,
    so the collector must retain headRefName explicitly. Deriving the branch
    from the local checkout resolves to None on a detached CI checkout or to
    the wrong branch when the arbiter runs from main."""
    raw = [{
        "id": 1, "created_at": "2026-08-17T00:00:00Z", "login": BOT,
        "body": "<!-- codex-pr-review:100:" + "d" * 40 + " -->\n"
                '<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[]} -->',
    }]
    history = arb.build_history(100, STUB_REPO, "d" * 40, ["app/a.py"], raw,
                                _contract(), head_ref="feat/some-branch")
    assert history["current_head_ref"] == "feat/some-branch"

    default_history = arb.build_history(100, STUB_REPO, "d" * 40, ["app/a.py"], raw,
                                        _contract())
    assert default_history["current_head_ref"] is None
