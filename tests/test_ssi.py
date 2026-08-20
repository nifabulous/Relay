"""
Tests for the Standard Settlement Instructions (SSI) feature.

Covers:
  - HTTP endpoint (/api/ssi) — happy path, filtering, not-found, bad input
  - SSI seed data integrity (charge codes valid, account numbers present)
  - Health endpoint reports SSI count
  - SSI records carry the account numbers that /route lacks
"""
# The provenance validators compare against the UTC date
# (datetime.now(timezone.utc).date()); a test building "today" from the local
# date.today() can be a day off from production around a midnight boundary,
# failing or passing for timezone configuration rather than behaviour.
from datetime import datetime, timedelta, timezone

import pytest


def _utc_today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _utc_yesterday() -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()


def _utc_tomorrow() -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat()

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
        r = client.get("/api/ssi", params={"bic": "GTBINGLAXXX", "currency": "USD"})
        body = r.json()
        assert len(body["instructions"]) >= 1
        assert body["instructions"][0]["value_date"] == "spot"

    def test_bic_only_rows_serialize_without_accounts(self, client):
        """ENBD's correspondent-charges PDF is a BIC-level list: the API must
        say so and must not fabricate accounts, charge codes, or value dates."""
        r = client.get("/api/ssi", params={"bic": "EBILAEADXXX", "currency": "USD"})
        assert r.status_code == 200
        body = r.json()
        assert len(body["instructions"]) >= 1
        for rec in body["instructions"]:
            assert rec["bic_only"] is True
            assert rec["intermediary_account"] is None
            assert rec["beneficiary_account"] is None
            assert rec["charge_code"] is None
            assert rec["value_date"] is None

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
            if len(row) > 13 and row[13] is True:
                continue
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
            if len(row) > 13 and row[13] is True:
                continue
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
            if row[5] is not None and not pattern.match(row[5])
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
            if row[6] is not None and not pattern.match(row[6])
        ]
        assert not offenders, (
            f"{len(offenders)} SSI rows have non-placeholder beneficiary_account "
            f"(must match ^ACCT-\\d+$). First 5: {offenders[:5]}"
        )

    def test_bic_only_rows_carry_no_accounts_charge_or_value_date(self):
        """A BIC-only row names correspondents but publishes no accounts,
        charge codes, or value dates — the fields an ordinary instruction is
        built from. None of them may be fabricated (the pre-fix ENBD rows
        carried invented ACCT- placeholders, OUR, and spot)."""
        from app.services.seed import SSI_RECORDS

        bic_only = [row for row in SSI_RECORDS if len(row) > 13 and row[13] is True]
        assert bic_only, "expected bic_only rows in the seed"
        for row in bic_only:
            assert row[5] is None and row[6] is None, f"{row[0]}/{row[2]}: bic_only row has accounts"
            assert row[7] is None, f"{row[0]}/{row[2]}: bic_only row has a charge code"
            assert row[8] is None, f"{row[0]}/{row[2]}: bic_only row has a value date"
            assert row[12] is None, f"{row[0]}/{row[2]}: bic_only row names a verifier"
            assert len(row) == 14, f"{row[0]}/{row[2]}: expected 14 fields, got {len(row)}"

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
        published correspondent-bank-charges PDF), but that source publishes
        no account numbers, charge codes, or value dates — every row is
        BIC-only. The 'Source:' citation in notes documents where the
        relationship came from.
        """
        from sqlalchemy import select

        from app.models import SSI

        rows = db_session_clean.execute(
            select(SSI).where(
                SSI.beneficiary_bic == "EBILAEADXXX",
                SSI.currency == "USD",
            )
        ).scalars().all()
        # ENBD USD has at least 4 correspondents from the published PDF
        assert len(rows) >= 4
        # The PDF is a BIC-level list: correspondent names only, and the
        # fabricated account/charge/value-date fields must not exist.
        for row in rows:
            assert row.bic_only, "ENBD charges-PDF rows must be BIC-only"
            assert row.intermediary_account is None
            assert row.beneficiary_account is None
            assert row.charge_code is None
            assert row.value_date is None

    def test_enbd_multi_currency_coverage(self, db_session_clean):
        """Emirates NBD should have SSI across many currencies."""
        from sqlalchemy import select

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


class TestSSIProvenanceIsConsistentWithItsSource:
    """A row may not claim a provenance its own citation contradicts.

    The first classification pass keyed only on `web.archive.org` and so
    labelled 171 rows "published" whose notes said "(archived 2021-10-09)".
    Faithfulness of the transform was verified; correctness of the labels was
    not. This is the check that catches it.
    """

    @staticmethod
    def _governing_comments():
        """A `# Source: ...` comment governs every row until the next one.

        Provenance evidence lives in three places in this file: the row's own
        note, an archive host in that note, and these section comments. The
        first classifier read only the host, the second added the note, and
        this is the third — a comment saying "(2021 archive)" over rows whose
        own notes say nothing.
        """
        import ast
        import re
        from pathlib import Path

        path = Path(__file__).resolve().parents[1] / "app" / "services" / "seed.py"
        src = path.read_text()
        lines = src.splitlines()
        tree = ast.parse(src)
        for node in tree.body:
            if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "SSI_RECORDS":
                start, end = node.lineno, node.end_lineno
                break
        governing, current = {}, ""
        for index in range(start - 1, end):
            text = lines[index].strip()
            if text.startswith("#"):
                if re.search(r"source|----", text, re.I):
                    current = text
                elif current:
                    current += " " + text
            governing[index + 1] = current
        return governing

    @staticmethod
    def _rows():
        import ast
        from pathlib import Path

        src = (Path(__file__).resolve().parents[1] / "app" / "services" / "seed.py").read_text()
        tree = ast.parse(src)
        for node in tree.body:
            if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "SSI_RECORDS":
                for element in node.value.elts:
                    note = ast.get_source_segment(src, element.elts[9]) or ""
                    yield (
                        ast.literal_eval(element.elts[0]),
                        note,
                        ast.literal_eval(element.elts[10]) if len(element.elts) > 10 else None,
                        ast.literal_eval(element.elts[11]) if len(element.elts) > 11 else None,
                    )
                return

    def test_no_row_claims_published_without_verified_currency(self):
        """Nothing in the seed data establishes a source was live when read, so
        no seeded row may claim "published". The 406 rows that once did were
        assigned it purely because archive evidence was absent."""
        claiming = [bic for bic, _n, _a, status in self._rows() if status == "published"]
        assert not claiming, (
            f"{len(claiming)} seeded row(s) claim verified-live provenance, "
            f"e.g. {claiming[:3]}"
        )

    def test_no_sourced_row_cites_an_archived_source_without_saying_so(self):
        import re

        offenders = [
            (bic, note[:120])
            for bic, note, _as_of, status in self._rows()
            if status in ("published", "unverified")
            and (re.search(r"archiv|wayback|snapshot", note, re.I) or "web.archive.org" in note)
        ]
        assert not offenders, (
            f"{len(offenders)} row(s) claim an unarchived status but cite an "
            f"archived source, e.g. {offenders[:3]}"
        )

    def test_no_published_row_sits_under_an_archived_section_comment(self):
        import ast
        import re
        from pathlib import Path

        governing = self._governing_comments()
        path = Path(__file__).resolve().parents[1] / "app" / "services" / "seed.py"
        src = path.read_text()
        tree = ast.parse(src)
        for node in tree.body:
            if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "SSI_RECORDS":
                rows = node.value.elts
                break
        offenders = [
            (ast.literal_eval(e.elts[0]), governing.get(e.lineno, "")[:90])
            for e in rows
            if ast.literal_eval(e.elts[11]) in ("published", "unverified")
            and re.search(r"archiv|wayback|snapshot", governing.get(e.lineno, ""), re.I)
        ]
        assert not offenders, (
            f"{len(offenders)} row(s) claim an unarchived status under a comment "
            f"that says archived, e.g. {offenders[:3]}"
        )

    def test_every_status_is_one_of_the_three_allowed_values(self):
        allowed = {"published", "unverified", "archived", "illustrative"}
        bad = [(bic, status) for bic, _n, _a, status in self._rows() if status not in allowed]
        assert not bad, bad

    def test_as_of_is_an_iso_date_when_present(self):
        from datetime import date

        bad = []
        for bic, _note, as_of, _status in self._rows():
            if as_of is None:
                continue
            try:
                date.fromisoformat(as_of)
            except (TypeError, ValueError):
                bad.append((bic, as_of))
        assert not bad, bad

    def test_an_illustrative_row_never_claims_a_bank_source(self):
        bad = [
            (bic, note[:80])
            for bic, note, _a, status in self._rows()
            if status == "illustrative" and "_SSI_REAL_NOTE" in note
        ]
        assert not bad, bad


class TestProvenanceIsEnforcedAtTheBoundaries:
    """The autopilot validator is not the only writer. /api/import/ssi and any
    direct session.add() reach the same column, so the value has to be
    constrained where it is persisted and where it is serialised."""

    def test_schema_rejects_an_unknown_status(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="definitely-current",
                charge_code="SHA", value_date="spot",
            )

    def test_schema_rejects_a_malformed_as_of(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="archived",
                charge_code="SHA", value_date="spot",
                as_of="not-a-date",
            )

    def test_schema_accepts_a_well_formed_record(self):
        from app.schemas import SSIRecord

        record = SSIRecord(
            beneficiary_bic="BOPIPHMMXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="archived",
            charge_code="SHA", value_date="spot",
            as_of="2007-12-13",
        )
        assert record.status == "archived"

    def test_schema_rejects_an_ordinary_record_without_settlement_terms(self):
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError, match="ordinary.*requires"):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="archived",
                as_of="2007-12-13",
            )

    def test_schema_rejects_whitespace_only_settlement_terms(self):
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError, match="ordinary.*requires"):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX",
                charge_code="   ", value_date="\t",
            )

    @pytest.mark.parametrize(
        ("field", "value"),
        [("charge_code", "INVALID"), ("value_date", "when-convenient")],
    )
    def test_schema_rejects_unsupported_settlement_terms(self, field, value):
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        payload = {
            "beneficiary_bic": "BOPIPHMMXXX",
            "currency": "USD",
            "intermediary_bic": "CITIUS33XXX",
            "charge_code": "SHA",
            "value_date": "spot",
            field: value,
        }
        with pytest.raises(ValidationError):
            SSIRecord(**payload)

    def test_schema_accepts_a_well_formed_bic_only_record(self):
        from app.schemas import SSIRecord

        record = SSIRecord(
            beneficiary_bic="EBILAEADXXX", currency="USD",
            intermediary_bic="EBILAEADXXX", status="unverified",
            as_of="2026-05-01", bic_only=True,
        )
        assert record.bic_only is True

    def test_schema_normalizes_empty_strings_to_absent(self):
        """Empty strings mean "absent" everywhere in this model — an empty
        charge_code or value_date on a bic_only record must be a valid
        persisted shape (NULL), not a flush-time IntegrityError."""
        from app.schemas import SSIRecord

        record = SSIRecord(
            beneficiary_bic="EBILAEADXXX", currency="USD",
            intermediary_bic="EBILAEADXXX", status="unverified",
            as_of="2026-05-01", bic_only=True,
            intermediary_account="", beneficiary_account="",
            charge_code="", value_date="",
        )
        assert record.intermediary_account is None
        assert record.beneficiary_account is None
        assert record.charge_code is None
        assert record.value_date is None

    def test_schema_rejects_bic_only_record_with_accounts(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="EBILAEADXXX", currency="USD",
                intermediary_bic="EBILAEADXXX", status="unverified",
                as_of="2026-05-01", bic_only=True,
                intermediary_account="ACCT-91001629",
            )

    def test_database_rejects_bic_only_row_with_accounts(self, db_session_clean):
        """Raw SQL, deliberately: the ORM would have caught it earlier; the
        CHECK constraint is the backstop for Core inserts and direct writers."""
        import pytest
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                "status, notes, bic_only, intermediary_account) "
                "VALUES ('EBILAEADXXX', 'USD', 'EBILAEADXXX', 'unverified', "
                "'Source: x', 1, 'ACCT-91001629')"
            ))
        db_session_clean.rollback()

    def test_database_rejects_an_ordinary_row_without_settlement_terms(
        self, db_session_clean
    ):
        """A raw writer cannot create a routable ordinary row with no terms."""
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                "status, notes, bic_only) VALUES "
                "('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'illustrative', NULL, 0)"
            ))
        db_session_clean.rollback()

    def test_database_rejects_an_ordinary_row_with_empty_settlement_terms(
        self, db_session_clean
    ):
        """Empty strings are the same missing terms the API normalizes away."""
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                "status, notes, bic_only, charge_code, value_date) VALUES "
                "('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'illustrative', NULL, "
                "0, '', '')"
            ))
        db_session_clean.rollback()

    def test_database_rejects_an_unknown_status(self, db_session_clean):
        """Raw SQL, deliberately: the ORM listener would catch this first, so
        going around it is what proves the CHECK constraint is a real backstop
        rather than decoration."""
        import pytest
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, "
                "notes, charge_code, value_date) VALUES "
                "('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'totally-fine', 'Source: x', "
                "'SHA', 'spot')"
            ))
        db_session_clean.rollback()


def test_the_three_definitions_of_the_status_set_cannot_drift():
    """The value is declared in three places that cannot import each other:
    the Pydantic schema, the model's CHECK constraint, and the autopilot
    (which is stdlib-only by design). Pin them together."""
    import re
    from pathlib import Path

    from app.models import SSI
    from app.schemas import SSI_STATUSES

    check = next(
        c for c in SSI.__table__.constraints if getattr(c, "name", "") == "ck_ssi_status"
    )
    in_check = set(re.findall(r"'(\w+)'", str(check.sqltext)))
    assert in_check == set(SSI_STATUSES), (in_check, SSI_STATUSES)

    autopilot_src = (
        Path(__file__).resolve().parents[1] / "scripts" / "ssi-autopilot" / "autopilot.py"
    ).read_text()
    declared = re.search(r"SSI_STATUSES = \{([^}]+)\}", autopilot_src).group(1)
    assert set(re.findall(r'"(\w+)"', declared)) == set(SSI_STATUSES)


class TestNonIllustrativeRowsCiteASource:
    """"published" and "archived" both assert a bank document was read. A row
    making that claim must carry the citation that backs it."""

    def test_every_sourced_status_carries_a_source_citation(self):
        rows = TestSSIProvenanceIsConsistentWithItsSource._rows
        bad = [
            (bic, status, note[:70])
            for bic, note, _as_of, status in rows()
            if status in ("published", "unverified", "archived")
            and "_SSI_REAL_NOTE" not in note
        ]
        assert not bad, (
            f"{len(bad)} row(s) claim a bank source without citing one: {bad[:3]}"
        )


class TestProvenanceCannotBeForgedByAWriter:
    """The autopilot validator guards one path. /api/import/ssi and direct ORM
    writes reach the same column and must not be able to manufacture authority."""

    def test_an_import_claiming_a_source_without_one_is_downgraded(self, tmp_path):
        from app.services.ssi_importer import validate_ssi_row

        normalized, errors = validate_ssi_row({
            "beneficiary_bic": "BOPIPHMMXXX", "currency": "USD",
            "intermediary_bic": "CITIUS33XXX", "status": "unverified",
        })
        assert errors == []
        assert normalized["status"] == "illustrative", (
            "an import with no citation kept a sourced status"
        )

    def test_an_import_with_a_citation_keeps_its_status(self):
        from app.services.ssi_importer import validate_ssi_row

        normalized, errors = validate_ssi_row({
            "beneficiary_bic": "BOPIPHMMXXX", "currency": "USD",
            "intermediary_bic": "CITIUS33XXX", "status": "archived",
            "notes": "Source: https://bank.example/ssi (archived 2021-01-01).",
        })
        assert errors == []
        assert normalized["status"] == "archived"

    def test_database_rejects_a_sourced_status_with_no_citation(self, db_session_clean):
        import pytest
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, "
                "charge_code, value_date) VALUES "
                "('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'unverified', 'SHA', 'spot')"
            ))
        db_session_clean.rollback()

    def test_database_allows_an_illustrative_row_with_no_citation(self, db_session_clean):
        from app.models import SSI

        db_session_clean.add(SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="illustrative", notes=None,
            charge_code="SHA", value_date="spot",
        ))
        db_session_clean.commit()


class TestPublishedCannotBeSelfAsserted:
    """"published" means someone verified the bank still publishes this today.
    A CSV upload or a direct ORM write has not done that, so neither may claim
    it — and the claim needs the verification date that backs it."""

    def test_an_import_cannot_claim_published(self):
        from app.services.ssi_importer import validate_ssi_row

        normalized, errors = validate_ssi_row({
            "beneficiary_bic": "BOPIPHMMXXX", "currency": "USD",
            "intermediary_bic": "CITIUS33XXX", "status": "published",
            "notes": "Source: https://bank.example/ssi.",
        })
        assert errors == []
        assert normalized["status"] == "unverified", (
            "an import self-asserted verified-live provenance"
        )

    def test_an_import_keeps_the_statuses_it_can_actually_evidence(self):
        from app.services.ssi_importer import validate_ssi_row

        for claimed in ("unverified", "archived"):
            normalized, errors = validate_ssi_row({
                "beneficiary_bic": "BOPIPHMMXXX", "currency": "USD",
                "intermediary_bic": "CITIUS33XXX", "status": claimed,
                "notes": "Source: https://bank.example/ssi.",
            })
            assert errors == [], (claimed, errors)
            assert normalized["status"] == claimed

    def test_published_without_a_verification_date_is_rejected_by_the_schema(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="published",
                charge_code="SHA", value_date="spot",
            )

    def test_published_with_a_verification_date_is_accepted(self):
        # Computed, not hardcoded. A literal "today" passes forever once that
        # date is past, but fails on a machine whose clock is set earlier —
        # a real if narrow way for the suite to break for the wrong reason.

        from app.schemas import SSIRecord

        record = SSIRecord(
            beneficiary_bic="BOPIPHMMXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            charge_code="SHA", value_date="spot",
            as_of=_utc_yesterday(),
            verified_by="ops:ada",
        )
        assert record.status == "published"

    def test_published_verified_today_is_accepted(self):

        from app.schemas import SSIRecord

        record = SSIRecord(
            beneficiary_bic="BOPIPHMMXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            charge_code="SHA", value_date="spot",
            as_of=_utc_today(),
            verified_by="ops:ada",
        )
        assert record.status == "published"

    def test_published_verified_tomorrow_is_rejected(self):

        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="published",
                charge_code="SHA", value_date="spot",
                as_of=_utc_tomorrow(),
            )

    def test_a_future_verification_date_is_rejected(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="archived",
                charge_code="SHA", value_date="spot",
                as_of="2999-01-01",
            )

    def test_database_rejects_published_without_a_date(self, db_session_clean):
        """Raw SQL again — the CHECK has to hold even when nothing Python-side
        is in the way."""
        import pytest
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, "
                "notes, charge_code, value_date) VALUES "
                "('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'published', 'Source: x', "
                "'SHA', 'spot')"
            ))
        db_session_clean.rollback()

    def test_a_published_row_persists_when_it_names_a_verifier(self, db_session_clean):
        """This test previously omitted verified_by, so the listener downgraded
        the row and the commit succeeded — it passed while proving nothing
        about a published record surviving."""

        from app.models import SSI, record_verified_publication

        row = SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="unverified",
            notes="Source: https://bank.example/ssi.",
            charge_code="SHA", value_date="spot",
        )
        record_verified_publication(row, verified_by="ops:ada",
                                    verified_on=_utc_today())
        db_session_clean.add(row)
        db_session_clean.commit()
        db_session_clean.refresh(row)
        assert row.status == "published", "the row did not persist as published"
        assert row.verified_by == "ops:ada"


class TestProvenanceInvariantsHoldForAnyOrmWrite:
    """The schema validators only run on Pydantic input. seed.py, the importer
    and any other caller build SSI objects directly, so the invariants have to
    hold at the ORM boundary too — with the CHECK constraints as the backstop
    for raw SQL."""

    @staticmethod
    def _row(**overrides):
        from app.models import SSI

        fields = dict(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            notes="Source: https://bank.example/ssi.",
            as_of=_utc_today(),
            verified_by="ops:ada",
            charge_code="SHA", value_date="spot",
        )
        fields.update(overrides)
        return SSI(**fields)

    def test_a_future_verification_date_is_refused_on_a_direct_write(self, db_session_clean):
        import pytest

        db_session_clean.add(self._row(as_of="2999-01-01"))
        with pytest.raises(ValueError, match="future"):
            db_session_clean.commit()
        db_session_clean.rollback()

    def test_a_malformed_verification_date_is_refused_on_a_direct_write(self, db_session_clean):
        import pytest

        db_session_clean.add(self._row(as_of="16/08/2026"))
        with pytest.raises(ValueError, match="ISO date"):
            db_session_clean.commit()
        db_session_clean.rollback()

    def test_published_without_a_date_is_refused_when_a_verifier_is_named(
        self, db_session_clean
    ):
        """A row with no verifier is downgraded rather than refused, so naming
        one is what makes the missing date an error rather than an ordinary
        generic write."""
        import pytest

        row = self._row(as_of=None, verified_by="ops:ada")
        db_session_clean.add(row)
        with pytest.raises(ValueError, match="as_of"):
            db_session_clean.commit()
        db_session_clean.rollback()

    def test_published_without_a_verifier_is_downgraded_not_refused(self, db_session_clean):
        row = self._row(verified_by=None)
        db_session_clean.add(row)
        db_session_clean.commit()
        assert row.status == "unverified"

    def test_an_unknown_status_is_refused_on_a_direct_write(self, db_session_clean):
        import pytest

        db_session_clean.add(self._row(status="totally-current"))
        with pytest.raises(ValueError, match="status"):
            db_session_clean.commit()
        db_session_clean.rollback()

    def test_a_future_date_is_refused_on_an_update_too(self, db_session_clean):
        import pytest

        row = self._row()
        db_session_clean.add(row)
        db_session_clean.commit()
        row.as_of = "2999-01-01"
        with pytest.raises(ValueError, match="future"):
            db_session_clean.commit()
        db_session_clean.rollback()

    def test_a_valid_past_verification_date_still_writes(self, db_session_clean):
        db_session_clean.add(self._row())
        db_session_clean.commit()


class TestProvenanceSurvivesTheBypassPaths:
    """Mapper events do not fire for Core inserts, bulk operations or raw SQL.
    Whatever the database itself refuses is the only guarantee that survives
    those paths, so it has to refuse a malformed or future date on its own."""

    @staticmethod
    def _insert(session, **overrides):
        from sqlalchemy import text

        row = dict(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            notes="Source: https://bank.example/ssi.", as_of="2020-01-01",
            verified_by="research",
            charge_code="SHA", value_date="spot",
        )
        row.update(overrides)
        session.execute(
            text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                "status, notes, as_of, verified_by, charge_code, value_date) "
                "VALUES (:beneficiary_bic, :currency, :intermediary_bic, :status, "
                ":notes, :as_of, :verified_by, :charge_code, :value_date)"
            ),
            row,
        )

    def test_raw_sql_cannot_store_a_future_date(self, db_session_clean):
        """This used to be an accepted limit. A CHECK genuinely cannot express
        it — SQLite calls date('now') non-deterministic and Postgres wants an
        IMMUTABLE function — but a trigger can, on both engines."""
        import pytest
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            self._insert(db_session_clean, as_of="2999-01-01")
        db_session_clean.rollback()

    def test_raw_sql_cannot_store_an_impossible_calendar_date(self, db_session_clean):
        import pytest
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            self._insert(db_session_clean, as_of="2024-02-30")
        db_session_clean.rollback()

    def test_a_leap_day_in_a_leap_year_is_still_a_real_date(self, db_session_clean):
        self._insert(db_session_clean, as_of="2024-02-29")
        db_session_clean.commit()

    def test_raw_sql_cannot_update_a_row_to_a_future_date(self, db_session_clean):
        import pytest
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        self._insert(db_session_clean, as_of="2020-01-01")
        db_session_clean.commit()
        with pytest.raises(IntegrityError):
            db_session_clean.execute(
                text("UPDATE ssi SET as_of = '2999-01-01' WHERE beneficiary_bic = 'AAAAGB2LXXX'")
            )
        db_session_clean.rollback()

    def test_raw_sql_cannot_store_a_malformed_verification_date(self, db_session_clean):
        import pytest
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            self._insert(db_session_clean, as_of="garbage")
        db_session_clean.rollback()

    def test_raw_sql_cannot_store_a_whitespace_verification_date(self, db_session_clean):
        import pytest
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            self._insert(db_session_clean, as_of="   ")
        db_session_clean.rollback()

    def test_raw_sql_cannot_store_a_year_zero_date(self, db_session_clean):
        """SQLite round-trips '0000-01-01' happily; datetime.date calls year 0
        out of range. Without an explicit clause the database would accept a
        row the application could never validate or update again."""
        import pytest
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            self._insert(db_session_clean, as_of="0000-01-01")
        db_session_clean.rollback()

    def test_the_earliest_date_python_supports_is_still_allowed(self, db_session_clean):
        self._insert(db_session_clean, as_of="0001-01-01")
        db_session_clean.commit()

    def test_raw_sql_still_stores_a_valid_past_date(self, db_session_clean):
        self._insert(db_session_clean, as_of="2020-01-01")
        db_session_clean.commit()

    def test_a_bulk_save_cannot_store_a_malformed_date(self, db_session_clean):
        import pytest
        from sqlalchemy.exc import IntegrityError

        from app.models import SSI

        # bulk_save_objects skips the mapper events entirely, so the shape
        # constraint is the only thing left between it and the table.
        # bulk_save_objects flushes immediately, so the error surfaces there
        # rather than at commit.
        with pytest.raises(IntegrityError):
            db_session_clean.bulk_save_objects([SSI(
                beneficiary_bic="AAAAGB2LXXX", currency="EUR",
                intermediary_bic="CITIUS33XXX", status="published",
                notes="Source: x", as_of="garbage",
                charge_code="SHA", value_date="spot",
            )])
        db_session_clean.rollback()


class TestSchemaIsPortable:
    """The suite builds every schema on SQLite, so a SQLite-only expression in
    a constraint passes here and fails on the production engine. An earlier
    revision emitted SQLite's GLOB verbatim on Postgres, where it is not an
    operator."""

    def test_no_table_emits_a_sqlite_only_operator_on_postgres(self):
        from sqlalchemy.dialects import postgresql
        from sqlalchemy.schema import CreateTable

        from app.db import Base

        offenders = []
        for table in Base.metadata.sorted_tables:
            ddl = str(CreateTable(table).compile(dialect=postgresql.dialect()))
            for operator in (" GLOB ", "date('now'", "datetime('now'"):
                if operator in ddl:
                    offenders.append((table.name, operator.strip()))
        assert not offenders, f"SQLite-only SQL emitted for Postgres: {offenders}"
    def test_boolean_default_and_bic_only_check_compile_for_postgres(self):
        """The suite builds schema on SQLite, where `bic_only = 0` (integer
        affinity) and `DEFAULT 0` work — even though PostgreSQL rejects both:
        there is no `boolean = integer` operator, and a Boolean column will
        not take an integer default. Compile the real model DDL for the
        production dialect and prove it is valid."""
        from sqlalchemy.dialects import postgresql
        from sqlalchemy.schema import CreateTable

        from app.models import SSI

        ddl = str(CreateTable(SSI.__table__).compile(dialect=postgresql.dialect()))
        assert "bic_only BOOLEAN DEFAULT false NOT NULL" in ddl, ddl
        assert "NOT bic_only OR" in ddl, ddl
        assert "bic_only = 0" not in ddl, "integer literal against boolean breaks Postgres"

    def test_migration_boolean_ddl_is_postgres_valid(self):
        """The bic_only migration re-declares the column and its CHECK for
        existing databases outside Base.metadata, so the DDL check above cannot
        see it. Replay the exact migration declarations through the Postgres
        compiler and prove they are valid there, not just on SQLite."""
        import importlib.util
        from pathlib import Path

        from sqlalchemy import Boolean, CheckConstraint, Column, MetaData, Table, text
        from sqlalchemy.dialects import postgresql
        from sqlalchemy.schema import CreateTable

        spec = importlib.util.spec_from_file_location(
            "20260819_add_ssi_bic_only",
            Path(__file__).resolve().parents[1]
            / "alembic" / "versions" / "20260819_add_ssi_bic_only.py",
        )
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)

        assert migration.BIC_ONLY_HAS_NO_ACCOUNTS.startswith("NOT bic_only OR")

        replay = Table(
            "ssi", MetaData(),
            Column("bic_only", Boolean(), nullable=False, server_default=text("false")),
            CheckConstraint(
                migration.BIC_ONLY_HAS_NO_ACCOUNTS,
                name="ck_ssi_bic_only_has_no_accounts",
            ),
        )
        ddl = str(CreateTable(replay).compile(dialect=postgresql.dialect()))
        assert "DEFAULT false" in ddl, ddl
        assert "NOT bic_only OR" in ddl, ddl
        assert "bic_only = 0" not in ddl, ddl



    def test_no_migration_uses_sql_that_only_behaves_on_sqlite(self):
        """The DDL check above reads Base.metadata, so it cannot see SQL written
        inside a migration — which is how a CAST of a text column reached the
        tree. SQLite casts 'ab' to 0 silently; Postgres raises and takes the
        deploy down with it."""
        import re
        from pathlib import Path

        versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
        risky = {
            "CAST(": "casting a text column is dialect-dependent; judge it in Python",
            " GLOB ": "GLOB is not an operator on Postgres",
            "date('now'": "non-deterministic in a CHECK, and dialect-specific",
            "strftime(": "SQLite-only",
        }
        offenders = []
        for migration in versions.glob("*.py"):
            body = migration.read_text()
            # Comments explain these hazards on purpose; only code counts.
            code = "\n".join(
                line for line in body.splitlines()
                if not line.strip().startswith("#")
            )
            code = re.sub(r'""".*?"""', "", code, flags=re.S)
            # A migration may use dialect-specific SQL when it declares so and
            # supplies both branches — a trigger body has no portable form.
            # What stays forbidden is SQLite-only SQL presented as portable.
            if "DIALECT_SPECIFIC_SQL = True" in code:
                # Naming a constant SSI_AS_OF_POSTGRES satisfies a substring
                # test while upgrade() still runs only the SQLite statements.
                # Requiring `dialect.name` means the migration has to actually
                # choose at runtime, which is the thing the declaration claims.
                assert "dialect.name" in code, (
                    f"{migration.name} declares dialect-specific SQL but never "
                    f"inspects dialect.name, so it cannot be branching"
                )
                assert "sqlite" in code and "postgres" in code.lower(), (
                    f"{migration.name} declares dialect-specific SQL but does "
                    f"not name both engines"
                )
                continue
            for token, why in risky.items():
                if token in code:
                    offenders.append((migration.name, token, why))
        assert not offenders, f"dialect-risky SQL in a migration: {offenders}"

    def test_the_model_and_the_migration_agree_on_the_as_of_shape(self):
        """They are separate declarations of one rule; drift between them is
        how the Postgres bug got in."""
        import re
        from pathlib import Path

        from app.models import SSI

        migration = (
            Path(__file__).resolve().parents[1]
            / "alembic" / "versions" / "20260816_ssi_as_of_shape.py"
        ).read_text()
        declared = re.search(r'SHAPE = "(.+?)"', migration).group(1)

        constraint = next(
            c for c in SSI.__table__.constraints
            if getattr(c, "name", "") == "ck_ssi_as_of_is_a_past_iso_date"
        )
        assert str(constraint.sqltext) == declared


class TestValidationAgreesWithTheDatabase:
    """date.fromisoformat accepts more than the dashed form on modern Python —
    compact dates and week dates parse fine but fail the LIKE constraint. That
    turns a field-level validation error into an IntegrityError at flush."""

    def test_a_compact_iso_date_is_rejected_by_the_schema(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="archived",
                charge_code="SHA", value_date="spot",
                as_of="20240215",
            )

    def test_an_iso_week_date_is_rejected_by_the_schema(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="archived",
                charge_code="SHA", value_date="spot",
                as_of="2024-W07-3",
            )

    def test_a_compact_iso_date_is_rejected_at_the_orm_boundary(self, db_session_clean):
        import pytest

        from app.models import SSI

        db_session_clean.add(SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="archived",
            notes="Source: x", as_of="20240215",
            charge_code="SHA", value_date="spot",
        ))
        with pytest.raises(ValueError, match="YYYY-MM-DD"):
            db_session_clean.commit()
        db_session_clean.rollback()

    def test_the_dashed_form_still_works_everywhere(self, db_session_clean):
        from app.models import SSI
        from app.schemas import SSIRecord

        assert SSIRecord(
            beneficiary_bic="BOPIPHMMXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="archived",
            charge_code="SHA", value_date="spot",
            as_of="2024-02-15",
        ).as_of == "2024-02-15"
        db_session_clean.add(SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="archived",
            notes="Source: x", as_of="2024-02-15",
            charge_code="SHA", value_date="spot",
        ))
        db_session_clean.commit()


class TestOnlyTheVerificationPathCanPublish:
    """"published" asserts the bank publishes this *today*. A caller that
    cannot name who established that is not making that claim, whatever it
    puts in the status field."""

    @staticmethod
    def _row(**overrides):

        from app.models import SSI

        fields = dict(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            notes="Source: https://bank.example/ssi.",
            as_of=_utc_today(),
            charge_code="SHA", value_date="spot",
        )
        fields.update(overrides)
        return SSI(**fields)

    def test_a_generic_orm_write_claiming_published_is_downgraded(self, db_session_clean):
        row = self._row()
        db_session_clean.add(row)
        db_session_clean.commit()
        assert row.status == "unverified", "a generic writer manufactured a published row"

    def test_the_verification_path_produces_a_published_row(self, db_session_clean):

        from app.models import record_verified_publication

        row = self._row(status="unverified")
        record_verified_publication(row, verified_by="ops:ada", verified_on=_utc_today())
        db_session_clean.add(row)
        db_session_clean.commit()
        assert row.status == "published"
        assert row.verified_by == "ops:ada"

    def test_the_verification_path_refuses_an_anonymous_verifier(self):

        import pytest

        from app.models import record_verified_publication

        with pytest.raises(ValueError, match="verifier"):
            record_verified_publication(self._row(), verified_by="  ", verified_on=_utc_today())

    def test_the_verification_path_refuses_a_future_check(self):

        import pytest

        from app.models import record_verified_publication

        with pytest.raises(ValueError, match="future"):
            record_verified_publication(
                self._row(), verified_by="ops:ada",
                verified_on=_utc_tomorrow(),
            )

    def test_raw_sql_cannot_publish_without_naming_a_verifier(self, db_session_clean):
        import pytest
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                "status, notes, as_of, charge_code, value_date) VALUES "
                "('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'published', 'Source: x', "
                "'2020-01-01', 'SHA', 'spot')"
            ))
        db_session_clean.rollback()

    def test_the_response_schema_refuses_an_unattributed_published_record(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="published",
                charge_code="SHA", value_date="spot",
                as_of="2020-01-01",
            )


class TestAVerifierMustBeAName:
    """"   " passes a truthiness test and a `!= ''` check while attributing
    nothing. An unattributable published row is the thing being prevented."""

    def test_the_schema_rejects_a_whitespace_verifier(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="published",
                charge_code="SHA", value_date="spot",
                as_of="2020-01-01", verified_by="   ",
            )

    def test_a_whitespace_verifier_downgrades_an_orm_write(self, db_session_clean):

        from app.models import SSI

        row = SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            notes="Source: x", as_of=_utc_today(), verified_by="   ",
            charge_code="SHA", value_date="spot",
        )
        db_session_clean.add(row)
        db_session_clean.commit()
        assert row.status == "unverified"
        assert row.verified_by is None

    def test_raw_sql_cannot_publish_with_a_whitespace_verifier(self, db_session_clean):
        import pytest
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                "status, notes, as_of, verified_by, charge_code, value_date) "
                "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'published', "
                "'Source: x', '2020-01-01', '   ', 'SHA', 'spot')"
            ))
        db_session_clean.rollback()

    @pytest.mark.parametrize("verifier", ["\t", "\n", "\r", " \t \r\n ", "\u00a0", "\u00a0\u00a0"])
    def test_raw_sql_cannot_publish_with_a_whitespace_only_verifier(
        self, db_session_clean, verifier
    ):
        """Default TRIM() removes only spaces on both engines, so a tab-,
        newline-, or non-breaking-space-only verifier used to satisfy the
        published CHECK while Python's str.strip() called it empty — the
        database and the application disagreeing about what a name is. The
        constraint names its charset now."""
        import pytest
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                "status, notes, as_of, verified_by, charge_code, value_date) "
                "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'published', "
                "'Source: x', '2020-01-01', :v, 'SHA', 'spot')"
            ), {"v": verifier})
        db_session_clean.rollback()

    def test_a_padded_verifier_is_stored_trimmed(self, db_session_clean):
        from datetime import datetime, timezone

        from app.models import SSI, record_verified_publication

        row = SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="unverified", notes="Source: x",
            charge_code="SHA", value_date="spot",
        )
        record_verified_publication(
            row, verified_by="  ops:ada  ",
            verified_on=datetime.now(timezone.utc).date().isoformat(),
        )
        db_session_clean.add(row)
        db_session_clean.commit()
        assert row.verified_by == "ops:ada"


class TestAVerifierOnlyRidesOnPublished:
    """A verifier names who confirmed the bank still publishes; no other status
    claims that, so an attribution attached to one is the API lying about the
    row. Enforced in Pydantic, the ORM listener, and a CHECK for the bypass
    paths."""

    def test_the_schema_rejects_a_verifier_on_a_non_published_row(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        for status in ("unverified", "archived", "illustrative"):
            with pytest.raises(ValidationError, match="only meaningful"):
                SSIRecord(
                    beneficiary_bic="BOPIPHMMXXX", currency="USD",
                    intermediary_bic="CITIUS33XXX", status=status,
                    charge_code="SHA", value_date="spot",
                    notes="Source: https://bank.example/ssi.",
                    verified_by="ops:ada",
                )

    def test_an_orm_write_clears_a_verifier_on_a_non_published_row(
        self, db_session_clean
    ):
        from app.models import SSI

        row = SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="archived",
            notes="Source: https://bank.example/ssi.", as_of="2020-01-01",
            verified_by="ops:ada",
            charge_code="SHA", value_date="spot",
        )
        db_session_clean.add(row)
        db_session_clean.commit()
        db_session_clean.refresh(row)
        assert row.verified_by is None, (
            "an attribution survived on a row that makes no currency claim"
        )

    def test_a_downgrade_clears_the_verifier_it_or_phans(self, db_session_clean):
        """The write that loses "published" loses the attribution with it, or
        the API keeps showing a verifier for a row that no longer verifies."""

        from app.models import SSI

        row = SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="unverified",
            notes="Source: https://bank.example/ssi.",
            charge_code="SHA", value_date="spot",
        )
        row.status = "published"
        row.verified_by = "ops:ada"
        row.as_of = _utc_today()
        # Simulate an ordinary edit that loses the claim: the listener must
        # clear the orphaned verifier instead of leaving it attached.
        row.status = "archived"
        db_session_clean.add(row)
        db_session_clean.commit()
        db_session_clean.refresh(row)
        assert row.status == "archived"
        assert row.verified_by is None

    def test_raw_sql_cannot_attach_a_verifier_to_a_non_published_row(
        self, db_session_clean
    ):
        import pytest
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                "status, notes, as_of, verified_by, charge_code, value_date) "
                "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'archived', "
                "'Source: x', '2020-01-01', 'ops:ada', 'SHA', 'spot')"
            ))
        db_session_clean.rollback()

class TestAVerifiedRowSurvivesOrdinaryEditing:
    """The promotion marker is transient, so it is absent on every row loaded
    back from the database. Checking it on any update meant that fixing a typo
    in `notes` silently downgraded a verified row and orphaned its verifier —
    the exact state the column exists to protect."""

    @staticmethod
    def _publish(session):

        from app.models import SSI, record_verified_publication

        row = SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="unverified",
            notes="Source: https://bank.example/ssi.",
            charge_code="SHA", value_date="spot",
        )
        record_verified_publication(row, verified_by="ops:ada",
                                    verified_on=_utc_today())
        session.add(row)
        session.commit()
        return row

    def test_editing_an_unrelated_field_preserves_published(self, db_session_clean):
        from app.models import SSI

        self._publish(db_session_clean)
        db_session_clean.expunge_all()

        reloaded = db_session_clean.query(SSI).filter(SSI.beneficiary_bic == "AAAAGB2LXXX").one()
        assert reloaded.status == "published"
        reloaded.notes = "Source: https://bank.example/ssi. (typo fixed)"
        db_session_clean.commit()
        db_session_clean.refresh(reloaded)
        assert reloaded.status == "published", "an unrelated edit destroyed the verification"
        assert reloaded.verified_by == "ops:ada"
    def test_re_verification_through_the_promotion_path_still_works(self, db_session_clean):

        from app.models import SSI, record_verified_publication

        self._publish(db_session_clean)
        db_session_clean.expunge_all()

        reloaded = db_session_clean.query(SSI).filter(SSI.beneficiary_bic == "AAAAGB2LXXX").one()
        record_verified_publication(reloaded, verified_by="ops:grace",
                                    verified_on=_utc_today())
        db_session_clean.commit()
        db_session_clean.refresh(reloaded)
        assert reloaded.status == "published"
        assert reloaded.verified_by == "ops:grace"
class TestTheMigrationOwnsItsOwnSql:
    """A migration must keep doing what it did the day it was written, so it
    copies the trigger SQL rather than importing today's. The copy is what
    makes drift possible, so this pins the two together — immutability without
    the divergence that duplication usually brings."""

    @staticmethod
    def _migration_source():
        from pathlib import Path

        return (
            Path(__file__).resolve().parents[1]
            / "alembic" / "versions" / "20260816_ssi_verified_by.py"
        ).read_text()

    def test_the_migration_does_not_import_live_model_sql(self):
        source = self._migration_source()
        assert "from app.models import" not in source, (
            "the migration imports application SQL; a later model edit would "
            "silently change how an old database upgrades"
        )

    def test_the_migration_trigger_sql_matches_the_model(self):
        """Compares values, not text: the constants are f-strings, so only
        evaluating them proves the two definitions agree."""
        import ast

        from app import models

        wanted = {
            "_MESSAGE", "SSI_AS_OF_MESSAGE", "_SQLITE_AS_OF_CONDITION",
            "SSI_AS_OF_SQLITE", "SSI_AS_OF_POSTGRES", "VERIFIER_IS_A_NAME",
        }
        tree = ast.parse(self._migration_source())
        assignments = [
            node for node in tree.body
            if isinstance(node, ast.Assign)
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id in wanted
        ]
        namespace: dict = {}
        exec(compile(ast.Module(body=assignments, type_ignores=[]),  # noqa: S102
                     "<migration-constants>", "exec"), namespace)

        assert namespace["SSI_AS_OF_SQLITE"] == models.SSI_AS_OF_SQLITE, (
            "the migration's SQLite triggers have drifted from the model's"
        )
        assert namespace["SSI_AS_OF_POSTGRES"] == models.SSI_AS_OF_POSTGRES, (
            "the migration's Postgres triggers have drifted from the model's"
        )
        assert namespace["VERIFIER_IS_A_NAME"] == models.VERIFIER_IS_A_NAME, (
            "the migration's verifier constraint has drifted from the model's"
        )


class TestPublishedIsAttributionNotAuthorisation:
    """The contract this settled on, stated as a test so it cannot drift back
    by accident.

    An earlier revision tried to make "published" unforgeable with a transient
    promotion marker. That marker did not survive a reload, so an ordinary edit
    to an unrelated field silently downgraded a verified row — it destroyed the
    state it existed to protect. The marker was removed deliberately.

    What holds now: a published row must name a verifier and a date, so every
    claim is attributable to whoever wrote it. Preventing a *false* claim needs
    an authenticated identity, which no database layer has; that belongs to the
    service layer.
    """

    @staticmethod
    def _utc_today():
        from datetime import datetime, timezone

        return datetime.now(timezone.utc).date().isoformat()

    def test_a_named_verifier_is_taken_at_its_word(self, db_session_clean):
        from app.models import SSI

        row = SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            notes="Source: https://bank.example/ssi.",
            as_of=self._utc_today(), verified_by="ops:ada",
            charge_code="SHA", value_date="spot",
        )
        db_session_clean.add(row)
        db_session_clean.commit()
        assert row.status == "published"
        assert row.verified_by == "ops:ada"

    def test_an_unattributed_claim_is_still_refused(self, db_session_clean):
        from app.models import SSI

        row = SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            notes="Source: x", as_of=self._utc_today(),
            charge_code="SHA", value_date="spot",
        )
        db_session_clean.add(row)
        db_session_clean.commit()
        assert row.status == "unverified", "an unattributable claim was stored"

    def test_no_promotion_marker_machinery_remains(self):
        """The mechanism was removed, not disabled. A half-present marker is
        how the silent downgrade happened."""
        from pathlib import Path

        source = (
            Path(__file__).resolve().parents[1] / "app" / "models.py"
        ).read_text()
        assert "_PROMOTION_MARKER" not in source
        assert "_provenance_is_being_assigned" not in source

    def test_the_listener_is_registered_for_both_insert_and_update(self):
        """Removing the marker meant editing the block these calls sat in, and
        an earlier attempt deleted them outright — every ORM invariant silently
        stopped running while the suite still passed 187 tests."""
        from sqlalchemy import event

        from app.models import SSI, _validate_ssi_provenance

        assert event.contains(SSI, "before_insert", _validate_ssi_provenance)
        assert event.contains(SSI, "before_update", _validate_ssi_provenance)


class TestResearchCanActuallyPublishThroughTheSeed:
    """SKILL.md tells research a published record must name a verifier, but the
    seed tuple had no field for one — so a researcher following the file wrote
    "published" and the seed silently stored "unverified". Documentation
    promising what the format could not express."""

    def test_the_seed_tuple_carries_a_verifier(self):
        import inspect

        from app.services import seed

        source = inspect.getsource(seed.seed_if_empty)
        assert "verified_by=verified_by" in source, (
            "seed writes provenance but drops the verifier"
        )

    def test_a_thirteen_field_row_persists_as_published(self, db_session_clean):
        from app.models import SSI

        # exactly what seed.py builds from a 13-field tuple
        row = SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX",
            notes="Source: https://bank.example/ssi.",
            as_of="2020-01-01", status="published", verified_by="ops:ada",
            charge_code="SHA", value_date="spot",
        )
        db_session_clean.add(row)
        db_session_clean.commit()
        db_session_clean.refresh(row)
        assert row.status == "published"
        assert row.verified_by == "ops:ada"

    def test_a_twelve_field_published_row_is_still_downgraded(self, db_session_clean):
        """The format is permissive, the invariant is not: omitting the verifier
        does not sneak a published row through, it just loses the claim."""
        from app.models import SSI

        row = SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", notes="Source: x",
            as_of="2020-01-01", status="published",
            charge_code="SHA", value_date="spot",
        )
        db_session_clean.add(row)
        db_session_clean.commit()
        assert row.status == "unverified"

    def test_the_verifier_arity_is_accepted_by_the_seed_verifier(self):
        """cmd_verify pins tuple widths; 13 has to be legal or the fold fails
        structural verification before it reaches the database."""
        import subprocess
        import sys
        from pathlib import Path

        script = (
            Path(__file__).resolve().parents[1]
            / "scripts" / "ssi-autopilot" / "autopilot.py"
        )
        source = script.read_text()
        assert "(10, 12, 13, 14)" in source, "a 14-field bic_only row would fail verify"
        result = subprocess.run(
            [sys.executable, str(script), "verify"], capture_output=True, text=True
        )
        assert result.returncode == 0, result.stdout + result.stderr
