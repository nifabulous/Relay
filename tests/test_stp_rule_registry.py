"""stp_checker.RULES is the countable list of rules check_stp runs.

The landing page states the rule count, so the count must come from code. The
registry is checked against the checker's source: every finding code check_stp
can emit belongs to exactly one registered rule, and every rule block comment
has a registry entry. Adding a rule without registering it fails here.
"""
import ast
import re
from pathlib import Path

from app.services import stp_checker
from app.services.stp_checker import RULES

SOURCE = Path(stp_checker.__file__).read_text(encoding="utf-8")


def _emitted_codes() -> set:
    tree = ast.parse(SOURCE)
    check = next(
        node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "check_stp"
    )
    codes = set()
    for node in ast.walk(check):
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "Finding":
            for keyword in node.keywords:
                if keyword.arg == "code" and isinstance(keyword.value, ast.Constant):
                    codes.add(keyword.value.value)
    return codes


def test_every_emitted_code_belongs_to_exactly_one_rule():
    registered = [rule.code for rule in RULES]
    assert len(registered) == len(set(registered))
    assert set(registered) == _emitted_codes()


def test_rule_numbers_match_the_rule_block_comments():
    blocks = [int(n) for n in re.findall(r"# ---- Rule (\d+):", SOURCE)]
    assert blocks == list(range(1, len(blocks) + 1))
    assert [rule.number for rule in RULES] == blocks


def test_docstrings_state_the_registered_count():
    count = f"{len(RULES)}-rule"
    assert count in stp_checker.__doc__
    assert count in stp_checker.check_stp.__doc__


def test_the_api_description_states_the_registered_count():
    from app.routers.analytics import stp_check_endpoint

    assert f"{len(RULES)}-rule" in stp_check_endpoint.__doc__
