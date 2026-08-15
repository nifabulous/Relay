"""Pydantic v2 request/response schemas for the Relay AI tutor."""
from enum import Enum
from typing import List, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class TutorMode(str, Enum):
    CHAT = "chat"
    EXPLAIN = "explain"
    HINT = "hint"
    QUIZ = "quiz"


class TutorContext(BaseModel):
    surface: Literal["global", "lesson", "scheme", "tracking", "tool", "case"]
    module_id: Optional[str] = Field(default=None, max_length=100)
    module_title: Optional[str] = Field(default=None, max_length=200)
    topic: Optional[str] = Field(default=None, max_length=120)
    currency: Optional[str] = Field(default=None, max_length=20)
    rail_name: Optional[str] = Field(default=None, max_length=120)
    tool_name: Optional[str] = Field(default=None, max_length=120)
    case_id: Optional[str] = Field(default=None, max_length=120)
    resource_ref: Optional[str] = Field(default=None, max_length=160)
    result_summary: Optional[str] = Field(default=None, max_length=4000)


class TutorTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=3000)


class TutorRequest(BaseModel):
    message: str = Field(
        ..., min_length=1, max_length=2000, description="The learner's question"
    )
    mode: TutorMode = TutorMode.CHAT
    context: TutorContext
    history: List[TutorTurn] = Field(
        default_factory=list, max_length=8, description="Prior turns, oldest first"
    )


class TutorCitation(BaseModel):
    source_id: str = Field(..., min_length=1, max_length=160)
    title: str = Field(..., min_length=1, max_length=240)
    url: Optional[str] = Field(default=None, max_length=500)
    evidence: str = Field(..., min_length=1, max_length=500)


class TutorModelOutput(BaseModel):
    """What the language model is asked to produce — and nothing more.

    This is deliberately NOT the HTTP response type. It carries only fields a
    model can actually know. The server-owned fields (`mode`, `grounded`,
    `safety_notice`, `turn_id`) live on `TutorResponse`.

    If `TutorResponse` were the model's output type, the model would be asked
    to invent a `turn_id` UUID it cannot know, and to self-report `grounded`
    — which the server recomputes anyway after validating citations. Worse,
    `turn_id` is the key that feedback events join on, so a hallucinated one
    silently decorrelates telemetry: the feedback still arrives, still looks
    well-formed, and simply never matches the turn it describes.
    """

    answer: str = Field(..., min_length=1, max_length=6000)
    citations: List[TutorCitation] = Field(default_factory=list, max_length=8)
    follow_up: Optional[str] = Field(default=None, max_length=500)
    needs_clarification: bool = False


class TutorResponse(TutorModelOutput):
    """The HTTP response body: a validated `TutorModelOutput` plus server state.

    Compose it with `from_model_output()` rather than by hand, so the
    server-owned fields are always supplied by the server.
    """

    mode: TutorMode
    grounded: bool
    safety_notice: Optional[str] = Field(default=None, max_length=500)
    turn_id: str = Field(default_factory=lambda: str(uuid4()))

    @classmethod
    def from_model_output(
        cls,
        output: TutorModelOutput,
        mode: TutorMode,
        grounded: bool,
        safety_notice: Optional[str] = None,
    ) -> "TutorResponse":
        """Compose the HTTP response from a validated model output.

        The server owns `mode`, `grounded`, `safety_notice`, and `turn_id`;
        everything else is carried across from the model unchanged.
        """
        return cls(
            mode=mode,
            grounded=grounded,
            safety_notice=safety_notice,
            **output.model_dump(),
        )
