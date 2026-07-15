"""
Tests for the MT103 STP checker — /api/message/stp-check endpoint + service.
"""

from app.data.mt103_samples import SAMPLE_MT103, SAMPLE_MT103_BAD_BIC, SAMPLE_MT103_MISSING_BEN
from app.services.stp_checker import check_stp


class TestSTPService:
    def test_clean_message(self):
        r = check_stp(SAMPLE_MT103)
        assert r.verdict == "CLEAN"
        assert r.stp_passes is True
        assert len(r.findings) == 0

    def test_bad_bic_detected(self):
        r = check_stp(SAMPLE_MT103_BAD_BIC)
        assert r.verdict == "REJECTED"
        assert r.stp_passes is False
        assert any(f.code == "STP-BIC-INVALID" for f in r.findings)

    def test_missing_beneficiary_name(self):
        r = check_stp(SAMPLE_MT103_MISSING_BEN)
        assert r.verdict == "REJECTED"
        assert any("beneficiary" in f.code.lower() or "59" in f.field for f in r.findings)

    def test_missing_mandatory_field(self):
        msg = dict(SAMPLE_MT103)
        msg["transaction_reference"] = ""
        r = check_stp(msg)
        assert r.stp_passes is False
        assert any(f.field == "20" for f in r.findings)

    def test_invalid_charge_code(self):
        msg = dict(SAMPLE_MT103)
        msg["charge_code"] = "SHARE"
        r = check_stp(msg)
        assert any("71A" in f.field or "charge" in f.code.lower() for f in r.findings)

    def test_zero_amount_rejected(self):
        msg = dict(SAMPLE_MT103)
        msg["interbank_amount"] = 0
        r = check_stp(msg)
        assert r.stp_passes is False

    def test_negative_amount_rejected(self):
        msg = dict(SAMPLE_MT103)
        msg["interbank_amount"] = -100
        r = check_stp(msg)
        assert r.stp_passes is False

    def test_field_summary_populated(self):
        r = check_stp(SAMPLE_MT103)
        assert len(r.field_summary) > 0
        assert all(hasattr(fs, "field") and hasattr(fs, "field_name") for fs in r.field_summary)

    def test_uetr_auto_generated_when_missing(self):
        msg = dict(SAMPLE_MT103)
        msg["uetr"] = None
        r = check_stp(msg)
        info_findings = [f for f in r.findings if f.severity == "info"]
        assert any("121" in f.field or "uetr" in f.code.lower() for f in info_findings)

    def test_field_summary_has_all_fields(self):
        r = check_stp(SAMPLE_MT103)
        fields = [fs.field for fs in r.field_summary]
        for expected in ["20", "32A", "50K", "59", "71A"]:
            assert expected in fields


class TestSTPEndpoint:
    def test_clean_message(self, client):
        from app.data.mt103_samples import SAMPLE_MT103
        r = client.post("/api/message/stp-check", json=SAMPLE_MT103)
        assert r.status_code == 200
        body = r.json()
        assert body["verdict"] == "CLEAN"
        assert body["stp_passes"] is True
        assert body["findings"] == []
        assert "disclaimer" in body

    def test_bad_bic(self, client):
        from app.data.mt103_samples import SAMPLE_MT103_BAD_BIC
        r = client.post("/api/message/stp-check", json=SAMPLE_MT103_BAD_BIC)
        assert r.status_code == 200
        body = r.json()
        assert body["verdict"] == "REJECTED"
        assert body["stp_passes"] is False
        assert len(body["findings"]) > 0

    def test_missing_beneficiary(self, client):
        from app.data.mt103_samples import SAMPLE_MT103_MISSING_BEN
        r = client.post("/api/message/stp-check", json=SAMPLE_MT103_MISSING_BEN)
        assert r.status_code == 200
        assert r.json()["verdict"] == "REJECTED"

    def test_invalid_currency_rejected(self, client):
        from app.data.mt103_samples import SAMPLE_MT103
        msg = dict(SAMPLE_MT103)
        msg["currency"] = "DOLLARS"
        r = client.post("/api/message/stp-check", json=msg)
        assert r.status_code == 422

    def test_missing_mandatory_field(self, client):
        r = client.post("/api/message/stp-check", json={
            "transaction_reference": "TEST",
            "value_date": "2026-07-15",
            "currency": "USD",
            "interbank_amount": 1000,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["stp_passes"] is False

    def test_invalid_charge_code_rejected(self, client):
        from app.data.mt103_samples import SAMPLE_MT103
        msg = dict(SAMPLE_MT103)
        msg["charge_code"] = "SPLIT"
        r = client.post("/api/message/stp-check", json=msg)
        assert r.status_code == 422

    def test_field_summary_present(self, client):
        from app.data.mt103_samples import SAMPLE_MT103
        r = client.post("/api/message/stp-check", json=SAMPLE_MT103)
        body = r.json()
        assert "field_summary" in body
        assert len(body["field_summary"]) > 0

    def test_disclaimer_present(self, client):
        from app.data.mt103_samples import SAMPLE_MT103
        r = client.post("/api/message/stp-check", json=SAMPLE_MT103)
        assert "disclaimer" in r.json()
