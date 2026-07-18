"""
Tests for the SSI importer — parsing, validation, upsert semantics, and
rejection of malformed rows.

Covers:
  - CSV parsing (file + raw string)
  - JSON parsing (array + {"records": [...]} wrapper)
  - Format auto-detection
  - Row validation (BIC, currency, charge code, value date)
  - Upsert semantics (insert new, update existing by composite key)
  - Rejection of bad rows with reasons
  - CLI + HTTP endpoint integration
  - Sample files load cleanly
"""
import io
import json
from pathlib import Path

import pytest

from app.services.ssi_importer import (
    detect_and_parse,
    import_ssi_file,
    load_ssi_rows,
    parse_csv,
    parse_json,
    validate_ssi_row,
)

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "samples"


# ===========================================================================
# Parsers
# ===========================================================================


class TestParseCSV:
    def test_parse_csv_from_file(self):
        rows = parse_csv(SAMPLES_DIR / "ssi_sample.csv")
        assert len(rows) == 5
        assert rows[0]["beneficiary_bic"] == "GTBINGLAXXX"
        assert rows[0]["currency"] == "USD"
        assert rows[0]["charge_code"] == "SHA"

    def test_parse_csv_from_raw_string(self):
        csv_text = (
            "beneficiary_bic,currency,intermediary_bic,intermediary_account,"
            "beneficiary_account,charge_code\n"
            "GTBINGLAXXX,USD,CITIUS33XXX,123,456,SHA\n"
        )
        rows = parse_csv(csv_text)
        assert len(rows) == 1
        assert rows[0]["beneficiary_bic"] == "GTBINGLAXXX"

    def test_parse_csv_from_filelike(self):
        text = "beneficiary_bic,currency\nGTBINGLAXXX,USD\n"
        rows = parse_csv(io.StringIO(text))
        assert len(rows) == 1


class TestParseJSON:
    def test_parse_json_array_from_file(self):
        rows = parse_json(SAMPLES_DIR / "ssi_sample.json")
        assert len(rows) == 2
        assert rows[0]["beneficiary_bic"] == "GTBINGLAXXX"

    def test_parse_json_records_wrapper(self):
        data = '{"records": [{"beneficiary_bic": "GTBINGLAXXX", "currency": "USD"}]}'
        rows = parse_json(data)
        assert len(rows) == 1
        assert rows[0]["beneficiary_bic"] == "GTBINGLAXXX"

    def test_parse_json_array_string(self):
        data = '[{"beneficiary_bic": "GTBINGLAXXX", "currency": "USD"}]'
        rows = parse_json(data)
        assert len(rows) == 1

    def test_parse_json_rejects_bad_shape(self):
        with pytest.raises(ValueError):
            parse_json('{"wrong_key": []}')


class TestDetectAndParse:
    def test_detect_csv_by_extension(self):
        rows = detect_and_parse(SAMPLES_DIR / "ssi_sample.csv")
        assert len(rows) == 5

    def test_detect_json_by_extension(self):
        rows = detect_and_parse(SAMPLES_DIR / "ssi_sample.json")
        assert len(rows) == 2

    def test_detect_csv_content_auto(self):
        csv_text = "beneficiary_bic,currency\nGTBINGLAXXX,USD\n"
        rows = detect_and_parse(csv_text)
        assert len(rows) == 1

    def test_detect_json_content_auto(self):
        json_text = '[{"beneficiary_bic": "GTBINGLAXXX", "currency": "USD"}]'
        rows = detect_and_parse(json_text)
        assert len(rows) == 1

    def test_format_hint_overrides(self):
        json_text = '[{"beneficiary_bic": "GTBINGLAXXX", "currency": "USD"}]'
        rows = detect_and_parse(json_text, format_hint="json")
        assert len(rows) == 1


# ===========================================================================
# Row validation
# ===========================================================================


class TestValidateSSIRow:
    def test_valid_row(self):
        raw = {
            "beneficiary_bic": "GTBINGLAXXX",
            "currency": "USD",
            "intermediary_bic": "CITIUS33XXX",
            "intermediary_account": "123",
            "beneficiary_account": "456",
            "charge_code": "SHA",
            "value_date": "spot",
        }
        normalized, errors = validate_ssi_row(raw)
        assert errors == []
        assert normalized["beneficiary_bic"] == "GTBINGLAXXX"
        assert normalized["currency"] == "USD"
        assert normalized["charge_code"] == "SHA"

    def test_8char_bic_normalized_to_11(self):
        raw = {
            "beneficiary_bic": "CITIUS33",
            "currency": "USD",
            "intermediary_bic": "DEUTDEFF",
            "charge_code": "OUR",
        }
        normalized, errors = validate_ssi_row(raw)
        assert errors == []
        assert normalized["beneficiary_bic"] == "CITIUS33XXX"
        assert normalized["intermediary_bic"] == "DEUTDEFFXXX"

    def test_defaults_charge_code_to_sha(self):
        raw = {
            "beneficiary_bic": "GTBINGLAXXX",
            "currency": "USD",
            "intermediary_bic": "CITIUS33XXX",
        }
        normalized, errors = validate_ssi_row(raw)
        assert errors == []
        assert normalized["charge_code"] == "SHA"

    def test_defaults_value_date_to_spot(self):
        raw = {
            "beneficiary_bic": "GTBINGLAXXX",
            "currency": "USD",
            "intermediary_bic": "CITIUS33XXX",
        }
        normalized, errors = validate_ssi_row(raw)
        assert errors == []
        assert normalized["value_date"] == "spot"

    def test_rejects_invalid_beneficiary_bic(self):
        raw = {
            "beneficiary_bic": "NOTREAL1",
            "currency": "USD",
            "intermediary_bic": "CITIUS33XXX",
        }
        normalized, errors = validate_ssi_row(raw)
        assert normalized is None
        assert any("beneficiary_bic" in e for e in errors)

    def test_rejects_invalid_intermediary_bic(self):
        raw = {
            "beneficiary_bic": "GTBINGLAXXX",
            "currency": "USD",
            "intermediary_bic": "GARBAGE",
        }
        normalized, errors = validate_ssi_row(raw)
        assert normalized is None
        assert any("intermediary_bic" in e for e in errors)

    def test_rejects_bad_currency(self):
        raw = {
            "beneficiary_bic": "GTBINGLAXXX",
            "currency": "DOLLARS",
            "intermediary_bic": "CITIUS33XXX",
        }
        normalized, errors = validate_ssi_row(raw)
        assert normalized is None
        assert any("currency" in e for e in errors)

    def test_rejects_bad_charge_code(self):
        raw = {
            "beneficiary_bic": "GTBINGLAXXX",
            "currency": "USD",
            "intermediary_bic": "CITIUS33XXX",
            "charge_code": "SPLIT",
        }
        normalized, errors = validate_ssi_row(raw)
        assert normalized is None
        assert any("charge_code" in e for e in errors)

    def test_rejects_bad_value_date(self):
        raw = {
            "beneficiary_bic": "GTBINGLAXXX",
            "currency": "USD",
            "intermediary_bic": "CITIUS33XXX",
            "value_date": "whenever",
        }
        normalized, errors = validate_ssi_row(raw)
        assert normalized is None
        assert any("value_date" in e for e in errors)

    def test_accepts_all_valid_value_dates(self):
        for vdate in ["same-day", "spot", "T+1", "T+2", "T+3"]:
            raw = {
                "beneficiary_bic": "GTBINGLAXXX",
                "currency": "USD",
                "intermediary_bic": "CITIUS33XXX",
                "value_date": vdate,
            }
            normalized, errors = validate_ssi_row(raw)
            assert errors == [], f"Failed for value_date={vdate}"


# ===========================================================================
# Loader — upsert semantics
# ===========================================================================


class TestLoadSSIRows:
    def test_inserts_new_records(self, db_session):
        """Fresh rows with no matching composite key get inserted."""
        from app.models import SSI
        before = db_session.query(SSI).count()

        rows = [{
            "beneficiary_bic": "EBILAEADXXX",
            "beneficiary_bank_name": "Emirates NBD",
            "currency": "EUR",  # new currency for this bank
            "intermediary_bic": "BNPAFRPPXXX",
            "intermediary_bank_name": "BNP Paribas",
            "intermediary_account": "REAL-EUR-001",
            "beneficiary_account": "REAL-BEN-001",
            "charge_code": "SHA",
            "value_date": "spot",
        }]
        result = load_ssi_rows(db_session, rows)

        assert result.inserted == 1
        assert result.updated == 0
        assert result.rejected == 0
        assert db_session.query(SSI).count() == before + 1

    def test_updates_existing_record_by_composite_key(self, db_session):
        """Re-importing the same (ben_bic, ccy, int_bic) updates account numbers."""
        from sqlalchemy import select

        from app.models import SSI

        # First, insert a record with initial values (using a unique combo
        # that doesn't collide with seed data, so seed assertions stay clean).
        initial_rows = [{
            "beneficiary_bic": "GTBINGLAXXX",
            "currency": "ZAR",  # unique combo not in seed
            "intermediary_bic": "SBICZAJJXXX",
            "intermediary_account": "INITIAL-001",
            "beneficiary_account": "INITIAL-BEN-001",
            "charge_code": "SHA",
            "value_date": "spot",
        }]
        load_ssi_rows(db_session, initial_rows)

        # Now upsert the same composite key with updated values
        rows = [{
            "beneficiary_bic": "GTBINGLAXXX",
            "currency": "ZAR",
            "intermediary_bic": "SBICZAJJXXX",
            "intermediary_account": "UPDATED-001",
            "beneficiary_account": "UPDATED-BEN-001",
            "charge_code": "OUR",  # changed from SHA
            "value_date": "same-day",  # changed from spot
        }]
        result = load_ssi_rows(db_session, rows)

        assert result.inserted == 0
        assert result.updated == 1
        assert result.rejected == 0

        # Verify the update persisted
        row = db_session.execute(
            select(SSI).where(
                SSI.beneficiary_bic == "GTBINGLAXXX",
                SSI.currency == "ZAR",
                SSI.intermediary_bic == "SBICZAJJXXX",
            )
        ).scalar_one()
        assert row.intermediary_account == "UPDATED-001"
        assert row.beneficiary_account == "UPDATED-BEN-001"
        assert row.charge_code == "OUR"
        assert row.value_date == "same-day"

    def test_rejects_bad_row_without_aborting_batch(self, db_session):
        """One bad row shouldn't prevent good rows from loading."""
        # Use unique combos not in seed data so they're always inserts
        rows = [
            {  # good
                "beneficiary_bic": "GTBINGLAXXX",
                "currency": "JPY",  # unique: GTB doesn't have JPY in seed
                "intermediary_bic": "MIZUJPJTXXX",
                "charge_code": "SHA",
            },
            {  # bad — invalid BIC
                "beneficiary_bic": "GARBAGE",
                "currency": "USD",
                "intermediary_bic": "CITIUS33XXX",
            },
            {  # good
                "beneficiary_bic": "GTBINGLAXXX",
                "currency": "KRW",  # unique
                "intermediary_bic": "DEUTDEFFXXX",
                "charge_code": "BEN",
            },
        ]
        result = load_ssi_rows(db_session, rows)

        assert result.inserted == 2
        assert result.rejected == 1
        assert len(result.errors) == 1
        assert result.errors[0].row_number == 2  # 1-indexed

    def test_empty_input_returns_zero_result(self, db_session):
        result = load_ssi_rows(db_session, [])
        assert result.inserted == 0
        assert result.updated == 0
        assert result.rejected == 0
        assert result.total_rows == 0


# ===========================================================================
# Top-level import_ssi_file
# ===========================================================================


class TestImportSSIFile:
    def test_import_csv_file(self, db_session):
        result = import_ssi_file(db_session, SAMPLES_DIR / "ssi_sample.csv")
        assert result.rejected == 0
        # Some rows match existing seed (GTB/USD, EBIL/USD) → updates
        # Others are new → inserts
        assert result.inserted + result.updated == 5

    def test_import_json_file(self, db_session):
        result = import_ssi_file(db_session, SAMPLES_DIR / "ssi_sample.json")
        assert result.rejected == 0
        assert result.inserted + result.updated == 2

    def test_import_csv_string(self, db_session):
        csv_text = (
            "beneficiary_bic,currency,intermediary_bic,charge_code\n"
            "EBILAEADXXX,JPY,MIZUJPJTXXX,SHA\n"
        )
        result = import_ssi_file(db_session, csv_text)
        assert result.inserted == 1
        assert result.rejected == 0

    def test_result_summary_string(self, db_session):
        result = import_ssi_file(db_session, SAMPLES_DIR / "ssi_sample.json")
        s = result.summary()
        assert "inserted" in s
        assert "rejected" in s


# ===========================================================================
# CLI + HTTP endpoint integration
# ===========================================================================


class TestSSIImportCLI:
    def test_cli_import_ssi_csv(self, tmp_path, monkeypatch):
        """Run the CLI command against a temp CSV file."""
        import sys

        from app.cli import main

        csv_file = tmp_path / "test_ssi.csv"
        csv_file.write_text(
            "beneficiary_bic,currency,intermediary_bic,charge_code\n"
            "EBILAEADXXX,GBP,BARCGB22XXX,SHA\n"
        )
        monkeypatch.setattr(sys, "argv", ["cli", "import-ssi", str(csv_file)])
        rc = main()
        assert rc == 0


class TestSSIImportEndpoint:
    def test_upload_csv(self, client, tmp_path):
        csv_content = (
            b"beneficiary_bic,currency,intermediary_bic,charge_code\n"
            b"EBILAEADXXX,AUD,ANZBAU3MXXX,SHA\n"
        )
        r = client.post(
            "/api/import/ssi",
            files={"file": ("test.csv", csv_content, "text/csv")},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["rejected"] == 0
        assert body["inserted"] + body["updated"] == 1

    def test_upload_json(self, client):
        json_content = json.dumps([
            {
                "beneficiary_bic": "TESTBIC0XXX",
                "currency": "TTT",
                "intermediary_bic": "TESTINT0XXX",
                "charge_code": "BEN",
            }
        ]).encode()
        r = client.post(
            "/api/import/ssi",
            files={"file": ("test.json", json_content, "application/json")},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["rejected"] == 0
        # Insert or update — the shared client DB may already have this
        # record if a prior test in the same session inserted it.
        assert body["inserted"] + body["updated"] == 1

    def test_upload_with_bad_row_reports_errors(self, client):
        csv_content = (
            b"beneficiary_bic,currency,intermediary_bic,charge_code\n"
            b"EBILAEADXXX,AUD,ANZBAU3MXXX,SHA\n"
            b"GARBAGE,USD,CITIUS33XXX,SHA\n"
        )
        r = client.post(
            "/api/import/ssi",
            files={"file": ("test.csv", csv_content, "text/csv")},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["rejected"] == 1
        assert len(body["errors"]) == 1
        assert body["errors"][0]["row"] == 2

    def test_verify_imported_record_via_ssi_endpoint(self, client):
        """Import a record, then confirm /ssi returns it."""
        # Use a bank/currency combo not in seed data so the import is a clean insert
        csv_content = (
            b"beneficiary_bic,currency,intermediary_bic,intermediary_account,"
            b"beneficiary_account,charge_code\n"
            b"GTBINGLAXXX,CAD,NCBKSAJEXXX,REAL-INT-001,REAL-BEN-001,SHA\n"
        )
        client.post(
            "/api/import/ssi",
            files={"file": ("test.csv", csv_content, "text/csv")},
        )
        r = client.get("/api/ssi", params={"bic": "GTBINGLAXXX", "currency": "CAD"})
        assert r.status_code == 200
        body = r.json()
        assert len(body["instructions"]) == 1
        rec = body["instructions"][0]
        assert rec["intermediary_account"] == "REAL-INT-001"
        assert rec["beneficiary_account"] == "REAL-BEN-001"
