"""
Sample MT103 message payloads for the STP checker.

These are plain dicts shaped exactly like an STPCheckRequest body, so the
checker can be exercised directly (no HTTP layer) in tests and from the CLI.

Every value is fictional. Account numbers are well-known public IBAN test
fixtures; party names are invented; the UETR is a hand-stable UUID. None of
this represents a real payment.

Three variants are provided:
  - SAMPLE_MT103         — a known-clean message that should pass STP
  - SAMPLE_MT103_BAD_BIC — beneficiary BIC is structurally invalid
  - SAMPLE_MT103_MISSING_BEN — beneficiary name is absent (fails rule 6)
"""

# A clean, well-formed MT103 that should yield verdict CLEAN.
SAMPLE_MT103 = {
    "transaction_reference": "MSG-2026-001",  # field 20
    "bank_op_code": "CRED",  # field 23B
    "value_date": "2027-12-31",  # field 32A date (ISO, normalized) — future date to avoid "stale" warning
    "currency": "USD",  # field 32A ccy
    "interbank_amount": 5000.00,  # field 32A amount
    "charge_code": "SHA",  # field 71A
    "ordering": {  # field 50K
        "account": "GB29NWBK60161331926819",
        "name": "Alice Johnson",
        "bic": "NWBKGB2LXXX",
    },
    "beneficiary": {  # field 59
        "account": "DE89370400440532013000",
        "name": "Bob Williams GmbH",
        "bic": "COBADEFFXXX",
    },
    "uetr": "8e6c1b2a-3d4e-5f6a-7b8c-9d0e1f2a3b4c",  # field 121
}

# Broken variant 1: structurally invalid beneficiary BIC ("BADBIC").
SAMPLE_MT103_BAD_BIC = {
    **SAMPLE_MT103,
    "transaction_reference": "MSG-2026-002",
    "beneficiary": {
        "account": "DE89370400440532013000",
        "name": "Bob Williams GmbH",
        "bic": "BADBIC",
    },
}

# Broken variant 2: beneficiary name missing (fails rule 6: beneficiary
# name + account both required).
SAMPLE_MT103_MISSING_BEN = {
    **SAMPLE_MT103,
    "transaction_reference": "MSG-2026-003",
    "beneficiary": {
        "account": "DE89370400440532013000",
        "name": None,
        "bic": "COBADEFFXXX",
    },
}
