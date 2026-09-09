#!/usr/bin/env python3
"""Independently attest a redacted HTML SSI evidence sidecar.

This command deliberately fetches the cited source at verification time.  It
keeps account numbers in memory only, records only the source digest and
currency/BIC route keys, and fails closed if either the source bytes or the
extracted route set differs from the committed evidence.

Usage:
    python scripts/ssi-autopilot/verify_source_attestation.py \
        tests/fixtures/ssi_wave21_source_attestation.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

_CURRENCY = re.compile(r"^[A-Z]{3}$")
_BIC = re.compile(r"^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$")
_VIEWSTATE = re.compile(rb'<input type="hidden" name="__VIEWSTATE"[^>]*>')


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


def _route_keys(source_html: bytes) -> set[tuple[str, str]]:
    parser = _TableParser()
    parser.feed(source_html.decode("utf-8", errors="replace"))
    routes: set[tuple[str, str]] = set()
    for row in parser.rows:
        currency = next((cell.upper() for cell in row if _CURRENCY.fullmatch(cell.upper())), None)
        if currency is None:
            continue
        bics = []
        for cell in row:
            compact = re.sub(r"\s+", "", cell.upper())
            if _BIC.fullmatch(compact):
                bics.append(compact)
        if bics:
            routes.add((currency, bics[-1]))
    return routes


def _canonical_source_bytes(source_html: bytes) -> bytes:
    """Remove the per-request ASP.NET state token before hashing the page."""
    return _VIEWSTATE.sub(b"", source_html)


def verify(evidence_path: Path) -> dict[str, object]:
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    request = Request(
        evidence["source"],
        headers={"User-Agent": "Relay SSI source attestation/1"},
    )
    with urlopen(request, timeout=30) as response:
        source_bytes = response.read()
    source_sha256 = hashlib.sha256(_canonical_source_bytes(source_bytes)).hexdigest()
    if source_sha256 != evidence["source_sha256"]:
        raise SystemExit(
            f"source digest mismatch: expected {evidence['source_sha256']}, "
            f"got {source_sha256}"
        )

    aliases = evidence.get("source_snapshot", {}).get("bic_aliases", evidence.get("bic_aliases", {}))
    actual = {(currency, aliases.get(bic, bic)) for currency, bic in _route_keys(source_bytes)}
    if "routes" in evidence:
        expected = {(route["currency"], route["int_bic"]) for route in evidence["routes"]}
    else:
        expected = {tuple(route) for route in evidence["route_keys"]}
    if actual != expected:
        raise SystemExit(
            "source route-key mismatch:\n"
            f"  missing={sorted(expected - actual)}\n"
            f"  unexpected={sorted(actual - expected)}"
        )
    return {
        "source": evidence["source"],
        "source_sha256": source_sha256,
        "route_count": len(actual),
        "raw_accounts_committed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.evidence), sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
