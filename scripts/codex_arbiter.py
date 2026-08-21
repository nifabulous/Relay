#!/usr/bin/env python3
"""Deterministic PR-review-loop arbiter. It NEVER calls a model.

The arbiter reads a PR's review history and recommends whether the automated
review loop should stop. Its whole value is being unarguable-with: the same
history always yields the same recommendation, computed by the rules in the T3
spec (§6), not by a model's judgement. Three parts with hard seams:

  COLLECTOR  ``collect`` / ``build_history`` — the ``gh`` CLI turns a PR's
             comments into a validated schema-1 history JSON. The only part
             that touches the network.
  CORE       ``decide`` — a pure function (history, contract) -> Decision. No
             I/O, no network, importable directly. Every fixture tests this.
  POSTER     ``render_comment`` / ``post_comment`` — turns a Decision into a PR
             comment, gated behind ``--post`` + operator mode. Local default is
             read-only. ``post_gap_issues`` (Task T4) opens one idempotent
             ``proposed-gap`` GitHub issue per residual finding under the same
             gate — the durable ledger a deleted branch cannot take with it.

Schemas (docs/loop/schemas.md): schema 1 is the canonical history the collector
emits and the core consumes; schema 2 is the machine-readable trailer parsed
out of each review comment. The core accepts only the schema-1 shape.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

_REPO_ROOT = Path(__file__).resolve().parents[1]

# codex_sanitize / codex_truncate are this script's siblings in scripts/, not a
# package import — the same convention codex_sanitize.py itself uses to reach
# app/tutor/redaction.py. The explicit path insert makes the import resolve
# regardless of how the caller put codex_arbiter on sys.path (run directly, or
# imported by the test suite after inserting scripts/ itself).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from codex_sanitize import sanitize as _sanitize_gap_body  # noqa: E402
from codex_truncate import truncate_utf8 as _truncate_gap_body  # noqa: E402

# --- recommendation headlines (the single value surfaced to a caller) ------- #
MERGE_CLEAN = "MERGE-CLEAN"
MERGE_WITH_GAPS = "MERGE-WITH-GAPS"
ESCALATE = "ESCALATE-TO-SCOPING"
CONTINUE = "CONTINUE"
NEEDS_HUMAN = "NEEDS-HUMAN"

# --- cited rules (why a recommendation was reached) ------------------------- #
RULE_CLEAN = "CLEAN"
RULE_STUCK_P1 = "STUCK-P1"
RULE_EXHAUSTED = "EXHAUSTED-NOVELTY"
RULE_SOFT_GATE = "SOFT-GATE"
RULE_HARD_CAP = "HARD-CAP"
RULE_CONTINUE = "CONTINUE"
RULE_P1_PENDING = "P1-RESOLUTION-PENDING"
# fail-closed cited rules (§6.1) — always paired with loop_action CONTINUE
RULE_MALFORMED = "MALFORMED-TRAILER"
RULE_ACCOUNTING_GAP = "ACCOUNTING-GAP"
RULE_AMBIGUOUS_IDENTITY = "AMBIGUOUS-IDENTITY"
RULE_AMBIGUOUS_HISTORY = "AMBIGUOUS-HISTORY"
RULE_ORPHAN_STATE = "ORPHAN-STATE"

# The internal, normalized severity scale. Everything past the parser boundary
# (tracked findings, rule gates, proposed gaps) speaks only these three.
_SEVERITIES = ("P1", "P2", "P3")
# What the trailer parser ACCEPTS on ingest: the internal scale PLUS "P0". The
# reviewer prompt (scripts/codex_review_pr.sh) instructs "Report P0" for
# prompt-injection attempts, so the parser must accept "P0" rather than reject
# the whole trailer as malformed — a rejection would silently lose the round's
# OTHER findings. "P0" is normalized to the highest blocking tier (P1) on ingest
# (see _normalize_sev), so every existing "open P1" gate covers an
# injection-flagged finding fail-closed, and no code path outside the parser
# ever sees a raw "P0".
_TRAILER_SEVERITIES = ("P0", *_SEVERITIES)
# Monotonic severity rank (higher == more severe). A tracked identity's severity
# is the MAX ever recorded for it across rounds (see _max_severity / _apply_round):
# the reviewer re-emits sev every round and keeps only `id` stable, so an
# escalation P2 -> P1 must stick while a later downgrade is ignored
# (freeze-on-downgrade preserved by taking the max, never the latest).
_SEV_RANK = {"P1": 3, "P2": 2, "P3": 1}
_STATES = ("NEW", "OPEN", "RESOLVED")

# Identity fields are interpolated into markers, issue titles, and posted
# comments before sanitization runs, so they are bounded to the documented
# shape (docs/loop/schemas.md: stable kebab-case ids and categories) rather
# than trusted. A newline or markup in an identity field could make the
# marker posted differ from the marker searched for — silently defeating
# dedup — and an unbounded field could break GitHub API limits downstream.
_IDENTITY_KEBAB_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_IDENTITY_MAX_LEN = 64
_FILE_MAX_LEN = 256
# `file` may carry spaces and unusual path shapes, but not markup structure:
# angle brackets build HTML comments, backticks build code spans, braces
# build template/liquid structures, and "--" opens/closes HTML comment
# syntax when paired. Anything structural is rejected upstream rather than
# escaped downstream.
_FILE_FORBIDDEN = ("<", ">", "`", "{", "}", "--")
_TRAILER_OPEN = "<!-- codex-verdict:"
_TRAILER_CLOSE = "-->"


# --------------------------------------------------------------------------- #
# Contract + Decision.                                                          #
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Contract:
    """Tunable knobs. Read from the environment at the CLI boundary and passed
    explicitly into the pure core, so the core never reads the environment."""

    bot_login: str = "github-actions[bot]"
    soft_gate: int = 5
    hard_cap: int = 10
    stuck_p1_rounds: int = 3

    @classmethod
    def from_env(cls, env=None) -> "Contract":
        env = env if env is not None else os.environ
        return cls(
            bot_login=env.get("CODEX_BOT_LOGIN", "github-actions[bot]"),
            soft_gate=int(env.get("ARBITER_SOFT_GATE", "5")),
        )


@dataclass(frozen=True)
class Decision:
    recommendation: str  # headline: one of the five values above
    loop_action: str  # what the automated loop should do (never NEEDS-HUMAN)
    cited_rule: str
    needs_human: bool
    round_count: int
    proposed_gaps: List[dict] = field(default_factory=list)
    detail: str = ""


def _result(loop_action, cited_rule, needs_human, round_count, proposed_gaps=None, detail=""):
    # A fail-closed disposition keeps the loop on CONTINUE but flags a human;
    # that combination is surfaced as the NEEDS-HUMAN headline.
    if loop_action == CONTINUE and needs_human:
        recommendation = NEEDS_HUMAN
    else:
        recommendation = loop_action
    return Decision(
        recommendation=recommendation,
        loop_action=loop_action,
        cited_rule=cited_rule,
        needs_human=needs_human,
        round_count=round_count,
        proposed_gaps=proposed_gaps or [],
        detail=detail,
    )


@dataclass
class _Tracked:
    """The arbiter's own record of a finding, keyed by (first-round id, file,
    cat). The reviewer can neither fork a finding by renaming it nor bury one by
    merging it into another, because identity is derived here, not read."""

    id: str
    key: Tuple[str, str]
    file: str
    cat: str
    sev: str
    first_round: int
    open_round_indices: List[int] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# Small pure helpers.                                                           #
# --------------------------------------------------------------------------- #
def _parse_ts(value) -> datetime:
    """Parse an RFC-3339 timestamp. Accepts a trailing 'Z' on the 3.10 floor,
    where ``datetime.fromisoformat`` does not yet understand it."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"created_at must be an RFC-3339 string, got {value!r}")
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"created_at is not RFC-3339: {value!r}") from exc


def _norm_key(file: str, cat: str) -> Tuple[str, str]:
    # Paths stay case-sensitive; categories are conceptual, so fold their case.
    return (file.strip(), cat.strip().lower())


def _normalize_sev(sev: str) -> str:
    """Fold an incoming trailer severity onto the arbiter's internal scale.
    "P0" — the reviewer's prompt-injection tier — collapses to "P1", the highest
    blocking tier, so an injection-flagged finding gates a merge exactly like a
    P1 and is never dropped as an unknown severity. Any other value is returned
    unchanged (validate_trailer has already bounded it to _TRAILER_SEVERITIES).
    Applied at every point a severity enters the arbiter's own state, so a raw
    "P0" never reaches a _Tracked record or a rule gate."""
    return "P1" if sev == "P0" else sev


def _max_severity(current: str, incoming: str) -> str:
    """The more severe of two severities, P1 > P2 > P3 (see _SEV_RANK). Both
    operands are normalized first, so the result is always one of P1/P2/P3 and a
    raw "P0" can never leak through. Used to fold a finding's severity to the MAX
    ever seen for its identity: an escalation sticks, a later de-escalation is
    ignored."""
    current, incoming = _normalize_sev(current), _normalize_sev(incoming)
    return current if _SEV_RANK.get(current, 0) >= _SEV_RANK.get(incoming, 0) else incoming


def _first_duplicate(items) -> Optional[str]:
    seen = set()
    for item in items:
        if item in seen:
            return item
        seen.add(item)
    return None


# --------------------------------------------------------------------------- #
# Trailer parsing (collector-side, but pure — no network).                     #
# --------------------------------------------------------------------------- #
def extract_trailer(body: str) -> Tuple[Optional[dict], Optional[str]]:
    """Scan a comment body for the (possibly MULTI-LINE) codex-verdict trailer.

    The trailer can span many physical lines — the schema example is nine — so
    this scans from ``<!-- codex-verdict:`` through the matching ``-->`` and
    JSON-parses the enclosed object rather than assuming a single line.

    The trailer must CLOSE the comment: nothing but whitespace may follow
    its ``-->``. Review bodies legitimately quote diff content, and a PR can
    plant a trailer-looking snippet in that content for the bot to quote;
    accepting a trailer from anywhere in the body would parse attacker JSON
    as the round's lifecycle record. Anchoring to the end (with the
    multiple-trailer rejection below) means quoted snippets fail the round
    closed instead of being consumed.

    Returns ``(trailer, None)`` for exactly one well-formed trailer closing
    the comment, else ``(None, reason)``. Zero trailers, more-than-one, and
    non-final trailers are all reasons the collector records the round as
    invalid (§6.0).
    """
    if not isinstance(body, str):
        return None, "no-body"
    count = body.count(_TRAILER_OPEN)
    if count == 0:
        return None, "no-trailer"
    if count > 1:
        return None, "multiple-trailers"
    start = body.index(_TRAILER_OPEN) + len(_TRAILER_OPEN)
    close = body.find(_TRAILER_CLOSE, start)
    if close == -1:
        return None, "unterminated-trailer"
    if body[close + len(_TRAILER_CLOSE):].strip():
        return None, "trailer-not-final"
    payload = body[start:close].strip()
    try:
        trailer = json.loads(payload)
    except json.JSONDecodeError:
        return None, "unparseable-json"
    if not isinstance(trailer, dict):
        return None, "trailer-not-object"
    return trailer, None


def validate_trailer(trailer) -> Tuple[Optional[dict], Optional[str]]:
    """Structural schema-2 validation. Returns ``(trailer, None)`` when it is a
    schema-2 object whose findings each carry the required fields (and RESOLVED
    findings an evidence object of the right shape), else ``(None, reason)``.

    Content checks (evidence files actually in the diff, verification non-empty)
    are the bounded *risk* check applied while folding, not structural parsing.
    """
    if not isinstance(trailer, dict):
        return None, "trailer-not-object"
    if trailer.get("schema") != 2:
        return None, "unknown-schema"
    findings = trailer.get("findings")
    if not isinstance(findings, list):
        return None, "findings-not-list"
    for finding in findings:
        if not isinstance(finding, dict):
            return None, "finding-not-object"
        if finding.get("sev") not in _TRAILER_SEVERITIES:
            return None, "bad-sev"
        if finding.get("state") not in _STATES:
            return None, "bad-state"
        for text_field in ("file", "cat", "id"):
            value = finding.get(text_field)
            if not isinstance(value, str) or not value.strip():
                return None, f"bad-{text_field}"
        for identity_field in ("id", "cat"):
            value = finding[identity_field]
            if len(value) > _IDENTITY_MAX_LEN or not _IDENTITY_KEBAB_RE.fullmatch(value):
                return None, f"bad-{identity_field}"
        if len(finding["file"]) > _FILE_MAX_LEN or "\n" in finding["file"]:
            return None, "bad-file"
        if any(marker in finding["file"] for marker in _FILE_FORBIDDEN):
            return None, "bad-file"
        if finding["state"] == "RESOLVED":
            evidence = finding.get("evidence")
            if not isinstance(evidence, dict):
                return None, "resolved-without-evidence"
            files = evidence.get("files")
            if not isinstance(files, list) or not all(isinstance(x, str) for x in files):
                return None, "evidence-files-bad"
            if not isinstance(evidence.get("verification"), str):
                return None, "evidence-verification-bad"
    return trailer, None


def _evidence_ok(evidence, diff_files) -> bool:
    """Bounded, risk-weighted resolution check (§6.1): the evidence must name
    at least one changed file, every named file must be in the current diff, and
    the verification reference must be non-empty. Not a proof of correctness."""
    if not isinstance(evidence, dict):
        return False
    files = evidence.get("files")
    verification = evidence.get("verification")
    if not isinstance(files, list) or not files:
        return False
    if not all(isinstance(x, str) and x.strip() for x in files):
        return False
    if not isinstance(verification, str) or not verification.strip():
        return False
    return all(x in diff_files for x in files)


# --------------------------------------------------------------------------- #
# History document validation.                                                 #
# --------------------------------------------------------------------------- #
def _validate_history_document(history) -> None:
    """Validate the schema-1 *document* shape. A malformed document is a
    collector/input error and raises; a malformed *trailer within* a comment is
    expected review content and is handled as a fail-closed disposition."""
    if not isinstance(history, dict):
        raise ValueError("history must be a JSON object")
    if history.get("schema") != 1:
        raise ValueError(f"unsupported history schema: {history.get('schema')!r} (expected 1)")
    for required in ("repo", "pr", "current_head_sha", "current_diff_files", "comments"):
        if required not in history:
            raise ValueError(f"history missing required field: {required}")
    if not isinstance(history["repo"], str) or not history["repo"].strip():
        raise ValueError("repo must be a non-empty string")
    if not isinstance(history["pr"], int) or isinstance(history["pr"], bool) or history["pr"] <= 0:
        raise ValueError("pr must be a positive integer")
    # The head SHA anchors every round comparison; a malformed one would make
    # repetition and staleness checks compare against garbage. Same shape the
    # review marker carries (7-64 hex).
    if not isinstance(history["current_head_sha"], str) or \
            not re.fullmatch(r"[0-9a-fA-F]{7,64}", history["current_head_sha"]):
        raise ValueError("current_head_sha must be a hex git SHA")
    if not isinstance(history["current_diff_files"], list) or \
            not all(isinstance(f, str) and f for f in history["current_diff_files"]):
        raise ValueError("current_diff_files must be a list of non-empty strings")
    if not isinstance(history["comments"], list):
        raise ValueError("comments must be a list")
    for comment in history["comments"]:
        if not isinstance(comment, dict):
            raise ValueError("each comment must be an object")
        for required in ("comment_id", "created_at", "author_login", "head_sha", "marker"):
            if required not in comment:
                raise ValueError(f"comment missing required field: {required}")
        if not isinstance(comment["comment_id"], int) or isinstance(comment["comment_id"], bool):
            raise ValueError("comment_id must be an integer")
        if not isinstance(comment["head_sha"], str) or \
                not re.fullmatch(r"[0-9a-fA-F]{7,64}", comment["head_sha"]):
            raise ValueError("comment head_sha must be a hex git SHA")
        if not isinstance(comment["marker"], str) or not comment["marker"].strip():
            raise ValueError("comment marker must be a non-empty string")
        _parse_ts(comment["created_at"])


# --------------------------------------------------------------------------- #
# The pure core.                                                                #
# --------------------------------------------------------------------------- #
def _find_open_by_id(open_set, fid) -> Optional[_Tracked]:
    for tracked in open_set.values():
        if tracked.id == fid:
            return tracked
    return None


def _apply_round(idx, findings, open_set, pending_human, resolved, diff_files):
    """Fold one valid round into the open-set. Returns ``None`` on success, or a
    ``(rule, detail)`` fail-closed pair (§6.1: ambiguous identity, orphan state,
    or an accounting omission)."""
    pre_open_keys = set(open_set.keys())
    touched_keys = set()

    for finding in findings:
        key = _norm_key(finding["file"], finding["cat"])
        state = finding["state"]
        fid = finding["id"]

        if state == "NEW":
            if key in open_set:
                # A renamed slug: same (file, cat) reappears as NEW under a
                # fresh id while the original is still open. Identity is derived
                # from (file, cat), so this is ambiguous, not a reset.
                return (
                    RULE_AMBIGUOUS_IDENTITY,
                    f"NEW finding {fid!r} at {key} collides with still-open {open_set[key].id!r}",
                )
            open_set[key] = _Tracked(
                id=fid,
                key=key,
                file=finding["file"],
                cat=finding["cat"],
                sev=_normalize_sev(finding["sev"]),
                first_round=idx,
                open_round_indices=[idx],
            )
            touched_keys.add(key)
            continue

        # OPEN / RESOLVED are matched by the reviewer-proposed id against the
        # arbiter's open-set. An id that matches nothing open is an orphan.
        tracked = _find_open_by_id(open_set, fid)
        if tracked is None:
            return (RULE_ORPHAN_STATE, f"{state} finding id={fid!r} matches no open finding")
        if tracked.key != key:
            # Same id, different (file, cat): the identity was moved underneath us.
            return (
                RULE_AMBIGUOUS_IDENTITY,
                f"{state} finding id={fid!r} changed identity from {tracked.key} to {key}",
            )
        touched_keys.add(tracked.key)

        # Severity is the MAX ever recorded for this identity. The reviewer
        # re-emits sev every round (only `id` is guaranteed stable), so a
        # finding first raised P2 and later escalated to P1 must fold UP to P1 —
        # otherwise it stays P2, drops out of the open-P1 set, and can be waved
        # through a soft-gate merge while the latest trailer says P1 OPEN. The
        # fold runs BEFORE the RESOLVED-P1 -> pending-human routing below, so a
        # P2-now-P1 that is also marked RESOLVED is routed as a P1 resolution
        # (pending-human), never silently closed as a P2. max() also preserves
        # the safe freeze-on-downgrade: a later P2 on a tracked P1 keeps P1.
        tracked.sev = _max_severity(tracked.sev, finding["sev"])

        if state == "OPEN":
            tracked.open_round_indices.append(idx)
        else:  # RESOLVED
            if _evidence_ok(finding.get("evidence"), diff_files):
                del open_set[tracked.key]
                if tracked.sev == "P1":
                    # A P1 resolution is never self-certifying: it waits for a
                    # human on the current head and blocks CLEAN meanwhile.
                    pending_human[tracked.key] = tracked
                else:
                    resolved[tracked.key] = tracked
            else:
                # Unsubstantiated resolution: the finding stays open (it was
                # still accounted for this round, just not closed).
                tracked.open_round_indices.append(idx)

    omitted = pre_open_keys - touched_keys
    if omitted:
        missing = sorted(str(k) for k in omitted)[0]
        return (
            RULE_ACCOUNTING_GAP,
            f"open finding {missing} omitted from round {idx + 1}; a dropped finding is a question",
        )
    return None


def _trailing_run(open_round_indices, latest_index) -> List[int]:
    """The maximal run of consecutive canonical round indices ending at the
    latest round where the finding was open. An invalid round in between (never
    in ``open_round_indices``) breaks the run, which is the conservative choice."""
    present = set(open_round_indices)
    run = []
    i = latest_index
    while i in present:
        run.append(i)
        i -= 1
    return run


def _first_stuck_p1(open_p1, canon, latest_index, contract) -> Optional[_Tracked]:
    for tracked in sorted(open_p1, key=lambda t: t.first_round):
        run = _trailing_run(tracked.open_round_indices, latest_index)
        if len(run) < contract.stuck_p1_rounds:
            continue
        # "at least one fixer push between appearances": >= 2 distinct head SHAs
        # across the run. Duplicate same-head rounds are excluded earlier, so a
        # run of distinct-SHA rounds always satisfies this — checked explicitly.
        if len({canon[i]["head_sha"] for i in run}) >= 2:
            return tracked
    return None


def _is_repeated(tracked: _Tracked, latest_index: int) -> bool:
    # Seen in an earlier round, i.e. not first raised in the latest round.
    return tracked.first_round < latest_index


def _proposed_gaps(open_findings, pending_human) -> List[dict]:
    gaps = []
    for tracked in sorted(open_findings, key=lambda t: (t.sev, t.first_round)):
        gaps.append({
            "id": tracked.id,
            "file": tracked.file,
            "cat": tracked.cat,
            "sev": tracked.sev,
            "status": "open",
            "first_round": tracked.first_round + 1,
        })
    for tracked in sorted(pending_human.values(), key=lambda t: t.first_round):
        gaps.append({
            "id": tracked.id,
            "file": tracked.file,
            "cat": tracked.cat,
            "sev": tracked.sev,
            "status": "pending-human",
            "first_round": tracked.first_round + 1,
        })
    return gaps


def decide(history, contract: Contract) -> Decision:
    """Pure decision function: (schema-1 history, contract) -> Decision.

    Rounds are counted (not read), repetition and identity are derived (not
    read), the latest trailer's accounting is enforced, and malformed or
    ambiguous input fails closed. Rules are then applied first-match-wins (§6.2)
    with STUCK-P1 evaluated before any merge rule.
    """
    _validate_history_document(history)

    pr = history["pr"]
    diff_files = set(history.get("current_diff_files") or [])

    # 1. Canonical rounds only: author is the bot AND the marker matches this
    #    PR and the comment's head SHA. A model cannot claim a round happened.
    canon = []
    for comment in history["comments"]:
        if comment.get("author_login") != contract.bot_login:
            continue
        expected_marker = f"codex-pr-review:{pr}:{comment.get('head_sha')}"
        if comment.get("marker") != expected_marker:
            continue
        canon.append(comment)
    canon.sort(key=lambda c: (_parse_ts(c["created_at"]), c["comment_id"]))
    round_count = len(canon)

    # 2. Ambiguous history: two canonical comments at the same head SHA. The
    #    collector never silently picks a winner; the disposition is needs-human.
    dup_sha = _first_duplicate([c["head_sha"] for c in canon])
    if dup_sha is not None:
        return _result(CONTINUE, RULE_AMBIGUOUS_HISTORY, True, round_count,
                       detail=f"two canonical comments share head SHA {dup_sha}")

    if round_count == 0:
        return _result(CONTINUE, RULE_CONTINUE, False, 0,
                       detail="no canonical review rounds yet")

    # 3. Fold the rounds in creation order, maintaining the arbiter's open-set.
    open_set = {}
    pending_human = {}
    resolved = {}
    fail = None
    latest_index = round_count - 1
    for idx, comment in enumerate(canon):
        valid, err = validate_trailer(comment.get("trailer"))
        if valid is None:
            # An invalid round counts toward the cap but contributes no finding
            # states. Only when it is the LATEST round is it fatal — no merge is
            # produced from a round the arbiter could not parse. An earlier
            # invalid round is recovered by any later valid round.
            if idx == latest_index:
                fail = (RULE_MALFORMED, f"latest round trailer unparseable: {err}")
            continue
        round_fail = _apply_round(
            idx, valid["findings"], open_set, pending_human, resolved, diff_files
        )
        if round_fail is not None:
            fail = round_fail
            break

    if fail is not None:
        rule, detail = fail
        return _result(CONTINUE, rule, True, round_count, detail=detail)

    # 4. Rules — first match wins (§6.2). "Findings" means the open-set.
    open_findings = list(open_set.values())
    open_p1 = [t for t in open_findings if t.sev == "P1"]

    # Rule 1: CLEAN — everything ever raised is resolved with bounded evidence,
    # and no P1 resolution is pending human verification.
    if not open_set and not pending_human:
        return _result(MERGE_CLEAN, RULE_CLEAN, False, round_count,
                       detail="all findings resolved with bounded evidence")

    # Rule 2: STUCK-P1 — before any merge rule, so a persistent P1 can never
    # ride out under novelty exhaustion or slip past the cap under a softer rule.
    stuck = _first_stuck_p1(open_p1, canon, latest_index, contract)
    if stuck is not None:
        gaps = _proposed_gaps(open_findings, pending_human)
        return _result(ESCALATE, RULE_STUCK_P1, True, round_count, proposed_gaps=gaps,
                       detail=f"P1 {stuck.id!r} open >= {contract.stuck_p1_rounds} rounds "
                              f"with fixer pushes between")

    # A P1 resolution awaiting a human is never CLEAN and never mergeable: a
    # maintainer must verify it on the current head. This holds regardless of any
    # coexisting open minors — the hold fails closed to NEEDS-HUMAN *before* the
    # merge-family rules (3-5), so a pending P1 resolution is never surfaced under
    # a mergeable (MERGE-*) headline; it always yields NEEDS-HUMAN /
    # P1-RESOLUTION-PENDING. Do not read that as "a P1 gap is only ever proposed
    # under STUCK-P1 / HARD-CAP escalation": a second, merely-open P1 (not yet
    # STUCK-P1) can coexist with the pending one and is listed in proposed_gaps
    # right here too, status "open", beside the pending entry's "pending-human".
    if pending_human:
        return _result(CONTINUE, RULE_P1_PENDING, True, round_count,
                       proposed_gaps=_proposed_gaps(open_findings, pending_human),
                       detail="P1 resolution awaits human verification")

    # Rule 3: HARD CAP (round >= hard_cap) — whatever remains escalates.
    # Evaluated BEFORE the merge-family rules so the cap is a true ceiling:
    # an unresolved loop at the configured maximum escalates to a human even
    # when every open finding is a minor. "Never merge at the cap" is the
    # fail-closed termination invariant; evaluating SOFT-GATE or
    # EXHAUSTED-NOVELTY first would let round `hard_cap` return
    # MERGE-WITH-GAPS and silently convert the ceiling into a merge gate.
    if round_count >= contract.hard_cap:
        gaps = _proposed_gaps(open_findings, pending_human)
        return _result(ESCALATE, RULE_HARD_CAP, True, round_count, proposed_gaps=gaps,
                       detail=f"hard cap reached at round {round_count}; contract likely wrong")

    # Rule 4: EXHAUSTED-NOVELTY — no P1s, every open finding a repeated minor.
    if not open_p1 and all(_is_repeated(t, latest_index) for t in open_findings):
        gaps = _proposed_gaps(open_findings, pending_human)
        return _result(MERGE_WITH_GAPS, RULE_EXHAUSTED, True, round_count, proposed_gaps=gaps,
                       detail="every open finding is a repeated minor (no new information)")

    # Rule 5: SOFT GATE (round >= soft_gate) — no P1s, only minors (new or
    # not). No clamp against the hard cap is needed or wanted: the cap is
    # evaluated first, so a soft_gate configured past the cap simply never
    # fires — the loop escalates at the cap instead of merging there. A
    # clamp would re-open the merge-at-the-cap hole this ordering closes.
    if round_count >= contract.soft_gate and not open_p1:
        gaps = _proposed_gaps(open_findings, pending_human)
        return _result(MERGE_WITH_GAPS, RULE_SOFT_GATE, True, round_count, proposed_gaps=gaps,
                       detail=f"soft gate reached at round {round_count} with only minor findings")

    # Rule 6: otherwise keep looping.
    return _result(CONTINUE, RULE_CONTINUE, False, round_count, detail="loop continues")


# --------------------------------------------------------------------------- #
# Collector (the only networked seam) + its pure history builder.              #
# --------------------------------------------------------------------------- #
_MARKER_RE_TMPL = r"codex-pr-review:{pr}:([0-9a-fA-F]{{7,64}})"


def build_history(pr, repo, head_sha, diff_files, raw_comments, contract: Contract,
                  head_ref: Optional[str] = None) -> dict:
    """Pure: assemble schema-1 history from already-fetched raw comments.

    Each raw comment is a dict with ``id``, ``created_at``, ``login`` and
    ``body``. A comment is canonical only if its author is the bot and its body
    carries this PR's review marker; the round's head SHA is read from that
    marker (not trusted from elsewhere). Bodies are not stored verbatim — they
    quote diff content the data policy forbids persisting — only the parsed
    trailer and identity are kept.
    """
    marker_re = re.compile(_MARKER_RE_TMPL.format(pr=pr))
    comments = []
    for raw in raw_comments:
        login = raw.get("login", "")
        body = raw.get("body") or ""
        # The poster emits the marker as the comment's FIRST line, so a
        # canonical round is anchored there — and only there. Matching the
        # marker anywhere in the body let a PR plant a fake marker in its
        # diff, get the bot to quote it, and have the quote counted as a
        # review round (review P2, head b73afd5).
        match = marker_re.search(body.split("\n", 1)[0].strip())
        if login != contract.bot_login or match is None:
            continue
        comment_head_sha = match.group(1)
        trailer, _ = extract_trailer(body)
        comments.append({
            "comment_id": raw["id"],
            "created_at": raw["created_at"],
            "author_login": login,
            "head_sha": comment_head_sha,
            "marker": f"codex-pr-review:{pr}:{comment_head_sha}",
            "body": "[body elided — see PR comment]",
            "trailer": trailer,
        })
    comments.sort(key=lambda c: (_parse_ts(c["created_at"]), c["comment_id"]))
    return {
        "schema": 1,
        "repo": repo,
        "pr": pr,
        "current_head_sha": head_sha,
        # The PR's OWN branch name, not the checkout's. Gap issues cite the
        # branch's contract; deriving it from `git rev-parse HEAD` resolves
        # to None on a detached CI checkout or to the wrong branch when the
        # arbiter runs from main (review P2, head b73afd5).
        "current_head_ref": head_ref,
        "current_diff_files": sorted(diff_files),
        "comments": comments,
    }


def _gh_json(args):
    proc = subprocess.run(["gh", *args], capture_output=True, text=True, check=True)
    return json.loads(proc.stdout)


def _gh_lines(args):
    proc = subprocess.run(["gh", *args], capture_output=True, text=True, check=True)
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


def collect(pr: int, contract: Contract, repo: Optional[str] = None) -> dict:
    """Networked: fetch a PR's head, changed files, and comments via ``gh`` and
    hand them to :func:`build_history`. Mirrors codex_review_pr.sh's env reads."""
    repo = repo or os.environ.get("GH_REPO") or os.environ.get("GITHUB_REPOSITORY")
    if not repo:
        raise SystemExit("GH_REPO or GITHUB_REPOSITORY is required")
    meta = _gh_json(["pr", "view", str(pr), "--repo", repo,
                     "--json", "headRefOid,headRefName,files"])
    head_sha = meta["headRefOid"]
    head_ref = meta["headRefName"]
    diff_files = [f["path"] for f in meta.get("files", [])]
    raw = _gh_lines([
        "api", "--paginate", f"repos/{repo}/issues/{pr}/comments?per_page=100",
        "--jq", ".[] | {id: .id, created_at: .created_at, body: (.body // \"\"), "
                "login: (.user.login // \"\")}",
    ])
    return build_history(pr, repo, head_sha, diff_files, raw, contract,
                         head_ref=head_ref)


# --------------------------------------------------------------------------- #
# Poster.                                                                       #
# --------------------------------------------------------------------------- #
def render_comment(decision: Decision, pr) -> str:
    lines = [
        f"<!-- codex-arbiter:{pr} -->",
        f"## Arbiter recommendation: {decision.recommendation}",
        "",
        f"- Rule: `{decision.cited_rule}`",
        f"- Loop action: `{decision.loop_action}`",
        f"- Rounds counted: {decision.round_count}",
        f"- Human review required: {'yes' if decision.needs_human else 'no'}",
    ]
    if decision.detail:
        lines.append(f"- Basis: {decision.detail}")
    if decision.proposed_gaps:
        lines.append("")
        lines.append("### Proposed gaps")
        for gap in decision.proposed_gaps:
            lines.append(
                f"- `{gap['sev']}` `{gap['id']}` "
                f"({gap['file']} / {gap['cat']}) — {gap.get('status', 'open')}, "
                f"first raised round {gap['first_round']}"
            )
    lines.append("")
    lines.append("_Deterministic arbiter (no model call). Human approval is required before merge._")
    return "\n".join(lines)


def post_comment(pr, repo, body) -> None:
    subprocess.run(
        ["gh", "pr", "comment", str(pr), "--repo", repo, "--body", body],
        check=True,
    )


# --- Gap-issue ledger (Task T4, plan §6.4) ---------------------------------- #
# One idempotent ``proposed-gap`` issue per residual finding. WRITES to
# GitHub — reachable only under the same operator gate as post_comment
# (main()'s ``--post`` + ``ARBITER_OPERATOR=1`` check), never from decide().
_ARBITER_COMMENT_MAX_BYTES = 60_000  # mirrors the gap-issue ceiling style
_PROPOSED_GAP_LABEL = "proposed-gap"
_ACCEPTED_GAP_LABEL = "accepted-gap"
_GAP_ISSUE_MAX_BYTES = 60_000  # mirrors codex_responses.py's output-bound style
_GAP_ISSUE_LIST_LIMIT = 500


def _gap_identity_hash(file: str, cat: str) -> str:
    """First 8 hex chars of ``sha256(file + "\\n" + cat)`` — the ``(file,
    cat)`` half of the arbiter's canonical ``(id, file, cat)`` identity
    (§6.1). Deterministic and independent of head SHA or round index, so the
    SAME ``(file, cat)`` always folds to the SAME 8 hex chars, across
    rounds, heads, and re-runs."""
    digest = hashlib.sha256(f"{file}\n{cat}".encode("utf-8")).hexdigest()
    return digest[:8]


def _gap_marker(pr, gap_id: str, file: str, cat: str) -> str:
    # Keyed on the finding's full canonical IDENTITY, never the head SHA
    # (plan §6.4): the same gap re-proposed at a later head must resolve to
    # this SAME marker, so a later post_gap_issues call finds and skips it
    # instead of opening a twin.
    #
    # `id` ALONE is not enough to key on. §6.1 is explicit that the
    # reviewer's slug is a PROPOSAL and the arbiter's own canonical identity
    # is the TRIPLE (id, file, cat) — decide() legitimately allows two
    # genuinely-distinct findings to share an `id` at different (file, cat);
    # it only refuses a (file, cat) KEY collision (AMBIGUOUS-IDENTITY), never
    # id reuse across different keys. A marker built from `id` alone
    # therefore collided for two such findings: the second's issue-search
    # matched the first's just-created issue and silently skipped creating
    # its own — a PERMANENT dropped finding, not a duplicate. Folding a
    # short, stable hash of (file, cat) into the marker restores per-finding
    # uniqueness while staying deterministic across rounds and heads.
    return f"<!-- codex-gap:{pr}:{gap_id}:{_gap_identity_hash(file, cat)} -->"


def _issue_comment_permalink(repo: str, pr, comment_id) -> str:
    return f"https://github.com/{repo}/pull/{pr}#issuecomment-{comment_id}"


def _poster_canonical_comments(history: dict, pr, contract: Contract) -> List[dict]:
    """Poster-side re-derivation of which comments are canonical review rounds
    (bot author + this PR's exact review marker) so post_gap_issues can locate
    the comment that most recently carried a given finding — WITHOUT calling
    decide() or its private helpers. decide() exposes no canonical-comment
    list today, and this task must not edit the core to add one, so this is a
    small, deliberately independent read of the same schema-1 document,
    documented here rather than silently duplicated.
    """
    canon = []
    for comment in history.get("comments", []):
        if comment.get("author_login") != contract.bot_login:
            continue
        expected_marker = f"codex-pr-review:{pr}:{comment.get('head_sha')}"
        if comment.get("marker") != expected_marker:
            continue
        canon.append(comment)
    canon.sort(key=lambda c: (_parse_ts(c["created_at"]), c["comment_id"]))
    return canon


def _latest_comment_id_for_finding(canon: List[dict], finding_id: str) -> Optional[int]:
    """The comment_id of the latest canonical round mentioning this finding id
    (NEW, OPEN, or RESOLVED all count as 'carrying' it) — ``canon`` is in
    ascending chronological order, so the last match wins. None if no
    canonical round mentions it: a permalink is advisory context, never a
    decision input, so the poster degrades gracefully instead of raising.
    """
    latest = None
    for comment in canon:
        trailer = comment.get("trailer")
        findings = trailer.get("findings") if isinstance(trailer, dict) else None
        if not isinstance(findings, list):
            continue
        for finding in findings:
            if isinstance(finding, dict) and finding.get("id") == finding_id:
                latest = comment.get("comment_id")
    return latest


def _gap_issue_title(gap: dict) -> str:
    return f"[proposed-gap] {gap['sev']} {gap['cat']} - {gap['file']} ({gap['id']})"


def render_gap_issue_body(gap: dict, pr, permalink: Optional[str],
                           contract_text: Optional[str]) -> str:
    """The gap issue body (plan §6.4): built from SAFE structured fields only
    (sev, file, cat, id, status, first_round) — never the finding's free-text
    prose, which stays in the review comment the permalink points at. The
    marker is the FIRST line so it survives the later size-bound truncation
    (never appended at the end, where truncation could drop it).
    """
    lines = [
        _gap_marker(pr, gap["id"], gap["file"], gap["cat"]),
        f"## Proposed gap: `{gap['id']}`",
        "",
        "Durable ledger entry for a finding the automated PR review loop could",
        "not resolve within this pass. Only safe, structured fields are stored",
        "here — never diff content or finding prose.",
        "",
        "### Finding",
        f"- Severity: `{gap['sev']}`",
        f"- File: `{gap['file']}`",
        f"- Category: `{gap['cat']}`",
        f"- Status: `{gap.get('status', 'open')}`",
        f"- First raised: round {gap['first_round']}",
        "",
        "### Full context",
        (f"The finding text is in the review comment: {permalink}" if permalink
         else "No canonical review comment could be resolved for this finding."),
        "",
        "### Contract",
        (contract_text.strip() if contract_text and contract_text.strip()
         else "no contract on main"),
        "",
        "### Closing criteria",
        "Close when a maintainer accepts this as a documented limit or a fix "
        "lands and the reviewer marks it RESOLVED.",
    ]
    return "\n".join(lines)


def _ensure_proposed_gap_label(repo: str) -> None:
    """Idempotently make sure the label exists. ``gh issue create --label X``
    errors when X does not exist, but gh's error text for that case is not a
    stable string to branch on across versions — so instead of parsing
    stderr, this unconditionally (re)creates the label with --force, which
    both creates it on a fresh repo and no-ops on one where it already exists.
    Best-effort: a failure here does not abort the run; issue creation below
    surfaces its own error if the label problem was real.
    """
    subprocess.run(
        ["gh", "label", "create", _PROPOSED_GAP_LABEL, "--repo", repo,
         "--color", "d4c5f9",
         "--description", "Arbiter-proposed gap awaiting a maintainer's accepted-gap relabel",
         "--force"],
        capture_output=True, text=True, check=False,
    )


def _list_existing_gap_issues(repo: str, limit: int) -> List[dict]:
    """Fetch every ledger issue the marker search must see, across relabels.

    Both ledger labels are queried because a maintainer's accepted-gap
    relabel REMOVES the proposed-gap label: an issue carrying only
    accepted-gap is invisible to a proposed-gap-only query, and the next
    re-proposal of that same gap would open a duplicate. gh ANDs repeated
    --label flags, so this is one call per label with results concatenated.
    --state all keeps closed ledger issues visible for the same reason.
    """
    issues: List[dict] = []
    for label in (_PROPOSED_GAP_LABEL, _ACCEPTED_GAP_LABEL):
        proc = subprocess.run(
            ["gh", "issue", "list", "--repo", repo,
             "--label", label,
             "--state", "all", "--json", "number,body", "--limit", str(limit)],
            capture_output=True, text=True, check=True,
        )
        label_issues = json.loads(proc.stdout)
        # A saturated page means older ledger issues were silently cut off,
        # and a marker beyond the cutoff would duplicate instead of dedup.
        # That is not a state this poster may guess its way through: refuse
        # and put the ledger back under a human's hands.
        if len(label_issues) >= limit:
            raise RuntimeError(
                f"gap ledger label {label!r} has >= {limit} issues; manual "
                "dedup/archival is required before posting new gaps"
            )
        issues.extend(label_issues)
    return issues


def _find_existing_issue(existing_issues: List[dict], marker: str) -> Optional[int]:
    # A deterministic, local grep over already-fetched bodies — never GitHub's
    # own search indexing, which is not guaranteed to index HTML comments
    # (plan §6.4 / task brief).
    for issue in existing_issues:
        if marker in (issue.get("body") or ""):
            return issue.get("number")
    return None


def _parse_issue_number(create_stdout: str) -> Optional[int]:
    match = re.search(r"/issues/(\d+)", create_stdout)
    return int(match.group(1)) if match else None


def _is_contract_document(text: str, branch: str) -> bool:
    """True only if `text`'s first non-blank line is exactly
    `# Contract: <branch>` for the requested branch (singular, with a colon,
    per docs/contracts/README.md's "Format" section).

    Two guards live in this one comparison. The prefix guard keeps a stray
    file at a mapped path -- e.g. the FORMAT DOCUMENTATION itself, headed
    `# Contracts`, plural -- from injecting as a binding contract. The
    exact-match guard keeps a mis-filed or copy-pasted contract that names a
    DIFFERENT branch from binding its scope to this one: a correctly located
    path with the wrong branch in the header degrades to None like any other
    missing contract (review P2, head 9da9fc2).
    """
    expected = f"# Contract: {branch}"
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped == expected
    return False


def _contract_relative_path(branch: str) -> str:
    """Injective branch→path mapping under docs/contracts/.

    Slug-and-hash: the slug keeps paths human-readable, and the 8-hex sha256
    prefix of the FULL branch name makes the mapping injective where the
    slug alone is not — `feature/a-b` and `feature-a/b` both slug to
    `feature-a-b` but hash differently, so one branch's contract can never
    silently bind another. The hash also takes the README collision off the
    table: no branch name resolves onto the format doc itself.
    """
    slug = branch.replace("/", "-")
    digest = hashlib.sha256(branch.encode("utf-8")).hexdigest()[:8]
    return f"docs/contracts/{slug}-{digest}.md"


def load_contract_text(branch: Optional[str] = None) -> Optional[str]:
    """Best-effort read of this branch's contract as it stands on `main`
    (docs/contracts/README.md §4.1: a contract binds only from the default
    branch, never a PR branch's own copy). Purely advisory context for the gap
    issue's Contract section — never a decide() input, so any failure (no git
    repo, no such branch, no contract file, origin/main not fetched) degrades
    to None ('no contract on main'), matching the documented rollout rule,
    rather than raising. T5 (a later, separate task) owns injecting the
    contract into the REVIEWER's *trusted instructions*; this is a narrower,
    read-only convenience for this poster's CLI wiring and does not duplicate
    that trust boundary — nothing here feeds a decide() disposition.

    A resolved file only counts as a contract when _is_contract_document
    accepts it. A present-but-wrong file (e.g. docs/contracts/README.md
    itself, for a branch literally named `README`) degrades to None exactly
    like a missing file -- fail safe, never raised as an error.
    """
    try:
        if branch is None:
            proc = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                capture_output=True, text=True, check=True, cwd=_REPO_ROOT,
            )
            branch = proc.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    if not branch or branch == "HEAD":
        return None
    path = _contract_relative_path(branch)
    for ref in ("origin/main", "main"):
        try:
            proc = subprocess.run(
                ["git", "show", f"{ref}:{path}"],
                capture_output=True, text=True, check=True, cwd=_REPO_ROOT,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if proc.stdout.strip() and _is_contract_document(proc.stdout, branch):
            return proc.stdout
    return None


def post_gap_issues(decision: Decision, pr, repo: str, contract: Contract,
                     history: dict, contract_text: Optional[str] = None,
                     list_limit: int = _GAP_ISSUE_LIST_LIMIT) -> List[dict]:
    """Create one idempotent ``proposed-gap`` issue per ``decision.proposed_gaps``
    entry (plan §6.4). WRITES to GitHub: reachable only under the same
    operator gate as post_comment. main() only ever calls this from inside its
    own already-gated ``if args.post:`` branch; this function repeats the
    ARBITER_OPERATOR check itself so a caller cannot reach a GitHub write by
    skipping main()'s gate (main()'s own ``--post`` flag has no equivalent
    process-wide signal this function could check, so ARBITER_OPERATOR is the
    one gate condition both layers can enforce).

    ``history`` is the same schema-1 document decide() consumed. It is used
    here ONLY to resolve each finding's permalink (see
    _poster_canonical_comments / _latest_comment_id_for_finding) — decide()
    and its helpers are never called from here, and this function is never
    called from decide(). ``contract_text`` is the pre-loaded contents of this
    branch's docs/contracts/<branch>.md as read from ``main`` (see
    load_contract_text), or None if no contract has merged yet.

    Returns one result dict per gap: {"gap_id", "action" ("created" or
    "skipped-existing"), "issue_number"}.
    """
    if os.environ.get("ARBITER_OPERATOR") != "1":
        raise PermissionError(
            "post_gap_issues requires ARBITER_OPERATOR=1 (operator mode); "
            "refusing to create GitHub issues."
        )
    if not decision.proposed_gaps:
        return []

    canon = _poster_canonical_comments(history, pr, contract)
    _ensure_proposed_gap_label(repo)
    existing_issues = _list_existing_gap_issues(repo, list_limit)

    results = []
    for gap in decision.proposed_gaps:
        marker = _gap_marker(pr, gap["id"], gap["file"], gap["cat"])
        existing_number = _find_existing_issue(existing_issues, marker)
        if existing_number is not None:
            results.append({
                "gap_id": gap["id"],
                "action": "skipped-existing",
                "issue_number": existing_number,
            })
            continue

        comment_id = _latest_comment_id_for_finding(canon, gap["id"])
        permalink = (_issue_comment_permalink(repo, pr, comment_id)
                     if comment_id is not None else None)
        body = render_gap_issue_body(gap, pr, permalink, contract_text)
        # Belt-and-suspenders (plan §6.4): the fields going in are already
        # SAFE, but the permalink/contract lines are cheap to defend, so the
        # FINAL assembled body AND title are sanitized like everything else
        # this repo posts, then the body is size-bounded. Sanitize first,
        # truncate second — the same order codex_review_pr.sh uses — because
        # truncating first could cut a line-anchored redaction pattern in
        # half and let a partial secret through.
        body = _truncate_gap_body(_sanitize_gap_body(body), _GAP_ISSUE_MAX_BYTES)
        title = _sanitize_gap_body(_gap_issue_title(gap))

        proc = subprocess.run(
            ["gh", "issue", "create", "--repo", repo,
             "--title", title, "--body", body,
             "--label", _PROPOSED_GAP_LABEL],
            capture_output=True, text=True, check=True,
        )
        created_number = _parse_issue_number(proc.stdout)
        results.append({
            "gap_id": gap["id"],
            "action": "created",
            "issue_number": created_number,
        })
        # Defends the SAME run against two proposed_gaps entries that resolve
        # to the SAME marker — the same canonical (id, file, cat) triple —
        # somehow appearing twice in one decision: without this, the second
        # would search the STALE existing_issues list, miss the one just
        # created, and open a twin. This does NOT collapse two distinct
        # findings that merely share an `id` at different (file, cat); those
        # now hash to different markers (see _gap_marker) and always get
        # their own issue.
        existing_issues.append({"number": created_number, "body": body})
    return results


# --------------------------------------------------------------------------- #
# CLI.                                                                          #
# --------------------------------------------------------------------------- #
def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="codex_arbiter.py",
        description="Deterministic PR-review-loop arbiter (never calls a model).",
    )
    parser.add_argument("pr", nargs="?", type=int, help="PR number (composes collector + core)")
    parser.add_argument("--history", help="run the CORE ALONE on a schema-1 history JSON file")
    parser.add_argument("--repo", help="owner/name (defaults to GH_REPO / GITHUB_REPOSITORY)")
    parser.add_argument("--post", action="store_true",
                        help="post the recommendation comment (requires operator mode)")
    parser.add_argument("--json", action="store_true", dest="as_json",
                        help="emit the decision as JSON instead of a rendered comment")
    return parser


def _emit(decision: Decision, pr, as_json: bool) -> None:
    if as_json:
        print(json.dumps({
            "recommendation": decision.recommendation,
            "loop_action": decision.loop_action,
            "cited_rule": decision.cited_rule,
            "needs_human": decision.needs_human,
            "round_count": decision.round_count,
            "proposed_gaps": decision.proposed_gaps,
            "detail": decision.detail,
        }, indent=2))
    else:
        print(render_comment(decision, pr))


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    args = _build_parser().parse_args(argv)
    contract = Contract.from_env()

    # Posting is a network write on the user's behalf: gated behind explicit
    # operator mode, refused by default. The local default is read-only.
    if args.post and os.environ.get("ARBITER_OPERATOR") != "1":
        print("Refusing to post: set ARBITER_OPERATOR=1 to enable operator mode "
              "(writes a PR comment on your behalf).", file=sys.stderr)
        return 3

    if args.history:
        history = json.loads(Path(args.history).read_text())
        decision = decide(history, contract)
        _emit(decision, history.get("pr", "?"), args.as_json)
        return 0

    if args.pr is None:
        print("Provide a PR number, or --history FILE to run the core alone.", file=sys.stderr)
        return 2

    history = collect(args.pr, contract, repo=args.repo)
    decision = decide(history, contract)
    if args.post:
        # Same treatment as every other posted surface: findings may carry
        # attacker-controlled diff bytes, so the rendered comment passes the
        # sanitizer before publication, then the size bound.
        comment_body = _truncate_gap_body(
            _sanitize_gap_body(render_comment(decision, args.pr)),
            _ARBITER_COMMENT_MAX_BYTES,
        )
        post_comment(args.pr, history["repo"], comment_body)
        print(f"Posted arbiter recommendation ({decision.recommendation}) to PR #{args.pr}.")
        if decision.proposed_gaps:
            contract_text = load_contract_text(history.get("current_head_ref"))
            gap_results = post_gap_issues(decision, args.pr, history["repo"], contract,
                                           history, contract_text=contract_text)
            created = sum(1 for r in gap_results if r["action"] == "created")
            existing = len(gap_results) - created
            print(f"Gap ledger: {created} new proposed-gap issue(s) opened, "
                  f"{existing} already tracked.")
    else:
        _emit(decision, args.pr, args.as_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
