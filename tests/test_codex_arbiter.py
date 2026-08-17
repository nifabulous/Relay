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


def test_soft_gate_is_clamped_to_the_hard_cap():
    """A soft gate configured *softer* than the hard cap is clamped to the cap:
    the effective gate is min(soft_gate, hard_cap). With soft_gate=12 and the
    fixed hard_cap=10, a minors-only history (with a NEW minor at the latest
    round, so EXHAUSTED-NOVELTY does not fire) reaches round 10 and merges via
    the SOFT GATE — proving the effective gate is 10, not the raw 12. Without the
    clamp, round 10 would fall through the (unreached) soft gate to a HARD-CAP
    escalation, so this assertion fails on the pre-clamp code."""
    comments = [_comment(1, 1, [_finding("P2", "NEW", "app/a.py", "cat-a", "a")])]
    for n in range(2, 10):
        comments.append(_comment(n, n, [_finding("P2", "OPEN", "app/a.py", "cat-a", "a")]))
    comments.append(_comment(10, 10, [
        _finding("P2", "OPEN", "app/a.py", "cat-a", "a"),
        _finding("P3", "NEW", "app/b.py", "cat-b", "b"),  # new minor: novelty does not fire
    ]))
    decision = arb.decide(_history(comments), _contract(soft_gate=12))  # hard_cap stays 10
    assert decision.round_count == 10
    assert decision.recommendation == "MERGE-WITH-GAPS"
    assert decision.cited_rule == "SOFT-GATE"


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
        {  # canonical: bot + review marker in body
            "id": 11,
            "created_at": "2026-08-17T09:02:00Z",
            "login": BOT,
            "body": "review\n<!-- codex-pr-review:24:" + "a" * 40 + " -->\n"
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


def test_post_gap_issues_is_a_t4_stub():
    with pytest.raises(NotImplementedError):
        arb.post_gap_issues(None, 1, "x/y", _contract())


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
