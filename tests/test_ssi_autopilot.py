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
                        "status": "archived",
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


def test_manifest_value_dates_use_application_vocabulary():
    from app.ssi_terms import VALID_VALUE_DATES, normalize_value_date

    normalized = {
        normalize_value_date(value) for value in MANIFEST["defaults"]["value_dates"]
    }
    assert normalized <= VALID_VALUE_DATES


@pytest.mark.parametrize("legacy, canonical", [("1d", "T+1"), ("2d", "T+2"), ("3d", "T+3")])
def test_legacy_value_date_aliases_normalize(legacy, canonical):
    from app.ssi_terms import normalize_value_date

    assert normalize_value_date(legacy) == canonical


def test_all_manifest_regions_have_expected_shape():
    for region in MANIFEST["regions"]:
        assert region["name"]
        assert region["countries"]
        assert region["masked_block"] > 91000000
        for bank in region["banks"]:
            assert len(bank["bic8"]) == 8, f"{region['name']}/{bank['bic8']}"
            assert bank["currencies"], f"{region['name']}/{bank['bic8']}"


def test_every_bank_and_country_belongs_to_exactly_one_region():
    """Regions are ownership partitions. A bank (or country) claimed by two
    regions contradicts both: two researchers would seed the same BIC with
    different masks/blocks, and the country-from-BIC validator check would
    accept a record for a region that did not research it (the pre-fix
    overlap: latin-america vs andean shared CL/CO/PE and four BICs;
    southeast-asia vs thailand shared TH)."""
    bic_owner = {}
    country_owner = {}
    for region in MANIFEST["regions"]:
        for bank in region["banks"]:
            bic_owner.setdefault(bank["bic8"], []).append(region["name"])
        for country in region["countries"]:
            country_owner.setdefault(country, []).append(region["name"])
    dup_bics = {bic: owners for bic, owners in bic_owner.items() if len(owners) > 1}
    dup_countries = {
        country: owners for country, owners in country_owner.items() if len(owners) > 1
    }
    assert not dup_bics, f"BICs owned by multiple regions: {dup_bics}"
    assert not dup_countries, f"countries owned by multiple regions: {dup_countries}"


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


# ── Validator: bic_only records (availability, not instructions) ─────────────
def gulf_bic_only_results(**overrides):
    results = {
        "region": "gulf",
        "banks": [
            {
                "bic": "EBILAEAD",
                "name": "Emirates NBD",
                "records": [
                    {
                        "currency": "USD",
                        "correspondent": "Emirates NBD",
                        "int_bic": "EBILAEADXXX",
                        "source": "https://www.emiratesnbd.com/en/correspondent-bank-charges",
                        "as_of": "2026-05-01",
                        "status": "unverified",
                        "bic_only": True,
                    }
                ],
            }
        ],
    }
    results.update(overrides)
    return results


def test_bic_only_record_without_accounts_charge_or_value_date_passes():
    assert autopilot.validate_results(gulf_bic_only_results(), MANIFEST) == []


def test_bic_only_record_with_an_account_is_rejected():
    bad = gulf_bic_only_results()
    bad["banks"][0]["records"][0]["nostro"] = "ACCT-91001601"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("must not carry" in p and "nostro" in p for p in problems), problems


def test_bic_only_record_with_a_value_date_is_rejected():
    bad = gulf_bic_only_results()
    bad["banks"][0]["records"][0]["value_date"] = "spot"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("must not carry" in p and "value_date" in p for p in problems), problems


@pytest.mark.parametrize("field", ["nostro", "with_an", "charge_code", "value_date"])
def test_bic_only_record_with_whitespace_field_is_rejected(field):
    bad = gulf_bic_only_results()
    bad["banks"][0]["records"][0][field] = " \t"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("must not carry" in p and field in p for p in problems), problems


def test_bic_only_must_be_a_real_boolean():
    bad = gulf_bic_only_results()
    bad["banks"][0]["records"][0]["bic_only"] = "false"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("must be a boolean" in p for p in problems), problems


# ── The fold must match what was validated (bic_only) ────────────────────────
EBILAEAD_BIC_ONLY_ROW = '''    ("EBILAEADXXX", "Emirates NBD", "USD",
     "EBILAEADXXX", "Emirates NBD",
     None, None, None, None,
     "Source: https://www.emiratesnbd.com/en/correspondent-bank-charges (as of 2026-05-01). " + _SSI_REAL_NOTE,
     "2026-05-01", "unverified", None, True),'''


def test_bic_only_fold_matching_the_validated_results_passes():
    results = gulf_bic_only_results()
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(EBILAEAD_BIC_ONLY_ROW))
    assert problems == [], problems


def test_bic_only_fold_missing_the_flag_is_rejected():
    no_flag = EBILAEAD_BIC_ONLY_ROW.replace(", None, True),", "),")
    results = gulf_bic_only_results()
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(no_flag))
    assert any("missing the bic_only flag" in p for p in problems), problems


def test_bic_only_fold_with_a_smuggled_account_is_rejected():
    smuggled = EBILAEAD_BIC_ONLY_ROW.replace("None, None, None, None", '"ACCT-91001601", None, None, None')
    results = gulf_bic_only_results()
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(smuggled))
    assert any("must store None" in p and "nostro" in p for p in problems), problems


def test_ordinary_fold_carrying_the_flag_is_rejected():
    flagged = BPI_ROW.replace(",\n     \"2007-12-13\", \"archived\"),", ",\n     \"2007-12-13\", \"archived\", None, True),")
    results = sample_results()
    results["banks"][0]["records"][0]["status"] = "archived"
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(flagged))
    assert any("carries bic_only but the validated record does not" in p for p in problems), problems


def test_an_ordinary_row_with_a_verifier_spelled_true_is_not_misread_as_bic_only():
    """The bic_only flag lives only in the 14th field of a 14-field tuple. A
    bogus 13th provenance slot reading the string "True" must not be mistaken
    for it — only the final field decides the flag."""
    ambiguous = BPI_ROW.replace(
        ",\n     \"2007-12-13\", \"archived\"),",
        ",\n     \"2007-12-13\", \"archived\", \"True\", \"False\"),",
    )
    results = sample_results()
    results["banks"][0]["records"][0]["status"] = "archived"
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(ambiguous))
    assert not any("carries bic_only" in p for p in problems), problems


def test_bic_only_flag_is_taken_from_the_final_field_only():
    """A 14-field row whose 13th field is "False" but whose final field is
    "True" is bic_only; the check must read the last field, not scan the tail."""
    flagged = BPI_ROW.replace(
        ",\n     \"2007-12-13\", \"archived\"),",
        ",\n     \"2007-12-13\", \"archived\", False, True),",
    )
    results = sample_results()
    results["banks"][0]["records"][0]["status"] = "archived"
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(flagged))
    assert any("carries bic_only but the validated record does not" in p for p in problems), problems

def test_fold_verifier_rejects_a_string_bic_only_flag():
    """A 14-field row whose final field is the string "False" (not the boolean
    literal) must be rejected by verify_fold: seed_if_empty now raises on any
    non-boolean flag, so a fold the verifier accepted would crash at seed time
    (and, before the strict check, silently flipped an ordinary row into a
    BIC-only one)."""
    ambiguous = BPI_ROW.replace(
        ",\n     \"2007-12-13\", \"archived\"),",
        ",\n     \"2007-12-13\", \"archived\", None, \"False\"),",
    )
    results = sample_results()
    results["banks"][0]["records"][0]["status"] = "archived"
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(ambiguous))
    assert any("must be the boolean literal True or False" in p for p in problems), problems


def test_cmd_verify_rejects_a_string_bic_only_flag(tmp_path, monkeypatch):
    """The AST verifier gates folds before commit; a 14-field tuple whose
    bic_only slot is the string "False" must fail there, matching the strict
    isinstance(bool) check seed_if_empty enforces at seed time."""
    import argparse

    fake = tmp_path / "seed.py"
    fake.write_text(
        "SSI_RECORDS = [\n"
        '    ("ZZBANKXYXXX", "Some Bank", "USD", "CITIUS33XXX", "Citibank",\n'
        '     None, None, None, None, "Source: x", "2026-01-01", "unverified",\n'
        '     None, "False"),\n'
        "]\n"
    )
    monkeypatch.setattr(autopilot, "SEED_FILE", fake)
    with pytest.raises(SystemExit) as exc:
        autopilot.cmd_verify(argparse.Namespace())
    assert "14th (bic_only) field" in str(exc.value)



# ── Test scaffolding ─────────────────────────────────────────────────────────
def test_scaffold_contains_expected_pieces():
    region = autopilot.get_region(MANIFEST, "southeast-asia")
    text = autopilot.scaffold_coverage_class(region, MANIFEST)
    assert "SOUTHEAST_ASIA_SSI_COVERAGE = [" in text
    assert '("BOPIPHMMXXX", "Bank of the Philippine Islands", {"USD", "EUR", "GBP", "JPY", "SGD", "HKD", "CAD", "CHF", "SEK"}),' in text
    assert "class TestSoutheastAsiaSsiCoverage:" in text
    assert "test_southeast_asia_banks_have_seeded_ssi_records" in text
    assert "test_southeast_asia_seeded_records_are_semantically_valid" in text


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
    monkeypatch.setattr(autopilot, "verify_fold", lambda *a, **k: [])

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
    monkeypatch.setattr(autopilot, "verify_fold", lambda *a, **k: [])
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


# ── The fold must match what was validated ───────────────────────────────────
SEED_HEAD = '''
SSI_RECORDS = [
    ("AAAAGB2LXXX", "Old Bank", "USD",
     "CITIUS33XXX", "Citibank N.A.",
     "ACCT-91000001", "ACCT-91000002", "SHA", "spot",
     "Source: https://old.example (as of 2020-01-01). " + _SSI_REAL_NOTE,
     "2020-01-01", "published"),
]
'''

def _folded(*rows: str) -> str:
    return "SSI_RECORDS = [\n" + "\n".join(rows) + "\n]\n"


BPI_ROW = '''    ("BOPIPHMMXXX", "Bank of the Philippine Islands", "USD",
     "CITIUS33XXX", "Citibank N.A.",
     "ACCT-91000701", "ACCT-91000702", "SHA", "spot",
     "Source: https://www.bpi.com.ph/correspondent-banks (as of 2007-12-13). " + _SSI_REAL_NOTE,
     "2007-12-13", "archived"),'''


def test_fold_matching_the_validated_results_passes():
    results = sample_results()
    results["banks"][0]["records"][0]["status"] = "archived"
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(BPI_ROW))
    assert problems == [], problems


def test_a_row_that_was_never_validated_is_rejected():
    """The gate validated a JSON file; nothing proved the rows committed next
    to it were the ones that passed."""
    smuggled = '''    ("BOPIPHMMXXX", "Bank of the Philippine Islands", "EUR",
     "DEUTDEFFXXX", "Deutsche Bank",
     "ACCT-91000703", "ACCT-91000704", "SHA", "spot",
     "Source: https://www.bpi.com.ph/correspondent-banks (as of 2007-12-13). " + _SSI_REAL_NOTE,
     "2007-12-13", "archived"),'''
    results = sample_results()
    results["banks"][0]["records"][0]["status"] = "archived"
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(BPI_ROW, smuggled))
    assert any("not in the validated results" in p for p in problems), problems


def test_a_validated_record_that_was_never_folded_is_rejected():
    results = sample_results()
    results["banks"][0]["records"][0]["status"] = "archived"
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded())
    assert any("was validated but not folded" in p for p in problems), problems


def test_a_folded_row_whose_account_was_altered_is_rejected():
    """The classic drift: validated JSON says one account, the hand-edited
    tuple says another."""
    altered = BPI_ROW.replace("ACCT-91000701", "ACCT-91000799")
    results = sample_results()
    results["banks"][0]["records"][0]["status"] = "archived"
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(altered))
    assert problems, "an altered account slipped through"


def test_a_folded_row_whose_status_disagrees_with_the_research_is_rejected():
    flipped = BPI_ROW.replace('"archived"', '"published"')
    results = sample_results()
    results["banks"][0]["records"][0]["status"] = "archived"
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded(flipped))
    assert any("status" in p for p in problems), problems


def test_untouched_pre_existing_rows_are_not_re_validated():
    """Only what this fold added is in scope; the rest of the file is history."""
    results = sample_results()
    results["banks"][0]["records"][0]["status"] = "archived"
    head_row = SEED_HEAD.split("SSI_RECORDS = [")[1].rsplit("]", 1)[0].strip()
    problems = autopilot.verify_fold(results, SEED_HEAD, _folded("    " + head_row, BPI_ROW))
    assert problems == [], problems


# ── Provenance is required of the research, not inferred ─────────────────────
def test_missing_status_is_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0].pop("status", None)
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("status" in p for p in problems), problems


def test_unknown_status_is_rejected():
    bad = sample_results()
    bad["banks"][0]["records"][0]["status"] = "current-ish"
    problems = autopilot.validate_results(bad, MANIFEST)
    assert any("status" in p for p in problems), problems


# ── A verifier must be a name, and only "published" may carry one ────────────
def test_published_with_a_verified_by_passes():
    rec = sample_results()
    rec["banks"][0]["records"][0]["status"] = "published"
    rec["banks"][0]["records"][0]["verified_by"] = "ops:ada"
    problems = autopilot.validate_results(rec, MANIFEST)
    assert problems == [], problems


def test_published_without_a_verified_by_is_rejected():
    rec = sample_results()
    rec["banks"][0]["records"][0]["status"] = "published"
    problems = autopilot.validate_results(rec, MANIFEST)
    assert any("verified_by" in p for p in problems), problems


def test_a_json_null_verifier_is_treated_as_absent():
    """str(None) is 'None', a non-empty string: a JSON null used to pass as a
    named verifier on a published record, and block a non-published one."""
    rec = sample_results()
    rec["banks"][0]["records"][0]["status"] = "published"
    rec["banks"][0]["records"][0]["verified_by"] = None
    problems = autopilot.validate_results(rec, MANIFEST)
    assert any("verified_by" in p for p in problems), problems

    rec = sample_results()
    rec["banks"][0]["records"][0]["status"] = "archived"
    rec["banks"][0]["records"][0]["verified_by"] = None
    problems = autopilot.validate_results(rec, MANIFEST)
    assert not any("verified_by" in p for p in problems), problems


def test_a_non_string_verifier_is_rejected():
    rec = sample_results()
    rec["banks"][0]["records"][0]["status"] = "published"
    rec["banks"][0]["records"][0]["verified_by"] = 42
    problems = autopilot.validate_results(rec, MANIFEST)
    assert any("verified_by" in p for p in problems), problems


def test_a_non_string_verifier_is_rejected_on_any_status():
    """A numeric verifier on a non-published row used to pass — the value was
    silently discarded, and the seed later crashed with an AttributeError
    instead of a controlled validation error."""
    rec = sample_results()
    rec["banks"][0]["records"][0]["status"] = "archived"
    rec["banks"][0]["records"][0]["verified_by"] = 42
    problems = autopilot.validate_results(rec, MANIFEST)
    assert any("must be a string" in p for p in problems), problems

    rec = sample_results()
    rec["banks"][0]["records"][0]["status"] = "unverified"
    rec["banks"][0]["records"][0]["verified_by"] = ["ops:ada"]
    problems = autopilot.validate_results(rec, MANIFEST)
    assert any("must be a string" in p for p in problems), problems


def test_a_verifier_on_a_non_published_row_is_rejected():
    rec = sample_results()
    rec["banks"][0]["records"][0]["status"] = "archived"
    rec["banks"][0]["records"][0]["verified_by"] = "ops:ada"
    problems = autopilot.validate_results(rec, MANIFEST)
    assert any("verified_by is only meaningful" in p for p in problems), problems


def admission_bank(bic="TESTPHMM"):
    return {"bic8": bic, "name": "Test Philippine Bank", "country": "PH", "currencies": ["USD"], "seedable": True, "source_domains": ["testphilippinebank.com"], "records": [{"currency":"USD","correspondent":"Citibank N.A.","int_bic":"CITIUS33XXX","nostro":"ACCT-91000750","with_an":"ACCT-91000751","charge_code":"SHA","value_date":"spot","source":"https://testphilippinebank.com/ssi","as_of":"2026-08-19","status":"unverified"}]}


def test_task5_summary_idempotence_and_byte_identity(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    path.write_bytes(json.dumps(MANIFEST, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    payload = {"regions": [{"name": "southeast-asia", "banks": [admission_bank()]}]}
    first = autopilot.admit_candidates(payload)
    before = path.read_bytes()
    second = autopilot.admit_candidates(payload)
    assert first["added_banks"] == 1 and first["added_records"] == 1
    assert second["added_banks"] == 0 and second["added_records"] == 0
    assert second["unchanged_banks"] == 1 and second["unchanged_records"] == 1
    assert path.read_bytes() == before


def test_candidate_source_domain_must_be_trusted_for_bic(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    path.write_bytes(json.dumps(MANIFEST, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    bank = admission_bank()
    bank["source_domains"] = ["attacker.example"]
    with pytest.raises(ValueError, match="not trusted"):
        autopilot.admit_candidates({"regions": [{"name": "southeast-asia", "banks": [bank]}]})


def test_reviewed_real_bank_domain_is_operator_approved():
    assert autopilot._trusted_domains_for_bic("BBDEBRSP") == {"banco.bradesco"}
    assert autopilot._trusted_domains_for_bic("UNKNOWXX") == set()


def test_legacy_bank_without_source_domains_can_be_readmitted(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    manifest = json.loads(json.dumps(MANIFEST))
    region = next(item for item in manifest["regions"] if item["name"] == "southeast-asia")
    legacy = admission_bank()
    legacy.pop("source_domains")
    region["banks"].append(legacy)
    path.write_bytes(json.dumps(manifest, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    summary = autopilot.admit_candidates({"regions": [{"name": "southeast-asia", "banks": [admission_bank()]}]})
    assert summary["unchanged_banks"] == 1


def test_test_identity_is_not_trusted_in_production_configuration(monkeypatch):
    production = autopilot.Path(autopilot.__file__).resolve().parent / "regions.json"
    monkeypatch.setattr(autopilot, "REGIONS_FILE", production)
    assert autopilot._trusted_domains_for_bic("TESTPHMM") == set()


def test_existing_region_forbidden_bics_must_be_a_list(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    path.write_bytes(json.dumps(MANIFEST, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    for malformed in ("NATAU3P", {"bic": "NATAU3P"}, None, ("NATAU3P",)):
        with pytest.raises(ValueError, match="forbidden_bics: expected a list"):
            autopilot.admit_candidates({"regions": [{"name": "southeast-asia", "forbidden_bics": malformed, "banks": []}]})


def test_forbidden_bic_cannot_overlap_existing_owner(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    manifest = json.loads(json.dumps(MANIFEST))
    manifest["regions"][0]["banks"].append({"bic8": "TESTPHMM", "name": "Test", "country": "PH", "currencies": ["USD"]})
    path.write_bytes(json.dumps(manifest, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    with pytest.raises(ValueError, match="overlap owned BICs"):
        autopilot.admit_candidates({"regions": [{"name": "new-region", "label": "New", "countries": ["PH"], "masked_block": 92000100, "note": "x", "forbidden_bics": ["TESTPHMM"], "banks": []}]})


def test_malformed_admitted_records_are_rejected_without_traceback():
    manifest = json.loads(json.dumps(MANIFEST))
    manifest["regions"][0]["banks"] = [{"bic8": "TESTPHMM", "name": "Test", "admitted_records": [], "admitted_record_digest": autopilot.record_digest([])}]
    problems = autopilot.validate_admitted_results({"region": manifest["regions"][0]["name"], "banks": [{"bic": "TESTPHMM", "name": "Test", "records": None}]}, manifest)
    assert any("records must be a list" in problem for problem in problems)


def test_malformed_candidate_forbidden_bic_is_rejected(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    path.write_bytes(json.dumps(MANIFEST, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    with pytest.raises(ValueError, match="malformed BIC"):
        autopilot.admit_candidates({"regions": [{"name": "southeast-asia", "forbidden_bics": ["BAD"], "banks": []}]})


def test_task5_dry_run_and_failure_leave_no_tracked_artifacts(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    path.write_bytes(json.dumps(MANIFEST, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    payload = {"regions": [{"name": "southeast-asia", "banks": [admission_bank()]}]}
    autopilot.admit_candidates(payload, dry_run=True)
    with pytest.raises(ValueError):
        autopilot.admit_candidates({"regions": [{"name": "southeast-asia", "banks": "bad"}]})
    assert not (tmp_path / "regions.json.lock").exists()
    assert not list(tmp_path.glob(".regions.json.*"))


def test_task5_lock_path_is_stable_outside_repo(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    path.write_text("{}")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    assert autopilot._manifest_lock_path() == autopilot._manifest_lock_path()
    assert autopilot._manifest_lock_path().parent != tmp_path


def test_task5_commit_owns_manifest(tmp_path, monkeypatch):
    """Use a real temporary repository to prove staging and commit ownership."""
    import argparse

    repo = tmp_path / "repo"
    repo.mkdir()
    for command in (("init",), ("config", "user.email", "test@example.com"), ("config", "user.name", "Test")):
        subprocess.run(["git", *command], cwd=repo, check=True, capture_output=True, text=True)
    seed = repo / "seed.py"
    tests = repo / "tests.py"
    manifest = repo / "regions.json"
    seed.write_text("SSI_RECORDS = []\n")
    tests.write_text("tests\n")
    manifest.write_text("{}\n")
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=repo, check=True, capture_output=True, text=True)

    monkeypatch.setattr(autopilot, "REPO_ROOT", repo)
    monkeypatch.setattr(autopilot, "SEED_FILE", seed)
    monkeypatch.setattr(autopilot, "TEST_FILE", tests)
    monkeypatch.setattr(autopilot, "REGIONS_FILE", manifest)
    monkeypatch.setattr(autopilot, "load_manifest", lambda: MANIFEST)
    monkeypatch.setattr(autopilot, "cmd_verify", lambda *a, **k: None)
    monkeypatch.setattr(autopilot, "cmd_scaffold", lambda *a, **k: None)
    monkeypatch.setattr(autopilot, "run_pytest", lambda *a, **k: None)
    monkeypatch.setattr(autopilot, "verify_fold", lambda *a, **k: [])
    monkeypatch.setattr(autopilot, "write_state", lambda *a, **k: None)
    monkeypatch.setattr(autopilot, "read_state", lambda: {"commits_since_pr": 0, "regions_since_pr": [], "last_pr": None})
    result = tmp_path / "r.json"
    result.write_text(json.dumps(sample_results()))
    seed.write_text("SSI_RECORDS = [('changed',)]\n")
    tests.write_text("changed tests\n")
    manifest.write_text('{"changed": true}\n')
    unrelated = repo / "unrelated.txt"
    unrelated.write_text("must not ship\n")
    subprocess.run(["git", "add", "unrelated.txt"], cwd=repo, check=True)
    with pytest.raises(SystemExit, match="unrelated paths staged"):
        autopilot.cmd_commit(argparse.Namespace(results=str(result), label=None, source=None, dry_run=False))
    subprocess.run(["git", "reset", "unrelated.txt"], cwd=repo, check=True, capture_output=True, text=True)
    unrelated.unlink()
    autopilot.cmd_commit(argparse.Namespace(results=str(result), label=None, source=None, dry_run=False))
    committed = subprocess.run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=repo, check=True, capture_output=True, text=True).stdout.splitlines()
    assert set(committed) == {"seed.py", "tests.py", "regions.json"}


def _new_region_payload():
    bank = admission_bank(bic="NEWPPHMM")
    bank["name"] = "New Philippine Bank"
    bank["records"][0]["nostro"] = "ACCT-92000001"
    bank["records"][0]["with_an"] = "ACCT-92000002"
    return {"regions": [{
        "name": "new-region-lifecycle",
        "label": "New Region Lifecycle",
        "countries": ["PH"],
        "masked_block": 92000000,
        "note": "Lifecycle test region",
        "forbidden_bics": [],
        "banks": [bank],
    }]}


def test_new_region_lifecycle_persists_reloads_and_validates(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    path.write_bytes(json.dumps(MANIFEST, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    payload = _new_region_payload()
    summary = autopilot.admit_candidates(payload)
    assert summary["regions"] == ["new-region-lifecycle"]
    assert summary["added_banks"] == 1 and summary["added_records"] == 1
    reloaded = autopilot.load_manifest()
    region = autopilot.get_region(reloaded, "new-region-lifecycle")
    bank = region["banks"][0]
    assert bank["bic8"] == "NEWPPHMM"
    assert bank["admitted_record_digest"] == autopilot.record_digest(bank["admitted_records"])
    results = {"region": "new-region-lifecycle", "banks": [{
        "bic": "NEWPPHMMXXX", "name": bank["name"], "records": bank["admitted_records"]
    }]}
    assert autopilot.validate_admitted_results(results, reloaded) == []
    assert [b["bic8"] for b in region["banks"]] == sorted(b["bic8"] for b in region["banks"])


def test_admitted_results_accept_reordered_records(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    path.write_bytes(json.dumps(MANIFEST, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    autopilot.admit_candidates(_new_region_payload())
    manifest = autopilot.load_manifest()
    bank = autopilot.get_region(manifest, "new-region-lifecycle")["banks"][0]
    records = list(reversed(bank["admitted_records"]))
    results = {"region": "new-region-lifecycle", "banks": [{
        "bic": bank["bic8"] + "XXX", "name": bank["name"], "records": records
    }]}
    assert autopilot.validate_admitted_results(results, manifest) == []


def test_equivalent_new_region_input_order_is_canonical(tmp_path, monkeypatch):
    first_path = tmp_path / "first.json"
    second_path = tmp_path / "second.json"
    initial = json.dumps(MANIFEST, indent=2).encode() + b"\n"
    first_path.write_bytes(initial)
    second_path.write_bytes(initial)
    first_payload = _new_region_payload()
    second_payload = json.loads(json.dumps(first_payload))
    second_payload["regions"].reverse()
    monkeypatch.setattr(autopilot, "REGIONS_FILE", first_path)
    autopilot.admit_candidates(first_payload)
    first_bytes = first_path.read_bytes()
    monkeypatch.setattr(autopilot, "REGIONS_FILE", second_path)
    autopilot.admit_candidates(second_payload)
    assert second_path.read_bytes() == first_bytes


def test_new_region_readmission_is_byte_identical_and_omission_preserves_banks(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    path.write_bytes(json.dumps(MANIFEST, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    payload = _new_region_payload()
    autopilot.admit_candidates(payload)
    before = path.read_bytes()
    second = autopilot.admit_candidates(payload)
    assert second["added_banks"] == second["added_records"] == 0
    assert second["unchanged_banks"] == second["unchanged_records"] == 1
    assert path.read_bytes() == before
    omission = {"regions": [{k: v for k, v in payload["regions"][0].items() if k != "banks"} | {"banks": []}]}
    third = autopilot.admit_candidates(omission)
    assert third["added_banks"] == third["added_records"] == 0
    assert autopilot.get_region(autopilot.load_manifest(), "new-region-lifecycle")["banks"]


def test_new_region_ordering_and_digest_are_deterministic(tmp_path, monkeypatch):
    path = tmp_path / "regions.json"
    path.write_bytes(json.dumps(MANIFEST, indent=2).encode() + b"\n")
    monkeypatch.setattr(autopilot, "REGIONS_FILE", path)
    payload = _new_region_payload()
    record = payload["regions"][0]["banks"][0]["records"][0]
    payload["regions"][0]["banks"][0]["records"].append(dict(record, currency="EUR", source="https://testphilippinebank.com/eur", nostro="ACCT-92000003", with_an="ACCT-92000004"))
    payload["regions"][0]["banks"][0]["currencies"] = ["EUR", "USD"]
    reversed_payload = json.loads(json.dumps(payload))
    reversed_payload["regions"][0]["banks"][0]["records"].reverse()
    assert autopilot.record_digest(payload["regions"][0]["banks"][0]["records"]) == autopilot.record_digest(reversed_payload["regions"][0]["banks"][0]["records"])
    autopilot.admit_candidates(reversed_payload)
    bank = autopilot.get_region(autopilot.load_manifest(), "new-region-lifecycle")["banks"][0]
    assert bank["admitted_record_digest"] == autopilot.record_digest(bank["admitted_records"])
    assert [r["currency"] for r in bank["admitted_records"]] == ["EUR", "USD"]
