"""
Routing engine — derives a likely intermediary bank list for a payment.

Strategy (heuristic, since real correspondent routing is private/bilateral):
  1. Resolve the destination bank + country/currency from the BIC (or IBAN).
  2. Match corridor rules by (destination_currency, destination_country).
  3. Fall back to currency-only rules (e.g. generic EUR clearing).
  4. If nothing matches, return an honest "no curated rule" note.

For USD domestic wires, a 9-digit ABA routing number can also be resolved
against the Fedwire/FedACH directory (imported via `app.cli import-fedwire`).
"""

import logging
import re

logger = logging.getLogger(__name__)

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..data.settlement_directory import get_settlement_ids
from ..models import SSI, Bank, CorridorRule, FedACHBank, FedwireBank
from ..schemas import BankInfo, IntermediarySuggestion, SettlementIds
from .validator import detect_type, validate_bic, validate_iban


def _normalize_bic_input(value: str) -> tuple[str, bool, list[str], Optional[str]]:
    """
    Accept either a BIC or an IBAN; return (normalized_11char_bic, valid, errors, country).
    For an IBAN, the BIC is derived from schwifty if the national registry supports it.
    """
    value = value.strip().upper().replace(" ", "")
    country: Optional[str] = None

    if detect_type(value) == "iban":
        result = validate_iban(value)
        if not result.valid:
            return "", False, result.errors, None
        if result.bic is None:
            return "", False, ["IBAN valid but BIC not derivable for this country"], result.country_code
        # normalize the derived BIC to 11 chars
        valid, normalized, country, errs = validate_bic(result.bic)
        return (normalized or result.bic), valid, errs, country or result.country_code

    # BIC path
    valid, normalized, country, errs = validate_bic(value)
    # On failure, return empty string so callers can branch on `valid`
    # without also inspecting the normalized value.
    return (normalized or ""), valid, errs, country


def lookup_bank(session: Session, bic_11: str) -> Optional[BankInfo]:
    """
    Look up a bank in the directory. Try exact 11-char match first,
    then the 8-char prefix (bank + country), then the first 6 chars (bank only).
    """
    for candidate in (bic_11, bic_11[:8] + "XXX", bic_11[:6] + "XXXXX"):
        bank = session.execute(
            select(Bank).where(Bank.bic == candidate)
        ).scalar_one_or_none()
        if bank:
            return BankInfo(
                bic=bank.bic,
                bank_name=bank.bank_name,
                country_code=bank.country_code,
                city=bank.city,
                country_currency=bank.country_currency,
            )
    return None


# ISO 3166-1 country code → ISO 4217 currency code.
# Covers the countries present in the curated directory + common corridors.
COUNTRY_CURRENCY = {
    # Africa
    "NG": "NGN", "KE": "KES", "GH": "GHS", "ZA": "ZAR", "EG": "EGP",
    "TZ": "TZS", "UG": "UGX", "RW": "RWF", "CM": "XAF", "SN": "XOF",
    "CI": "XOF", "MA": "MAD", "TN": "TND", "MU": "MUR",
    # Americas
    "US": "USD", "CA": "CAD", "BR": "BRL", "MX": "MXN",
    # Europe / UK
    "GB": "GBP", "DE": "EUR", "FR": "EUR", "NL": "EUR", "ES": "EUR",
    "IT": "EUR", "IE": "EUR", "AT": "EUR", "BE": "EUR", "PT": "EUR",
    "FI": "EUR", "GR": "EUR", "CH": "CHF", "SE": "SEK", "NO": "NOK",
    "DK": "DKK", "PL": "PLN",
    # Asia-Pacific
    "JP": "JPY", "CN": "CNY", "HK": "HKD", "SG": "SGD", "AU": "AUD",
    "NZ": "NZD", "ID": "IDR", "MY": "MYR", "TH": "THB", "VN": "VND",
    "PH": "PHP", "BD": "BDT", "PK": "PKR", "LK": "LKR", "IN": "INR",
    "KR": "KRW", "TW": "TWD",
    # Middle East
    "AE": "AED", "SA": "SAR", "QA": "QAR", "KW": "KWD", "BH": "BHD",
    "OM": "OMR", "JO": "JOD", "IL": "ILS", "TR": "TRY",
}

# Currencies commonly used to FUND (send) cross-border payments. When the
# caller passes one of these as `currency` for a non-US destination, we infer
# they mean funding currency and translate to the destination currency.
FUNDING_CURRENCIES = {"USD", "EUR", "GBP"}


def infer_destination_currency(
    passed_currency: str,
    bank: Optional[BankInfo],
    destination_country: Optional[str],
) -> str:
    """
    If the caller passed a funding currency (e.g. USD) for a destination that
    uses a different local currency, infer the destination currency from the
    bank record or the country map.

    Returns the currency to match corridor rules against.
    """
    # Trust an explicit local currency on the bank record.
    if bank and bank.country_currency and bank.country_currency != passed_currency:
        # Only override when the passed currency looks like a funding currency.
        if passed_currency in FUNDING_CURRENCIES:
            return bank.country_currency

    # Otherwise infer from the destination country.
    if passed_currency in FUNDING_CURRENCIES and destination_country:
        local = COUNTRY_CURRENCY.get(destination_country)
        if local and local != passed_currency:
            return local

    # No inference possible — use what was passed.
    return passed_currency


def _settlement_for(bic: Optional[str]) -> Optional[SettlementIds]:
    """Attach CHIPS/ABA identifiers when the bank is a tracked USD clearer."""
    ids = get_settlement_ids(bic)
    if not ids:
        return None
    return SettlementIds(chips_uid=ids.get("chips_uid"), aba=ids.get("aba"))


def _has_usable_text(value: Optional[str]) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_usable_ssi_account(value: Optional[str]) -> bool:
    """Accept only a concrete account identifier, never a redaction token.

    An account is operational routing data only when both account fields are
    present and concrete.  The seed catalog intentionally uses ``ACCT-*``
    placeholders, while imported bank documents commonly use words,
    brackets, or punctuation to redact an account.  A strict shape check is
    safer than growing a blacklist of masking conventions. Keep those rows
    visible to the informational SSI endpoint, but never turn them into a
    send path.
    """
    if not _has_usable_text(value):
        return False

    normalized = value.strip().upper()
    if any(marker in normalized for marker in (
        "ACCT", "ACCOUNT", "PLACEHOLDER", "MASK", "REDACT"
    )):
        return False
    if any(char in normalized for char in "[]<>()*#"):
        return False
    if normalized.startswith("XX") or normalized.endswith("XX"):
        return False
    compact = re.sub(r"[\s-]", "", normalized)
    if not 4 <= len(compact) <= 34:
        return False
    if not re.fullmatch(r"[A-Z0-9]+", compact):
        return False
    if not any(char.isdigit() for char in compact):
        return False
    if "XX" in compact:
        return False
    return True


def _is_routable_ssi(row: SSI) -> bool:
    """Return whether an SSI is safe to use as an executable route.

    ``/api/ssi`` deliberately exposes the full catalog, including historical
    and illustrative records.  Routing is narrower: only a currently
    published, dated instruction with a named verifier, complete settlement
    fields, and unmasked account data may select a correspondent.
    """
    return (
        not row.bic_only
        and row.status == "published"
        and _has_usable_text(row.as_of)
        and _has_usable_text(row.verified_by)
        and _has_usable_text(row.notes)
        and _is_usable_ssi_account(row.intermediary_account)
        and _is_usable_ssi_account(row.beneficiary_account)
        and _has_usable_text(row.charge_code)
        and _has_usable_text(row.value_date)
    )


def _ssi_routing_filters() -> tuple:
    """Cheap SQL prefilter; ``_is_routable_ssi`` remains the final gate."""
    return (
        SSI.bic_only.is_(False),
        SSI.status == "published",
        SSI.as_of.isnot(None),
        SSI.verified_by.isnot(None),
        SSI.notes.isnot(None),
        SSI.intermediary_account.isnot(None),
        SSI.beneficiary_account.isnot(None),
        SSI.charge_code.isnot(None),
        SSI.value_date.isnot(None),
    )


def suggest_from_ssi(
    session: Session,
    beneficiary_bic_11: str,
    settlement_currency: str,
    destination_country: Optional[str],
) -> List[IntermediarySuggestion]:
    """
    Build intermediary suggestions from the beneficiary bank's PUBLISHED
    settlement instructions, when we hold them for this settlement currency.

    This is the authoritative path: an SSI names the exact correspondent the
    beneficiary bank wants its funds routed through. The corridor table below
    is only a heuristic fallback for banks whose SSIs we don't carry.

    Matches the SSI table the same way /api/ssi does: exact 11-char BIC, then
    the 8-char prefix, then the 6-char bank code.
    """
    suggestions: list[IntermediarySuggestion] = []
    seen: set[str] = set()

    candidates = [
        beneficiary_bic_11,
        beneficiary_bic_11[:8] + "XXX",
        beneficiary_bic_11[:6] + "XXXXX",
    ]
    rows: list = []
    for cand in candidates:
        candidate_rows = session.execute(
            select(SSI).where(
                SSI.beneficiary_bic == cand,
                SSI.currency == settlement_currency,
                *_ssi_routing_filters(),
            )
        ).scalars().all()
        rows = [row for row in candidate_rows if _is_routable_ssi(row)]
        if rows:
            break

    corridor = f"{settlement_currency}->{destination_country or '??'}"
    for r in rows:
        if r.intermediary_bic in seen:
            continue
        suggestions.append(
            IntermediarySuggestion(
                bic=r.intermediary_bic,
                bank=r.intermediary_bank_name or r.intermediary_bic,
                corridor=corridor,
                confidence="high",
                basis="published-ssi",
                settlement=_settlement_for(r.intermediary_bic),
            )
        )
        seen.add(r.intermediary_bic)

    return suggestions


def suggest_intermediaries(
    session: Session,
    destination_currency: str,
    destination_country: Optional[str],
) -> List[IntermediarySuggestion]:
    """Match corridor rules: country-specific first, then currency-only."""
    suggestions: list[IntermediarySuggestion] = []
    seen: set[str] = set()

    # 1. Country-specific rules
    if destination_country:
        rows = (
            session.query(CorridorRule)
            .filter(
                CorridorRule.destination_currency == destination_currency,
                CorridorRule.destination_country == destination_country,
            )
            .order_by(CorridorRule.rank)
            .all()
        )
        for r in rows:
            if r.intermediary_bic not in seen:
                suggestions.append(
                    IntermediarySuggestion(
                        bic=r.intermediary_bic,
                        bank=r.intermediary_name,
                        corridor=r.corridor,
                        confidence=r.confidence,
                        basis="corridor-heuristic",
                        settlement=_settlement_for(r.intermediary_bic),
                    )
                )
                seen.add(r.intermediary_bic)

    # 2. Currency-only fallback (destination_country is NULL in those rules)
    if len(suggestions) == 0:
        rows = (
            session.query(CorridorRule)
            .filter(
                CorridorRule.destination_currency == destination_currency,
                CorridorRule.destination_country.is_(None),
            )
            .order_by(CorridorRule.rank)
            .all()
        )
        for r in rows:
            if r.intermediary_bic not in seen:
                suggestions.append(
                    IntermediarySuggestion(
                        bic=r.intermediary_bic,
                        bank=r.intermediary_name,
                        corridor=r.corridor,
                        confidence=r.confidence,
                        basis="corridor-heuristic",
                        settlement=_settlement_for(r.intermediary_bic),
                    )
                )
                seen.add(r.intermediary_bic)

    return suggestions


def suggest_route(
    session: Session,
    beneficiary_bic_11: str,
    settlement_currency: str,
    destination_currency: str,
    destination_country: Optional[str],
) -> tuple[List[IntermediarySuggestion], str]:
    """
    SSI-first routing: return (suggestions, basis).

    1. If we hold the beneficiary bank's published SSIs for the settlement
       currency, return the FULL published correspondent list
       (basis="published-ssi") — no guessing when the bank has told the world
       exactly where to send its funds.
    2. Otherwise fall back to the curated corridor heuristic
       (basis="corridor-heuristic").
    """
    published = suggest_from_ssi(
        session, beneficiary_bic_11, settlement_currency, destination_country
    )
    if published:
        return published, "published-ssi"

    heuristic = suggest_intermediaries(session, destination_currency, destination_country)
    return heuristic, "corridor-heuristic"


# ---------------------------------------------------------------------------
# US routing-number resolver (Fedwire/FedACH)
# ---------------------------------------------------------------------------


def is_us_routing_number(value: str) -> bool:
    v = value.strip().replace("-", "").replace(" ", "")
    return len(v) == 9 and v.isdigit()


def lookup_us_bank(session: Session, routing_number: str) -> Optional[BankInfo]:
    """
    Resolve a 9-digit ABA routing number to bank info from the imported
    Fedwire (preferred) or FedACH directory.
    """
    rtn = routing_number.strip().replace("-", "").replace(" ", "")

    row = session.execute(
        select(FedwireBank).where(FedwireBank.routing_number == rtn)
    ).scalar_one_or_none()
    if row:
        return BankInfo(
            bic="",  # Fedwire directory uses ABA, not BIC
            bank_name=row.customer_name or row.telegraphic_name or "Unknown",
            country_code="US",
            city=row.city,
            country_currency="USD",
        )

    row = session.execute(
        select(FedACHBank).where(FedACHBank.routing_number == rtn)
    ).scalar_one_or_none()
    if row:
        return BankInfo(
            bic="",
            bank_name=row.customer_name or "Unknown",
            country_code="US",
            city=row.city,
            country_currency="USD",
        )

    return None
