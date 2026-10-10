"""The landing facts export: deterministic, isolated, and equal to the data.

Facts are generated at landing-build time and never committed. These tests pin
the export's behaviour instead of its output, so a change to the seed data
never fails a PR.
"""
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import distinct, func, select

from app.data.landing_corridors import LANDING_CORRIDORS
from app.data.payment_schemes import get_international_schemes, list_currencies_with_schemes
from app.models import SSI, Bank, CorridorRule

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "export_landing_facts.py"
FIXTURE = REPO_ROOT / "frontend" / "src" / "landing" / "render" / "facts.fixture.json"

_spec = importlib.util.spec_from_file_location("export_landing_facts", SCRIPT)
export_landing_facts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(export_landing_facts)


@pytest.fixture(scope="module")
def exported():
    with export_landing_facts.seeded_session() as session:
        facts = export_landing_facts.build_facts(session)
        direct = {
            "banks": session.scalar(select(func.count()).select_from(Bank)),
            "bank_countries": session.scalar(select(func.count(distinct(Bank.country_code)))),
            "ssi": session.scalar(select(func.count()).select_from(SSI)),
            "settleable": session.scalar(
                select(func.count()).select_from(SSI).where(SSI.bic_only.is_(False))
            ),
            "beneficiaries": session.scalar(select(func.count(distinct(SSI.beneficiary_bic)))),
            "correspondents": session.scalar(select(func.count(distinct(SSI.intermediary_bic)))),
            "rules": session.scalar(select(func.count()).select_from(CorridorRule)),
            "corridors": len(
                set(
                    session.execute(
                        select(CorridorRule.destination_currency, CorridorRule.destination_country)
                    ).all()
                )
            ),
        }
    return facts, direct


def _shape(value):
    if isinstance(value, dict):
        return {key: _shape(item) for key, item in value.items()}
    if isinstance(value, list):
        shapes = [_shape(item) for item in value]
        assert all(shape == shapes[0] for shape in shapes), "list items differ in shape"
        return [shapes[0]] if shapes else []
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    return type(value).__name__


def test_counts_equal_direct_queries_on_the_same_session(exported):
    facts, direct = exported
    assert facts["directory"] == {"banks": direct["banks"], "countries": direct["bank_countries"]}
    assert facts["ssi"] == {
        "rows": direct["ssi"],
        "settleableRows": direct["settleable"],
        "beneficiaryBanks": direct["beneficiaries"],
        "correspondents": direct["correspondents"],
    }
    assert facts["corridorRules"] == {"rows": direct["rules"], "corridors": direct["corridors"]}


def test_rails_follow_the_scheme_reference_data(exported):
    rails = exported[0]["rails"]
    assert [c["code"] for c in rails["currencies"]] == list_currencies_with_schemes()
    assert rails["currencyCount"] == len(rails["currencies"])
    assert rails["domesticSchemeCount"] == sum(len(c["schemes"]) for c in rails["currencies"])
    international_rails = 1 if get_international_schemes().get("name") else 0
    assert rails["totalRailCount"] == rails["domesticSchemeCount"] + international_rails
    assert rails["international"]["name"] == "SWIFT gpi"


def test_corridors_carry_no_bank_identifiers(exported):
    corridors = exported[0]["corridors"]
    assert [c["currency"] for c in corridors] == [c["currency"] for c in LANDING_CORRIDORS]
    assert {c["source"] for c in corridors} <= {"case", "rule"}
    assert "XXX" not in json.dumps(corridors)


def test_shape_matches_the_committed_render_fixture(exported):
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert _shape(exported[0]) == _shape(fixture)


def test_export_is_deterministic(tmp_path):
    first, second = tmp_path / "a.json", tmp_path / "b.json"
    export_landing_facts.export(first)
    export_landing_facts.export(second)
    assert first.read_bytes() == second.read_bytes()


def test_export_never_opens_database_url(tmp_path):
    out = tmp_path / "facts.json"
    env = os.environ.copy()
    env.pop("VERCEL", None)
    # Unreachable on purpose: the export must never connect to it.
    env["DATABASE_URL"] = "postgresql://relay:relay@127.0.0.1:1/unreachable"
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--out", str(out)],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(out.read_text(encoding="utf-8"))["schemaVersion"] == 1
