"""Read-only SSI data-quality rollups for the operator dashboard."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import SSI
from ..schemas import (
    SSIQualityBucket,
    SSIQualityQueueItem,
    SSIQualityResponse,
    SSIQualityTotals,
)
from .routing import _is_routable_ssi

_FRESHNESS_LABELS = ("0-30 days", "31-90 days", "91-180 days", ">180 days", "No source date")
_ISSUE_PRIORITY = {
    "missing-citation": 0,
    "future-source-date": 0,
    "published-without-verifier": 0,
    "stale-source": 1,
    "missing-source-date": 2,
    "unverified-status": 3,
    "terms-inferred": 4,
    "bic-only": 5,
    "illustrative": 6,
}


def _age_days(as_of: str | None, today: date) -> int | None:
    if not as_of:
        return None
    try:
        observed = date.fromisoformat(as_of)
    except ValueError:
        return None
    age = (today - observed).days
    return age if age >= 0 else None


def _issues(
    row: SSI,
    age_days: int | None,
    stale_after_days: int,
    review_date: date,
) -> list[str]:
    issues: list[str] = []
    if not row.notes or not row.notes.strip():
        issues.append("missing-citation")
    if row.as_of:
        try:
            if date.fromisoformat(row.as_of) > review_date:
                issues.append("future-source-date")
        except ValueError:
            issues.append("missing-source-date")
    else:
        issues.append("missing-source-date")
    if age_days is not None and age_days > stale_after_days:
        issues.append("stale-source")
    if row.status == "published" and not row.verified_by:
        issues.append("published-without-verifier")
    elif row.status == "unverified":
        issues.append("unverified-status")
    elif row.status == "illustrative":
        issues.append("illustrative")
    if row.terms_inferred:
        issues.append("terms-inferred")
    if row.bic_only:
        issues.append("bic-only")
    return issues


def build_quality_snapshot(
    session: Session,
    *,
    today: date | None = None,
    stale_after_days: int = 180,
    queue_limit: int = 50,
) -> SSIQualityResponse:
    """Build a source-backed quality snapshot using the live routing predicate."""
    review_date = today or datetime.now(timezone.utc).date()
    rows = list(session.execute(select(SSI).order_by(SSI.id)).scalars())

    status_counts = Counter(row.status for row in rows)
    freshness_counts = Counter()
    queue: list[tuple[int, SSIQualityQueueItem]] = []
    stale_rows = 0
    missing_source_date_rows = 0
    missing_citation_rows = 0

    for row in rows:
        age_days = _age_days(row.as_of, review_date)
        if age_days is None:
            freshness_counts["No source date"] += 1
            missing_source_date_rows += 1
        elif age_days <= 30:
            freshness_counts["0-30 days"] += 1
        elif age_days <= 90:
            freshness_counts["31-90 days"] += 1
        elif age_days <= 180:
            freshness_counts["91-180 days"] += 1
        else:
            freshness_counts[">180 days"] += 1

        if not row.notes or not row.notes.strip():
            missing_citation_rows += 1
        if age_days is not None and age_days > stale_after_days:
            stale_rows += 1

        issues = _issues(row, age_days, stale_after_days, review_date)
        if issues:
            item = SSIQualityQueueItem(
                beneficiary_bic=row.beneficiary_bic,
                beneficiary_bank_name=row.beneficiary_bank_name,
                currency=row.currency,
                intermediary_bic=row.intermediary_bic,
                intermediary_bank_name=row.intermediary_bank_name,
                status=row.status,
                bic_only=bool(row.bic_only),
                terms_inferred=bool(row.terms_inferred),
                as_of=row.as_of,
                age_days=age_days,
                issues=issues,
            )
            priority = min(_ISSUE_PRIORITY[issue] for issue in issues)
            queue.append((priority, item))

    queue.sort(key=lambda item: (item[0], item[1].beneficiary_bic, item[1].currency))
    freshness = [SSIQualityBucket(label=label, count=freshness_counts[label]) for label in _FRESHNESS_LABELS]
    totals = SSIQualityTotals(
        total_rows=len(rows),
        instruction_rows=sum(not row.bic_only for row in rows),
        bic_only_rows=sum(bool(row.bic_only) for row in rows),
        terms_inferred_rows=sum(bool(row.terms_inferred) for row in rows),
        routing_ready_rows=sum(_is_routable_ssi(row) for row in rows),
        published_rows=status_counts["published"],
        unverified_rows=status_counts["unverified"],
        archived_rows=status_counts["archived"],
        illustrative_rows=status_counts["illustrative"],
        stale_rows=stale_rows,
        missing_source_date_rows=missing_source_date_rows,
        missing_citation_rows=missing_citation_rows,
        unique_beneficiaries=len({row.beneficiary_bic for row in rows}),
        unique_intermediaries=len({row.intermediary_bic for row in rows}),
        currencies=len({row.currency for row in rows}),
    )
    return SSIQualityResponse(
        generated_at=review_date.isoformat(),
        stale_after_days=stale_after_days,
        totals=totals,
        freshness=freshness,
        queue=[item for _priority, item in queue[:queue_limit]],
        disclaimer=(
            "Quality signals describe this curated SSI corpus, not live bank availability. "
            "Routing-ready rows must still pass the same provenance and account gates used by production suggestions."
        ),
    )
