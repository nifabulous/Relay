#!/usr/bin/env python3
"""
SSI autopilot — deterministic orchestrator for the SSI research-and-fold loop.

The model does the research (web search, OCR-typo judgment, paywall triage);
this script does everything that must be deterministic and repeatable:

  validate    — strict gate on research results BEFORE they touch seed.py
  scaffold    — generate the region coverage test class
  commit      — stage seed.py + tests, run the gate, commit with the standard
                message, bump the commit counter
  maybe-pr    — when the counter reaches N, push and open a PR

Rules this enforces (the standing constraints, mechanically):
  - Every SSI record carries a bank-published source citation.
  - Account numbers are ALWAYS masked as ACCT- placeholders. Real account
    digits from research are rejected outright.
  - Beneficiary BICs must be valid (schwifty or structural) and match the
    region's country; mislabeled BICs in the region manifest are forbidden.
  - No duplicate (beneficiary_bic, currency, intermediary_bic) tuples.
  - One commit per region, type(scope): description format.

Stdlib only — no third-party dependencies.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

# ── Paths ────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_FILE = REPO_ROOT / "app" / "services" / "seed.py"
TEST_FILE = REPO_ROOT / "tests" / "test_data_consistency.py"
PRIVACY_TEST_FILE = REPO_ROOT / "tests" / "test_ssi.py"
AUTOPILOT_TEST_FILE = REPO_ROOT / "tests" / "test_ssi_autopilot.py"
REGIONS_FILE = Path(__file__).resolve().parent / "regions.json"
STATE_FILE = REPO_ROOT / ".ssi-autopilot-state.json"
STATE_KEY = "ssi-autopilot"

COMMIT_PATTERN = re.compile(r"^feat\(ssi\): seed [a-z-]+ SSIs? \(([^)]+)\)")

# ── BIC helpers ──────────────────────────────────────────────────────────────
_ACCT_MASK = re.compile(r"^ACCT-\d{4,10}$")          # masked placeholder

# What is known about the source, not how old it is. "published" means someone
# verified the bank still publishes it today; "unverified" means a bank document
# was read without re-checking currency; "archived" means a point-in-time
# snapshot; "illustrative" means no bank source. Absence of archive evidence is
# not evidence a page is live — that inference mislabelled 406 seeded rows.
SSI_STATUSES = {"published", "unverified", "archived", "illustrative"}
_CURRENCIES = re.compile(r"^[A-Z]{3}$")


def bic_is_valid(bic: str) -> bool:
    """Accept 8- or 11-char BICs with valid structure; optionally schwifty."""
    b = bic.upper()
    if len(b) not in (8, 11):
        return False
    # bank code (4 letters) + country (2 letters) + location (2 alphanumeric)
    # + optional branch (3 alphanumeric)
    if not re.match(r"^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$", b):
        return False
    try:  # schwifty is a project dep; use it when importable
        from schwifty import BIC as _BIC
    except ImportError:
        return True  # structural check already passed; nothing better available

    # Anything schwifty raises here is a rejection, not an absence. Catching it
    # as "valid" would admit BICs naming countries that do not exist.
    try:
        return bool(_BIC(b).is_valid)
    except Exception:
        return False


def country_from_bic(bic: str) -> str:
    """BIC chars 5-6 are the country code."""
    return bic.upper()[4:6]


# ── Manifest ─────────────────────────────────────────────────────────────────
def load_manifest() -> dict:
    return json.loads(REGIONS_FILE.read_text())


def get_region(manifest: dict, name: str) -> dict:
    for region in manifest["regions"]:
        if region["name"] == name:
            return region
    raise SystemExit(f"unknown region: {name}")


# ── Validation ───────────────────────────────────────────────────────────────
class ValidationError(Exception):
    pass


def validate_results(results: dict, manifest: dict) -> list[str]:
    """
    Validate one region's research results. Returns a list of human-readable
    problems; empty list means the results may be seeded.
    """
    problems: list[str] = []
    region_name = results.get("region")
    if not region_name:
        problems.append("results missing 'region'")
        return problems
    try:
        region = get_region(manifest, region_name)
    except SystemExit:
        problems.append(f"region '{region_name}' not in manifest")
        return problems

    banks = {b["bic8"]: b for b in region["banks"]}
    countries = set(region["countries"])
    # Held in both widths so a forbidden BIC is caught however either side
    # spells it — manifest entry and research result may differ.
    forbidden = set()
    for entry in region.get("forbidden_bics", []):
        forbidden.add(entry.upper())
        forbidden.add(entry.upper()[:8])
    defaults = manifest["defaults"]
    seen: set[tuple[str, str, str]] = set()
    block = region["masked_block"]
    max_acct = block + 99

    result_banks = results.get("banks", [])
    if not result_banks:
        problems.append(
            f"{region_name}: no banks in results — an empty payload is not a valid region"
        )

    for bank in result_banks:
        ben_bic = str(bank.get("bic", "")).upper()
        ben_name = bank.get("name", "")
        # The manifest is keyed on the 8-character prefix, so prefix matching
        # alone would accept any malformed suffix riding on a known institution
        # ("BOPIPHMM!!!"). Validate the BIC as published before slicing it.
        if not bic_is_valid(ben_bic):
            problems.append(f"{ben_name or ben_bic}: invalid beneficiary BIC {ben_bic!r}")
            continue
        # Banks publish 8- and 11-character BICs interchangeably; the manifest
        # keys on the 8-character institution prefix. Compare on that prefix so
        # a branch-qualified BIC resolves to its entry instead of reading as
        # absent — and so it cannot slip past the forbidden list either.
        ben_bic8 = ben_bic[:8]
        if ben_bic in forbidden or ben_bic8 in forbidden:
            problems.append(f"{ben_bic}: BIC is on the region's forbidden list (mislabeled/typo)")
        if ben_bic8 not in banks:
            problems.append(f"{ben_name or ben_bic}: BIC {ben_bic} not in manifest for region {region_name}")
            continue
        expected = banks[ben_bic8]
        if not expected.get("seedable", True):
            problems.append(
                f"{ben_bic}: bank is marked NOT SEEDABLE in the manifest — "
                f"research found no published SSI list; drop its records"
            )

        records = bank.get("records", [])
        # The manifest carries a floor and it was never read; a bank with no
        # records otherwise passed as "valid" and printed "0 records valid".
        minimum = defaults.get("min_records_per_bank", 1)
        if len(records) < minimum:
            problems.append(
                f"{ben_bic}: {len(records)} record(s), below min_records_per_bank ({minimum})"
            )

        for rec in records:
            ccy = str(rec.get("currency", "")).upper()
            int_bic = str(rec.get("int_bic", "")).upper()
            correspondent = str(rec.get("correspondent", "")).strip()
            int_acct = str(rec.get("nostro", "")).strip()
            ben_acct = str(rec.get("with_an", "")).strip()
            charge = str(rec.get("charge_code", "")).upper()
            value_date = str(rec.get("value_date", "")).strip()
            source = str(rec.get("source", "")).strip()
            as_of = str(rec.get("as_of", "")).strip()

            # The correspondent name is what a learner reads next to the BIC.
            if not correspondent:
                problems.append(f"{ben_bic}/{ccy}: missing correspondent name")

            # Provenance is stated by the researcher who read the page, never
            # inferred from the date. An age threshold would be a guess; whether
            # the page was live or an archived snapshot is an observation.
            status = str(rec.get("status", "")).strip().lower()
            if status not in SSI_STATUSES:
                problems.append(
                    f"{ben_bic}/{ccy}: status {status!r} must be one of "
                    f"{sorted(SSI_STATUSES)}"
                )

            # value_dates is a manifest allowlist that was never consulted.
            if value_date not in defaults["value_dates"]:
                problems.append(
                    f"{ben_bic}/{ccy}: value date {value_date!r} not in {defaults['value_dates']}"
                )

            # Currency
            if not _CURRENCIES.match(ccy):
                problems.append(f"{ben_bic}/{ccy}: bad currency")
            elif ccy not in expected["currencies"]:
                problems.append(
                    f"{ben_bic}: currency {ccy} not in manifest currencies "
                    f"{expected['currencies']}"
                )

            # Intermediary BIC
            if not bic_is_valid(int_bic):
                problems.append(f"{ben_bic}/{ccy}: invalid intermediary BIC {int_bic!r}")
            if int_bic in forbidden:
                problems.append(f"{ben_bic}/{ccy}: intermediary BIC {int_bic} on forbidden list")

            # Beneficiary BIC country must match the region
            if country_from_bic(ben_bic) not in countries:
                problems.append(f"{ben_bic}: BIC country {country_from_bic(ben_bic)} not in region {sorted(countries)}")

            # Account masking — the hard privacy rule. The ACCT- mask + the
            # region block range ARE the privacy guarantee: anything not in
            # the masked form is rejected, and the block check keeps the
            # numbers inside the reserved placeholder series.
            for label, value in (("nostro", int_acct), ("with_an", ben_acct)):
                if not value:
                    problems.append(f"{ben_bic}/{ccy}: missing {label} account (must be ACCT- masked)")
                    continue
                if not _ACCT_MASK.match(value):
                    problems.append(f"{ben_bic}/{ccy}: {label} {value!r} is not an ACCT- masked placeholder")
                    # The block check below parses the suffix as an integer.
                    # A value that failed the mask has already been rejected,
                    # and parsing it would raise instead of reporting.
                    continue
                acct_num = int(value.split("-")[1])
                if not (block <= acct_num <= max_acct):
                    problems.append(
                        f"{ben_bic}/{ccy}: {label} {value} outside region block {block}-{max_acct}"
                    )

            # Charge code
            if charge not in defaults["charge_codes"]:
                problems.append(f"{ben_bic}/{ccy}: charge code {charge!r} not in {defaults['charge_codes']}")

            # Source citation. `startswith("http")` also accepted the bare
            # string "http" and "httpsomething", so a citation could be a
            # placeholder that reads like a URL.
            parsed = urlparse(source)
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                problems.append(
                    f"{ben_bic}/{ccy}: source {source!r} is not an http(s) URL "
                    f"(must cite a bank-published page)"
                )

            # as_of was only required to be non-empty, so "not-a-date" passed.
            if not as_of:
                problems.append(f"{ben_bic}/{ccy}: missing as_of date")
            else:
                try:
                    parsed_date = date.fromisoformat(as_of)
                except ValueError:
                    problems.append(f"{ben_bic}/{ccy}: as_of {as_of!r} is not an ISO date")
                else:
                    if parsed_date > date.today():
                        problems.append(f"{ben_bic}/{ccy}: as_of {as_of} is in the future")

            # Duplicate (ben_bic, ccy, int_bic)
            dup_key = (ben_bic, ccy, int_bic)
            if dup_key in seen:
                problems.append(f"{ben_bic}/{ccy}/{int_bic}: duplicate record")
            seen.add(dup_key)

    return problems


# ── Fold verification ────────────────────────────────────────────────────────
def _ssi_rows(source: str) -> list[tuple]:
    """Extract SSI_RECORDS as comparable tuples of source text."""
    tree = ast.parse(source)
    for node in tree.body:
        if not (isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)):
            continue
        if node.targets[0].id != "SSI_RECORDS":
            continue
        rows = []
        for element in node.value.elts:
            if not isinstance(element, ast.Tuple):
                continue
            rows.append(tuple(
                (ast.get_source_segment(source, field) or "").strip()
                for field in element.elts
            ))
        return rows
    return []


def _literal(text: str) -> str:
    """Best-effort unquote of a source segment; non-literals pass through."""
    try:
        value = ast.literal_eval(text)
    except (ValueError, SyntaxError):
        return text
    return value if isinstance(value, str) else text


def verify_fold(results: dict, head_source: str, folded_source: str) -> list[str]:
    """Bind the committed seed rows to the results that were validated.

    ``validate`` gates a JSON file, but the fold into seed.py is done by hand,
    so nothing previously proved the rows being committed were the rows that
    passed. Everything this fold *added* must correspond to a validated record,
    and every validated record must appear. Pre-existing rows are history and
    are not re-checked.
    """
    problems: list[str] = []
    head = set(_ssi_rows(head_source))
    added = [row for row in _ssi_rows(folded_source) if row not in head]

    expected: dict[tuple[str, str, str], dict] = {}
    for bank in results.get("banks", []):
        ben_bic = str(bank.get("bic", "")).upper()
        ben_bic11 = ben_bic if len(ben_bic) == 11 else ben_bic[:8] + "XXX"
        for rec in bank.get("records", []):
            int_bic = str(rec.get("int_bic", "")).upper()
            int_bic11 = int_bic if len(int_bic) == 11 else int_bic[:8] + "XXX"
            key = (ben_bic11, str(rec.get("currency", "")).upper(), int_bic11)
            expected[key] = {"bank": bank, "record": rec}

    seen: set[tuple[str, str, str]] = set()
    for row in added:
        if len(row) < 12:
            problems.append(
                f"folded row {row[0] if row else '?'} has {len(row)} fields; "
                f"a sourced row carries 12 (as_of and status included)"
            )
            continue
        key = (_literal(row[0]), _literal(row[2]), _literal(row[3]))
        if key not in expected:
            problems.append(
                f"{key[0]}/{key[1]}/{key[2]}: folded into seed.py but not in the "
                f"validated results — every committed row must have passed validation"
            )
            continue
        seen.add(key)
        rec = expected[key]["record"]
        bank = expected[key]["bank"]
        for index, (label, want) in enumerate([
            ("beneficiary name", bank.get("name", "")),
            ("correspondent", rec.get("correspondent", "")),
            ("nostro", rec.get("nostro", "")),
            ("with_an", rec.get("with_an", "")),
            ("charge code", str(rec.get("charge_code", "")).upper()),
            ("value date", rec.get("value_date", "")),
        ]):
            field = [1, 4, 5, 6, 7, 8][index]
            got = _literal(row[field])
            if got != want:
                problems.append(
                    f"{key[0]}/{key[1]}: folded {label} {got!r} does not match "
                    f"the validated {want!r}"
                )
        if _literal(row[10]) != rec.get("as_of", ""):
            problems.append(
                f"{key[0]}/{key[1]}: folded as_of {_literal(row[10])!r} does not "
                f"match the validated {rec.get('as_of', '')!r}"
            )
        if _literal(row[11]) != str(rec.get("status", "")).lower():
            problems.append(
                f"{key[0]}/{key[1]}: folded status {_literal(row[11])!r} does not "
                f"match the validated {str(rec.get('status', '')).lower()!r}"
            )
        source = str(rec.get("source", ""))
        if source and source not in row[9]:
            problems.append(
                f"{key[0]}/{key[1]}: folded notes do not cite the validated source {source}"
            )

    head_keys = {(_literal(r[0]), _literal(r[2]), _literal(r[3])) for r in head if len(r) >= 4}
    for key in expected:
        if key not in seen and key not in head_keys:
            problems.append(
                f"{key[0]}/{key[1]}/{key[2]}: was validated but not folded into seed.py"
            )
    return problems


# ── Test scaffolding ─────────────────────────────────────────────────────────
def scaffold_coverage_class(region: dict) -> str:
    """Generate the region coverage test class for test_data_consistency.py.

    Only banks marked seedable (default true) are required to have seeded
    records; research-proven NOT-SEEDABLE banks stay in the manifest for their
    verified BICs but are excluded from the coverage assertions.
    """
    name = region["name"]
    class_name = "".join(part.title() for part in name.split("-")) + "SsiCoverage"
    list_name = f"{name.upper().replace('-', '_')}_SSI_COVERAGE"
    seedable = [b for b in region["banks"] if b.get("seedable", True)]
    lines = [
        f"{list_name} = [",
    ]
    for bank in seedable:
        bic11 = bank["bic8"] + "XXX"
        cys = ", ".join(f'"{c}"' for c in bank["currencies"])
        lines.append(f'    ("{bic11}", "{bank["name"]}", {{{cys}}}),')
    lines.append("]")
    lines += [
        "",
        "",
        f"class Test{class_name}:",
        f"    def test_{name.replace('-', '_')}_banks_have_seeded_ssi_records(self):",
        "        seeded = {}",
        "        for record in SSI_RECORDS:",
        "            seeded.setdefault(record[0], set()).add(record[2])",
        f"        for bic, name, currencies in {list_name}:",
        "            have = seeded.get(bic, set())",
        "            missing = currencies - have",
        "            assert not missing, (",
        '                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"',
        "            )",
        "",
        f"    def test_{name.replace('-', '_')}_banks_are_in_the_bank_directory(self):",
        "        bank_bics = {row[0] for row in BANKS}",
        "        missing = [",
        f"            bic for bic, _name, _currencies in {list_name}",
        "            if bic not in bank_bics",
        "        ]",
        "        assert not missing, (",
        f'            f"{name} SSI beneficiaries must also be seeded in BANKS so "',
        '            f"Explore can show their settlement instructions: {missing}"',
        "        )",
        "",
    ]
    return "\n".join(lines)


# ── Commit counter / PR ──────────────────────────────────────────────────────
def read_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"branch": "feat/ssi-autopilot", "commits_since_pr": 0, "regions_since_pr": [], "last_pr": None}


def write_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2) + "\n")


def git(*args: str, check: bool = True) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=check, cwd=REPO_ROOT
    ).stdout.strip()


def run_pytest(paths: list[str]) -> None:
    cmd = [sys.executable, "-m", "pytest", *paths, "-q"]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT)
    if result.returncode != 0:
        raise SystemExit(f"pytest failed:\n{result.stdout}\n{result.stderr}")


def cmd_validate(args: argparse.Namespace) -> None:
    manifest = load_manifest()
    results = json.loads(Path(args.results).read_text())
    problems = validate_results(results, manifest)
    if problems:
        for p in problems:
            print(f"  ✗ {p}")
        raise SystemExit(f"validation failed: {len(problems)} problem(s)")
    n = sum(len(b.get("records", [])) for b in results.get("banks", []))
    print(f"  ✓ {results['region']}: {n} records valid")


def cmd_scaffold(args: argparse.Namespace) -> None:
    manifest = load_manifest()
    region = get_region(manifest, args.region)
    text = scaffold_coverage_class(region)
    existing = TEST_FILE.read_text()
    # One marker pair per region. A single shared marker made this destructive:
    # truncating at it deleted every previously scaffolded region, so seeding a
    # second region silently dropped the first region's coverage test.
    begin = f"# ---- autopilot-generated coverage tests: {args.region} ----"
    end = f"# ---- end autopilot-generated coverage tests: {args.region} ----"
    block = begin + "\n" + text.rstrip() + "\n" + end

    # Several regions share a name with a hand-written coverage class already in
    # the file. Appending a second definition is silent: Python keeps the last
    # one, so the hand-written assertions stop running without any error.
    class_name = "".join(part.title() for part in args.region.split("-")) + "SsiCoverage"
    outside = existing
    if begin in outside and end in outside:
        head, _, rest = outside.partition(begin)
        _, _, tail = rest.partition(end)
        outside = head + tail
    if re.search(rf"^class Test{class_name}:", outside, re.MULTILINE):
        raise SystemExit(
            f"refusing to scaffold {args.region}: Test{class_name} is already "
            f"defined in {TEST_FILE.name} outside the autopilot block. "
            f"Appending would shadow it. Remove or rename the existing class first."
        )
    if begin in existing and end in existing:
        head, _, rest = existing.partition(begin)
        _, _, tail = rest.partition(end)
        existing = head.rstrip() + "\n\n\n" + block + "\n" + tail.lstrip("\n")
    else:
        existing = existing.rstrip() + "\n\n\n" + block + "\n"
    TEST_FILE.write_text(existing)
    class_name = "".join(part.title() for part in args.region.split("-")) + "SsiCoverage"
    print(f"  ✓ scaffolded {class_name} into {TEST_FILE.name}")


def cmd_verify(_args: argparse.Namespace) -> None:
    """
    Structural invariants on seed.py — run before committing ANY fold so a
    broken fold (wrong tuple arity, duplicate BANKS rows) is caught here
    instead of by a DB constraint at seed time.
    """
    problems: list[str] = []
    src = SEED_FILE.read_text()
    tree = ast.parse(src)
    for node in tree.body:
        if not (isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)):
            continue
        name = node.targets[0].id
        if name not in ("BANKS", "SSI_RECORDS"):
            continue
        elts = node.value.elts
        # SSI rows carry an optional provenance pair, so both widths are legal.
        expected = (5,) if name == "BANKS" else (10, 12)
        for i, e in enumerate(elts):
            if not isinstance(e, ast.Tuple) or len(e.elts) not in expected:
                got = len(e.elts) if isinstance(e, ast.Tuple) else type(e).__name__
                problems.append(
                    f"{name}[{i}]: expected a tuple of "
                    f"{' or '.join(str(x) for x in expected)} fields, got {got}"
                )
        if name == "BANKS":
            bics = [e.elts[0].value for e in elts if isinstance(e, ast.Tuple) and e.elts]
            seen: dict[str, int] = {}
            for bic in bics:
                seen[bic] = seen.get(bic, 0) + 1
            for bic, count in seen.items():
                if count > 1:
                    problems.append(f"BANKS: duplicate BIC {bic} ({count}x)")
    if problems:
        raise SystemExit("seed.py invariants failed:\n" + "\n".join(f"  ✗ {p}" for p in problems))
    print("  ✓ seed.py invariants OK (BANKS/SSI_RECORDS arity, no duplicate BICs)")


def cmd_commit(args: argparse.Namespace) -> None:
    manifest = load_manifest()
    results = json.loads(Path(args.results).read_text())
    problems = validate_results(results, manifest)
    if problems:
        raise SystemExit("validation failed — refusing to commit:\n" + "\n".join(f"  ✗ {p}" for p in problems))
    region = get_region(manifest, results["region"])
    label = args.label or region["label"]
    source_hint = args.source or "bank-published SSI pages"

    # Gate: seed.py structural invariants + the region's coverage test must
    # pass. The model is expected to have appended the validated records to
    # seed.py BEFORE running commit; the scaffold is idempotent (everything
    # after the marker is rewritten).
    if args.dry_run:
        msg = f"feat(ssi): seed {results['region']} SSIs ({source_hint})"
        print(f"  (dry-run) would scaffold {TEST_FILE.name}, gate on pytest, and commit: {msg}")
        return
    cmd_verify(args)

    # Bind the fold to the validation. Everything above gates a JSON file; this
    # is what proves the rows about to be committed are the rows that passed.
    fold_problems = verify_fold(
        results,
        git("show", f"HEAD:{SEED_FILE.relative_to(REPO_ROOT)}"),
        SEED_FILE.read_text(),
    )
    if fold_problems:
        raise SystemExit(
            "the fold does not match the validated results — refusing to commit:\n"
            + "\n".join(f"  ✗ {p}" for p in fold_problems)
        )
    print(f"  ✓ fold matches the validated results ({len(fold_problems) == 0 and 'all rows' or ''})".rstrip())

    cmd_scaffold(argparse.Namespace(region=results["region"]))
    # TestAllSSIAccountsArePlaceholders lives in tests/test_ssi.py, and it is
    # the canonical check that no real account number reaches seed.py. Gating
    # only on the generated coverage file cannot see that class at all.
    run_pytest([str(TEST_FILE), str(PRIVACY_TEST_FILE), str(AUTOPILOT_TEST_FILE)])
    # Claimed in the PR body, so it has to actually run: whitespace errors in a
    # generated block are exactly what this catches.
    whitespace = subprocess.run(
        ["git", "diff", "--check"], capture_output=True, text=True, cwd=REPO_ROOT
    )
    if whitespace.returncode != 0:
        raise SystemExit(f"git diff --check failed:\n{whitespace.stdout}{whitespace.stderr}")

    # `git add a b` followed by a bare `git commit` commits the whole index,
    # not just the paths added. Anything an operator had staged rides along and
    # maybe-pr then publishes it. Refuse a dirty index, and commit by path.
    own_paths = [
        str(path.relative_to(REPO_ROOT)) for path in (SEED_FILE, TEST_FILE)
    ]
    staged = [p for p in git("diff", "--cached", "--name-only").splitlines() if p.strip()]
    unexpected = sorted(set(staged) - set(own_paths))
    if unexpected:
        raise SystemExit(
            "refusing to commit with unrelated paths staged: "
            + ", ".join(unexpected)
            + "\nUnstage them first — a bare commit would include them and "
            "maybe-pr would push them."
        )

    git("add", *own_paths)
    msg = f"feat(ssi): seed {results['region']} SSIs ({source_hint})"
    git("commit", "--only", *own_paths, "-m", msg, "-m", f"Beneficiary: {label}.")
    state = read_state()
    state["commits_since_pr"] += 1
    state["regions_since_pr"].append(results["region"])
    write_state(state)
    print(f"  ✓ committed {msg}  [{state['commits_since_pr']} since last PR]")


def cmd_maybe_pr(args: argparse.Namespace) -> None:
    state = read_state()
    threshold = args.every
    if state["commits_since_pr"] < threshold:
        print(f"  {state['commits_since_pr']} commits since last PR (threshold {threshold}) — nothing to do")
        return
    regions = state["regions_since_pr"]
    branch = git("branch", "--show-current")
    # `git branch --show-current` reports whatever the checkout happens to be
    # on, and this command pushes it. An unattended loop started from the wrong
    # checkout would push that branch and open a PR from it, so the branch has
    # to be the one the state file has been counting commits against.
    expected_branch = state.get("branch")
    if branch in ("main", "master"):
        raise SystemExit(
            f"refusing to push protected branch {branch!r}: "
            f"the autopilot expects to be on {expected_branch!r}"
        )
    if expected_branch and branch != expected_branch:
        raise SystemExit(
            f"refusing to push branch {branch!r}: the state file has been "
            f"counting commits against {expected_branch!r}. Check out that "
            f"branch, or update .ssi-autopilot-state.json deliberately."
        )
    if not branch:
        raise SystemExit("refusing to push from a detached HEAD: no branch to open a PR from")
    title = f"feat(ssi): {len(regions)} region settlement data wave"
    body = "\n".join(
        [
            "## What changed",
            "",
            f"- Seeded published Standard Settlement Instructions for: {', '.join(regions)}.",
            "- Accounts remain masked as ACCT- placeholders; no real account numbers.",
            "- Every record carries a bank-published source citation.",
            f"- {state['commits_since_pr']} commits since the previous wave.",
            "",
            "## Verification",
            "",
            "- `pytest` + `git diff --check` green at commit time (autopilot gate).",
            "- This PR was opened by the ssi-autopilot loop.",
        ]
    )
    if args.dry_run:
        print(f"  (dry-run) would push {branch} and open PR:\n{title}\n\n{body}")
        return
    git("push", "-u", "origin", branch)
    pr = subprocess.run(
        ["gh", "pr", "create", "--title", title, "--body", body, "--base", "main"],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )
    if pr.returncode != 0:
        raise SystemExit(f"gh pr create failed:\n{pr.stderr}")
    state["commits_since_pr"] = 0
    state["regions_since_pr"] = []
    state["last_pr"] = pr.stdout.strip()
    write_state(state)
    print(f"  ✓ opened {pr.stdout.strip()}")


def cmd_status(_args: argparse.Namespace) -> None:
    state = read_state()
    manifest = load_manifest()
    print(f"branch: {git('branch', '--show-current')}")
    print(f"commits since last PR: {state['commits_since_pr']}")
    print(f"regions since last PR: {state['regions_since_pr']}")
    print(f"last PR: {state['last_pr']}")
    print("manifest regions:")
    for region in manifest["regions"]:
        print(f"  - {region['name']}: {len(region['banks'])} banks, block {region['masked_block']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="SSI autopilot orchestrator")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("validate", help="validate research results JSON")
    p.add_argument("results", help="path to results JSON")
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("scaffold", help="scaffold region coverage test")
    p.add_argument("region", help="region name from manifest")
    p.set_defaults(func=cmd_scaffold)

    p = sub.add_parser("verify", help="check seed.py structural invariants")
    p.set_defaults(func=cmd_verify)

    p = sub.add_parser("commit", help="validate, gate-test, and commit a region")
    p.add_argument("results", help="path to results JSON")
    p.add_argument("--label", help="human label for the commit body")
    p.add_argument("--source", help="source hint for the commit title")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(func=cmd_commit)

    p = sub.add_parser("maybe-pr", help="push + open PR when threshold reached")
    p.add_argument("--every", type=int, default=10, help="commit threshold (default 10)")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(func=cmd_maybe_pr)

    p = sub.add_parser("status", help="show autopilot state")
    p.set_defaults(func=cmd_status)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
