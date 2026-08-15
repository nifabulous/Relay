"""Telemetry endpoint — accepts anonymous learning events and returns metrics."""
from typing import List, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field, model_validator

from ..services.telemetry import compute_metrics

router = APIRouter(prefix="/api", tags=["swift"])

# Tutor feedback rides this contract rather than getting its own endpoint. A
# second endpoint would be a second place message text could be accepted, and
# the design goal is that there is nowhere to put it.
_TUTOR_FEEDBACK = "tutor_feedback"

# A closed enum, not a text field. An open "tell us why" box is a text input
# wired straight to the analytics pipeline, and learners paste account details
# into text boxes. Every reason a learner might give about a tutor answer fits
# one of these; anything that does not is a product question, not a data field.
TutorFeedbackReason = Literal[
    "not-grounded",
    "wrong-answer",
    "too-vague",
    "too-detailed",
    "off-topic",
    "unclear-citation",
    "helpful",
]


class TelemetryEvent(BaseModel):
    """A single anonymous learning interaction event."""
    type: str = Field(..., description="Event type: lab_viewed, lab_started, lab_completed, exercise_attempted, exercise_solved, tutor_feedback")
    lab_id: Optional[str] = Field(default=None, max_length=50, description="The lab/module ID this event relates to. Required for every event except tutor_feedback.")
    ts: str = Field(..., description="ISO 8601 timestamp of the event")

    # ── tutor_feedback only ─────────────────────────────────────────────────
    # Deliberately four bounded fields and no free text. `turn_id` is the join
    # key back to the tutor turn; nothing here can reconstruct what was asked.
    turn_id: Optional[str] = Field(
        default=None,
        max_length=64,
        # Lowercase-only, matching the frontend analytics allowlist
        # (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). An uppercased UUID would pass Pydantic
        # and then be dropped silently client-side, so the feedback would never
        # arrive and nobody would know. Rejecting it makes the mismatch visible.
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        description="The tutor turn this feedback refers to (lowercase UUID)",
    )
    rating: Optional[Literal["up", "down"]] = Field(default=None)
    surface: Optional[Literal["global", "lesson", "scheme", "tracking", "tool", "case"]] = Field(default=None)
    reason: Optional[TutorFeedbackReason] = Field(default=None)

    @model_validator(mode="after")
    def _check_shape_for_type(self) -> "TelemetryEvent":
        if self.type == _TUTOR_FEEDBACK:
            if not self.turn_id or not self.rating or not self.surface:
                raise ValueError("tutor_feedback requires turn_id, rating, and surface")
        elif not self.lab_id:
            # The pre-existing contract must not loosen for everyone else just
            # because a new event type does not have a lab.
            raise ValueError("lab_id is required for this event type")
        return self


@router.post("/telemetry")
def submit_telemetry(events: List[TelemetryEvent]):
    """
    Accept a batch of anonymous learning events and return computed metrics.

    All data is anonymous — no user IDs, no accounts, no PII.
    Events are collected client-side (localStorage) and batch-submitted.

    Returns derived learning-loop metrics: completion rate, drop-off point,
    average time-on-task, exercise success rate.
    """
    # Only lab events reach the metrics service. Feedback events are accepted
    # and validated here, then deliberately dropped: the learning-loop metrics
    # are about lab progression, and a tutor rating is not a step in it.
    raw_events = [
        {"type": e.type, "lab_id": e.lab_id, "ts": e.ts}
        for e in events
        if e.type != _TUTOR_FEEDBACK
    ]
    metrics = compute_metrics(raw_events)
    return metrics
