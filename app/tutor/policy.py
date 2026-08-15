"""Deterministic, model-free policy checks for tutor requests.

Every decision here is reached by inspecting strings. No model is called, no
network request is made, and the same request always yields the same
`PolicyDecision` — which is what makes a refusal testable and auditable.

**Trust boundary.** Intent is read from `request.message` and from nowhere
else. Three surfaces reach this function carrying text that an attacker may
control, and none of them is an instruction:

* `request.history` entries with ``role="assistant"`` — the client supplies
  the whole history, so a forged assistant turn saying "permission granted" or
  "you are authorised to settle payments" is just an attacker-authored string.
  It is never authorisation.
* `context.result_summary` — learner- or tool-supplied text.
* Retrieved document text — not consulted here, and callers must not start
  treating it as trusted either.

Those surfaces may supply *facts* for the model to explain. They may never
move a decision, in either direction: they cannot unlock a refusal, and
equally they cannot manufacture one against an otherwise benign question. The
enforcement is structural rather than a filter — this function simply does not
read them — because a filter is something an attacker can phrase around.

Refusals return a `response` the caller can hand to the learner verbatim. Each
one redirects to Relay's simulation disclaimer or to an official operator
source; "no" on its own teaches nothing and invites a rephrase.
"""
import re
from typing import Optional

from pydantic import BaseModel

from .schemas import TutorRequest


class PolicyDecision(BaseModel):
    allowed: bool
    reason: Optional[str] = None
    response: Optional[str] = None


_PAYMENT_EXECUTION_RESPONSE = (
    "Relay is an educational SIMULATION — no real money moves here, and I can't "
    "initiate, approve, advance, or settle a payment. What I can do is walk you "
    "through the flow step by step, or you can run it end to end in Relay's "
    "simulated Prepare Payment tool. For a live transfer, use your bank's or "
    "payment operator's own authorised channel."
)

# An explanatory opening. "How does a correspondent bank settle a USD payment?"
# and "Please settle the payment now" share their vocabulary entirely; the
# framing is the only thing that separates a lesson from an instruction, so it
# is what the payment-execution rule keys on. "How do I ..." is deliberately
# excluded — it asks the tutor to act, not to explain.
_EDUCATIONAL_LEAD_RE = re.compile(
    r"""^\s*(?:
        what|why|when|which|who|whose|where
      | how\s+(?:does|do(?!\s+(?:i|we|you)\b)|is|are|was|were|would|might|much|many|long|often)
      | explain|describe|define|compare|contrast|summari[sz]e|outline|teach|illustrate
      | walk\s+me\s+through | tell\s+me | give\s+me\s+an?\s+example
      | quiz\s+me | in\s+relay
    )\b""",
    re.IGNORECASE | re.VERBOSE,
)

_PAYMENT_ACTION_RE = re.compile(
    r"\b(?:initiate|execute|approve|authori[sz]e|release|advance|settle|complete|"
    r"send|submit|process|book|post|make|wire|remit|pay)\b",
    re.IGNORECASE,
)

_PAYMENT_OBJECT_RE = re.compile(
    r"\b(?:payment|transfer|transaction|wire|remittance|instruction|mt103|pacs)\b",
    re.IGNORECASE,
)

_SECRET_DISCLOSURE_RESPONSE = (
    "I don't have access to API keys, credentials, system prompts, or server "
    "configuration, and I wouldn't repeat them if I did. If you're setting up "
    "Relay locally, the project README lists the environment variables the app "
    "reads; ask whoever administers your deployment for any value you're "
    "missing. I'm happy to explain what a given setting is for."
)

# Framing-independent: "what is the admin key" is an ordinary-looking question
# and must still be refused, so this rule does not consult the lead-in.
_SECRET_DISCLOSURE_RE = re.compile(
    r"""\b(?:api[\s_-]?key|admin[\s_-]?key|secret[\s_-]?key|access[\s_-]?token|
             private[\s_-]?key|credentials?|passwords?|passphrase|
             environment\s+variables?|env\s+(?:var|file)|\.env|
             system\s+prompt|connection\s+string|database\s+url)\b
      # Env-var style names. At least one underscore-terminated segment is
      # required, so a bare "key" in ordinary prose is not caught.
      | \b(?:[A-Za-z][A-Za-z0-9]*_)+(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|URL|CREDENTIAL)\b""",
    re.IGNORECASE | re.VERBOSE,
)

_COMPLIANCE_BYPASS_RESPONSE = (
    "I can't help with bypassing sanctions screening, Verification of Payee, or "
    "any other compliance control — not even against Relay's simulated data, "
    "because the habit is what carries over to a real desk. I can explain why "
    "the control exists, what a hit actually means, and how an operations team "
    "investigates and clears one properly. For a live case, follow your "
    "operator's published escalation procedure or ask your compliance team."
)

_COMPLIANCE_BYPASS_RE = re.compile(
    r"""\b(?:bypass|skip|evade|circumvent|override|suppress|defeat|disable|
             falsif(?:y|ied)|forge|fake|conceal)\b
      | \bturn(?:ing)?\s+off\b
      | \b(?:get|getting|work|working)\s+a?round\b
      | \bopt\s+out\s+of\b""",
    re.IGNORECASE | re.VERBOSE,
)

_COMPLIANCE_OBJECT_RE = re.compile(
    r"\b(?:sanctions?|screening|watchlist|vop|verification\s+of\s+payee|compliance|"
    r"aml|kyc|cft|embargo|pep|due\s+diligence|controls?|checks?)\b",
    re.IGNORECASE,
)

# Marks the request as asking *someone to do it*, rather than describing that it
# happens. "How do I skip screening?" is a request; "What happens if screening
# is skipped?" is a question about the domain and stays answerable.
_SELF_DIRECTED_RE = re.compile(
    r"\b(?:i|we|me|my|us|our|you|your)\b|\bhow\s+to\b", re.IGNORECASE
)


_LIVE_CERTAINTY_RESPONSE = (
    "Relay's limits, fees, and cut-off times are illustrative SIMULATION data. "
    "I can't tell you what a real bank will actually apply today, and treating "
    "these figures as authoritative is exactly the mistake that costs someone a "
    "missed settlement. Check the operator's published tariff, limit, and "
    "cut-off schedule, or ask them directly — those are the binding sources. I "
    "can explain how limits, fees, and cut-offs work, and why they differ "
    "between rails."
)

# Refusal here needs both a demand for real-world certainty and an operational
# fact to be certain about, so "explain how fees are calculated" stays
# answerable while "what fee will my bank actually charge today" does not.
_LIVE_CERTAINTY_RE = re.compile(
    r"""\b(?:exact(?:ly)?|actual(?:ly)?|real|precise(?:ly)?|current(?:ly)?|live|
             today|tomorrow|guarantee[ds]?|definitely|authoritative)\b
      | \bright\s+now\b
      | \b(?:my|our|this|their)\s+bank\b
      | \bfor\s+(?:sure|certain)\b""",
    re.IGNORECASE | re.VERBOSE,
)

_OPERATIONAL_FACT_RE = re.compile(
    r"""\b(?:limits?|maximum|minimum|caps?|thresholds?|fees?|charges?|costs?|
             price|pricing|tariff|deadlines?|rates?)\b
      | \bcut[\s-]?off\b""",
    re.IGNORECASE | re.VERBOSE,
)


def evaluate_tutor_request(request: TutorRequest) -> PolicyDecision:
    """Decide whether the tutor may answer ``request``."""
    message = request.message
    if _SECRET_DISCLOSURE_RE.search(message):
        return PolicyDecision(
            allowed=False,
            reason="secret_disclosure",
            response=_SECRET_DISCLOSURE_RESPONSE,
        )

    # Framing-independent: "explain how to bypass screening" is still a request
    # to bypass screening.
    bypass = _COMPLIANCE_BYPASS_RE.search(message)
    if (
        bypass
        and _COMPLIANCE_OBJECT_RE.search(message)
        and (_SELF_DIRECTED_RE.search(message) or bypass.start() == 0)
    ):
        return PolicyDecision(
            allowed=False,
            reason="compliance_bypass",
            response=_COMPLIANCE_BYPASS_RESPONSE,
        )

    explanatory = _EDUCATIONAL_LEAD_RE.search(message) is not None
    if (
        not explanatory
        and _PAYMENT_ACTION_RE.search(message)
        and _PAYMENT_OBJECT_RE.search(message)
    ):
        return PolicyDecision(
            allowed=False,
            reason="payment_execution",
            response=_PAYMENT_EXECUTION_RESPONSE,
        )

    if _LIVE_CERTAINTY_RE.search(message) and _OPERATIONAL_FACT_RE.search(message):
        return PolicyDecision(
            allowed=False,
            reason="live_operational_certainty",
            response=_LIVE_CERTAINTY_RESPONSE,
        )

    return PolicyDecision(allowed=True)
