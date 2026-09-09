import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def test_wave16_source_snapshot_covers_all_bic_only_routes():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave16-firnzajj-2026-09-08.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "FIRNZAJJ"
    )
    actual = {
        (route["currency"], route["int_bic"]): route["correspondent"]
        for route in bank["admitted_records"]
    }
    expected = {
        (route["currency"], route["int_bic"]): route["correspondent"]
        for route in evidence["routes"]
    }
    assert actual == expected
    assert all(route["bic_only"] is True for route in evidence["routes"])
    assert all(route["terms_inferred"] is False for route in evidence["routes"])
    assert evidence["source_snapshot"]["source_sha256"] == evidence["source_sha256"]
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False


def test_wave16_source_host_is_trusted_for_fnb():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave16-firnzajj-2026-09-08.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "FIRNZAJJ"
    )
    trusted = json.loads(
        (ROOT / "scripts/ssi-autopilot/trusted_identities.json").read_text()
    )
    source_host = urlparse(evidence["source"]).hostname
    assert any(
        source_host == domain or source_host.endswith("." + domain)
        for domain in bank["source_domains"]
    )
    assert any(
        source_host == domain or source_host.endswith("." + domain)
        for domain in trusted["FIRNZAJJ"]["domains"]
    )
    assert set(bank["source_domains"]) == set(trusted["FIRNZAJJ"]["domains"])
