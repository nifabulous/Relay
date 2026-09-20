"""Regression checks for the South Asia wave-2 source ledger."""

import json
from pathlib import Path

from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app" / "services" / "seed_ssi_south_asia_wave2.json"


def test_south_asia_wave2_ledger_is_admitted_as_non_routable_metadata():
    groups = json.loads(LEDGER.read_text(encoding="utf-8"))
    packed = [
        (group[0], item.split("|", 2)[0], item.split("|", 2)[1])
        for group in groups
        for item in group[-1]
    ]
    assert len(packed) == 163
    assert len(set(packed)) == len(packed)

    seeded = {(row[0], row[2], row[3]): row for row in SSI_RECORDS}
    admitted = [seeded[key] for key in packed]
    assert len(admitted) == len(packed)
    assert all(row[13] is True for row in admitted)
    assert all(row[11] == "unverified" for row in admitted)
    assert all(row[5] is None and row[6] is None for row in admitted)
    assert all("Source: https://" in row[9] for row in admitted)
