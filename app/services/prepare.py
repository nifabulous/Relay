"""
Orchestration service for the combined prepare-payment endpoint.

Calls the four pre-send services (validation, VoP, routing, SSI), normalizes
their outputs into a single coherent payment package, and runs the
recommendation engine to produce one go/no-go signal.

This is the integration point: any UI or downstream system calls ONE endpoint
instead of four, and reads ONE field (recommendation) to decide whether to
enable the Send button.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import SSI
from ..schemas import (
    PrepareRoutingInfo,
    PrepareSSIInfo,
    PrepareValidationInfo,
    PrepareVoPInfo,
    SSIRecord,
)
from .recommendation import RecommendationResult, decide
from .routing import (
    _normalize_bic_input,
    infer_destination_currency,
    lookup_bank,
    suggest_intermediaries,
)
from .tracking import generate_uetr
from .validator import detect_type, validate_bic, validate_iban
from .vop import verify_payee

# VoP advice strings (shared with the standalone endpoint)
_VOP_ADVICE = {
    "MATCH": "Name matches the account holder.",
    "CLOSE_MATCH": "Name is similar but not exact — confirm with payer.",
    "NO_MATCH": "Name does not match — do not proceed.",
    "NOT_CHECKED": "Could not verify — account not found or bank doesn't participate.",
}


@dataclass
class PrepareResult:
    """Internal orchestration result — converted to the API response at the edge."""
    recommendation: RecommendationResult
    uetr: str
    validation: PrepareValidationInfo
    vop: PrepareVoPInfo
    routing: PrepareRoutingInfo
    ssi: PrepareSSIInfo


def prepare_payment(
    session: Session,
    beneficiary_iban: str,
    beneficiary_name: str,
    currency: str,
    beneficiary_bic: Optional[str] = None,
    amount: Optional[float] = None,
    strictness: str = "standard",
) -> PrepareResult:
    """
    Run all four pre-send checks and produce a single recommendation.

    Steps:
      1. Validate the IBAN (and derive BIC if not supplied)
      2. Verify the payee name (VoP)
      3. Get routing suggestions (intermediaries)
      4. Get settlement instructions (SSI)
      5. Run the recommendation engine across all four signals
    """
    currency = currency.strip().upper()
    iban = beneficiary_iban.strip().upper().replace(" ", "")

    # ----- Layer 1: validation -----
    bic_11: Optional[str] = None
    validation_valid = False
    validation_errors: list[str] = []

    # Some countries (NG, IN, etc.) aren't in the IBAN registry, so schwifty
    # rejects their IBANs even though they're valid domestic account formats.
    # We try IBAN validation; if it fails AND the input looks like it could be
    # a domestic account number (passed as "IBAN"), we don't hard-reject — we
    # proceed with the remaining checks, since the account may still exist.
    if detect_type(iban) == "iban":
        result = validate_iban(iban)
        validation_valid = result.valid
        validation_errors = result.errors
        bic_11 = result.bic
    else:
        valid, normalized, _, errs = validate_bic(iban)
        validation_valid = valid
        validation_errors = errs
        bic_11 = normalized

    # Caller-supplied BIC takes precedence if they passed one explicitly
    if beneficiary_bic:
        norm, valid, errs, _ = _normalize_bic_input(beneficiary_bic)
        if valid:
            bic_11 = norm
            # If their BIC validates, treat validation as passing even if the
            # IBAN derivation failed (they're telling us the BIC directly).
            validation_valid = True
            validation_errors = []

    validation_info = PrepareValidationInfo(
        valid=validation_valid,
        bic=bic_11,
        errors=validation_errors,
    )

    # If validation failed, short-circuit — no point checking the rest.
    if not validation_valid:
        rec = decide(
            validation_valid=False,
            vop_outcome="NOT_CHECKED",
            has_routing=False,
            has_real_ssi_accounts=False,
            has_placeholder_ssi_only=False,
            validation_errors=validation_errors,
            strictness=strictness,
        )
        return PrepareResult(
            recommendation=rec,
            uetr=generate_uetr(),
            validation=validation_info,
            vop=PrepareVoPInfo(outcome="NOT_CHECKED", advice=_VOP_ADVICE["NOT_CHECKED"]),
            routing=PrepareRoutingInfo(),
            ssi=PrepareSSIInfo(has_real_accounts=False, has_placeholders_only=False),
        )

    # ----- Layer 2: VoP -----
    vop_result = verify_payee(session, iban, beneficiary_name)
    vop_info = PrepareVoPInfo(
        outcome=vop_result.outcome,
        score=vop_result.score,
        account_holder_name=vop_result.account_holder_name,
        advice=_VOP_ADVICE.get(vop_result.outcome, "Unknown outcome."),
    )

    # ----- Layer 3: routing -----
    bank = lookup_bank(session, bic_11) if bic_11 else None
    dest_country = bank.country_code if bank else None
    # Also derive from IBAN country code as a fallback
    if not dest_country and len(iban) >= 2:
        dest_country = iban[:2]
    inferred_currency = infer_destination_currency(currency, bank, dest_country)
    intermediaries = suggest_intermediaries(session, inferred_currency, dest_country)
    routing_info = PrepareRoutingInfo(
        beneficiary_country=dest_country,
        inferred_currency=inferred_currency,
        suggested_intermediaries=intermediaries,
    )

    # ----- Layer 4: SSI -----
    ssi_rows = []
    if bic_11:
        # Determine which currency to filter SSI by: inferred currency first
        # (most accurate match for the destination), then fall back to the
        # caller's currency if no records found.
        ssi_currencies = list(dict.fromkeys([inferred_currency, currency]))  # dedup, preserve order
        for candidate in (bic_11, bic_11[:8] + "XXX", bic_11[:6] + "XXXXX"):
            for ssi_ccy in ssi_currencies:
                rows = session.execute(
                    select(SSI).where(
                        SSI.beneficiary_bic == candidate,
                        SSI.currency == ssi_ccy,
                    )
                ).scalars().all()
                if rows:
                    ssi_rows = rows
                    break
            if ssi_rows:
                break

    ssi_instructions = [
        SSIRecord(
            beneficiary_bic=r.beneficiary_bic,
            beneficiary_bank_name=r.beneficiary_bank_name,
            currency=r.currency,
            intermediary_bic=r.intermediary_bic,
            intermediary_bank_name=r.intermediary_bank_name,
            intermediary_account=r.intermediary_account,
            beneficiary_account=r.beneficiary_account,
            charge_code=r.charge_code,
            value_date=r.value_date,
            notes=r.notes,
        )
        for r in ssi_rows
    ]
    has_real_accounts = any(
        i.intermediary_account and not i.intermediary_account.startswith("ACCT-")
        for i in ssi_instructions
    )
    has_placeholders_only = (
        len(ssi_instructions) > 0
        and not has_real_accounts
        and any(i.intermediary_account and i.intermediary_account.startswith("ACCT-") for i in ssi_instructions)
    )
    ssi_info = PrepareSSIInfo(
        instructions=ssi_instructions,
        has_real_accounts=has_real_accounts,
        has_placeholders_only=has_placeholders_only,
    )

    # ----- Layer 5: recommendation -----
    rec = decide(
        validation_valid=True,
        vop_outcome=vop_result.outcome,
        has_routing=len(intermediaries) > 0,
        has_real_ssi_accounts=has_real_accounts,
        has_placeholder_ssi_only=has_placeholders_only,
        strictness=strictness,
    )

    return PrepareResult(
        recommendation=rec,
        uetr=generate_uetr(),
        validation=validation_info,
        vop=vop_info,
        routing=routing_info,
        ssi=ssi_info,
    )