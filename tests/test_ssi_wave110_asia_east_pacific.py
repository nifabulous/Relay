"""Contract checks for the East/Southeast Asia and Pacific SSI wave."""

from app.services.seed import SSI_RECORDS

SOURCE_PREFIX = "Source: https://www.hsbc.com.my/investments/products/international-transfer-payment/faq/"


def test_wave110_has_250_unique_bic_only_routes_with_citations():
    rows = [row for row in SSI_RECORDS if row[9].startswith(SOURCE_PREFIX)]
    assert len(rows) == 250
    assert len({(row[0], row[2], row[3]) for row in rows}) == 250
    assert all(row[11] == "unverified" for row in rows)
    assert all(row[12] is None and row[13] is True for row in rows)
    assert all(all(row[pos] is None for pos in range(5, 9)) for row in rows)


def test_wave110_covers_apac_beneficiaries():
    rows = [row for row in SSI_RECORDS if row[9].startswith(SOURCE_PREFIX)]
    countries = {row[0][4:6] for row in rows}
    assert {"CN", "HK", "JP", "KR", "TW", "MY", "NZ", "VN", "ID"} <= countries
