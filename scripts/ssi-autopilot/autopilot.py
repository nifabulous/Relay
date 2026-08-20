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
import copy
import fcntl
import hashlib
import ipaddress
import json
import os
import re
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

# ── Paths ────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_FILE = REPO_ROOT / "app" / "services" / "seed.py"
TEST_FILE = REPO_ROOT / "tests" / "test_data_consistency.py"
PRIVACY_TEST_FILE = REPO_ROOT / "tests" / "test_ssi.py"
AUTOPILOT_TEST_FILE = REPO_ROOT / "tests" / "test_ssi_autopilot.py"
REGIONS_FILE = Path(__file__).resolve().parent / "regions.json"
STATE_FILE = REPO_ROOT / ".ssi-autopilot-state.json"
STATE_KEY = "ssi-autopilot"
# Compatibility name for callers/tests; locking uses _manifest_lock_path().
MANIFEST_LOCK_FILE = REGIONS_FILE.with_suffix(".json.lock")

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

# Candidate source domains are admissions data, not evidence. Keep this registry
# independent from the mutable manifest so a candidate cannot authorize its own
# citations by supplying a matching domain.
TRUSTED_SOURCE_DOMAINS: dict[str, tuple[str, ...]] = {
    # Reviewed bank-owned hosts used by the current SSI corpus and discovery
    # wave. Candidate payloads must match these identities exactly.
    "BBDEBRSP": ("banco.bradesco",),
    "CMBCCNBS": ("cmbchina.com",),
    "CTBAAU2S": ("commbank.com.au",),
    "TESTPHMM": ("testphilippinebank.com",),
    "NEWPPHMM": ("testphilippinebank.com",),
}
_TEST_BICS = {"TESTPHMM", "NEWPPHMM"}

# These are legacy manifest values retained for compatibility. They are not
# valid BICs and may not be introduced in new candidate payloads.
_LEGACY_FORBIDDEN_BICS = {"NATAU3P", "ECOCIAB", "COMEGCAX"}


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


_ADMISSION_REGION_KEYS = {"name", "label", "countries", "masked_block", "note", "forbidden_bics", "banks"}
_ADMISSION_BANK_KEYS = {"bic8", "name", "country", "currencies", "seedable", "records", "source_domains"}
_ADMISSION_RECORD_KEYS = {
    "currency", "correspondent", "int_bic", "nostro", "with_an",
    "charge_code", "value_date", "source", "as_of", "status", "verified_by",
}


def _require_mapping(value: object, path: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected an object")
    return value


def _require_sequence(value: object, path: str) -> list:
    if not isinstance(value, list):
        raise ValueError(f"{path}: expected a list")
    return value


def _canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _record_sort_key(record: dict) -> tuple[str, ...]:
    return tuple(str(record.get(key, "")) for key in (
        "currency", "int_bic", "correspondent", "nostro", "with_an",
        "charge_code", "value_date", "source", "as_of", "status", "verified_by",
    ))


def record_digest(records: list[dict]) -> str:
    ordered = sorted((dict(record) for record in records), key=_record_sort_key)
    return hashlib.sha256(_canonical_json(ordered).encode("utf-8")).hexdigest()


def _normalize_record(record: dict, path: str) -> dict:
    record = _require_mapping(record, path)
    unknown = set(record) - _ADMISSION_RECORD_KEYS
    if unknown:
        raise ValueError(f"{path}: unknown fields: {', '.join(sorted(unknown))}")
    required = _ADMISSION_RECORD_KEYS - {"verified_by"}
    missing = required - set(record)
    if missing:
        raise ValueError(f"{path}: missing fields: {', '.join(sorted(missing))}")
    normalized = dict(record)
    for key in ("currency", "int_bic", "charge_code"):
        if not isinstance(normalized[key], str):
            raise ValueError(f"{path}.{key}: expected a string")
        normalized[key] = normalized[key].strip().upper()
    if not isinstance(normalized["status"], str):
        raise ValueError(f"{path}.status: expected a string")
    normalized["status"] = normalized["status"].strip().lower()
    for key in ("correspondent", "nostro", "with_an", "value_date", "source", "as_of"):
        if not isinstance(normalized[key], str):
            raise ValueError(f"{path}.{key}: expected a string")
        normalized[key] = normalized[key].strip()
    if "verified_by" in normalized:
        if not isinstance(normalized["verified_by"], str):
            raise ValueError(f"{path}.verified_by: expected a string")
        normalized["verified_by"] = normalized["verified_by"].strip()
    return normalized


def _normalize_source_domain(value: object, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{path}: expected a non-empty domain string")
    domain = value.strip().lower().rstrip(".")
    if "://" in domain or "/" in domain or "@" in domain:
        raise ValueError(f"{path}: expected a hostname, not a URL")
    try:
        ipaddress.ip_address(domain)
    except ValueError:
        pass
    else:
        raise ValueError(f"{path}: IP-only source domains are not allowed")
    if domain in {"example.com", "example.org", "example.net", "localhost"}:
        raise ValueError(f"{path}: placeholder source domain is not allowed")
    if not re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", domain):
        raise ValueError(f"{path}: invalid source domain")
    return domain


def _source_host(source: str) -> str | None:
    parsed = urlparse(source)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.lower().rstrip(".")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return host
    return None


def _archived_original_host(source: str) -> str | None:
    parsed = urlparse(source)
    if parsed.hostname not in {"web.archive.org", "wayback.archive-it.org", "arquivo.pt"}:
        return None
    query = parse_qs(parsed.query)
    candidates = query.get("url", [])
    # Wayback URLs commonly encode the original URL in the path.
    path_match = re.search(r"/(?:https?:/{1,2})([^/]+)", unquote(parsed.path), re.I)
    if path_match:
        candidates.append("https://" + path_match.group(1))
    for candidate in candidates:
        host = _source_host(candidate)
        if host:
            return host
    return None


def _bank_owned_source(source: str, bank: dict) -> bool:
    """Return whether a citation points to the admitted bank's own domain."""
    host = _source_host(source)
    archive_original = _archived_original_host(source)
    if archive_original:
        host = archive_original
    if not host:
        return False
    domains = bank.get("source_domains", [])
    return any(host == domain or host.endswith("." + domain) for domain in domains)


def _trusted_domains_for_bic(bic: str) -> set[str]:
    """Return operator-reviewed domains, excluding test identities in production."""
    if bic in _TEST_BICS and REGIONS_FILE.resolve() == (Path(__file__).resolve().parent / "regions.json"):
        return set()
    return set(TRUSTED_SOURCE_DOMAINS.get(bic, ()))


def _canonical_bic8(value: object, path: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{path}: expected a BIC string")
    bic = value.strip().upper()
    if not bic_is_valid(bic):
        raise ValueError(f"{path}: invalid BIC")
    return bic[:8]


def _normalize_bank(bank: dict, region: dict, path: str) -> dict:
    bank = _require_mapping(bank, path)
    unknown = set(bank) - _ADMISSION_BANK_KEYS
    if unknown:
        raise ValueError(f"{path}: unknown fields: {', '.join(sorted(unknown))}")
    required = {"bic8", "name", "country", "currencies", "records"}
    missing = required - set(bank)
    if missing:
        raise ValueError(f"{path}: missing fields: {', '.join(sorted(missing))}")
    bic = bank["bic8"]
    if not isinstance(bic, str) or len(bic) != 8 or not bic_is_valid(bic):
        raise ValueError(f"{path}.bic8: expected a valid canonical 8-character BIC")
    bic = bic.upper()
    name = bank["name"]
    country = bank["country"]
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"{path}.name: expected a non-empty string")
    if not isinstance(country, str) or not re.fullmatch(r"[A-Z]{2}", country.upper()):
        raise ValueError(f"{path}.country: expected a two-letter country code")
    country = country.upper()
    if country not in region["countries"]:
        raise ValueError(f"{path}.country: {country} is outside region countries")
    currencies = _require_sequence(bank["currencies"], f"{path}.currencies")
    if not currencies:
        raise ValueError(f"{path}.currencies: expected a non-empty list")
    if any(not isinstance(c, str) for c in currencies):
        raise ValueError(f"{path}.currencies: expected string currency codes")
    currencies = [c.upper() for c in currencies]
    if len(set(currencies)) != len(currencies) or any(not _CURRENCIES.fullmatch(c) for c in currencies):
        raise ValueError(f"{path}.currencies: expected unique three-letter currency codes")
    records = _require_sequence(bank["records"], f"{path}.records")
    normalized_records = [_normalize_record(r, f"{path}.records[{i}]") for i, r in enumerate(records)]
    seedable = bank.get("seedable", True)
    if not isinstance(seedable, bool):
        raise ValueError(f"{path}.seedable: expected a boolean")
    raw_domains = bank.get("source_domains", [])
    domains = _require_sequence(raw_domains, f"{path}.source_domains")
    domains = [_normalize_source_domain(domain, f"{path}.source_domains[{i}]") for i, domain in enumerate(domains)]
    if len(set(domains)) != len(domains):
        raise ValueError(f"{path}.source_domains: expected unique domains")
    trusted = _trusted_domains_for_bic(bic)
    if set(domains) != trusted:
        raise ValueError(f"{path}.source_domains: domains are not trusted for BIC {bic}")
    if seedable and not domains:
        raise ValueError(f"{path}.source_domains: seedable bank requires source domains")
    if seedable and not normalized_records:
        raise ValueError(f"{path}: seedable bank requires SSI records")
    if not seedable and normalized_records:
        raise ValueError(f"{path}: non-seedable bank cannot carry SSI records")
    if seedable and set(r["currency"] for r in normalized_records) != set(currencies):
        raise ValueError(f"{path}: records must cover every declared currency")
    normalized_records.sort(key=_record_sort_key)
    return {
        "bic8": bic, "name": name.strip(), "country": country,
        "currencies": sorted(currencies), "seedable": seedable,
        "source_domains": sorted(domains),
        "records": normalized_records,
    }


def _region_blocks_overlap(left: int, right: int) -> bool:
    return left <= right + 99 and right <= left + 99


def _validate_admission_envelope(payload: dict, manifest: dict) -> list[dict]:
    payload = _require_mapping(payload, "candidate input")
    if set(payload) != {"regions"}:
        raise ValueError("candidate input must be an object containing only a regions list")
    payload_regions = _require_sequence(payload["regions"], "candidate input.regions")
    if not payload_regions:
        raise ValueError("candidate input regions must not be empty")
    existing_by_name = {r["name"]: r for r in manifest["regions"]}
    existing_bics = {b["bic8"].upper()[:8]: r["name"] for r in manifest["regions"] for b in r["banks"]}
    # Existing manifest entries are historical policy data and may contain
    # legacy typos; preserve them while applying strict validation to new input.
    forbidden_global = {
        value.strip().upper()[:8]
        for region in manifest["regions"]
        for value in region.get("forbidden_bics", [])
        if isinstance(value, str) and value.strip()
    }
    candidate_forbidden: set[str] = set()
    candidate_owned: set[str] = set()
    for index, raw in enumerate(payload_regions):
        path = f"regions[{index}]"
        if not isinstance(raw, dict):
            continue
        banks_raw = raw.get("banks", [])
        if isinstance(banks_raw, list):
            for bank in banks_raw:
                if isinstance(bank, dict) and isinstance(bank.get("bic8"), str):
                    bic = bank["bic8"].strip().upper()
                    if bic_is_valid(bic):
                        candidate_owned.add(bic[:8])
        forbidden = raw.get("forbidden_bics", [])
        if not isinstance(forbidden, list):
            continue
        for forbidden_index, value in enumerate(forbidden):
            if not isinstance(value, str):
                raise ValueError(f"{path}.forbidden_bics[{forbidden_index}]: expected a string")
            raw_bic = value.strip().upper()
            if raw_bic in _LEGACY_FORBIDDEN_BICS and raw_bic in forbidden_global:
                candidate_forbidden.add(raw_bic)
            elif bic_is_valid(raw_bic):
                candidate_forbidden.add(raw_bic[:8])
            else:
                raise ValueError(f"{path}.forbidden_bics[{forbidden_index}]: malformed BIC {value!r}")
    overlap = (set(existing_bics) | candidate_owned) & candidate_forbidden
    if overlap:
        raise ValueError(f"forbidden_bics overlap owned BICs: {', '.join(sorted(overlap))}")
    forbidden_global |= candidate_forbidden
    candidate_names: set[str] = set()
    candidate_bics: dict[str, str] = {}
    candidate_blocks: dict[int, str] = {}
    normalized_regions = []
    for index, raw in enumerate(payload_regions):
        path = f"regions[{index}]"
        if not isinstance(raw, dict):
            raise ValueError(f"{path}: region must be an object")
        unknown = set(raw) - _ADMISSION_REGION_KEYS
        if unknown:
            raise ValueError(f"{path}: unknown fields: {', '.join(sorted(unknown))}")
        for key in ("name", "banks"):
            if key not in raw:
                raise ValueError(f"{path}: missing field {key}")
        name = raw["name"]
        if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
            raise ValueError(f"{path}.name: expected a lowercase kebab-case name")
        if name in candidate_names:
            raise ValueError(f"{path}.name: duplicate region")
        candidate_names.add(name)
        old = existing_by_name.get(name)
        if old:
            for key in ("label", "countries", "masked_block", "note"):
                if key in raw and raw[key] != old[key]:
                    raise ValueError(f"{path}.{key}: existing region metadata is immutable")
            if "forbidden_bics" in raw and not isinstance(raw["forbidden_bics"], list):
                raise ValueError(f"{path}.forbidden_bics: expected a list")
            supplied_forbidden = set(raw.get("forbidden_bics", old.get("forbidden_bics", [])))
            existing_forbidden = set(old.get("forbidden_bics", []))
            if not existing_forbidden.issubset(supplied_forbidden):
                raise ValueError(f"{path}.forbidden_bics: existing forbidden BICs cannot be removed")
            region = copy.deepcopy(old)
            region["forbidden_bics"] = sorted(supplied_forbidden)
        else:
            required = {"label", "countries", "masked_block", "note", "banks"}
            missing = required - set(raw)
            if missing:
                raise ValueError(f"{path}: new region missing fields: {', '.join(sorted(missing))}")
            region = {k: copy.deepcopy(raw[k]) for k in ("name", "label", "countries", "masked_block", "note")}
            region["forbidden_bics"] = copy.deepcopy(raw.get("forbidden_bics", []))
            region["banks"] = []
        for key in ("label", "note"):
            if not isinstance(region.get(key), str):
                raise ValueError(f"{path}.{key}: expected a string")
        countries = _require_sequence(region.get("countries"), f"{path}.countries")
        if not countries or any(not isinstance(c, str) or not re.fullmatch(r"[A-Z]{2}", c) for c in countries):
            raise ValueError(f"{path}.countries: expected non-empty two-letter country codes")
        region["countries"] = [c.upper() for c in countries]
        forbidden = _require_sequence(region.get("forbidden_bics", []), f"{path}.forbidden_bics")
        normalized_forbidden = []
        for forbidden_index, value in enumerate(forbidden):
            if not isinstance(value, str):
                raise ValueError(f"{path}.forbidden_bics[{forbidden_index}]: expected a string")
            canonical = value.strip().upper()
            if canonical in _LEGACY_FORBIDDEN_BICS and canonical in forbidden_global:
                normalized_forbidden.append(canonical)
            elif bic_is_valid(canonical):
                normalized_forbidden.append(canonical[:8])
            else:
                raise ValueError(f"{path}.forbidden_bics[{forbidden_index}]: malformed BIC {value!r}")
        if len(set(normalized_forbidden)) != len(normalized_forbidden):
            raise ValueError(f"{path}.forbidden_bics: duplicate BIC")
        region["forbidden_bics"] = sorted(normalized_forbidden)
        owned_in_region = {bank["bic8"] for bank in region.get("banks", [])}
        overlap = (set(existing_bics) | candidate_owned | owned_in_region) & set(region["forbidden_bics"])
        if overlap:
            raise ValueError(f"{path}.forbidden_bics overlap owned BICs: {', '.join(sorted(overlap))}")
        block = region.get("masked_block")
        if not isinstance(block, int) or block < 10000000 or block % 100 != 0:
            raise ValueError(f"{path}.masked_block: expected an integer aligned to a 100-account block")
        for other in manifest["regions"]:
            if other["name"] != name and _region_blocks_overlap(block, other["masked_block"]):
                raise ValueError(f"{path}.masked_block: overlaps existing region {other['name']}")
        for other_block, other_name in candidate_blocks.items():
            if other_name != name and _region_blocks_overlap(block, other_block):
                raise ValueError(f"{path}.masked_block: overlaps candidate region {other_name}")
        candidate_blocks[block] = name
        existing_region_banks = _require_sequence(region.get("banks"), f"{path}.banks")
        candidate_region_banks = _require_sequence(raw["banks"], f"{path}.banks")
        banks = {b["bic8"]: b for b in existing_region_banks}
        for bank_index, raw_bank in enumerate(candidate_region_banks):
            bank_path = f"{path}.banks[{bank_index}]"
            bank = _normalize_bank(raw_bank, region, bank_path)
            bic = bank["bic8"]
            owner = existing_bics.get(bic)
            if owner and owner != name:
                raise ValueError(f"{bank_path}.bic8: already owned by region {owner}")
            if owner and owner == name and bic not in banks:
                raise ValueError(f"{bank_path}.bic8: duplicate canonical candidate BIC")
            if bic in candidate_bics:
                raise ValueError(f"{bank_path}.bic8: duplicate candidate BIC (already in {candidate_bics[bic]})")
            candidate_bics[bic] = name
            if bic in forbidden_global or bic in {x.upper()[:8] for x in region.get("forbidden_bics", [])}:
                raise ValueError(f"{bank_path}.bic8: conflicts with a forbidden BIC")
            prior = banks.get(bic)
            metadata = {k: bank[k] for k in ("bic8", "name", "country", "currencies", "seedable", "source_domains")}
            if prior:
                prior_meta = {
                    "bic8": prior["bic8"],
                    "name": prior["name"],
                    "country": prior["country"],
                    "currencies": prior["currencies"],
                    "seedable": prior.get("seedable", True),
                    "source_domains": prior.get("source_domains", metadata["source_domains"]),
                }
                if prior_meta != metadata:
                    raise ValueError(f"{bank_path}: existing bank metadata is immutable")
                prior_records = prior.get("admitted_records", [])
                if prior_records and record_digest(prior_records) != record_digest(bank["records"]):
                    raise ValueError(f"{bank_path}: admitted record digest mismatch")
            bank["admitted_records"] = bank.pop("records")
            bank["admitted_record_digest"] = record_digest(bank["admitted_records"])
            banks[bic] = bank
        existing_order = [bank["bic8"] for bank in existing_region_banks]
        region["banks"] = [banks[bic] for bic in existing_order if bic in banks]
        region["banks"].extend(
            banks[bic] for bic in sorted(set(banks) - set(existing_order))
        )
        candidate_results = {
            "region": name,
            "banks": [
                {"bic": bank["bic8"], "name": bank["name"], "records": bank["admitted_records"]}
                for bank in region["banks"]
                if bank.get("seedable", True) and bank.get("admitted_records")
            ],
        }
        if not candidate_results["banks"]:
            normalized_regions.append(region)
            continue
        prospective = copy.deepcopy(manifest)
        prospective_region = copy.deepcopy(region)
        prospective_region["banks"] = [
            {k: v for k, v in bank.items() if k not in {"admitted_records", "admitted_record_digest"}}
            for bank in region["banks"]
        ]
        if name in existing_by_name:
            prospective["regions"] = [
                prospective_region if item["name"] == name else item
                for item in prospective["regions"]
            ]
        else:
            prospective["regions"].append(prospective_region)
        problems = validate_results(candidate_results, prospective)
        if problems:
            raise ValueError(f"{path}: candidate SSI validation failed: {'; '.join(problems)}")
        for admitted_bank in region["banks"]:
            if not admitted_bank.get("seedable", True):
                continue
            for record in admitted_bank.get("admitted_records", []):
                if record.get("status") == "illustrative":
                    raise ValueError(f"{path}.banks[{admitted_bank['bic8']}]: illustrative records cannot be seedable")
                if not _bank_owned_source(record["source"], admitted_bank):
                    raise ValueError(
                        f"{path}.banks[{admitted_bank['bic8']}]: source is not bank-owned: {record['source']}"
                    )
        normalized_regions.append(region)
    return normalized_regions


def _manifest_lock_path() -> Path:
    """Return a stable lock outside the repository for this manifest."""
    resolved = REGIONS_FILE.resolve()
    digest = hashlib.sha256(str(resolved).encode("utf-8")).hexdigest()[:24]
    return Path(tempfile.gettempdir()) / f"ssi-autopilot-{digest}.lock"


@contextmanager
def _manifest_lock():
    # Never unlink this file: another process may already be waiting on the
    # same inode, and unlinking would allow two writers to enter concurrently.
    lock_path = _manifest_lock_path()
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def _write_manifest_atomic(manifest: dict) -> None:
    mode = REGIONS_FILE.stat().st_mode & 0o777 if REGIONS_FILE.exists() else 0o644
    directory = REGIONS_FILE.parent
    fd, temp_name = tempfile.mkstemp(prefix=f".{REGIONS_FILE.name}.", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temp_name, mode)
        os.replace(temp_name, REGIONS_FILE)
        dir_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def admit_candidates(payload: dict, *, dry_run: bool = False) -> dict:
    with _manifest_lock():
        manifest = load_manifest()
        normalized = _validate_admission_envelope(payload, manifest)
        proposed = copy.deepcopy(manifest)
        existing = {r["name"]: r for r in proposed["regions"]}
        new_regions = []
        for region in normalized:
            if region["name"] in existing:
                target = existing[region["name"]]
                target["banks"] = region["banks"]
                target["forbidden_bics"] = sorted(set(region.get("forbidden_bics", [])))
            else:
                new_regions.append(region)
        proposed["regions"].extend(sorted(new_regions, key=lambda region: region["name"]))
        added_banks = added_records = unchanged_banks = unchanged_records = 0
        candidate_bics = {
            bank.get("bic8") for raw_region in payload.get("regions", [])
            for bank in raw_region.get("banks", []) if isinstance(raw_region, dict) and isinstance(bank, dict)
        }
        for region in normalized:
            before_region = next((r for r in manifest["regions"] if r["name"] == region["name"]), None)
            before_banks = {b["bic8"]: b for b in (before_region or {}).get("banks", [])}
            for bank in region["banks"]:
                if bank["bic8"] not in candidate_bics:
                    continue
                prior = before_banks.get(bank["bic8"])
                if prior is None:
                    added_banks += 1
                    added_records += len(bank.get("admitted_records", []))
                else:
                    unchanged_banks += 1
                    prior_records = prior.get("admitted_records", [])
                    for record in bank.get("admitted_records", []):
                        if record in prior_records:
                            unchanged_records += 1
                        else:
                            added_records += 1
        summary = {
            "regions": sorted(r["name"] for r in normalized),
            "added_banks": added_banks,
            "added_records": added_records,
            "unchanged_banks": unchanged_banks,
            "unchanged_records": unchanged_records,
        }
        if not dry_run:
            current_bytes = REGIONS_FILE.read_bytes()
            proposed_bytes = (json.dumps(proposed, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
            if proposed_bytes != current_bytes:
                _write_manifest_atomic(proposed)
        return summary


# ── Validation ───────────────────────────────────────────────────────────────
class ValidationError(Exception):
    pass


def validate_admitted_results(results: dict, manifest: dict) -> list[str]:
    problems: list[str] = []
    try:
        region = get_region(manifest, results.get("region", ""))
    except SystemExit:
        return problems
    admitted = {
        bank["bic8"]: bank
        for bank in region.get("banks", [])
        if "admitted_record_digest" in bank
    }
    supplied: dict[str, dict] = {}
    for index, raw_bank in enumerate(results.get("banks", [])):
        try:
            bic = _canonical_bic8(raw_bank.get("bic"), f"banks[{index}].bic")
        except (AttributeError, ValueError) as exc:
            problems.append(str(exc))
            continue
        if bic in supplied:
            problems.append(f"{results['region']}/{bic}: duplicate supplied bank")
            continue
        supplied[bic] = raw_bank
    for bic, bank in admitted.items():
        expected = bank.get("admitted_records", [])
        actual_bank = supplied.get(bic)
        if actual_bank is None:
            problems.append(f"{results['region']}/{bic}: admitted records missing from results")
            continue
        actual_name = actual_bank.get("name")
        if not isinstance(actual_name, str):
            problems.append(f"{results['region']}/{bic}: result bank name must be a string")
        elif " ".join(actual_name.split()) != " ".join(bank.get("name", "").split()):
            problems.append(f"{results['region']}/{bic}: result bank name does not match admitted name")
        actual = actual_bank.get("records", [])
        if not isinstance(actual, list):
            problems.append(f"{results['region']}/{bic}: result records must be a list")
            continue
        normalized = []
        try:
            normalized = [_normalize_record(record, f"{bic}.records[{i}]") for i, record in enumerate(actual)]
        except ValueError as exc:
            problems.append(str(exc))
            continue
        if record_digest(normalized) != bank["admitted_record_digest"]:
            problems.append(f"{results['region']}/{bic}: results do not match the admitted record digest")
        if record_digest(normalized) != record_digest(expected):
            problems.append(f"{results['region']}/{bic}: normalized records differ from admitted records")
    return problems


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

            # BIC-only records assert correspondent availability, not
            # instructions: the source (a correspondent-bank-charges list, a
            # names-only directory) publishes which banks a beneficiary
            # settles through but no accounts, charge codes, or value dates.
            # They are therefore validated *inverted*: the fields an ordinary
            # record must carry are the fields a bic_only record must NOT
            # carry, and the field-wise checks below are skipped for them.
            # Only a real boolean is accepted; "false" the string would
            # silently flip a record's shape.
            raw_bic_only = rec.get("bic_only")
            if raw_bic_only is not None and not isinstance(raw_bic_only, bool):
                problems.append(
                    f"{ben_bic}/{ccy}: bic_only must be a boolean, "
                    f"got {type(raw_bic_only).__name__}"
                )
                raw_bic_only = False
            bic_only = bool(raw_bic_only)

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
            # "published" is the one status asserting present-tense currency,
            # so it has to say who established that. Without this the fold
            # would be silently downgraded at seed time and the research
            # result would not survive.
            #
            # str(None) is "None", a non-empty string: a JSON null would
            # masquerade as a named verifier on a published record, and reject
            # a non-published one for carrying an attribution it does not have.
            # A non-string value is not a name either, whatever status it rides
            # on — silently discarding it would let a 42 pass here and crash
            # the seed with an AttributeError instead of a validation error.
            raw_verified_by = rec.get("verified_by")
            if raw_verified_by is not None and not isinstance(raw_verified_by, str):
                problems.append(
                    f"{ben_bic}/{ccy}: verified_by must be a string, "
                    f"got {type(raw_verified_by).__name__}"
                )
                verified_by = ""
            else:
                verified_by = raw_verified_by.strip() if raw_verified_by else ""
            if status == "published" and not verified_by:
                problems.append(
                    f"{ben_bic}/{ccy}: status 'published' requires verified_by, "
                    f"who confirmed the bank still publishes it"
                )
            if status != "published" and verified_by:
                problems.append(
                    f"{ben_bic}/{ccy}: verified_by is only meaningful for "
                    f"status 'published', got status {status!r}"
                )

            # value_dates is a manifest allowlist that was never consulted.
            # A bic_only record must not carry one at all — the source never
            # established settlement timing.
            if bic_only:
                smuggled = {
                    label: raw
                    for label, raw in (
                        ("nostro", rec.get("nostro")),
                        ("with_an", rec.get("with_an")),
                        ("charge_code", rec.get("charge_code")),
                        ("value_date", rec.get("value_date")),
                    )
                    if raw not in (None, "")
                }
                if smuggled:
                    problems.append(
                        f"{ben_bic}/{ccy}: bic_only record must not carry "
                        f"{sorted(smuggled)} — the source publishes no accounts, "
                        f"charge codes, or value dates for it"
                    )
            else:
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
            # bic_only records are the exception: they carry no accounts at
            # all (checked above), so nothing to mask.
            if not bic_only:
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

            # Charge code — skipped for bic_only records, which carry none.
            if not bic_only and charge not in defaults["charge_codes"]:
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


def _literal(text: str):
    """Evaluate a tuple field while retaining source expressions as text."""
    try:
        return ast.literal_eval(text)
    except (ValueError, SyntaxError):
        return text


def _canonical_bic11(value: object, path: str) -> str:
    """Return the single 11-character identity used by fold keys."""
    if not isinstance(value, str):
        raise ValueError(f"{path}: expected a BIC string")
    bic = value.strip().upper()
    if len(bic) == 8:
        bic += "XXX"
    if not bic_is_valid(bic):
        raise ValueError(f"{path}: invalid BIC {value!r}")
    return bic


def _fold_row_shape(row: tuple[str, ...]) -> dict:
    """Parse supported SSI tuple layouts into named, position-safe fields."""
    if not isinstance(row, tuple) or len(row) not in (12, 13, 14):
        got = len(row) if isinstance(row, tuple) else type(row).__name__
        raise ValueError(f"SSI row has unsupported tuple arity {got}; expected 12, 13, or 14 fields")
    values = [_literal(field) for field in row]
    fields = dict(zip(
        ("beneficiary_bic", "beneficiary_name", "currency", "intermediary_bic",
         "correspondent", "nostro", "with_an", "charge_code", "value_date",
         "notes", "as_of", "status", "verified_by", "bic_only"), values
    ))
    fields["beneficiary_bic"] = _canonical_bic11(fields["beneficiary_bic"], "folded beneficiary BIC")
    fields["intermediary_bic"] = _canonical_bic11(fields["intermediary_bic"], "folded intermediary BIC")
    fields["currency"] = fields["currency"].strip().upper() if isinstance(fields["currency"], str) else fields["currency"]
    fields["status"] = fields["status"].strip().lower() if isinstance(fields["status"], str) else fields["status"]
    if len(row) == 12:
        fields["verified_by"] = None
        fields["bic_only"] = False
    elif len(row) == 13:
        fields["verified_by"] = fields["verified_by"]
        fields["bic_only"] = False
    else:
        if not isinstance(fields["bic_only"], bool):
            raise ValueError("folded 14-field row bic_only must be the boolean literal True or False")
    return fields


def verify_fold(results: dict, head_source: str, folded_source: str) -> list[str]:
    """Bind every folded row to the validated result using canonical identities."""
    problems: list[str] = []
    head_rows = _ssi_rows(head_source)
    folded_rows = _ssi_rows(folded_source)
    head_set = set(head_rows)
    added = [row for row in folded_rows if row not in head_set]

    def parse_rows(rows: list[tuple[str, ...]], label: str, report_errors: bool = True) -> tuple[dict, set]:
        parsed: dict[tuple[str, str, str], dict] = {}
        duplicates: set[tuple[str, str, str]] = set()
        for index, row in enumerate(rows):
            try:
                fields = _fold_row_shape(row)
                key = (fields["beneficiary_bic"], fields["currency"], fields["intermediary_bic"])
            except (ValueError, TypeError, AttributeError) as exc:
                if report_errors:
                    problems.append(f"{label}[{index}]: {exc}")
                continue
            if key in parsed:
                duplicates.add(key)
                if report_errors:
                    problems.append(f"{label}[{index}]: duplicate canonical fold key {key[0]}/{key[1]}/{key[2]}")
            else:
                parsed[key] = fields
        return parsed, duplicates

    head_by_key, _ = parse_rows(head_rows, "head row", report_errors=False)
    added_by_key, _ = parse_rows(added, "added row")
    expected: dict[tuple[str, str, str], dict] = {}
    for bank in results.get("banks", []):
        try:
            ben = _canonical_bic11(bank.get("bic"), "validated beneficiary BIC")
        except (ValueError, TypeError) as exc:
            problems.append(str(exc))
            continue
        for rec in bank.get("records", []):
            try:
                intermediary = _canonical_bic11(rec.get("int_bic"), "validated intermediary BIC")
            except (ValueError, TypeError) as exc:
                problems.append(str(exc))
                continue
            key = (ben, str(rec.get("currency", "")).strip().upper(), intermediary)
            if key in expected:
                problems.append(f"validated results contain duplicate canonical fold key {ben}/{key[1]}/{intermediary}")
            expected[key] = {"bank": bank, "record": rec}

    for key, fields in added_by_key.items():
        item = expected.get(key)
        if item is None:
            problems.append(f"{key[0]}/{key[1]}/{key[2]}: folded into seed.py but not in the validated results — every committed row must have passed validation")
            continue
        bank, rec = item["bank"], item["record"]
        bic_only = rec.get("bic_only") is True
        if fields["bic_only"] != bic_only:
            if bic_only and not fields["bic_only"]:
                problems.append(f"{key[0]}/{key[1]}: folded row is missing the bic_only flag the validated record carries")
            elif fields["bic_only"] and not bic_only:
                problems.append(f"{key[0]}/{key[1]}: folded row carries bic_only but the validated record does not")
            else:
                problems.append(f"{key[0]}/{key[1]}: folded bic_only {fields['bic_only']!r} does not match validated {bic_only!r}")
        comparisons = {"beneficiary_name": bank.get("name", ""), "correspondent": rec.get("correspondent", ""), "as_of": rec.get("as_of", ""), "status": str(rec.get("status", "")).strip().lower()}
        if not bic_only:
            comparisons.update({"nostro": rec.get("nostro", ""), "with_an": rec.get("with_an", ""), "charge_code": str(rec.get("charge_code", "")).upper(), "value_date": rec.get("value_date", "")})
        else:
            comparisons.update({"nostro": None, "with_an": None, "charge_code": None, "value_date": None})
        for field, want in comparisons.items():
            if fields[field] != want:
                if bic_only and field in {"nostro", "with_an", "charge_code", "value_date"}:
                    label = "charge code" if field == "charge_code" else field
                    problems.append(f"{key[0]}/{key[1]}: bic_only row must store None for {label}, folded {fields[field]!r}")
                else:
                    problems.append(f"{key[0]}/{key[1]}: folded {field} {fields[field]!r} does not match validated {want!r}")
        verified = rec.get("verified_by")
        if fields["status"] == "published" and not fields["verified_by"]:
            problems.append(f"{key[0]}/{key[1]}: published folded row requires verified_by")
        if fields["status"] != "published" and fields["verified_by"]:
            problems.append(f"{key[0]}/{key[1]}: folded verified_by is only valid for published rows")
        if fields["verified_by"] != verified:
            problems.append(f"{key[0]}/{key[1]}: folded verified_by {fields['verified_by']!r} does not match validated {verified!r}")
        source = str(rec.get("source", ""))
        if source and source not in str(fields["notes"]):
            problems.append(f"{key[0]}/{key[1]}: folded notes do not cite the validated source {source}")

    for key in expected:
        if key not in added_by_key and key not in head_by_key:
            problems.append(f"{key[0]}/{key[1]}/{key[2]}: was validated but not folded into seed.py")
    return problems


# ── Test scaffolding ─────────────────────────────────────────────────────────
def scaffold_coverage_class(region: dict, manifest: dict) -> str:
    """Generate the region coverage test class for test_data_consistency.py.

    Only banks marked seedable (default true) are required to have seeded
    records; research-proven NOT-SEEDABLE banks stay in the manifest for their
    verified BICs but are excluded from the coverage assertions.

    The class carries three tests: presence (each seedable bank has records
    for every manifest currency), directory membership (each seedable bank is
    also in BANKS), and a semantic pin over every seeded record — masked
    accounts inside the region's block, charge/value dates from the manifest
    defaults, a provenance status and citation, no bic_only smuggled fields,
    and unique (beneficiary, currency, correspondent) keys.
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
    ]
    block = str(region["masked_block"])
    mask_prefix = block[:-2]
    forbidden = sorted({f.upper()[:8] for f in region.get("forbidden_bics", [])})
    legacy = sorted(region.get("legacy_accounts", []))
    charges = manifest["defaults"].get("charge_codes", ["SHA", "OUR", "BEN"])
    vdates = manifest["defaults"].get("value_dates", ["spot", "T+1", "T+2"])
    method = name.replace("-", "_")
    lines += [
        "",
        f"    def test_{method}_seeded_records_are_semantically_valid(self):",
        '        """Every seeded record for this region must satisfy the validator rules:',
        "        masked accounts inside the region's block, charge/value dates from the",
        "        manifest defaults, a provenance status and citation, no bic_only",
        '        smuggled fields, and unique (beneficiary, currency, correspondent) keys.',
        "        Pre-block-era legacy placeholders are enumerated in the manifest's",
        "        legacy_accounts and may not be masked in-block; a new fold record can",
        '        never join that set without an explicit manifest edit."""',
        rf'        mask = re.compile(r"^ACCT-{mask_prefix}\d\d$")',
        f"        allowed_charge = {{{', '.join(repr(c) for c in charges)}}}",
        f"        allowed_value = {{{', '.join(repr(v) for v in vdates)}}}",
        '        statuses = {"unverified", "illustrative", "published", "archived"}',
        f"        forbidden = {{{', '.join(repr(b) for b in forbidden)}}}",
        f"        legacy = {{{', '.join(repr(a) for a in legacy)}}}",
        f"        banks = {{bic for bic, _name, _currencies in {list_name}}}",
        "        rows = [row for row in SSI_RECORDS if row[0] in banks]",
        f'        assert rows, f"{name}: no seeded records for the seedable banks"',
        "        for row in rows:",
        '            bic, ccy = row[0], row[2]',
        '            assert bic[:8] not in forbidden, f"{bic}: BIC is on the forbidden list"',
        "            int_acct, ben_acct, charge, vdate = row[5], row[6], row[7], row[8]",
        "            if len(row) > 13 and row[13] is True:",
        "                assert int_acct is None and ben_acct is None and charge is None and vdate is None, (",
        '                    f"{bic}/{ccy}: bic_only row must not carry accounts, charge, or value date"',
        "                )",
        "                continue",
        f'            assert int_acct is not None and (mask.match(int_acct) or int_acct in legacy), f"{{bic}}/{{ccy}}: nostro {{int_acct}} is neither an ACCT-{mask_prefix}xx masked account nor a manifest legacy placeholder"',
        f'            assert ben_acct is not None and (mask.match(ben_acct) or ben_acct in legacy), f"{{bic}}/{{ccy}}: beneficiary account {{ben_acct}} is neither an ACCT-{mask_prefix}xx masked account nor a manifest legacy placeholder"',
        '            assert charge in allowed_charge, f"{bic}/{ccy}: charge {charge} not in {allowed_charge}"',
        '            assert vdate in allowed_value, f"{bic}/{ccy}: value date {vdate} not in {allowed_value}"',
        "        for row in rows:",
        "            bic, ccy = row[0], row[2]",
        "            if len(row) < 12:",
        "                continue",
        "            if row[10] is not None:",
        '                assert len(row[10]) == 10 and row[10][4] == "-" and row[10][7] == "-", (',
        '                    f"{bic}/{ccy}: as_of {row[10]!r} must be written YYYY-MM-DD"',
        "                )",
        '            assert row[11] in statuses, f"{bic}/{ccy}: status {row[11]!r} not in {statuses}"',
        '            assert row[9] and row[9].startswith("Source:"), (',
        '                f"{bic}/{ccy}: notes must cite the source"',
        "            )",
        "        keys = [(row[0], row[2], row[3]) for row in rows]",
        "        assert len(keys) == len(set(keys)), (",
        f'            f"{name}: duplicate (beneficiary, currency, correspondent) keys"',
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


def cmd_admit(args: argparse.Namespace) -> None:
    input_path = Path(args.candidates)
    try:
        payload = json.loads(input_path.read_text())
        summary = admit_candidates(payload, dry_run=args.dry_run)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise SystemExit(f"admission failed for {input_path}: {exc}") from exc
    action = "would admit" if args.dry_run else "admitted"
    suffix = " (dry-run; manifest not written)" if args.dry_run else ""
    print(
        f"  ✓ {action} {summary['added_banks']} added bank(s), "
        f"{summary['added_records']} added record(s), "
        f"{summary['unchanged_banks']} unchanged bank(s), "
        f"{summary['unchanged_records']} unchanged record(s) in "
        f"{', '.join(summary['regions'])}{suffix}"
    )


def cmd_validate(args: argparse.Namespace) -> None:
    manifest = load_manifest()
    results = json.loads(Path(args.results).read_text())
    problems = validate_results(results, manifest)
    problems.extend(validate_admitted_results(results, manifest))
    if problems:
        for p in problems:
            print(f"  ✗ {p}")
        raise SystemExit(f"validation failed: {len(problems)} problem(s)")
    n = sum(len(b.get("records", [])) for b in results.get("banks", []))
    print(f"  ✓ {results['region']}: {n} records valid")


def cmd_scaffold(args: argparse.Namespace) -> None:
    manifest = load_manifest()
    region = get_region(manifest, args.region)
    text = scaffold_coverage_class(region, manifest)
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
        # SSI rows carry optional provenance: 12 adds as_of and status, 13
        # adds the verifier that "published" requires, 14 adds the bic_only
        # flag (a bank-level list with no account numbers).
        expected = (5,) if name == "BANKS" else (10, 12, 13, 14)
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
        if name == "SSI_RECORDS":
            # The 14th field of a 14-field tuple is the bic_only flag and must
            # be the boolean literal True or False. seed_if_empty checks
            # isinstance(x, bool) and raises on anything else, so a string
            # "False" would be a runtime error there; the AST verifier is the
            # place to catch it before the fold is committed.
            for i, e in enumerate(elts):
                if not (isinstance(e, ast.Tuple) and len(e.elts) == 14):
                    continue
                flag = e.elts[13]
                if not (isinstance(flag, ast.Constant) and isinstance(flag.value, bool)):
                    problems.append(
                        f"{name}[{i}]: the 14th (bic_only) field of a 14-field "
                        f"tuple must be the boolean literal True or False, got "
                        f"{ast.dump(flag)}"
                    )
    if problems:
        raise SystemExit("seed.py invariants failed:\n" + "\n".join(f"  ✗ {p}" for p in problems))
    print("  ✓ seed.py invariants OK (BANKS/SSI_RECORDS arity, no duplicate BICs)")


def cmd_commit(args: argparse.Namespace) -> None:
    manifest = load_manifest()
    results = json.loads(Path(args.results).read_text())
    problems = validate_results(results, manifest)
    problems.extend(validate_admitted_results(results, manifest))
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
        str(path.relative_to(REPO_ROOT))
        for path in (SEED_FILE, TEST_FILE, REGIONS_FILE)
        if path.exists() or path in (SEED_FILE, TEST_FILE, REGIONS_FILE)
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

    p = sub.add_parser("admit", help="admit broadly discovered banks into the region manifest")
    p.add_argument("candidates", help="path to candidate discovery JSON")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(func=cmd_admit)

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
