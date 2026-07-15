"""
Unit tests for the validator service — IBAN/BIC validation and type detection.

These test the underlying functions directly (depth), complementing the
HTTP-level tests in test_api.py (breadth).
"""
import pytest

from app.services.validator import (
    ValidationResult,
    detect_type,
    validate_bic,
    validate_iban,
)

# ===========================================================================
# detect_type — IBAN vs BIC routing
# ===========================================================================


class TestDetectType:
    def test_detects_iban(self):
        assert detect_type("GB29NWBK60161331926819") == "iban"

    def test_detects_iban_with_spaces(self):
        assert detect_type("GB29 NWBK 6016 1331 9268 19") == "iban"

    def test_detects_iban_lowercase(self):
        assert detect_type("gb29nwbk60161331926819") == "iban"

    def test_detects_iban_german(self):
        assert detect_type("DE89370400440532013000") == "iban"

    def test_detects_iban_french(self):
        assert detect_type("FR1420041010050500013M02606") == "iban"

    def test_detects_bic_from_8char(self):
        assert detect_type("CITIUS33") == "bic"

    def test_detects_bic_from_11char(self):
        assert detect_type("CITIUS33XXX") == "bic"

    def test_detects_bic_lowercase(self):
        assert detect_type("citius33") == "bic"

    @pytest.mark.parametrize(
        "value",
        [
            "CITIUS33XXX",
            "DEUTDEFFXXX",
            "BARCGB22XXX",
            "SBICZAJJXXX",
            "BOTKJPJTXXX",
        ],
    )
    def test_various_bics_detected_as_bic(self, value):
        assert detect_type(value) == "bic"

    def test_short_iban_pattern_treated_as_bic(self):
        # "AB12" matches the IBAN signature (2 letters + 2 digits) but is too
        # short to be a real IBAN (min 15 chars). Now correctly treated as BIC.
        assert detect_type("AB12") == "bic"

    def test_non_iban_signature_detected_as_bic(self):
        # 3 letters + digit doesn't match the 2-letter + 2-digit IBAN start.
        assert detect_type("ABC1") == "bic"

    def test_empty_string_defaults_to_bic(self):
        # No clear IBAN signature; falls through to bic.
        assert detect_type("") == "bic"


# ===========================================================================
# validate_iban
# ===========================================================================


class TestValidateIBAN:
    @pytest.mark.parametrize(
        "iban, expected_country",
        [
            ("GB29NWBK60161331926819", "GB"),
            ("DE89370400440532013000", "DE"),
            ("FR1420041010050500013M02606", "FR"),
            ("BE68539007547034", "BE"),
            ("IE29AIBK93115212345678", "IE"),
            ("NL91ABNA0417164300", "NL"),
        ],
    )
    def test_valid_ibans_by_country(self, iban, expected_country):
        result = validate_iban(iban)
        assert result.valid is True
        assert result.input_type == "iban"
        assert result.country_code == expected_country
        assert result.errors == []

    def test_valid_iban_returns_bic_when_registry_supports(self):
        # GB IBANs have BIC derivable from the sort code via schwifty.
        result = validate_iban("GB29NWBK60161331926819")
        assert result.valid is True
        assert result.bic == "NWBKGB2LXXX"

    def test_valid_iban_without_derivable_bic(self):
        # Some countries' national registries don't expose BIC mapping.
        # The IBAN is still valid; bic is just None.
        result = validate_iban("FR1420041010050500013M02606")
        assert result.valid is True
        # FR BIC derivation depends on the schwifty registry version —
        # accept either a valid BIC or None, but never an error.
        assert result.bic is None or len(result.bic) >= 8

    def test_accepts_spaces(self):
        result = validate_iban("GB29 NWBK 6016 1331 9268 19")
        assert result.valid is True

    def test_accepts_lowercase(self):
        result = validate_iban("gb29nwbk60161331926819")
        assert result.valid is True

    def test_rejects_bad_checksum(self):
        # Last digits transposed -> MOD-97 check fails.
        result = validate_iban("GB29NWBK60161331926818")
        assert result.valid is False
        assert len(result.errors) > 0
        assert "IBAN" in result.errors[0]

    def test_rejects_wrong_length(self):
        # Truncated IBAN.
        result = validate_iban("GB29NWBK6016133192")
        assert result.valid is False
        assert len(result.errors) > 0

    def test_rejects_invalid_country_code(self):
        # 'ZZ' is not an assigned IBAN country.
        result = validate_iban("ZZ29NWBK60161331926819")
        assert result.valid is False

    def test_rejects_empty(self):
        result = validate_iban("")
        assert result.valid is False
        assert len(result.errors) > 0

    def test_rejects_garbage(self):
        result = validate_iban("not-an-iban-at-all!!!")
        assert result.valid is False

    def test_errors_list_initialized_to_empty_on_success(self):
        # Validates the __post_init__ default behavior.
        result = validate_iban("GB29NWBK60161331926819")
        assert result.errors == []

    def test_result_carries_input_value(self):
        result = validate_iban("GB29NWBK60161331926819")
        assert result.input_value == "GB29NWBK60161331926819"
        assert result.input_type == "iban"


# ===========================================================================
# validate_bic
# ===========================================================================


class TestValidateBIC:
    def test_valid_8char_bic(self):
        valid, normalized, country, errors = validate_bic("CITIUS33")
        assert valid is True
        assert errors == []
        assert country == "US"
        # 8-char BIC is padded to 11 with XXX.
        assert normalized == "CITIUS33XXX"

    def test_valid_11char_bic(self):
        valid, normalized, country, errors = validate_bic("CITIUS33XXX")
        assert valid is True
        assert errors == []
        assert country == "US"
        assert normalized == "CITIUS33XXX"

    def test_valid_bic_lowercase(self):
        valid, normalized, country, errors = validate_bic("citius33")
        assert valid is True
        assert country == "US"

    def test_valid_bic_with_spaces(self):
        valid, normalized, country, errors = validate_bic("CITI US33")
        assert valid is True
        assert country == "US"

    @pytest.mark.parametrize(
        "bic, expected_country",
        [
            ("DEUTDEFFXXX", "DE"),
            ("BARCGB22XXX", "GB"),
            ("SBICZAJJXXX", "ZA"),
            ("BOTKJPJTXXX", "JP"),
            ("BKCHCNBJXXX", "CN"),
            ("EBILAEADXXX", "AE"),
            ("NCBKSAJEXXX", "SA"),
            ("NBQAQAQAXXX", "QA"),
            ("POALILITXXX", "IL"),
        ],
    )
    def test_country_extraction(self, bic, expected_country):
        valid, _, country, _ = validate_bic(bic)
        assert valid is True
        assert country == expected_country

    def test_bic_padding_to_11_chars(self):
        valid, normalized, _, _ = validate_bic("DEUTDEFF")
        assert valid is True
        assert len(normalized) == 11
        assert normalized == "DEUTDEFFXXX"

    def test_bic_already_11_chars_not_padded(self):
        valid, normalized, _, _ = validate_bic("DEUTDEFF500")
        assert valid is True
        assert len(normalized) == 11
        assert normalized == "DEUTDEFF500"

    def test_rejects_too_short(self):
        valid, _, _, errors = validate_bic("CITI")
        assert valid is False
        assert len(errors) > 0

    def test_rejects_empty(self):
        valid, _, _, errors = validate_bic("")
        assert valid is False
        assert len(errors) > 0

    def test_rejects_invalid_country_code(self):
        # 'XX' is not an assigned ISO country.
        valid, _, _, errors = validate_bic("CITIXX33")
        assert valid is False

    def test_rejects_garbage(self):
        valid, _, _, errors = validate_bic("not-a-bic-!!!")
        assert valid is False


# ===========================================================================
# ValidationResult dataclass
# ===========================================================================


class TestValidationResult:
    def test_errors_defaults_to_empty_list(self):
        r = ValidationResult(
            input_value="x", input_type="iban", valid=True
        )
        assert r.errors == []

    def test_errors_can_be_supplied(self):
        r = ValidationResult(
            input_value="x", input_type="iban", valid=False, errors=["bad"]
        )
        assert r.errors == ["bad"]

    def test_none_errors_becomes_empty_list(self):
        # __post_init__ should normalize None to [].
        r = ValidationResult(
            input_value="x", input_type="iban", valid=True, errors=None
        )
        assert r.errors == []
