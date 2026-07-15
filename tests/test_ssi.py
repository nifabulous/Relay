"""
Tests for the Standard Settlement Instructions (SSI) feature.

Covers:
  - HTTP endpoint (/api/ssi) — happy path, filtering, not-found, bad input
  - SSI seed data integrity (charge codes valid, account numbers present)
  - Health endpoint reports SSI count
  - SSI records carry the account numbers that /route lacks
"""
import pytest


# ===========================================================================
# HTTP endpoint tests
# ===========================================================================


class TestSSIEndpoint:
    def test_get_ssi_for_known_bank(self, client):
        r = client.get("/api/ssi", params={"bic": "GTBINGLAXXX"})
        assert r.status_code == 200
        body = r.json()
        assert body["beneficiary_bic"] == "GTBINGLAXXX"
        assert len(body["instructions"]) >= 1
        # Should include both USD and EUR instructions for GTB
        currencies = {i["currency"] for i in body["instructions"]}
        assert "USD" in currencies
        assert "EUR" in currencies

    def test_ssi_record_has_account_numbers(self, client):
        """The whole point of SSI vs /route: it carries account numbers."""
        r = client.get("/api/ssi", params={"bic": "GTBINGLAXXX", "currency": "USD"})
        assert r.status_code == 200
        body = r.json()
        assert len(body["instructions"]) == 1
        rec = body["instructions"][0]
        assert rec["intermediary_account"] is not None
        assert rec["beneficiary_account"] is not None
        assert rec["intermediary_account"].startswith("ACCT-")
        assert rec["beneficiary_account"].startswith("ACCT-")

    def test_ssi_carries_charge_code(self, client):
        r = client.get("/api/ssi", params={"bic": "GTBINGLAXXX"})
        body = r.json()
        for rec in body["instructions"]:
            assert rec["charge_code"] in ("OUR", "SHA", "BEN")

    def test_ssi_carries_value_date(self, client):
        r = client.get("/api/ssi", params={"bic": "EBILAEADXXX", "currency": "USD"})
        body = r.json()
        assert len(body["instructions"]) >= 1
        assert body["instructions"][0]["value_date"] == "spot"

    def test_ssi_filter_by_currency(self, client):
        r = client.get("/api/ssi", params={"bic": "GTBINGLAXXX", "currency": "EUR"})
        assert r.status_code == 200
        body = r.json()
        assert len(body["instructions"]) == 1
        assert body["instructions"][0]["currency"] == "EUR"
        assert body["currency"] == "EUR"

    def test_ssi_unknown_bank_returns_empty(self, client):
        r = client.get("/api/ssi", params={"bic": "ZZZZUS31XXX"})
        assert r.status_code == 200
        body = r.json()
        assert body["instructions"] == []

    def test_ssi_no_currency_returns_all_for_bank(self, client):
        r = client.get("/api/ssi", params={"bic": "GTBINGLAXXX"})
        body = r.json()
        assert body["currency"] == "ALL"
        assert len(body["instructions"]) >= 2

    def test_ssi_invalid_bic_returns_400(self, client):
        r = client.get("/api/ssi", params={"bic": "NOTREAL1"})
        assert r.status_code == 400

    def test_ssi_response_has_disclaimer(self, client):
        r = client.get("/api/ssi", params={"bic": "GTBINGLAXXX"})
        body = r.json()
        assert "ILLUSTRATIVE" in body["disclaimer"]
        assert "placeholder" in body["disclaimer"]

    def test_ssi_intermediary_fields_present(self, client):
        r = client.get("/api/ssi", params={"bic": "GTBINGLAXXX", "currency": "USD"})
        rec = r.json()["instructions"][0]
        assert rec["intermediary_bic"] == "CITIUS33XXX"
        assert rec["intermediary_bank_name"] == "Citibank N.A."
        assert rec["beneficiary_bank_name"] == "Guaranty Trust Bank"


# ===========================================================================
# Seed data integrity — make sure no SSI record is malformed
# ===========================================================================


class TestSSISeedIntegrity:
    def test_all_charge_codes_valid(self):
        from app.services.seed import SSI_RECORDS

        valid = {"OUR", "SHA", "BEN"}
        for row in SSI_RECORDS:
            charge = row[7]
            assert charge in valid, f"Invalid charge code: {charge} in {row}"

    def test_all_account_numbers_are_placeholders(self):
        """
        All account numbers must be ACCT- placeholders.

        Previously this test allowed 'placeholder OR sourced-real'. That policy
        was a liability: real account numbers go stale, invite misuse, and
        contradict the README's safety claim. The stricter invariant lives in
        TestAllSSIAccountsArePlaceholders; this test is kept as a fast
        boolean check (no regex) for a quick failure signal.
        """
        from app.services.seed import SSI_RECORDS

        for row in SSI_RECORDS:
            assert row[5].startswith("ACCT-"), (
                f"intermediary_account {row[5]} is not an ACCT- placeholder"
            )
            assert row[6].startswith("ACCT-"), (
                f"beneficiary_account {row[6]} is not an ACCT- placeholder"
            )

    def test_all_bics_valid(self):
        from schwifty import BIC
        from app.services.seed import SSI_RECORDS

        # Some real BICs use non-standard pseudo-country codes (e.g. EDBBEB22
        # uses "EB" for "European Bank") that schwifty's ISO registry doesn't
        # recognize but SWIFT accepts. We tolerate those known exceptions.
        KNOWN_NONSTANDARD_BICS = {"EDBBEB22XXX"}

        for row in SSI_RECORDS:
            for bic in (row[0], row[3]):  # beneficiary_bic, intermediary_bic
                if bic in KNOWN_NONSTANDARD_BICS:
                    continue  # real BIC, non-standard country code
                b = BIC(bic)
                assert b.is_valid, f"Invalid BIC in SSI seed: {bic}"

    def test_all_notes_carry_warning_or_source(self):
        """Each note either warns it's a placeholder or cites a real source."""
        from app.services.seed import SSI_RECORDS

        for row in SSI_RECORDS:
            notes = row[9]
            is_placeholder_note = "Illustrative" in notes or "placeholder" in notes
            is_sourced_note = "Source:" in notes
            assert is_placeholder_note or is_sourced_note, (
                f"Note lacks both placeholder warning and source citation: {notes}"
            )

    @pytest.mark.parametrize(
        "beneficiary_bic, currency",
        [
            # Original placeholder SSIs
            ("GTBINGLAXXX", "USD"),
            ("GTBINGLAXXX", "EUR"),
            ("SCBLKENXAXX", "USD"),
            ("ECOCGHACXXX", "USD"),
            ("SBICZAJJXXX", "USD"),
            ("HDFCINBBXXX", "USD"),
            ("EBILAEADXXX", "USD"),
            ("NCBKSAJEXXX", "USD"),
            ("BOTKJPJTXXX", "USD"),
            # Real sourced SSIs — Emirates NBD multi-currency
            ("EBILAEADXXX", "EUR"),
            ("EBILAEADXXX", "GBP"),
            ("EBILAEADXXX", "AED"),
            ("EBILAEADXXX", "CHF"),
            ("EBILAEADXXX", "JPY"),
            ("EBILAEADXXX", "CAD"),
            ("EBILAEADXXX", "AUD"),
            ("EBILAEADXXX", "SGD"),
            ("EBILAEADXXX", "HKD"),
            ("EBILAEADXXX", "INR"),
            ("EBILAEADXXX", "SAR"),
            ("EBILAEADXXX", "QAR"),
            ("EBILAEADXXX", "KWD"),
            ("EBILAEADXXX", "BHD"),
            ("EBILAEADXXX", "OMR"),
            ("EBILAEADXXX", "JOD"),
            ("EBILAEADXXX", "EGP"),
            ("EBILAEADXXX", "SEK"),
            ("EBILAEADXXX", "NOK"),
            ("EBILAEADXXX", "DKK"),
            ("EBILAEADXXX", "ZAR"),
            ("EBILAEADXXX", "NZD"),
            ("EBILAEADXXX", "PKR"),
            ("EBILAEADXXX", "BDT"),
            ("EBILAEADXXX", "LKR"),
            ("EBILAEADXXX", "MAD"),
            ("EBILAEADXXX", "ILS"),
            # Bank of Ceylon
            ("BCEYLKLXXXX", "USD"),
            ("BCEYLKLXXXX", "GBP"),
            ("BCEYLKLXXXX", "EUR"),
            # Bank Danamon
            ("BDINIDJAXXX", "USD"),
            # SMBC London — real sourced multi-currency
            ("SMBCGB2LXXX", "USD"),
            ("SMBCGB2LXXX", "EUR"),
            ("SMBCGB2LXXX", "GBP"),
            ("SMBCGB2LXXX", "JPY"),
            ("SMBCGB2LXXX", "CAD"),
            ("SMBCGB2LXXX", "CHF"),
            ("SMBCGB2LXXX", "SGD"),
            ("SMBCGB2LXXX", "HKD"),
            ("SMBCGB2LXXX", "CNY"),
            ("SMBCGB2LXXX", "AED"),
            ("SMBCGB2LXXX", "PLN"),
            ("SMBCGB2LXXX", "ZAR"),
            # Bank of Maharashtra — real sourced
            ("MAHBBINPXXX", "USD"),
            ("MAHBBINPXXX", "EUR"),
            ("MAHBBINPXXX", "GBP"),
            ("MAHBBINPXXX", "AUD"),
            ("MAHBBINPXXX", "CAD"),
            ("MAHBBINPXXX", "CHF"),
            ("MAHBBINPXXX", "JPY"),
            ("MAHBBINPXXX", "SGD"),
            # Deutsche Bank Prague
            ("DEUTCZPXXXX", "EUR"),
            ("DEUTCZPXXXX", "USD"),
            ("DEUTCZPXXXX", "GBP"),
            ("DEUTCZPXXXX", "CZK"),
            ("DEUTCZPXXXX", "JPY"),
            ("DEUTCZPXXXX", "PLN"),
            ("DEUTCZPXXXX", "HUF"),
            # YES Bank
            ("YESBINBBXXX", "USD"),
            ("YESBINBBXXX", "EUR"),
            ("YESBINBBXXX", "GBP"),
            ("YESBINBBXXX", "JPY"),
            ("YESBINBBXXX", "SGD"),
            ("YESBINBBXXX", "ZAR"),
            # U.S. Bank
            ("USBKUS44XXX", "USD"),
            ("USBKUS44XXX", "EUR"),
            ("USBKUS44XXX", "GBP"),
            ("USBKUS44XXX", "CHF"),
            # Access Bank Nigeria
            ("ABNGNGLAXXX", "USD"),
            ("ABNGNGLAXXX", "GBP"),
            ("ABNGNGLAXXX", "EUR"),
            ("ABNGNGLAXXX", "ZAR"),
            # Saxo Bank Denmark
            ("SAXODK22XXX", "USD"),
            ("SAXODK22XXX", "EUR"),
            ("SAXODK22XXX", "GBP"),
            ("SAXODK22XXX", "DKK"),
            ("SAXODK22XXX", "JPY"),
            ("SAXODK22XXX", "SGD"),
            # MUFG Bank Europe Amsterdam
            ("BOTKNL2AXXX", "USD"),
            ("BOTKNL2AXXX", "EUR"),
            ("BOTKNL2AXXX", "GBP"),
            ("BOTKNL2AXXX", "JPY"),
            ("BOTKNL2AXXX", "CHF"),
            ("BOTKNL2AXXX", "CAD"),
            ("BOTKNL2AXXX", "AUD"),
            ("BOTKNL2AXXX", "SGD"),
            ("BOTKNL2AXXX", "CNY"),
            ("BOTKNL2AXXX", "MYR"),
            ("BOTKNL2AXXX", "MXN"),
            ("BOTKNL2AXXX", "KZT"),
            ("BOTKNL2AXXX", "ZAR"),
            # State Bank of India
            ("SBININBBXXX", "USD"),
            ("SBININBBXXX", "GBP"),
            ("SBININBBXXX", "EUR"),
            ("SBININBBXXX", "JPY"),
            ("SBININBBXXX", "CHF"),
            ("SBININBBXXX", "SAR"),
            ("SBININBBXXX", "KES"),
            # Federal Bank India
            ("FDRLINBBIBD", "USD"),
            ("FDRLINBBIBD", "EUR"),
            ("FDRLINBBIBD", "GBP"),
            ("FDRLINBBIBD", "CNY"),
        ],
    )
    def test_expected_ssi_exists(self, beneficiary_bic, currency):
        from app.services.seed import SSI_RECORDS

        found = any(
            r[0] == beneficiary_bic and r[2] == currency for r in SSI_RECORDS
        )
        assert found, f"No SSI for {beneficiary_bic} / {currency}"


class TestAllSSIAccountsArePlaceholders:
    """
    Safety invariant: NO real bank account numbers in seed data.

    Every intermediary_account and beneficiary_account must start with
    'ACCT-' so no synthetic number can be mistaken for a real one and
    wired funds to. This replaces the permissive 'placeholder OR sourced'
    check — sourced real numbers are a liability (they go stale, they
    invite misuse, and they contradict the README's central safety claim).
    """

    def test_every_intermediary_account_is_placeholder(self):
        import re

        from app.services.seed import SSI_RECORDS

        pattern = re.compile(r"^ACCT-\d+$")
        offenders = [
            (row[0], row[2], row[3], row[5])
            for row in SSI_RECORDS
            if not pattern.match(row[5])
        ]
        assert not offenders, (
            f"{len(offenders)} SSI rows have non-placeholder intermediary_account "
            f"(must match ^ACCT-\\d+$). First 5: {offenders[:5]}"
        )

    def test_every_beneficiary_account_is_placeholder(self):
        import re

        from app.services.seed import SSI_RECORDS

        pattern = re.compile(r"^ACCT-\d+$")
        offenders = [
            (row[0], row[2], row[3], row[6])
            for row in SSI_RECORDS
            if not pattern.match(row[6])
        ]
        assert not offenders, (
            f"{len(offenders)} SSI rows have non-placeholder beneficiary_account "
            f"(must match ^ACCT-\\d+$). First 5: {offenders[:5]}"
        )

    def test_no_real_ibans_in_notes(self):
        """
        Real IBANs leak in the notes field too (e.g. 'IBAN: AE41...').
        The safety goal is unmet if notes carry copy-able real account
        numbers even after the account fields are masked.
        """
        import re

        from app.services.seed import SSI_RECORDS

        # Real IBAN format: 2 letters + 2 digits + 11-30 more chars
        iban_pattern = re.compile(r"IBAN[:\s]+[A-Z]{2}\d")
        offenders = []
        for row in SSI_RECORDS:
            notes = row[9] or ""
            match = iban_pattern.search(notes)
            if match:
                offenders.append((row[0], row[2], match.group()))
        assert not offenders, (
            f"{len(offenders)} SSI rows contain a real IBAN in the notes field. "
            f"Mask it as 'IBAN: <placeholder>'. First 5: {offenders[:5]}"
        )


# ===========================================================================
# Health endpoint integration
# ===========================================================================


class TestSSIHealth:
    def test_health_reports_ssi_count(self, client):
        r = client.get("/api/health")
        body = r.json()
        assert "ssi_records" in body
        assert body["ssi_records"] > 0


# ===========================================================================
# Direct DB access — verify the SSI model loads correctly
# ===========================================================================


class TestSSIModel:
    def test_ssi_records_seeded(self, db_session_clean):
        from app.models import SSI

        count = db_session_clean.query(SSI).count()
        assert count >= 235  # expanded with ENBD/SMBC/BoM/DBCZ/YES/USBK/Access/Saxo/MUFG/ICICI/HDFC/SBI/FedBank data

    def test_smbc_multi_currency_coverage(self, db_session_clean):
        """SMBC London should have SSI across 25+ currencies."""
        from sqlalchemy import select
        from app.models import SSI

        currencies = db_session_clean.execute(
            select(SSI.currency)
            .where(SSI.beneficiary_bic == "SMBCGB2LXXX")
            .distinct()
        ).scalars().all()
        assert len(currencies) >= 25, f"Expected 25+ currencies for SMBC, got {len(currencies)}"

    def test_enbd_ssi_records_present(self, db_session_clean):
        """
        Verify the Emirates NBD SSI records are loaded.

        The bank/correspondent *relationships* are real (sourced from the
        published SSI page), but all account numbers are now ACCT- placeholders
        — no real account numbers ship in the source (safety invariant, see
        TestAllSSIAccountsArePlaceholders). The 'Source:' citation in notes
        documents where the relationship came from.
        """
        from sqlalchemy import select
        from app.models import SSI

        rows = db_session_clean.execute(
            select(SSI).where(
                SSI.beneficiary_bic == "EBILAEADXXX",
                SSI.currency == "USD",
            )
        ).scalars().all()
        # ENBD USD has at least 4 correspondents from the published SSI page
        assert len(rows) >= 4
        # ALL account numbers must be placeholders now
        for row in rows:
            assert row.intermediary_account.startswith("ACCT-"), (
                f"intermediary_account must be ACCT- placeholder, got {row.intermediary_account}"
            )
            assert row.beneficiary_account.startswith("ACCT-"), (
                f"beneficiary_account must be ACCT- placeholder, got {row.beneficiary_account}"
            )

    def test_enbd_multi_currency_coverage(self, db_session_clean):
        """Emirates NBD should have SSI across many currencies."""
        from sqlalchemy import select, func
        from app.models import SSI

        currencies = db_session_clean.execute(
            select(SSI.currency)
            .where(SSI.beneficiary_bic == "EBILAEADXXX")
            .distinct()
        ).scalars().all()
        # ENBD publishes SSIs for 25+ currencies
        assert len(currencies) >= 25, f"Expected 25+ currencies for ENBD, got {len(currencies)}"

    def test_ssi_query_by_bic_and_currency(self, db_session_clean):
        from sqlalchemy import select
        from app.models import SSI

        row = db_session_clean.execute(
            select(SSI).where(
                SSI.beneficiary_bic == "GTBINGLAXXX",
                SSI.currency == "USD",
            )
        ).scalar_one_or_none()

        assert row is not None
        assert row.intermediary_bic == "CITIUS33XXX"
        assert row.charge_code == "SHA"
        assert row.value_date == "spot"
        assert row.intermediary_account.startswith("ACCT-")
        assert row.beneficiary_account.startswith("ACCT-")

    def test_ssi_record_has_all_fields(self, db_session_clean):
        from sqlalchemy import select
        from app.models import SSI

        # ENBD now has many rows; just check the first one has all fields populated
        row = db_session_clean.execute(
            select(SSI).where(SSI.beneficiary_bic == "EBILAEADXXX").limit(1)
        ).scalar_one_or_none()

        assert row is not None
        # Every field that defines an SSI should be populated
        assert row.beneficiary_bic
        assert row.beneficiary_bank_name
        assert row.currency
        assert row.intermediary_bic
        assert row.intermediary_bank_name
        assert row.intermediary_account
        assert row.beneficiary_account
        assert row.charge_code
        assert row.value_date
        assert row.notes
