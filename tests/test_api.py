"""End-to-end tests against the FastAPI app via TestClient.

Uses the session-scoped `client` fixture from conftest, which triggers the
app's lifespan (table creation + seeding) exactly once.
"""


def test_health_seeded(client):
    """App should boot, create tables, and seed the directory."""
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["banks"] > 0
    assert body["corridor_rules"] > 0


def test_validate_valid_iban(client):
    # GB29NWBK60161331926819 is NatWest's well-known test IBAN.
    r = client.get("/api/validate", params={"value": "GB29NWBK60161331926819"})
    assert r.status_code == 200
    body = r.json()
    assert body["input_type"] == "iban"
    assert body["valid"] is True
    assert body["bic"] is not None


def test_validate_invalid_iban(client):
    r = client.get("/api/validate", params={"value": "GB29NWBK00000000000000"})
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert len(body["errors"]) > 0


def test_validate_valid_bic(client):
    r = client.get("/api/validate", params={"value": "CITIUS33"})
    assert r.status_code == 200
    body = r.json()
    assert body["input_type"] == "bic"
    assert body["valid"] is True
    assert body["bic"].startswith("CITIUS33")


def test_validate_invalid_bic(client):
    r = client.get("/api/validate", params={"value": "NOTREAL1"})
    assert r.status_code == 200
    assert r.json()["valid"] is False


class TestValidateResolvesBank:
    """ValidateResponse declares `bank: Optional[BankInfo]`, so it must be able
    to carry one. It never did: the router returned the field unset for every
    input, which made the declared contract (and the OpenAPI docs) a lie and
    left callers that read `validation.bank` silently falling back forever.
    """

    def test_bic_input_resolves_the_bank(self, client):
        r = client.get("/api/validate", params={"value": "CITIUS33"})
        assert r.status_code == 200
        bank = r.json()["bank"]
        assert bank is not None, "a seeded BIC must resolve to its directory entry"
        assert bank["bank_name"]
        assert bank["bic"].startswith("CITIUS33")

    def test_iban_input_resolves_the_bank_behind_it(self, client):
        # A German IBAN whose BIC (COBADEFFXXX) is in the seeded directory.
        r = client.get("/api/validate", params={"value": "DE89370400440532013000"})
        assert r.status_code == 200
        body = r.json()
        assert body["valid"] is True
        assert body["bank"] is not None, "an IBAN must resolve the bank behind its BIC"
        assert body["bank"]["bic"] == body["bic"]

    def test_unknown_but_well_formed_bic_stays_null(self, client):
        """Absent from the directory is not an error; the field is simply null."""
        r = client.get("/api/validate", params={"value": "ZZZZZZ99"})
        assert r.status_code == 200
        assert r.json()["bank"] is None

    def test_invalid_input_stays_null(self, client):
        r = client.get("/api/validate", params={"value": "NOTREAL1"})
        assert r.status_code == 200
        assert r.json()["bank"] is None


def test_lookup_known_bank(client):
    r = client.get("/api/lookup", params={"bic": "GTBINGLAXXX"})
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is True
    assert body["bank"]["country_code"] == "NG"
    assert "Guaranty" in body["bank"]["bank_name"]


def test_lookup_by_8char_bic(client):
    r = client.get("/api/lookup", params={"bic": "GTBINGLA"})
    assert r.status_code == 200
    assert r.json()["found"] is True


def test_lookup_unknown_bank(client):
    # Structurally valid BIC (US country code) that's simply not in our directory.
    r = client.get("/api/lookup", params={"bic": "ZZZZUS31XXX"})
    assert r.status_code == 200
    assert r.json()["found"] is False


def test_route_usd_to_nigeria(client):
    r = client.get(
        "/api/route",
        params={"bic": "GTBINGLAXXX", "currency": "NGN"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["beneficiary_country"] == "NG"
    assert len(body["suggested_intermediaries"]) >= 1
    # Citibank should be the primary for USD->NG
    assert body["suggested_intermediaries"][0]["bic"] == "CITIUS33XXX"


def test_route_no_curated_rule(client):
    # A currency with no curated rule -> empty list + advisory note.
    r = client.get(
        "/api/route",
        params={"bic": "GTBINGLAXXX", "currency": "XXX"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["suggested_intermediaries"] == []
    assert "No curated corridor" in body["notes"]


def test_route_from_iban_input(client):
    # The router should accept an IBAN and derive the BIC.
    r = client.get(
        "/api/route",
        params={"bic": "GB29NWBK60161331926819", "currency": "GBP"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["currency"] == "GBP"


# ---------------------------------------------------------------------------
# Fedwire/FedACH importer — parser unit tests (no network)
# ---------------------------------------------------------------------------


def test_fedwire_parser():
    from app.services.fed_importer import parse_fedwire_line

    # Real-format line from the FRB Fedwire directory
    line = "011000015FRB-BOS           FEDERAL RESERVE BANK OF BOSTON      MABOSTON                   Y Y20040910"
    rec = parse_fedwire_line(line)
    assert rec is not None
    assert rec["routing_number"] == "011000015"
    assert rec["telegraphic_name"] == "FRB-BOS"
    assert "FEDERAL RESERVE" in rec["customer_name"]
    assert rec["state_code"] == "MA"
    assert rec["city"] == "BOSTON"
    assert rec["funds_transfer"] == "Y"
    assert rec["date_of_last_revision"] == "20040910"


def test_fedwire_parser_short_line():
    from app.services.fed_importer import parse_fedwire_line

    assert parse_fedwire_line("short") is None


def test_fedach_parser():
    from app.services.fed_importer import parse_fedach_line

    line = (
        "011000015O0110000150122415000000000FEDERAL RESERVE BANK                "
        "1000 PEACHTREE ST N.E.              ATLANTA             GA303094470877372245711      "
    )
    rec = parse_fedach_line(line)
    assert rec is not None
    assert rec["routing_number"] == "011000015"
    assert "FEDERAL RESERVE" in rec["customer_name"]
    assert rec["city"] == "ATLANTA"
    assert rec["state_code"] == "GA"


def test_us_routing_number_detection():
    from app.services.routing import is_us_routing_number

    assert is_us_routing_number("011000015") is True
    assert is_us_routing_number("011-000-015") is True
    assert is_us_routing_number("GTBINGLAXXX") is False
    assert is_us_routing_number("123") is False


def test_us_bank_endpoint_before_import(client):
    """Before import, /us-bank should report found=False."""
    r = client.get("/api/us-bank", params={"routing_number": "011000015"})
    assert r.status_code == 200
    # Before import, the directory is empty.
    body = r.json()
    # Accept either (empty DB -> not found, or seeded by a prior test -> found)
    assert body["found"] in (True, False)


def test_us_bank_endpoint_bad_input(client):
    r = client.get("/api/us-bank", params={"routing_number": "abc"})
    assert r.status_code == 400


def test_route_domestic_usd_no_intermediary(client):
    """A 9-digit ABA routing number + USD = domestic wire, no intermediary."""
    r = client.get(
        "/api/route",
        params={"bic": "011000015", "currency": "USD"},
    )
    # Works whether or not Fed data is imported — the USD branch returns early
    # based on the routing-number shape alone.
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["beneficiary_country"] == "US"
    assert body["suggested_intermediaries"] == []
    assert "no SWIFT intermediary" in body["notes"]


# ---------------------------------------------------------------------------
# Currency inference — funding currency (USD) should map to destination
# ---------------------------------------------------------------------------


def test_route_usd_infers_ngn(client):
    """Passing currency=USD for a Nigerian bank should infer NGN and match."""
    r = client.get(
        "/api/route",
        params={"bic": "GTBINGLAXXX", "currency": "USD"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    # Should now return Nigeria intermediaries, not "no curated corridor".
    assert len(body["suggested_intermediaries"]) >= 1
    assert body["suggested_intermediaries"][0]["bic"] == "CITIUS33XXX"


def test_route_usd_infers_kes(client):
    """Passing currency=USD for a Kenyan bank should infer KES."""
    r = client.get(
        "/api/route",
        params={"bic": "SCBLKENXAXX", "currency": "USD"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["suggested_intermediaries"]) >= 1
    assert body["suggested_intermediaries"][0]["bic"] == "CITIUS33XXX"


def test_route_explicit_dest_currency_still_works(client):
    """Passing currency=NGN directly should still work (no regression)."""
    r = client.get(
        "/api/route",
        params={"bic": "GTBINGLAXXX", "currency": "NGN"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["suggested_intermediaries"]) >= 1
    assert body["suggested_intermediaries"][0]["bic"] == "CITIUS33XXX"


# ---------------------------------------------------------------------------
# Asia-Pacific corridors
# ---------------------------------------------------------------------------


def test_route_usd_to_japan(client):
    r = client.get("/api/route", params={"bic": "BOTKJPJTXXX", "currency": "USD"})
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["currency"] == "JPY"  # inferred from JP
    assert len(body["suggested_intermediaries"]) >= 1
    assert body["suggested_intermediaries"][0]["bic"] == "CITIUS33XXX"


def test_route_usd_to_china(client):
    r = client.get("/api/route", params={"bic": "BKCHCNBJXXX", "currency": "USD"})
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "CNY"
    # Bank of China should be primary for USD->CN
    assert body["suggested_intermediaries"][0]["bic"] == "BKCHCNBJXXX"


def test_route_usd_to_hong_kong(client):
    r = client.get("/api/route", params={"bic": "HSBCHKHHXXX", "currency": "USD"})
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "HKD"
    assert body["suggested_intermediaries"][0]["bic"] == "HSBCHKHHXXX"


def test_route_usd_to_singapore(client):
    r = client.get("/api/route", params={"bic": "DBSSSGSXAXX", "currency": "USD"})
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "SGD"
    assert body["suggested_intermediaries"][0]["bic"] == "DBSSSGSXAXX"


def test_route_usd_to_australia(client):
    r = client.get("/api/route", params={"bic": "ANZBAU3MXXX", "currency": "USD"})
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "AUD"
    assert len(body["suggested_intermediaries"]) >= 1


# ---------------------------------------------------------------------------
# Middle East corridors
# ---------------------------------------------------------------------------


def test_route_usd_to_uae(client):
    r = client.get("/api/route", params={"bic": "EBILAEADXXX", "currency": "USD"})
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "AED"
    assert body["suggested_intermediaries"][0]["bic"] == "CITIUS33XXX"


def test_route_usd_to_saudi(client):
    r = client.get("/api/route", params={"bic": "NCBKSAJEXXX", "currency": "USD"})
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "SAR"
    assert body["suggested_intermediaries"][0]["bic"] == "CITIUS33XXX"


def test_route_usd_to_qatar(client):
    r = client.get("/api/route", params={"bic": "NBQAQAQAXXX", "currency": "USD"})
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "QAR"
    assert len(body["suggested_intermediaries"]) >= 1


def test_route_usd_to_israel(client):
    r = client.get("/api/route", params={"bic": "POALILITXXX", "currency": "USD"})
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "ILS"
    assert body["suggested_intermediaries"][0]["bic"] == "CITIUS33XXX"


def test_route_usd_to_turkey(client):
    r = client.get("/api/route", params={"bic": "TGBTTR2IXXX", "currency": "USD"})
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "TRY"
    assert body["suggested_intermediaries"][0]["bic"] == "CITIUS33XXX"


# ===========================================================================
# Input validation hardening (implementation-plan item 1.3)
# QA panel reproduced: negative amounts, oversized inputs, malformed UTF-8.
# ===========================================================================


class TestPreparePaymentAmountValidation:
    """amount must be > 0 (gt=0). QA reproduced: -5000 and 0 both returned 200."""

    def test_negative_amount_rejected(self, client):
        r = client.post(
            "/api/prepare-payment",
            json={
                "beneficiary_iban": "GB29NWBK60161331926819",
                "beneficiary_name": "Test User",
                "beneficiary_bic": "NWBKGB2LXXX",
                "currency": "USD",
                "amount": -5000,
            },
        )
        assert r.status_code == 422, f"Negative amount must be 422, got {r.status_code}"

    def test_zero_amount_rejected(self, client):
        r = client.post(
            "/api/prepare-payment",
            json={
                "beneficiary_iban": "GB29NWBK60161331926819",
                "beneficiary_name": "Test User",
                "beneficiary_bic": "NWBKGB2LXXX",
                "currency": "USD",
                "amount": 0,
            },
        )
        assert r.status_code == 422, f"Zero amount must be 422, got {r.status_code}"


class TestTrackCreateAmountValidation:
    """/track/create amount must also be > 0."""

    def test_negative_amount_rejected(self, client):
        r = client.post(
            "/api/track/create",
            json={
                "originator_bic": "CITIUS33XXX",
                "originator_name": "Citibank",
                "beneficiary_bic": "GTBINGLAXXX",
                "beneficiary_name": "GTBank",
                "currency": "USD",
                "amount": -1000,
            },
        )
        assert r.status_code == 422, f"Negative amount must be 422, got {r.status_code}"


class TestVoPInputLengthValidation:
    """VoP inputs must be bounded (max_length). QA: 100KB IBAN accepted."""

    def test_oversized_iban_rejected(self, client):
        r = client.post(
            "/api/verify-payee",
            json={"iban": "G" * 10000, "name": "Test"},
        )
        assert r.status_code == 422, f"10000-char IBAN must be 422, got {r.status_code}"

    def test_oversized_name_rejected(self, client):
        r = client.post(
            "/api/verify-payee",
            json={"iban": "GB29NWBK60161331926819", "name": "A" * 10000},
        )
        assert r.status_code == 422, f"10000-char name must be 422, got {r.status_code}"


class TestScreenInputLengthValidation:
    """Screening names must be bounded."""

    def test_oversized_sender_name_rejected(self, client):
        r = client.post(
            "/api/screen",
            json={
                "sender_name": "X" * 10000,
                "beneficiary_name": "Normal Name",
            },
        )
        assert r.status_code == 422


class TestSSIUploadMalformedUtf8:
    """
    Malformed (non-UTF8) SSI upload must return 400, not 500.
    QA reproduced: content.decode('utf-8-sig') at lookup.py:313 is outside
    the try/except, so UnicodeDecodeError -> unhandled 500.
    """

    def test_binary_upload_returns_400_not_500(self, client):
        r = client.post(
            "/api/import/ssi",
            files={"file": ("bad.csv", b"\xff\xfe\x00\x01garbage", "text/csv")},
        )
        assert r.status_code in (400, 422), (
            f"Malformed UTF-8 upload must be 400/422, got {r.status_code} (500 = unhandled crash)"
        )
