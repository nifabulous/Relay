#!/usr/bin/env python3
"""Check continuous-batch routes against live bank-published sources.

This is intentionally a separate trusted check from the snapshot-consistency
test.  The latter compares files in the pull request; this command fetches
each cited bank URL at verification time and compares exact source-local
currency/full-BIC rows and beneficiary names with the independently recorded
fixture. It never prints or writes source bytes or account values. The optional
JSON report is a workflow-owned retrieval record containing only route digests
and counts.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import io
import json
import re
import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERIFIER = ROOT / "scripts" / "ssi-autopilot" / "verify_source_attestation.py"
DEFAULT_MANIFEST = (
    ROOT / "scripts" / "ssi-autopilot" / "evidence" / "ssi-continuous-20260925-batch.json"
)


def _load_fetcher():
    spec = spec_from_file_location("ssi_source_attestation", VERIFIER)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the pinned source fetcher")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _compact(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def _pdf_text(payload: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - exercised in CI setup
        raise RuntimeError("pypdf is required to verify PDF source routes") from exc
    reader = PdfReader(io.BytesIO(payload))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _source_text(payload: bytes) -> str:
    if payload.lstrip().startswith(b"%PDF-"):
        return _pdf_text(payload)
    return payload.decode("utf-8", errors="replace")


_CURRENCIES = {
    "AED",
    "ACU",
    "AUD",
    "BBD",
    "BDT",
    "BHD",
    "BGN",
    "BSD",
    "BWP",
    "CAD",
    "CHF",
    "CLP",
    "CNY",
    "CNH",
    "CZK",
    "CRC",
    "DKK",
    "EGP",
    "EUR",
    "FJD",
    "GBP",
    "HKD",
    "HUF",
    "IDR",
    "ILS",
    "INR",
    "ISK",
    "JPY",
    "JMD",
    "JOD",
    "KES",
    "KRW",
    "KWD",
    "KZT",
    "LKR",
    "MAD",
    "MXN",
    "NOK",
    "NZD",
    "OMR",
    "PEN",
    "PHP",
    "PKR",
    "PLN",
    "QAR",
    "RON",
    "RUB",
    "RSD",
    "SAR",
    "SEK",
    "SGD",
    "THB",
    "TND",
    "TRY",
    "UGX",
    "USD",
    "ZMW",
    "ZAR",
}

# Repository seed loading keeps a small, explicit alias table for legacy
# canonical BIC spellings. Accept only the complete source-published alias,
# never a short institution prefix.
_SOURCE_BIC_ALIASES = {"PNBPUS33XXX": ("PNBPUS3NNYC",)}


def _currency_tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"(?<![A-Z])([A-Z]{3})(?![A-Z])", value.upper())
        if token in _CURRENCIES
    }


def _bic_pattern(bic: str) -> re.Pattern[str]:
    """Match a complete BIC, allowing the source's optional spaces.

    SWIFT tables commonly publish an eight-character BIC while the ledger uses
    the standards-defined eleven-character form with an ``XXX`` branch.  That
    is the only shortening accepted here; an institution/country prefix is not
    enough to corroborate a route.
    """
    compact = _compact(bic)
    # A source is authoritative for the identifier it actually publishes. If
    # it omits the optional branch suffix, the eight-character BIC is the
    # complete value we can corroborate; inventing a branch would be weaker
    # than accepting the published base. The source must still match all four
    # institution/country/location characters and both national characters.
    values = [compact, compact[:8]] if len(compact) == 11 else [compact]
    values.extend(_compact(alias) for alias in _SOURCE_BIC_ALIASES.get(compact, ()))
    alternatives = [r"\s*".join(map(re.escape, value)) for value in values]
    return re.compile(
        r"(?<![A-Z0-9])(?:" + "|".join(alternatives) + r")(?![A-Z0-9])"
    )


def _html_contexts(payload: bytes, fetcher) -> list[str]:
    rows = [[cell.upper() for cell in row] for row in fetcher._rows(payload)]
    contexts: list[str] = []
    for index, row in enumerate(rows):
        context = " | ".join(row)
        currencies = _currency_tokens(context)
        if not currencies:
            continue
        parts = [context]
        # A few official pages render the currency and SWIFT/BIC as adjacent
        # table rows rather than one row. Join only those immediate rows, and
        # stop as soon as another currency section starts.
        for following in rows[index + 1 : index + 4]:
            following_context = " | ".join(following)
            if _currency_tokens(following_context):
                break
            parts.append(following_context)
            if any(
                re.fullmatch(r"[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?", _compact(cell))
                for cell in following
            ):
                break
        contexts.append(" | ".join(parts))
    return contexts


def _pdf_contexts(text: str) -> list[str]:
    """Return bounded source rows from extracted PDF text.

    Some PDFs put the correspondent BIC on the same row as the currency;
    others use a currency heading followed by a labelled ``SWIFT Code`` line.
    The thirty-line window covers that documented layout while keeping unrelated
    currency sections separate.
    """
    lines = [re.sub(r"\s+", " ", line.upper()).strip() for line in text.splitlines()]
    contexts: list[str] = []
    for index, line in enumerate(lines):
        if not _currency_tokens(line):
            continue
        next_currency = next(
            (
                candidate
                for candidate in range(index + 1, min(index + 31, len(lines)))
                if _currency_tokens(lines[candidate])
            ),
            None,
        )
        end = next_currency if next_currency is not None else min(index + 30, len(lines))
        contexts.append(" ".join(lines[index:end]))
    return contexts


def _route_contexts(payload: bytes, text: str, fetcher) -> list[str]:
    if payload.lstrip().startswith(b"%PDF-"):
        return _pdf_contexts(text)
    return _html_contexts(payload, fetcher)


def _bic_matches(context: str, bic: str) -> bool:
    return bool(_bic_pattern(bic).search(context))


def _route_present(contexts: list[str], currency: str, bic: str) -> bool:
    """Require currency and the complete intermediary BIC in one source row."""
    for context in contexts:
        if currency.upper() in _currency_tokens(context) and _bic_matches(context, bic):
            return True
    return False


def _beneficiary_name_present(text: str, name: str) -> bool:
    """Confirm the official page identifies the beneficiary bank.

    A few correspondent-only bank pages do not print their own BIC.  Their
    published title/body still names the bank, which is the strongest
    beneficiary identity the source exposes without inferring a BIC.
    """
    words = [word for word in re.findall(r"[A-Z0-9]+", name.upper()) if len(word) > 2]
    haystack = _compact(text)
    return bool(words) and all(_compact(word) in haystack for word in words[:3])


def _route_digest(routes: list[dict]) -> str:
    canonical = [
        (
            route["beneficiary_bic"],
            route["currency"],
            route["intermediary_bic"],
            route["intermediary_name"],
        )
        for route in routes
    ]
    payload = json.dumps(canonical, ensure_ascii=False, separators=(",", ":"))
    import hashlib

    return hashlib.sha256(payload.encode()).hexdigest()


def verify(manifest_path: Path) -> dict:
    fetcher = _load_fetcher()
    manifest = json.loads(manifest_path.read_text())

    def check(source: dict) -> dict:
        fixture = json.loads((ROOT / source["source_extract_fixture"]).read_text())
        fixture_digest = _route_digest(fixture["routes"])
        if fixture_digest != fixture["route_digest"] or fixture_digest != source["route_digest"]:
            raise RuntimeError(f"{source['url']} has inconsistent route digests")
        payload = fetcher._fetch(
            source["url"], user_agent="Mozilla/5.0 (Relay SSI source attestation/2)"
        )
        text = _source_text(payload)
        contexts = _route_contexts(payload, text, fetcher)
        missing = [
            (route["currency"], route["intermediary_bic"])
            for route in fixture["routes"]
            if not _route_present(contexts, route["currency"], route["intermediary_bic"])
        ]
        if missing:
            raise RuntimeError(
                f"{source['url']} is missing {len(missing)} recorded route keys"
            )
        beneficiary_names = {route["beneficiary_name"] for route in fixture["routes"]}
        if not all(_beneficiary_name_present(text, name) for name in beneficiary_names):
            raise RuntimeError(f"{source['url']} does not identify every beneficiary bank")
        return {
            "url": source["url"],
            "route_count": len(fixture["routes"]),
            "route_keys_checked": len(fixture["routes"]),
            "route_digest": fixture_digest,
            "beneficiary_names_checked": len(beneficiary_names),
        }
    # The cited sources are independent hosts. Fetching them concurrently keeps
    # one slow bank endpoint from making the trusted job exceed its wall clock
    # budget, while the fetcher's per-source timeout still bounds every request.
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(check, manifest["sources"]))
    return {"batch": manifest["batch"], "sources": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", nargs="?", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--report",
        type=Path,
        help="write the live route attestation to this workflow-owned path",
    )
    args = parser.parse_args()
    try:
        report = verify(args.manifest)
    except Exception as exc:  # noqa: BLE001 - CLI must print one safe refusal
        print(f"continuous source fidelity failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    if args.report:
        args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
