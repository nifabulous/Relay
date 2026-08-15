"""The tutor tool registry: what the model is allowed to look up, and nothing else.

The registry is the model's only way to reach Relay data. Everything reachable
through it is a read of curated, already-public teaching material, resolved by
an identifier that has to exist in a Relay catalogue before any lookup happens.

The threat this defends against is not a clever prompt — it is the ordinary case
of a model emitting a plausible-looking argument. If a tool accepted free text
and passed it onward, "look up account 12345" or "fetch https://…" would become
a request the application makes on the model's behalf.
"""
import inspect

import pytest

from app.data.tutor_knowledge import TutorDocument
from app.tutor import tools as tools_module
from app.tutor.tools import (
    RelayTutorTools,
    TutorToolRegistry,
    get_glossary_reference,
    get_lesson_reference,
    get_scheme_reference,
)


@pytest.fixture
def registry() -> TutorToolRegistry:
    return RelayTutorTools()


# ── Lessons ─────────────────────────────────────────────────────────────────


def test_a_known_module_id_resolves_to_its_lesson_card(registry):
    document = registry.get_lesson_reference("lab-6")
    assert document is not None
    assert document.source_id == "relay-lesson-lab-6"
    assert "lab-6" in document.module_ids


def test_an_unknown_module_id_returns_none_rather_than_guessing(registry):
    assert registry.get_lesson_reference("lab-99") is None
    assert registry.get_lesson_reference("") is None


@pytest.mark.parametrize(
    "hostile",
    [
        "lab-1'; DROP TABLE banks;--",
        "https://evil.example/steal",
        "../../etc/passwd",
        "lab-1 OR 1=1",
        "97ed4827-7b6f-4491-a06f-b548d5a7512d",
    ],
)
def test_a_hostile_module_identifier_resolves_to_nothing(registry, hostile):
    """Resolution is a membership test against a known set, not a query.

    There is no string an attacker can supply that becomes part of a lookup —
    it either equals a curriculum module ID or it resolves to nothing.
    """
    assert registry.get_lesson_reference(hostile) is None


# ── Glossary ────────────────────────────────────────────────────────────────


def test_a_known_term_resolves_to_its_concept_card(registry):
    document = registry.get_glossary_reference("IBAN")
    assert document is not None
    assert document.source_id == "relay-concept-iban"


def test_term_lookup_is_case_and_whitespace_insensitive(registry):
    assert registry.get_glossary_reference("  uetr ") is not None
    assert registry.get_glossary_reference("UETR") == registry.get_glossary_reference("uetr")


def test_a_common_synonym_resolves_to_the_canonical_card(registry):
    """A learner types "SWIFT code"; the catalogue calls it a BIC.

    Failing that lookup would send the model back to answer from memory, which
    is the one thing the grounding layer exists to prevent.
    """
    assert registry.get_glossary_reference("SWIFT code").source_id == "relay-concept-bic"
    assert (
        registry.get_glossary_reference("verification of payee").source_id
        == "relay-concept-vop"
    )


def test_an_unknown_term_returns_none(registry):
    assert registry.get_glossary_reference("blorptastic") is None
    assert registry.get_glossary_reference("") is None


def test_a_term_lookup_never_returns_a_scheme_or_lesson_document(registry):
    """The glossary tool promises a concept card. Silently widening it would
    let a scheme document's operator claims be presented as a definition."""
    for term in ("iban", "chaps", "faster payments", "lab-1"):
        document = registry.get_glossary_reference(term)
        if document is not None:
            assert document.source_id.startswith("relay-concept-")


# ── Schemes ─────────────────────────────────────────────────────────────────


def test_a_currency_resolves_to_its_overview_and_rails(registry):
    documents = registry.get_scheme_reference("GBP")
    ids = [document.source_id for document in documents]
    assert "relay-scheme-gbp" in ids
    assert any(identifier.startswith("relay-rail-gbp-") for identifier in ids)


def test_a_named_rail_narrows_the_result_to_that_rail(registry):
    documents = registry.get_scheme_reference("GBP", "CHAPS")
    assert documents
    assert all("chaps" in document.source_id for document in documents)


def test_currency_lookup_is_case_insensitive(registry):
    assert registry.get_scheme_reference("gbp") == registry.get_scheme_reference("GBP")


def test_an_unsupported_currency_returns_an_empty_list(registry):
    assert registry.get_scheme_reference("XYZ") == []
    assert registry.get_scheme_reference("") == []


def test_an_unknown_rail_for_a_known_currency_returns_empty_not_the_whole_currency(
    registry,
):
    """Falling back to every GBP rail would answer a question about a rail that
    does not exist with confident detail about four that do."""
    assert registry.get_scheme_reference("GBP", "Blorptastic Payments") == []


def test_scheme_documents_keep_their_official_source_metadata(registry):
    for document in registry.get_scheme_reference("GBP"):
        if document.source_kind == "official":
            assert document.source_url
            assert document.verified_as_of


@pytest.mark.parametrize("hostile", ["GBP; DROP TABLE", "GBP OR 1=1", "../GBP"])
def test_a_hostile_currency_resolves_to_nothing(registry, hostile):
    assert registry.get_scheme_reference(hostile) == []


# ── Read-only surface ───────────────────────────────────────────────────────

_MUTATING_VERBS = (
    "create", "update", "delete", "remove", "insert", "write", "save", "set",
    "post", "put", "patch", "send", "submit", "approve", "execute", "run",
    "import", "seed", "track", "prepare", "pay", "settle", "release",
)


def test_the_registry_exposes_exactly_three_read_operations():
    """A registry that grows a fourth method grows it deliberately.

    Every method here is reachable by the model, so an addition made casually —
    a helper, a convenience passthrough — widens the model's reach without
    anyone deciding to.
    """
    public = {
        name
        for name, _ in inspect.getmembers(RelayTutorTools, inspect.isfunction)
        if not name.startswith("_")
    }
    assert public == {
        "get_lesson_reference",
        "get_glossary_reference",
        "get_scheme_reference",
    }


def test_no_registry_method_name_suggests_a_mutation():
    for name, _ in inspect.getmembers(RelayTutorTools, inspect.isfunction):
        if name.startswith("_"):
            continue
        assert name.startswith("get_")
        assert not any(verb in name.replace("get_", "", 1) for verb in _MUTATING_VERBS)


def test_the_tools_module_imports_no_database_session_or_network_client():
    """Enforced by import graph, not by convention.

    `tools.py` resolving identifiers against in-memory catalogues means there is
    no connection for a crafted argument to reach, and no request for it to
    trigger. A future import of `requests` or `Session` here would silently
    reopen both.
    """
    source = inspect.getsource(tools_module)
    for forbidden in (
        "import requests",
        "import httpx",
        "import urllib",
        "from sqlalchemy",
        "import sqlalchemy",
        "Session",
        "subprocess",
        "open(",
    ):
        assert forbidden not in source, f"tools.py must not reference {forbidden!r}"


def test_module_level_functions_and_the_registry_agree():
    """The Protocol exists so the engine can be handed a fake in tests.

    If the two paths could diverge, tests would exercise a registry the
    production request path never uses.
    """
    registry = RelayTutorTools()
    assert get_lesson_reference("lab-1") == registry.get_lesson_reference("lab-1")
    assert get_glossary_reference("bic") == registry.get_glossary_reference("bic")
    assert get_scheme_reference("EUR") == registry.get_scheme_reference("EUR")


def test_the_concrete_registry_satisfies_the_protocol():
    assert isinstance(RelayTutorTools(), TutorToolRegistry)


# ── Bounded output ──────────────────────────────────────────────────────────


def test_results_are_tutor_documents_not_raw_scheme_dictionaries(registry):
    """Raw scheme records carry fields the tutor has no business relaying.

    Returning the catalogue's own dictionaries would put whatever
    `payment_schemes.py` grows next in front of the model automatically.
    """
    for document in registry.get_scheme_reference("USD"):
        assert isinstance(document, TutorDocument)


def test_a_scheme_lookup_is_bounded_in_size(registry):
    documents = registry.get_scheme_reference("USD")
    assert len(documents) <= 12
    assert all(len(document.text) <= 2400 for document in documents)
