"""Canonical settlement-term values shared by SSI writers and routing."""

from __future__ import annotations

from typing import Optional

VALID_CHARGE_CODES = frozenset({"OUR", "SHA", "BEN"})
VALID_VALUE_DATES = frozenset({"same-day", "spot", "T+1", "T+2", "T+3"})


def normalize_charge_code(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized or None


def normalize_value_date(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    lowered = stripped.lower()
    return "T+" + lowered[2:] if lowered.startswith("t+") else lowered
