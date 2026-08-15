from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SANITIZER = Path(__file__).parents[1] / "scripts" / "codex_sanitize.py"


def sanitize(text: str) -> str:
    result = subprocess.run(
        [sys.executable, str(SANITIZER)],
        input=text,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout


def test_redacts_secrets_payment_identifiers_and_personal_contact_data() -> None:
    source = """
    Authorization: Bearer super-secret-token-value
    OPENAI_API_KEY=sk-proj-1234567890abcdefghijklmnop
    -----BEGIN PRIVATE KEY-----
    private-key-material
    -----END PRIVATE KEY-----
    IBAN GB29NWBK60161331926819
    Contact Ada Lovelace at ada@example.com or +234 801 234 5678.
    """

    sanitized = sanitize(source)

    assert "super-secret-token-value" not in sanitized
    assert "sk-proj-1234567890abcdefghijklmnop" not in sanitized
    assert "private-key-material" not in sanitized
    assert "GB29NWBK60161331926819" not in sanitized
    assert "ada@example.com" not in sanitized
    assert "+234 801 234 5678" not in sanitized
    assert "[REDACTED]" in sanitized


def test_redacts_non_bearer_authorization_schemes() -> None:
    basic = sanitize("Authorization: Basic dXNlcjpwYXNz\n")
    token = sanitize("Authorization: Token abcdef123456\n")
    digest = sanitize('Authorization: Digest username="ada", response="deadbeef"\n')
    schemeless = sanitize("authorization: raw-credential-value\n")

    assert "dXNlcjpwYXNz" not in basic
    assert "Basic" in basic
    assert "abcdef123456" not in token
    assert "deadbeef" not in digest
    assert "raw-credential-value" not in schemeless


def test_redacts_the_complete_inline_authorization_value() -> None:
    custom = sanitize('x=Authorization: CustomScheme super-secret-value; y=1\n')
    digest = sanitize(
        'curl -H "Authorization: Digest username=ada, response=deadbeef" https://x\n'
    )

    assert "super-secret-value" not in custom
    assert "deadbeef" not in digest


def test_redacts_all_fields_from_a_diff_prefixed_digest_header() -> None:
    sanitized = sanitize(
        '+Authorization: Digest username="ada", response="deadbeef"\n'
    )

    assert 'response="deadbeef"' not in sanitized
    assert "[REDACTED]" in sanitized


def test_redacts_all_fields_from_a_proxy_authorization_digest_header() -> None:
    sanitized = sanitize(
        'Proxy-Authorization: Digest username="ada", response="deadbeef"\n'
    )

    assert 'response="deadbeef"' not in sanitized
    assert "[REDACTED]" in sanitized


def test_redacts_prefixed_authorization_headers() -> None:
    proxy = sanitize('Proxy-Authorization: Digest username="ada", response="deadbeef"\n')
    vendor = sanitize('X-Authorization: Digest username="ada", response="deadbeef"\n')
    nested = sanitize('+X-Amz-Authorization: Digest username="a", response="deadbeef"\n')

    assert "deadbeef" not in proxy
    assert "deadbeef" not in vendor
    assert "deadbeef" not in nested


def test_redacts_the_authentication_header_variant() -> None:
    sanitized = sanitize("Authentication: Bearer tok-abcdefghijkl\n")

    assert "tok-abcdefghijkl" not in sanitized
    assert "Bearer" in sanitized


def test_does_not_redact_a_www_authenticate_challenge() -> None:
    source = 'WWW-Authenticate: Digest realm="relay", qop="auth"\n'

    assert sanitize(source) == source


def test_redacts_cookie_headers() -> None:
    request = sanitize("Cookie: session=very-secret-session-token\n")
    response = sanitize("Set-Cookie: sid=abc123; HttpOnly; Secure\n")

    assert "very-secret-session-token" not in request
    assert "abc123" not in response
    assert "[REDACTED_COOKIE]" in request


def test_redacts_quoted_cookie_values_without_leaving_the_value_behind() -> None:
    sanitized = sanitize('Cookie: sid="abc123secretvalue"; Path=/\n')

    assert "abc123secretvalue" not in sanitized
    assert sanitized == "Cookie: [REDACTED_COOKIE]\n"


def test_sanitizes_sensitive_values_in_hunk_header_context() -> None:
    sanitized = sanitize(
        '@@ -12,6 +12,9 @@ def connect(password="hunter2", '
        'iban="GB29NWBK60161331926819"):\n'
    )

    assert 'password="hunter2"' not in sanitized
    assert "GB29NWBK60161331926819" not in sanitized
    assert sanitized.startswith("@@ -12,6 +12,9 @@ ")


def test_redacts_an_inline_cookie_whose_value_is_quoted() -> None:
    sanitized = sanitize('curl -H "Cookie: sid=\\"abc123secretvalue\\"" https://x\n')

    assert "abc123secretvalue" not in sanitized
    assert "[REDACTED_COOKIE]" in sanitized


def test_redacts_all_inline_cookie_pairs() -> None:
    sanitized = sanitize(
        'curl -H "Cookie: sid=abc123; refresh=super-secret-refresh" https://x\n'
    )

    assert "abc123" not in sanitized
    assert "super-secret-refresh" not in sanitized


def test_redacts_quoted_secret_assignments_containing_spaces() -> None:
    passphrase = sanitize('PASSWORD="correct horse battery staple"\n')
    single = sanitize("ADMIN_API_KEY = 'two words here'\n")

    assert "correct horse battery staple" not in passphrase
    assert "two words here" not in single


def test_credential_redaction_is_idempotent() -> None:
    source = (
        "Authorization: Basic dXNlcjpwYXNz\n"
        "Cookie: session=very-secret-session-token\n"
        'PASSWORD="correct horse battery staple"\n'
    )

    once = sanitize(source)

    assert sanitize(once) == once


def test_redacts_grouped_ibans_that_a_person_actually_pastes() -> None:
    sanitized = sanitize("Debit GB29 NWBK 6016 1331 9268 19 today.\n")

    assert "NWBK" not in sanitized
    assert "6016" not in sanitized
    assert "9268" not in sanitized


def test_preserves_bic_swift_codes_so_seed_data_stays_reviewable() -> None:
    source = '    ("CITIUS33", "Citibank", "US", "New York", "USD"),\n'

    assert sanitize(source) == source
    assert "BNPAFRPPXXX" in sanitize("Route via BIC BNPAFRPPXXX.\n")


def test_preserves_git_metadata_lines() -> None:
    source = (
        "diff --git a/app/services/seed.py b/app/services/seed.py\n"
        "index 72e1982..0123456789012 100644\n"
        "@@ -1234567890123,7 +1234567890123,9 @@ def seed_banks(session):\n"
    )

    assert sanitize(source) == source


def test_preserves_iso_8601_dates_and_timestamps() -> None:
    source = (
        "Create Date: 2026-08-13 12:53:15.865474\n"
        '"createdAt": "2026-08-15T09:30:00Z"\n'
    )

    assert sanitize(source) == source


def test_preserves_standard_references_such_as_iso_20022() -> None:
    source = '"roadmap": ["2023 rulebook migration to ISO 20022 2019 version complete"]\n'

    assert sanitize(source) == source
    assert sanitize("Built on ISO 8583 and ISO 20022:2013.\n") == (
        "Built on ISO 8583 and ISO 20022:2013.\n"
    )


def test_preserves_svg_coordinate_lists() -> None:
    source = '      <polyline points="20 6 9 17 4 12" />\n'

    assert sanitize(source) == source
    assert sanitize('<svg viewBox="0 0 24 24 16 16">\n') == '<svg viewBox="0 0 24 24 16 16">\n'


def test_a_coordinate_attribute_cannot_smuggle_an_identifier_through() -> None:
    """The exemption is shape-gated, not attribute-gated.

    A coordinate list is many short groups. A long unbroken digit run in the
    same attribute is an account number wearing a costume, and still redacts.
    """
    sanitized = sanitize('<polyline points="100200300400 6 9 17" />\n')

    assert "100200300400" not in sanitized


def test_a_coordinate_attribute_cannot_smuggle_grouped_payment_identifiers() -> None:
    card = sanitize('<polyline points="4111 1111 1111 1111" />\n')
    account = sanitize('<polyline points="1234 5678" />\n')

    assert "4111 1111 1111 1111" not in card
    assert "1234 5678" not in account


def test_standard_reference_exemption_is_idempotent() -> None:
    source = (
        'ISO 20022 2019 migration, <polyline points="20 6 9 17 4 12" />, '
        "call +234 801 234 5678\n"
    )

    once = sanitize(source)

    assert "+234 801 234 5678" not in once
    assert sanitize(once) == once


def test_redacts_uetrs() -> None:
    sanitized = sanitize("UETR 97ed4827-7b6f-4491-a06f-b548d5a7512d failed.\n")

    assert "97ed4827-7b6f-4491-a06f-b548d5a7512d" not in sanitized
    assert "[UETR]" in sanitized


def test_redacts_account_numbers() -> None:
    sanitized = sanitize("Credit account 100200300400 for the beneficiary.\n")

    assert "100200300400" not in sanitized
    assert "[ACCOUNT]" in sanitized


def test_redacts_card_like_numbers_including_grouped_forms() -> None:
    contiguous = sanitize("Card 4111111111111111 on file.\n")
    grouped = sanitize("Card 4111 1111 1111 1111 on file.\n")
    hyphenated = sanitize("Card 4111-1111-1111-1111 on file.\n")

    assert "4111111111111111" not in contiguous
    assert "1111" not in grouped
    assert "1111" not in hyphenated


def test_a_long_hyphenated_line_does_not_blow_up_the_sanitizer() -> None:
    """A minified bundle or lockfile entry is one very long hyphenated line.

    With unbounded segment repetition in the credential-assignment rules this
    took 4.7s for a single line, which a hostile PR could stack to burn the
    workflow's 15-minute timeout. Bounded, it is ~0.5s. The 3s ceiling sits
    above the bounded cost with room for a loaded runner and well below the
    unbounded one.
    """
    import time

    line = "-".join(f"seg{index}" for index in range(4000)) + "\n"

    started = time.perf_counter()
    sanitize(line)
    elapsed = time.perf_counter() - started

    assert elapsed < 3.0, f"sanitizing one long hyphenated line took {elapsed:.1f}s"


def test_preserves_normal_source_and_is_idempotent() -> None:
    source = "def calculate_total(amount: int) -> int:\n    return amount + 1\n"

    sanitized = sanitize(source)

    assert sanitized == source
    assert sanitize(sanitized) == sanitized


def test_payment_redaction_output_is_idempotent() -> None:
    source = (
        "IBAN GB29 NWBK 6016 1331 9268 19, BIC CITIUS33, "
        "UETR 97ed4827-7b6f-4491-a06f-b548d5a7512d, card 4111 1111 1111 1111, "
        "account 100200300400, ada@example.com, +234 801 234 5678\n"
    )

    once = sanitize(source)

    assert sanitize(once) == once


def test_preserves_ordinary_review_prose_and_diff_line_markers() -> None:
    source = "@@ -1,5 +1,5 @@\n-    return 2026\n+    return 2027\n"

    assert sanitize(source) == source
