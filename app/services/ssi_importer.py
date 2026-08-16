"""
SSI importer — loads Standard Settlement Instructions from CSV or JSON files.

Real SSI data is bank-published (treasury/correspondent-banking pages, secured
portal downloads, or SWIFT MT999/MT199 messages). Banks publish in varied
formats; this importer supports the two most tractable:

  - CSV  (what banks export from their treasury systems)
  - JSON (for API/programmatic ingestion)

DESIGN:
  - Validates every row: BIC checksums, charge codes, currency codes.
  - Upsert semantics: a record is keyed by (beneficiary_bic, currency,
    intermediary_bic). Re-importing updates account numbers rather than
    creating duplicates — which is exactly what you want when a bank
    publishes revised SSIs.
  - Bad rows are collected, not silently dropped. The result tells you
    exactly what failed and why.

NOT SUPPORTED:
  - PDF parsing. Bank SSI PDFs are visually formatted (multi-column tables,
    logos, headers/footers) and too fragile to parse reliably. Export to
    CSV first, then import.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


import csv
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, List, Optional, Union

from schwifty import BIC
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import SSI

VALID_SSI_STATUSES = {"published", "archived", "illustrative"}
VALID_CHARGE_CODES = {"OUR", "SHA", "BEN"}
VALID_VALUE_DATES = {"same-day", "spot", "T+1", "T+2", "T+3"}


@dataclass
class SSIRowError:
    row_number: int
    raw: dict
    errors: list[str]


@dataclass
class SSIImportResult:
    inserted: int = 0
    updated: int = 0
    rejected: int = 0
    errors: List[SSIRowError] = field(default_factory=list)
    total_rows: int = 0

    def summary(self) -> str:
        return (
            f"SSI import: {self.inserted} inserted, {self.updated} updated, "
            f"{self.rejected} rejected ({self.total_rows} total rows)."
        )


# ---------------------------------------------------------------------------
# Row validation
# ---------------------------------------------------------------------------


def _normalize_bic(value: str) -> Optional[str]:
    """Validate + normalize a BIC to 11 chars. Returns None if invalid."""
    if not value:
        return None
    v = value.strip().upper().replace(" ", "")
    try:
        bic = BIC(v)
        if not bic.is_valid:
            return None
        s = str(bic)
        return s.ljust(11, "X") if len(s) == 8 else s
    except Exception:
        return None


def validate_ssi_row(raw: dict) -> tuple[Optional[dict], list[str]]:
    """
    Validate a single SSI row (already parsed from CSV/JSON).

    Returns (normalized_row, errors). If errors is non-empty, normalized_row
    is None.
    """
    errors: list[str] = []
    normalized: dict = {}

    # Required fields
    ben_bic = _normalize_bic(raw.get("beneficiary_bic", ""))
    if not ben_bic:
        errors.append(f"Invalid/missing beneficiary_bic: {raw.get('beneficiary_bic')!r}")
    else:
        normalized["beneficiary_bic"] = ben_bic

    int_bic = _normalize_bic(raw.get("intermediary_bic", ""))
    if not int_bic:
        errors.append(f"Invalid/missing intermediary_bic: {raw.get('intermediary_bic')!r}")
    else:
        normalized["intermediary_bic"] = int_bic

    currency = (raw.get("currency") or "").strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        errors.append(f"Invalid currency: {currency!r}")
    else:
        normalized["currency"] = currency

    # Optional fields
    normalized["beneficiary_bank_name"] = (raw.get("beneficiary_bank_name") or "").strip() or None
    normalized["intermediary_bank_name"] = (raw.get("intermediary_bank_name") or "").strip() or None
    normalized["intermediary_account"] = (raw.get("intermediary_account") or "").strip() or None
    normalized["beneficiary_account"] = (raw.get("beneficiary_account") or "").strip() or None
    normalized["notes"] = (raw.get("notes") or "").strip() or None
    normalized["as_of"] = (raw.get("as_of") or "").strip() or None

    # An import states its own provenance or is treated as unsourced. Defaulting
    # to "published" would let a CSV upload claim a bank published something it
    # never did, which is exactly what this column exists to prevent.
    status = (raw.get("status") or "illustrative").strip().lower()
    if status not in VALID_SSI_STATUSES:
        errors.append(
            f"Invalid status: {status!r} (must be one of {sorted(VALID_SSI_STATUSES)})"
        )
    else:
        normalized["status"] = status

    charge = (raw.get("charge_code") or "SHA").strip().upper()
    if charge not in VALID_CHARGE_CODES:
        errors.append(f"Invalid charge_code: {charge!r} (must be OUR/SHA/BEN)")
    else:
        normalized["charge_code"] = charge

    vdate = (raw.get("value_date") or "spot").strip()
    # Normalize: lowercase everything except the T+n pattern (keep T uppercase)
    vdate_lower = vdate.lower()
    if vdate_lower.startswith("t+"):
        vdate_normalized = "T+" + vdate_lower[2:]  # preserve "T+1", "T+2", etc.
    else:
        vdate_normalized = vdate_lower
    if vdate_normalized not in VALID_VALUE_DATES:
        errors.append(f"Invalid value_date: {vdate!r} (must be one of {VALID_VALUE_DATES})")
    else:
        normalized["value_date"] = vdate_normalized

    if errors:
        return None, errors
    return normalized, []


# ---------------------------------------------------------------------------
# Parsers — CSV and JSON
# ---------------------------------------------------------------------------


def parse_csv(file_or_path: Union[str, Path, IO]) -> List[dict]:
    """Parse a CSV file into a list of raw dicts."""
    if isinstance(file_or_path, (str, Path)):
        # Detect file path vs raw string content
        if os.path.isfile(file_or_path):
            with open(file_or_path, newline="", encoding="utf-8") as f:
                return list(csv.DictReader(f))
        # Treat as raw CSV content
        return list(csv.DictReader(file_or_path.splitlines()))

    # File-like object
    return list(csv.DictReader(file_or_path))


def parse_json(file_or_path: Union[str, Path, IO]) -> List[dict]:
    """Parse a JSON file (array of objects, or {\"records\": [...]})."""
    if isinstance(file_or_path, (str, Path)):
        if os.path.isfile(file_or_path):
            with open(file_or_path, encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = json.loads(str(file_or_path))
    else:
        data = json.load(file_or_path)

    if isinstance(data, dict) and "records" in data:
        return data["records"]
    if isinstance(data, list):
        return data
    raise ValueError("JSON must be an array of objects or {\"records\": [...]}")


def detect_and_parse(file_or_path: Union[str, Path, IO], format_hint: Optional[str] = None) -> List[dict]:
    """
    Auto-detect CSV vs JSON from file extension or content, unless format_hint
    ('csv' | 'json') is given.
    """
    # File path → detect by extension
    if isinstance(file_or_path, Path) or (isinstance(file_or_path, str) and os.path.isfile(file_or_path)):
        path_str = str(file_or_path).lower()
        if format_hint:
            fmt = format_hint.lower()
        elif path_str.endswith(".json"):
            fmt = "json"
        elif path_str.endswith(".csv"):
            fmt = "csv"
        else:
            fmt = "csv"  # default
        return parse_json(file_or_path) if fmt == "json" else parse_csv(file_or_path)

    # String content or file-like: use hint, else try JSON then fall back to CSV
    if format_hint == "json":
        return parse_json(file_or_path)
    if format_hint == "csv":
        return parse_csv(file_or_path)

    # Auto-detect from string content
    if isinstance(file_or_path, str):
        stripped = file_or_path.strip()
        if stripped.startswith("[") or stripped.startswith("{"):
            return parse_json(file_or_path)
        return parse_csv(file_or_path)

    raise ValueError("Cannot auto-detect format for file-like object; pass format_hint.")


# ---------------------------------------------------------------------------
# Loader — upsert semantics
# ---------------------------------------------------------------------------


def load_ssi_rows(session: Session, rows: List[dict]) -> SSIImportResult:
    """
    Validate + upsert a list of raw SSI rows.

    Upsert key: (beneficiary_bic, currency, intermediary_bic).
    Existing records get their account numbers updated; new records are inserted.
    Bad rows are rejected with reasons and do not abort the batch.
    """
    result = SSIImportResult(total_rows=len(rows))

    for i, raw in enumerate(rows, start=1):
        normalized, errors = validate_ssi_row(raw)
        if errors:
            result.rejected += 1
            result.errors.append(SSIRowError(row_number=i, raw=raw, errors=errors))
            continue

        # Lookup existing by composite key
        existing = session.execute(
            select(SSI).where(
                SSI.beneficiary_bic == normalized["beneficiary_bic"],
                SSI.currency == normalized["currency"],
                SSI.intermediary_bic == normalized["intermediary_bic"],
            )
        ).scalar_one_or_none()

        if existing:
            # Update mutable fields
            existing.intermediary_account = normalized["intermediary_account"]
            existing.beneficiary_account = normalized["beneficiary_account"]
            existing.charge_code = normalized["charge_code"]
            existing.value_date = normalized["value_date"]
            if normalized.get("beneficiary_bank_name"):
                existing.beneficiary_bank_name = normalized["beneficiary_bank_name"]
            if normalized.get("intermediary_bank_name"):
                existing.intermediary_bank_name = normalized["intermediary_bank_name"]
            if normalized.get("notes"):
                existing.notes = normalized["notes"]
            if normalized.get("as_of"):
                existing.as_of = normalized["as_of"]
            existing.status = normalized["status"]
            result.updated += 1
        else:
            session.add(SSI(**normalized))
            result.inserted += 1

    session.commit()
    return result


# ---------------------------------------------------------------------------
# Top-level convenience
# ---------------------------------------------------------------------------


def import_ssi_file(
    session: Session,
    file_or_path: Union[str, Path, IO],
    format_hint: Optional[str] = None,
) -> SSIImportResult:
    """Parse + validate + load an SSI file (CSV or JSON)."""
    rows = detect_and_parse(file_or_path, format_hint)
    return load_ssi_rows(session, rows)
