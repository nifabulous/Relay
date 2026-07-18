"""Analytical endpoints: fee simulation, sanctions screening, value-date, STP check."""
from datetime import datetime as dt

from fastapi import APIRouter, HTTPException

from ..schemas import (
    FeeHopInfo,
    FeeSimulateRequest,
    FeeSimulateResponse,
    HopScreenInfo,
    Pacs008CheckRequest,
    Pacs008CheckResponse,
    Pacs008MappingEntryModel,
    PartyScreenInfo,
    ScreenRequest,
    ScreenResponse,
    STPCheckRequest,
    STPCheckResponse,
    STPFinding,
    TranslateRequest,
    TranslateResponse,
    ValueDateRequest,
    ValueDateResponse,
)
from ..schemas import (
    Pacs008Finding as Pacs008FindingSchema,
)
from ..services.fee_calculator import simulate_fees
from ..services.iso20022 import translate_mt103_to_pacs008, validate_pacs008
from ..services.screening import screen_payment as do_screening
from ..services.stp_checker import check_stp as do_stp_check
from ..services.value_date import calculate_value_date
from ._shared import (
    _PACS008_DISCLAIMER,
    _STP_DISCLAIMER,
    _VALUE_DATE_DISCLAIMER,
    SCREENING_DISCLAIMER_TEXT,
)

router = APIRouter(prefix="/api", tags=["swift"])


# ---------------------------------------------------------------------------
# Fee Calculator — simulate intermediary fees across the chain
# ---------------------------------------------------------------------------


@router.post("/fees/simulate", response_model=FeeSimulateResponse)
def simulate_payment_fees(request: FeeSimulateRequest):
    """
    Simulate how fees are deducted at each hop of a correspondent chain.

    Given an amount, currency, charge code (OUR/SHA/BEN), and the
    intermediary banks, returns a per-hop breakdown showing how much
    money arrives at the beneficiary.

    - **OUR** — sender pays all fees; beneficiary receives full amount
    - **SHA** — fees deducted from amount at each hop (most common)
    - **BEN** — beneficiary pays all fees (same deduction as SHA)
    """
    # charge_code validation is handled by the Pydantic schema (field_validator)
    if len(request.intermediary_bics) != len(request.intermediary_names):
        raise HTTPException(
            status_code=400,
            detail="intermediary_bics and intermediary_names must have equal length",
        )

    result = simulate_fees(
        amount=request.amount,
        currency=request.currency,
        charge_code=request.charge_code,
        intermediary_bics=request.intermediary_bics,
        intermediary_names=request.intermediary_names,
    )

    hops = [
        FeeHopInfo(
            bic=h.bic,
            bank_name=h.bank_name,
            fee=h.fee,
            amount_in=h.amount_in,
            amount_out=h.amount_out,
            cumulative_fees=h.cumulative_fees,
        )
        for h in result.hops
    ]

    breakdown = (
        f"Sent {result.sent_amount} {result.currency}. "
        f"Received {result.received_amount} {result.currency}. "
        f"Total fees: {result.total_fees} {result.currency}."
    )
    if result.charge_code == "OUR":
        breakdown += f" Sender paid {result.sender_pays_extra} extra (fees not deducted from amount)."

    return FeeSimulateResponse(
        charge_code=result.charge_code,
        currency=result.currency,
        sent_amount=result.sent_amount,
        received_amount=result.received_amount,
        total_fees=result.total_fees,
        sender_pays_extra=result.sender_pays_extra,
        hops=hops,
        fee_breakdown=breakdown,
    )


# ---------------------------------------------------------------------------
# Sanctions Screening
# ---------------------------------------------------------------------------


@router.post("/screen", response_model=ScreenResponse)
def screen_payment_endpoint(request: ScreenRequest):
    """
    Sanctions screening demo — check sender + beneficiary against a mock watchlist.

    Uses the same name-matching engine as VoP (Lab 3) but against a synthetic
    OFAC-style watchlist. When intermediaries are supplied, shows screening
    decisions at EACH bank in the chain — because every hop re-screens.
    """
    if len(request.intermediary_bics) != len(request.intermediary_names):
        raise HTTPException(
            status_code=400,
            detail="intermediary_bics and intermediary_names must have equal length",
        )

    result = do_screening(
        sender_name=request.sender_name,
        beneficiary_name=request.beneficiary_name,
        intermediary_bics=request.intermediary_bics,
        intermediary_names=request.intermediary_names,
    )

    hops = [
        HopScreenInfo(
            hop=h.hop, bic=h.bic, bank_name=h.bank_name,
            decision=h.decision, action=h.action,
            delay_hours=h.delay_hours, notes=h.notes,
        )
        for h in result.hops
    ]

    return ScreenResponse(
        sender=PartyScreenInfo(
            party=result.sender.party, name=result.sender.name,
            hit=result.sender.hit, score=result.sender.score,
            recommendation=result.sender.recommendation,
            matched_entry=result.sender.matched_entry,
        ),
        beneficiary=PartyScreenInfo(
            party=result.beneficiary.party, name=result.beneficiary.name,
            hit=result.beneficiary.hit, score=result.beneficiary.score,
            recommendation=result.beneficiary.recommendation,
            matched_entry=result.beneficiary.matched_entry,
        ),
        hops=hops,
        overall_recommendation=result.overall_recommendation,
        blocked=result.blocked,
        blocked_at_hop=result.blocked_at_hop,
        total_delay_hours=result.total_delay_hours,
        disclaimer=SCREENING_DISCLAIMER_TEXT,
    )


# ---------------------------------------------------------------------------
# Settlement / Value Date Calculator
# ---------------------------------------------------------------------------


@router.post("/value-date", response_model=ValueDateResponse)
def value_date_endpoint(request: ValueDateRequest):
    """
    Settlement-cycle / value-date calculator.

    Shows why a payment sent on Friday arrives Tuesday: cut-off times push
    the trade date forward, then settlement lag (T+0/T+1/T+2) plus weekends
    and holidays roll the value date. Demonstrates spot vs same-day settlement.
    """
    try:
        send_dt = dt.fromisoformat(request.send_datetime.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=400,
            detail="send_datetime must be ISO 8601, e.g. 2026-05-22T16:45:00",
        )

    try:
        r = calculate_value_date(send_dt, request.currency, request.scheme)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return ValueDateResponse(
        trade_date=r.trade_date.isoformat(),
        cut_off_local=r.cut_off_local,
        cut_off_tz=r.cut_off_tz,
        cut_off_note=r.cut_off_note,
        missed_cut_off=r.missed_cut_off,
        value_date=r.value_date.isoformat(),
        settlement_type=r.settlement_type,
        business_days=r.business_days,
        skipped_holidays=r.skipped_holidays,
        explanation=r.explanation,
        disclaimer=_VALUE_DATE_DISCLAIMER,
    )


# ---------------------------------------------------------------------------
# MT103 STP (Straight-Through Processing) Checker
# ---------------------------------------------------------------------------


@router.post("/message/stp-check", response_model=STPCheckResponse)
def stp_check_endpoint(request: STPCheckRequest):
    """
    Run the 12-rule MT103 STP primer (production engines run 40–80+ rules) and return a verdict.

    Returns one of:
    - **CLEAN** — no errors, no warnings; flows straight through
    - **REPAIRABLE** — no errors, but warnings (fix before send if possible)
    - **REJECTED** — at least one error; will be kicked out for manual repair

    `stp_passes` is the go/no-go signal for unattended processing: True iff
    there are no error-severity findings. Each finding names the offending
    SWIFT field tag (20, 32A, 50K, 59, 71A, 121) and a suggested repair.
    """
    result = do_stp_check(request.model_dump())

    findings = [
        STPFinding(
            field=f.field,
            field_name=f.field_name,
            severity=f.severity,
            code=f.code,
            message=f.message,
            repair=f.repair,
        )
        for f in result.findings
    ]

    field_summary = [
        {
            "field": s.field,
            "field_name": s.field_name,
            "present": s.present,
            "valid": s.valid,
            "findings": s.findings,
        }
        for s in result.field_summary
    ]

    return STPCheckResponse(
        verdict=result.verdict,
        stp_passes=result.stp_passes,
        findings=findings,
        field_summary=field_summary,
        disclaimer=_STP_DISCLAIMER,
    )


# ---------------------------------------------------------------------------
# ISO 20022 — MT103 -> pacs.008 translation + structured-field validation
# ---------------------------------------------------------------------------


@router.post("/message/translate", response_model=TranslateResponse)
def translate_message_endpoint(request: TranslateRequest):
    """
    Translate an MT103-shaped message into its ISO 20022 pacs.008 equivalent.

    Returns a field-by-field mapping (MT tag -> pacs.008 element path) plus an
    ILLUSTRATIVE pacs.008 XML document. MT103 was retired for cross-border on
    22 Nov 2025; this teaches the mapping, not a production converter.
    """
    result = translate_mt103_to_pacs008(request.model_dump())
    return TranslateResponse(
        mapping=[
            Pacs008MappingEntryModel(
                mt_tag=e.mt_tag, mt_label=e.mt_label,
                iso_path=e.iso_path, iso_label=e.iso_label, value=e.value,
            )
            for e in result.mapping
        ],
        xml=result.xml,
        disclaimer=_PACS008_DISCLAIMER,
    )


@router.post("/message/pacs008-check", response_model=Pacs008CheckResponse)
def pacs008_check_endpoint(request: Pacs008CheckRequest):
    """
    Validate a handful of structured pacs.008 fields (a primer, not production).

    Notably flags a country-only creditor address as REPAIRABLE — the SWIFT
    structured-address mandate (from Nov 2026) and the Travel-Rule
    data-completeness intent both require structured StrtNm / TwnNm.
    """
    result = validate_pacs008(request.model_dump())
    return Pacs008CheckResponse(
        verdict=result.verdict,
        passes=result.passes,
        findings=[
            Pacs008FindingSchema(
                field=f.field, field_name=f.field_name, severity=f.severity,
                code=f.code, message=f.message, repair=f.repair,
            )
            for f in result.findings
        ],
        disclaimer=_PACS008_DISCLAIMER,
    )
