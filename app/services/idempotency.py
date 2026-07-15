"""Idempotency key resolution for payment-creation endpoints.

Maps a client-supplied Idempotency-Key header to a stable UETR, so a retried
request returns the same result instead of duplicating the payment.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import IdempotencyKey


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
    """
    if not key:
        return generate_uetr()

    existing = db.execute(
        select(IdempotencyKey).where(IdempotencyKey.key == key)
    ).scalar_one_or_none()

    if existing:
        return existing.uetr

    # Generate a new UETR and store the mapping
    uetr = generate_uetr()
    db.add(IdempotencyKey(key=key, uetr=uetr, endpoint=endpoint))
    db.commit()
    return uetr
