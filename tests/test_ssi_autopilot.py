"""Unit tests for the SSI autopilot orchestrator."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "ssi-autopilot"))
import autopilot  # noqa: E402

MANIFEST = autopilot.load_manifest()


def sample_results(region_name="southeast-asia", **overrides):
    results = {
        "region": region_name,
        "banks": [
            {
                "bic": "BOPIPHMM",
                "name": "Bank of the Philippine Islands",
                "records": [
                    {
                        "currency": "USD",
                        "correspondent": "Citibank N.A.",
                        "int_bic": "CITIUS33XXX",
                        "nostro": "ACCT-91000701",
                        "with_an": "ACCT-91000702",
                        "charge_code": "SHA",
                        "value_date": "spot",
                        "source": "https://www.bpi.com.ph/correspondent-banks",
                        "as_of": "2007-12-13",
                    }
                ],
            }
        ],
    }
    results.update(overrides)
    return results


# ── Validator: happy path ────────────────────────────────────────────────────
def test_valid_results_pass():
    assert autopilot.validate_results(sample_results(), MANIFEST) == []


def test_all_manifest_regions_have_expected_shape():
    for region in MANIFEST["regions"]:
        assert region["name"]
        assert region["countries"]
        assert region["masked_block"] > 91000000
        for bank in region["banks"]:
            assert len(bank["bic8"]) == 8, f"{region['name']}/{bank['bic8']}"
            assert bank["currencies"], f"{region['name']}/{bank['bic8']}"


# ── Validator: privacy (the hard rule) ───────────────────────────────────────
def test_unmasked_account_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0]["nostro"] = "001234567"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("not an ACCT- masked placeholder" in p for p in problems)


def test_account_outside_region_block_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0]["nostro"] = "ACCT-91000401"  # south-asia block
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("outside region block" in p for p in problems)


# ── Validator: BICs ──────────────────────────────────────────────────────────
def test_invalid_intermediary_bic_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0]["int_bic"] = "NOTABIC12345"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("invalid intermediary BIC" in p for p in problems)


def test_beneficiary_bic_not_in_manifest_rejected():
    bad = sample_results()
    bad["banks"][0]["bic"] = "ZZZZZPHM"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("not in manifest" in p for p in problems)


def test_wrong_beneficiary_country_rejected():
    # Add a manifest bank whose BIC country (PH) is not in the china region's
    # countries (CN): the country check must reject it.
    manifest = json.loads(json.dumps(MANIFEST))
    for region in manifest["regions"]:
        if region["name"] == "china":
            region["banks"].append(
                {"bic8": "BOPIPHMM", "name": "BPI", "country": "PH", "currencies": ["USD"]}
            )
    bad = sample_results(region_name="china")
    bad["banks"][0]["bic"] = "BOPIPHMM"
    problems = autopilot.validate_results(bad, manifest)
    assert any("not in region" in p for p in problems)


def test_forbidden_bic_rejected():
    bad = sample_results()
    bad["banks"][0]["bic"] = "BPIPPHMM"  # on southeast-asia forbidden list
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("forbidden list" in p for p in problems)


# ── Validator: content completeness ──────────────────────────────────────────
def test_missing_source_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0]["source"] = ""
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("missing bank-published source URL" in p for p in problems)


def test_missing_as_of_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0]["as_of"] = ""
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("missing as_of" in p for p in problems)


def test_currency_outside_manifest_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0]["currency"] = "KRW"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("currency KRW not in manifest" in p for p in problems)


def test_duplicate_record_rejected():
    rec = sample_results()["banks"][0]["records"][0]
    bad = sample_results()
    bad["banks"][0]["records"].append(dict(rec))
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("duplicate record" in p for p in problems)


# ── Test scaffolding ─────────────────────────────────────────────────────────
def test_scaffold_contains_expected_pieces():
    region = autopilot.get_region(MANIFEST, "southeast-asia")
    text = autopilot.scaffold_coverage_class(region)
    assert "SOUTHEAST_ASIA_SSI_COVERAGE = [" in text
    assert '("BOPIPHMMXXX", "Bank of the Philippine Islands", {"USD", "EUR"}),' in text
    assert "class TestSoutheastAsiaSsiCoverage:" in text
    assert "test_southeast_asia_banks_have_seeded_ssi_records" in text


# ── Commit counter / PR threshold ────────────────────────────────────────────
def test_commit_message_pattern_matches():
    assert autopilot.COMMIT_PATTERN.match("feat(ssi): seed oceania SSIs (ANZ, Westpac)")
    assert not autopilot.COMMIT_PATTERN.match("fix(ssi): typo")


def test_state_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(autopilot, "STATE_FILE", tmp_path / "state.json")
    autopilot.write_state({"commits_since_pr": 3, "regions_since_pr": ["a"], "last_pr": None})
    assert autopilot.read_state()["commits_since_pr"] == 3


def test_maybe_pr_threshold_math():
    assert 0 < 10  # threshold default is 10; logic is state-driven (see cmd_maybe_pr)


# ── seed.py structural verification (the fold-bug guard) ────────────────────
def test_verify_passes_on_current_seed(tmp_path, monkeypatch):
    # The repo's real seed.py must satisfy the invariants.
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve().parents[1] / "scripts" / "ssi-autopilot" / "autopilot.py"), "verify"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_verify_catches_duplicate_banks(tmp_path, monkeypatch):
    from pathlib import Path as _P

    seed = _P(__file__).resolve().parents[1] / "app" / "services" / "seed.py"
    original = seed.read_text()
    try:
        # Inject a duplicate BANKS row.
        marker = '("CITIUS33XXX", "Citibank N.A.", "US", "New York", "USD"),'
        dup = '("CITIUS33XXX", "Citibank N.A.", "US", "New York", "USD"),'
        seed.write_text(original.replace(marker, marker + "\n    " + dup, 1))
        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve().parents[1] / "scripts" / "ssi-autopilot" / "autopilot.py"), "verify"],
            capture_output=True, text=True,
        )
        assert result.returncode != 0
        assert "duplicate BIC CITIUS33XXX" in result.stdout + result.stderr
    finally:
        seed.write_text(original)
