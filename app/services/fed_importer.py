"""
Federal Reserve E-Payments Routing Directory importer.

Data source: FRB Services (https://www.frbservices.org/resources/routing-number-directory)
  - Fedwire Funds directory (fpddir.txt) — fixed-width, 102 chars/record
  - FedACH directory (FedACHdir.txt) — fixed-width, 155 chars/record

NOTE ON TERMS: The FRB requires accepting the E-Payments Routing Directory
Terms of Use. The data is free and public, but by default this importer loads
a bundled snapshot. Point FEDWIRE_URL / FEDACH_URL at your own downloaded copy
once you've accepted the terms at the URL above. The defaults below use a
widely-mirrored open copy for development convenience.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Iterator, Optional
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from ..models import FedACHBank, FedwireBank

# Default sources — can be overridden via env after you accept the FRB terms.
DEFAULT_FEDWIRE_URL = os.getenv(
    "FEDWIRE_URL",
    "https://raw.githubusercontent.com/moov-io/fed/master/data/fpddir.txt",
)
DEFAULT_FEDACH_URL = os.getenv(
    "FEDACH_URL",
    "https://raw.githubusercontent.com/moov-io/fed/master/data/FedACHdir.txt",
)
USER_AGENT = "swift-routing-importer/0.1 (educational)"


@dataclass
class ImportResult:
    source: str
    inserted: int
    skipped: int
    total_lines: int


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


def _download(url: str) -> str:
    """Fetch a text resource with a reasonable timeout + UA."""
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Parsers — fixed-width specs from the FRB E-Payments Directory documentation
# ---------------------------------------------------------------------------


def parse_fedwire_line(line: str) -> Optional[dict]:
    """
    Fedwire fpddir.txt layout (102 chars):
      1-9    Routing number (9)
      10-27  Telegraphic name (18)
      28-63  Customer name (36)
      64-65  State code (2)
      66-90  City (25)
      91     Funds transfer flag Y/N (1)
      92     Funds settlement-only flag (1)
      93     Book entry securities flag (1)
      94     Date of last revision YYYYMMDD (8) — may be blank
    """
    if len(line) < 93:
        return None
    return {
        "routing_number": line[0:9].strip(),
        "telegraphic_name": line[9:27].strip(),
        "customer_name": line[27:63].strip(),
        "state_code": line[63:65].strip(),
        "city": line[65:90].strip(),
        "funds_transfer": line[90:91].strip(),
        "settlement_only": line[91:92].strip(),
        "book_entry": line[92:93].strip(),
        "date_of_last_revision": line[93:101].strip() or None,
    }


def parse_fedach_line(line: str) -> Optional[dict]:
    """
    FedACH FedACHdir.txt layout (156 chars), empirically derived 0-indexed slices:
      0:9     Routing number
      9       Office code (O/B)
      10:19   Servicing FRB number
      19      Record type code
      20      Revised
      21:35   New routing number column (blank) + filler
      35:71   Customer name (36)
      71:107  Address (36)
      107:127 City (20)
      127:129 State (2)
      129:138 ZIP (9)
      138:142 ZIP+4 (4)
      142:145 Phone area code (3)
      145:148 Phone prefix (3)
      148:152 Phone suffix (4)
      152     Status code (1=active)
      153     View code
    """
    if len(line) < 153:
        return None
    return {
        "routing_number": line[0:9].strip(),
        "office_code": line[9:10].strip(),
        "servicing_frb_number": line[10:19].strip(),
        "record_type_code": line[19:20].strip(),
        "revised": line[20:21].strip(),
        "customer_name": line[35:71].strip(),
        "address": line[71:107].strip(),
        "city": line[107:127].strip(),
        "state_code": line[127:129].strip(),
        "zip_code": line[129:138].strip(),
        "zip_extension": line[138:142].strip(),
        "phone_area_code": line[142:145].strip(),
        "phone_prefix": line[145:148].strip(),
        "phone_suffix": line[148:152].strip(),
        "status_code": line[152:153].strip(),
        "view_code": line[153:154].strip() if len(line) >= 154 else "",
    }


def iter_records(text: str, parser) -> Iterator[dict]:
    for raw in text.splitlines():
        if not raw.strip():
            continue
        rec = parser(raw.rstrip("\n"))
        if rec and rec.get("routing_number"):
            yield rec


# ---------------------------------------------------------------------------
# Loaders — replace the whole table per import (directory is a full snapshot)
# ---------------------------------------------------------------------------


def import_fedwire(session: Session, url: str = DEFAULT_FEDWIRE_URL) -> ImportResult:
    text = _download(url)
    # Wipe + reload — the FRB file is an authoritative full snapshot.
    session.query(FedwireBank).delete()
    inserted = 0
    skipped = 0
    for i, rec in enumerate(iter_records(text, parse_fedwire_line)):
        session.add(FedwireBank(**rec))
        inserted += 1
        if inserted % 1000 == 0:
            session.flush()
    session.commit()
    return ImportResult(
        source="fedwire", inserted=inserted, skipped=skipped, total_lines=inserted
    )


def import_fedach(session: Session, url: str = DEFAULT_FEDACH_URL) -> ImportResult:
    text = _download(url)
    session.query(FedACHBank).delete()
    inserted = 0
    skipped = 0
    for rec in iter_records(text, parse_fedach_line):
        session.add(FedACHBank(**rec))
        inserted += 1
        if inserted % 1000 == 0:
            session.flush()
    session.commit()
    return ImportResult(
        source="fedach", inserted=inserted, skipped=skipped, total_lines=inserted
    )
