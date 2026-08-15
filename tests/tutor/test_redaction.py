"""Redaction tests: identifiers become typed placeholders, prose survives."""
import pytest

from app.tutor.redaction import redact_sensitive_text


def test_iban_is_replaced_with_the_iban_placeholder():
    assert (
        redact_sensitive_text("Send it to DE89370400440532013000 today.")
        == "Send it to [IBAN] today."
    )


def test_space_grouped_iban_is_redacted_whole():
    """The space-grouped form is how an IBAN appears on every invoice and bank
    statement, so it is the form a learner is most likely to paste.

    Before this was handled, the contiguous-only pattern missed it and the
    *phone* matcher then claimed the middle of the number: the string came out
    as `DE[PHONE]130 00` — a partial leak wearing the wrong label, which is
    worse than no match at all, because the model is told a bank identifier is
    a phone number.
    """
    assert (
        redact_sensitive_text("Send it to DE89 3704 0044 0532 0130 00 today.")
        == "Send it to [IBAN] today."
    )


def test_space_grouped_iban_does_not_leave_fragments_or_mislabel():
    """Guards the specific failure above, independent of the exact placeholder."""
    out = redact_sensitive_text("Beneficiary IBAN GB33 BUKB 2020 1555 5555 55 confirmed.")
    assert "[IBAN]" in out
    assert "[PHONE]" not in out
    for fragment in ("BUKB", "2020", "1555", "5555"):
        assert fragment not in out


def test_eight_character_bic_is_replaced_with_the_bic_placeholder():
    assert (
        redact_sensitive_text("The BIC DEUTDEFF routes to Frankfurt.")
        == "The BIC [BIC] routes to Frankfurt."
    )


def test_eleven_character_bic_is_redacted_whole_including_its_branch_code():
    assert (
        redact_sensitive_text("Use SWIFT code BNPAFRPPABC for the branch.")
        == "Use SWIFT code [BIC] for the branch."
    )


def test_bic_carrying_a_digit_is_redacted_without_any_cue_word():
    assert redact_sensitive_text("Route via CITIUS33 first.") == "Route via [BIC] first."


def test_eleven_character_bic_ending_in_the_head_office_branch_code_needs_no_cue():
    assert redact_sensitive_text("Beneficiary at SBININBBXXX.") == "Beneficiary at [BIC]."


def test_capitalised_prose_after_a_cue_survives_when_it_is_not_a_real_country():
    """"SWIFT TRANSFER" is a cue followed by an 8-char token, but "SF" is no country."""
    text = "Explain the SWIFT TRANSFER cut-off."
    assert redact_sensitive_text(text) == text


def test_uuid_shaped_uetr_is_replaced_with_the_uetr_placeholder():
    assert (
        redact_sensitive_text("Track 97ed4827-7b6f-4491-a06f-b548d5a7512d please.")
        == "Track [UETR] please."
    )


def test_email_address_is_replaced_with_the_email_placeholder():
    assert (
        redact_sensitive_text("Contact ops.team+alerts@relay-bank.co.uk about it.")
        == "Contact [EMAIL] about it."
    )


def test_api_key_shaped_secret_is_replaced_with_the_secret_placeholder():
    assert (
        redact_sensitive_text("My key is sk-live-9Fj2kQ8sLpZ0xWvN4tRbY7cH.")
        == "My key is [SECRET]."
    )


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Set ADMIN_API_KEY=s3cretValue99 in the env.", "Set [SECRET] in the env."),
        ("Header X-Admin-Key: 9Fj2kQ8sLpZ0xWvN", "Header [SECRET]"),
        ("Use AKIAIOSFODNN7EXAMPLE for uploads.", "Use [SECRET] for uploads."),
        (
            "Send Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 as the header.",
            "Send [SECRET] as the header.",
        ),
        ("Token ghp_16C7e42F292c6912E7710c838347Ae178B4a", "Token [SECRET]"),
    ],
)
def test_other_credential_shapes_are_replaced_with_the_secret_placeholder(text, expected):
    assert redact_sensitive_text(text) == expected


def test_phone_number_is_replaced_with_the_phone_placeholder():
    assert (
        redact_sensitive_text("Call +44 20 7946 0958 to confirm.")
        == "Call [PHONE] to confirm."
    )


def test_long_account_number_is_replaced_with_the_account_placeholder():
    assert (
        redact_sensitive_text("Credit account 4830267159 at the branch.")
        == "Credit account [ACCOUNT] at the branch."
    )


# Over-redaction is a failure too: a tutor that cannot say "IBAN", quote a
# year, or read back an amount is useless. Every string here must survive
# byte-for-byte.
@pytest.mark.parametrize(
    "text",
    [
        "How does a correspondent bank settle a euro payment?",
        "What is an IBAN and how is its check digit calculated?",
        "A BIC identifies the institution; an IBAN identifies the account.",
        "SEPA Instant launched in 2017 and was recast in 2026.",
        "The payment was 1,000,000 USD before charges.",
        "Cut-off is 16:30 CET on 2026-08-15.",
        "Fee was 25.00 USD and the FX rate was 1.0845.",
        "REQUIRED fields are CREDITED to the BENEFICIARY.",
        "Turnkey: describes a fully managed correspondent setup.",
        "Module 7 covers nostro and vostro accounts.",
    ],
)
def test_ordinary_prose_numbers_and_terminology_are_left_untouched(text):
    assert redact_sensitive_text(text) == text


def test_every_identifier_in_a_crowded_string_is_redacted():
    text = (
        "Wire from DE89370400440532013000 via BIC DEUTDEFF to account 4830267159, "
        "ref 97ed4827-7b6f-4491-a06f-b548d5a7512d, contact ops@relay.example "
        "or +44 20 7946 0958, key sk-live-9Fj2kQ8sLpZ0xWvN4tRbY7cH."
    )
    assert redact_sensitive_text(text) == (
        "Wire from [IBAN] via BIC [BIC] to account [ACCOUNT], "
        "ref [UETR], contact [EMAIL] "
        "or [PHONE], key [SECRET]."
    )


@pytest.mark.parametrize("text", ["", "   ", "Nothing sensitive here at all."])
def test_empty_and_unmatched_input_is_returned_unchanged(text):
    assert redact_sensitive_text(text) == text


def test_lower_case_iban_is_redacted():
    """Case-sensitivity meant a lower-case IBAN reached the provider byte-for-byte.

    Lower case is how a person actually types an identifier into a chat box, so
    this was the likely path, not the exotic one.
    """
    assert (
        redact_sensitive_text("Send to de89370400440532013000 today.")
        == "Send to [IBAN] today."
    )


def test_mixed_case_and_lower_case_grouped_iban_are_redacted():
    assert "[IBAN]" in redact_sensitive_text("Send to De89 3704 0044 0532 0130 00 today.")
    assert "[IBAN]" in redact_sensitive_text("iban gb33 bukb 2020 1555 5555 55 confirmed")


def test_lower_case_bic_is_redacted_when_cued():
    """The BIC pattern was uppercase-only while its cue pattern was not, so a
    cued lower-case BIC passed through byte-for-byte."""
    assert redact_sensitive_text("BIC deutdeff routes to Frankfurt.") == (
        "BIC [BIC] routes to Frankfurt."
    )
    assert redact_sensitive_text("SWIFT code deutdeff here.") == "SWIFT code [BIC] here."


def test_lower_case_bic_with_digit_or_branch_code_is_redacted_without_a_cue():
    assert redact_sensitive_text("bic sbininbbxxx") == "bic [BIC]"
    assert redact_sensitive_text("Route via citius33 first.") == "Route via [BIC] first."


def test_lower_case_prose_is_still_not_mistaken_for_a_bic():
    """Case-insensitivity must not turn ordinary lower-case words into BICs."""
    for text in (
        "the beneficiary must be credited before settlement",
        "required fields are credited to the beneficiary",
    ):
        assert redact_sensitive_text(text) == text
