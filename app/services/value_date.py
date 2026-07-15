"""
Settlement / value-date calculator.

Computes when funds become available (value date) from a send datetime,
currency, and payment scheme — accounting for weekends, holidays, and cut-off times.

Holiday data is embedded (not a DB table) for simplicity, matching the
pattern of payment_schemes.py and LIFT_FEES.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import List, Optional, Tuple

# ── Holiday calendar (2025-2026, major currencies) ──────────
HOLIDAYS = {
    "USD": [
        "2025-12-25", "2026-01-01", "2026-01-19", "2026-02-16",
        "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
        "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
    ],
    "EUR": [
        "2025-12-25", "2025-12-26", "2026-01-01", "2026-04-03",
        "2026-04-06", "2026-05-01", "2026-12-25", "2026-12-28",
    ],
    "GBP": [
        "2025-12-25", "2025-12-26", "2026-01-01", "2026-04-03",
        "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31",
        "2026-12-25", "2026-12-28",
    ],
    "JPY": [
        "2026-01-01", "2026-01-12", "2026-02-11", "2026-04-29",
        "2026-05-04", "2026-05-05", "2026-05-06",
    ],
    "NGN": ["2026-01-01", "2026-10-01"],
    "KES": ["2026-01-01", "2026-06-01", "2026-10-20"],
    "INR": ["2026-01-01", "2026-01-26", "2026-08-15", "2026-10-02"],
    "AUD": ["2026-01-01", "2026-01-26", "2026-04-03", "2026-04-06",
            "2026-04-27", "2026-12-25", "2026-12-28"],
    "CAD": ["2026-01-01", "2026-02-16", "2026-05-18", "2026-07-01",
            "2026-09-07", "2026-10-12", "2026-12-25"],
    "AED": ["2026-01-01"],
}

# Cut-off times per currency (local time, informational)
CUT_OFFS = {
    "USD": ("17:00", "America/New_York", "CHIPS same-day cut-off"),
    "EUR": ("18:00", "Europe/Berlin", "TARGET2 cut-off"),
    "GBP": ("16:20", "Europe/London", "CHAPS cut-off"),
    "JPY": ("16:30", "Asia/Tokyo", "BOJ-NET cut-off"),
    "NGN": ("14:00", "Africa/Lagos", "NIBSS cut-off"),
    "DEFAULT": ("17:00", "local", "assumed local cut-off"),
}

# Scheme → settlement lag in business days
SCHEME_LAGS = {
    # T+0 (instant / same-day)
    "fedwire": 0, "rtgs": 0, "target2": 0, "chaps": 0, "chips": 0,
    "rtp": 0, "fednow": 0, "sepa instant": 0, "sct inst": 0,
    "faster payments": 0, "fps": 0, "npp": 0, "payid": 0,
    "upi": 0, "imps": 0, "m-pesa": 0, "pesalink": 0,
    "nibss instant": 0, "interac": 0, "aani": 0,
    "lynx": 0, "boj-net": 0, "rits": 0, "same-day": 0, "instant": 0,
    # T+1
    "sepa": 1, "sepa credit transfer": 1, "sct": 1,
    "eft": 1, "ach": 1, "fedach": 1, "neft": 1,
    "zengin": 1, "uaefts": 1, "batch": 1,
    # T+2 (spot / cross-border default)
    "spot": 2, "swift": 2, "cross-border": 2, "mt103": 2,
    "bacs": 2, "direct entry": 2, "becs": 2,
}

# Instant rails that operate 24/7 (ignore weekends for T+0)
INSTANT_RAILS = {
    "faster payments", "fps", "npp", "payid", "upi", "imps",
    "m-pesa", "pesalink", "nibss instant", "interac", "aani",
    "sepa instant", "sct inst", "rtp", "fednow", "instant",
}

DEFAULT_LAG_BY_CURRENCY = {"USD": 2, "EUR": 1, "GBP": 0, "JPY": 2, "NGN": 0, "KES": 0}


@dataclass
class ValueDateResult:
    trade_date: date
    cut_off_local: str
    cut_off_tz: str
    cut_off_note: str
    missed_cut_off: bool
    value_date: date
    settlement_type: str
    business_days: int
    skipped_holidays: List[str] = field(default_factory=list)
    explanation: str = ""


def _is_business_day(d: date, holidays: set) -> bool:
    return d.weekday() < 5 and d.isoformat() not in holidays


def _next_business_day(d: date, holidays: set) -> date:
    while not _is_business_day(d, holidays):
        d += timedelta(days=1)
    return d


def _add_business_days(start: date, n: int, holidays: set) -> Tuple[date, List[str]]:
    """Walk forward n business days, collecting holidays stepped over."""
    cur = start
    skipped: List[str] = []
    count = 0
    while count < n:
        nxt = cur + timedelta(days=1)
        while not _is_business_day(nxt, holidays):
            if nxt.isoformat() in holidays:
                skipped.append(nxt.isoformat())
            nxt += timedelta(days=1)
        cur = nxt
        count += 1
    return cur, skipped


def _resolve_lag(currency: str, scheme: Optional[str]) -> Tuple[int, str, bool]:
    """Returns (lag, settlement_type, is_instant)."""
    if scheme:
        key = scheme.strip().lower()
        if key in SCHEME_LAGS:
            lag = SCHEME_LAGS[key]
            is_instant = key in INSTANT_RAILS
            stype = "T+0 (instant)" if lag == 0 and is_instant else \
                    "T+0 (same-day)" if lag == 0 else f"T+{lag}"
            return lag, stype, is_instant
    lag = DEFAULT_LAG_BY_CURRENCY.get(currency, 2)
    return lag, f"T+{lag}" if lag else "T+0 (same-day)", False


def calculate_value_date(
    send_datetime: datetime,
    currency: str,
    scheme: Optional[str] = None,
) -> ValueDateResult:
    """
    Compute the value date for a payment.

    Logic:
    1. If sent after the daily cut-off, trade date rolls to next business day.
    2. Value date = trade date + lag business days (skipping weekends + holidays).
    3. Instant rails (FPS, UPI, etc.) settle immediately regardless of day/time.
    """
    currency = currency.strip().upper()
    cut_off_str, tz, note = CUT_OFFS.get(currency, CUT_OFFS["DEFAULT"])
    cut_h, cut_m = (int(x) for x in cut_off_str.split(":"))
    holidays = set(HOLIDAYS.get(currency, []))
    lag, settlement_type, is_instant = _resolve_lag(currency, scheme)

    trade_date = send_datetime.date()

    # Instant rails: settle immediately, no cut-off, no business-day check
    if is_instant:
        return ValueDateResult(
            trade_date=trade_date,
            cut_off_local="24/7",
            cut_off_tz=tz,
            cut_off_note="Instant rail — no cut-off",
            missed_cut_off=False,
            value_date=trade_date,
            settlement_type=settlement_type,
            business_days=0,
            skipped_holidays=[],
            explanation=(
                f"Sent {trade_date.isoformat()} via instant rail ({scheme}). "
                f"Settles immediately — value date is the same day, regardless of "
                f"weekend or holiday."
            ),
        )

    # Non-instant: check cut-off (convert send time to settlement timezone)
    try:
        from zoneinfo import ZoneInfo
        settlement_tz = ZoneInfo(tz) if tz and tz != "local" else None
    except (ImportError, Exception):
        settlement_tz = None

    if settlement_tz and send_datetime.tzinfo is not None:
        # Convert to settlement timezone before comparing
        local_dt = send_datetime.astimezone(settlement_tz)
        missed = (local_dt.hour, local_dt.minute) > (cut_h, cut_m)
    elif settlement_tz and send_datetime.tzinfo is None:
        # Naive datetime — assume it's already in the settlement timezone
        missed = (send_datetime.hour, send_datetime.minute) > (cut_h, cut_m)
    else:
        # No timezone info available — compare as-is (educational approximation)
        missed = (send_datetime.hour, send_datetime.minute) > (cut_h, cut_m)
    if missed or not _is_business_day(trade_date, holidays):
        if not _is_business_day(trade_date, holidays):
            missed = True
        trade_date = _next_business_day(trade_date + timedelta(days=1), holidays)

    # Value date = trade date + lag business days
    value_date, skipped = _add_business_days(trade_date, lag, holidays)

    # Build explanation
    parts = [f"Sent {send_datetime.strftime('%a %Y-%m-%d %H:%M')}"]
    if missed:
        parts.append(f"After the {cut_off_str} cut-off → trade date rolls to {trade_date.strftime('%a %Y-%m-%d')}")
    else:
        parts.append(f"Before the {cut_off_str} cut-off → trade date is {trade_date.strftime('%a %Y-%m-%d')}")

    if lag == 0:
        parts.append(f"Same-day settlement ({settlement_type})")
    else:
        parts.append(f"{settlement_type} settlement → {lag} business days forward")

    parts.append(f"Value date: {value_date.strftime('%a %Y-%m-%d')}")

    if skipped:
        names = ", ".join(skipped)
        parts.append(f"Skipped holidays: {names}")

    explanation = ". ".join(parts) + "."

    return ValueDateResult(
        trade_date=trade_date,
        cut_off_local=cut_off_str,
        cut_off_tz=tz,
        cut_off_note=note,
        missed_cut_off=missed,
        value_date=value_date,
        settlement_type=settlement_type,
        business_days=lag,
        skipped_holidays=skipped,
        explanation=explanation,
    )
