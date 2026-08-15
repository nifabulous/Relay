"""The tutor's grounding layer: concept cards, lesson cards, and rail documents.

Every factual tutor answer must cite a document from this catalogue. That makes
the catalogue the boundary of what the tutor can say: a topic with no document
is a topic the tutor must decline rather than improvise, which is the intended
behaviour for a payments teaching tool.

Three kinds of document, distinguished by `source_id` prefix and `source_kind`:

* `relay-concept-*` — Relay-authored explanations of a domain concept. Educational
  framing, no operator claims, so `source_kind="relay"` and no URL.
* `relay-lesson-*` — one per curriculum module, from `tutor_lesson_cards.py`.
* `relay-scheme-*` / `relay-rail-*` — generated from `app/data/payment_schemes.py`,
  which already carries verified operator URLs and a verification month. These
  make operator claims, so they are `source_kind="official"` and must carry a URL.

**Rails get their own documents, not just a per-currency summary.** A single
GBP document would mean "explain CHAPS" retrieves everything about sterling with
the one relevant rail buried inside it, and the retrieved evidence would then be
mostly noise against the input-token budget.

**No specimen identifiers anywhere.** A card teaching IBAN structure describes
the structure; it does not paste an example IBAN. Anything the redactor would
strip is a string that gets replaced with a placeholder at the provider boundary
— so the model would receive `[IBAN]` where the evidence said otherwise, and the
verbatim-evidence citation check in the engine would fail against the original
text. A test enforces this over the whole catalogue.
"""
import re
from functools import lru_cache
from typing import Dict, List, Literal, Optional, Set

from pydantic import BaseModel, Field

from .payment_schemes import (
    get_international_schemes,
    get_schemes_for_currency,
    list_currencies_with_schemes,
)
from .tutor_lesson_cards import LESSON_CARDS


class TutorDocument(BaseModel):
    """One retrievable, citable unit of grounding."""

    source_id: str
    title: str
    text: str
    topics: List[str]
    module_ids: List[str] = Field(default_factory=list)
    currencies: List[str] = Field(default_factory=list)
    source_url: Optional[str] = None
    # Additional operator URLs for the same subject. Kept separate from
    # `source_url` so a document still has one canonical citation target, while
    # every URL a learner might reasonably be pointed at stays inside the
    # allowlist. Without this, a rail with two operator pages would have one of
    # them treated as invented.
    related_source_urls: List[str] = Field(default_factory=list)
    verified_as_of: Optional[str] = None
    source_kind: Literal["relay", "official"]


def _slug(value: str) -> str:
    """Stable, lowercase, hyphenated token for use inside a `source_id`."""
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


# ── Concept cards ───────────────────────────────────────────────────────────
#
# The `source_id` values here are frozen: they are the join key between a model
# citation and a document, so a rename silently invalidates every reference to
# it. Rewriting a card's prose is fine; changing its ID is not.

_CONCEPT_CARDS: List[Dict[str, object]] = [
    {
        "source_id": "relay-concept-bic",
        "title": "BIC — the code that identifies a bank",
        "topics": ["bic", "identifiers", "swift", "iso-9362"],
        "text": (
            "A BIC, defined by ISO 9362 and often called a SWIFT code, identifies a "
            "financial institution rather than an account. It is eight or eleven "
            "characters: four letters for the institution, two letters for the ISO 3166 "
            "country, two characters for the location within that country, and an "
            "optional three characters for a branch. A head office is written with a "
            "branch code of three X characters, and an eight-character BIC means the same "
            "thing. BICs are public directory data — knowing one tells you which bank, "
            "never whose account. A BIC that is well formed is not necessarily "
            "registered, and a registered BIC is not necessarily reachable for the "
            "currency you are sending."
        ),
    },
    {
        "source_id": "relay-concept-iban",
        "title": "IBAN — the code that identifies an account",
        "topics": ["iban", "identifiers", "validation", "iso-13616"],
        "text": (
            "An IBAN, defined by ISO 13616, identifies a specific account in a specific "
            "country. It begins with a two-letter country code and two check digits, "
            "followed by a country-defined domestic portion that usually embeds the bank "
            "identifier and the account number. Total length is fixed per country and "
            "differs between countries, so length is a country-specific check rather than "
            "a universal one. The check digits use the ISO 7064 MOD-97-10 scheme, which "
            "catches single-character typos and most transpositions. Passing that check "
            "proves internal consistency only: it says nothing about whether the account "
            "exists, is open, or belongs to the person named. Not every country uses "
            "IBANs; the United States and Canada, for example, do not."
        ),
    },
    {
        "source_id": "relay-concept-uetr",
        "title": "UETR — the reference that follows a payment end to end",
        "topics": ["uetr", "payment-tracking", "swift-gpi", "identifiers"],
        "text": (
            "The Unique End-to-end Transaction Reference is a version-4 UUID assigned when "
            "a payment is created and carried unchanged by every institution that handles "
            "it. It is what makes end-to-end tracking possible: without a shared "
            "reference, each bank in a chain can only report on its own leg, and nobody "
            "can join those legs into one story. Because the UETR is stable, every "
            "participant's status update lands against the same payment, producing a "
            "single ordered timeline. The UETR identifies a payment, not a person or an "
            "account, but it is still a reference to a specific transaction and is "
            "treated as sensitive."
        ),
    },
    {
        "source_id": "relay-concept-correspondent-banking",
        "title": "Correspondent banking — why payments take hops",
        "topics": ["correspondent-banking", "nostro", "vostro", "routing"],
        "text": (
            "Two banks that hold no account with each other cannot settle directly, so "
            "the payment travels through banks that do. Each link in that chain is an "
            "account relationship. A Nostro account is our money held at their bank; a "
            "Vostro account is their money held at ours — one relationship described from "
            "two sides. Every additional hop adds a fee, a cut-off time, and another "
            "institution that screens the payment and can hold it. This is why the same "
            "amount sent between the same two parties can arrive at different times and "
            "different values depending on the route taken, and why a bank's published "
            "settlement instruction matters more than it first appears."
        ),
    },
    {
        "source_id": "relay-concept-swift-gpi",
        "title": "SWIFT gpi — tracking and transparency for cross-border payments",
        "topics": ["swift-gpi", "payment-tracking", "transparency"],
        "text": (
            "SWIFT gpi is the service layer that made cross-border payments trackable. "
            "Participating banks commit to confirming what they did with a payment and to "
            "reporting fees deducted and the rate applied, all keyed to the payment's "
            "UETR. Before it, a sender who wanted to know where a payment had reached had "
            "to ask their bank to ask the next bank, and the answer arrived days later if "
            "at all. gpi changes the answer from a phone call into a lookup. It does not "
            "make payments faster by itself and it does not remove intermediaries — it "
            "makes what the intermediaries did visible, which is what turns an "
            "investigation into a question with an answer."
        ),
    },
    {
        "source_id": "relay-concept-rtgs",
        "title": "RTGS — settling each payment individually and finally",
        "topics": ["rtgs", "settlement", "rails", "finality"],
        "text": (
            "A real-time gross settlement system settles every payment individually, in "
            "central bank money, at the moment it is processed. Gross means no netting "
            "against other payments; real-time means no waiting for a cycle. The result "
            "is settlement finality: once it has settled it cannot be unwound, which is "
            "exactly what a high-value or time-critical payment needs. The cost is that "
            "each payment consumes liquidity in full at the moment it settles, and the "
            "per-payment price is high enough that routine retail payments do not belong "
            "here. Most countries run one: the Bank of England's system behind CHAPS, "
            "TARGET2 in the euro area, Fedwire in the United States, Lynx in Canada."
        ),
    },
    {
        "source_id": "relay-concept-ach",
        "title": "ACH and batch clearing — cheap, netted, and scheduled",
        "topics": ["ach", "batch", "settlement", "netting", "rails"],
        "text": (
            "An automated clearing house collects payments over a period, nets what "
            "participants owe each other, and settles only the difference on a schedule. "
            "That netting is what makes it cheap: thousands of payments become one "
            "settlement obligation. The trade-offs are timing and risk. Timing, because "
            "the payment is good only when the cycle settles, so business-day windows, "
            "cut-offs, and weekends decide the value date rather than the moment of "
            "submission. Risk, because between submission and settlement the obligation "
            "exists but the money has not moved. ACH-style systems carry payroll, direct "
            "debits, and supplier runs — high volume, low urgency, predictable timing."
        ),
    },
    {
        "source_id": "relay-concept-vop",
        "title": "Verification of Payee — checking the name before sending",
        "topics": ["vop", "verification-of-payee", "fraud", "name-matching"],
        "text": (
            "Verification of Payee compares the beneficiary name the payer entered "
            "against the name held on the destination account, before the payment is "
            "sent. Account details alone carry no evidence of ownership, which is what "
            "authorised push payment fraud exploits: the payer authorises a genuine "
            "payment to the wrong person. Outcomes are a match, a close match where the "
            "difference is an abbreviation or a missing middle name, no match, and not "
            "checked where the receiving bank could not answer. The check is advisory "
            "rather than blocking, but proceeding past a no-match changes who bears the "
            "loss. Stricter matching produces more manual review, not fewer genuine "
            "payments."
        ),
    },
    {
        "source_id": "relay-concept-fees",
        "title": "Charge codes and fees — OUR, SHA, BEN, and the FX margin",
        "topics": ["fees", "charge-codes", "fx", "lift-fee"],
        "text": (
            "The charge code says who pays for moving the money. OUR means the sender "
            "pays all charges and the beneficiary receives the full instructed amount. "
            "SHA, the common default, means the sender pays their own bank and every "
            "intermediary deducts its own charge from the payment as it passes. BEN means "
            "all charges come out of the payment. Under SHA and BEN, a longer route "
            "therefore delivers less. Separately from any of these, an FX conversion "
            "carries a margin: the difference between the rate applied and the mid-market "
            "rate. It never appears as a line item because it is charged as a worse rate, "
            "and on a large payment it commonly exceeds every explicit fee combined."
        ),
    },
    {
        "source_id": "relay-concept-payment-tracking",
        "title": "Payment tracking — reading a timeline and its statuses",
        "topics": ["payment-tracking", "status", "uetr", "operations"],
        "text": (
            "A tracking timeline is the ordered set of status reports from every "
            "institution that handled a payment, joined by its UETR. Statuses divide into "
            "in-progress, meaning the payment is still moving or is held pending a check, "
            "and terminal, meaning it has been credited, rejected, or returned. The "
            "distinction is the first thing to read, because an in-progress payment is "
            "waiting on a named party and a terminal one is not. Gaps matter as much as "
            "entries: a long interval at one institution usually means a compliance or "
            "repair queue rather than a lost payment. A timeline reports what banks said "
            "they did, so an absent update means an absent report, not necessarily an "
            "absent action."
        ),
    },
    {
        "source_id": "relay-concept-iso-20022",
        "title": "ISO 20022 — structured payment messages",
        "topics": ["iso-20022", "pacs-008", "message-formats", "mt103"],
        "text": (
            "ISO 20022 is the message standard that replaced the legacy tag-based formats "
            "for cross-border payments. Where MT103 carried a party's details as lines of "
            "free text, its replacement pacs.008 carries them as named XML elements, so "
            "country, town, and street are separate fields. Structure is the whole point: "
            "it is enforced at validation, so an address that used to pass as a text block "
            "now has to be decomposed, and a missing element holds the payment instead of "
            "looking untidy. The upside is that screening, reconciliation, and reporting "
            "have something reliable to match on. The migration cost fell on senders, who "
            "had to start supplying data the old format let them omit."
        ),
    },
    {
        "source_id": "relay-concept-rails-vs-messages",
        "title": "Rails versus message formats — two different questions",
        "topics": ["rails-vs-messages", "iso-20022", "rails", "message-formats"],
        "text": (
            "A rail is the scheme that moves and settles the money: CHAPS, Faster "
            "Payments, Fedwire, SEPA, Interac. A message format is how the instruction is "
            "written down: MT103, pacs.008, a domestic file layout. Confusing them causes "
            "real errors, because they vary independently. The same rail can accept more "
            "than one format across a migration period, and the same format travels over "
            "different rails in different countries. Asking which rail answers how fast, "
            "how much, how final, and up to what ceiling. Asking which format answers what "
            "fields are required and what will fail validation. A payment that is on the "
            "right rail with the wrong format does not arrive faster — it stops."
        ),
    },
]


def _concept_documents() -> List[TutorDocument]:
    return [
        TutorDocument(
            source_id=str(card["source_id"]),
            title=str(card["title"]),
            text=str(card["text"]),
            topics=list(card["topics"]),  # type: ignore[arg-type]
            source_kind="relay",
        )
        for card in _CONCEPT_CARDS
    ]


def _lesson_documents() -> List[TutorDocument]:
    documents: List[TutorDocument] = []
    for card in LESSON_CARDS:
        outcomes = " ".join(f"{outcome}." for outcome in card["outcomes"])
        documents.append(
            TutorDocument(
                source_id=f"relay-lesson-{card['module_id']}",
                title=f"Relay lesson: {card['title']}",
                text=(
                    f"{card['subtitle']}. {card['body']} "
                    f"By the end of this module a learner can: {outcomes}"
                ),
                topics=list(card["topics"]),
                module_ids=[card["module_id"]],
                source_kind="relay",
            )
        )
    return documents


def _rail_documents_for(currency: str, record: Dict[str, object]) -> List[TutorDocument]:
    documents: List[TutorDocument] = []
    verified = record.get("verifiedAsof")
    for scheme in record.get("schemes", []):  # type: ignore[union-attr]
        sources = scheme.get("sources") or []
        urls = [source["url"] for source in sources if source.get("url")]
        if not urls:
            # `source_kind="official"` is a claim that the learner can check.
            # A rail with no operator URL cannot support that claim, so it is
            # skipped rather than published as unverifiable.
            continue
        how = " ".join(f"{step}." for step in scheme.get("howItWorks", []))
        limits = scheme.get("limits") or {}
        documents.append(
            TutorDocument(
                source_id=f"relay-rail-{_slug(currency)}-{_slug(scheme['name'])}",
                title=f"{scheme['name']} ({currency})",
                text=(
                    f"{scheme['name']} is a {currency} payment rail operated by "
                    f"{scheme.get('operator', 'its scheme operator')}. "
                    f"Speed: {scheme.get('speed', 'not stated')}. "
                    f"Typical cost: {scheme.get('cost', 'not stated')}. "
                    f"Headline limit: {scheme.get('limit', 'not stated')}. "
                    f"Used for: {scheme.get('useCase', 'not stated')}. "
                    f"Settlement: {scheme.get('settlement', 'not stated')}. "
                    f"Per-transaction limit: {limits.get('perTransaction', 'not stated')}; "
                    f"per-day limit: {limits.get('perDay', 'not stated')}. "
                    f"How it works: {how} "
                    f"Reversible after settlement: {'yes' if scheme.get('reversible') else 'no'}. "
                    f"Operator data verified as of {verified}."
                )[:2400],
                topics=["rails", "schemes", _slug(scheme["name"])],
                currencies=[currency],
                source_url=urls[0],
                related_source_urls=urls[1:],
                verified_as_of=str(verified) if verified else None,
                source_kind="official",
            )
        )
    return documents


def _scheme_documents() -> List[TutorDocument]:
    documents: List[TutorDocument] = []

    for currency in list_currencies_with_schemes():
        record = get_schemes_for_currency(currency)
        if not record:
            continue
        schemes = record.get("schemes", [])
        urls = [
            source["url"]
            for scheme in schemes
            for source in (scheme.get("sources") or [])
            if source.get("url")
        ]
        names = "; ".join(
            f"{scheme['name']} — {scheme.get('speed', 'speed not stated')}, "
            f"{scheme.get('cost', 'cost not stated')}"
            for scheme in schemes
        )
        documents.append(
            TutorDocument(
                source_id=f"relay-scheme-{_slug(currency)}",
                title=f"{currency} domestic payment rails ({record.get('country', '')})",
                text=(
                    f"{currency} is the currency of {record.get('country', 'its country')} "
                    f"(ISO country code {record.get('countryCode', 'not stated')}). "
                    f"Domestic accounts are identified by: "
                    f"{record.get('localIdentifier', 'a domestic identifier')}. "
                    f"{'This country uses IBANs.' if record.get('iban') else 'This country does not use IBANs.'} "
                    f"Available domestic rails: {names}. "
                    f"Choosing between them trades speed against cost and ceiling; the "
                    f"individual rail documents carry limits and settlement detail. "
                    f"Operator data verified as of {record.get('verifiedAsof')}."
                )[:2400],
                topics=["rails", "schemes", "domestic", _slug(currency)],
                currencies=[currency],
                source_url=urls[0] if urls else None,
                related_source_urls=urls[1:],
                verified_as_of=str(record.get("verifiedAsof") or "") or None,
                source_kind="official" if urls else "relay",
            )
        )
        documents.extend(_rail_documents_for(currency, record))

    international = get_international_schemes()
    if international:
        urls = [
            source["url"]
            for source in (international.get("sources") or [])
            if source.get("url")
        ]
        how = " ".join(f"{step}." for step in international.get("howItWorks", []))
        documents.append(
            TutorDocument(
                source_id="relay-scheme-international",
                title="International / SWIFT cross-border transfer",
                text=(
                    f"{international.get('name', 'International transfer')} covers "
                    f"{international.get('scope', 'cross-border payments')}. "
                    f"Speed: {international.get('speed', 'not stated')}. "
                    f"Typical cost: {international.get('cost', 'not stated')}. "
                    f"Used for: {international.get('useCase', 'not stated')}. "
                    f"Settlement: {international.get('settlement', 'not stated')}. "
                    f"How it works: {how} "
                    f"Unlike a domestic rail this is a messaging and correspondent "
                    f"arrangement rather than a single clearing system, which is why "
                    f"speed and cost depend on the route taken. "
                    f"Operator data verified as of {international.get('verifiedAsof')}."
                )[:2400],
                topics=["swift", "international", "cross-border", "correspondent-banking"],
                source_url=urls[0] if urls else None,
                related_source_urls=urls[1:],
                verified_as_of=str(international.get("verifiedAsof") or "") or None,
                source_kind="official" if urls else "relay",
            )
        )
    return documents


@lru_cache(maxsize=1)
def _catalog() -> tuple:
    """Built once. The catalogue is static data and rebuilding it per request
    would re-walk the whole scheme table on every tutor call."""
    return tuple(_concept_documents() + _lesson_documents() + _scheme_documents())


def build_tutor_catalog() -> List[TutorDocument]:
    """Every document the tutor may retrieve and cite."""
    return list(_catalog())


@lru_cache(maxsize=1)
def trusted_source_urls() -> Set[str]:
    """The citation allowlist, derived from the catalogue itself.

    The model may select a URL that appears here and may not invent one. Because
    the set is derived rather than maintained by hand, a rail whose operator URL
    changes cannot fall out of the allowlist while remaining in the catalogue.
    """
    urls: Set[str] = set()
    for document in _catalog():
        if document.source_url:
            urls.add(document.source_url)
        urls.update(document.related_source_urls)
    return urls
