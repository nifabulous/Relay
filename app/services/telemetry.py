"""
Telemetry / learning-analytics service.

Processes anonymous lab interaction events to compute learning-loop metrics:
- Completion rate (lab_completed / lab_started)
- Drop-off point (last lab started but not completed)
- Average time-on-task (lab_started → lab_completed duration)
- Exercise success rate (exercise_solved / exercise_attempted)
- Labs viewed (unique lab_viewed count)

Events are collected client-side (localStorage) and sent to the server
for aggregation. All data is anonymous — no user IDs, no accounts.

5 event types: lab_viewed, lab_started, lab_completed,
exercise_attempted, exercise_solved.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _parse_ts(ts: str) -> Optional[datetime]:
    """Parse an ISO 8601 timestamp string. Returns None on failure."""
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def compute_metrics(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compute learning-loop metrics from a list of telemetry events.

    Each event is a dict with: type, lab_id, ts (ISO 8601).
    Returns a dict of derived metrics. Empty input returns None metrics.
    """
    if not events:
        return {
            "completion_rate": None,
            "drop_off_lab": None,
            "avg_lab_duration_seconds": None,
            "exercise_success_rate": None,
            "labs_viewed": 0,
            "total_views": 0,
        }

    # Group events by type
    started_labs: List[str] = []
    completed_labs: List[str] = []
    viewed_labs: set = set()
    exercise_attempts = 0
    exercise_solves = 0

    # Track start times for duration computation
    start_times: Dict[str, datetime] = {}
    durations: List[float] = []

    for event in events:
        etype = event.get("type", "")
        lab_id = event.get("lab_id", "")
        ts = _parse_ts(event.get("ts", ""))

        if etype == "lab_started":
            started_labs.append(lab_id)
            if ts and lab_id:
                start_times[lab_id] = ts
        elif etype == "lab_completed":
            completed_labs.append(lab_id)
            if ts and lab_id in start_times:
                delta = (ts - start_times[lab_id]).total_seconds()
                if delta > 0:
                    durations.append(delta)
        elif etype == "lab_viewed":
            viewed_labs.add(lab_id)
        elif etype == "exercise_attempted":
            exercise_attempts += 1
        elif etype == "exercise_solved":
            exercise_solves += 1

    # Completion rate
    unique_started = set(started_labs)
    unique_completed = set(completed_labs)
    if unique_started:
        completion_rate = len(unique_completed & unique_started) / len(unique_started)
    else:
        completion_rate = None

    # Drop-off point: last lab started but not completed (by event order)
    drop_off_lab = None
    completed_set = set(completed_labs)
    for lab_id in reversed(started_labs):
        if lab_id not in completed_set:
            drop_off_lab = lab_id
            break

    # Average lab duration
    avg_duration = sum(durations) / len(durations) if durations else None

    # Exercise success rate
    if exercise_attempts > 0:
        exercise_success_rate = exercise_solves / exercise_attempts
    else:
        exercise_success_rate = None

    return {
        "completion_rate": round(completion_rate, 4) if completion_rate is not None else None,
        "drop_off_lab": drop_off_lab,
        "avg_lab_duration_seconds": round(avg_duration) if avg_duration is not None else None,
        "exercise_success_rate": round(exercise_success_rate, 4) if exercise_success_rate is not None else None,
        "labs_viewed": len(viewed_labs),
        "total_views": sum(1 for e in events if e.get("type") == "lab_viewed"),
    }
