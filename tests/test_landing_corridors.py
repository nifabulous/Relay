"""The landing globe's corridor table is the only hand-typed factual data on the
page. This test is its review: every entry must trace to a case in the Case
Desk catalog or to a row of the seeded corridor rules."""
import re
from pathlib import Path

from app.data.landing_corridors import LANDING_CORRIDORS
from app.services.seed import BANKS, CORRIDOR_RULES

CASE_CATALOG = (
    Path(__file__).resolve().parents[1]
    / "frontend" / "src" / "features" / "learn" / "cases" / "caseCatalog.ts"
)


def _case_labels() -> dict:
    """Map case id -> recommendation.corridorLabel, read from the TS source."""
    source = CASE_CATALOG.read_text(encoding="utf-8")
    labels = {}
    for match in re.finditer(r'\bid: "([a-z0-9-]+)"', source):
        rest = source[match.end():]
        label = re.search(r'corridorLabel: "([^"]+)"', rest)
        next_id = re.search(r'\bid: "[a-z0-9-]+"', rest)
        if label and (next_id is None or label.start() < next_id.start()):
            labels[match.group(1)] = label.group(1)
    return labels


def test_corridor_count_fits_the_eight_categorical_colour_slots():
    assert 1 <= len(LANDING_CORRIDORS) <= 8


def test_currency_codes_are_unique_so_legend_entries_are_unambiguous():
    codes = [c["currency"] for c in LANDING_CORRIDORS]
    assert len(codes) == len(set(codes))


def test_coordinates_are_plausible():
    for corridor in LANDING_CORRIDORS:
        for end in ("origin", "destination"):
            point = corridor[end]
            assert -90 <= point["lat"] <= 90, corridor
            assert -180 <= point["lon"] <= 180, corridor
            assert re.fullmatch(r"[A-Z]{2}", point["country"]), corridor
            assert point["city"].strip() == point["city"] and point["city"], corridor


def test_case_sources_match_the_case_desk_catalog():
    labels = _case_labels()
    case_entries = [c for c in LANDING_CORRIDORS if c["source"]["kind"] == "case"]
    assert case_entries, "expected at least one case-desk corridor"
    for corridor in case_entries:
        case_id = corridor["source"]["case_id"]
        assert case_id in labels, f"unknown case id {case_id}"
        assert labels[case_id] == corridor["source"]["corridor_label"], corridor


def test_rule_sources_exist_in_the_seeded_corridor_rules():
    rule_keys = {(ccy, country, bic) for ccy, country, bic, *_ in CORRIDOR_RULES}
    bank_by_bic = {bic: (country, city) for bic, _name, country, city, _ccy in BANKS}
    rule_entries = [c for c in LANDING_CORRIDORS if c["source"]["kind"] == "rule"]
    assert rule_entries, "expected at least one corridor-rule corridor"
    for corridor in rule_entries:
        source = corridor["source"]
        key = (source["currency"], source["destination_country"], source["intermediary_bic"])
        assert key in rule_keys, f"no corridor rule {key}"
        assert source["currency"] == corridor["currency"], corridor
        assert source["destination_country"] == corridor["destination"]["country"], corridor
        # The arc starts where the intermediary actually sits.
        assert bank_by_bic[source["intermediary_bic"]] == (
            corridor["origin"]["country"],
            corridor["origin"]["city"],
        ), corridor


# The country names a Case Desk corridor label uses, mapped to their ISO codes.
CASE_COUNTRY_CODES = {
    "Canada": "CA",
    "Germany": "DE",
    "Mexico": "MX",
    "Nigeria": "NG",
    "United Kingdom": "GB",
    "United States": "US",
}


def test_case_corridor_endpoints_match_the_countries_their_label_names():
    case_entries = [c for c in LANDING_CORRIDORS if c["source"]["kind"] == "case"]
    for corridor in case_entries:
        origin_name, destination_name = corridor["source"]["corridor_label"].split(" → ")
        assert corridor["origin"]["country"] == CASE_COUNTRY_CODES[origin_name], corridor
        assert corridor["destination"]["country"] == CASE_COUNTRY_CODES[destination_name], corridor
