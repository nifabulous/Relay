import json
import re
from pathlib import Path

from schwifty import BIC

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app" / "services" / "seed_ssi_europe_americas_wave2_20260920.json"
MANIFEST = ROOT / "scripts" / "ssi-autopilot" / "evidence" / "ssi-europe-americas-wave2-2026-09-20.json"

ISO_CURRENCIES = {
    "AED", "AUD", "BGN", "BHD", "BRL", "BWP", "CAD", "CHF", "CLP", "CNY",
    "CZK", "DKK", "DZD", "EGP", "EUR", "GBP", "GHS", "HKD", "HUF", "IDR",
    "ILS", "INR", "ISK", "JOD", "JPY", "KES", "KRW", "KWD", "KZT", "LKR",
    "MAD", "MUR", "MXN", "MYR", "NGN", "NOK", "NZD", "OMR", "PEN", "PHP",
    "PKR", "PLN", "QAR", "RON", "RSD", "RUB", "SAR", "SEK", "SGD", "THB",
    "TND", "TRY", "TZS", "UAH", "UGX", "USD", "ZAR", "ZMW",
}

def test_wave2_exact_source_parity_and_bic_only_contract():
    payload = json.loads(LEDGER.read_text())
    manifest = json.loads(MANIFEST.read_text())
    rows = payload["ssi_records"]
    assert payload["source_prs"] == []
    assert payload["banks"] == []
    assert len(rows) == 130
    keys = {(row[0], row[2], row[3]) for row in rows}
    assert len(keys) == len(rows)
    assert manifest["source_snapshot"]["route_count"] == len(rows)
    assert manifest["source_snapshot"]["new_route_count"] == len(rows)
    assert manifest["scope"]["included_route_count"] == len(rows)
    manifest_keys = {
        (beneficiary, route["currency"], route["int_bic"])
        for beneficiary, routes in manifest["routes_by_beneficiary"].items()
        for route in routes
    }
    assert manifest_keys == keys
    source_counts = {source["beneficiary_bic"]: source["route_count"] for source in manifest["sources"]}
    assert source_counts == {
        beneficiary: sum(1 for row in rows if row[0] == beneficiary)
        for beneficiary in source_counts
    }
    bic_re = re.compile(r"^[A-Z0-9]{8}([A-Z0-9]{3})$")
    for row in rows:
        beneficiary, _name, currency, intermediary = row[:4]
        assert bic_re.fullmatch(beneficiary)
        assert bic_re.fullmatch(intermediary)
        BIC(beneficiary)
        BIC(intermediary)
        assert currency in ISO_CURRENCIES
        assert all(row[index] is None for index in (5, 6, 7, 8, 12))
        assert row[11] == "unverified"
        assert row[13] is True and row[14] is False

