"""The tutor knowledge catalogue: coverage, stable IDs, and citable sources.

This catalogue is the tutor's only grounding layer. Every factual answer has to
cite a document from it, so a gap here is not a missing nicety — it is a
question the tutor structurally cannot answer without inventing a payment rule.
"""
import re

import pytest

from app.config import BASE_DIR
from app.data.payment_schemes import list_currencies_with_schemes
from app.data.tutor_knowledge import (
    TutorDocument,
    build_tutor_catalog,
    trusted_source_urls,
)
from app.tutor.redaction import redact_sensitive_text


@pytest.fixture(scope="module")
def catalog():
    return build_tutor_catalog()


def _by_id(catalog):
    return {document.source_id: document for document in catalog}


# ── Structural integrity ────────────────────────────────────────────────────


def test_every_source_id_is_unique(catalog):
    """A duplicate ID silently shadows a document during citation validation."""
    ids = [document.source_id for document in catalog]
    duplicates = {value for value in ids if ids.count(value) > 1}
    assert not duplicates, f"duplicate source_ids: {sorted(duplicates)}"


def test_every_document_has_usable_text_and_topics(catalog):
    for document in catalog:
        assert document.text.strip(), f"{document.source_id} has empty text"
        assert len(document.text) >= 80, f"{document.source_id} is too thin to ground an answer"
        assert document.topics, f"{document.source_id} has no topics"
        assert document.title.strip(), f"{document.source_id} has no title"


def test_source_kind_is_only_relay_or_official(catalog):
    for document in catalog:
        assert document.source_kind in {"relay", "official"}


def test_every_official_document_carries_a_source_url(catalog):
    """"Official" is a claim about provenance.

    A document labelled official with nothing to point at gives the learner no
    way to check it, which is the whole reason the distinction exists.
    """
    for document in catalog:
        if document.source_kind == "official":
            assert document.source_url, f"{document.source_id} is official with no URL"
            assert document.source_url.startswith("https://")


def test_topics_are_lowercase_hyphenated_tokens(catalog):
    """Retrieval boosts exact topic matches, so casing drift silently costs recall."""
    for document in catalog:
        for topic in document.topics:
            assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", topic), (
                f"{document.source_id} has non-token topic {topic!r}"
            )


# ── Coverage ────────────────────────────────────────────────────────────────

_REQUIRED_CONCEPT_TOPICS = (
    "bic",
    "iban",
    "uetr",
    "correspondent-banking",
    "swift-gpi",
    "rtgs",
    "ach",
    "vop",
    "fees",
    "payment-tracking",
    "iso-20022",
    "rails-vs-messages",
)


@pytest.mark.parametrize("topic", _REQUIRED_CONCEPT_TOPICS)
def test_a_concept_card_exists_for_each_required_topic(catalog, topic):
    matches = [
        document
        for document in catalog
        if topic in document.topics and document.source_id.startswith("relay-concept-")
    ]
    assert matches, f"no concept card covers {topic}"


def _curriculum_module_ids() -> list[str]:
    """Read module IDs out of the TypeScript curriculum — at TEST time only.

    The runtime catalogue must never import TypeScript. Doing the parity check
    here is what keeps the hand-written Python lesson cards honest: add a module
    to the curriculum without a backend card and this fails.
    """
    source = (BASE_DIR / "frontend/src/features/learn/curriculum.ts").read_text()
    body = source.split("export const CURRICULUM", 1)[1]
    return re.findall(r'^\s{4}id: "([^"]+)"', body, flags=re.MULTILINE)


def test_the_curriculum_has_the_expected_shape():
    """Guards the parser above: a curriculum reshuffle must not silently
    reduce this to an empty list, which would make the parity test vacuous."""
    ids = _curriculum_module_ids()
    assert len(ids) == 16
    assert "lab-1" in ids
    assert "capstone" in ids


def test_every_curriculum_module_has_a_backend_lesson_card(catalog):
    covered = {
        document.module_ids[0]
        for document in catalog
        if document.source_id.startswith("relay-lesson-") and document.module_ids
    }
    missing = set(_curriculum_module_ids()) - covered
    assert not missing, f"curriculum modules with no backend card: {sorted(missing)}"


def test_lesson_cards_carry_their_module_id_title_and_outcomes(catalog):
    card = _by_id(catalog)["relay-lesson-lab-1"]
    assert card.module_ids == ["lab-1"]
    assert "BIC" in card.title or "IBAN" in card.title
    assert "MOD-97" in card.text or "decode" in card.text.lower()
    assert card.source_kind == "relay"


def test_every_supported_currency_has_a_scheme_overview_document(catalog):
    covered = {
        currency
        for document in catalog
        if document.source_id.startswith("relay-scheme-")
        for currency in document.currencies
    }
    missing = set(list_currencies_with_schemes()) - covered
    assert not missing, f"currencies with no scheme document: {sorted(missing)}"


def test_the_international_swift_catalogue_has_its_own_document(catalog):
    document = _by_id(catalog).get("relay-scheme-international")
    assert document is not None
    assert "swift" in " ".join(document.topics)


def test_scheme_documents_preserve_the_verification_month(catalog):
    """`verifiedAsof` is what lets an answer say *when* a fact was checked.

    Dropping it turns a dated operator fact into a timeless-sounding claim.
    """
    scheme_documents = [
        document for document in catalog if document.source_id.startswith("relay-scheme-")
    ]
    assert scheme_documents
    for document in scheme_documents:
        assert re.fullmatch(r"\d{4}-\d{2}", document.verified_as_of or ""), (
            f"{document.source_id} has no usable verified_as_of"
        )


def test_individual_rails_are_retrievable_as_their_own_documents(catalog):
    """Whole-currency documents would make "explain CHAPS" retrieve everything
    about GBP, burying the one rail the learner asked about."""
    rails = [
        document
        for document in catalog
        if document.source_id.startswith("relay-rail-") and "GBP" in document.currencies
    ]
    titles = " ".join(document.title for document in rails)
    assert "CHAPS" in titles
    assert "Faster Payments" in titles


# ── Stability ───────────────────────────────────────────────────────────────

# Frozen on 2026-08-15. These IDs are the join key between a model citation and
# a catalogue document, so renaming one silently invalidates every stored
# reference to it. Editing a card's prose must NOT change its ID; only a
# genuinely new document earns a new entry here.
_FROZEN_CONCEPT_IDS = frozenset(
    {
        "relay-concept-ach",
        "relay-concept-bic",
        "relay-concept-correspondent-banking",
        "relay-concept-fees",
        "relay-concept-iban",
        "relay-concept-iso-20022",
        "relay-concept-payment-tracking",
        "relay-concept-rails-vs-messages",
        "relay-concept-rtgs",
        "relay-concept-swift-gpi",
        "relay-concept-uetr",
        "relay-concept-vop",
    }
)


def test_the_frozen_concept_ids_are_all_still_present(catalog):
    present = {
        document.source_id
        for document in catalog
        if document.source_id.startswith("relay-concept-")
    }
    assert _FROZEN_CONCEPT_IDS <= present, (
        f"concept IDs disappeared or were renamed: {sorted(_FROZEN_CONCEPT_IDS - present)}"
    )


# ── Citation allowlist ──────────────────────────────────────────────────────


def test_trusted_urls_are_derived_from_the_catalogue(catalog):
    urls = trusted_source_urls()
    assert urls
    for document in catalog:
        if document.source_url:
            assert document.source_url in urls


def test_no_url_outside_the_catalogue_is_trusted():
    """The allowlist is what stops a fabricated citation from looking real."""
    urls = trusted_source_urls()
    assert "https://example.com/made-up-source" not in urls
    assert "https://en.wikipedia.org/wiki/ISO_9362" not in urls


def test_every_trusted_url_is_https():
    for url in trusted_source_urls():
        assert url.startswith("https://"), url


# ── Privacy ─────────────────────────────────────────────────────────────────


def test_no_document_contains_anything_the_redactor_would_strip(catalog):
    """Doubles as the "no real credentials in the catalogue" guarantee.

    Teaching material explains identifier *structure*; it does not need a
    specimen IBAN or account number. Pasting one would put a redactable string
    into the retrieved evidence, so the tutor would then quote `[IBAN]` back at
    the learner mid-sentence and its own citation-evidence check would fail
    against the unredacted source text.
    """
    for document in catalog:
        assert redact_sensitive_text(document.text) == document.text, (
            f"{document.source_id} contains a redactable identifier"
        )
        assert redact_sensitive_text(document.title) == document.title


def test_documents_are_bounded_in_size(catalog):
    """Whole lesson files would blow the input-token budget in Task 2.3."""
    for document in catalog:
        assert len(document.text) <= 2400, (
            f"{document.source_id} is {len(document.text)} chars — too long to retrieve"
        )


def test_the_catalogue_is_a_list_of_tutor_documents(catalog):
    assert isinstance(catalog, list)
    assert all(isinstance(document, TutorDocument) for document in catalog)
    assert len(catalog) >= 40
