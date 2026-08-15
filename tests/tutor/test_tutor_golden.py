"""The tutor golden set — the contract, run deterministically in ordinary CI.

**What this suite can and cannot prove.** It runs the fake engine, so no model
is called and nothing here depends on a provider being up. That means it proves
everything *around* the model: that a refusal fires before any provider work,
that retrieval reaches the sources an answer needs, that a citation naming an
unretrieved source is stripped, that an uncited factual claim is replaced, and
that each mode's instructions say what they must.

It cannot prove the model writes a good answer. That is what
`scripts/run_tutor_eval.py` is for, and it is opt-in precisely because a suite
that fails when a provider has an outage stops being a signal about Relay.

The fixture is the same file the retrieval benchmark uses. One question
inventory, two consumers — a second file would drift from the first within a
release, and then two suites would disagree about what the right answer is.
"""
import json
from pathlib import Path

import pytest

from app.config import BASE_DIR
from app.tutor.engine import FakeTutorEngine, finalise_response
from app.tutor.policy import evaluate_tutor_request
from app.tutor.prompts import build_prompt_payload
from app.tutor.retrieval import retrieve_documents
from app.tutor.schemas import (
    TutorCitation,
    TutorContext,
    TutorMode,
    TutorModelOutput,
    TutorRequest,
)

FIXTURE = BASE_DIR / "tests/tutor/retrieval_questions.json"


def _questions() -> list:
    return json.loads(Path(FIXTURE).read_text())["questions"]


def _request(item) -> TutorRequest:
    return TutorRequest(
        message=item["question"],
        mode=TutorMode(item.get("mode", "chat")),
        context=TutorContext(**item["context"]),
    )


_ALL = _questions()
_REFUSALS = [item for item in _ALL if item.get("expect_refusal")]
_ANSWERABLE = [
    item
    for item in _ALL
    if not item.get("expect_refusal") and not item.get("expect_no_result")
]
_WITH_CONCEPTS = [item for item in _ALL if item.get("expected_concepts")]


def _identify(item) -> str:
    return f"{item['id']}:{item['category']}"


# ── Fixture integrity ───────────────────────────────────────────────────────
#
# The fixture is ground truth for two suites. A malformed entry does not fail
# loudly — it quietly reduces coverage, which is the failure mode that survives
# longest.


def test_every_question_has_the_fields_both_consumers_rely_on():
    for item in _ALL:
        assert item["id"], item
        assert item["question"].strip()
        assert item["category"]
        assert "surface" in item["context"]


def test_question_ids_are_unique():
    ids = [item["id"] for item in _ALL]
    assert len(ids) == len(set(ids))


def test_the_fixture_covers_every_required_category():
    """A category with no questions is a part of the contract nobody is checking."""
    required = {
        "glossary",
        "lessons",
        "schemes",
        "tracking-summary",
        "tools",
        "out-of-scope",
        "refusal",
        "hint",
        "quiz",
    }
    assert required <= {item["category"] for item in _ALL}


def test_the_golden_set_is_large_enough_to_mean_something():
    assert len(_ALL) >= 30


def test_a_refusal_item_declares_which_rule_should_fire():
    """Asserting only "it refused" would pass when the wrong rule fires.

    A compliance-bypass question refused as a payment-execution request is a
    bug that produces the right status code and the wrong explanation.
    """
    for item in _REFUSALS:
        assert item.get("expected_reason"), _identify(item)


def test_an_answerable_item_declares_its_expected_sources():
    for item in _ANSWERABLE:
        assert item.get("expected_source_ids"), _identify(item)


# ── Refusals ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("item", _REFUSALS, ids=_identify)
def test_every_refusal_question_is_refused_by_the_deterministic_policy(item):
    decision = evaluate_tutor_request(_request(item))
    assert decision.allowed is False, item["question"]
    assert decision.reason == item["expected_reason"], item["question"]


@pytest.mark.parametrize("item", _REFUSALS, ids=_identify)
def test_every_refusal_explains_itself_rather_than_just_saying_no(item):
    """"No" on its own teaches nothing and invites a rephrase.

    A learner who does not understand *why* a request was refused will ask the
    same thing three more ways, which is worse for them and for us.
    """
    decision = evaluate_tutor_request(_request(item))
    assert decision.response
    assert len(decision.response) > 80


@pytest.mark.parametrize("item", _ANSWERABLE, ids=_identify)
def test_no_answerable_question_is_refused_by_accident(item):
    """The expensive failure mode of a safety filter is the false positive.

    A tutor that refuses ordinary payments questions is not a safe tutor, it is
    a broken one, and nobody reports it because it looks deliberate.
    """
    assert evaluate_tutor_request(_request(item)).allowed is True, item["question"]


# ── Grounding ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize("item", _ANSWERABLE, ids=_identify)
def test_every_answerable_question_retrieves_at_least_one_expected_source(item):
    request = _request(item)
    documents = retrieve_documents(request.message, context=request.context)
    retrieved = {result.document.source_id for result in documents}
    assert retrieved & set(item["expected_source_ids"]), (
        f"{item['id']}: expected any of {item['expected_source_ids']}, got {sorted(retrieved)}"
    )


@pytest.mark.parametrize("item", _ANSWERABLE[:12], ids=_identify)
def test_a_verbatim_citation_of_a_retrieved_source_is_accepted(item):
    """Proves the accept path, not only the reject path.

    A validator that rejects everything would pass every rejection test in this
    file and ship a tutor that can never cite anything.
    """
    request = _request(item)
    documents = retrieve_documents(request.message, context=request.context)
    document = documents[0].document
    output = TutorModelOutput(
        answer=document.text[:80],
        citations=[
            TutorCitation(
                source_id=document.source_id,
                title=document.title,
                evidence=document.text[:80],
            )
        ],
    )
    response = finalise_response(output, request, documents)
    assert response.grounded is True
    assert response.citations[0].source_id == document.source_id


@pytest.mark.parametrize("item", _WITH_CONCEPTS, ids=_identify)
def test_the_evidence_for_a_question_actually_contains_its_required_concepts(item):
    """Checks the *catalogue*, not the model.

    If the retrieved documents do not contain the concept an answer needs, no
    model can produce a grounded answer — and the live evaluation would blame
    the model for a gap in Relay's own source material.
    """
    request = _request(item)
    documents = retrieve_documents(request.message, context=request.context)
    corpus = " ".join(result.document.text.lower() for result in documents)
    missing = [
        concept for concept in item["expected_concepts"] if concept.lower() not in corpus
    ]
    assert not missing, f"{item['id']}: evidence lacks {missing}"


@pytest.mark.parametrize("item", _ANSWERABLE[:8], ids=_identify)
def test_a_forbidden_claim_without_a_citation_never_reaches_the_learner(item):
    """The fake emits exactly the claim the fixture forbids, uncited.

    This is the whole grounding guarantee in one assertion: a confident factual
    sentence with nothing behind it is replaced, not annotated.
    """
    request = _request(item)
    documents = retrieve_documents(request.message, context=request.context)
    forbidden = (item.get("forbidden_claims") or ["CHAPS settles every Tuesday at midnight."])[0]
    response = finalise_response(
        TutorModelOutput(answer=forbidden, citations=[]), request, documents
    )
    assert forbidden not in response.answer
    assert response.grounded is False
    assert response.needs_clarification is True


@pytest.mark.parametrize("item", _ANSWERABLE[:8], ids=_identify)
def test_a_citation_naming_an_unretrieved_source_is_stripped(item):
    request = _request(item)
    documents = retrieve_documents(request.message, context=request.context)
    response = finalise_response(
        TutorModelOutput(
            answer="Confident and wrong.",
            citations=[
                TutorCitation(
                    source_id="relay-concept-not-in-this-catalogue",
                    title="Invented",
                    evidence="plausible sounding text",
                )
            ],
        ),
        request,
        documents,
    )
    assert response.citations == []
    assert response.grounded is False


# ── Modes ───────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "item", [item for item in _ALL if item.get("mode") == "hint"], ids=_identify
)
def test_a_hint_question_builds_a_prompt_that_withholds_the_answer(item):
    request = _request(item)
    documents = retrieve_documents(request.message, context=request.context)
    payload = build_prompt_payload(request, documents)
    system = payload.system.lower()
    assert "do not give" in system
    assert "final answer" in system


@pytest.mark.parametrize(
    "item", [item for item in _ALL if item.get("mode") == "quiz"], ids=_identify
)
def test_a_quiz_question_builds_a_prompt_that_asks_exactly_one_question(item):
    request = _request(item)
    documents = retrieve_documents(request.message, context=request.context)
    system = build_prompt_payload(request, documents).system.lower()
    assert "exactly one question" in system
    assert "do not include its answer" in system


def test_every_mode_produces_a_distinct_instruction():
    """Modes that render identical prompts are four buttons doing one thing."""
    request = _request(_ANSWERABLE[0])
    documents = retrieve_documents(request.message, context=request.context)
    systems = set()
    for mode in TutorMode:
        systems.add(
            build_prompt_payload(request.model_copy(update={"mode": mode}), documents).system
        )
    assert len(systems) == len(list(TutorMode))


# ── End to end through the engine ───────────────────────────────────────────


@pytest.mark.parametrize("item", _ANSWERABLE[:6], ids=_identify)
def test_the_whole_path_holds_with_a_scripted_engine(item):
    """Retrieval, budget, validation, and composition, with no provider.

    Running the fake through the *same* `_ValidatingEngine` the real adapter
    uses is what makes this meaningful — if validation lived in the provider
    adapter, this would exercise code that never ships.
    """
    import asyncio

    from app.tutor.tools import RelayTutorTools

    request = _request(item)
    documents = retrieve_documents(request.message, context=request.context)
    document = documents[0].document
    engine = FakeTutorEngine(
        TutorModelOutput(
            answer=document.text[:60],
            citations=[
                TutorCitation(
                    source_id=document.source_id,
                    title=document.title,
                    evidence=document.text[:60],
                )
            ],
        )
    )
    response = asyncio.run(engine.answer(request, documents, RelayTutorTools()))
    assert response.grounded is True
    assert response.mode is request.mode
    assert response.turn_id == response.turn_id.lower()
    assert "simulation" in (response.safety_notice or "").lower()
