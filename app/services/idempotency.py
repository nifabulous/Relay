"""Idempotency key resolution for payment-creation endpoints.

Maps a client-supplied Idempotency-Key header to a stable UETR, so a retried
request returns the same result instead of duplicating the payment.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import IdempotencyKey

# Header contract, enforced by the routers' Header() declarations. The length
# matches IdempotencyKey.key (String(200)); visible ASCII only, no spaces.
IDEMPOTENCY_KEY_MAX_LENGTH = 200
IDEMPOTENCY_KEY_PATTERN = r"^[\x21-\x7e]*$"


class IdempotencyKeyConflict(ValueError):
    """The key is already bound to a different endpoint."""


class IdempotencyKeyInFlight(IdempotencyKeyConflict):
    """A concurrent request stored the key first and may still be running."""


def _stored(db: Session, key: str) -> Optional[IdempotencyKey]:
    return db.execute(
        select(IdempotencyKey).where(IdempotencyKey.key == key)
    ).scalar_one_or_none()


def resolve_uetr(
    db: Session, key: Optional[str], endpoint: str, generate_uetr
) -> str:
    """
    Look up an existing UETR by idempotency key, or generate a new one.

    Args:
        db: database session
        key: the Idempotency-Key header value (None = no key, generate fresh)
        endpoint: endpoint name for audit ("track/create" | "prepare-payment")
        generate_uetr: callable that returns a new UETR string (e.g. uuid4)

    Returns:
        The UETR to use for this request.

    Raises:
        IdempotencyKeyConflict: the key was first used on another endpoint, so
            replaying its UETR here would mix two different flows.
        IdempotencyKeyInFlight: a concurrent request stored the key first
            (a subclass of IdempotencyKeyConflict, so also a 409).
    """
    if not key:
        return generate_uetr()

    existing = _stored(db, key)
    if existing is None:
        # Generate a new UETR and store the mapping
        uetr = generate_uetr()
        db.add(IdempotencyKey(key=key, uetr=uetr, endpoint=endpoint))
        try:
            db.commit()
            return uetr
        except IntegrityError:
            # A concurrent first use stored the key between the lookup and
            # this insert. Its timeline is probably not written yet, so
            # replaying its UETR would write a second timeline; refuse instead.
            db.rollback()
            if _stored(db, key) is None:
                raise
            raise IdempotencyKeyInFlight(
                "A request with this Idempotency-Key is still in progress; retry shortly."
            )

    if existing.endpoint != endpoint:
        raise IdempotencyKeyConflict(
            "Idempotency-Key was already used for a different endpoint."
        )
    return existing.uetr
