"""An 8-char BIC must be accepted and padded to 11 with 'XXX' (item #9)."""
from app.services.stp_checker import check_stp
from app.services.validator import validate_bic


def test_eight_char_bic_valid_and_padded():
    valid, normalized, country, errors = validate_bic("CHASUS33")
    assert valid is True
    assert normalized == "CHASUS33XXX"
    assert country == "US"
    assert errors == []


def test_eleven_char_head_office_bic_valid():
    valid, normalized, _c, errors = validate_bic("CHASUS33XXX")
    assert valid is True
    assert normalized == "CHASUS33XXX"
    assert errors == []


def test_stp_does_not_false_fail_eight_char_bic():
    result = check_stp({
        "transaction_reference": "REF1", "bank_op_code": "CRED",
        "value_date": "2026-07-20", "currency": "USD", "interbank_amount": 1000.0,
        "charge_code": "SHA",
        "ordering": {"name": "Acme", "bic": "CHASUS33"},        # 8-char
        "beneficiary": {"name": "Beta", "account": "ACCT-1", "bic": "BARCGB22"},  # 8-char
        "uetr": "97ed4827-7b6f-4491-a06f-b548d5a7512d",
    })
    assert not any(f.code == "STP-BIC-INVALID" for f in result.findings)
