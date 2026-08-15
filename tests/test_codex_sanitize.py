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


def test_preserves_normal_source_and_is_idempotent() -> None:
    source = "def calculate_total(amount: int) -> int:\n    return amount + 1\n"

    sanitized = sanitize(source)

    assert sanitized == source
    assert sanitize(sanitized) == sanitized
