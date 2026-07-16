"""Telemetry endpoint — accepts anonymous learning events and returns metrics."""
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services.telemetry import compute_metrics

router = APIRouter(prefix="/api", tags=["swift"])


class TelemetryEvent(BaseModel):
    """A single anonymous learning interaction event."""
    type: str = Field(..., description="Event type: lab_viewed, lab_started, lab_completed, exercise_attempted, exercise_solved")
    lab_id: str = Field(..., max_length=50, description="The lab/module ID this event relates to")
    ts: str = Field(..., description="ISO 8601 timestamp of the event")


@router.post("/telemetry")
def submit_telemetry(events: List[TelemetryEvent]):
    """
    Accept a batch of anonymous learning events and return computed metrics.

    All data is anonymous — no user IDs, no accounts, no PII.
    Events are collected client-side (localStorage) and batch-submitted.

    Returns derived learning-loop metrics: completion rate, drop-off point,
    average time-on-task, exercise success rate.
    """
    raw_events = [
        {"type": e.type, "lab_id": e.lab_id, "ts": e.ts}
        for e in events
    ]
    metrics = compute_metrics(raw_events)
    return metrics
