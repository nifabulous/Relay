"""Progress & badges (learning platform dashboard)."""
from typing import Optional

from fastapi import APIRouter, Query

from ..schemas import BadgeInfo, ProgressResponse
from ..services.progress import (
    ALL_BADGES,
    get_progress_summary,
)

router = APIRouter(prefix="/api", tags=["swift"])


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
