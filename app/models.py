"""SQLAlchemy models for the bank directory and the corridor routing table."""
from sqlalchemy import (
    DDL,
    CheckConstraint,
    Column,
    Index,
    Integer,
    String,
    UniqueConstraint,
    event,
)

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
      - status: what is actually known about the source. "published" means
        someone verified the bank still publishes it; "unverified" means a bank
        document was read but its currency was never re-checked; "archived"
        means a point-in-time snapshot; "illustrative" means no bank source.
        Only "published" asserts currency, and nothing in the seed data earns
        it — absence of archive evidence is not evidence a page is live.

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
    # Provenance. `status` records what is known about the source, never how
    # old it is; there is no age threshold anywhere. A sourced status must be
    # backed by a citation in `notes`, which the CHECK below enforces.
    # Deliberately nullable, and deliberately NOT required for "archived":
    # 181 of the archived rows cite only a year ("2021 archive"). A constraint
    # demanding a full date would be satisfied by inventing a day and month,
    # which is the fabrication this column exists to prevent. When the exact
    # date is known it is stored; when only a year is known the citation in
    # `notes` carries it and this stays null.
    as_of = Column(String(10))                       # source date, when stated
    # Who confirmed the bank still publishes this, for status "published"
    # only. It is the difference between a claim and an audit trail: a caller
    # that cannot name a verifier is not making a verified claim, and the
    # listener downgrades it rather than storing one.
    verified_by = Column(String(120))
    status = Column(String(12), nullable=False, default="illustrative")

    __table_args__ = (
        Index("ix_ssi_bic_ccy", "beneficiary_bic", "currency"),
        UniqueConstraint("beneficiary_bic", "currency", "intermediary_bic",
                         name="uq_ssi_composite"),
        # The validator in the autopilot is not the only writer: /api/import/ssi
        # and any direct session.add() land here too. Constrain the value where
        # it is stored, not only where it is generated.
        CheckConstraint(
            "status IN ('published', 'unverified', 'archived', 'illustrative')",
            name="ck_ssi_status",
        ),
        # A status that claims a bank document was read must carry the citation
        # backing it. Without this, /api/import/ssi or a direct session.add()
        # can store an authoritative-looking row with no provenance at all.
        CheckConstraint(
            "status = 'illustrative' OR (notes IS NOT NULL AND notes != '')",
            name="ck_ssi_sourced_status_has_notes",
        ),
        # as_of must at least be ISO-shaped to the database itself. Mapper
        # events cover ORM writes but not Core inserts, bulk operations or raw
        # SQL, so this is the only rule those paths still obey.
        #
        # LIKE with `_` is the strictest test both engines share. An earlier
        # version used SQLite's GLOB with digit classes, which create_all
        # emitted verbatim on Postgres, where GLOB is not an operator — the
        # tests never caught it because they build the schema on SQLite. The
        # migration uses this identical expression so the two cannot diverge
        # again.
        #
        # What this cannot promise: digits rather than letters, a real calendar
        # date ("2024-02-30" passes), and recency. SQLite refuses date('now')
        # in a CHECK as non-deterministic and Postgres requires CHECK functions
        # to be IMMUTABLE, so the bound is not expressible in either. Those
        # rules live in the listener below and in the Pydantic validators.
        CheckConstraint(
            "as_of IS NULL OR as_of LIKE '____-__-__'",
            name="ck_ssi_as_of_is_a_past_iso_date",
        ),
        # "published" asserts someone verified currency; as_of is the date of
        # that check. Enforced here as well as in the schema because a direct
        # ORM write never passes through Pydantic.
        CheckConstraint(
            "status != 'published' OR (as_of IS NOT NULL AND as_of != '')",
            name="ck_ssi_published_has_verification_date",
        ),
        # "published" is the only status asserting present-tense currency, so
        # it must name who established it. Generic writers do not set this and
        # therefore cannot produce the claim. TRIM, because "   " is not a
        # name and an unattributable published row is the thing being
        # prevented; TRIM is standard SQL on both engines.
        CheckConstraint(
            "status != 'published' OR (verified_by IS NOT NULL AND TRIM(verified_by) != '')",
            name="ck_ssi_published_names_a_verifier",
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


def _provenance_is_being_assigned(target: "SSI") -> bool:
    """True when this flush writes the provenance, not merely carries it.

    An INSERT always does. An UPDATE only does when something touched status
    or verified_by; a row loaded and edited elsewhere reports no change, and
    its existing provenance must be left alone — checking unconditionally is
    what made an unrelated edit silently downgrade a verified row.

    verified_by and as_of count as well as status: rewriting the attribution
    or the date on an already-published row is a fresh claim about who checked
    and when, which is exactly the audit trail these columns exist to keep.
    """
    from sqlalchemy import inspect as _inspect

    try:
        state = _inspect(target)
        return (
            state.attrs.status.history.has_changes()
            or state.attrs.verified_by.history.has_changes()
            or state.attrs.as_of.history.has_changes()
        )
    except Exception:  # detached or not yet instrumented: treat as an assignment
        return True


def _validate_ssi_provenance(mapper, connection, target: "SSI") -> None:
    """Hold the provenance invariants for every ORM write.

    The Pydantic validators only see request bodies. seed.py, the SSI importer
    and any other caller construct SSI objects directly, so the same rules have
    to hold here.

    The CHECK constraints are a partial backstop, not a full one: they catch a
    missing status, a missing citation, a missing verification date and a
    malformed as_of, because a CHECK can express those. They cannot catch a
    future date — SQLite refuses date('now') as non-deterministic and Postgres
    requires CHECK functions to be IMMUTABLE — so recency is enforced only
    here, and a Core insert, a bulk operation or raw SQL can still store one.

    This constrains the *data*, not the caller: nothing at this layer can tell
    research from any other writer. Keeping "published" honest against a caller
    with database access is not something the database can do for you.
    """
    from datetime import datetime as _datetime
    from datetime import timezone as _timezone

    from .schemas import SSI_STATUSES

    # A Column default is applied when the INSERT is compiled, which is after
    # this hook runs, so an unset status arrives here as None. Apply it now
    # rather than rejecting a row that would have defaulted correctly.
    if target.status is None:
        target.status = "illustrative"

    if target.status not in SSI_STATUSES:
        raise ValueError(
            f"SSI.status {target.status!r} must be one of {sorted(SSI_STATUSES)}"
        )
    if target.as_of:
        try:
            parsed = _datetime.fromisoformat(target.as_of).date()
        except (TypeError, ValueError):
            raise ValueError(
                f"SSI.as_of {target.as_of!r} must be an ISO date (YYYY-MM-DD)"
            ) from None
        # fromisoformat also takes compact and week forms, which the shape
        # CHECK rejects; accepting them here would defer the failure to flush.
        if parsed.isoformat() != target.as_of:
            raise ValueError(
                f"SSI.as_of {target.as_of!r} must be written as YYYY-MM-DD"
            )
        if parsed > _datetime.now(_timezone.utc).date():
            raise ValueError(
                f"SSI.as_of {target.as_of} is in the future; a source cannot have been read yet"
            )
    # A verifier made only of spaces is not a name. Normalise before the
    # truthiness test below decides whether one was supplied at all.
    if target.verified_by is not None:
        target.verified_by = target.verified_by.strip() or None

    # Only when the status is actually being set to "published" in this flush.
    # The marker is transient, so it is absent on every row loaded back from
    # the database; checking it unconditionally meant that editing an unrelated
    # field on a verified row silently downgraded it and orphaned verified_by.
    if target.status == "published" and _provenance_is_being_assigned(target):
        # Downgraded, not rejected. A generic caller setting "published" is
        # usually copying a field forward, not asserting it verified the bank
        # today; failing the write would break that caller for no gain, while
        # storing the claim would be a lie.
        #
        # The test is the promotion marker, not the presence of verified_by: a
        # caller that fills in a plausible-looking verifier has still not done
        # any verifying. Only record_verified_publication() sets the marker,
        # so it is the only way a row reaches the database as published.
        # Consumed here, not merely read. Left set, it would authorise every
        # later write on the same instance — one verification standing in for
        # any number of subsequent edits to the attribution or the date.
        promoted = getattr(target, _PROMOTION_MARKER, False)
        if promoted:
            delattr(target, _PROMOTION_MARKER)
        if not promoted or not target.verified_by:
            target.status = "unverified"
            # A rejected claim must not leave its claimed verifier behind: the
            # API returns this field, and an unverified row naming someone is
            # worse than one naming nobody.
            target.verified_by = None
        elif not target.as_of:
            raise ValueError(
                "SSI.status 'published' requires as_of, the date currency was verified"
            )


event.listen(SSI, "before_insert", _validate_ssi_provenance)
event.listen(SSI, "before_update", _validate_ssi_provenance)


# Set only by record_verified_publication(). A transient instance attribute,
# not a column: it records how this write was made, which is not a property of
# the row and has no business being stored.
_PROMOTION_MARKER = "_ssi_promoted_by_verification"


def record_verified_publication(row: "SSI", verified_by: str, verified_on: str) -> "SSI":
    """Promote a row to "published" — the only supported way to do it.

    Every other path downgrades the status, so this function is what separates
    "someone typed published" from "someone checked the bank's page and said
    so". It records who did the checking and when; both are required.
    """
    from datetime import date as _date
    from datetime import datetime as _datetime
    from datetime import timezone as _timezone

    if not verified_by or not verified_by.strip():
        raise ValueError("record_verified_publication requires a verifier")
    parsed = _date.fromisoformat(verified_on)
    if parsed.isoformat() != verified_on:
        raise ValueError(f"verified_on must be written as YYYY-MM-DD, got {verified_on!r}")
    if parsed > _datetime.now(_timezone.utc).date():
        raise ValueError(f"verified_on {verified_on} is in the future")
    row.status = "published"
    row.verified_by = verified_by.strip()
    row.as_of = verified_on
    setattr(row, _PROMOTION_MARKER, True)
    return row


# ── as_of enforcement that survives Core, bulk and raw SQL ──────────────────
# A CHECK cannot host these rules: SQLite calls date('now') non-deterministic
# and Postgres requires CHECK functions to be IMMUTABLE. A trigger may, on both.
#
# Defined here rather than only in the migration so create_all() installs them
# too — the test suite builds its schema that way, so a migration-only trigger
# is a rule no test ever exercises. The migration imports these same strings;
# a test pins the two together.
SSI_AS_OF_MESSAGE = "as_of must be a real calendar date, in the past, written YYYY-MM-DD"

# date() yields NULL for nonsense and silently normalises an impossible date
# (2024-02-30 -> 2024-03-01), so the round-trip comparison is what rejects it.
#
# as_of is a UTC calendar date, and that is the whole timezone policy. Both
# layers ask the same clock: these functions are UTC, and the Python
# validators use datetime.now(timezone.utc).date(). An earlier version gave
# the trigger a day of slack to paper over a local-vs-UTC mismatch, which left
# the database accepting a date Python rejected — two rules instead of one.
_SQLITE_AS_OF_CONDITION = (
    "NEW.as_of IS NOT NULL AND ("
    "date(NEW.as_of) IS NULL OR date(NEW.as_of) != NEW.as_of "
    "OR NEW.as_of > date('now'))"
)
SSI_AS_OF_SQLITE = [
    f"""CREATE TRIGGER ssi_as_of_insert BEFORE INSERT ON ssi
        WHEN {_SQLITE_AS_OF_CONDITION}
        BEGIN SELECT RAISE(ABORT, '{SSI_AS_OF_MESSAGE}'); END""",
    f"""CREATE TRIGGER ssi_as_of_update BEFORE UPDATE ON ssi
        WHEN {_SQLITE_AS_OF_CONDITION}
        BEGIN SELECT RAISE(ABORT, '{SSI_AS_OF_MESSAGE}'); END""",
]
SSI_AS_OF_POSTGRES = [
    f"""CREATE OR REPLACE FUNCTION ssi_as_of_is_real_and_past() RETURNS trigger AS $$
        BEGIN
          IF NEW.as_of IS NOT NULL THEN
            IF NEW.as_of !~ '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}$' THEN
              RAISE EXCEPTION '{SSI_AS_OF_MESSAGE}';
            END IF;
            BEGIN
              IF to_char(NEW.as_of::date, 'YYYY-MM-DD') <> NEW.as_of
                 OR NEW.as_of::date > CURRENT_DATE THEN
                RAISE EXCEPTION '{SSI_AS_OF_MESSAGE}';
              END IF;
            EXCEPTION WHEN others THEN
              RAISE EXCEPTION '{SSI_AS_OF_MESSAGE}';
            END;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql""",
    """CREATE TRIGGER ssi_as_of_insert BEFORE INSERT ON ssi
       FOR EACH ROW EXECUTE FUNCTION ssi_as_of_is_real_and_past()""",
    """CREATE TRIGGER ssi_as_of_update BEFORE UPDATE ON ssi
       FOR EACH ROW EXECUTE FUNCTION ssi_as_of_is_real_and_past()""",
]

for _statement in SSI_AS_OF_SQLITE:
    event.listen(SSI.__table__, "after_create", DDL(_statement).execute_if(dialect="sqlite"))
for _statement in SSI_AS_OF_POSTGRES:
    event.listen(SSI.__table__, "after_create", DDL(_statement).execute_if(dialect="postgresql"))
