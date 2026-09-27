"""Regression coverage for the 2026-09-27 source-backed SSI expansion."""

import json
from pathlib import Path

from app.services.seed import SSI_RECORDS

LEDGER_NAMES = (
    "seed_ssi_au_csb_20260921.json",
    "seed_ssi_bhutan_national_bank_current_20260921.json",
    "seed_ssi_mbh_bank_20241024.json",
    "seed_ssi_central_bank_armenia_20260921.json",
    "seed_ssi_bank_of_baroda_treasury_20260921.json",
    "seed_ssi_axis_partner_banks_20260921.json",
    "seed_ssi_postfinance_20250501.json",
    "seed_ssi_deutsche_seoul_local_20251014.json",
    "seed_ssi_nbg_cyprus_20260921.json",
    "seed_ssi_garanti_international_20260127.json",
    "seed_ssi_uco_treasury_branch_20260409.json",
    "seed_ssi_otp_hungary_20260101.json",
    "seed_ssi_dcb_sib_karnataka_20260921.json",
    "seed_ssi_berliner_sparkasse_20260424.json",
    "seed_ssi_equitas_indusind_grd_20250921.json",
    "seed_ssi_butterfield_guernsey_20230706.json",
    "seed_ssi_basic_bank_current_20260720.json",
    "seed_ssi_bengal_commercial_bank_20241231.json",
    "seed_ssi_crystalbank_20260801.json",
    "seed_ssi_octobank_current_20250921.json",
)


def _ledger_records() -> list[list[object]]:
    services = Path(__file__).parents[1] / "app" / "services"
    records: list[list[object]] = []
    for name in LEDGER_NAMES:
        payload = json.loads((services / name).read_text(encoding="utf-8"))
        records.extend(payload["ssi_records"])
    return records


def test_continuous_20260927_ledgers_are_loaded_as_bic_only_routes():
    expected = {
        (record[0], record[2], record[3]): record[9]
        for record in _ledger_records()
    }
    actual = {
        (record[0], record[2], record[3]): record
        for record in SSI_RECORDS
        if (record[0], record[2], record[3]) in expected
    }

    assert len(expected) == 306
    assert set(expected) <= set(actual)
    assert all(expected[key].split("Source: ", 1)[1].split(" ", 1)[0] in actual[key][9] for key in expected)
    assert all(actual[key][11] == "unverified" for key in expected)
    assert all(actual[key][13] is True and actual[key][14] is False for key in expected)
    assert all(all(actual[key][position] is None for position in range(5, 9)) for key in expected)
