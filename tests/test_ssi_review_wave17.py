import hashlib
import json
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi
from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]


def _row_to_ssi(row):
    provenance = list(row[10:])
    return SSI(
        beneficiary_bic=row[0],
        beneficiary_bank_name=row[1],
        currency=row[2],
        intermediary_bic=row[3],
        intermediary_bank_name=row[4],
        intermediary_account=row[5],
        beneficiary_account=row[6],
        charge_code=row[7],
        value_date=row[8],
        notes=row[9],
        as_of=provenance[0] if provenance else None,
        status=provenance[1] if len(provenance) > 1 else "illustrative",
        verified_by=provenance[2] if len(provenance) > 2 else None,
        bic_only=provenance[3] if len(provenance) > 3 else False,
        terms_inferred=provenance[4] if len(provenance) > 4 else False,
    )


def test_wave17_redacted_source_extract_and_terms_are_consistent():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave17-btrlro22-2026-09-08.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "BTRLRO22"
    )
    route_fields = [
        {
            "currency": route["currency"],
            "int_bic": route["int_bic"],
            "correspondent": route["correspondent"],
            "nostro_mask": route["nostro"],
            "with_an_mask": route["with_an"],
            "terms_inferred": route["terms_inferred"],
        }
        for route in bank["admitted_records"]
    ]
    payload = json.dumps(route_fields, sort_keys=True, separators=(",", ":"))
    assert hashlib.sha256(payload.encode()).hexdigest() == evidence["source_route_digest"]
    assert route_fields == evidence["routes"]
    assert all(route["terms_inferred"] is True for route in route_fields)
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    trusted = json.loads((ROOT / "scripts/ssi-autopilot/trusted_identities.json").read_text())
    assert trusted["BTRLRO22"]["settlement_terms_published"] is False


def test_wave17_inferred_routes_are_excluded_by_the_selection_guard():
    rows = [row for row in SSI_RECORDS if row[0] == "BTRLRO22XXX"]
    assert len(rows) == 20
    assert all(row[14] is True for row in rows)
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in rows)
