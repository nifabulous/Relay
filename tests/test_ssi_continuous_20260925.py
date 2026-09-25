import json
from pathlib import Path

from app.services.seed import _SSI_CONSOLIDATION_DATA_FILES, SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]

LEDGER_NAMES = (
    "seed_ssi_nordea_current_20250730.json",
    "seed_ssi_idfc_first_mumbai_20260921.json",
    "seed_ssi_usbank_fx_fex_20250601.json",
    "seed_ssi_india_wire_current_20260921.json",
    "seed_ssi_cibc_caribbean_trust_20260921.json",
    "seed_ssi_alior_bank_20260921.json",
    "seed_ssi_bank_frick_20260527_deltas.json",
    "seed_ssi_kdb_kapitalbank_current_20260921.json",
    "seed_ssi_bcge_geneva_20240101.json",
    "seed_ssi_mbh_bank_20241024.json",
)


def test_continuous_20260925_batch_is_loaded_and_source_backed():
    rows = []
    for name in LEDGER_NAMES:
        assert name in _SSI_CONSOLIDATION_DATA_FILES
        payload = json.loads((ROOT / "app" / "services" / name).read_text())
        rows.extend(payload["ssi_records"])

    assert len(rows) == 350
    assert len({(row[0], row[2], row[3]) for row in rows}) == len(rows)
    assert all(row[11] == "unverified" and row[12] is None for row in rows)
    assert all(row[13] and not row[14] for row in rows)
    assert all(all(value is None for value in row[5:9]) for row in rows)
    assert all(row[9].startswith("Source: https://") for row in rows)
    seeded_keys = {(row[0], row[2], row[3]) for row in SSI_RECORDS}
    assert {(row[0], row[2], row[3]) for row in rows} <= seeded_keys


def test_continuous_20260925_manifest_matches_batch():
    manifest = json.loads(
        (
            ROOT
            / "scripts"
            / "ssi-autopilot"
            / "evidence"
            / "ssi-continuous-20260925-batch.json"
        ).read_text()
    )
    assert manifest["record_count"] == 350
    assert tuple(manifest["ledger_files"]) == LEDGER_NAMES
    assert len(manifest["sources"]) == len(LEDGER_NAMES)
