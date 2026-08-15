"""The tutor engine: where a model's output becomes an answer Relay stands behind.

The engine owns one guarantee: **a factual tutor answer is supported by a Relay
document, verbatim, or it is not delivered.** Everything else here serves that.

Three failures this defends against, in increasing order of subtlety:

1. An invented `source_id`. Easy to catch — the ID either was retrieved for this
   turn or it was not.
2. A real `source_id` with paraphrased evidence. The citation looks right, the
   quote reads like the document, and the sentence shown to the learner as proof
   was written by the model. Caught by requiring the evidence to appear verbatim
   in the cited text.
3. A confident factual answer with no citation at all. Marking it
   `grounded=false` is not enough — nothing in a chat interface makes a boolean
   louder than the paragraph beside it. The answer is replaced.

**Provider imports are lazy and confined to this module.** The base install
carries no `pydantic-ai`, and an eager import here would take down every
existing route, tutor or not. `build_tutor_engine()` imports inside the function
and raises `TutorNotConfiguredError` rather than falling back to a fake — a fake
in production would answer payment questions with canned text while every health
check stayed green.
"""
import asyncio
import time
from typing import Callable, List, Optional, Protocol, Sequence, Tuple, runtime_checkable

from app.config import tutor_provider_api_key, tutor_settings

from .prompts import (
    TutorPromptPayload,
    build_prompt_payload,
    estimate_tokens,
    simulation_disclaimer,
    truncation_notice,
)
from .retrieval import RetrievedDocument
from .schemas import TutorCitation, TutorModelOutput, TutorRequest, TutorResponse
from .tools import TutorToolRegistry

__all__ = [
    "CircuitBreaker",
    "FakeTutorEngine",
    "TutorEngine",
    "TutorNotConfiguredError",
    "TutorProviderError",
    "build_tutor_engine",
    "estimate_tokens",
]

# One retry, not more. A second attempt rescues a blip; a third mostly
# multiplies the bill on a provider that is genuinely unwell, and the circuit
# breaker is the right tool for that case.
_MAX_PROVIDER_ATTEMPTS = 2
_RETRY_BACKOFF_SECONDS = 0.4


class TutorProviderError(RuntimeError):
    """The provider failed, timed out, or returned something unusable.

    Typed so the router can convert it into one stable "tutor unavailable"
    response. A raw provider exception reaching the HTTP boundary leaks the
    provider's own error text — model names, quota messages, request IDs — to a
    learner who cannot act on any of it.
    """


class TutorNotConfiguredError(RuntimeError):
    """The tutor is disabled, or enabled without a model and key."""


class CircuitBreaker:
    """Stops hammering a provider that is already down.

    A bounded retry and a breaker solve opposite halves of the same problem. A
    retry rescues a blip; without a breaker it makes a sustained outage strictly
    worse, doubling both the load on a struggling provider and the bill, while
    every learner waits twice as long for the same failure.

    Consecutive failures, not cumulative: a running total would eventually open
    the breaker on a provider that has been healthy for a month — an outage we
    caused ourselves. After the reset window it half-opens and lets exactly one
    request through, because a breaker that never retests stays open until a
    human notices.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        reset_seconds: float = 30.0,
        clock: Optional[Callable[[], float]] = None,
    ) -> None:
        self._threshold = failure_threshold
        self._reset_seconds = reset_seconds
        self._clock = clock or time.monotonic
        self._consecutive_failures = 0
        self._opened_at: Optional[float] = None
        self._half_open = False

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return "closed"
        return "half-open" if self._half_open else "open"

    def allow(self) -> bool:
        if self._opened_at is None:
            return True
        if self._clock() - self._opened_at >= self._reset_seconds:
            self._half_open = True
            return True
        return False

    def record_success(self) -> None:
        self._consecutive_failures = 0
        self._opened_at = None
        self._half_open = False

    def record_failure(self) -> None:
        self._consecutive_failures += 1
        if self._half_open or self._consecutive_failures >= self._threshold:
            self._opened_at = self._clock()
            self._half_open = False


_CLARIFICATION_ANSWER = (
    "I don't have a Relay source that supports an answer to that, and I won't "
    "guess at a payment rule. Could you narrow it down — which currency, rail, "
    "or lesson are you asking about? I can also explain a related concept if "
    "that helps."
)


@runtime_checkable
class TutorEngine(Protocol):
    """What the router depends on. Deliberately one method.

    A Protocol rather than a base class so a test double is a plain object
    satisfying a shape, not a subclass inheriting production behaviour it might
    accidentally exercise.
    """

    async def answer(
        self,
        request: TutorRequest,
        documents: Sequence[RetrievedDocument],
        tools: TutorToolRegistry,
    ) -> TutorResponse: ...


def _normalise_whitespace(text: str) -> str:
    return " ".join(text.split())


def validate_citations(
    output: TutorModelOutput, documents: Sequence[RetrievedDocument]
) -> Tuple[List[TutorCitation], bool]:
    """Keep only citations that name a retrieved document and quote it verbatim.

    Whitespace is normalised on both sides before comparing, because re-wrapping
    a quote is a formatting artefact of how the model emitted it. Changing a
    word is not, and that is exactly what this rejects.

    Returns the surviving citations and whether the answer is grounded.
    """
    retrieved = {result.document.source_id: result.document for result in documents}
    kept: List[TutorCitation] = []

    for citation in output.citations:
        document = retrieved.get(citation.source_id)
        if document is None:
            continue
        if _normalise_whitespace(citation.evidence) not in _normalise_whitespace(
            document.text
        ):
            continue
        # The URL is replaced with the catalogue's own, never carried across
        # from the model: a citation pointing at a real document but a
        # model-authored URL is the most convincing kind of fabricated source.
        kept.append(
            TutorCitation(
                source_id=citation.source_id,
                title=document.title,
                url=document.source_url,
                evidence=citation.evidence,
            )
        )

    return kept, bool(kept)


def finalise_response(
    output: TutorModelOutput,
    request: TutorRequest,
    documents: Sequence[RetrievedDocument],
    payload: Optional[TutorPromptPayload] = None,
) -> TutorResponse:
    """Validate the model's output and compose the response the server owns."""
    citations, grounded = validate_citations(output, documents)

    if not grounded and not output.needs_clarification:
        # A factual claim with nothing behind it is withheld, not annotated.
        output = TutorModelOutput(
            answer=_CLARIFICATION_ANSWER,
            citations=[],
            follow_up=None,
            needs_clarification=True,
        )
    else:
        output = TutorModelOutput(
            answer=output.answer,
            citations=citations,
            follow_up=output.follow_up,
            needs_clarification=output.needs_clarification,
        )

    notice = simulation_disclaimer()
    if payload is not None:
        extra = truncation_notice(payload)
        if extra:
            notice = f"{notice} {extra}"

    return TutorResponse.from_model_output(
        output, mode=request.mode, grounded=grounded, safety_notice=notice[:500]
    )


def over_budget_response(request: TutorRequest) -> TutorResponse:
    """The learner's message alone will not fit beside the instructions.

    Truncating the question would answer something they did not ask, so nothing
    is sent to the provider at all.
    """
    return TutorResponse.from_model_output(
        TutorModelOutput(
            answer=(
                "That message is too long for me to work with in one go. Could "
                "you ask the specific part you want explained? A focused "
                "question also gets a better-sourced answer."
            ),
            citations=[],
            needs_clarification=True,
        ),
        mode=request.mode,
        grounded=False,
        safety_notice=simulation_disclaimer(),
    )


class _ValidatingEngine:
    """Shared budget-then-validate pipeline for every concrete engine.

    Both the fake and the real provider run the identical path, so a test that
    proves a citation is rejected proves it for production too. If validation
    lived only in the provider adapter, the fake would be exercising different
    code from the one that ships.
    """

    def __init__(
        self,
        *,
        max_input_tokens: Optional[int] = None,
        max_history_turns: Optional[int] = None,
    ) -> None:
        settings = tutor_settings()
        self._max_input_tokens = max_input_tokens or settings.max_input_tokens
        self._max_history_turns = max_history_turns or settings.max_history_turns

    async def _produce(
        self, payload: TutorPromptPayload, tools: TutorToolRegistry
    ) -> TutorModelOutput:
        raise NotImplementedError

    async def answer(
        self,
        request: TutorRequest,
        documents: Sequence[RetrievedDocument],
        tools: TutorToolRegistry,
    ) -> TutorResponse:
        payload = build_prompt_payload(
            request,
            documents,
            max_input_tokens=self._max_input_tokens,
            max_history_turns=self._max_history_turns,
        )
        if payload.over_budget:
            return over_budget_response(request)

        output = await self._produce(payload, tools)
        kept = [
            result
            for result in documents
            if result.document.source_id in set(payload.evidence_source_ids)
        ]
        return finalise_response(output, request, kept, payload)


class FakeTutorEngine(_ValidatingEngine):
    """A scripted engine for deterministic tests.

    Never reachable in production: `build_tutor_engine()` raises rather than
    returning this, so there is no configuration under which a learner receives
    canned text believing it came from a model.
    """

    def __init__(
        self,
        output: Optional[TutorModelOutput] = None,
        *,
        failure: Optional[Exception] = None,
        max_input_tokens: Optional[int] = None,
        max_history_turns: Optional[int] = None,
    ) -> None:
        super().__init__(
            max_input_tokens=max_input_tokens, max_history_turns=max_history_turns
        )
        self._output = output or TutorModelOutput(answer="(fake)")
        self._failure = failure
        self.calls = 0
        self.last_payload: Optional[TutorPromptPayload] = None
        self.last_tools: Optional[TutorToolRegistry] = None

    async def _produce(
        self, payload: TutorPromptPayload, tools: TutorToolRegistry
    ) -> TutorModelOutput:
        self.calls += 1
        self.last_payload = payload
        self.last_tools = tools
        if self._failure is not None:
            raise self._failure
        return self._output


class _PydanticAITutorEngine(_ValidatingEngine):
    """The production adapter. The only place provider types are named.

    Constructed lazily by `build_tutor_engine()`; importing this module does not
    import the provider.
    """

    def __init__(self, model: str, tools: TutorToolRegistry) -> None:
        super().__init__()
        # Imported here, not at module scope: the base install has no
        # pydantic-ai, and `app.main` imports this module's package.
        from pydantic_ai import Agent  # noqa: PLC0415

        # One breaker per engine, and the engine is cached per model in the
        # router — so failures observed by one request inform the next, which is
        # the entire point of a breaker.
        self._breaker = CircuitBreaker()

        settings = tutor_settings()
        self._agent = Agent(
            model,
            output_type=TutorModelOutput,
            system_prompt="",
            model_settings={"max_tokens": settings.max_output_tokens},
            tools=_registry_tools(tools),
        )

    async def _produce(
        self, payload: TutorPromptPayload, tools: TutorToolRegistry
    ) -> TutorModelOutput:
        if not self._breaker.allow():
            # Fail immediately rather than adding one more request to a provider
            # already known to be failing. The learner gets the same unavailable
            # response either way — this one arrives in milliseconds and costs
            # nothing.
            raise TutorProviderError("provider circuit is open")

        last_error: Optional[BaseException] = None
        for attempt in range(_MAX_PROVIDER_ATTEMPTS):
            try:
                result = await self._agent.run(payload.user, instructions=payload.system)
            except Exception as error:  # noqa: BLE001 - normalised at the boundary
                last_error = error
                if attempt + 1 < _MAX_PROVIDER_ATTEMPTS:
                    await asyncio.sleep(_RETRY_BACKOFF_SECONDS)
                    continue
                break

            output = getattr(result, "output", None)
            if not isinstance(output, TutorModelOutput):
                # A structurally wrong response is not worth retrying: it means
                # the model is not honouring the output schema, and a second
                # identical request will not change that.
                self._breaker.record_failure()
                raise TutorProviderError("provider returned an unusable output type")

            self._breaker.record_success()
            return output

        self._breaker.record_failure()
        raise TutorProviderError(type(last_error).__name__) from last_error


def _registry_tools(tools: TutorToolRegistry) -> list:
    """Expose the registry's three reads, and nothing the SDK could discover.

    Closures over the passed-in registry rather than module functions, so the
    set of reachable operations is decided at the call site instead of by
    whatever the provider can import.
    """

    def lesson_reference(module_id: str) -> Optional[dict]:
        """Look up a Relay lesson by its curriculum module id."""
        document = tools.get_lesson_reference(module_id)
        return document.model_dump() if document else None

    def glossary_reference(term: str) -> Optional[dict]:
        """Look up Relay's definition of a payments term."""
        document = tools.get_glossary_reference(term)
        return document.model_dump() if document else None

    def scheme_reference(currency: str, rail_name: Optional[str] = None) -> list:
        """Look up Relay's payment-rail data for a currency, optionally one rail."""
        return [
            document.model_dump()
            for document in tools.get_scheme_reference(currency, rail_name)
        ]

    return [lesson_reference, glossary_reference, scheme_reference]


def build_tutor_engine(tools: Optional[TutorToolRegistry] = None) -> TutorEngine:
    """The configured production engine, or an error explaining what is missing.

    Never returns a fake. A silent fallback would make an unconfigured
    deployment indistinguishable from a working one until someone read an
    answer closely.
    """
    settings = tutor_settings()
    if not settings.enabled:
        raise TutorNotConfiguredError("Tutor is not enabled")
    if not settings.model or not tutor_provider_api_key(settings.provider):
        raise TutorNotConfiguredError("Tutor provider is not configured")

    from .tools import RelayTutorTools  # noqa: PLC0415

    return _PydanticAITutorEngine(settings.model, tools or RelayTutorTools())
