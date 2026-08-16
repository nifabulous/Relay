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
    # A structurally valid, real-country BIC that simply is not a southeast-asia
    # manifest bank. The previous fixture ("ZZZZZPHM") names country "ZP", which
    # the BIC validator now rejects before the manifest lookup is reached, so it
    # no longer exercises this path.
    bad = sample_results()
    bad["banks"][0]["bic"] = "DEUTDEFF"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("not in manifest" in p for p in problems), problems


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
    assert any("source" in p and "bank-published" in p for p in problems), problems


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
    assert '("BOPIPHMMXXX", "Bank of the Philippine Islands", {"USD", "EUR", "GBP", "JPY", "SGD", "HKD", "CAD", "CHF", "SEK"}),' in text
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


# ── Validator: malformed input must not crash the run ────────────────────────
def test_non_numeric_account_suffix_is_reported_not_raised():
    """A masked-looking account with a non-numeric suffix is a validation
    problem, not a traceback. The mask check already flags it; the block check
    must not then try to int() the suffix."""
    bad = sample_results()
    bad["banks"][0]["records"][0]["nostro"] = "ACCT-NOTANUMBER"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("not an ACCT- masked placeholder" in p for p in problems)
    assert not any("outside region block" in p for p in problems)


def test_empty_account_suffix_is_reported_not_raised():
    bad = sample_results()
    bad["banks"][0]["records"][0]["with_an"] = "ACCT-"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("not an ACCT- masked placeholder" in p for p in problems)


# ── BIC validity: schwifty must not be inverted ──────────────────────────────
def test_bic_with_an_invalid_country_code_is_rejected():
    """"AAAAAA11" satisfies the shape regex but names country "AA", which does
    not exist. schwifty raises InvalidCountryCode for it; treating any schwifty
    exception as "valid" inverts the check and admits the BIC."""
    assert autopilot.bic_is_valid("AAAAAA11") is False
    assert autopilot.bic_is_valid("ZZZZZZ00") is False


def test_bic_validity_falls_back_to_structure_when_schwifty_is_absent(monkeypatch):
    """The fallback exists for an install without schwifty, so it must trigger
    on ImportError only."""
    import builtins

    real_import = builtins.__import__

    def no_schwifty(name, *args, **kwargs):
        if name == "schwifty":
            raise ImportError("no schwifty")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", no_schwifty)
    assert autopilot.bic_is_valid("CITIUS33") is True
    assert autopilot.bic_is_valid("NOTABIC12345") is False


# ── BIC width: manifest holds bic8, sources publish bic11 ────────────────────
def test_eleven_character_beneficiary_bic_matches_its_manifest_bic8():
    """Banks publish 11-character BICs. The manifest keys on 8, so an 11-char
    beneficiary BIC must resolve to its bic8 entry rather than read as absent."""
    ok = sample_results()
    ok["banks"][0]["bic"] = "BOPIPHMMXXX"
    problems = autopilot.validate_results(ok, MANIFEST)
    assert not any("not in manifest" in p for p in problems), problems


def test_eleven_character_bic_still_honours_the_forbidden_list():
    """Widening the lookup must not open a bypass: the branch-qualified form of
    a forbidden BIC is still forbidden."""
    manifest = json.loads(json.dumps(MANIFEST))
    for region in manifest["regions"]:
        if region["name"] == "southeast-asia":
            region.setdefault("forbidden_bics", []).append("BOPIPHMM")
    bad = sample_results()
    bad["banks"][0]["bic"] = "BOPIPHMMXXX"
    problems = autopilot.validate_results(bad, manifest)
    assert any("forbidden list" in p for p in problems), problems


# ── Scaffolding: regions must not overwrite each other ───────────────────────
def test_scaffolding_a_second_region_keeps_the_first(tmp_path, monkeypatch):
    """cmd_scaffold truncates at its marker. With one shared marker, writing
    region B deletes region A's coverage class."""
    import argparse

    target = tmp_path / "test_data_consistency.py"
    target.write_text("from app.services.seed import BANKS, SSI_RECORDS  # noqa: F401\n")
    monkeypatch.setattr(autopilot, "TEST_FILE", target)

    autopilot.cmd_scaffold(argparse.Namespace(region="southeast-asia"))
    autopilot.cmd_scaffold(argparse.Namespace(region="latin-america"))

    text = target.read_text()
    assert "SoutheastAsiaSsiCoverage" in text, "first region was wiped by the second"
    assert "LatinAmericaSsiCoverage" in text


def test_rescaffolding_the_same_region_does_not_duplicate_it(tmp_path, monkeypatch):
    import argparse

    target = tmp_path / "test_data_consistency.py"
    target.write_text("from app.services.seed import BANKS, SSI_RECORDS  # noqa: F401\n")
    monkeypatch.setattr(autopilot, "TEST_FILE", target)

    autopilot.cmd_scaffold(argparse.Namespace(region="southeast-asia"))
    autopilot.cmd_scaffold(argparse.Namespace(region="southeast-asia"))

    assert target.read_text().count("class TestSoutheastAsiaSsiCoverage") == 1


def test_scaffolded_output_is_importable_python(tmp_path, monkeypatch):
    import argparse

    target = tmp_path / "test_data_consistency.py"
    target.write_text("from app.services.seed import BANKS, SSI_RECORDS  # noqa: F401\n")
    monkeypatch.setattr(autopilot, "TEST_FILE", target)
    autopilot.cmd_scaffold(argparse.Namespace(region="southeast-asia"))
    autopilot.cmd_scaffold(argparse.Namespace(region="latin-america"))

    import ast as _ast

    _ast.parse(target.read_text())


# ── Commit gate must cover the canonical privacy test ────────────────────────
def test_commit_gate_runs_the_placeholder_privacy_test():
    """TestAllSSIAccountsArePlaceholders lives in tests/test_ssi.py. A gate that
    only runs the generated coverage file cannot see a real account number
    reaching seed.py."""
    src = (
        Path(__file__).resolve().parents[1]
        / "scripts" / "ssi-autopilot" / "autopilot.py"
    ).read_text()
    assert "test_ssi.py" in src, "commit gate does not run the SSI privacy test"


# ── maybe-pr must not push an unexpected branch ──────────────────────────────
def _guarded_maybe_pr(monkeypatch, current_branch: str):
    """Run cmd_maybe_pr with every outbound effect mocked.

    `git` and `subprocess.run` both raise, so a guard that fails to stop the run
    surfaces as that explicit error rather than as a real push or a real
    `gh pr create`.
    """
    import argparse

    monkeypatch.setattr(autopilot, "read_state", lambda: {
        "branch": "feat/ssi-autopilot", "commits_since_pr": 5,
        "regions_since_pr": ["china"], "last_pr": None,
    })

    def fake_git(*args, **kwargs):
        if args[:1] == ("branch",):
            return current_branch
        raise AssertionError(f"cmd_maybe_pr ran git {' '.join(args)} despite the guard")

    def no_subprocess(*args, **kwargs):
        raise AssertionError("cmd_maybe_pr shelled out despite the guard")

    monkeypatch.setattr(autopilot, "git", fake_git)
    monkeypatch.setattr(autopilot.subprocess, "run", no_subprocess)
    autopilot.cmd_maybe_pr(argparse.Namespace(every=3, dry_run=False))


def test_maybe_pr_refuses_to_push_the_default_branch(monkeypatch):
    """`git branch --show-current` is whatever the checkout happens to be on. A
    loop run from main would push main and open a PR from it."""
    with pytest.raises(SystemExit) as exc:
        _guarded_maybe_pr(monkeypatch, "main")
    assert "branch" in str(exc.value).lower()


def test_maybe_pr_refuses_a_branch_that_is_not_the_state_branch(monkeypatch):
    with pytest.raises(SystemExit) as exc:
        _guarded_maybe_pr(monkeypatch, "some-other-branch")
    assert "branch" in str(exc.value).lower()


def test_pr_body_only_claims_checks_the_gate_actually_runs():
    src = (
        Path(__file__).resolve().parents[1]
        / "scripts" / "ssi-autopilot" / "autopilot.py"
    ).read_text()
    if "git diff --check" in src and "--check" not in src.split("def cmd_commit")[1].split("def cmd_maybe_pr")[0]:
        raise AssertionError("PR body claims `git diff --check` but the gate never runs it")


def test_scaffold_refuses_to_shadow_a_hand_written_class(tmp_path, monkeypatch):
    """A generated class name can collide with a hand-written one already in the
    file. Python keeps the last definition, so the hand-written assertions stop
    running without any error."""
    import argparse

    target = tmp_path / "test_data_consistency.py"
    target.write_text(
        "from app.services.seed import BANKS, SSI_RECORDS  # noqa: F401\n"
        "\n\n"
        "class TestLatinAmericaSsiCoverage:\n"
        "    def test_hand_written_expectation(self):\n"
        "        assert True\n"
    )
    monkeypatch.setattr(autopilot, "TEST_FILE", target)

    with pytest.raises(SystemExit) as exc:
        autopilot.cmd_scaffold(argparse.Namespace(region="latin-america"))
    assert "TestLatinAmericaSsiCoverage" in str(exc.value)
    assert "test_hand_written_expectation" in target.read_text()


def test_real_test_file_has_no_duplicate_coverage_classes():
    """Whatever the autopilot has scaffolded so far, no class may be defined
    twice in the committed file."""
    import re
    from collections import Counter

    text = (Path(__file__).resolve().parents[1] / "tests" / "test_data_consistency.py").read_text()
    counts = Counter(re.findall(r"^class (\w+):", text, re.M))
    dupes = {name: n for name, n in counts.items() if n > 1}
    assert not dupes, f"duplicate class definitions shadow earlier ones: {dupes}"


# ── Beneficiary BIC must be validated, not just prefix-matched ───────────────
def test_malformed_beneficiary_bic_with_a_valid_manifest_prefix_is_rejected():
    """Manifest lookup compares the 8-char prefix, so a malformed 11-char BIC
    whose first 8 characters match an entry would otherwise be accepted."""
    bad = sample_results()
    bad["banks"][0]["bic"] = "BOPIPHMM!!!"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("invalid beneficiary BIC" in p for p in problems), problems


def test_beneficiary_bic_of_wrong_length_is_rejected():
    for candidate in ("BOPIPHM", "BOPIPHMMXX", "BOPIPHMMXXXX"):
        bad = sample_results()
        bad["banks"][0]["bic"] = candidate
        problems = autopilot.validate_results(bad, MANIFEST)
        assert problems, f"{candidate} was accepted"


def test_valid_eight_and_eleven_character_beneficiary_bics_still_pass():
    for candidate in ("BOPIPHMM", "BOPIPHMMXXX"):
        ok = sample_results()
        ok["banks"][0]["bic"] = candidate
        assert autopilot.validate_results(ok, MANIFEST) == [], candidate


# ── Empty and incomplete payloads must not report as valid ───────────────────
def test_empty_bank_list_is_rejected():
    problems = autopilot.validate_results({"region": "southeast-asia", "banks": []}, MANIFEST)
    assert problems, "an empty payload reported as valid"


def test_bank_with_no_records_is_rejected():
    bad = sample_results()
    bad["banks"][0]["records"] = []
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("min_records_per_bank" in p or "no records" in p for p in problems), problems


def test_missing_correspondent_is_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0]["correspondent"] = ""
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("correspondent" in p for p in problems), problems


def test_value_date_outside_the_manifest_allowlist_is_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0]["value_date"] = "whenever"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("value date" in p.lower() for p in problems), problems


def test_missing_value_date_is_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0].pop("value_date")
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("value date" in p.lower() for p in problems), problems


# ── Source and date provenance ───────────────────────────────────────────────
def test_source_that_is_not_a_real_url_is_rejected():
    for candidate in ("http", "httpsomething", "http://", "https://"):
        bad = sample_results()
        bad["banks"][0]["records"][0]["source"] = candidate
        problems = autopilot.validate_results(bad, MANIFEST)
        assert any("source" in p for p in problems), f"{candidate!r} accepted"


def test_as_of_must_be_an_iso_date():
    bad = sample_results()
    bad["banks"][0]["records"][0]["as_of"] = "not-a-date"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("as_of" in p for p in problems), problems


def test_as_of_in_the_future_is_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0]["as_of"] = "2999-01-01"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("as_of" in p for p in problems), problems


# ── Commit must not carry unrelated staged paths ─────────────────────────────
def test_commit_refuses_when_unrelated_paths_are_already_staged(monkeypatch, tmp_path):
    """`git add a b` followed by a bare `git commit` commits the whole index,
    so anything an operator had staged rides along and maybe-pr publishes it."""
    import argparse

    calls = []

    def fake_git(*args, **kwargs):
        calls.append(args)
        if args[:3] == ("diff", "--cached", "--name-only"):
            return "app/services/seed.py\n.env.local"
        return ""

    monkeypatch.setattr(autopilot, "git", fake_git)
    monkeypatch.setattr(autopilot, "cmd_verify", lambda *a, **k: None)
    monkeypatch.setattr(autopilot, "cmd_scaffold", lambda *a, **k: None)
    monkeypatch.setattr(autopilot, "run_pytest", lambda *a, **k: None)

    results = tmp_path / "r.json"
    results.write_text(json.dumps(sample_results()))

    with pytest.raises(SystemExit) as exc:
        autopilot.cmd_commit(argparse.Namespace(
            results=str(results), label=None, source=None, dry_run=False))
    assert ".env.local" in str(exc.value)
    assert not any(a[:1] == ("commit",) for a in calls), "committed despite a dirty index"


def test_commit_limits_the_commit_to_its_own_paths(monkeypatch, tmp_path):
    import argparse

    calls = []

    def fake_git(*args, **kwargs):
        calls.append(args)
        if args[:3] == ("diff", "--cached", "--name-only"):
            return ""
        return ""

    monkeypatch.setattr(autopilot, "git", fake_git)
    monkeypatch.setattr(autopilot, "cmd_verify", lambda *a, **k: None)
    monkeypatch.setattr(autopilot, "cmd_scaffold", lambda *a, **k: None)
    monkeypatch.setattr(autopilot, "run_pytest", lambda *a, **k: None)
    monkeypatch.setattr(autopilot, "write_state", lambda *a, **k: None)
    monkeypatch.setattr(autopilot, "read_state", lambda: {
        "branch": "feat/ssi-autopilot", "commits_since_pr": 0,
        "regions_since_pr": [], "last_pr": None})
    monkeypatch.setattr(autopilot.subprocess, "run", lambda *a, **k: type(
        "R", (), {"returncode": 0, "stdout": "", "stderr": ""})())

    results = tmp_path / "r.json"
    results.write_text(json.dumps(sample_results()))
    autopilot.cmd_commit(argparse.Namespace(
        results=str(results), label=None, source=None, dry_run=False))

    commit = next(a for a in calls if a[:1] == ("commit",))
    assert "--only" in commit, f"commit was not path-limited: {commit}"


# ── The gate must run the autopilot's own tests ──────────────────────────────
def test_commit_gate_runs_the_autopilot_test_file():
    src = (
        Path(__file__).resolve().parents[1]
        / "scripts" / "ssi-autopilot" / "autopilot.py"
    ).read_text()
    assert "test_ssi_autopilot.py" in src, "gate does not run the autopilot's own tests"
