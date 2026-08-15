"""Lexical retrieval: what the tutor is allowed to see before it answers.

Retrieval decides grounding. A question that retrieves nothing must produce a
clarification rather than an invented payment rule, so "returns nothing" is a
first-class correct outcome here, not a failure to paper over.
"""
import pytest

from app.tutor.retrieval import RetrievedDocument, retrieve_documents
from app.tutor.schemas import TutorContext

GLOBAL = TutorContext(surface="global")


def _ids(results):
    return [result.document.source_id for result in results]


# ── Core lexical behaviour ──────────────────────────────────────────────────


def test_a_glossary_question_retrieves_its_concept_card_first():
    results = retrieve_documents("What is an IBAN?", context=GLOBAL)
    assert results
    assert results[0].document.source_id == "relay-concept-iban"


def test_a_uetr_question_retrieves_the_uetr_card_first():
    results = retrieve_documents("What does the UETR do?", context=GLOBAL)
    assert results[0].document.source_id == "relay-concept-uetr"


def test_a_tracking_question_retrieves_tracking_grounding():
    results = retrieve_documents(
        "How do I read a payment tracking timeline?", context=GLOBAL
    )
    assert "relay-concept-payment-tracking" in _ids(results)


def test_a_named_rail_retrieves_that_rail_document():
    results = retrieve_documents("Explain CHAPS", context=GLOBAL)
    assert results
    assert "chaps" in results[0].document.source_id


def test_a_rail_question_prefers_the_rail_over_the_currency_overview():
    """The overview is mostly a list of other rails.

    Returning it first spends the evidence budget on rails the learner did not
    ask about, which is exactly what per-rail documents exist to avoid.
    """
    results = retrieve_documents("Tell me about Faster Payments", context=GLOBAL)
    assert results[0].document.source_id.startswith("relay-rail-")


def test_stop_words_alone_do_not_match_anything():
    """Otherwise "what is the" would score every document equally and the
    tie-break would silently pick alphabetically, looking like a real answer."""
    assert retrieve_documents("what is the of and to", context=GLOBAL) == []


def test_singular_and_plural_forms_retrieve_the_same_document():
    singular = retrieve_documents("explain a charge code", context=GLOBAL)
    plural = retrieve_documents("explain charge codes", context=GLOBAL)
    assert _ids(singular)[:1] == _ids(plural)[:1]


# ── Context ─────────────────────────────────────────────────────────────────


def test_module_context_lifts_that_modules_lesson_card():
    lesson = TutorContext(surface="lesson", module_id="lab-6", module_title="Tracking")
    results = retrieve_documents("What is this module about?", context=lesson)
    assert "relay-lesson-lab-6" in _ids(results)


def test_a_glossary_question_still_works_from_inside_a_lesson():
    """Context is a hint, not a cage.

    Hard-filtering to the current module would make "what is a BIC?" unanswerable
    on every page except the identifiers lesson.
    """
    lesson = TutorContext(surface="lesson", module_id="lab-7", module_title="Rails")
    results = retrieve_documents("What is a BIC?", context=lesson)
    assert results[0].document.source_id == "relay-concept-bic"


def test_currency_context_disambiguates_a_shared_rail_word():
    gbp = TutorContext(surface="scheme", currency="GBP")
    cad = TutorContext(surface="scheme", currency="CAD")
    gbp_top = retrieve_documents("what rails are available", context=gbp)[0]
    cad_top = retrieve_documents("what rails are available", context=cad)[0]
    assert "GBP" in gbp_top.document.currencies
    assert "CAD" in cad_top.document.currencies


def test_rail_name_context_is_used_as_a_signal():
    context = TutorContext(surface="scheme", currency="GBP", rail_name="CHAPS")
    results = retrieve_documents("how fast is it", context=context)
    assert "chaps" in results[0].document.source_id


# ── No-match handling ───────────────────────────────────────────────────────


def test_an_unrelated_question_with_no_context_retrieves_nothing():
    """Empty is the correct answer. The engine turns it into a clarification;
    inventing a weak match here would let an ungrounded answer look grounded."""
    assert retrieve_documents("What is the capital of Peru?", context=GLOBAL) == []


def test_an_unrelated_question_inside_a_lesson_falls_back_to_that_lesson():
    lesson = TutorContext(surface="lesson", module_id="lab-3", module_title="VoP")
    results = retrieve_documents("blorptastic quuxflarn", context=lesson)
    assert _ids(results) == ["relay-lesson-lab-3"]


def test_an_unrelated_question_on_a_scheme_surface_falls_back_to_that_currency():
    context = TutorContext(surface="scheme", currency="KES")
    results = retrieve_documents("blorptastic quuxflarn", context=context)
    assert _ids(results) == ["relay-scheme-kes"]


def test_the_fallback_resolves_exactly_one_canonical_document():
    """A fallback that returned everything for the module would hand the model a
    pile of unrelated evidence for a question it could not parse."""
    lesson = TutorContext(surface="lesson", module_id="lab-3")
    assert len(retrieve_documents("blorptastic quuxflarn", context=lesson)) == 1


def test_no_returned_document_ever_has_a_non_positive_score_when_there_was_a_match():
    results = retrieve_documents("How does correspondent banking work?", context=GLOBAL)
    assert results
    assert all(result.score > 0 for result in results)


# ── Ordering, limits, determinism ───────────────────────────────────────────


def test_results_are_ordered_by_score_then_source_id():
    results = retrieve_documents("payment settlement rail fees", context=GLOBAL, limit=20)
    keys = [(-result.score, result.document.source_id) for result in results]
    assert keys == sorted(keys)


def test_ties_break_on_source_id_ascending_not_insertion_order():
    """Insertion order is the catalogue's build order, which is incidental.

    Making the tie-break explicit is what stops a reordering of the concept-card
    list from silently changing which evidence the model sees.
    """
    results = retrieve_documents("payment", context=GLOBAL, limit=30)
    for earlier, later in zip(results, results[1:]):
        if earlier.score == later.score:
            assert earlier.document.source_id < later.document.source_id


def test_the_limit_is_respected():
    assert len(retrieve_documents("payment rail settlement", context=GLOBAL, limit=3)) == 3


def test_the_default_limit_is_six():
    results = retrieve_documents("payment rail settlement fees tracking", context=GLOBAL)
    assert len(results) <= 6


@pytest.mark.parametrize("limit", [0, -1])
def test_a_non_positive_limit_returns_nothing_rather_than_everything(limit):
    assert retrieve_documents("iban", context=GLOBAL, limit=limit) == []


def test_retrieval_is_deterministic_across_calls():
    first = retrieve_documents("how are fees deducted", context=GLOBAL)
    second = retrieve_documents("how are fees deducted", context=GLOBAL)
    assert _ids(first) == _ids(second)
    assert [result.score for result in first] == [result.score for result in second]


def test_results_are_retrieved_document_models():
    results = retrieve_documents("iban", context=GLOBAL)
    assert all(isinstance(result, RetrievedDocument) for result in results)
    assert results[0].document.source_id
    assert isinstance(results[0].score, float)


def test_retrieval_needs_no_database_session_or_network():
    """The signature is the enforcement: there is nowhere to pass a Session.

    Retrieval running in-process is what keeps it inside the request's latency
    budget and what makes the Task 1.3 benchmark meaningful.
    """
    import inspect

    parameters = set(inspect.signature(retrieve_documents).parameters)
    assert parameters == {"query", "context", "limit"}


def test_an_empty_query_retrieves_nothing_without_context():
    assert retrieve_documents("   ", context=GLOBAL) == []


# ── Term rarity ─────────────────────────────────────────────────────────────
#
# Raw overlap counts treat every word as equally informative. In this catalogue
# "payment" appears in nearly every document and "serial" in one, so a title hit
# on the ubiquitous word outranks body hits on the distinctive one — and the
# tutor answers out of the wrong document while looking perfectly grounded.


def test_a_distinctive_term_outranks_a_ubiquitous_one():
    """"serial" and "cover" name one specific concept; "payment" names the domain."""
    lesson = TutorContext(surface="lesson", module_id="lab-4")
    results = retrieve_documents(
        "What is the difference between a serial and a cover payment?", context=lesson
    )
    assert results[0].document.source_id == "relay-lesson-lab-4"


def test_a_rare_identifier_beats_a_common_word_in_a_title():
    results = retrieve_documents(
        "Why did SWIFT retire MT103 for cross-border payments?",
        context=TutorContext(surface="lesson", module_id="lab-8"),
    )
    assert "relay-lesson-lab-8" in _ids(results)[:3]


def test_an_off_topic_question_sharing_one_common_word_retrieves_nothing():
    """"good" appears in this catalogue ("the funds are good", "good only when
    the cycle settles"). One incidental overlap is not a match, and returning a
    document for it is what turns an out-of-scope question into a confident,
    cited, wrong answer."""
    assert retrieve_documents("Recommend a good restaurant in Lagos", context=GLOBAL) == []
    assert retrieve_documents("Who won the football last night?", context=GLOBAL) == []


def test_a_genuine_single_term_question_still_retrieves():
    """The floor must not silence real one-word questions."""
    assert retrieve_documents("UETR", context=GLOBAL)
    assert retrieve_documents("CHAPS", context=GLOBAL)
    assert retrieve_documents("What is an IBAN?", context=GLOBAL)


def test_the_surface_itself_anchors_its_canonical_document():
    """A tracking question often has no distinctive tracking *word* in it.

    "Why has my payment been sitting at the same bank for two days?" is a
    tracking question whose every term is domain-generic, so lexical scoring
    alone lands somewhere unrelated. The surface is the missing subject, exactly
    as `module_id` and `currency` are on their own pages.
    """
    tracking = TutorContext(surface="tracking")
    results = retrieve_documents(
        "Why has my payment been sitting at the same bank for two days?",
        context=tracking,
    )
    assert "relay-concept-payment-tracking" in _ids(results)[:3]


def test_a_surface_anchor_does_not_outrank_a_direct_lexical_hit():
    """The anchor is a floor, not a thumb on the scale.

    Asking "what is an IBAN?" on the tracking page must still answer about IBANs.
    """
    tracking = TutorContext(surface="tracking")
    results = retrieve_documents("What is an IBAN?", context=tracking)
    assert results[0].document.source_id == "relay-concept-iban"


def test_a_country_specific_rail_does_not_outrank_the_concept_it_implements():
    """A rail document is about one country's implementation of a mechanism.

    "What decides an RTGS versus a batch rail" names no country, and neither
    does the lesson context — but India's and Nigeria's rails are both literally
    called "RTGS", so a shared-term match put them above the card that defines
    the mechanism. Two of the six evidence slots then describe countries the
    learner never mentioned.

    The rule is narrow on purpose: the penalty applies only when the currency
    appears in neither the query nor the context. Naming a rail directly
    ("Explain CHAPS") is unaffected.
    """
    results = retrieve_documents(
        "What decides an RTGS versus a batch rail?",
        context=TutorContext(surface="lesson", module_id="lab-7"),
    )
    top_three = _ids(results)[:3]
    assert "relay-concept-rtgs" in top_three
    assert not any(identifier.startswith("relay-rail-inr-") for identifier in top_three)


def test_naming_a_rail_directly_still_retrieves_it_first():
    """Guards the fix above from becoming a blanket penalty on rail documents."""
    assert retrieve_documents("Explain CHAPS", context=GLOBAL)[0].document.source_id == (
        "relay-rail-gbp-chaps"
    )
    assert "fedwire" in retrieve_documents("What is Fedwire used for?", context=GLOBAL)[
        0
    ].document.source_id


def test_a_currency_named_in_the_query_keeps_its_rails_ranked():
    results = retrieve_documents("What are the INR rails?", context=GLOBAL)
    assert any("inr" in identifier for identifier in _ids(results)[:3])
