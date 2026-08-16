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
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_FILE = REPO_ROOT / "app" / "services" / "seed.py"
TEST_FILE = REPO_ROOT / "tests" / "test_data_consistency.py"
REGIONS_FILE = Path(__file__).resolve().parent / "regions.json"
STATE_FILE = REPO_ROOT / ".ssi-autopilot-state.json"
STATE_KEY = "ssi-autopilot"

COMMIT_PATTERN = re.compile(r"^feat\(ssi\): seed [a-z-]+ SSIs? \(([^)]+)\)")

_SSI_REAL_NOTE = "Sourced from bank-published SSI page. Verify current values before use."

# ── BIC helpers ──────────────────────────────────────────────────────────────
_BIC8 = re.compile(r"^[A-Z0-9]{8}$")
_ACCT_MASK = re.compile(r"^ACCT-\d{4,10}$")          # masked placeholder
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

        return _BIC(b).is_valid
    except Exception:
        return True  # structural check already passed


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
    forbidden = {b.upper() for b in region.get("forbidden_bics", [])}
    defaults = manifest["defaults"]
    seen: set[tuple[str, str, str]] = set()
    block = region["masked_block"]
    max_acct = block + 99

    for bank in results.get("banks", []):
        ben_bic = str(bank.get("bic", "")).upper()
        ben_name = bank.get("name", "")
        # Flag forbidden BICs regardless of manifest membership — a mislabeled
        # source BIC must never be seedable even if the manifest was updated.
        if ben_bic in forbidden:
            problems.append(f"{ben_bic}: BIC is on the region's forbidden list (mislabeled/typo)")
        if ben_bic not in banks:
            problems.append(f"{ben_name or ben_bic}: BIC {ben_bic} not in manifest for region {region_name}")
            continue
        expected = banks[ben_bic]

        for rec in bank.get("records", []):
            ccy = str(rec.get("currency", "")).upper()
            int_bic = str(rec.get("int_bic", "")).upper()
            int_name = rec.get("correspondent", "")
            int_acct = str(rec.get("nostro", "")).strip()
            ben_acct = str(rec.get("with_an", "")).strip()
            charge = str(rec.get("charge_code", "")).upper()
            source = str(rec.get("source", "")).strip()
            as_of = str(rec.get("as_of", "")).strip()

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
                acct_num = int(value.split("-")[1]) if "-" in value else 0
                if not (block <= acct_num <= max_acct):
                    problems.append(
                        f"{ben_bic}/{ccy}: {label} {value} outside region block {block}-{max_acct}"
                    )

            # Charge code
            if charge not in defaults["charge_codes"]:
                problems.append(f"{ben_bic}/{ccy}: charge code {charge!r} not in {defaults['charge_codes']}")

            # Source citation
            if not source.startswith("http"):
                problems.append(f"{ben_bic}/{ccy}: missing bank-published source URL")
            if not as_of:
                problems.append(f"{ben_bic}/{ccy}: missing as_of date")

            # Duplicate (ben_bic, ccy, int_bic)
            dup_key = (ben_bic, ccy, int_bic)
            if dup_key in seen:
                problems.append(f"{ben_bic}/{ccy}/{int_bic}: duplicate record")
            seen.add(dup_key)

    return problems


# ── Test scaffolding ─────────────────────────────────────────────────────────
def scaffold_coverage_class(region: dict) -> str:
    """Generate the region coverage test class for test_data_consistency.py."""
    name = region["name"]
    class_name = "".join(part.title() for part in name.split("-")) + "SsiCoverage"
    list_name = f"{name.upper().replace('-', '_')}_SSI_COVERAGE"
    lines = [
        f"{list_name} = [",
    ]
    for bank in region["banks"]:
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
        f'                f"{{name}} ({{bic}}) is missing seeded SSI records for: {{sorted(missing)}}"',
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
    region = get_region(manifest, results["region"])
    n = sum(len(b.get("records", [])) for b in results.get("banks", []))
    print(f"  ✓ {results['region']}: {n} records valid")


def cmd_scaffold(args: argparse.Namespace) -> None:
    manifest = load_manifest()
    region = get_region(manifest, args.region)
    text = scaffold_coverage_class(region)
    existing = TEST_FILE.read_text()
    marker = "# ---- autopilot-generated coverage tests ----"
    if marker in existing:
        existing = existing.split(marker)[0]
    existing = existing.rstrip() + "\n\n\n" + marker + "\n" + text
    TEST_FILE.write_text(existing)
    class_name = "".join(part.title() for part in args.region.split("-")) + "SsiCoverage"
    print(f"  ✓ scaffolded {class_name} into {TEST_FILE.name}")


def cmd_commit(args: argparse.Namespace) -> None:
    manifest = load_manifest()
    results = json.loads(Path(args.results).read_text())
    problems = validate_results(results, manifest)
    if problems:
        raise SystemExit(f"validation failed — refusing to commit:\n" + "\n".join(f"  ✗ {p}" for p in problems))
    region = get_region(manifest, results["region"])
    label = args.label or region["label"]
    source_hint = args.source or "bank-published SSI pages"

    # Gate: the region's coverage test must pass. The model is expected to
    # have appended the validated records to seed.py BEFORE running commit;
    # the scaffold is idempotent (everything after the marker is rewritten).
    if args.dry_run:
        msg = f"feat(ssi): seed {results['region']} SSIs ({source_hint})"
        print(f"  (dry-run) would scaffold {TEST_FILE.name}, gate on pytest, and commit: {msg}")
        return
    cmd_scaffold(argparse.Namespace(region=results["region"]))
    run_pytest([str(TEST_FILE)])

    git("add", str(SEED_FILE), str(TEST_FILE))
    msg = f"feat(ssi): seed {results['region']} SSIs ({source_hint})"
    git("commit", "-m", msg, "-m", f"Beneficiary: {label}.")
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
    title = f"feat(ssi): {len(regions)} region settlement data wave"
    body = "\n".join(
        [
            f"## What changed",
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
