"""No real bank name reaches the landing page.

Page text comes from the landing sources, the scheme reference data and the
corridor table, so all three are scanned against every bank name in the seed
directory, as is the built page when it exists.
"""
import re
from pathlib import Path

import pytest

from app.data.landing_corridors import LANDING_CORRIDORS
from app.data.payment_schemes import (
    get_international_schemes,
    get_schemes_for_currency,
    list_currencies_with_schemes,
)
from app.services.seed import BANKS

REPO_ROOT = Path(__file__).resolve().parents[1]
LANDING_SOURCES = REPO_ROOT / "frontend" / "src" / "landing"
BUILT_PAGE = REPO_ROOT / "app" / "landing_dist" / "landing.html"
NAMES = sorted({name for _bic, name, *_ in BANKS})


def _hits(text: str) -> list:
    lowered = text.lower()
    return [
        name
        for name in NAMES
        if re.search(r"(?<![a-z0-9])" + re.escape(name.lower()) + r"(?![a-z0-9])", lowered)
    ]


def _source_files():
    entry = REPO_ROOT / "frontend" / "landing.html"
    files = [entry] if entry.exists() else []
    for path in LANDING_SOURCES.rglob("*"):
        if path.is_file() and "generated" not in path.parts and path.suffix in {".ts", ".tsx", ".json", ".css"}:
            files.append(path)
    return files


def test_the_scan_has_names_and_sources_to_check():
    assert len(NAMES) > 500
    assert len(_source_files()) > 20


@pytest.mark.parametrize("path", _source_files(), ids=lambda p: str(p.relative_to(REPO_ROOT)))
def test_landing_sources_name_no_real_bank(path):
    assert _hits(path.read_text(encoding="utf-8")) == []


def test_rendered_reference_data_names_no_real_bank():
    rendered = []
    for code in list_currencies_with_schemes():
        for scheme in get_schemes_for_currency(code)["schemes"]:
            rendered += [scheme["name"], scheme["speed"], scheme["limit"], scheme["cost"]]
    international = get_international_schemes()
    rendered += [international[k] for k in ("name", "speed", "limit", "cost")]
    for corridor in LANDING_CORRIDORS:
        rendered += [corridor["origin"]["city"], corridor["destination"]["city"]]
    assert _hits("\n".join(rendered)) == []


@pytest.mark.skipif(not BUILT_PAGE.exists(), reason="landing page not built")
def test_the_built_page_names_no_real_bank():
    html = BUILT_PAGE.read_text(encoding="utf-8")
    text = re.sub(r"<script[\s\S]*?</script>|<[^>]+>", " ", html)
    assert _hits(text) == []
