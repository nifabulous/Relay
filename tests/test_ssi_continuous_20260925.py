import hashlib
import json
import re
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


def _route_digest(rows):
    canonical = [(row[0], row[2], row[3], row[4]) for row in rows]
    payload = json.dumps(canonical, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def _source_url(row):
    match = re.match(r"Source: (https?://[^ ]+)", row[9])
    assert match, row[9]
    return match.group(1)


def _fixture_route_digest(routes):
    canonical = [
        (
            route["beneficiary_bic"],
            route["currency"],
            route["intermediary_bic"],
            route["intermediary_name"],
        )
        for route in routes
    ]
    payload = json.dumps(canonical, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


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
    assert len(manifest["sources"]) == 15
    assert manifest["source_integrity"]["hash_algorithm"] == "sha256"
    assert manifest["source_integrity"]["accounts_committed"] is False
    rows_by_source = {}
    for name in LEDGER_NAMES:
        payload = json.loads((ROOT / "app" / "services" / name).read_text())
        for row in payload["ssi_records"]:
            rows_by_source.setdefault((name, _source_url(row)), []).append(row)

    manifest_sources = {
        (source["ledger_file"], source["url"]): source
        for source in manifest["sources"]
    }
    assert set(manifest_sources) == set(rows_by_source)
    fixture_path = ROOT / "tests" / "fixtures" / "ssi_continuous_20260925_source_attestation.json"
    fixture = json.loads(fixture_path.read_text())
    fixture_sources = {
        (source["ledger_file"], source["url"]): source
        for source in fixture["sources"]
    }
    mixed_ledger_names = {
        "seed_ssi_india_wire_current_20260921.json",
        "seed_ssi_cibc_caribbean_trust_20260921.json",
        "seed_ssi_kdb_kapitalbank_current_20260921.json",
    }
    assert set(fixture_sources) == {
        key for key in rows_by_source if key[0] in mixed_ledger_names
    }
    for source in manifest["sources"]:
        key = (source["ledger_file"], source["url"])
        rows = rows_by_source[key]
        assert source["route_count"] == len(rows)
        assert source["route_digest"] == _route_digest(rows)
        assert len(source["source_sha256"]) == 64
        assert source["url"] in {_source_url(row) for row in rows}
        if key in fixture_sources:
            assert source["source_extract_fixture"] == str(
                fixture_path.relative_to(ROOT)
            )
            extracted = fixture_sources[key]
            assert extracted["as_of"] == source["as_of"]
            assert extracted["source_sha256"] == source["source_sha256"]
            assert extracted["account_values_removed"] is True
            assert len(extracted["routes"]) == source["route_count"]
            assert _fixture_route_digest(extracted["routes"]) == source["route_digest"]
            assert [
                (
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    row[4],
                )
                for row in rows
            ] == [
                (
                    route["beneficiary_bic"],
                    route["beneficiary_name"],
                    route["currency"],
                    route["intermediary_bic"],
                    route["intermediary_name"],
                )
                for route in extracted["routes"]
            ]
