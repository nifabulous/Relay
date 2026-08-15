"""Backend lesson cards — one per Relay curriculum module.

**Why these are hand-written Python and not generated from TypeScript.**
The curriculum lives in `frontend/src/features/learn/curriculum.ts`. Importing
or parsing TypeScript at runtime would put a build artefact of the frontend on
the request path, so the backend keeps its own authoritative copy. The cost of
that choice is drift, and the control for drift is a test:
`tests/tutor/test_knowledge_catalog.py` parses the curriculum at *test* time and
fails if a module here is missing. Add a module to the curriculum and the suite
tells you to add its card.

Each card is a compact teaching summary, not a copy of the lesson. The lesson
is the experience; this is what the tutor needs in order to explain, hint, or
quiz on the same material and cite where it came from.

No card contains a specimen IBAN, account number, or BIC. Teaching material
explains identifier *structure*; a real-looking identifier in here would be
stripped by the redactor at the provider boundary and the tutor would end up
quoting a placeholder back at the learner.
"""
from typing import List, TypedDict


class LessonCard(TypedDict):
    module_id: str
    title: str
    subtitle: str
    outcomes: List[str]
    body: str
    topics: List[str]


LESSON_CARDS: List[LessonCard] = [
    {
        "module_id": "lab-1",
        "title": "Identifiers: BICs & IBANs",
        "subtitle": "The two codes that identify banks and accounts worldwide",
        "outcomes": [
            "Decode a BIC into bank, country, and location",
            "Decompose an IBAN into country, checksum, bank, and account",
            "Distinguish BIC from IBAN and when each is used",
        ],
        "body": (
            "A BIC identifies an institution; an IBAN identifies an account at one. "
            "A BIC is eight or eleven characters: a four-letter institution code, a "
            "two-letter ISO 3166 country code, a two-character location code, and an "
            "optional three-character branch code. The head office is written as a "
            "branch code of three X characters. An IBAN starts with the same two-letter "
            "country code, then two check digits, then a country-defined domestic part "
            "that usually contains the bank identifier and the account number. Length is "
            "fixed per country and varies between countries, so length alone is a weak "
            "check. The pair answers two different questions: which bank, and which "
            "account at that bank. A cross-border instruction generally needs both."
        ),
        "topics": ["bic", "iban", "identifiers", "validation"],
    },
    {
        "module_id": "lab-2",
        "title": "Is It Real? IBAN Checksums",
        "subtitle": "Validate IBANs using the MOD-97 algorithm",
        "outcomes": [
            "Explain how the MOD-97 checksum protects against typos",
            "Validate an IBAN manually step-by-step",
            "Identify common IBAN formatting errors",
        ],
        "body": (
            "IBAN validation under ISO 7064 MOD-97-10 moves the first four characters to "
            "the end, converts every letter to two digits (A becomes 10, through Z as 35), "
            "and takes the whole number modulo 97. A valid IBAN leaves a remainder of one. "
            "The check catches single-character typos and most transpositions, which are "
            "the errors people actually make when retyping an identifier. It does not "
            "prove the account exists, that it is open, or that it belongs to the person "
            "named — only that the string is internally consistent. Common failures are "
            "the wrong country length, a letter where the country format expects a digit, "
            "and stray punctuation. Spaces are presentation only and are stripped first."
        ),
        "topics": ["iban", "validation", "mod-97", "checksum"],
    },
    {
        "module_id": "lab-3",
        "title": "Right Person? Verification of Payee",
        "subtitle": "Check that the payee name matches the account holder",
        "outcomes": [
            "Understand MATCH, CLOSE_MATCH, NO_MATCH, and NOT_CHECKED outcomes",
            "Explain why VoP reduces misdirected payments",
            "Apply strictness levels to close matches",
        ],
        "body": (
            "Verification of Payee compares the name the payer typed against the name on "
            "the beneficiary account before the payment is sent. Four outcomes matter: "
            "MATCH, CLOSE_MATCH where the difference is a middle name or an abbreviation, "
            "NO_MATCH, and NOT_CHECKED where the receiving bank could not answer. The "
            "control exists because account number and sort code alone carry no evidence "
            "of who owns the account, which is what makes an authorised push payment scam "
            "work. VoP is advisory: the payer can proceed anyway, but proceeding past a "
            "NO_MATCH shifts the liability story. Strictness settings decide how much of a "
            "difference still counts as close, and a stricter setting means more manual "
            "review, not fewer real payments."
        ),
        "topics": ["vop", "verification-of-payee", "name-matching", "fraud"],
    },
    {
        "module_id": "lab-4",
        "title": "How Money Moves: Correspondent Routing",
        "subtitle": "Why a payment hops through intermediary banks",
        "outcomes": [
            "Trace a payment from sender to beneficiary through correspondents",
            "Explain Nostro and Vostro accounting relationships",
            "Distinguish a bank's published correspondents from heuristic candidates",
            "Place CHIPS and Fedwire under the USD leg and read CHIPS/ABA identifiers",
            "Contrast serial and cover payment message patterns",
        ],
        "body": (
            "Two banks with no direct relationship settle through a chain of banks that do "
            "have one. Each link is an account: a Nostro is our account held with them, a "
            "Vostro is their account held with us — the same account seen from opposite "
            "sides of the ledger. A published correspondent comes from the bank's own "
            "settlement instructions and is authoritative; a heuristic candidate is an "
            "educated guess from corridor patterns and must be labelled as such. In a "
            "serial payment the instruction passes bank to bank down the chain. In a cover "
            "payment the customer instruction goes directly to the beneficiary bank while "
            "a separate bank-to-bank message moves the funds, so the two can arrive out of "
            "order. USD legs settle over Fedwire or CHIPS, which use their own domestic "
            "participant identifiers rather than BICs."
        ),
        "topics": ["correspondent-banking", "nostro", "vostro", "routing", "chips"],
    },
    {
        "module_id": "lab-5",
        "title": "Where to Send: Standard Settlement Instructions",
        "subtitle": "How banks publish which correspondent to use per currency",
        "outcomes": [
            "Read an SSI record field-by-field and identify the Nostro account",
            "Choose the right charge code (OUR, SHA, BEN) for a given payment",
            "Predict what happens when a payment ignores the published SSI",
            "Understand value dates and settlement timing",
        ],
        "body": (
            "A Standard Settlement Instruction is a bank's published answer to: to settle "
            "this currency with you, where do I send it. One record per currency, naming "
            "the correspondent and the account held there. Ignoring the published SSI does "
            "not usually bounce the payment — it routes it the long way, adding a hop, a "
            "lift fee, and often a day. Charge codes decide who pays: OUR means the sender "
            "absorbs all charges and the beneficiary receives the full amount; SHA splits "
            "them, with each intermediary deducting its own; BEN means every charge comes "
            "out of the payment. The value date is when the funds are actually good, which "
            "is not the same as when the message was sent."
        ),
        "topics": ["ssi", "settlement", "charge-codes", "value-date", "nostro"],
    },
    {
        "module_id": "lab-6",
        "title": "Did It Arrive? Tracking with UETR",
        "subtitle": "SWIFT gpi tracking and the UETR",
        "outcomes": [
            "Explain the UETR and its role in SWIFT gpi",
            "Read a payment tracking timeline",
            "Understand terminal vs in-progress statuses",
        ],
        "body": (
            "The UETR is a version-4 UUID assigned when a payment is created and carried "
            "unchanged by every bank in the chain. That single stable reference is what "
            "makes end-to-end tracking possible: before it, each bank could only speak "
            "about its own leg. Every participant reports its status against the same "
            "identifier, producing one timeline. Statuses divide into in-progress, where "
            "the payment is still moving or is held pending a check, and terminal, where "
            "it has been credited, rejected, or returned. The distinction matters "
            "operationally: an in-progress payment is waiting on someone, and the timeline "
            "usually says who."
        ),
        "topics": ["uetr", "swift-gpi", "payment-tracking", "status"],
    },
    {
        "module_id": "lab-7",
        "title": "Which Rail? Payment Schemes",
        "subtitle": "Compare Faster Payments, SEPA, Fedwire, CHAPS, and more",
        "outcomes": [
            "Compare payment schemes by speed, cost, and currency",
            "Choose the right rail for a given payment",
            "Understand RTGS vs batch settlement",
        ],
        "body": (
            "A rail is the scheme that actually moves the money, and each currency has "
            "several with different trade-offs. The main split is settlement model. An "
            "RTGS system settles each payment individually in central bank money the "
            "moment it is processed: irrevocable, expensive, used for high value and "
            "time-critical payments. A batch or deferred net system collects payments, "
            "nets them, and settles the difference on a cycle: cheap, predictable, slower, "
            "and carrying settlement risk between cycles. Instant rails sit alongside "
            "both, clearing in seconds around the clock with a scheme ceiling. Choosing a "
            "rail is choosing among speed, cost, certainty, and ceiling — there is no rail "
            "that wins on all four."
        ),
        "topics": ["rails", "schemes", "rtgs", "ach", "settlement"],
    },
    {
        "module_id": "lab-8",
        "title": "Message Standards: MT103 to ISO 20022",
        "subtitle": "How the correspondent-banking message changed in 2025",
        "outcomes": [
            "Map MT103 fields to their pacs.008 elements",
            "Explain why and when SWIFT retired MT103 for cross-border",
            "Spot a structured-address failure that holds a payment",
        ],
        "body": (
            "MT103 is the legacy customer credit transfer: fixed-width, tag-numbered, and "
            "tightly limited in how much structure a party's details could carry. Its "
            "ISO 20022 replacement, pacs.008, is XML with named elements, so a party's "
            "country, town, and street are separate fields rather than free text lines. "
            "The migration matters because the structure is enforced. An address that "
            "used to pass as a block of text now has to be decomposed, and a missing "
            "structured element is a validation failure that holds the payment rather "
            "than a cosmetic difference. Richer structured data also gives screening and "
            "reconciliation something to match on, which is the point of the change."
        ),
        "topics": ["mt103", "iso-20022", "pacs-008", "message-formats"],
    },
    {
        "module_id": "lab-9",
        "title": "Rails Deep-Dive: Canada & UK",
        "subtitle": "Interac, EFT, CHAPS, Faster Payments — in depth",
        "outcomes": [
            "Explain Interac Autodeposit, Request Money, limits, and the RTR roadmap",
            "Read EFT processing windows and CHAPS's ISO 20022 structured-address mandate",
            "Compare UK Confirmation of Payee and APP-scam reimbursement",
        ],
        "body": (
            "Canada and the UK show two different answers to the same problem. Canadian "
            "retail transfers run over Interac, which addresses payments by email or "
            "mobile number rather than by account, with Autodeposit removing the security "
            "question step; bulk and payroll run over EFT in business-day windows, and "
            "high value runs over Lynx. The UK splits the same space between Faster "
            "Payments for instant retail, Bacs for the three-day batch cycle, and CHAPS "
            "for same-day high value. The UK's distinctive controls are Confirmation of "
            "Payee, a mandatory name check before sending, and mandatory reimbursement "
            "for authorised push payment scams, which changes who carries the loss."
        ),
        "topics": ["rails", "interac", "chaps", "faster-payments", "eft"],
    },
    {
        "module_id": "gbp-eur-rails",
        "title": "Rails Deep-Dive: UK & Eurozone",
        "subtitle": "CHAPS, Bacs, Faster Payments, TARGET2, SEPA — in depth",
        "outcomes": [
            "Choose between CHAPS, Bacs, and Faster Payments by speed, cost, and ceiling",
            "Walk a Bacs file through its three-day cycle, cut-offs and weekends included",
            "Explain how the Instant Payments Regulation reshaped SCT Inst limits and pricing",
            "Route a euro payment across SCT, SCT Inst, and TARGET2",
        ],
        "body": (
            "Sterling has three rails and the choice is nearly always about ceiling and "
            "urgency. Faster Payments clears in seconds with a scheme maximum that "
            "individual banks cap far lower. Bacs runs a three working-day cycle — input, "
            "processing, entry — so a file submitted before a weekend or bank holiday "
            "lands later than the calendar suggests. CHAPS settles same-day across the "
            "Bank of England's RTGS with no practical ceiling, at a per-payment cost that "
            "only makes sense above a certain value. In euro, SCT is the standard credit "
            "transfer, SCT Inst is its instant counterpart, and TARGET2 is the "
            "central-bank RTGS underneath. The Instant Payments Regulation required euro "
            "banks to offer instant transfers priced no higher than standard ones."
        ),
        "topics": ["rails", "chaps", "bacs", "sepa", "target2", "faster-payments"],
    },
    {
        "module_id": "cad-rails",
        "title": "Rails Deep-Dive: Canada",
        "subtitle": "Lynx, EFT/ACSS, Interac, and the Real-Time Rail",
        "outcomes": [
            "Place Lynx, EFT, and Interac in Canada's three-layer rail stack",
            "Explain ACSS netting and why EFT value-dates in business days",
            "Pick the right CAD rail for a payment's size and urgency",
            "Describe what the Real-Time Rail changes for Interac settlement",
        ],
        "body": (
            "Canada's rails stack in three layers. Lynx is the high-value RTGS, settling "
            "individually in central bank money with finality. EFT clears through the "
            "ACSS, which nets participants' obligations and settles the net difference, "
            "which is why EFT value dates land on business days and why a file crossing a "
            "weekend takes longer than its processing time suggests. Interac sits on top "
            "for retail, addressing payments by email or mobile number and feeling instant "
            "to the user even where the underlying settlement was not. The Real-Time Rail "
            "is the newer infrastructure intended to give retail payments genuine "
            "round-the-clock settlement rather than a fast front end over a batch cycle."
        ),
        "topics": ["rails", "lynx", "acss", "interac", "real-time-rail"],
    },
    {
        "module_id": "fees-fx",
        "title": "Follow the Money: Fees & FX",
        "subtitle": "Why the beneficiary receives less than you sent",
        "outcomes": [
            "Simulate how lift fees erode a payment hop by hop in USD, CAD, GBP, and EUR",
            "Predict what a beneficiary receives under OUR, SHA, and BEN",
            "Expose the hidden cost of an FX margin versus the visible wire fee",
        ],
        "body": (
            "A cross-border payment loses value in two different ways and people usually "
            "only see one. The visible loss is the lift fee: each correspondent in the "
            "chain deducts a charge as the payment passes through, so a longer route costs "
            "more even at identical per-hop rates. Under SHA every intermediary lifts; "
            "under OUR the sender is billed instead so the beneficiary receives the full "
            "amount; under BEN everything comes out of the payment. The invisible loss is "
            "the FX margin — the gap between the rate applied and the mid-market rate. It "
            "is charged as a worse rate rather than as a line item, so it does not appear "
            "on any statement, and on a large payment it routinely exceeds every wire fee "
            "in the chain combined."
        ),
        "topics": ["fees", "charge-codes", "fx", "lift-fee"],
    },
    {
        "module_id": "sanctions",
        "title": "Stopped at the Border: Sanctions Screening",
        "subtitle": "Why payments get frozen, held, and rejected",
        "outcomes": [
            "Explain what sanctions watchlists are and why banks screen every payment",
            "Sort fuzzy match scores into CLEAR, POSSIBLE_HIT, and HARD_HIT bands",
            "Predict what a compliance hold means for a payment and its sender",
            "Explain why most screening hits are false positives",
        ],
        "body": (
            "Every bank screens payment parties against sanctions lists published by "
            "governments and international bodies. Matching is fuzzy by necessity: names "
            "transliterate differently, are ordered differently, and are abbreviated "
            "inconsistently, so exact matching would miss the real thing. Scores band into "
            "clear, possible hit needing human review, and hard hit. The overwhelming "
            "majority of hits are false positives — common names collide, and the cost of "
            "missing a true match is so much higher than the cost of a review that the "
            "thresholds are set deliberately wide. A hold is not an accusation and not a "
            "rejection; it means a human has to look. Screening happens at every "
            "institution in the chain, so a payment can clear one bank and stop at the next."
        ),
        "topics": ["sanctions", "screening", "compliance", "watchlist", "false-positives"],
    },
    {
        "module_id": "exceptions-returns",
        "title": "When Payments Fail: Exceptions & Returns",
        "subtitle": "Rejects, returns, recalls — and getting money back",
        "outcomes": [
            "Distinguish a reject (pacs.002) from a return (pacs.004) and a recall (camt.056)",
            "Read a rejected payment's tracking timeline and locate the failure",
            "Map common return reason codes (AC01, AC04, AM05, FRAD) to their stories",
            "Explain why recovering a settled misdirected payment is never guaranteed",
        ],
        "body": (
            "Three different things get called a failed payment. A reject (pacs.002) means "
            "the payment never settled — it was refused on validation before the money "
            "moved. A return (pacs.004) means it did settle and the receiving side is "
            "sending it back as a new payment in the opposite direction. A recall "
            "(camt.056) is a request to send it back, which the receiving bank may decline. "
            "The difference decides what is possible: a reject is fixable by repairing the "
            "instruction, a return is already in motion, and a recall depends on someone "
            "else agreeing. Reason codes name the cause — a closed or invalid account, a "
            "blocked account, a duplicate, a fraud claim. Once funds are credited to a "
            "beneficiary who does not co-operate, recovery is a legal matter, not an "
            "operational one."
        ),
        "topics": ["returns", "rejects", "recall", "reason-codes", "exceptions"],
    },
    {
        "module_id": "ops-repair",
        "title": "The Ops Desk: STP Repair & Nostro Recon",
        "subtitle": "Fix broken payments and prove the money moved",
        "outcomes": [
            "Run an STP check, read its findings, and repair the failing field",
            "Explain why repairs target the named field instead of resubmitting from scratch",
            "Match a Nostro statement against the ledger and identify the breaks",
            "Classify amount breaks (lift fees) and unexpected charges before adjusting",
        ],
        "body": (
            "Straight-through processing means a payment crosses the bank without a human "
            "touching it. An STP check names exactly which field would stop that — a "
            "missing structured address element, an unusable party identifier, a charge "
            "code that contradicts the instruction. Repairing the named field is the "
            "correct fix; resubmitting from scratch loses the original reference, which is "
            "what everything downstream reconciles against. Nostro reconciliation is the "
            "other half of the desk: matching the correspondent's statement against the "
            "internal ledger and explaining every break. Most amount breaks are lift fees "
            "deducted in transit and are expected once identified; genuinely unexpected "
            "charges are the ones worth escalating."
        ),
        "topics": ["stp", "repair", "nostro", "reconciliation", "operations"],
    },
    {
        "module_id": "capstone",
        "title": "Capstone: Full Payment Simulation",
        "subtitle": "Apply everything: validate, verify, route, and track a payment",
        "outcomes": [
            "Execute a complete cross-border payment simulation",
            "Interpret a combined recommendation across all checks",
            "Track the payment end-to-end via UETR",
        ],
        "body": (
            "The capstone runs the whole sequence in order: validate the identifiers, "
            "verify the payee name, resolve a route through correspondents, apply the "
            "published settlement instruction, simulate fees and value date, screen the "
            "parties, and track the result. The point is that the checks are not "
            "independent. A close-match name result reads differently on a payment that is "
            "also taking an unusual route, and a screening hold on a payment already "
            "flagged for a structured-address failure is two separate problems that will "
            "not clear together. The combined recommendation weighs them jointly, which is "
            "how an operations desk actually reads a payment — as one story, not a "
            "checklist of independent green ticks."
        ),
        "topics": ["capstone", "end-to-end", "recommendation", "simulation"],
    },
]
