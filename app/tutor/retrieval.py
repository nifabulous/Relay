"""Deterministic lexical retrieval over the tutor knowledge catalogue.

**Lexical first, embeddings only if measured.** This is a bounded, curated
catalogue of a few dozen short documents whose vocabulary is technical and
largely unambiguous — "CHAPS", "UETR", "pacs.008" mean one thing each. Term
overlap does well on exactly that shape. A vector store would add a service, a
migration, an embedding call on the request path, and a source of
non-determinism, in exchange for semantic matching this corpus barely needs.
Task 1.3 measures whether that trade ever becomes worth making; until the gate
is met, this is the retriever.

**Pure and in-process.** No `Session` parameter, no network, no model call.
That is what keeps retrieval inside the request's latency budget and what makes
the same query return the same evidence every time — which in turn is what makes
a tutor answer reproducible in a bug report.

**Empty is a valid result.** A question with no lexical match and no usable
context returns nothing, and the engine turns that into a clarification. The
alternative — always returning the least-bad document — is worse than useless:
it dresses an ungrounded answer in a citation.
"""
import math
import re
from functools import lru_cache
from typing import Dict, List, Sequence, Set

from pydantic import BaseModel

from app.data.tutor_knowledge import TutorDocument, build_tutor_catalog

from .schemas import TutorContext


class RetrievedDocument(BaseModel):
    document: TutorDocument
    score: float


# Words that appear in almost every question and in almost every document.
# Without this, "what is the" matches everything with equal weight and the
# tie-break quietly returns whatever sorts first — an answer shaped like a
# result, grounded in nothing the learner asked about.
_STOP_WORDS = frozenset(
    {
        "a", "about", "all", "an", "and", "any", "are", "as", "at", "be", "been", "between",
        "but", "by", "can", "could", "did", "do", "does", "explain", "for", "from", "get",
        "give", "happen", "happens", "has", "have", "how", "i", "if", "in", "into", "is",
        "it", "its", "just", "know", "like", "many", "me", "mean", "means", "much", "my",
        "not", "of", "on", "one", "or", "other", "our", "out", "over", "please", "same",
        "should", "show", "so", "some", "tell", "than", "that", "the", "their", "them",
        "then", "there", "these", "they", "this", "those", "to", "under", "up", "us",
        "use", "used", "want", "was", "we", "were", "what", "when", "where", "which",
        "who", "why", "will", "with", "would", "you", "your",
    }
)

# Title and topic hits outweigh body hits because a term in the title is what
# the document is *about*, while the same term in the body may be one clause of
# a contrast ("unlike CHAPS, Bacs ..."). Ranking body overlap equally would let
# a document that merely mentions a rail outrank the document about it.
_TITLE_WEIGHT = 6.0
_TOPIC_WEIGHT = 5.0
_BODY_WEIGHT = 1.0

# Context is a hint, not a filter. These are deliberately smaller than a title
# hit so a glossary question asked from inside a lesson still reaches the
# glossary: on a rails lesson, "what is a BIC?" must return the BIC card, not
# the rails card.
_CONTEXT_MODULE_BOOST = 3.0
_CONTEXT_CURRENCY_BOOST = 2.5
_CONTEXT_RAIL_BOOST = 4.0
_CONTEXT_TOPIC_BOOST = 2.0

# One incidental word in common is not a match. "Recommend a good restaurant in
# Lagos" overlaps this catalogue only on "good" ("the funds are good", "good
# only when the cycle settles"), and returning a document for that turns an
# out-of-scope question into a confident, cited, wrong answer. The floor sits
# above a single mid-frequency body hit and well below any title or topic hit,
# so genuine one-word questions ("CHAPS", "UETR") still retrieve.
_MIN_LEXICAL_SCORE = 4.0

# Sized to reorder rails against concept cards on a shared generic term, while
# leaving a document that won on its own distinctive name (CHAPS, Fedwire,
# M-Pesa) comfortably in front — those carry a high-IDF title hit worth several
# times this.
_UNASKED_COUNTRY_PENALTY = 6.0

# The document that grounds "what am I even looking at" for a surface with no
# other identifying context. A tracking question is frequently phrased with no
# distinctive tracking word in it at all — "why has my payment been sitting at
# the same bank for two days?" is entirely domain-generic — so the page the
# learner is on is the only thing naming the subject. Surfaces whose subject is
# already carried by a typed field (lesson has `module_id`, scheme has
# `currency`, tool has `tool_name`) are deliberately absent.
_SURFACE_ANCHORS = {
    "tracking": "relay-concept-payment-tracking",
}

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> List[str]:
    return _TOKEN_RE.findall(text.lower())


def _singular(token: str) -> str:
    """Crude, deliberately so.

    A real stemmer would be another dependency and another thing to explain.
    "fees"/"fee" and "codes"/"code" are the whole problem in this vocabulary,
    and trailing-s handles them. The length floor keeps "gpi" and "ach" intact.
    """
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _term_set(text: str, *, drop_stop_words: bool = True) -> Set[str]:
    terms: Set[str] = set()
    for token in _tokenize(text):
        if drop_stop_words and token in _STOP_WORDS:
            continue
        terms.add(token)
        terms.add(_singular(token))
    return terms


@lru_cache(maxsize=1)
def _index() -> Dict[str, object]:
    """Tokenise the catalogue once and derive term rarity from it.

    Two things are built here because they depend on each other: the per-document
    term sets, and the inverse document frequency computed across those sets.

    IDF is what stops the ranking from being dominated by the domain's own
    vocabulary. In this catalogue "payment" appears in nearly every document
    while "serial" appears in one, so counting raw overlap makes a *title* hit on
    "payment" outrank *body* hits on "serial" and "cover" — and "what is the
    difference between a serial and a cover payment?" gets answered out of the
    tracking card. Weighting each term by log((N+1)/(df+1)) drives a
    near-universal term to approximately zero and leaves the distinctive ones
    carrying the decision.
    """
    catalog = build_tutor_catalog()
    terms_by_id: Dict[str, Dict[str, Set[str]]] = {}
    document_frequency: Dict[str, int] = {}

    for document in catalog:
        fields = {
            "title": _term_set(document.title),
            # Topics are authored tokens, not prose. Stop-word filtering would
            # only ever remove something a curator put there on purpose.
            "topics": _term_set(" ".join(document.topics), drop_stop_words=False),
            "body": _term_set(document.text),
        }
        terms_by_id[document.source_id] = fields
        for term in fields["title"] | fields["topics"] | fields["body"]:
            document_frequency[term] = document_frequency.get(term, 0) + 1

    total = len(catalog)
    idf = {
        term: math.log((total + 1) / (count + 1))
        for term, count in document_frequency.items()
    }
    return {"terms": terms_by_id, "idf": idf}


def _document_terms(document: TutorDocument) -> Dict[str, Set[str]]:
    return _index()["terms"][document.source_id]  # type: ignore[index]


def _idf(term: str) -> float:
    """Unseen terms are maximally rare, but they also match nothing, so the
    value only matters for keeping the arithmetic total."""
    return _index()["idf"].get(term, 0.0)  # type: ignore[union-attr]


def _context_terms(context: TutorContext) -> Set[str]:
    """Only the bounded, typed context fields — never a free-text summary.

    `result_summary` is learner- or tool-supplied and can be up to 4000
    characters. Letting it into the query would make retrieval steerable by
    whoever authored that text, which is the same trust boundary the policy
    module refuses to cross.
    """
    parts = [context.topic, context.rail_name, context.tool_name, context.module_title]
    return _term_set(" ".join(part for part in parts if part))


def _context_score(document: TutorDocument, context: TutorContext) -> float:
    score = 0.0
    if context.module_id and context.module_id in document.module_ids:
        score += _CONTEXT_MODULE_BOOST
    if context.currency and context.currency.upper() in document.currencies:
        score += _CONTEXT_CURRENCY_BOOST

    terms = _document_terms(document)
    if context.rail_name:
        rail_terms = _term_set(context.rail_name, drop_stop_words=False)
        if rail_terms & (terms["title"] | terms["topics"]):
            score += _CONTEXT_RAIL_BOOST

    hint_terms = _context_terms(context)
    if hint_terms & (terms["title"] | terms["topics"]):
        score += _CONTEXT_TOPIC_BOOST
    return score


def _weighted_overlap(query_terms: Set[str], document_terms: Set[str]) -> float:
    return sum(_idf(term) for term in query_terms & document_terms)


def _lexical_score(query_terms: Set[str], document: TutorDocument) -> float:
    terms = _document_terms(document)
    return (
        _TITLE_WEIGHT * _weighted_overlap(query_terms, terms["title"])
        + _TOPIC_WEIGHT * _weighted_overlap(query_terms, terms["topics"])
        + _BODY_WEIGHT * _weighted_overlap(query_terms, terms["body"])
    )


def _unasked_country_penalty(
    document: TutorDocument, query_terms: Set[str], context: TutorContext
) -> float:
    """Demote a country's rail when the learner named no country.

    A rail document describes one country's *implementation* of a mechanism.
    India's and Nigeria's rails are both literally named "RTGS", so "what
    decides an RTGS versus a batch rail" — which names no country, in a lesson
    context that names none either — ranked both of them above the card that
    defines RTGS. Two of six evidence slots then described countries nobody
    asked about.

    Deliberately narrow. The penalty applies only when the document's currency
    appears in neither the query nor the context, so naming a rail directly
    ("Explain CHAPS", "What is Fedwire used for?") is untouched: those win on a
    high-IDF title term that no other document has. It is a demotion rather than
    a filter, because a country's rail is still legitimate evidence for a
    general question — just not the *first* thing to reach for.
    """
    if not document.currencies or not document.source_id.startswith("relay-rail-"):
        return 0.0
    if context.currency and context.currency.upper() in document.currencies:
        return 0.0
    if any(currency.lower() in query_terms for currency in document.currencies):
        return 0.0
    return _UNASKED_COUNTRY_PENALTY


def _context_anchors(catalog: List[TutorDocument], context: TutorContext) -> Set[str]:
    """The documents describing *what the learner is currently looking at*.

    These are admitted even at zero lexical overlap, because a large share of
    real questions put the subject in the surface rather than in the sentence:
    "how fast is it" asked on the CHAPS page is a question about CHAPS. Scoring
    on words alone answers it out of whichever document happens to contain
    "fast", which is how a tutor ends up confidently discussing the wrong rail.

    Deliberately at most three — the named rail, the currency, the module. The
    surrounding neighbourhood is not admitted: handing the model every document
    near the learner's position, for a question it could not parse, produces an
    answer to the question the evidence suggests instead of the one asked.
    """
    by_id = {document.source_id: document for document in catalog}
    anchors: Set[str] = set()

    canonical_for_surface = _SURFACE_ANCHORS.get(context.surface)
    if canonical_for_surface and canonical_for_surface in by_id:
        anchors.add(canonical_for_surface)

    if context.rail_name:
        rail_terms = _term_set(context.rail_name, drop_stop_words=False)
        for document in catalog:
            if not document.source_id.startswith("relay-rail-"):
                continue
            if context.currency and context.currency.upper() not in document.currencies:
                continue
            if rail_terms & _document_terms(document)["title"]:
                anchors.add(document.source_id)

    if context.currency and f"relay-scheme-{context.currency.lower()}" in by_id:
        anchors.add(f"relay-scheme-{context.currency.lower()}")

    if context.module_id and f"relay-lesson-{context.module_id}" in by_id:
        anchors.add(f"relay-lesson-{context.module_id}")

    return anchors


def retrieve_documents(
    query: str,
    *,
    context: TutorContext,
    limit: int = 6,
) -> List[RetrievedDocument]:
    """The documents the tutor may cite when answering ``query``."""
    if limit <= 0:
        return []

    catalog = build_tutor_catalog()
    query_terms = _term_set(query)
    anchors = _context_anchors(catalog, context)

    scored: List[RetrievedDocument] = []
    for document in catalog:
        lexical = _lexical_score(query_terms, document) if query_terms else 0.0
        is_anchor = document.source_id in anchors
        if lexical < _MIN_LEXICAL_SCORE and not is_anchor:
            # Context boosts alone must not surface an arbitrary document the
            # query never touched — only the anchors above earn that, and only
            # because they are what the learner is looking at.
            continue
        scored.append(
            RetrievedDocument(
                document=document,
                score=lexical
                + _context_score(document, context)
                - _unasked_country_penalty(document, query_terms, context),
            )
        )

    if not scored:
        return []

    # Descending score, then ascending source_id. The second key is what makes
    # the result reproducible: without it, ties resolve to the catalogue's build
    # order, so reordering the concept-card list would silently change which
    # evidence the model receives.
    scored.sort(key=lambda result: (-result.score, result.document.source_id))
    return scored[:limit]


def has_usable_evidence(documents: Sequence[RetrievedDocument]) -> bool:
    """Return whether retrieval supplied a meaningful lexical hit.

    Context anchors can intentionally produce a non-empty result even when the
    learner's words do not match the catalogue. Those anchors are useful prompt
    context, but they are not strong enough to suppress the typed catalogue
    tools. The same lexical floor used to admit ordinary retrieval results is
    the explicit boundary for the provider optimization.
    """
    return any(result.score >= _MIN_LEXICAL_SCORE for result in documents)
