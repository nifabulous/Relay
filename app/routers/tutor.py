"""The learner-facing tutor endpoint.

The router's job is to make every failure mode a **stable, explainable
response**. A learner never sees a platform timeout page, a provider's error
text, or an answer that quietly lost its grounding; an operator can tell "I
turned it off" apart from "I turned it on and forgot the key", because those
need different fixes.

Order of operations, and why:

1. **Availability** — 503 before anything else. A disabled tutor should say so
   regardless of rate or payload.
2. **Rate limit** — before any provider work. Checking afterwards bills for
   exactly the request the limit exists to prevent.
3. **Policy** — deterministic, model-free, and reading only `request.message`.
   A refusal never reaches the provider, so a hostile request costs nothing.
4. **Retrieval on the raw text** — before redaction, because retrieval keys on
   the very tokens redaction removes. A learner asking "what does BIC DEUTDEFF
   mean?" must still reach the BIC concept card.
5. **Redaction and bounding** — inside the engine's prompt builder, immediately
   before the provider call, which is the last point where the text is still
   ours.
6. **Engine under a timeout below the platform's function limit** — so the
   answer is our JSON, not the platform's HTML error page.
7. **Redacted telemetry** — source IDs and timings, never text.

No prompt is constructed here. The router validates, decides, and maps errors;
`app/tutor/engine.py` owns what the model is told.
"""
import asyncio
import hashlib
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import (
    TutorAvailability,
    tutor_availability,
    tutor_provider_api_key,
    tutor_settings,
)
from ..tutor.engine import (
    TutorEngine,
    TutorNotConfiguredError,
    TutorProviderError,
    build_tutor_engine,
    finalise_response,
)
from ..tutor.limits import (
    DailyRequestCeiling,
    RateLimiter,
    build_daily_ceiling,
    build_rate_limiter,
    limiter_key_for,
    production_limiter_is_missing,
    production_spend_ceiling_is_missing,
)
from ..tutor.policy import evaluate_tutor_request
from ..tutor.retrieval import retrieve_documents
from ..tutor.schemas import TutorModelOutput, TutorRequest, TutorResponse
from ..tutor.telemetry import TutorTelemetry, build_tutor_telemetry
from ..tutor.tools import RelayTutorTools

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tutor", tags=["tutor"])

# Below the platform's 30-second function limit on purpose. If the platform
# times out first the learner gets an HTML error page from an endpoint whose
# entire contract is typed JSON, and the frontend has nothing to parse.
TUTOR_TIMEOUT_SECONDS = 20.0

_UNAVAILABLE_DETAIL = (
    "The tutor is temporarily unavailable. This is a Relay-side problem, not "
    "something wrong with your question — please try again shortly."
)


def _safe_tutor_failure_class(error: BaseException) -> str:
    """Return a searchable failure class without exposing upstream details."""
    if isinstance(error, TutorProviderError):
        provider_class = str(error).strip()
        if provider_class.isascii() and provider_class.isidentifier():
            return provider_class
        return type(error).__name__
    return type(error).__name__

# Module-level so a single worker shares one set of buckets across requests.
# Rebuilding per request would reset every count and make the limit meaningless.
_LIMITER: RateLimiter = build_rate_limiter()
_DAILY_CEILING: DailyRequestCeiling = build_daily_ceiling()
_TELEMETRY = build_tutor_telemetry()


def get_limiter() -> RateLimiter:
    return _LIMITER


def get_daily_ceiling() -> DailyRequestCeiling:
    return _DAILY_CEILING


def get_telemetry() -> TutorTelemetry:
    return _TELEMETRY


_ENGINE_CACHE: dict = {}


def get_tutor_engine() -> TutorEngine:
    """Check availability, then return the engine — in that order.

    The availability checks live **here rather than in the route body** because
    a FastAPI dependency resolves before the body runs. With the checks in the
    body, `build_tutor_engine()` was reached first: a disabled tutor raised
    `TutorNotConfiguredError` as a 500, and a configured one tried to import the
    provider SDK before anything had established it should. The documented
    order and the executed order have to be the same one.

    The engine is cached per model so a provider client is constructed once,
    not per request, while a configuration change still takes effect without a
    restart.

    Overridden wholesale in tests, which is what keeps the suite from ever
    making a paid call.
    """
    _require_available()
    settings = tutor_settings()
    key_fingerprint = hashlib.sha256(
        tutor_provider_api_key(settings.provider).encode("utf-8")
    ).hexdigest()
    # The adapter freezes these values at construction time. Include every
    # engine-owned budget in the cache key so a runtime configuration change
    # cannot leave the old safety limits active until process restart.
    key = (
        settings.provider,
        settings.model,
        key_fingerprint,
        settings.max_history_turns,
        settings.max_input_tokens,
        settings.max_output_tokens,
    )
    engine = _ENGINE_CACHE.get(key)
    if engine is None:
        engine = build_tutor_engine()
        _ENGINE_CACHE[key] = engine
    return engine


def _require_available() -> None:
    availability = tutor_availability()
    if availability is TutorAvailability.DISABLED:
        raise HTTPException(status_code=503, detail="The tutor is not enabled.")
    if availability is TutorAvailability.UNCONFIGURED:
        raise HTTPException(
            status_code=503,
            detail=(
                "The tutor provider is not configured. Set TUTOR_MODEL and the "
                "provider API key for this deployment."
            ),
        )
    if production_limiter_is_missing():
        # Serving here would advertise a rate limit that does not exist, on the
        # one endpoint that costs money per call.
        raise HTTPException(
            status_code=503,
            detail=(
                "The tutor requires a shared rate limit in this environment. "
                "Set TUTOR_RATE_LIMIT_REDIS_URL and TUTOR_RATE_LIMIT_REDIS_TOKEN."
            ),
        )
    if production_spend_ceiling_is_missing():
        # A per-caller rate limit stops one client looping. It does nothing
        # about a thousand clients each behaving reasonably, which is the shape
        # an unbounded bill actually takes.
        raise HTTPException(
            status_code=503,
            detail=(
                "The tutor requires a daily spend ceiling in this environment. "
                "Set TUTOR_DAILY_REQUEST_CEILING to the maximum tutor requests "
                "per day this deployment may make."
            ),
        )


async def _allow_limiter_async(limiter: RateLimiter, key: str) -> bool:
    """Run synchronous limiter clients without blocking the event loop."""

    return await asyncio.to_thread(limiter.allow, key)


async def _allow_ceiling_async(ceiling: DailyRequestCeiling) -> bool:
    """Run synchronous ceiling clients without blocking the event loop."""

    return await asyncio.to_thread(ceiling.allow)


@router.get(
    "/availability",
    summary="Whether the tutor can answer in this deployment",
    description=(
        "A cheap, unmetered read so a persistent tutor control can render its "
        "correct state on any page without spending anything.\n\n"
        "**SIMULATION** — Relay is an educational simulation. This endpoint "
        "reports only whether the tutor is reachable, never why it is not."
    ),
)
def tutor_availability_probe() -> dict:
    """Deliberately outside both meters, and deliberately uninformative.

    A persistent launcher has to know whether the tutor is on in order to render
    correctly, and it has to ask on every page. The only tutor route used to be
    the metered POST, so an enabled deployment would have burned rate limit and
    daily ceiling on ordinary browsing — and, with the ceiling now failing
    closed, could take the tutor offline for real learners before anyone asked a
    question.

    It reports a single boolean. The operator-facing distinction between
    "disabled" and "enabled but missing a key" stays in the 503 detail on
    `/chat`, where an operator is already looking. Publishing which half of the
    configuration is absent on an unauthenticated GET tells an attacker whether
    a key exists, which is not something a learner ever needs to know.
    """
    return {
        "available": (
            tutor_availability() is TutorAvailability.READY
            and not production_limiter_is_missing()
            and not production_spend_ceiling_is_missing()
        )
    }


@router.post(
    "/chat",
    response_model=TutorResponse,
    summary="Ask the Relay tutor a grounded question",
    description=(
        "Answers a learner's payments question using only Relay's curated "
        "sources, with verbatim evidence and deterministic quote-coverage "
        "checks for each factual answer.\n\n"
        "**SIMULATION** — Relay is an educational simulation. No real money "
        "moves. The tutor explains, quizzes, and hints; it can never initiate, "
        "approve, advance, or settle a payment, and every limit, fee, and "
        "timeline it discusses is illustrative rather than an operator's "
        "current published figure.\n\n"
        "The server-owned `grounded` flag means the answer passed those "
        "quote-coverage checks; it is not a semantic fact checker or a live "
        "operational guarantee. When the checks fail, the tutor asks a "
        "clarifying question instead of improvising a payment rule."
    ),
)
async def tutor_chat(
    payload: TutorRequest,
    request: Request,
    engine: TutorEngine = Depends(get_tutor_engine),
    limiter: RateLimiter = Depends(get_limiter),
    ceiling: DailyRequestCeiling = Depends(get_daily_ceiling),
    telemetry: TutorTelemetry = Depends(get_telemetry),
) -> TutorResponse:
    # Availability was already decided in `get_tutor_engine`, which resolves
    # before this body — see the note there.
    #
    # Policy runs FIRST, before either meter. It is deterministic, model-free,
    # and costs nothing, while both meters exist to protect paid work. Charging
    # a learner's quota for a request that never reaches the provider means
    # someone who phrases one question badly loses their allowance for the good
    # ones — and since the daily ceiling now fails closed, a burst of refusals
    # could take the tutor offline for everybody for the rest of the day.
    decision = evaluate_tutor_request(payload)
    if not decision.allowed:
        # A refusal is a successful, useful answer — not a client error. A 4xx
        # would make the frontend render an error state for something the tutor
        # handled correctly and has a good explanation for.
        return TutorResponse.from_model_output(
            TutorModelOutput(
                answer=decision.response or "I can't help with that.",
                citations=[],
                needs_clarification=False,
            ),
            mode=payload.mode,
            grounded=False,
            safety_notice="Relay is an educational SIMULATION. No real money moves.",
        )

    if not await _allow_limiter_async(limiter, limiter_key_for(request)):
        raise HTTPException(
            status_code=429,
            detail=(
                "Too many tutor questions in a short time. Wait a moment and "
                "ask again."
            ),
        )

    if not await _allow_ceiling_async(ceiling):
        # A different message from the per-caller limit on purpose: waiting a
        # moment does not help here, and saying it will is worse than nothing.
        raise HTTPException(
            status_code=429,
            detail=(
                "Relay's tutor has reached its question ceiling for today. "
                "Everything else in Relay still works; the tutor will be "
                "available again tomorrow."
            ),
        )

    settings = tutor_settings()
    # Retrieval runs on the RAW message: it keys on the identifiers redaction
    # removes, so redacting first would destroy the term the lookup depends on.
    documents = retrieve_documents(
        payload.message, context=payload.context, limit=settings.max_retrieved_docs
    )

    started = time.perf_counter()
    error: BaseException | None = None
    response: TutorResponse | None = None
    try:
        response = await asyncio.wait_for(
            engine.answer(payload, documents, RelayTutorTools()),
            timeout=TUTOR_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as timeout_error:
        error = timeout_error
    except TutorNotConfiguredError as configuration_error:
        error = configuration_error
    except TutorProviderError as provider_error:
        error = provider_error
    except Exception as unexpected:  # noqa: BLE001 - nothing may reach the learner raw
        error = unexpected

    latency_ms = (time.perf_counter() - started) * 1000.0

    telemetry.record_run(
        turn_id=response.turn_id if response else "",
        mode=payload.mode.value,
        surface=payload.context.surface,
        model=settings.model,
        source_ids=[result.document.source_id for result in documents],
        retrieved_count=len(documents),
        latency_ms=latency_ms,
        grounded=bool(response and response.grounded),
        error=error,
    )

    if error is not None:
        # One message for every upstream failure. The provider's own text
        # carries model names, quota details, and request IDs — infrastructure
        # facts a learner cannot act on and we should not publish.
        logger.warning("tutor engine failed: %s", _safe_tutor_failure_class(error))
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL)

    assert response is not None  # noqa: S101 - narrowing after the error branch
    return response


__all__ = ["finalise_response", "get_limiter", "get_telemetry", "get_tutor_engine", "router"]
