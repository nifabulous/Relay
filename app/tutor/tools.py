"""Read-only lookups the tutor model is allowed to make against Relay data.

This registry is the model's entire reach into the application. Three lookups,
all reads, all resolving an identifier that must already exist in a curated
Relay catalogue.

**Resolution is a membership test, never a query.** Every argument is normalised
and then checked against a set built from the catalogue. A value that is not in
the set resolves to nothing; it is never interpolated into a query, a path, or a
URL. That is why a SQL fragment, a traversal string, or a tracking identifier
passed as a module ID is uninteresting here — there is nothing for it to reach.

The threat model is not a clever prompt. It is the ordinary case of a model
emitting a plausible-looking argument. A tool that accepted free text and passed
it onward would turn "look up account 12345" into a request the *application*
makes on the model's behalf, with the application's own credentials.

**Nothing here mutates, and nothing here performs I/O.** No database handle, no
HTTP client, no filesystem access. The catalogues are already in memory. A test
asserts the absence of those imports rather than trusting the convention, because
the cost of one casually added helper is a permanent widening of what the model
can do.

Tracking is deliberately absent. The MVP explains a *summary* the frontend
already displays; it never looks a payment up by identifier.
"""
from functools import lru_cache
from typing import Dict, List, Optional, Protocol, runtime_checkable

from app.data.payment_schemes import list_currencies_with_schemes
from app.data.tutor_knowledge import TutorDocument, build_tutor_catalog

# What a learner types, mapped to what the catalogue calls it. Without this a
# learner asking about a "SWIFT code" gets no concept card, and the model falls
# back to answering from memory — the one thing the grounding layer exists to
# prevent.
_TERM_SYNONYMS: Dict[str, str] = {
    "swift code": "relay-concept-bic",
    "swift codes": "relay-concept-bic",
    "swiftcode": "relay-concept-bic",
    "bank identifier code": "relay-concept-bic",
    "iban number": "relay-concept-iban",
    "international bank account number": "relay-concept-iban",
    "unique end-to-end transaction reference": "relay-concept-uetr",
    "verification of payee": "relay-concept-vop",
    "confirmation of payee": "relay-concept-vop",
    "payee verification": "relay-concept-vop",
    "name check": "relay-concept-vop",
    "gpi": "relay-concept-swift-gpi",
    "swift gpi": "relay-concept-swift-gpi",
    "nostro": "relay-concept-correspondent-banking",
    "vostro": "relay-concept-correspondent-banking",
    "correspondent": "relay-concept-correspondent-banking",
    "correspondent bank": "relay-concept-correspondent-banking",
    "intermediary bank": "relay-concept-correspondent-banking",
    "real-time gross settlement": "relay-concept-rtgs",
    "real time gross settlement": "relay-concept-rtgs",
    "automated clearing house": "relay-concept-ach",
    "batch settlement": "relay-concept-ach",
    "charge code": "relay-concept-fees",
    "charge codes": "relay-concept-fees",
    "lift fee": "relay-concept-fees",
    "fx margin": "relay-concept-fees",
    "our sha ben": "relay-concept-fees",
    "tracking": "relay-concept-payment-tracking",
    "payment tracking": "relay-concept-payment-tracking",
    "pacs.008": "relay-concept-iso-20022",
    "mt103": "relay-concept-iso-20022",
    "message format": "relay-concept-rails-vs-messages",
    "payment rail": "relay-concept-rails-vs-messages",
}

_MAX_SCHEME_DOCUMENTS = 12

# Words shared by half the rail names in the catalogue. Matching on one of these
# means "Blorptastic Payments" resolves to Faster Payments, and the tutor then
# answers a question about a rail that does not exist with confident, cited
# detail about one that does. A rail is identified by its distinctive word.
_GENERIC_RAIL_WORDS = frozenset(
    {
        "payment", "payments", "transfer", "transfers", "credit", "debit", "direct",
        "instant", "system", "systems", "service", "services", "bank", "banking",
        "net", "network", "clearing", "settlement", "scheme", "rail", "fast",
    }
)


def _normalise(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.strip().lower().split())


# The catalogue is static, so these three rebuilt the same dicts on every tool
# call — one full walk of 73 documents per lookup, inside the request budget.
@lru_cache(maxsize=1)
def _catalog_by_id() -> Dict[str, TutorDocument]:
    return {document.source_id: document for document in build_tutor_catalog()}


@lru_cache(maxsize=1)
def _known_module_ids() -> set:
    return {
        module_id
        for document in build_tutor_catalog()
        if document.source_id.startswith("relay-lesson-")
        for module_id in document.module_ids
    }


@lru_cache(maxsize=1)
def _concept_index() -> Dict[str, str]:
    """Every accepted spelling of a concept, mapped to its card.

    Built from the catalogue's own topics so a new concept card is reachable by
    its topic the moment it is added, with the synonym table layered on top for
    the phrasings a learner uses that a curator would not write as a topic.
    """
    index: Dict[str, str] = {}
    for document in build_tutor_catalog():
        if not document.source_id.startswith("relay-concept-"):
            continue
        for topic in document.topics:
            index.setdefault(topic, document.source_id)
            index.setdefault(topic.replace("-", " "), document.source_id)
    index.update(_TERM_SYNONYMS)
    return index


@runtime_checkable
class TutorToolRegistry(Protocol):
    """The lookups the engine may hand to a model.

    A Protocol rather than a base class so tests can supply a fake without
    inheriting production behaviour — and so the engine's dependency is the
    shape of these three reads, not a concrete implementation it could reach
    past.
    """

    def get_lesson_reference(self, module_id: str) -> Optional[TutorDocument]: ...

    def get_glossary_reference(self, term: str) -> Optional[TutorDocument]: ...

    def get_scheme_reference(
        self, currency: str, rail_name: Optional[str] = None
    ) -> List[TutorDocument]: ...


def get_lesson_reference(module_id: str) -> Optional[TutorDocument]:
    """The lesson card for a curriculum module, or None if there is no such module."""
    normalised = _normalise(module_id)
    if normalised not in _known_module_ids():
        return None
    return _catalog_by_id().get(f"relay-lesson-{normalised}")


def get_glossary_reference(term: str) -> Optional[TutorDocument]:
    """The concept card defining ``term``, or None if Relay does not define it.

    Only ever a concept card. Widening this to "whichever document mentions the
    word" would let a rail document's dated operator claims be presented to the
    learner as a definition.
    """
    normalised = _normalise(term)
    if not normalised:
        return None
    source_id = _concept_index().get(normalised)
    if source_id is None:
        return None
    return _catalog_by_id().get(source_id)


def get_scheme_reference(
    currency: str, rail_name: Optional[str] = None
) -> List[TutorDocument]:
    """Scheme documents for a currency, narrowed to one rail when named.

    An unknown rail returns nothing rather than falling back to the currency's
    full set: answering a question about a rail that does not exist with
    confident detail about four that do is worse than saying it is unknown.
    """
    normalised = _normalise(currency).upper()
    if normalised not in set(list_currencies_with_schemes()):
        return []

    catalog = build_tutor_catalog()
    overview = [
        document
        for document in catalog
        if document.source_id == f"relay-scheme-{normalised.lower()}"
    ]
    rails = [
        document
        for document in catalog
        if document.source_id.startswith("relay-rail-")
        and normalised in document.currencies
    ]

    if rail_name:
        query = _normalise(rail_name).replace("-", " ")
        wanted = {token for token in query.split() if len(token) > 1}
        if not wanted:
            return []
        distinctive = wanted - _GENERIC_RAIL_WORDS
        if distinctive:
            matched = [
                document
                for document in rails
                if distinctive
                & set(_normalise(document.title).replace("-", " ").split())
            ]
        else:
            # Some rails really are named entirely generically ("Bank Transfer
            # (Direct Credit)"). For those the whole phrase has to appear in the
            # title, which is stricter than token overlap, not looser.
            matched = [
                document
                for document in rails
                if query in _normalise(document.title).replace("-", " ")
            ]
        return matched[:_MAX_SCHEME_DOCUMENTS]

    return (overview + rails)[:_MAX_SCHEME_DOCUMENTS]


class RelayTutorTools:
    """The production registry. Holds no state and needs no construction argument.

    Stateless by design: the engine can build one per request without cost, and
    there is no place for a caller to attach a connection, a credential, or a
    learner identity that the model could then reach.
    """

    def get_lesson_reference(self, module_id: str) -> Optional[TutorDocument]:
        return get_lesson_reference(module_id)

    def get_glossary_reference(self, term: str) -> Optional[TutorDocument]:
        return get_glossary_reference(term)

    def get_scheme_reference(
        self, currency: str, rail_name: Optional[str] = None
    ) -> List[TutorDocument]:
        return get_scheme_reference(currency, rail_name)
