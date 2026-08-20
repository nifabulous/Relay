"""SQLAlchemy models for the bank directory and the corridor routing table."""
from sqlalchemy import (
    DDL,
    Boolean,
    CheckConstraint,
    Column,
    Index,
    Integer,
    String,
    UniqueConstraint,
    event,
    text,
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


# A verifier is a name, and a name has at least one character that is not
# whitespace. Default TRIM() removes only spaces on both engines, so the set
# is spelled out: space, tab, CR, LF, and the non-breaking space — Python's
# str.strip() removes NBSP, and the database has to agree with Python or a
# raw-SQL write of a published row can carry a verifier the application
# calls empty. ltrim/rtrim with an explicit charset is the one trimmed
# comparison both engines share. The migration copies this verbatim — a test
# pins the two together so they cannot drift.
VERIFIER_IS_A_NAME = (
    "status != 'published' OR (verified_by IS NOT NULL AND "
    "ltrim(rtrim(verified_by, ' \t\n\r\u00a0'), ' \t\n\r\u00a0') != '')"
)


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
    # No Python-side default here, on purpose: SQLAlchemy applies a
    # Column(default=...) even when the attribute is explicitly None, which
    # would rewrite a bic_only row's absent charge/value date into "SHA"/
    # "spot" and trip ck_ssi_bic_only_has_no_accounts. Callers that want
    # defaults supply them (the importer and seed always do).
    charge_code = Column(String(3))  # OUR / SHA / BEN
    value_date = Column(String(10))  # same-day / spot / T+n
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
    # BIC-only rows assert *correspondent availability* only: the source (a
    # correspondent-bank-charges list, a names-only directory) says which
    # banks a beneficiary settles through but publishes no account numbers,
    # charge codes, or value dates for them. Such a row must not present any
    # of the fields it never established, routing must not select it as a
    # settlement instruction, and the frontend must not render it as one.
    # server_default is dialect-neutral text on purpose: `"0"` here compiles
    # to DEFAULT 0 on PostgreSQL, where an integer literal is not a Boolean
    # expression and the CREATE TABLE would fail. "false" is valid on both
    # engines (SQLite accepts FALSE as an alias for the integer 0).
    bic_only = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    # Snapshot of the row as last written by the curated seeder. It lets a
    # later source reconciliation distinguish an untouched machine row from
    # one an operator has corrected, without treating free-form notes as an
    # ownership flag.
    seed_fingerprint = Column(String(64))

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
        # therefore cannot produce the claim.
        #
        # The whitespace check has to name its set. Default TRIM() removes
        # only spaces on both engines, so a tab- or newline-only verifier
        # would pass "TRIM(verified_by) != ''" while Python's str.strip()
        # calls it empty — the database and the application disagreeing about
        # what a name is. ltrim/rtrim with an explicit charset is the one
        # trimmed comparison both engines share; the set is space, tab, CR,
        # LF, and a value of only those is not a name.
        CheckConstraint(VERIFIER_IS_A_NAME, name="ck_ssi_published_names_a_verifier"),
        # The reverse also holds: a verifier names who confirmed the bank
        # still publishes, which no other status claims, so it may only ride
        # on "published". Without this a raw SQL writer could leave an
        # attribution attached to a row the API reports as unverified.
        CheckConstraint(
            "status = 'published' OR verified_by IS NULL",
            name="ck_ssi_verifier_is_only_for_published",
        ),
        # BIC-only rows carry no account numbers, charge codes, or value
        # dates — none of those were published. Enforced in the schema so a
        # direct ORM/Core write cannot slip fabricated fields in next to a
        # "BIC-level only" claim.
        #
        # The leading test is `NOT bic_only`, NOT `bic_only = 0`: PostgreSQL
        # has no implicit integer-to-boolean coercion, so `bic_only = 0`
        # compiles to `boolean = integer`, which has no operator and aborts
        # CREATE TABLE/ALTER TABLE on the production engine. NOT works on
        # both engines.
        CheckConstraint(
            "NOT bic_only OR (intermediary_account IS NULL AND "
            "beneficiary_account IS NULL AND charge_code IS NULL AND "
            "value_date IS NULL)",
            name="ck_ssi_bic_only_has_no_accounts",
        ),
        # The mirror image of the constraint above: an ordinary row IS a
        # settlement instruction, and routing selects exactly these rows, so
        # it must carry the charge terms and settlement timing an instruction
        # needs. The seed and the importer always supply them; this catches a
        # direct ORM/Core write that would otherwise create a routable row
        # with no charge code or value date.
        #
        # The leading test is `bic_only`, the boolean itself: `bic_only = 1`
        # is `boolean = integer` on PostgreSQL (no operator, CREATE TABLE
        # aborts), while a bare boolean column is a valid operand of OR on
        # both engines.
        CheckConstraint(
            "bic_only OR (charge_code IS NOT NULL AND "
            "ltrim(rtrim(charge_code, ' \t\n\r\u00a0'), ' \t\n\r\u00a0') != '' AND "
            "value_date IS NOT NULL AND "
            "ltrim(rtrim(value_date, ' \t\n\r\u00a0'), ' \t\n\r\u00a0') != '')",
            name="ck_ssi_ordinary_has_settlement_terms",
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
    from .ssi_terms import (
        VALID_CHARGE_CODES,
        VALID_VALUE_DATES,
        normalize_charge_code,
        normalize_value_date,
    )

    # A Column default is applied when the INSERT is compiled, which is after
    # this hook runs, so an unset status arrives here as None. Apply it now
    # rather than rejecting a row that would have defaulted correctly.
    if target.status is None:
        target.status = "illustrative"

    target.charge_code = normalize_charge_code(target.charge_code)
    if target.charge_code is not None and target.charge_code not in VALID_CHARGE_CODES:
        raise ValueError(
            f"SSI.charge_code {target.charge_code!r} must be one of "
            f"{sorted(VALID_CHARGE_CODES)}"
        )
    target.value_date = normalize_value_date(target.value_date)
    if target.value_date is not None and target.value_date not in VALID_VALUE_DATES:
        raise ValueError(
            f"SSI.value_date {target.value_date!r} must be one of "
            f"{sorted(VALID_VALUE_DATES)}"
        )

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

    if target.status == "published":
        # Downgraded, not rejected. A caller setting "published" without a
        # verifier is usually copying a field forward rather than asserting it
        # checked the bank today; failing the write would break that caller for
        # no gain, while storing an unattributable claim would be a lie.
        #
        # What this enforces is attribution, not authorisation. A caller that
        # does name a verifier is taken at its word, because nothing at this
        # layer can tell research from any other writer — an audit trail records
        # who claimed something, and preventing a false claim needs an
        # authenticated identity that only the service layer has.
        if not target.verified_by:
            target.status = "unverified"
        elif not target.as_of:
            raise ValueError(
                "SSI.status 'published' requires as_of, the date currency was verified"
            )
    elif target.verified_by:
        # A verifier names who confirmed the bank still publishes; no other
        # status claims that, so an attribution riding on one is misleading
        # the API's consumers. Cleared rather than refused, so a caller that
        # copies the field forward on an unrelated status edit still succeeds
        # — same philosophy as the downgrade above. The CHECK backstops this
        # for Core, bulk and raw SQL, which skip this listener.
        target.verified_by = None

event.listen(SSI, "before_insert", _validate_ssi_provenance)
event.listen(SSI, "before_update", _validate_ssi_provenance)


def record_verified_publication(row: "SSI", verified_by: str, verified_on: str) -> "SSI":
    """Promote a row to "published", validating what the claim requires.

    This is the intended way to publish, not an enforced one: it checks that a
    verifier is named and that the date is a real, non-future day, so a caller
    using it cannot record an incoherent claim. A caller that sets the fields
    by hand is not stopped — see _validate_ssi_provenance for why that is an
    attribution model rather than an authorisation one.
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
# Year 0000 needs its own clause: SQLite round-trips '0000-01-01' happily while
# datetime.date rejects it as out of range, which would leave a row the
# database accepted and the application could never validate or update again.
#
# as_of is a UTC calendar date, and that is the whole timezone policy. Both
# layers ask the same clock: SQLite's date('now') is UTC, the Postgres branch
# converts explicitly because CURRENT_DATE there follows the session TimeZone
# and would drift from the policy near midnight, and the Python validators use
# datetime.now(timezone.utc).date(). An earlier version gave
# the trigger a day of slack to paper over a local-vs-UTC mismatch, which left
# the database accepting a date Python rejected — two rules instead of one.
_SQLITE_AS_OF_CONDITION = (
    "NEW.as_of IS NOT NULL AND ("
    "date(NEW.as_of) IS NULL OR date(NEW.as_of) != NEW.as_of "
    "OR NEW.as_of < '0001-01-01' OR NEW.as_of > date('now'))"
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
              IF NEW.as_of < '0001-01-01'
                 OR to_char(NEW.as_of::date, 'YYYY-MM-DD') <> NEW.as_of
                 OR NEW.as_of::date > ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date) THEN
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
