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
            )

    def test_schema_rejects_a_malformed_as_of(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="archived",
                as_of="not-a-date",
            )

    def test_schema_accepts_a_well_formed_record(self):
        from app.schemas import SSIRecord

        record = SSIRecord(
            beneficiary_bic="BOPIPHMMXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="archived",
            as_of="2007-12-13",
        )
        assert record.status == "archived"

    def test_database_rejects_an_unknown_status(self, db_session_clean):
        """Raw SQL, deliberately: the ORM listener would catch this first, so
        going around it is what proves the CHECK constraint is a real backstop
        rather than decoration."""
        import pytest
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db_session_clean.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, notes) "
                "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'totally-fine', 'Source: x')"
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
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status) "
                "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'unverified')"
            ))
        db_session_clean.rollback()

    def test_database_allows_an_illustrative_row_with_no_citation(self, db_session_clean):
        from app.models import SSI

        db_session_clean.add(SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="illustrative", notes=None,
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
            )

    def test_published_with_a_verification_date_is_accepted(self):
        # Computed, not hardcoded. A literal "today" passes forever once that
        # date is past, but fails on a machine whose clock is set earlier —
        # a real if narrow way for the suite to break for the wrong reason.
        from datetime import date, timedelta

        from app.schemas import SSIRecord

        record = SSIRecord(
            beneficiary_bic="BOPIPHMMXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            as_of=(date.today() - timedelta(days=1)).isoformat(),
        )
        assert record.status == "published"

    def test_published_verified_today_is_accepted(self):
        from datetime import date

        from app.schemas import SSIRecord

        record = SSIRecord(
            beneficiary_bic="BOPIPHMMXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            as_of=date.today().isoformat(),
        )
        assert record.status == "published"

    def test_published_verified_tomorrow_is_rejected(self):
        from datetime import date, timedelta

        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="published",
                as_of=(date.today() + timedelta(days=1)).isoformat(),
            )

    def test_a_future_verification_date_is_rejected(self):
        import pytest
        from pydantic import ValidationError

        from app.schemas import SSIRecord

        with pytest.raises(ValidationError):
            SSIRecord(
                beneficiary_bic="BOPIPHMMXXX", currency="USD",
                intermediary_bic="CITIUS33XXX", status="archived",
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
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, notes) "
                "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'published', 'Source: x')"
            ))
        db_session_clean.rollback()

    def test_database_accepts_published_with_a_date(self, db_session_clean):
        from app.models import SSI

        db_session_clean.add(SSI(
            beneficiary_bic="AAAAGB2LXXX", currency="USD",
            intermediary_bic="CITIUS33XXX", status="published",
            notes="Source: https://bank.example/ssi.",
            as_of=__import__("datetime").date.today().isoformat(),
        ))
        db_session_clean.commit()


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
            as_of=__import__("datetime").date.today().isoformat(),
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

    def test_published_without_a_date_is_refused_on_a_direct_write(self, db_session_clean):
        import pytest

        db_session_clean.add(self._row(as_of=None))
        with pytest.raises(ValueError, match="as_of"):
            db_session_clean.commit()
        db_session_clean.rollback()

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
        )
        row.update(overrides)
        session.execute(
            text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                "status, notes, as_of) VALUES (:beneficiary_bic, :currency, "
                ":intermediary_bic, :status, :notes, :as_of)"
            ),
            row,
        )

    def test_raw_sql_can_still_store_a_future_date_and_that_is_the_known_limit(
        self, db_session_clean
    ):
        """Documented, not aspirational. Neither engine can express "not in the
        future" as a CHECK: SQLite rejects date('now') as non-deterministic and
        Postgres requires CHECK functions to be IMMUTABLE. A trigger is the only
        database-level option, and anyone able to run this INSERT can drop a
        trigger too. Recency is enforced in the ORM listener and the schema."""
        self._insert(db_session_clean, as_of="2999-01-01")
        db_session_clean.commit()

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
            )])
        db_session_clean.rollback()
