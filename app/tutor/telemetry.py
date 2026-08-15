"""Privacy-safe tracing for tutor runs.

The operator need and the learner's privacy pull in opposite directions here,
and the resolution is what gets recorded. An operator investigating a bad answer
needs to know **which sources grounded it**, how long it took, whether it was
grounded at all, and how it failed. None of that requires the learner's text.
Source IDs are catalogue identifiers that were never private, so recording them
gives full diagnostic power at zero privacy cost.

**The exclusion is structural, not a filter.** There is no field on
`TutorRunEvent` for a message, an answer, a result summary, or retrieved text,
and `record_run` takes keyword arguments only — a caller that tries to attach the
learner's question gets a `TypeError` rather than silently succeeding. A
redaction step here would be something a future caller can forget; a missing
field is not.

**Telemetry never breaks a request.** A tracing backend that is down,
misconfigured, or slow costs the learner nothing: sink failures are swallowed.
The alternative is a 500 on a perfectly good tutor answer because an
observability service had an outage.
"""
import logging
from dataclasses import asdict, dataclass, field
from typing import Callable, Dict, List, Optional

from app.config import tutor_settings

logger = logging.getLogger(__name__)

# One event should never grow unbounded. Retrieval is capped well below this, so
# hitting the limit means something upstream changed rather than a normal run.
_MAX_RECORDED_SOURCE_IDS = 16


@dataclass(frozen=True)
class TutorRunEvent:
    """Everything recorded about one tutor turn.

    Read the field list as the privacy contract: it is the complete set. Adding
    learner text means adding a field, which is a visible change in a diff
    rather than a filter that stopped being applied.
    """

    turn_id: str
    mode: str
    surface: str
    model: str
    source_ids: List[str]
    retrieved_count: int
    latency_ms: float
    grounded: bool
    truncated_history: bool = False
    truncated_evidence: bool = False
    # The exception *class*, never its message. Provider error text routinely
    # carries request IDs, quota details, or an echo of the prompt — which would
    # turn an error log into a partial transcript.
    error_class: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    tags: Dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, object]:
        return asdict(self)


TutorTelemetrySink = Callable[[TutorRunEvent], None]


def _no_op_sink(event: TutorRunEvent) -> None:
    """The default. Callers need no branch of their own for "tracing is off"."""


class TutorTelemetry:
    """Records tutor runs to a sink, or to nowhere.

    Content capture is a **constructor argument, deliberately not an environment
    variable**. A flag readable from the environment can be set on a production
    deployment by anyone with access to its configuration; a constructor
    argument can only be set by code, which means enabling it requires editing a
    local development script and could not happen by way of a deploy variable.
    """

    def __init__(
        self,
        sink: Optional[TutorTelemetrySink] = None,
        *,
        capture_content_for_local_development: bool = False,
    ) -> None:
        self._sink = sink or _no_op_sink
        self.is_active = sink is not None
        # Accepted, recorded, and then never used to widen the event. It exists
        # so a local debugging harness can branch on it without the production
        # type ever gaining a text field.
        self.capture_content_for_local_development = (
            capture_content_for_local_development
        )

    def record_run(
        self,
        *,
        turn_id: str,
        mode: str,
        surface: str,
        model: str,
        source_ids: List[str],
        retrieved_count: int,
        latency_ms: float,
        grounded: bool,
        truncated_history: bool = False,
        truncated_evidence: bool = False,
        error: Optional[BaseException] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        tags: Optional[Dict[str, str]] = None,
    ) -> TutorRunEvent:
        """Record one tutor turn. Returns the event, and never raises."""
        event = TutorRunEvent(
            turn_id=turn_id,
            mode=str(mode),
            surface=str(surface),
            model=model,
            source_ids=list(source_ids)[:_MAX_RECORDED_SOURCE_IDS],
            retrieved_count=retrieved_count,
            latency_ms=round(float(latency_ms), 3),
            grounded=grounded,
            truncated_history=truncated_history,
            truncated_evidence=truncated_evidence,
            error_class=type(error).__name__ if error is not None else None,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            tags=dict(tags or {}),
        )
        try:
            self._sink(event)
        except Exception:  # noqa: BLE001 - observability must not break a request
            logger.warning("tutor telemetry sink failed", exc_info=False)
        return event


def _build_langfuse_sink() -> Optional[TutorTelemetrySink]:
    """A Langfuse sink, or None if the optional extra or its keys are absent.

    Enabling the flag on a deployment that never installed `.[tracing]` must not
    crash the tutor. It just means no traces.
    """
    try:
        from langfuse import Langfuse  # noqa: PLC0415
    except ImportError:
        logger.info("TUTOR_TRACING_ENABLED is set but langfuse is not installed")
        return None

    try:
        client = Langfuse()
    except Exception:  # noqa: BLE001 - missing keys, bad host, anything
        logger.warning("langfuse could not be initialised; tutor tracing is off")
        return None

    def sink(event: TutorRunEvent) -> None:
        client.create_event(name="tutor_run", metadata=event.as_dict())

    return sink


def build_tutor_telemetry() -> TutorTelemetry:
    """The configured telemetry recorder for this deployment."""
    if not tutor_settings().tracing_enabled:
        return TutorTelemetry()
    return TutorTelemetry(sink=_build_langfuse_sink())
