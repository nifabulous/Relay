"""
Payment schemes data — loaded by the /api/schemes endpoint.

Maps each currency to its domestic payment rails (e.g. GBP has Faster Payments,
CHAPS, Bacs; CAD has Interac, EFT, Lynx). Each scheme describes speed, cost,
limits, use-case, and operator — essential for understanding why "sending £100"
and "sending £100 via CHAPS" are very different things.

This is educational data — always check the operator's current rules for
production routing.
"""

_SCHEMES = {
    "GBP": {
        "currency": "GBP", "country": "United Kingdom", "countryCode": "GB",
        "iban": True,
        "localIdentifier": "Sort Code (6 digits) + Account Number (8 digits)",
        "verifiedAsof": "2026-07",
        "schemes": [
            {"name": "Faster Payments (FPS)", "speed": "Instant (<2s)", "limit": "£1,000,000 scheme max", "cost": "Free", "useCase": "Retail, bills, transfers", "operator": "Pay.UK",
             "howItWorks": ["Payer initiates; cleared in seconds, 24/7", "Name-checked via Confirmation of Payee before sending", "Beneficiary bank credits the account"],
             "features": ["24/7 instant", "Confirmation of Payee name-check", "Evolving under the New Payments Architecture (NPA)"],
             "limits": {"perTransaction": "£1,000,000 (scheme max)", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Scheme max raised to £1M (from £250k); banks cap lower — often ~£25,000 personal, up to £1M business"},
             "settlement": "Faster Payments Service (Pay.UK); evolving under the NPA", "reversible": False,
             "protections": ["Confirmation of Payee (mandatory since Oct 2024)", "APP-scam reimbursement up to £85,000 (50/50 PSP split)"],
             "roadmap": ["Scheme limit raised to £1,000,000", "New Payments Architecture (NPA) migration in progress"]},
            {"name": "CHAPS", "speed": "Same-day (RTGS)", "limit": "No limit", "cost": "£20-35", "useCase": "High-value, house purchases", "operator": "Bank of England",
             "howItWorks": ["Real-time gross settlement via the Bank of England", "Same-day, final and irrevocable", "Carried as ISO 20022 pacs.008 with enhanced data"],
             "features": ["ISO 20022 enhanced data", "Purpose Codes + LEI", "Structured postal addresses"],
             "limits": {"perTransaction": "No limit", "perDay": "No limit", "perMonth": "No limit", "receiving": "No limit", "note": "High-value; bank/operational controls apply"},
             "settlement": "Bank of England RTGS (final, same-day)", "reversible": False,
             "protections": ["Confirmation of Payee (mandatory since Oct 2024)", "APP-scam reimbursement up to £85,000 (50/50 PSP split)"],
             "roadmap": ["Purpose Codes + LEI mandated May 2025", "Hybrid addresses from Nov 2025; fully-unstructured addresses rejected Nov 2026", "Structured remittance mandated Nov 2025"]},
            {"name": "Bacs Direct Credit", "speed": "3 business days", "limit": "No limit", "cost": "~£0.50", "useCase": "Payroll, pensions", "operator": "Pay.UK",
             "howItWorks": ["3-day cycle: submission day, processing day, settlement day", "Batched, low-cost, high-volume"],
             "features": ["Direct Credit + Direct Debit", "Low cost, high volume"],
             "settlement": "Bacs 3-day cycle (Pay.UK)", "reversible": False, "protections": [], "roadmap": []},
        ],
    },
    "CAD": {
        "currency": "CAD", "country": "Canada", "countryCode": "CA",
        "iban": False,
        "localIdentifier": "Bank (3) + Transit (5) + Account (7-12)",
        "verifiedAsof": "2026-07",
        "schemes": [
            {"name": "Interac e-Transfer", "speed": "Instant (<30s)", "limit": "$3,000/txn, $10,000/day, $30,000/month", "cost": "Free", "useCase": "P2P, retail, small business", "operator": "Interac Corp.",
             "howItWorks": ["Sender picks the recipient by email or phone (alias)", "Money moves over existing bank rails — the alias only carries the notification/deposit instructions", "Recipient auto-deposits, or answers a security question", "Funds land in seconds after routine interbank fraud checks"],
             "features": ["Autodeposit (sender is shown the recipient's registered legal name — a CoP-like check; may be delayed by fraud checks)", "Request Money (pull)", "Security-question claim (answer must not be guessable/public, and must not travel on the same channel as the transfer)"],
             "limits": {"perTransaction": "$3,000 (typical consumer ~$2,000-3,000, bank-set)", "perDay": "$10,000", "perMonth": "$30,000", "receiving": "Up to $25,000", "note": "Network ceiling $3,000/txn; banks set their own caps; Business e-Transfer up to $25,000/transfer"},
             "settlement": "Existing bank rails today; moving to the Real-Time Rail (RTR) for real-time clearing/settlement", "reversible": False,
             "protections": ["Autodeposit shows the sender the recipient's registered legal name", "Cancellable while pending/unclaimed; irreversible once claimed or autodeposited", "Can go cross-border if the sender's bank participates"],
             "roadmap": ["RTR real-time clearing/settlement targeted Q3 2026 (may slip to late 2026/early 2027)", "RTR is ISO 20022 and will settle Interac in real time"]},
            {"name": "EFT", "speed": "1-2 business days", "limit": "No limit", "cost": "$0.50-2", "useCase": "Payroll, vendor", "operator": "Payments Canada",
             "howItWorks": ["Batched and submitted in fixed daily windows", "Cleared and settled via ACSS", "Credited 1-2 business days later; no weekends/holidays"],
             "features": ["Batch processing", "Business days only"],
             "processingWindows": ["05:00 ET", "14:15 ET", "19:00 ET"],
             "settlement": "ACSS batch (Automated Clearing Settlement System)", "reversible": False, "protections": [], "roadmap": []},
            {"name": "Lynx", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "$5-25", "useCase": "High-value, wholesale", "operator": "Bank of Canada",
             "howItWorks": ["Real-time gross settlement, transaction by transaction", "Final and irrevocable"],
             "features": ["ISO 20022", "Pre-funding underpins the incoming RTR"],
             "settlement": "Lynx RTGS (final, real-time)", "reversible": False, "protections": [],
             "roadmap": ["ISO 20022-native; supports the incoming Real-Time Rail"]},
        ],
    },
    "USD": {
        "currency": "USD", "country": "United States", "countryCode": "US",
        "iban": False,
        "localIdentifier": "ABA Routing (9) + Account Number",
        "verifiedAsof": "2026-07",
        "schemes": [
            {"name": "Fedwire", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "$10-35", "useCase": "High-value, wires", "operator": "Federal Reserve"},
            {"name": "FedACH", "speed": "1-2 business days", "limit": "~$25,000-1M", "cost": "$0.10-0.50", "useCase": "Payroll, direct deposit", "operator": "Federal Reserve"},
            {"name": "CHIPS", "speed": "Same-day (net settle)", "limit": "No limit", "cost": "$5-20", "useCase": "Wholesale, international", "operator": "The Clearing House"},
            {"name": "RTP", "speed": "Instant (<10s)", "limit": "$10,000,000", "cost": "Free", "useCase": "Instant retail", "operator": "The Clearing House"},
            {"name": "FedNow", "speed": "Instant (seconds)", "limit": "$10,000,000", "cost": "Free", "useCase": "Instant retail", "operator": "Federal Reserve"},
        ],
    },
    "EUR": {
        "currency": "EUR", "country": "Eurozone (20 countries)", "countryCode": "EU",
        "iban": True,
        "localIdentifier": "IBAN (mandatory within SEPA)",
        "verifiedAsof": "2026-07",
        "schemes": [
            {"name": "SEPA Instant (SCT Inst)", "speed": "Instant (<10s)", "limit": "Bank-set (scheme cap removed)", "cost": "Free (parity with SCT mandated)", "useCase": "Instant P2P, retail", "operator": "EPC scheme; cleared via TIPS / RT1",
             "howItWorks": ["Payer's PSP sends the instant transfer 24/7/365", "Cleared and settled in under 10 seconds via TIPS (Eurosystem) or RT1 (EBA Clearing)", "Beneficiary PSP confirms or rejects within the timeout; funds are immediately available"],
             "features": ["24/7/365 — no cut-offs, no weekends", "Verification of Payee name-check before sending (mandatory for EUR PSPs since Oct 2025)", "Reach: all eurozone PSPs must send and receive under the Instant Payments Regulation"],
             "limits": {"perTransaction": "Bank-set", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "No scheme cap", "note": "The historical €100,000 scheme cap was lifted under the Instant Payments Regulation; PSPs set their own limits and must let customers adjust them"},
             "settlement": "Central-bank money via TIPS, or commercial-bank money via RT1", "reversible": False,
             "protections": ["Verification of Payee (mandatory for EUR since Oct 2025)", "Price parity: instant may not cost more than a standard SCT"],
             "roadmap": ["Instant Payments Regulation: eurozone PSPs had to receive by Jan 2025 and send by Oct 2025", "Non-eurozone EU PSPs follow in 2027"]},
            {"name": "SEPA Credit Transfer", "speed": "1 business day", "limit": "No limit", "cost": "Free-€1 (domestic-price rule)", "useCase": "Standard EUR cross-border", "operator": "EPC scheme; cleared via STEP2-T",
             "howItWorks": ["Batched pacs.008 files exchanged between PSPs in daily cycles", "Cleared through STEP2-T (EBA Clearing) or bilateral/CSM arrangements", "Credited no later than the next business day (D+1)"],
             "features": ["IBAN-only within SEPA (36 countries)", "ISO 20022 native since inception", "Same price as a domestic transfer by regulation"],
             "limits": {"perTransaction": "No scheme limit", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "No limit", "note": "Business days only — a Friday-evening SCT lands Monday; SCT Inst does not have that gap"},
             "settlement": "Multilateral net settlement in TARGET (STEP2-T cycles)", "reversible": False,
             "protections": ["SEPA recall procedure (best-effort, not guaranteed)"],
             "roadmap": ["2023 rulebook migration to ISO 20022 2019 version complete"]},
            {"name": "TARGET2", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "€0.80-2.50", "useCase": "High-value, interbank", "operator": "Eurosystem (ECB)",
             "howItWorks": ["Real-time gross settlement in central-bank money, transaction by transaction", "Runs on the consolidated T2 platform (live March 2023), ISO 20022 native", "Final and irrevocable on settlement"],
             "features": ["Settles ~€2 trillion per day", "Operating window roughly 02:30-18:00 CET for customer payments (cut-off 17:00)", "The settlement layer beneath EURO1, STEP2 and securities settlement"],
             "limits": {"perTransaction": "No limit", "perDay": "No limit", "perMonth": "No limit", "receiving": "No limit", "note": "High-value wholesale rail; banks route customer payments here when SCT/SCT Inst limits or timing don't fit"},
             "settlement": "T2 RTGS (final, real-time, central-bank money)", "reversible": False,
             "protections": [],
             "roadmap": ["TARGET2 and TARGET2-Securities consolidated onto the T2/T2S platform in 2023"]},
        ],
    },
    "NGN": {
        "currency": "NGN", "country": "Nigeria", "countryCode": "NG",
        "iban": False,
        "localIdentifier": "NUBAN (10-digit account number)",
        "verifiedAsof": "2026-07",
        "schemes": [
            {"name": "NIBSS Instant Pay", "speed": "Instant (seconds)", "limit": "₦5,000,000", "cost": "Free", "useCase": "Retail, P2P", "operator": "NIBSS"},
            {"name": "NEFT", "speed": "1-2 hours (batch)", "limit": "No limit", "cost": "Minimal", "useCase": "Bulk, payroll", "operator": "NIBSS"},
        ],
    },
    "KES": {
        "currency": "KES", "country": "Kenya", "countryCode": "KE",
        "iban": False,
        "localIdentifier": "Bank Account Number (per bank)",
        "verifiedAsof": "2026-07",
        "schemes": [
            {"name": "KEPSS", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "Bank-set", "useCase": "High-value, interbank, government", "operator": "Central Bank of Kenya"},
            {"name": "PesaLink", "speed": "Instant (seconds)", "limit": "~KES 1,000,000 (bank-set)", "cost": "KES 0-150", "useCase": "Bank-to-bank, alias-capable", "operator": "IPSL (Kenya Bankers Assoc.)"},
            {"name": "M-Pesa", "speed": "Instant (seconds)", "limit": "KES 250,000/txn, 500,000/day, 500,000 wallet cap", "cost": "Tiered tariff", "useCase": "Mobile wallet, P2P, merchant", "operator": "Safaricom"},
            {"name": "EFT", "speed": "1-2 business days", "limit": "No limit", "cost": "Minimal", "useCase": "Payroll, bulk", "operator": "Kenya Bankers Assoc."},
        ],
    },
    "INR": {
        "currency": "INR", "country": "India", "countryCode": "IN",
        "iban": False,
        "localIdentifier": "IFSC (11 chars) + Account Number",
        "verifiedAsof": "2026-07",
        "schemes": [
            {"name": "UPI", "speed": "Instant (seconds)", "limit": "₹1-5L", "cost": "Free", "useCase": "Everything (P2P, retail, bills)", "operator": "NPCI"},
            {"name": "IMPS", "speed": "Instant (seconds)", "limit": "₹5,00,000", "cost": "₹5-15", "useCase": "Instant bank-to-bank", "operator": "NPCI"},
            {"name": "RTGS", "speed": "Real-time (RTGS)", "limit": "₹2L minimum, no max", "cost": "Free", "useCase": "High-value, corporate", "operator": "RBI"},
            {"name": "NEFT", "speed": "Half-hourly batches", "limit": "No limit", "cost": "Free", "useCase": "Standard, payroll", "operator": "RBI"},
        ],
    },
    "AUD": {
        "currency": "AUD", "country": "Australia", "countryCode": "AU",
        "iban": False,
        "localIdentifier": "BSB (6) + Account Number",
        "verifiedAsof": "2026-07",
        "schemes": [
            {"name": "NPP / PayID", "speed": "Instant (<15s)", "limit": "AUD 100,000+", "cost": "Free", "useCase": "Instant P2P, retail", "operator": "NPP Australia"},
            {"name": "Direct Entry (BECS)", "speed": "1-2 business days", "limit": "No limit", "cost": "AUD 0.10-0.50", "useCase": "Payroll, direct debit", "operator": "AusPayNet"},
            {"name": "RITS", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "Wholesale rates", "useCase": "High-value, interbank", "operator": "RBA"},
        ],
    },
    "JPY": {
        "currency": "JPY", "country": "Japan", "countryCode": "JP",
        "iban": False,
        "localIdentifier": "Bank (4) + Branch (3) + Account",
        "verifiedAsof": "2026-07",
        "schemes": [
            {"name": "Zengin", "speed": "Same-day (batch)", "limit": "No limit", "cost": "Variable", "useCase": "Standard domestic", "operator": "JBA"},
            {"name": "More Time", "speed": "Instant 24/7", "limit": "JPY 100K-1M", "cost": "Free", "useCase": "Instant P2P", "operator": "JBA"},
            {"name": "BOJ-NET", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "JPY 100-500", "useCase": "High-value, interbank", "operator": "Bank of Japan"},
        ],
    },
    "AED": {
        "currency": "AED", "country": "UAE", "countryCode": "AE",
        "iban": True,
        "localIdentifier": "IBAN (mandatory since 2011)",
        "verifiedAsof": "2026-07",
        "schemes": [
            {"name": "UAEFTS", "speed": "Same-day (3 cut-offs)", "limit": "AED 35K-500K", "cost": "AED 1-16", "useCase": "Standard domestic", "operator": "CBUAE"},
            {"name": "Aani", "speed": "Instant (seconds)", "limit": "AED 100,000", "cost": "Free", "useCase": "Instant P2P, retail", "operator": "Al Etihad Payments"},
        ],
    },
}


def get_schemes_for_currency(currency: str):
    """Return the payment schemes for a given currency code, or None."""
    return _SCHEMES.get(currency.strip().upper())


def list_currencies_with_schemes():
    """Return all currency codes that have scheme data."""
    return sorted(_SCHEMES.keys())
