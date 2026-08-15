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
