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
        "schemes": [
            {"name": "Faster Payments (FPS)", "speed": "Instant (<2s)", "limit": "£1,000,000", "cost": "Free", "useCase": "Retail, bills, transfers", "operator": "Pay.UK"},
            {"name": "CHAPS", "speed": "Same-day (RTGS)", "limit": "No limit", "cost": "£20-35", "useCase": "High-value, house purchases", "operator": "Bank of England"},
            {"name": "Bacs Direct Credit", "speed": "3 business days", "limit": "No limit", "cost": "~£0.50", "useCase": "Payroll, pensions", "operator": "Pay.UK"},
        ],
    },
    "CAD": {
        "currency": "CAD", "country": "Canada", "countryCode": "CA",
        "iban": False,
        "localIdentifier": "Bank (3) + Transit (5) + Account (7-12)",
        "schemes": [
            {"name": "Interac e-Transfer", "speed": "Instant (<30s)", "limit": "$3,000-10,000", "cost": "Free", "useCase": "P2P, retail", "operator": "Interac Corp."},
            {"name": "EFT", "speed": "1-2 business days", "limit": "No limit", "cost": "$0.50-2", "useCase": "Payroll, vendor", "operator": "Payments Canada"},
            {"name": "Lynx", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "$5-25", "useCase": "High-value, wholesale", "operator": "Bank of Canada"},
        ],
    },
    "USD": {
        "currency": "USD", "country": "United States", "countryCode": "US",
        "iban": False,
        "localIdentifier": "ABA Routing (9) + Account Number",
        "schemes": [
            {"name": "Fedwire", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "$10-35", "useCase": "High-value, wires", "operator": "Federal Reserve"},
            {"name": "FedACH", "speed": "1-2 business days", "limit": "~$25,000-1M", "cost": "$0.10-0.50", "useCase": "Payroll, direct deposit", "operator": "Federal Reserve"},
            {"name": "CHIPS", "speed": "Same-day (net settle)", "limit": "No limit", "cost": "$5-20", "useCase": "Wholesale, international", "operator": "The Clearing House"},
            {"name": "RTP", "speed": "Instant (<10s)", "limit": "$1,000,000", "cost": "Free", "useCase": "Instant retail", "operator": "The Clearing House"},
            {"name": "FedNow", "speed": "Instant (seconds)", "limit": "$500,000", "cost": "Free", "useCase": "Instant retail", "operator": "Federal Reserve"},
        ],
    },
    "EUR": {
        "currency": "EUR", "country": "Eurozone (20 countries)", "countryCode": "EU",
        "iban": True,
        "localIdentifier": "IBAN (mandatory within SEPA)",
        "schemes": [
            {"name": "SEPA Instant (SCT Inst)", "speed": "Instant (<10s)", "limit": "€100,000", "cost": "Free", "useCase": "Instant P2P, retail", "operator": "EBA Clearing"},
            {"name": "SEPA Credit Transfer", "speed": "1 business day", "limit": "No limit", "cost": "Free", "useCase": "Standard EUR cross-border", "operator": "EBA Clearing"},
            {"name": "TARGET2", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "€0.80-2.50", "useCase": "High-value, interbank", "operator": "Eurosystem (ECB)"},
        ],
    },
    "NGN": {
        "currency": "NGN", "country": "Nigeria", "countryCode": "NG",
        "iban": False,
        "localIdentifier": "NUBAN (10-digit account number)",
        "schemes": [
            {"name": "NIBSS Instant Pay", "speed": "Instant (seconds)", "limit": "₦5,000,000", "cost": "Free", "useCase": "Retail, P2P", "operator": "NIBSS"},
            {"name": "NEFT", "speed": "1-2 hours (batch)", "limit": "No limit", "cost": "Minimal", "useCase": "Bulk, payroll", "operator": "NIBSS"},
        ],
    },
    "KES": {
        "currency": "KES", "country": "Kenya", "countryCode": "KE",
        "iban": False,
        "localIdentifier": "Bank Account Number (per bank)",
        "schemes": [
            {"name": "M-Pesa", "speed": "Instant (seconds)", "limit": "KES 300,000/day", "cost": "Free under KES 1,000", "useCase": "P2P, retail, everything", "operator": "Safaricom"},
            {"name": "PesaLink", "speed": "Instant (seconds)", "limit": "KES 999,999", "cost": "KES 0-150", "useCase": "Bank-to-bank", "operator": "Kenya Bankers Assoc."},
            {"name": "EFT", "speed": "1-2 business days", "limit": "No limit", "cost": "Minimal", "useCase": "Payroll, bulk", "operator": "Kenya Bankers Assoc."},
        ],
    },
    "INR": {
        "currency": "INR", "country": "India", "countryCode": "IN",
        "iban": False,
        "localIdentifier": "IFSC (11 chars) + Account Number",
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
