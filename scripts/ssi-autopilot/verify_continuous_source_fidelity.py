#!/usr/bin/env python3
"""Check continuous-batch route keys against live bank-published sources.

This is intentionally a separate trusted check from the snapshot-consistency
test.  The latter compares files in the pull request; this command fetches
each cited bank URL at verification time and compares the route components it
can read from the response with the independently recorded fixture.  It never
prints or writes source bytes or account values.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
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


def _route_present(text: str, currency: str, bic: str) -> bool:
    """Require both route components in one source-local context.

    PDF text extraction can put a currency on one line and its BIC on the next
    several lines.  A bounded 20-line window catches that layout without
    treating two unrelated pages as a route.  If the source renders a table as
    one long HTML line, the compact fallback still checks the complete body.
    The first six BIC characters are the stable institution/country prefix;
    PDF renderers commonly omit the branch suffix or insert spaces in it.
    """
    lines = [re.sub(r"\s+", " ", line.upper()).strip() for line in text.splitlines()]
    currency_pattern = re.compile(r"\s*".join(map(re.escape, currency.upper())))
    bic_prefix = _compact(bic)[:6]
    bic_pattern = re.compile(r"\s*".join(map(re.escape, bic_prefix)))
    for index, line in enumerate(lines):
        if currency_pattern.search(line):
            context = " ".join(lines[max(0, index - 2) : index + 20])
            if bic_pattern.search(context):
                return True
    compact = _compact(text)
    return _compact(currency) in compact and bic_prefix in compact


def verify(manifest_path: Path) -> dict:
    fetcher = _load_fetcher()
    manifest = json.loads(manifest_path.read_text())
    def check(source: dict) -> dict:
        fixture = json.loads((ROOT / source["source_extract_fixture"]).read_text())
        payload = fetcher._fetch(
            source["url"], user_agent="Mozilla/5.0 (Relay SSI source attestation/2)"
        )
        text = _source_text(payload)
        missing = [
            (route["currency"], route["intermediary_bic"])
            for route in fixture["routes"]
            if not _route_present(text, route["currency"], route["intermediary_bic"])
        ]
        if missing:
            raise RuntimeError(
                f"{source['url']} is missing {len(missing)} recorded route keys"
            )
        return {
            "url": source["url"],
            "source_sha256": hashlib.sha256(
                fetcher._canonical_source_bytes(payload)
            ).hexdigest(),
            "recorded_source_sha256": source["source_sha256"],
            "route_count": len(fixture["routes"]),
            "route_keys_checked": len(fixture["routes"]),
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
    args = parser.parse_args()
    try:
        report = verify(args.manifest)
    except Exception as exc:  # noqa: BLE001 - CLI must print one safe refusal
        print(f"continuous source fidelity failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
