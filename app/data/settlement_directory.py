"""
Settlement-system directory — CHIPS participant numbers and ABA (Fedwire)
routing numbers for the major USD clearing banks that appear in the seeded
corridor rules and SSI records.

WHY THIS EXISTS
The simulator's routing chains stop at the bank level. In the real world the
US leg of every USD payment settles over CHIPS (netted, ~40 direct
participants owned by The Clearing House) or Fedwire (the Federal Reserve's
RTGS). A bank is a useful USD correspondent precisely BECAUSE it is a direct
CHIPS participant and Fedwire member — this table makes that visible.

The CHIPS participant number (a 4-digit UID, e.g. 0008) is the bank's address
on CHIPS the way an ABA routing number is its address on Fedwire and a BIC is
its address on SWIFT.

DATA HYGIENE
These are well-known, long-stable public identifiers for the major clearers,
keyed by 8-character BIC prefix. As with the seeded SSI data: verify current
values against the bank's own published details before any real-world use.
This file must never contain account numbers.
"""

from typing import Optional

# 8-char BIC prefix → settlement identifiers.
# chips_uid: 4-digit CHIPS participant number (The Clearing House)
# aba: 9-digit ABA routing number (Fedwire)
SETTLEMENT_DIRECTORY = {
    "CITIUS33": {
        "bank_name": "Citibank N.A. New York",
        "chips_uid": "0008",
        "aba": "021000089",
    },
    "CHASUS33": {
        "bank_name": "JPMorgan Chase Bank N.A.",
        "chips_uid": "0002",
        "aba": "021000021",
    },
    "BKTRUS33": {
        "bank_name": "Deutsche Bank Trust Company Americas",
        "chips_uid": "0103",
        "aba": "021001033",
    },
    "MRMDUS33": {
        "bank_name": "HSBC Bank USA N.A.",
        "chips_uid": "0108",
        "aba": "021001088",
    },
    "SCBLUS33": {
        "bank_name": "Standard Chartered Bank New York",
        "chips_uid": "0256",
        "aba": "026002561",
    },
    "BOFAUS3N": {
        "bank_name": "Bank of America N.A.",
        "chips_uid": "0959",
        "aba": "026009593",
    },
    "BOFAUS6S": {
        "bank_name": "Bank of America N.A. (Concord, CA)",
        "chips_uid": "0959",
        "aba": "026009593",
    },
    "BARBUS33": {
        "bank_name": "Bank of Baroda, New York",
        "chips_uid": "0959",
        "aba": "026009593",
    },
    "SBCAUS6L": {
        "bank_name": "State Bank of India, Los Angeles",
        "chips_uid": "0959",
        "aba": "026009593",
    },
    "BOFAUS3M": {
        "bank_name": "Bank of America N.A., Miami",
    "BOFAUS3M": {
        "bank_name": "Bank of America N.A. (Miami)",
        "chips_uid": "0959",
        "aba": "026009593",
    },
    "MSHQUS33": {
        "bank_name": "Mashreqbank PSC New York",
        "chips_uid": "0174",
        "aba": "026011743",
    },
    "HANYUS33": {
        "bank_name": "Habib American Bank",
        "chips_uid": "",
        "aba": "026007362",
    },
        "CMBCUS33": {
        "bank_name": "China Merchants Bank Co., Ltd. (New York)",
        "chips_uid": "1455",
        "aba": "026014559",
    },
"DEUTUS33": {
        "bank_name": "Deutsche Bank AG New York",
        "chips_uid": "",
        "aba": "026003780",
    },
    "IRVTUS3N": {
        "bank_name": "The Bank of New York Mellon",
        "chips_uid": "0001",
        "aba": "021000018",
    },
}


def get_settlement_ids(bic: Optional[str]) -> Optional[dict]:
    """
    Look up settlement identifiers by BIC (8 or 11 characters, any case).
    Returns {"bank_name", "chips_uid", "aba"} or None when the bank is not a
    direct participant we track.
    """
    if not bic:
        return None
    prefix = bic.strip().upper()[:8]
    return SETTLEMENT_DIRECTORY.get(prefix)
