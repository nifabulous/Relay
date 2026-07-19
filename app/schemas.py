"""Pydantic v2 request/response schemas."""
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from .services.validator import validate_currency_code

# ---------- responses ----------


class BankInfo(BaseModel):
    bic: str
    bank_name: str
    country_code: str
    city: Optional[str] = None
    country_currency: Optional[str] = None


class IntermediarySuggestion(BaseModel):
    bic: str
    bank: str
    corridor: str
    confidence: str  # high | medium | low


class ValidateResponse(BaseModel):
    input: str
    input_type: str  # iban | bic
    valid: bool
    bic: Optional[str] = None
    bank: Optional[BankInfo] = None
    errors: List[str] = Field(default_factory=list)


class LookupResponse(BaseModel):
    bic: str
    bank: Optional[BankInfo] = None
    found: bool


class RouteResponse(BaseModel):
    bic: str
    bank: Optional[BankInfo] = None
    beneficiary_country: Optional[str] = None
    currency: str
    valid: bool
    suggested_intermediaries: List[IntermediarySuggestion] = Field(default_factory=list)
    notes: str
    source: str = "curated-corridor-table"


class HealthResponse(BaseModel):
    status: str
    banks: int
    corridor_rules: int
    fedwire_banks: int = 0
    fedach_banks: int = 0
    ssi_records: int = 0


class USBankInfo(BaseModel):
    routing_number: str
    customer_name: str
    telegraphic_name: Optional[str] = None
    city: Optional[str] = None
    state_code: Optional[str] = None
    funds_transfer: Optional[str] = None
    source: str  # fedwire | fedach


class USBankLookupResponse(BaseModel):
    routing_number: str
    bank: Optional[USBankInfo] = None
    found: bool


class ImportResponse(BaseModel):
    source: str
    inserted: int
    total_lines: int
    message: str


class SSIRecord(BaseModel):
    beneficiary_bic: str
    beneficiary_bank_name: Optional[str] = None
    currency: str
    intermediary_bic: str
    intermediary_bank_name: Optional[str] = None
    intermediary_account: Optional[str] = None
    beneficiary_account: Optional[str] = None
    charge_code: str = "SHA"
    value_date: str = "spot"
    notes: Optional[str] = None


class SSIResponse(BaseModel):
    beneficiary_bic: str
    currency: str
    instructions: List[SSIRecord] = Field(default_factory=list)
    disclaimer: str


class VoPRequest(BaseModel):
    iban: str = Field(..., max_length=34, description="Beneficiary account IBAN")
    name: str = Field(..., max_length=200, description="Account holder name as entered by the payer")


class VoPResponse(BaseModel):
    iban: str
    submitted_name: str
    outcome: str  # MATCH | CLOSE_MATCH | NO_MATCH | NOT_CHECKED
    score: Optional[float] = None
    account_holder_name: Optional[str] = None  # only on CLOSE_MATCH
    account_type: Optional[str] = None
    advice: str  # human-readable guidance for the payer


class TrackPaymentRequest(BaseModel):
    originator_bic: str = Field(..., max_length=11, description="The sending bank's BIC")
    originator_name: str = Field(..., max_length=200, description="The sending bank's name")
    beneficiary_bic: str = Field(..., max_length=11, description="The receiving bank's BIC")
    beneficiary_name: str = Field(..., max_length=200, description="The receiving bank's name")
    currency: str = Field(..., description="3-letter currency code, e.g. USD")
    amount: float = Field(..., gt=0, description="Payment amount")
    charge_code: str = Field("SHA", description="OUR / SHA / BEN")
    intermediary_bics: List[str] = Field(default_factory=list, description="Intermediary BICs")
    intermediary_names: List[str] = Field(default_factory=list, description="Intermediary bank names")
    outcome: str = Field("credited", description="Simulated outcome: credited | rejected")

    @field_validator("currency")
    @classmethod
    def validate_ccy(cls, v):
        return validate_currency_code(v)


class PaymentEventInfo(BaseModel):
    status: str
    bank_bic: str
    bank_name: Optional[str] = None
    hop: int
    timestamp: str
    amount: Optional[str] = None
    currency: Optional[str] = None
    message: Optional[str] = None
    instructing_bic: Optional[str] = None
    instructed_bic: Optional[str] = None


class TrackPaymentResponse(BaseModel):
    uetr: str
    current_status: str
    is_terminal: bool
    event_count: int
    sent_amount: Optional[str] = None
    final_amount: Optional[str] = None
    total_fees: Optional[float] = None
    last_updated: str
    timeline: List[PaymentEventInfo]
    disclaimer: str


# ---------------------------------------------------------------------------
# Combined prepare-payment endpoint
# ---------------------------------------------------------------------------


class PreparePaymentRequest(BaseModel):
    beneficiary_iban: str = Field(..., max_length=34, description="Beneficiary account IBAN")
    beneficiary_name: str = Field(..., max_length=200, description="Account holder name as entered by payer")
    beneficiary_bic: Optional[str] = Field(
        None, max_length=11, description="Beneficiary bank BIC (auto-derived from IBAN if omitted)"
    )
    currency: str = Field(..., description="Payment currency, e.g. USD, NGN")
    amount: float = Field(..., gt=0, description="Payment amount")
    strictness: str = Field(
        "standard",
        description="How to treat CLOSE_MATCH/NOT_CHECKED: lenient | standard | strict",
    )

    @field_validator("currency")
    @classmethod
    def validate_ccy(cls, v):
        return validate_currency_code(v)


class PrepareValidationInfo(BaseModel):
    valid: bool
    bic: Optional[str] = None
    errors: List[str] = Field(default_factory=list)


class PrepareVoPInfo(BaseModel):
    outcome: str  # MATCH | CLOSE_MATCH | NO_MATCH | NOT_CHECKED
    score: Optional[float] = None
    account_holder_name: Optional[str] = None
    advice: str


class PrepareRoutingInfo(BaseModel):
    beneficiary_country: Optional[str] = None
    inferred_currency: Optional[str] = None
    suggested_intermediaries: List[IntermediarySuggestion] = Field(default_factory=list)


class PrepareSSIInfo(BaseModel):
    instructions: List[SSIRecord] = Field(default_factory=list)
    has_real_accounts: bool
    has_placeholders_only: bool


class PreparePaymentResponse(BaseModel):
    recommendation: str  # PROCEED | PROCEED_WITH_CAUTION | REVIEW | CAUTION | STOP | BLOCKED | REJECT
    reason: str
    is_blocking: bool
    uetr: str
    validation: PrepareValidationInfo
    vop: PrepareVoPInfo
    routing: PrepareRoutingInfo
    ssi: PrepareSSIInfo
    warnings: List[str] = Field(default_factory=list)
    blocks: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Fee Calculator
# ---------------------------------------------------------------------------


class FeeSimulateRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Send amount (must be positive)")
    currency: str = Field(..., description="3-letter currency code")
    charge_code: str = Field("SHA", description="OUR / SHA / BEN")
    intermediary_bics: List[str] = Field(default_factory=list)
    intermediary_names: List[str] = Field(default_factory=list)

    @field_validator("currency")
    @classmethod
    def validate_ccy(cls, v):
        return validate_currency_code(v)

    @field_validator("charge_code")
    @classmethod
    def normalize_charge_code(cls, v):
        v = v.strip().upper()
        if v not in ("OUR", "SHA", "BEN"):
            raise ValueError("charge_code must be OUR, SHA, or BEN")
        return v


class FeeHopInfo(BaseModel):
    bic: str
    bank_name: str
    fee: float
    amount_in: float
    amount_out: float
    cumulative_fees: float


class FeeSimulateResponse(BaseModel):
    charge_code: str
    currency: str
    sent_amount: float
    received_amount: float
    total_fees: float
    sender_pays_extra: float
    hops: List[FeeHopInfo]
    fee_breakdown: str


# ---------------------------------------------------------------------------
# Sanctions Screening
# ---------------------------------------------------------------------------


class ScreenRequest(BaseModel):
    sender_name: str = Field(..., min_length=1, max_length=200, description="Sender name to screen")
    beneficiary_name: str = Field(..., min_length=1, max_length=200, description="Beneficiary name to screen")
    intermediary_bics: List[str] = Field(default_factory=list)
    intermediary_names: List[str] = Field(default_factory=list)


class PartyScreenInfo(BaseModel):
    party: str
    name: str
    hit: bool
    score: float
    recommendation: str  # CLEAR | REVIEW | REJECT
    matched_entry: Optional[dict] = None


class HopScreenInfo(BaseModel):
    hop: int
    bic: str
    bank_name: str
    decision: str  # CLEAR | POSSIBLE_HIT | HARD_HIT
    action: str  # PASS | HOLD | REJECT
    delay_hours: float
    notes: str


class ScreenResponse(BaseModel):
    sender: PartyScreenInfo
    beneficiary: PartyScreenInfo
    hops: List[HopScreenInfo] = Field(default_factory=list)
    overall_recommendation: str  # CLEAR | REVIEW | BLOCKED
    blocked: bool
    blocked_at_hop: Optional[int] = None
    total_delay_hours: float
    disclaimer: str


# ---------------------------------------------------------------------------
# Settlement / Value Date
# ---------------------------------------------------------------------------


class ValueDateRequest(BaseModel):
    send_datetime: str = Field(..., description="ISO 8601 datetime, e.g. 2026-05-22T16:45:00")
    currency: str = Field(..., description="3-letter currency code")
    scheme: Optional[str] = Field(None, description="e.g. 'CHAPS', 'SEPA Instant', 'spot', 'fedwire'")

    @field_validator("currency")
    @classmethod
    def validate_ccy(cls, v):
        return validate_currency_code(v)


class ValueDateResponse(BaseModel):
    trade_date: str
    cut_off_local: str
    cut_off_tz: str
    cut_off_note: str
    missed_cut_off: bool
    value_date: str
    settlement_type: str
    business_days: int
    skipped_holidays: List[str] = Field(default_factory=list)
    explanation: str
    disclaimer: str


# ---------------------------------------------------------------------------
# STP Checker (MT103 straight-through processing)
# ---------------------------------------------------------------------------


class OrderingParty(BaseModel):
    account: Optional[str] = None
    name: Optional[str] = None
    bic: Optional[str] = None


class BeneficiaryParty(BaseModel):
    account: Optional[str] = None
    name: Optional[str] = None
    bic: Optional[str] = None


class STPCheckRequest(BaseModel):
    transaction_reference: str = Field(..., description="MT field 20 (Sender's Reference)")
    bank_op_code: str = Field("CRED", description="MT field 23B (Bank Operation Code)")
    value_date: str = Field(..., description="MT field 32A date, YYYYMMDD or YYYY-MM-DD")
    currency: str = Field(..., description="MT field 32A currency code")
    interbank_amount: float = Field(..., gt=0, description="MT field 32A settled amount")
    charge_code: str = Field("SHA", description="MT field 71A — OUR / SHA / BEN")
    ordering: OrderingParty = Field(default_factory=OrderingParty, description="MT field 50K")
    beneficiary: BeneficiaryParty = Field(default_factory=BeneficiaryParty, description="MT field 59")
    uetr: Optional[str] = Field(None, description="MT field 121 (UETR)")

    @field_validator("currency")
    @classmethod
    def validate_ccy(cls, v):
        return validate_currency_code(v)

    @field_validator("charge_code")
    @classmethod
    def normalize_charge_code(cls, v):
        v = v.strip().upper()
        if v not in ("OUR", "SHA", "BEN"):
            raise ValueError("charge_code must be OUR, SHA, or BEN")
        return v


class STPFinding(BaseModel):
    field: str
    field_name: str
    severity: str  # error | warning | info
    code: str
    message: str
    repair: Optional[str] = None


class STPFieldSummary(BaseModel):
    field: str
    field_name: str
    present: bool
    valid: bool
    findings: int


class STPCheckResponse(BaseModel):
    verdict: str  # CLEAN | REPAIRABLE | REJECTED
    stp_passes: bool
    findings: List[STPFinding]
    field_summary: List[dict]
    disclaimer: str


# ---------------------------------------------------------------------------
# ISO 20022 (pacs.008) translation + validation
# ---------------------------------------------------------------------------


class TranslateRequest(BaseModel):
    transaction_reference: str = Field("", description="MT field 20")
    bank_op_code: str = Field("CRED", description="MT field 23B")
    value_date: str = Field("", description="MT field 32A date")
    currency: str = Field("", description="MT field 32A currency")
    interbank_amount: Optional[float] = Field(None, description="MT field 32A amount")
    charge_code: str = Field("SHA", description="MT field 71A")
    ordering: OrderingParty = Field(default_factory=OrderingParty)
    beneficiary: BeneficiaryParty = Field(default_factory=BeneficiaryParty)
    uetr: Optional[str] = Field(None, description="MT field 121")
    instructed_currency: Optional[str] = Field(None, description="MT field 33B currency")
    remittance: Optional[str] = Field(None, description="MT field 70")


class Pacs008MappingEntryModel(BaseModel):
    mt_tag: str
    mt_label: str
    iso_path: str
    iso_label: str
    value: str


class TranslateResponse(BaseModel):
    mapping: List[Pacs008MappingEntryModel]
    xml: str
    disclaimer: str


class Pacs008PostalAddress(BaseModel):
    street_name: str = ""
    town_name: str = ""
    country: str = ""


class Pacs008CheckRequest(BaseModel):
    debtor_name: str = ""
    debtor_agent_bic: str = ""
    creditor_name: str = ""
    creditor_agent_bic: str = ""
    creditor_postal_address: Pacs008PostalAddress = Field(default_factory=Pacs008PostalAddress)
    settlement_amount: Optional[float] = None
    settlement_currency: str = ""
    instructed_currency: Optional[str] = None


class Pacs008Finding(BaseModel):
    field: str
    field_name: str
    severity: str
    code: str
    message: str
    repair: Optional[str] = None


class Pacs008CheckResponse(BaseModel):
    verdict: str
    passes: bool
    findings: List[Pacs008Finding]
    disclaimer: str


# ---------------------------------------------------------------------------
# Progress & badges (learning platform dashboard)
# ---------------------------------------------------------------------------


class BadgeInfo(BaseModel):
    id: str
    name: str
    description: str
    requirement: str
    earned: bool


class ProgressResponse(BaseModel):
    completed_count: int
    total_count: int
    percentage: int
    earned_badges: List[BadgeInfo]
    next_recommended: Optional[str]
    all_badges: List[BadgeInfo]
