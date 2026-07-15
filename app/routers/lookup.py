"""API routes for validation, bank lookup, and intermediary routing."""
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import admin_required
from ..db import get_db
from ..models import Bank, CorridorRule, FedACHBank, FedwireBank, PaymentEvent, SSI
from ..schemas import (
    HealthResponse,
    ImportResponse,
    LookupResponse,
    PaymentEventInfo,
    PreparePaymentRequest,
    PreparePaymentResponse,
    PrepareRoutingInfo,
    PrepareSSIInfo,
    PrepareValidationInfo,
    PrepareVoPInfo,
    RouteResponse,
    SSIRecord,
    SSIResponse,
    TrackPaymentRequest,
    TrackPaymentResponse,
    USBankInfo,
    USBankLookupResponse,
    ValidateResponse,
    VoPRequest,
    VoPResponse,
    FeeSimulateRequest,
    FeeSimulateResponse,
    FeeHopInfo,
    ScreenRequest,
    ScreenResponse,
    PartyScreenInfo,
    HopScreenInfo,
    ValueDateRequest,
    ValueDateResponse,
    STPCheckRequest,
    STPCheckResponse,
    STPFinding,
    BadgeInfo,
    ProgressResponse,
)
from ..services.fed_importer import import_fedach, import_fedwire
from ..services.routing import (
    _normalize_bic_input,
    infer_destination_currency,
    is_us_routing_number,
    lookup_bank,
    lookup_us_bank,
    suggest_intermediaries,
)
from ..services.tracking import generate_timeline, generate_uetr, get_payment_status
from ..services.vop import verify_payee
from ..services.prepare import prepare_payment
from ..services.fee_calculator import simulate_fees
from ..services.screening import screen_payment as do_screening
from ..services.value_date import calculate_value_date
from ..services.stp_checker import check_stp as do_stp_check
from ..services.progress import (
    ALL_BADGES,
    ALL_MODULE_IDS,
    get_progress_summary,
)
from ..data.sanctions_watchlist import DISCLAIMER as SCREENING_DISCLAIMER_TEXT
from ..data.payment_schemes import get_schemes_for_currency, list_currencies_with_schemes
from ..services.validator import detect_type, validate_bic, validate_iban

router = APIRouter(prefix="/api", tags=["swift"])


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)):
    return HealthResponse(
        status="ok",
        banks=db.query(Bank).count(),
        corridor_rules=db.query(CorridorRule).count(),
        fedwire_banks=db.query(FedwireBank).count(),
        fedach_banks=db.query(FedACHBank).count(),
        ssi_records=db.query(SSI).count(),
    )


@router.get("/validate", response_model=ValidateResponse)
def validate(value: str = Query(..., description="IBAN or BIC to validate")):
    """Validate an IBAN or BIC. Type is auto-detected."""
    raw = value.strip()
    input_type = detect_type(raw)

    if input_type == "iban":
        result = validate_iban(raw)
        return ValidateResponse(
            input=raw,
            input_type="iban",
            valid=result.valid,
            bic=result.bic,
            errors=result.errors,
        )

    # BIC
    valid, normalized, country, errors = validate_bic(raw)
    return ValidateResponse(
        input=raw,
        input_type="bic",
        valid=valid,
        bic=normalized,
        errors=errors,
    )


@router.get("/lookup", response_model=LookupResponse)
def lookup(
    bic: str = Query(..., description="BIC of the bank to look up"),
    db: Session = Depends(get_db),
):
    """Look up a bank in the directory by BIC."""
    normalized, valid, errors, _ = _normalize_bic_input(bic)
    if not valid:
        raise HTTPException(status_code=400, detail={"errors": errors})

    bank = lookup_bank(db, normalized)
    return LookupResponse(bic=normalized, bank=bank, found=bank is not None)


@router.get("/route", response_model=RouteResponse)
def route(
    bic: str = Query(..., description="Beneficiary bank BIC or IBAN"),
    currency: str = Query(..., description="Destination currency, e.g. USD, NGN"),
    db: Session = Depends(get_db),
):
    """
    Return a likely intermediary bank chain for a payment.

    Routing is heuristic — real correspondent relationships are private and
    depend on the originator bank's Nostro network. Confidence levels are advisory.

    Accepts either a BIC/IBAN (international) or a 9-digit ABA routing number
    (US domestic, resolved via the imported Fedwire/FedACH directory).
    """
    currency = currency.strip().upper()

    # US routing-number path
    if is_us_routing_number(bic):
        bank = lookup_us_bank(db, bic)
        dest_country = "US"
        normalized = bic.strip().replace("-", "").replace(" ", "")
        # Domestic USD wire: no intermediary needed if both legs are US.
        if currency == "USD":
            return RouteResponse(
                bic=normalized,
                bank=bank,
                beneficiary_country=dest_country,
                currency=currency,
                valid=True,
                suggested_intermediaries=[],
                notes=(
                    "Domestic USD wire via Fedwire Funds — no SWIFT intermediary "
                    "required. Use the beneficiary's ABA routing number directly."
                ),
                source="fedwire-directory",
            )
        # Non-USD from a US bank: fall through to corridor suggestions below.

    else:
        normalized, valid, errors, detected_country = _normalize_bic_input(bic)
        if not valid:
            raise HTTPException(status_code=400, detail={"errors": errors})
        bank = lookup_bank(db, normalized)
        dest_country = bank.country_code if bank else detected_country

    # Infer destination currency: if the caller passed a funding currency
    # (e.g. USD) for a destination that uses a different local currency,
    # translate to the local currency so corridor rules match.
    dest_currency = infer_destination_currency(currency, bank, dest_country)

    suggestions = suggest_intermediaries(db, dest_currency, dest_country)

    notes = (
        "Routing is heuristic. Exact chain depends on originator bank's "
        "Nostro relationships and may differ from these suggestions."
    )
    if not suggestions:
        notes = (
            f"No curated corridor rule for currency={dest_currency} "
            f"country={dest_country}. Contact originator bank for exact chain."
        )

    return RouteResponse(
        bic=normalized,
        bank=bank,
        beneficiary_country=dest_country,
        currency=dest_currency,
        valid=True,
        suggested_intermediaries=suggestions,
        notes=notes,
        source="curated-corridor-table",
    )


# ---------------------------------------------------------------------------
# US bank directory (Fedwire / FedACH) — legitimate public FRB data
# ---------------------------------------------------------------------------


@router.get("/us-bank", response_model=USBankLookupResponse)
def us_bank_lookup(
    routing_number: str = Query(..., description="9-digit ABA routing number"),
    db: Session = Depends(get_db),
):
    """Look up a US bank by ABA routing number in the Fedwire/FedACH directory."""
    rtn = routing_number.strip().replace("-", "").replace(" ", "")
    if not (len(rtn) == 9 and rtn.isdigit()):
        raise HTTPException(
            status_code=400, detail="routing_number must be 9 digits"
        )

    # Prefer Fedwire (funds-transfer eligible) then FedACH.
    row = db.execute(
        select(FedwireBank).where(FedwireBank.routing_number == rtn)
    ).scalar_one_or_none()
    if row:
        return USBankLookupResponse(
            routing_number=rtn,
            bank=USBankInfo(
                routing_number=row.routing_number,
                customer_name=row.customer_name,
                telegraphic_name=row.telegraphic_name,
                city=row.city,
                state_code=row.state_code,
                funds_transfer=row.funds_transfer,
                source="fedwire",
            ),
            found=True,
        )

    row = db.execute(
        select(FedACHBank).where(FedACHBank.routing_number == rtn)
    ).scalar_one_or_none()
    if row:
        return USBankLookupResponse(
            routing_number=rtn,
            bank=USBankInfo(
                routing_number=row.routing_number,
                customer_name=row.customer_name,
                city=row.city,
                state_code=row.state_code,
                source="fedach",
            ),
            found=True,
        )

    return USBankLookupResponse(routing_number=rtn, bank=None, found=False)


@router.post("/import/fedwire", response_model=ImportResponse, dependencies=[Depends(admin_required)])
def trigger_fedwire_import(db: Session = Depends(get_db)):
    """
    Reload the Fedwire directory. Pulls the public FRB E-Payments snapshot.
    Heavy operation (~7,500 rows); intended for admin/CLI use, not per-request.
    Requires FEDWIRE_URL env var pointing at a trusted FRB-downloaded copy.
    """
    try:
        result = import_fedwire(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ImportResponse(
        source=result.source,
        inserted=result.inserted,
        total_lines=result.total_lines,
        message=f"Imported {result.inserted} Fedwire banks.",
    )


@router.post("/import/fedach", response_model=ImportResponse, dependencies=[Depends(admin_required)])
def trigger_fedach_import(db: Session = Depends(get_db)):
    """Reload the FedACH directory (~25,000 rows). Admin/CLI use.
    Requires FEDACH_URL env var pointing at a trusted FRB-downloaded copy."""
    try:
        result = import_fedach(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ImportResponse(
        source=result.source,
        inserted=result.inserted,
        total_lines=result.total_lines,
        message=f"Imported {result.inserted} FedACH banks.",
    )


# ---------------------------------------------------------------------------
# SSI import — upload CSV/JSON of Standard Settlement Instructions
# ---------------------------------------------------------------------------


@router.post("/import/ssi", dependencies=[Depends(admin_required)])
async def trigger_ssi_import(
    file: UploadFile = File(..., description="CSV or JSON file of SSI records"),
    db: Session = Depends(get_db),
):
    """
    Upload a CSV or JSON file of Standard Settlement Instructions.

    Format auto-detected from filename extension (.csv / .json).

    CSV columns: beneficiary_bic, beneficiary_bank_name, currency,
                 intermediary_bic, intermediary_bank_name,
                 intermediary_account, beneficiary_account,
                 charge_code, value_date, notes

    JSON: an array of objects with the same keys, or {"records": [...]}.

    Upsert by (beneficiary_bic, currency, intermediary_bic) — re-importing
    updates account numbers rather than duplicating.
    """
    from ..services.ssi_importer import import_ssi_file

    content = await file.read()
    format_hint = "json" if (file.filename or "").lower().endswith(".json") else "csv"

    try:
        # Decode + wrap as a file-like object for the parser.
        # handle BOM from Excel exports; catch decode errors as 400, not 500.
        text = content.decode("utf-8-sig")
        result = import_ssi_file(db, text, format_hint=format_hint)
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="File is not valid UTF-8. Save as UTF-8 (Excel: 'CSV UTF-8').",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Parse error: {e}")

    return {
        "source": "ssi",
        "inserted": result.inserted,
        "updated": result.updated,
        "rejected": result.rejected,
        "total_rows": result.total_rows,
        "message": result.summary(),
        "errors": [
            {"row": e.row_number, "errors": e.errors}
            for e in result.errors
        ],
    }


# ---------------------------------------------------------------------------
# Standard Settlement Instructions (SSI)
# ---------------------------------------------------------------------------


_SSI_DISCLAIMER = (
    "Account numbers in seed data are ILLUSTRATIVE placeholders. "
    "Replace with values from the beneficiary bank's published SSI list "
    "or a licensed feed (Accuity, SWIFTRef) before use."
)


@router.get("/ssi", response_model=SSIResponse)
def get_ssi(
    bic: str = Query(..., description="Beneficiary bank BIC"),
    currency: Optional[str] = Query(
        None, description="Filter by currency (e.g. USD). If omitted, returns all."
    ),
    db: Session = Depends(get_db),
):
    """
    Return Standard Settlement Instructions for a beneficiary bank.

    Unlike /route (heuristic intermediary suggestions), SSI records carry the
    actual Nostro account numbers and charge codes that make a payment settle.
    """
    normalized, valid, errors, _ = _normalize_bic_input(bic)
    if not valid:
        raise HTTPException(status_code=400, detail={"errors": errors})

    ccy = currency.strip().upper() if currency else None

    # Match on the full 11-char BIC, then the 8-char prefix, then 6-char.
    candidates = [normalized, normalized[:8] + "XXX", normalized[:6] + "XXXXX"]
    rows = []
    for cand in candidates:
        q = select(SSI).where(SSI.beneficiary_bic == cand)
        if ccy:
            q = q.where(SSI.currency == ccy)
        rows = db.execute(q).scalars().all()
        if rows:
            break

    instructions = [
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
        for r in rows
    ]

    return SSIResponse(
        beneficiary_bic=normalized,
        currency=ccy or "ALL",
        instructions=instructions,
        disclaimer=_SSI_DISCLAIMER,
    )


# ---------------------------------------------------------------------------
# Verification of Payee (VoP) — EPC103-24 compliant name verification
# ---------------------------------------------------------------------------


_VOP_ADVICE = {
    "MATCH": "Name matches the account holder. Safe to proceed.",
    "CLOSE_MATCH": (
        "Name is similar but not exact. The account holder name is provided "
        "for review. Confirm with the payer before proceeding."
    ),
    "NO_MATCH": (
        "Name does not match the account holder. Do NOT proceed — "
        "verify the beneficiary details with the payer."
    ),
    "NOT_CHECKED": (
        "Could not verify — account not found or the beneficiary bank does "
        "not participate in VoP. Proceed with caution."
    ),
}


@router.post("/verify-payee", response_model=VoPResponse)
def verify_payee_endpoint(request: VoPRequest, db: Session = Depends(get_db)):
    """
    Verify that a beneficiary name matches the account holder for the given IBAN.

    Returns MATCH / CLOSE_MATCH / NO_MATCH / NOT_CHECKED per the EPC VoP scheme.
    On CLOSE_MATCH, the actual account holder name is returned for payer review.
    On NO_MATCH, the name is withheld for privacy.

    NOTE: This uses a local synthetic account registry. In production, this
    would call the EPC VoP gateway (SurePay, Tink, TrueLayer) or the receiving
    bank's core banking system.
    """
    result = verify_payee(db, request.iban, request.name)
    return VoPResponse(
        iban=result.iban,
        submitted_name=result.submitted_name,
        outcome=result.outcome,
        score=result.score,
        account_holder_name=result.account_holder_name,
        account_type=result.account_type,
        advice=_VOP_ADVICE.get(result.outcome, "Unknown outcome."),
    )


# ---------------------------------------------------------------------------
# SWIFT gpi payment tracking (UETR)
# ---------------------------------------------------------------------------

_TRACKING_DISCLAIMER = (
    "SIMULATED timeline. Real SWIFT gpi tracking requires SWIFT membership "
    "and a connection to the gpi tracker gateway. This simulation generates "
    "realistic status events for development and demonstration."
)


@router.post("/track/create", response_model=TrackPaymentResponse, dependencies=[Depends(admin_required)])
def create_tracked_payment(request: TrackPaymentRequest, db: Session = Depends(get_db)):
    """
    Create a payment with UETR tracking and generate a simulated gpi timeline.

    Generates a UETR (UUID v4 per SWIFT gpi spec), then creates status events
    for each hop in the correspondent chain: INITIATED → ACCEPTED →
    IN_PROGRESS → FORWARDED → ... → CREDITED.

    Set `outcome: "rejected"` to simulate a compliance rejection at the
    first intermediary.
    """
    if request.outcome not in ("credited", "rejected"):
        raise HTTPException(
            status_code=400,
            detail="outcome must be 'credited' or 'rejected'",
        )
    if len(request.intermediary_bics) != len(request.intermediary_names):
        raise HTTPException(
            status_code=400,
            detail="intermediary_bics and intermediary_names must have equal length",
        )

    uetr = generate_uetr()
    generate_timeline(
        session=db,
        uetr=uetr,
        originator_bic=request.originator_bic,
        originator_name=request.originator_name,
        beneficiary_bic=request.beneficiary_bic,
        beneficiary_name=request.beneficiary_name,
        intermediary_bics=request.intermediary_bics,
        intermediary_names=request.intermediary_names,
        currency=request.currency,
        amount=request.amount,
        charge_code=request.charge_code,
        outcome=request.outcome,
    )

    status = get_payment_status(db, uetr)
    return _build_track_response(uetr, status)


@router.get("/track/{uetr}", response_model=TrackPaymentResponse)
def get_tracked_payment(uetr: str, db: Session = Depends(get_db)):
    """
    Retrieve the tracking timeline for a payment by its UETR.

    The UETR is the 36-character UUID assigned at initiation, embedded in
    MT103 field 121 / pacs.008. This returns the full status timeline.
    """
    status = get_payment_status(db, uetr)
    if status is None:
        raise HTTPException(status_code=404, detail=f"No payment found for UETR {uetr}")
    return _build_track_response(uetr, status)


def _build_track_response(uetr: str, status: dict) -> TrackPaymentResponse:
    """Convert the status dict + events into the API response."""
    return TrackPaymentResponse(
        uetr=uetr,
        current_status=status["current_status"],
        is_terminal=status["is_terminal"],
        event_count=status["event_count"],
        sent_amount=status["sent_amount"],
        final_amount=status["final_amount"],
        total_fees=status["total_fees"],
        last_updated=status["last_updated"],
        timeline=[
            PaymentEventInfo(
                status=e.status,
                bank_bic=e.bank_bic,
                bank_name=e.bank_name,
                hop=e.hop,
                timestamp=e.timestamp,
                amount=e.amount,
                currency=e.currency,
                message=e.message,
                instructing_bic=e.instructing_bic,
                instructed_bic=e.instructed_bic,
            )
            for e in status["timeline"]
        ],
        disclaimer=_TRACKING_DISCLAIMER,
    )


# ---------------------------------------------------------------------------
# Payment Schemes — domestic rails by currency
# ---------------------------------------------------------------------------


@router.get("/schemes")
def get_payment_schemes(
    currency: Optional[str] = Query(
        None, description="3-letter currency code (e.g. GBP, CAD, USD). If omitted, lists all."
    ),
):
    """
    Return domestic payment schemes for a currency.

    Each currency has its own domestic rails with different speed, cost, and
    limits. For example, GBP has Faster Payments (instant), CHAPS (high-value),
    and Bacs (batch). CAD has Interac (instant), EFT (batch), and Lynx (RTGS).

    This is educational data — always check the operator's current rules.
    """
    if currency:
        data = get_schemes_for_currency(currency)
        if data is None:
            raise HTTPException(
                status_code=404,
                detail=f"No scheme data for currency '{currency}'. Supported: {', '.join(list_currencies_with_schemes())}",
            )
        return data

    # List all
    return {
        "currencies": list_currencies_with_schemes(),
        "count": len(list_currencies_with_schemes()),
    }


# ---------------------------------------------------------------------------
# Combined prepare-payment endpoint — orchestrates all pre-send checks
# ---------------------------------------------------------------------------


@router.post("/prepare-payment", response_model=PreparePaymentResponse)
def prepare_payment_endpoint(request: PreparePaymentRequest, db: Session = Depends(get_db)):
    """
    Run all pre-send checks in one call and return a single recommendation.

    Orchestrates: validation → VoP (name verification) → routing (intermediaries)
    → SSI (settlement instructions), then runs a recommendation engine that
    combines the four signals into one of:

    - **PROCEED** — all checks passed, safe to send
    - **PROCEED_WITH_CAUTION** — sendable, but SSI accounts unverified or name close
    - **REVIEW** — name is a close match; payer must confirm (standard strictness)
    - **CAUTION** — payee couldn't be verified; proceed at own risk
    - **STOP** — name doesn't match (likely wrong account / fraud) or strict mode blocked
    - **BLOCKED** — no route to destination for this currency
    - **REJECT** — beneficiary details failed validation

    The `recommendation` field is the single go/no-go signal for a UI. A UETR
    is generated to bridge to the tracking endpoint if the payment is sent.
    """
    if request.strictness not in ("lenient", "standard", "strict"):
        raise HTTPException(
            status_code=400,
            detail="strictness must be 'lenient', 'standard', or 'strict'",
        )

    result = prepare_payment(
        session=db,
        beneficiary_iban=request.beneficiary_iban,
        beneficiary_name=request.beneficiary_name,
        currency=request.currency,
        beneficiary_bic=request.beneficiary_bic,
        amount=request.amount,
        strictness=request.strictness,
    )

    return PreparePaymentResponse(
        recommendation=result.recommendation.recommendation.value,
        reason=result.recommendation.reason,
        is_blocking=result.recommendation.is_blocking,
        uetr=result.uetr,
        validation=result.validation,
        vop=result.vop,
        routing=result.routing,
        ssi=result.ssi,
        warnings=result.recommendation.warnings,
        blocks=result.recommendation.blocks,
    )


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


_VALUE_DATE_DISCLAIMER = (
    "Educational calculator. Real settlement uses the operator's holiday feed "
    "and cut-off schedule; times shown are local to the currency's settlement system."
)


@router.post("/value-date", response_model=ValueDateResponse)
def value_date_endpoint(request: ValueDateRequest):
    """
    Settlement-cycle / value-date calculator.

    Shows why a payment sent on Friday arrives Tuesday: cut-off times push
    the trade date forward, then settlement lag (T+0/T+1/T+2) plus weekends
    and holidays roll the value date. Demonstrates spot vs same-day settlement.
    """
    from datetime import datetime as dt

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


_STP_DISCLAIMER = (
    "Educational STP check against a static rule set. A real correspondent "
    "bank applies its own repair policy, reference data, and sanctions/AML "
    "screening on top of these structural checks."
)


@router.post("/message/stp-check", response_model=STPCheckResponse)
def stp_check_endpoint(request: STPCheckRequest):
    """
    Run the 12 MT103 straight-through-processing checks and return a verdict.

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
# Progress & badges (learning platform dashboard)
# ---------------------------------------------------------------------------

@router.get("/progress", response_model=ProgressResponse)
def get_progress(
    completed: Optional[str] = Query(
        None,
        description="Comma-separated completed module IDs, e.g. '1,2,3,fees'",
    ),
):
    """
    Compute the learner's progress summary: completion stats, earned badges,
    and the next recommended module.

    Pass the learner's completed module IDs as `?completed=1,2,3,fees`.
    Module IDs match the hash routes in the learning UI
    (`1`–`7`, `capstone`, `fees`, `fx`, `sanctions`, `settlement`,
    `mt103`, `cases`, `glossary`). Unknown IDs are ignored.

    The response always lists **all** badges (with `earned: true|false`),
    so the frontend can render locked/unlocked badges in one call.
    """
    completed_ids = []
    if completed:
        completed_ids = [c.strip() for c in completed.split(",") if c.strip()]

    summary = get_progress_summary(completed_ids)
    earned_ids = {b.id for b in summary.earned_badges}

    all_badge_infos = [
        BadgeInfo(
            id=b.id,
            name=b.name,
            description=b.description,
            requirement=b.requirement,
            earned=b.id in earned_ids,
        )
        for b in ALL_BADGES
    ]

    earned_infos = [bi for bi in all_badge_infos if bi.earned]

    return ProgressResponse(
        completed_count=summary.completed_count,
        total_count=summary.total_count,
        percentage=summary.percentage,
        earned_badges=earned_infos,
        next_recommended=summary.next_recommended,
        all_badges=all_badge_infos,
    )
