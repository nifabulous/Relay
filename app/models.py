"""SQLAlchemy models for the bank directory and the corridor routing table."""
from sqlalchemy import CheckConstraint, Column, Index, Integer, String, UniqueConstraint

from .db import Base


class Bank(Base):
    """A bank identified by its BIC. Seeded with a starter directory."""

    __tablename__ = "banks"

    id = Column(Integer, primary_key=True)
    bic = Column(String(11), unique=True, nullable=False, index=True)
    # Store both 8- and 11-char forms; queries normalize by prefix.
    bank_name = Column(String(200), nullable=False)
    country_code = Column(String(2), nullable=False, index=True)
    city = Column(String(100))
    country_currency = Column(String(3))  # e.g. NG for Nigeria -> NGN
    swift_active = Column(String(1), default="Y")  # Y/N from directory

    __table_args__ = (Index("ix_banks_country", "country_code"),)


class CorridorRule(Base):
    """
    A curated routing rule: for a given destination currency/country,
    which intermediary BIC(s) typically clear the payment.

    confidence: 'high' | 'medium' | 'low'
    rank: ordering within a corridor (1 = primary)
    """

    __tablename__ = "corridor_rules"

    id = Column(Integer, primary_key=True)
    destination_currency = Column(String(3), nullable=False, index=True)
    destination_country = Column(String(2))  # optional narrowing
    intermediary_bic = Column(String(11), nullable=False)
    intermediary_name = Column(String(200), nullable=False)
    corridor = Column(String(20), nullable=False)  # e.g. "USD->NG"
    confidence = Column(String(10), default="medium")
    rank = Column(Integer, default=1)

    __table_args__ = (
        Index("ix_corridor_ccy_country", "destination_currency", "destination_country"),
    )


class FedwireBank(Base):
    """
    A bank from the Federal Reserve Fedwire Funds Service directory.

    Sourced from the FRB E-Payments Routing Directory (public, free).
    This covers ~7,500 US banks eligible to send/receive Fedwire funds
    transfers — the backbone of USD domestic wire routing.
    """

    __tablename__ = "fedwire_banks"

    id = Column(Integer, primary_key=True)
    routing_number = Column(String(9), nullable=False, index=True)
    telegraphic_name = Column(String(18))  # short name used on wire messages
    customer_name = Column(String(36))
    state_code = Column(String(2))
    city = Column(String(25))
    funds_transfer = Column(String(1))  # Y/N — eligible for Fedwire Funds
    settlement_only = Column(String(1))  # Y/N
    book_entry = Column(String(1))  # Y/N — Fedwire Securities
    date_of_last_revision = Column(String(8))  # YYYYMMDD

    __table_args__ = (Index("ix_fedwire_rtn", "routing_number"),)


class FedACHBank(Base):
    """
    A bank from the FedACH directory (ACH routing).

    Larger dataset (~25,000) covering ACH-eligible institutions.
    """

    __tablename__ = "fedach_banks"

    id = Column(Integer, primary_key=True)
    routing_number = Column(String(9), nullable=False, index=True)
    office_code = Column(String(1))  # O=main, B=branch
    servicing_frb_number = Column(String(9))
    record_type_code = Column(String(1))
    revised = Column(String(1))
    customer_name = Column(String(36))
    address = Column(String(36))
    city = Column(String(20))
    state_code = Column(String(2))
    zip_code = Column(String(9))
    zip_extension = Column(String(4))
    phone_area_code = Column(String(3))
    phone_prefix = Column(String(3))
    phone_suffix = Column(String(4))
    status_code = Column(String(1))  # 1=active, 2=not
    view_code = Column(String(1))

    __table_args__ = (Index("ix_fedach_rtn", "routing_number"),)


class SSI(Base):
    """
    A Standard Settlement Instruction — how to settle a payment in a given
    currency to a given beneficiary bank.

    Unlike the heuristic CorridorRule, an SSI carries the *actual* account
    numbers that make a payment land:
      - intermediary_account: the Nostro account the intermediary holds for
        the beneficiary bank (i.e. "send funds here, at the correspondent").
      - beneficiary_account: the credit-to account at the beneficiary bank.
      - charge_code: OUR (sender pays all fees), SHA (shared), BEN (beneficiary pays).
      - value_date: settlement timing (same-day / spot / T+n).
      - status: whether the instruction came from the bank's live page
        ("published"), an archived snapshot ("archived"), or neither
        ("illustrative"). An archived instruction may no longer be current.

    NOTE: account numbers in the seed data are ILLUSTRATIVE placeholders.
    Real SSI data is bank-specific, changes over time, and must be sourced
    from each bank's published treasury/correspondent-banking page or from
    a licensed feed (Accuity, SWIFTRef). Never wire funds using seed data.
    """

    __tablename__ = "ssi"

    id = Column(Integer, primary_key=True)
    beneficiary_bic = Column(String(11), nullable=False, index=True)
    beneficiary_bank_name = Column(String(200))
    currency = Column(String(3), nullable=False, index=True)
    intermediary_bic = Column(String(11), nullable=False)
    intermediary_bank_name = Column(String(200))
    intermediary_account = Column(String(34))  # Nostro account at intermediary
    beneficiary_account = Column(String(34))   # credit-to account
    charge_code = Column(String(3), default="SHA")  # OUR / SHA / BEN
    value_date = Column(String(10), default="spot")  # same-day / spot / T+n
    notes = Column(String(500))
    # Provenance. `status` records HOW the instruction was obtained, not how old
    # it is: "published" read from the bank's live page, "archived" read from a
    # point-in-time snapshot, "illustrative" not sourced from a bank at all.
    # There is no age threshold anywhere — the distinction is evidential.
    as_of = Column(String(10))                       # source date, when stated
    status = Column(String(12), nullable=False, default="illustrative")

    __table_args__ = (
        Index("ix_ssi_bic_ccy", "beneficiary_bic", "currency"),
        UniqueConstraint("beneficiary_bic", "currency", "intermediary_bic",
                         name="uq_ssi_composite"),
        # The validator in the autopilot is not the only writer: /api/import/ssi
        # and any direct session.add() land here too. Constrain the value where
        # it is stored, not only where it is generated.
        CheckConstraint(
            "status IN ('published', 'archived', 'illustrative')",
            name="ck_ssi_status",
        ),
    )


class Account(Base):
    """
    An account-holder record — what a receiving bank's customer registry
    looks like for Verification of Payee (VoP).

    In production this would be the bank's core banking system / CIF.
    Here it's a stand-in: given an IBAN, look up the registered holder
    name so we can compare it to the payer's submitted name.

    NOTE: these are synthetic records for development. A real VoP deployment
    queries the receiving bank's live customer database via the scheme
    directory (EPC VoP, UK CoP, etc.).
    """

    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    iban = Column(String(34), nullable=False, unique=True, index=True)
    account_holder_name = Column(String(200), nullable=False)
    bic = Column(String(11))  # the holding bank's BIC
    country_code = Column(String(2), index=True)
    account_type = Column(String(20), default="personal")  # personal | business


class PaymentEvent(Base):
    """
    A status event in a payment's journey — one row per status update per
    bank in the correspondent chain. Together they form the UETR timeline.

    UETR (Unique End-to-End Transaction Reference) is a 36-char UUID assigned
    by the originator bank, embedded in MT103 field 121 / pacs.008. It uniquely
    identifies the payment across the entire SWIFT gpi chain.

    Status codes follow SWIFT gpi conventions:
      INITIATED  — originator bank created the payment
      ACCEPTED   — intermediary/receiver acknowledged receipt
      IN_PROGRESS — bank is processing
      FORWARDED  — bank debited Nostro, forwarded to next hop
      CREDITED   — beneficiary bank credited the final account
      REJECTED   — a bank rejected (compliance, bad details, etc.)
      RETURNED   — payment returned to originator

    NOTE: In production, these events arrive as SWIFT gpi tracker / confirmation
    messages from each bank in the chain. Here we simulate them.
    """

    __tablename__ = "payment_events"

    id = Column(Integer, primary_key=True)
    uetr = Column(String(36), nullable=False, index=True)
    status = Column(String(20), nullable=False)  # INITIATED/ACCEPTED/etc
    bank_bic = Column(String(11), nullable=False)  # the bank reporting this event
    bank_name = Column(String(200))
    hop = Column(Integer, default=0)  # position in the chain (0=originator)
    timestamp = Column(String(30), nullable=False)  # ISO 8601
    amount = Column(String(20))  # amount at this hop (may decrease due to fees)
    currency = Column(String(3))
    charge_code = Column(String(3))  # OUR/SHA/BEN at this hop
    message = Column(String(500))  # human-readable detail
    instructing_bic = Column(String(11))  # who sent to this bank
    instructed_bic = Column(String(11))  # who this bank forwards to
    schedule = Column(String(10), nullable=False, default="instant", server_default="instant")  # instant | scheduled
    revealed_at = Column(String(30))  # ISO UTC, set when a scheduled event is manually exposed

    __table_args__ = (
        Index("ix_payment_uetr_hop", "uetr", "hop"),
    )


class IdempotencyKey(Base):
    """
    Maps a client-supplied Idempotency-Key to a generated UETR, so a retried
    request after a network blip returns the same UETR instead of duplicating
    the payment.
    """

    __tablename__ = "idempotency_keys"

    id = Column(Integer, primary_key=True)
    key = Column(String(200), nullable=False, unique=True, index=True)
    uetr = Column(String(36), nullable=False, index=True)
    endpoint = Column(String(50), nullable=False)  # track/create | prepare-payment
