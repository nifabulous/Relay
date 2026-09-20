"""Contract checks for the Asia-Pacific SSI batch 111 ledger."""

from app.services.seed import SSI_RECORDS

SOURCE_PREFIXES = (
    "Source: https://www.uob.com.sg/business/help-support/list-of-nostro-agents.page",
    "Source: https://www.dbs.com.sg/sme/day-to-day/collections/incoming-funds/telegraphic-transfer-info.page",
    "Source: https://www.kasikornbank.com/TH/ApplyForServices/ApplyForServiceForm/GlobalInward_091158.pdf",
    "Source: https://nz.icbc.com.cn/en/page/721852469130067989.html",
)

EXPECTED_ROUTES = {
    ("UOVBSGSGXXX", "EUR", "BARCDEFFXXX"),
    ("UOVBSGSGXXX", "THB", "UOBVTHBKXXX"),
    ("DBSSSGSGXXX", "CNH", "DBSSCNSHXXX"),
    ("KASITHBKXXX", "EUR", "SCBLDEFFXXX"),
    ("KASITHBKXXX", "NOK", "DABANO22XXX"),
    ("ICBKNZ2AXXX", "CNY", "HSBCHKHHHKH"),
    ("ICBKNZ2AXXX", "USD", "BOFAUS3NXXX"),
    ("ICBKNZ2AXXX", "EUR", "ICBKDEFFXXX"),
    ("ICBKNZ2AXXX", "AUD", "ANZBAU3MXXX"),
    ("ICBKNZ2AXXX", "HKD", "UBHKHKHHXXX"),
    ("ICBKNZ2AXXX", "JPY", "ICBKJPJTXXX"),
}


def _batch111_rows():
    return [
        row
        for row in SSI_RECORDS
        if any(row[9].startswith(prefix) for prefix in SOURCE_PREFIXES)
        and "accessed 2026-09-20" in row[9]
    ]


def test_batch111_has_only_expected_unique_bic_only_routes():
    rows = _batch111_rows()
    assert len(rows) == len(EXPECTED_ROUTES) == 11
    assert {(row[0], row[2], row[3]) for row in rows} == EXPECTED_ROUTES
    assert all(row[11] == "unverified" for row in rows)
    assert all(row[12] is None and row[13] is True for row in rows)
    assert all(all(row[pos] is None for pos in range(5, 9)) for row in rows)
    assert all(len(row[0]) == len(row[3]) == 11 for row in rows)


def test_batch111_citations_identify_official_bank_sources():
    rows = _batch111_rows()
    assert {row[9].split(" ", 2)[1] for row in rows} == {
        "https://www.uob.com.sg/business/help-support/list-of-nostro-agents.page",
        "https://www.dbs.com.sg/sme/day-to-day/collections/incoming-funds/telegraphic-transfer-info.page",
        "https://www.kasikornbank.com/TH/ApplyForServices/ApplyForServiceForm/GlobalInward_091158.pdf",
        "https://nz.icbc.com.cn/en/page/721852469130067989.html",
    }
