"""The provider contract: what any adapter must and must not be able to do.

These are the properties that have to hold for *every* engine, present and
future — the fake used in tests, the PydanticAI adapter that ships, and whatever
replaces it. They are asserted structurally rather than behaviourally wherever
possible, because a behavioural check only covers the paths a test happens to
exercise, and the interesting failure is the path nobody thought to write.

The one that matters most: **the model cannot reach a mutating operation.** Not
"does not today" — cannot, because the registry it is handed exposes three reads
and the application never passes it anything else.
"""
import asyncio
import inspect
import sys
from types import SimpleNamespace

import pytest

from app.tutor import engine as engine_module
from app.tutor import tools as tools_module
from app.tutor.engine import (
    FakeTutorEngine,
    TutorEngine,
    TutorNotConfiguredError,
    _ValidatingEngine,
)
from app.tutor.retrieval import retrieve_documents
from app.tutor.schemas import (
    TutorCitation,
    TutorContext,
    TutorMode,
    TutorModelOutput,
    TutorRequest,
    TutorResponse,
)
from app.tutor.tools import RelayTutorTools

GLOBAL = TutorContext(surface="global")


def _request(message="What is an IBAN?", mode=TutorMode.CHAT) -> TutorRequest:
    return TutorRequest(message=message, mode=mode, context=GLOBAL)


def _documents():
    return retrieve_documents("What is an IBAN?", context=GLOBAL)


def _engines():
    """Every concrete engine in the codebase.

    Discovered by subclass rather than listed, so an adapter added later is
    covered by these tests without anyone remembering to add it here.
    """
    return [
        subclass
        for subclass in _ValidatingEngine.__subclasses__()
        if not subclass.__name__.startswith("_Test")
    ]


# ── Shape ───────────────────────────────────────────────────────────────────


def test_every_engine_shares_the_validating_pipeline():
    """Validation must not live in an adapter.

    If each provider adapter validated its own citations, the fake would be
    exercising different code from the one that ships, and every grounding test
    in this suite would be proving something about a test double.
    """
    subclasses = _engines()
    assert subclasses
    for subclass in subclasses:
        assert issubclass(subclass, _ValidatingEngine)
        # `answer` is inherited, never overridden — that is what guarantees the
        # budget-then-validate path runs for every provider.
        assert "answer" not in subclass.__dict__, subclass.__name__


def test_every_engine_satisfies_the_public_protocol():
    assert isinstance(FakeTutorEngine(TutorModelOutput(answer="x")), TutorEngine)


def test_an_engine_returns_a_tutor_response_not_a_model_output():
    """The model output type has no `turn_id`, `grounded`, or `mode`.

    Returning it directly would ship a response missing the fields feedback
    joins on and the frontend branches on.
    """
    documents = _documents()
    document = documents[0].document
    engine = FakeTutorEngine(
        TutorModelOutput(
            answer="Answer.",
            citations=[
                TutorCitation(
                    source_id=document.source_id,
                    title=document.title,
                    evidence=document.text[:50],
                )
            ],
        )
    )
    response = asyncio.run(engine.answer(_request(), documents, RelayTutorTools()))
    assert isinstance(response, TutorResponse)
    assert response.turn_id
    assert isinstance(response.grounded, bool)
    assert isinstance(response.mode, TutorMode)


@pytest.mark.parametrize("mode", list(TutorMode))
def test_every_mode_round_trips_through_the_engine(mode):
    documents = _documents()
    engine = FakeTutorEngine(TutorModelOutput(answer="Answer.", citations=[]))
    response = asyncio.run(engine.answer(_request(mode=mode), documents, RelayTutorTools()))
    assert response.mode is mode


# ── The model's reach ───────────────────────────────────────────────────────

_MUTATING_MARKERS = (
    "create", "update", "delete", "insert", "drop", "commit", "execute",
    "post(", "put(", "patch(", "session", "engine.connect", "subprocess",
    "os.system", "open(", "requests.", "httpx.",
)


def test_the_tools_exposed_to_a_provider_are_exactly_the_three_reads():
    """`_registry_tools` is the complete list of what a model can call.

    Anything not in this list is unreachable — not discouraged, unreachable —
    because the provider is handed these closures and has no route to the
    application's other services.
    """
    exposed = engine_module._registry_tools(RelayTutorTools())
    assert {tool.__name__ for tool in exposed} == {
        "lesson_reference",
        "glossary_reference",
        "scheme_reference",
    }


def test_provider_tools_are_bound_to_the_request_recording_registry(monkeypatch):
    """Tool citations from one request must be retained for that same request."""

    captured_agents = []

    class FakeAgent:
        def __init__(self, model, *, output_type, system_prompt, model_settings, tools):
            self.tools = tools
            captured_agents.append(self)

        async def run(self, user, *, instructions):
            result = self.tools[2]("GBP", "CHAPS")[0]
            citation = TutorCitation(
                source_id=result["source_id"],
                title=result["title"],
                evidence=result["text"][:160],
            )
            return SimpleNamespace(
                output=TutorModelOutput(
                    answer="CHAPS is a sterling high-value rail.",
                    citations=[citation],
                )
            )

    monkeypatch.setitem(sys.modules, "pydantic_ai", SimpleNamespace(Agent=FakeAgent))
    engine = engine_module._PydanticAITutorEngine("test:model", RelayTutorTools())
    request = _request("What is an IBAN?")
    documents = _documents()

    response = asyncio.run(engine.answer(request, documents, RelayTutorTools()))

    assert len(captured_agents) == 1
    assert response.grounded is True
    assert response.citations[0].source_id.startswith("relay-rail-gbp-chaps")


def test_gpt5_provider_requests_use_minimal_reasoning_effort(monkeypatch):
    """The default GPT-5 reasoning effort must fit the server request budget."""

    captured = {}

    class FakeAgent:
        def __init__(self, model, *, output_type, system_prompt, model_settings, tools):
            captured["model"] = model
            captured["model_settings"] = model_settings

        async def run(self, user, *, instructions):
            return SimpleNamespace(output=TutorModelOutput(answer="(fake)"))

    monkeypatch.setitem(sys.modules, "pydantic_ai", SimpleNamespace(Agent=FakeAgent))
    engine = engine_module._PydanticAITutorEngine("openai:gpt-5", RelayTutorTools())

    asyncio.run(engine._call_provider(engine_module.build_prompt_payload(_request(), []), RelayTutorTools()))

    assert captured["model"] == "openai:gpt-5"
    assert captured["model_settings"]["openai_reasoning_effort"] == "minimal"


def test_non_reasoning_provider_models_do_not_receive_openai_reasoning_settings():
    settings = engine_module._provider_model_settings("anthropic:claude-sonnet", 1200)
    assert settings == {"max_tokens": 1200}

    settings = engine_module._provider_model_settings("openai:gpt-5-chat", 1200)
    assert settings == {"max_tokens": 1200}


def test_no_tool_exposed_to_a_provider_can_mutate_anything():
    for tool in engine_module._registry_tools(RelayTutorTools()):
        source = inspect.getsource(tool).lower()
        for marker in _MUTATING_MARKERS:
            assert marker not in source, f"{tool.__name__} references {marker!r}"


def test_a_provider_tool_returns_plain_data_not_a_live_object():
    """A model handed an ORM instance could walk its relationships.

    Dumping to a dict severs that: what comes back is a snapshot, with no
    session attached and nothing to traverse.
    """
    lesson = next(
        tool
        for tool in engine_module._registry_tools(RelayTutorTools())
        if tool.__name__ == "lesson_reference"
    )
    result = lesson("lab-1")
    assert isinstance(result, dict)
    assert "source_id" in result


def test_an_unknown_identifier_through_a_provider_tool_returns_nothing():
    tools = engine_module._registry_tools(RelayTutorTools())
    lesson = next(tool for tool in tools if tool.__name__ == "lesson_reference")
    scheme = next(tool for tool in tools if tool.__name__ == "scheme_reference")
    assert lesson("'; DROP TABLE banks;--") is None
    assert scheme("../../etc/passwd") == []


def test_the_tool_module_never_imports_a_client_or_a_session():
    source = inspect.getsource(tools_module)
    for forbidden in ("import requests", "import httpx", "from sqlalchemy", "subprocess"):
        assert forbidden not in source


# ── Provider isolation ──────────────────────────────────────────────────────


def test_provider_types_are_named_in_exactly_one_module():
    """Grep the package, not just the engine.

    A provider import that leaks into a router or a service is how a base
    install stops booting — and it would only be discovered by deploying
    without the extra.
    """
    from pathlib import Path

    from app.config import BASE_DIR

    offenders = []
    for path in Path(BASE_DIR / "app").rglob("*.py"):
        text = path.read_text()
        if "pydantic_ai" in text and path.name != "engine.py":
            offenders.append(str(path.relative_to(BASE_DIR)))
    assert offenders == [], f"provider types leaked into {offenders}"


def test_the_provider_import_is_inside_a_function_not_at_module_scope():
    source = inspect.getsource(engine_module)
    for line in source.splitlines():
        if "import pydantic_ai" in line or "from pydantic_ai" in line:
            assert line.startswith("        "), f"provider import at module scope: {line!r}"


def test_building_an_engine_never_silently_returns_a_fake(monkeypatch):
    """A fake in production answers payment questions with canned text while
    every health check stays green."""
    monkeypatch.delenv("TUTOR_ENABLED", raising=False)
    with pytest.raises(TutorNotConfiguredError):
        engine_module.build_tutor_engine()


def test_the_fake_engine_is_never_reachable_from_the_router():
    """The router resolves `build_tutor_engine`, which raises rather than
    falling back. Nothing in the request path names the fake."""
    from app.routers import tutor as tutor_router

    source = inspect.getsource(tutor_router)
    assert "FakeTutorEngine" not in source
