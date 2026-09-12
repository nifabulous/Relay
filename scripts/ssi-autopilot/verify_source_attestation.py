#!/usr/bin/env python3
"""Independently attest a redacted HTML SSI evidence sidecar.

This command deliberately fetches the cited source at verification time.  It
keeps account numbers in memory only, records only the source digest, the
currency/BIC route keys and the account fingerprints, and fails closed if any
of the three differs from the committed evidence.

Three checks, in increasing strength:

*   the canonical source digest, which detects any change to the page;
*   the currency/BIC route keys, which detect a correspondent being added,
    removed or re-pointed;
*   the account fingerprints, which detect an account moving underneath an
    unchanged route key.

The third check exists because the first two cannot replace it.  Wave 21's
``AUD``/``CHASGB2L`` account changed at the source while its currency and BIC
stayed put: the route-key check passed, the digest check failed, and the
digest was re-recorded as a routine refresh.  A digest whose only remedy is
"edit the expected value" is not a trust anchor, so refreshing one now
requires re-deriving every fingerprint from the live page and leaving a
re-verification record behind.

Usage:
    # Verify (this is what CI runs)
    python scripts/ssi-autopilot/verify_source_attestation.py \
        scripts/ssi-autopilot/evidence/ssi-wave21-fnnbtris-2026-09-08.json

    # Re-record a digest after the page was re-rendered but says the same thing
    python scripts/ssi-autopilot/verify_source_attestation.py EVIDENCE \
        --refresh --record scripts/ssi-autopilot/evidence/reverification

    # Accept a genuine account change at the source, deliberately and on the record
    python scripts/ssi-autopilot/verify_source_attestation.py EVIDENCE \
        --refresh --accept-account-change AUD:CHASGB2L \
        --record scripts/ssi-autopilot/evidence/reverification
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

_CURRENCY = re.compile(r"^[A-Z]{3}$")
_BIC = re.compile(r"^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$")
_VIEWSTATE = re.compile(rb'<input type="hidden" name="__VIEWSTATE"[^>]*>')

RECORD_SCHEMA = 1
ROOT = Path(__file__).resolve().parents[2]
TOOL = "scripts/ssi-autopilot/verify_source_attestation.py"


class AttestationError(SystemExit):
    """Base for every refusal.

    Subclasses SystemExit so the command-line behaviour and exit codes are
    unchanged, while callers that need to tell one refusal from another — the
    sweep, above all — can catch precisely instead of matching on message
    text. A sweep that cannot distinguish "this source is a PDF" from "this
    evidence file is malformed" reports a schema defect as a benign format
    limitation.
    """


class UnreadableSource(AttestationError):
    """The extractor could not read the fetched source at all."""


class EvidenceWithoutRoutes(AttestationError):
    """The evidence pins a digest but records nothing to compare against."""


class EvidenceWithoutFingerprints(AttestationError):
    """The evidence records routes but not the accounts behind them."""


class MaskEqualityBroken(AttestationError):
    """A change would leave masks and fingerprints disagreeing about equality."""


class DuplicateRouteKey(AttestationError):
    """The source lists one currency/BIC twice with conflicting accounts."""


class _TableParser(HTMLParser):
    """Extract table cell text without retaining the source document."""

    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag == "td" and self._row is not None:
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "td" and self._row is not None and self._cell is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row:
            self.rows.append(self._row)
            self._row = None


def _rows(source_html: bytes) -> list[list[str]]:
    parser = _TableParser()
    parser.feed(source_html.decode("utf-8", errors="replace"))
    return parser.rows


def _compact(cell: str) -> str:
    """The page renders some BICs with internal spaces, e.g. `CITI US 33`."""
    return re.sub(r"\s+", "", cell.upper())


def _bic_indexes(row: list[str]) -> list[int]:
    return [index for index, cell in enumerate(row) if _BIC.fullmatch(_compact(cell))]


def _currency(row: list[str]) -> str | None:
    return next((cell.upper() for cell in row if _CURRENCY.fullmatch(cell.upper())), None)


def account_fingerprint(value: str) -> str:
    """SHA-256 over the account with punctuation removed and letters upper-cased.

    Recovered from the wave-21 evidence rather than designed here: the
    committed fingerprints predate any code that produced them, so the
    derivation is pinned by a golden vector in the tests.  Note that this is
    an unsalted hash of a short, public account string and is therefore
    reversible by brute force; it redacts the account from the repository, it
    does not make a private value safe to publish.
    """
    return hashlib.sha256(re.sub(r"[^A-Z0-9]", "", value.upper()).encode()).hexdigest()


def _route_keys(source_html: bytes) -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for row in _rows(source_html):
        currency = _currency(row)
        if currency is None:
            continue
        bics = [_compact(row[index]) for index in _bic_indexes(row)]
        if bics:
            routes.add((currency, bics[-1]))
    return routes


def route_fingerprints(
    source_html: bytes, aliases: dict[str, str]
) -> dict[tuple[str, str], str]:
    """Map each route key to the fingerprint of the account beside it.

    The account is the cell immediately before the intermediary BIC, which is
    how every row on the source page is laid out.  Account values are hashed
    as they are read and never returned.
    """
    fingerprints: dict[tuple[str, str], str] = {}
    for row in _rows(source_html):
        currency = _currency(row)
        if currency is None:
            continue
        indexes = _bic_indexes(row)
        if not indexes or indexes[-1] == 0:
            continue
        bic = _compact(row[indexes[-1]])
        key = (currency, aliases.get(bic, bic))
        fingerprint = account_fingerprint(row[indexes[-1] - 1])
        # A dict would let the last row win, so a source listing one route
        # twice with different accounts would collapse to whichever came
        # last, and evidence holding that account would verify clean while a
        # second, conflicting instruction sat on the page unread.
        #
        # An exactly repeated row says the same thing twice and is no
        # ambiguity, so only a conflict is refused. A page that really does
        # carry two accounts per route — a plain and a securitisation
        # account, say — needs the extractor taught which is which, since
        # that is the nostro/with_an distinction the schema already has.
        if key in fingerprints and fingerprints[key] != fingerprint:
            raise DuplicateRouteKey(
                f"source lists {key} more than once with different accounts. "
                "Which one is the settlement instruction cannot be decided "
                "here; if the page carries a plain and a securitisation "
                "account per route, the extractor has to tell them apart "
                "before this source can be attested."
            )
        fingerprints[key] = fingerprint
    return fingerprints


def _canonical_source_bytes(source_html: bytes) -> bytes:
    """Remove the per-request ASP.NET state token before hashing the page."""
    return _VIEWSTATE.sub(b"", source_html)


def _expected_routes(evidence: dict) -> set[tuple[str, str]]:
    if evidence.get("routes"):
        return {(route["currency"], route["int_bic"]) for route in evidence["routes"]}
    if evidence.get("route_keys"):
        return {tuple(route) for route in evidence["route_keys"]}
    # An evidence file with a digest but no routes pins a page while recording
    # nothing about what the page said. Comparing it would return "verified"
    # over an empty set, which is the most misleading answer available.
    raise EvidenceWithoutRoutes(
        "evidence records no routes and no route_keys: its digest can be "
        "verified, but there is nothing to check the source against. Capture "
        "the routes before treating this file as an attestation."
    )


def _aliases(evidence: dict) -> dict[str, str]:
    snapshot = evidence.get("source_snapshot", {})
    return snapshot.get("bic_aliases", evidence.get("bic_aliases", {}))


def compare(evidence: dict, source_bytes: bytes) -> dict:
    """Compare committed evidence against fetched source bytes.

    Pure: no network, no filesystem, and no raw account value in the result.
    """
    digest = hashlib.sha256(_canonical_source_bytes(source_bytes)).hexdigest()
    aliases = _aliases(evidence)

    expected = _expected_routes(evidence)
    actual = {
        (currency, aliases.get(bic, bic)) for currency, bic in _route_keys(source_bytes)
    }
    # Extracting nothing from a source that should hold routes means the
    # extractor did not understand the format, not that every correspondent
    # changed at once. The route extractor reads HTML tables; several evidence
    # files cite PDFs, whose digests verify while their routes cannot be read
    # at all. Saying so is the honest answer — reporting wholesale drift would
    # send someone hunting for a change that never happened.
    if expected and not actual:
        raise UnreadableSource(
            f"extracted 0 routes from {len(source_bytes)} bytes while the evidence "
            f"expects {len(expected)}. The route extractor reads HTML tables; this "
            "source is probably a PDF or a script-rendered page. Its digest can "
            "still be verified, but its routes and accounts cannot."
        )
    missing = sorted(expected - actual)
    unexpected = sorted(actual - expected)

    live = route_fingerprints(source_bytes, aliases)
    routes = evidence.get("routes", [])

    # Route-key-only evidence predates fingerprint capture. Comparing it
    # checks zero accounts while reporting a clean match, which is the
    # three-check contract silently reduced to two — and it is exactly the
    # shape an account move hides in.
    unfingerprinted = [
        (route["currency"], route["int_bic"])
        for route in routes
        if "nostro_fingerprint" not in route or "with_an_fingerprint" not in route
    ]
    if expected and (not routes or unfingerprinted):
        raise EvidenceWithoutFingerprints(
            "evidence records no account fingerprints for "
            f"{sorted(unfingerprinted) if unfingerprinted else 'any route'}. "
            "Its digest and route keys can be checked; its accounts cannot, so "
            "no comparison over it may be reported as verified."
        )

    # A fingerprint is committed in four places per route: nostro and with_an,
    # each duplicated into source_snapshot.routes. Checking one leaves three
    # fields a hand can edit without the verifier noticing.
    snapshot = {
        (route["currency"], route["int_bic"]): route
        for route in evidence.get("source_snapshot", {}).get("routes", [])
    }
    changed: list[dict[str, str]] = []
    checked = 0
    matched = 0
    for route in routes:
        key = (route["currency"], route["int_bic"])
        # A route the source no longer carries has no account to compare.
        # Counting it as an account move reports one defect twice and inflates
        # every account-change total built on top of this.
        if key not in live:
            continue
        checked += 1
        committed = {route["nostro_fingerprint"], route["with_an_fingerprint"]}
        mirror = snapshot.get(key)
        if mirror is not None:
            committed |= {
                mirror.get("nostro_fingerprint"),
                mirror.get("with_an_fingerprint"),
            }
        if committed == {live[key]}:
            matched += 1
        else:
            changed.append({"currency": key[0], "int_bic": key[1]})
    return {
        "source_sha256": digest,
        "digest_matches": digest == evidence.get("source_sha256"),
        "route_keys": {
            "expected": len(expected),
            "actual": len(actual),
            "missing": missing,
            "unexpected": unexpected,
            "match": not missing and not unexpected,
        },
        "fingerprints": {
            "checked": checked,
            "matched": matched,
            "changed": changed,
        },
        "match": not missing and not unexpected and not changed,
    }


def _fetch(source: str) -> bytes:
    request = Request(source, headers={"User-Agent": "Relay SSI source attestation/1"})
    with urlopen(request, timeout=30) as response:
        return response.read()


def _apply_accepted_changes(
    evidence: dict, source_bytes: bytes, accepted: set[tuple[str, str]]
) -> list[dict[str, str]]:
    """Re-point the named routes at the account the page serves now."""
    live = route_fingerprints(source_bytes, _aliases(evidence))
    applied: list[dict[str, str]] = []
    blocks = [evidence.get("routes", []), evidence.get("source_snapshot", {}).get("routes", [])]
    for key in sorted(accepted):
        if key not in live:
            raise AttestationError(f"cannot accept {key}: the live page has no such route")
        for block in blocks:
            for route in block:
                if (route["currency"], route["int_bic"]) == key:
                    route["nostro_fingerprint"] = live[key]
                    route["with_an_fingerprint"] = live[key]
        applied.append({"currency": key[0], "int_bic": key[1]})
    _assert_mask_equality(evidence)
    return applied


def _assert_mask_equality(evidence: dict) -> None:
    """Masks record account equality; check that in both directions.

    Two routes share a mask exactly when they share an account. An accepted
    change can break that either way: a route joining another route's account
    needs the two masks merged, and a route leaving a shared account needs the
    mask split. Guarding only the first leaves the second silently wrong —
    masks still claiming an equality the fingerprints no longer have.

    Re-masking is a data decision with consequences in the manifest and the
    seed, so this refuses rather than doing it.
    """
    routes = [
        route
        for route in evidence.get("routes", [])
        if "nostro_mask" in route and "with_an_mask" in route
    ]
    for index, left in enumerate(routes):
        for right in routes[index + 1 :]:
            masks_equal = (left["nostro_mask"], left["with_an_mask"]) == (
                right["nostro_mask"],
                right["with_an_mask"],
            )
            accounts_equal = (
                left["nostro_fingerprint"],
                left["with_an_fingerprint"],
            ) == (right["nostro_fingerprint"], right["with_an_fingerprint"])
            if masks_equal == accounts_equal:
                continue
            left_key = (left["currency"], left["int_bic"])
            right_key = (right["currency"], right["int_bic"])
            action = "split" if masks_equal else "merged"
            raise MaskEqualityBroken(
                f"refusing the change: {left_key} and {right_key} would have "
                f"{'the same mask but different accounts' if masks_equal else 'different masks but the same account'}. "
                f"Masks record account equality, so their masks must be {action} "
                "first — in the evidence, the manifest and the seed together."
            )


def _write_record(
    directory: Path,
    evidence_path: Path,
    evidence: dict,
    previous_digest: str,
    report: dict,
    accepted: list[dict[str, str]],
) -> Path:
    verified_at = datetime.date.today().isoformat()
    record = {
        "schema": RECORD_SCHEMA,
        "evidence": evidence_path.resolve().relative_to(ROOT).as_posix(),
        "source": evidence["source"],
        "verified_at": verified_at,
        "previous_source_sha256": previous_digest,
        "source_sha256": report["source_sha256"],
        "digest_changed": previous_digest != report["source_sha256"],
        "route_keys": {
            "expected": report["route_keys"]["expected"],
            "actual": report["route_keys"]["actual"],
            "match": report["route_keys"]["match"],
        },
        "fingerprints": report["fingerprints"],
        "accepted_account_changes": accepted,
        "raw_accounts_committed": False,
        "tool": TOOL,
    }
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{evidence_path.stem}-reverified-{verified_at}.json"
    path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def _refresh_digest(evidence_path: Path, evidence: dict, digest: str) -> None:
    """Rewrite the evidence atomically, so a failed write leaves the old file."""
    evidence["source_sha256"] = digest
    snapshot = evidence.get("source_snapshot")
    if snapshot is not None:
        snapshot["source_sha256"] = digest
        snapshot["captured_at"] = datetime.date.today().isoformat()
    payload = json.dumps(evidence, indent=2, ensure_ascii=False) + "\n"
    temporary = evidence_path.with_suffix(evidence_path.suffix + ".tmp")
    temporary.write_text(payload, encoding="utf-8")
    os.replace(temporary, evidence_path)


def _parse_route(value: str) -> tuple[str, str]:
    currency, _, bic = value.partition(":")
    if not currency or not bic:
        raise argparse.ArgumentTypeError(
            f"expected CURRENCY:BIC (for example AUD:CHASGB2L), got {value!r}"
        )
    return currency.upper(), bic.upper()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path)
    parser.add_argument(
        "--record",
        type=Path,
        help="directory to write the re-verification record into",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="re-record the source digest once every route and fingerprint matches",
    )
    parser.add_argument(
        "--accept-account-change",
        type=_parse_route,
        action="append",
        default=[],
        metavar="CURRENCY:BIC",
        dest="accepted",
        help="accept that this route's account moved at the source",
    )
    return parser


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse and validate, so an invalid combination fails before any fetch."""
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.refresh and args.record is None:
        parser.error(
            "--refresh requires --record: a digest may only change alongside the "
            "record of the re-verification that justified it"
        )
    if args.accepted and not args.refresh:
        parser.error("--accept-account-change only applies with --refresh")
    return args


def verify(evidence_path: Path, record_dir: Path | None = None) -> dict:
    """Fetch the cited source and fail closed on any difference."""
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    report = compare(evidence, _fetch(evidence["source"]))
    if not report["digest_matches"]:
        raise SystemExit(
            f"source digest mismatch: expected {evidence['source_sha256']}, "
            f"got {report['source_sha256']}"
        )
    if not report["route_keys"]["match"]:
        raise SystemExit(
            "source route-key mismatch:\n"
            f"  missing={report['route_keys']['missing']}\n"
            f"  unexpected={report['route_keys']['unexpected']}"
        )
    if report["fingerprints"]["changed"]:
        raise SystemExit(
            "source account mismatch on an unchanged route key:\n"
            f"  changed={report['fingerprints']['changed']}\n"
            "The correspondent is the same but its account moved. Re-check the "
            "page, then re-run with --refresh --accept-account-change."
        )
    written = None
    if record_dir is not None:
        written = _write_record(
            record_dir, evidence_path, evidence, evidence["source_sha256"], report, []
        )
    return {
        "source": evidence["source"],
        "source_sha256": report["source_sha256"],
        "route_count": report["route_keys"]["actual"],
        "fingerprints_matched": report["fingerprints"]["matched"],
        "record": str(written) if written else None,
        "raw_accounts_committed": False,
    }


def reverify(
    evidence_path: Path,
    record_dir: Path | None,
    accepted: list[tuple[str, str]],
) -> dict:
    """Re-derive every check from the live page, then record what was seen."""
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    previous_digest = evidence["source_sha256"]
    source_bytes = _fetch(evidence["source"])

    applied = _apply_accepted_changes(evidence, source_bytes, set(accepted))
    report = compare(evidence, source_bytes)

    if not report["route_keys"]["match"]:
        raise SystemExit(
            "refusing to refresh: source route-key mismatch:\n"
            f"  missing={report['route_keys']['missing']}\n"
            f"  unexpected={report['route_keys']['unexpected']}"
        )
    if report["fingerprints"]["changed"]:
        raise SystemExit(
            "refusing to refresh: an account moved on an unchanged route key:\n"
            f"  changed={report['fingerprints']['changed']}\n"
            "Accept each one explicitly with --accept-account-change CURRENCY:BIC "
            "once you have confirmed the change at the source."
        )

    # The record is written first, and the evidence only after it lands. The
    # failure this ordering rules out is the one the whole change exists to
    # prevent: a refreshed digest sitting in the repository with nothing
    # recording why it moved. The inverse failure — a record naming a digest
    # the evidence never took — is inert, because coverage is checked from the
    # evidence outwards.
    written = None
    if record_dir is not None:
        written = _write_record(
            record_dir, evidence_path, evidence, previous_digest, report, applied
        )
    _refresh_digest(evidence_path, evidence, report["source_sha256"])
    return {
        "evidence": str(evidence_path),
        "previous_source_sha256": previous_digest,
        "source_sha256": report["source_sha256"],
        "route_count": report["route_keys"]["actual"],
        "fingerprints_matched": report["fingerprints"]["matched"],
        "accepted_account_changes": applied,
        "record": str(written) if written else None,
        "raw_accounts_committed": False,
    }


def main() -> int:
    args = parse_args()
    if args.refresh:
        result = reverify(args.evidence, args.record, args.accepted)
    else:
        result = verify(args.evidence, args.record)
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
