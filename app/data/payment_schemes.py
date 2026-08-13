"""
Payment schemes data — loaded by the /api/schemes endpoint.

Maps each currency to its domestic payment rails (e.g. GBP has Faster Payments,
CHAPS, Bacs; CAD has Interac, EFT, Lynx). Each scheme describes speed, cost,
limits, use-case, and operator — essential for understanding why "sending £100"
and "sending £100 via CHAPS" are very different things.

This is educational data — always check the operator's current rules for
production routing.

Source-cited catalogue (plan task 2.1):
  - Every displayed rail carries a `sources` list of {name, label, url} pointing
    at the canonical official operator or regulator page verified in
    2026-08 (August 2026).
  - `verifiedAsof` on each currency records that verification month (YYYY-MM).
  - Limits that depend on the individual bank/FI are marked "Bank-set" (or
    "FI-set") rather than presented as universal facts.
"""
from typing import Optional

# Source URLs verified live during August 2026 — see report at
# .superpowers/sdd/task-2.1-report.md. Only operator/regulator domains are used;
# no aggregators or third-party listings.
_PAY_UK_FPS = "https://www.wearepay.uk/what-we-do/payment-systems/faster-payment-system/"
_PAY_UK_BACS = "https://www.wearepay.uk/what-we-do/payment-systems/bacs-payment-system/"
_BOE_CHAPS = "https://www.bankofengland.co.uk/payments/chaps"
_INTERAC_ETRANSFER = "https://www.interac.ca/en/payments/personal/send-receive-money-with-interac-e-transfer/"
_PAYMENTS_CANADA_ACSS = "https://www.payments.ca/systems-services/payment-systems/retail-batch-payment-system"
_PAYMENTS_CANADA_LYNX = "https://www.payments.ca/systems-services/payment-systems/high-value-payment-system-lynx"
_PAYMENTS_CANADA_RTR = "https://www.payments.ca/systems-services/payment-systems/real-time-rail-payment-system"
_FRB_FEDWIRE = "https://www.frbservices.org/financial-services/wires"
_FRB_FEDWIRE_EXPANSION = "https://www.frbservices.org/resources/financial-services/wires/expand-operating-days"
_FRB_FEDACH = "https://www.frbservices.org/financial-services/ach"
_FRB_FEDACH_SAMEDAY = "https://www.frbservices.org/financial-services/ach/same-day-service.html"
_FRB_FEDNOW = "https://www.frbservices.org/financial-services/fednow"
_FRB_FEDNOW_LIMIT = "https://frbservices.org/news/communications/111225-fednow-transaction-limit-increase"
_TCH_CHIPS = "https://www.theclearinghouse.org/payment-systems/CHIPS"
_TCH_RTP = "https://www.theclearinghouse.org/payment-systems/rtp"
_EPC_SCT_INST = "https://www.europeanpaymentscouncil.eu/what-we-do/sepa-instant-credit-transfer"
_EPC_SCT = "https://www.europeanpaymentscouncil.eu/what-we-do/sepa-credit-transfer"
_ECB_T2 = "https://www.ecb.europa.eu/paym/target/t2/html/index.en.html"
_NIBSS_NIP = "https://nibss-plc.com.ng/nibss-instant-payment/"
_CBN_NIP_CIRCULAR = "https://www.cbn.gov.ng/out/2022/ccd/circular%20nip%20limit.pdf"
_CBN_NEFT_MODES = "https://www.cbn.gov.ng/PaymentsSystem/modes.html"
_CBN_RTGS = "https://www.cbn.gov.ng/PaymentsSystem/LargeValuePayments.html"
_CBN_PSV2020 = "https://www.cbn.gov.ng/PaymentsSystem/PSV2020.html"
_CBK_NPS = "https://www.centralbank.go.ke/national-payments-system/"
_CBK_ACH = "https://www.centralbank.go.ke/national-payments-system/automated-clearing-house/"
_CBK_EFT_FAQ = "https://centralbank.go.ke/images/docs/kepss/VALUECAPPINGFAQBrochure.pdf"
_PESALINK = "https://pesalink.co.ke/about-us"
_SAFARICOM_MPESA = "https://www.safaricom.co.ke/personal/m-pesa/mpesa-charges"
_KBA_ACH_UPGRADE = "https://www.kba.co.ke/bank-clients-to-get-faster-funds-transfers-after-clearing-system-upgrade/"
_NPCI_UPI = "https://www.npci.org.in/product/upi"
_NPCI_IMPS = "https://www.npci.org.in/product/imps"
_RBI_RTGS_FAQ = "https://www.rbi.org.in/commonman/english/scripts/FAQs.aspx?Id=275"
_RBI_NEFT_FAQ = "https://www.rbi.org.in/commonman/english/scripts/FAQs.aspx?Id=274"
_RBA_NPP = "https://www.rba.gov.au/payments-and-infrastructure/new-payments-platform/"
_APLUS_NPP = "https://www.auspayplus.com.au/solutions/nppa"
_AUSPAYNET_BECS = "https://auspaynet.com.au/network/direct-debit-electronic-transfers"
_RBA_RITS = "https://www.rba.gov.au/payments-and-infrastructure/rits/about.html"
_ZENGIN_NET = "https://www.zengin-net.jp/en/"
_BOJ_OUTLINE = "https://www.boj.or.jp/en/paym/outline/index.htm"
_CBUAE_PS = "https://www.centralbank.ae/en/our-operations/payments-and-settlements/"
_AEP_AANI = "https://aep.ae/en/services/aani/"
_SWIFT_GPI = "https://www.swift.com/products/swift-gpi"
_SWIFT_CBPR = (
    "https://www.swift.com/standards/iso-20022/iso-20022-payments-financial-institutions/"
    "iso-20022-cpbr-end-coexistence-support"
)


_SCHEMES = {
    "GBP": {
        "currency": "GBP", "country": "United Kingdom", "countryCode": "GB",
        "iban": True,
        "localIdentifier": "Sort Code (6 digits) + Account Number (8 digits)",
        "verifiedAsof": "2026-08",  # verified August 2026
        "schemes": [
            {"name": "Faster Payments (FPS)", "speed": "Instant (<2s)", "limit": "£1,000,000 scheme max", "cost": "Free", "useCase": "Retail, bills, transfers", "operator": "Pay.UK",
             "howItWorks": ["Payer initiates; cleared in seconds, 24/7", "Name-checked via Confirmation of Payee before sending", "Beneficiary bank credits the account"],
             "features": ["24/7 instant", "Confirmation of Payee name-check", "Evolving under the New Payments Architecture (NPA)"],
             "limits": {"perTransaction": "£1,000,000 (scheme max)", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Scheme max raised to £1M (from £250k); banks cap lower — often ~£25,000 personal, up to £1M business"},
             "settlement": "Faster Payments Service (Pay.UK); evolving under the NPA", "reversible": False,
             "protections": ["Confirmation of Payee (mandatory since Oct 2024)", "APP-scam reimbursement up to £85,000 (50/50 PSP split)"],
             "roadmap": ["Scheme limit raised to £1,000,000", "New Payments Architecture (NPA) migration in progress"],
             "sources": [{"name": "Pay.UK", "label": "Pay.UK — Faster Payment System", "url": _PAY_UK_FPS}]},
            {"name": "CHAPS", "speed": "Same-day (RTGS)", "limit": "No limit", "cost": "£20-35", "useCase": "High-value, house purchases", "operator": "Bank of England",
             "howItWorks": ["Real-time gross settlement via the Bank of England", "Same-day, final and irrevocable", "Carried as ISO 20022 pacs.008 with enhanced data"],
             "features": ["ISO 20022 enhanced data", "Purpose Codes + LEI", "Structured postal addresses"],
             "limits": {"perTransaction": "No limit", "perDay": "No limit", "perMonth": "No limit", "receiving": "No limit", "note": "High-value; bank/operational controls apply"},
             "settlement": "Bank of England RTGS (final, same-day)", "reversible": False,
             "protections": ["Confirmation of Payee (mandatory since Oct 2024)", "APP-scam reimbursement up to £85,000 (50/50 PSP split)"],
             "roadmap": ["Purpose Codes + LEI mandated May 2025", "Hybrid addresses from Nov 2025; fully-unstructured addresses rejected Nov 2026", "Structured remittance mandated Nov 2025"],
             "sources": [{"name": "Bank of England", "label": "Bank of England — CHAPS", "url": _BOE_CHAPS}]},
            {"name": "Bacs Direct Credit", "speed": "3 business days", "limit": "No limit", "cost": "~£0.50", "useCase": "Payroll, pensions", "operator": "Pay.UK",
             "howItWorks": ["3-day cycle: submission day, processing day, settlement day", "Batched, low-cost, high-volume"],
             "features": ["Direct Credit + Direct Debit", "Low cost, high volume"],
             "limits": {"perTransaction": "No scheme limit", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Bacs is the bulk payroll/pension rail; corporates submit files, banks set customer caps"},
             "settlement": "Bacs 3-day cycle (Pay.UK)", "reversible": False, "protections": [], "roadmap": [],
             "sources": [{"name": "Pay.UK", "label": "Pay.UK — Bacs Payment System", "url": _PAY_UK_BACS}]},
        ],
    },
    "CAD": {
        "currency": "CAD", "country": "Canada", "countryCode": "CA",
        "iban": False,
        "localIdentifier": "Bank (3) + Transit (5) + Account (7-12)",
        "verifiedAsof": "2026-08",  # verified August 2026
        "schemes": [
            {"name": "Interac e-Transfer", "speed": "Instant (<30s)", "limit": "FI-set", "cost": "Free", "useCase": "P2P, retail, small business", "operator": "Interac Corp.",
             "family": "Interac e-Transfer",
             "variants": [
                 {"name": "Auto-Deposit", "description": "Recipient registers an email or phone alias so incoming transfers are deposited automatically, without answerable security questions, following routine fraud checks."},
                 {"name": "Request Money", "description": "A pull-style request: the sender asks a recipient for funds through the e-Transfer notification channel; the payer then sends the transfer."},
                 {"name": "Standard security-question claim", "description": "The recipient claims the transfer by answering the sender-set security question; the flow requires the question answer and deposit instructions to travel separately."},
             ],
             "howItWorks": ["Sender picks the recipient by email or phone (alias)", "Money moves over existing bank rails — the alias only carries the notification/deposit instructions", "Recipient auto-deposits, or answers a security question", "Funds land in seconds after routine interbank fraud checks"],
             "features": ["Autodeposit (sender is shown the recipient's registered legal name — a CoP-like check; may be delayed by fraud checks)", "Request Money (pull)", "Security-question claim (answer must not be guessable/public, and must not travel on the same channel as the transfer)"],
             "limits": {"perTransaction": "FI-set (typically $2,000-3,000 for consumers)", "perDay": "FI-set (e.g. $10,000 at some FIs)", "perMonth": "FI-set", "receiving": "FI-set", "note": "Interac publishes no single universal limit: transaction limits are set by each financial institution and are typically $2,000-3,000 per transaction for consumers; higher limits are available under Interac e-Transfer for Business"},
             "settlement": "Sender's and recipient's banks settle through their existing clearing arrangements (ACSS batch today); Interac e-Transfer clearing and settlement moves to the Real-Time Rail (RTR), which launches in Q4 2026", "reversible": False,
             "protections": ["Autodeposit shows the sender the recipient's registered legal name", "Cancellable while pending/unclaimed; irreversible once claimed or autodeposited", "Can go cross-border if the sender's bank participates"],
             "roadmap": ["Real-Time Rail (RTR) launches Q4 2026", "Initial Interac e-Transfer clearing and settlement migration participants go live Q1 2027; additional participants Q2 2027"],
             "sources": [
                 {"name": "Interac Corp.", "label": "Interac — Send and receive money with Interac e-Transfer", "url": _INTERAC_ETRANSFER},
                 {"name": "Payments Canada", "label": "Payments Canada — Real-Time Rail payment system", "url": _PAYMENTS_CANADA_RTR},
             ]},
            {"name": "EFT", "speed": "1-2 business days", "limit": "No limit", "cost": "$0.50-2", "useCase": "Payroll, vendor", "operator": "Payments Canada",
             "howItWorks": ["Batched and submitted in fixed daily windows", "Cleared and settled via ACSS", "Credited 1-2 business days later; no weekends/holidays"],
             "features": ["Batch processing", "Business days only"],
             "processingWindows": ["05:00 ET", "14:15 ET", "19:00 ET"],
             "limits": {"perTransaction": "No scheme limit", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "ACSS carries the vast majority of Canadian payment volume (99% of volume, 13% of value); banks set daily caps"},
             "settlement": "ACSS batch (Automated Clearing Settlement System), settled through accounts at the Bank of Canada", "reversible": False, "protections": [], "roadmap": [],
             "sources": [{"name": "Payments Canada", "label": "Payments Canada — Retail batch payment system (ACSS)", "url": _PAYMENTS_CANADA_ACSS}]},
            {"name": "Lynx", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "$5-25", "useCase": "High-value, wholesale", "operator": "Payments Canada",
             "howItWorks": ["Real-time gross settlement, transaction by transaction", "Final and irrevocable", "ISO 20022-native with rich remittance data"],
             "features": ["ISO 20022", "Designated a systemically important payment system (SIPS) under the Payment Clearing and Settlement Act", "Pre-funding underpins the incoming RTR"],
             "limits": {"perTransaction": "No limit", "perDay": "No limit", "perMonth": "No limit", "receiving": "No limit", "note": "No minimum volume or value requirements for participation; banks apply their own controls"},
             "settlement": "Lynx RTGS (final, real-time, in central-bank accounts)", "reversible": False,
             "protections": ["Real-time settlement finality (SIPS under the PCSA)", "Bank of Canada oversight"],
             "roadmap": ["ISO 20022-native; supports the incoming Real-Time Rail"],
             "sources": [
                 {"name": "Payments Canada", "label": "Payments Canada — High-value payment system (Lynx)", "url": _PAYMENTS_CANADA_LYNX},
                 {"name": "Payments Canada", "label": "Payments Canada — Lynx: Canada's new high-value payment system", "url": "https://www.payments.ca/lynx-canadas-new-high-value-payment-system"},
             ]},
        ],
    },
    "USD": {
        "currency": "USD", "country": "United States", "countryCode": "US",
        "iban": False,
        "localIdentifier": "ABA Routing (9) + Account Number",
        "verifiedAsof": "2026-08",  # verified August 2026
        "schemes": [
            {"name": "Fedwire", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "$10-35", "useCase": "High-value, wires", "operator": "Federal Reserve",
             "howItWorks": ["Sender's bank transmits a payment order via FedLine or an automated channel", "Settled in real time, individually, on the books of a Federal Reserve Bank", "Finality the moment the receiving bank's Federal Reserve master account is credited"],
             "features": ["22-hour operating day (9pm ET open, 7pm ET close), Monday-Friday", "No payment value limit at the service level", "Payment orders settled in central-bank money"],
             "limits": {"perTransaction": "No limit", "perDay": "No limit", "perMonth": "No limit", "receiving": "No limit", "note": "The Federal Reserve sets no value limit on Fedwire payments; participants apply their own internal and daily caps"},
             "settlement": "RTGS — payments settle individually and finally on the books of a Federal Reserve Bank, typically within seconds", "reversible": False,
             "protections": ["Settlement finality once the receiving bank's master account is credited", "No arbitration mechanism — erroneous wires must be returned by the receiving bank (consent-based)"],
             "roadmap": ["Operating days to expand to include Sundays and weekday holidays (22x6) — announced Oct 2025, implementation planned 2028 or 2029", "Expanded hours are an interim step toward a potential 22x7x365 schedule"],
             "sources": [
                 {"name": "Federal Reserve Financial Services", "label": "FRBServices — Fedwire Funds Service", "url": _FRB_FEDWIRE},
                 {"name": "Federal Reserve Financial Services", "label": "FRBServices — Fedwire and NSS operating-days expansion (Oct 2025)", "url": _FRB_FEDWIRE_EXPANSION},
             ]},
            {"name": "FedACH", "speed": "1-2 business days", "limit": "Same-Day ACH: $1M", "cost": "$0.10-0.50", "useCase": "Payroll, direct deposit", "operator": "Federal Reserve",
             "howItWorks": ["Originator's bank submits ACH files under the Nacha Operating Rules", "FedACH processes, distributes and settles the entries between participating banks", "Receiving banks post funds — typically next business day, or the same day via Same-Day ACH windows"],
             "features": ["Batch processing; Same-Day ACH with three daily windows", "Same-Day ACH limit $1,000,000 per payment (since March 2022)", "Payments above $1M, IAT and automated-enrollment entries are excluded from same-day processing"],
             "limits": {"perTransaction": "Same-Day ACH: $1,000,000 max per payment", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "The ACH network has no per-transaction cap for standard entries; the $1M cap applies to Same-Day ACH eligibility"},
             "settlement": "Batch deferred net settlement through the ACH network; Same-Day ACH settles within the current processing day", "reversible": False,
             "protections": ["Nacha Operating Rules return and reversal framework for mistaken, duplicate and unauthorized entries (best-effort, not guaranteed)"],
             "roadmap": ["Third Same-Day ACH processing window added 2021", "Same-Day ACH dollar limit raised to $1M in March 2022"],
             "sources": [
                 {"name": "Federal Reserve Financial Services", "label": "FRBServices — FedACH Products and Services", "url": _FRB_FEDACH},
                 {"name": "Federal Reserve Financial Services", "label": "FRBServices — FedACH SameDay Service", "url": _FRB_FEDACH_SAMEDAY},
             ]},
            {"name": "CHIPS", "speed": "Same-day (net settle)", "limit": "No limit", "cost": "$5-20", "useCase": "Wholesale, international", "operator": "The Clearing House",
             "howItWorks": ["Participants submit payment messages throughout the day", "A patented matching and netting algorithm continuously offsets payments, recycling liquidity (average efficiency ~26:1)", "Payments settle with finality; participant net positions settle over Fedwire"],
             "features": ["Largest private-sector USD clearing and settlement network (43 participants)", "Continuous net settlement (CNS)", "Designated a systemically important financial market utility (SIFMU)"],
             "limits": {"perTransaction": "No universal limit", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "CHIPS is a wholesale network; participating banks set their own limits"},
             "settlement": "Continuous net settlement throughout the day; final net positions settle via the Fedwire master account at end of day", "reversible": False,
             "protections": ["Settlement finality on cleared payments", "Title VIII / Regulation HH supervision by the Federal Reserve (SIFMU)"],
             "roadmap": ["Liquidity-saving algorithm continues to be enhanced; average efficiency ~26-29:1"],
             "sources": [{"name": "The Clearing House", "label": "The Clearing House — CHIPS", "url": _TCH_CHIPS}]},
            {"name": "RTP", "speed": "Instant (<10s)", "limit": "$10,000,000", "cost": "Free", "useCase": "Instant retail", "operator": "The Clearing House",
             "howItWorks": ["Sender's FI submits a credit transfer over the RTP network", "RTP clears and settles each payment individually in real time, 24/7/365", "The receiving FI must credit the recipient immediately; funds are available in seconds", "Settlement is final and irrevocable once submitted"],
             "features": ["24/7/365 availability, including holidays", "Payments up to $10,000,000 per transaction", "Immediate funds availability for the recipient"],
             "limits": {"perTransaction": "$10,000,000 network cap", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Immediate availability", "note": "The RTP network supports payments up to $10M; each financial institution sets its own internal limits"},
             "settlement": "Real-time gross settlement of each payment individually (interbank, final)", "reversible": False,
             "protections": ["Settlement finality — sending FIs cannot revoke or recall a submitted payment", "The network provides a request-for-return message (return is at the receiving FI's discretion)"],
             "roadmap": ["98% of U.S. instant payments cleared and settled via RTP in 2025"],
             "sources": [{"name": "The Clearing House", "label": "The Clearing House — Real Time Payments (RTP)", "url": _TCH_RTP}]},
            {"name": "FedNow", "speed": "Instant (seconds)", "limit": "$10,000,000 network", "cost": "Free", "useCase": "Instant retail", "operator": "Federal Reserve",
             "howItWorks": ["Sender's FI sends a credit transfer over the FedNow Service", "Each payment settles individually in real time on Federal Reserve Bank books, 24/7/365", "The receiving FI must make funds available immediately"],
             "features": ["24/7/365 instant payments service run by the Federal Reserve Banks", "Network transaction limit $10,000,000 since Nov 12, 2025 (raised from $1M)", "Each participant configures its own per-transaction cap"],
             "limits": {"perTransaction": "Network limit: $10,000,000 (effective Nov 12, 2025)", "perDay": "Participant-set", "perMonth": "Participant-set", "receiving": "Immediate availability", "note": "Network limit raised from $1M to $10M in Nov 2025; participants may set lower caps and defaults apply"},
             "settlement": "RTGS — individual real-time settlement on Federal Reserve Bank books", "reversible": False,
             "protections": ["Real-time settlement finality", "Participant risk tools including account-activity thresholds"],
             "roadmap": ["Network transaction limit $10,000,000 effective Nov 12, 2025"],
             "sources": [
                 {"name": "Federal Reserve Financial Services", "label": "FRBServices — FedNow Service", "url": _FRB_FEDNOW},
                 {"name": "Federal Reserve Financial Services", "label": "FRBServices — FedNow transaction limit increase (Nov 2025)", "url": _FRB_FEDNOW_LIMIT},
             ]},
        ],
    },
    "EUR": {
        "currency": "EUR", "country": "Eurozone (20 countries)", "countryCode": "EU",
        "iban": True,
        "localIdentifier": "IBAN (mandatory within SEPA)",
        "verifiedAsof": "2026-08",  # verified August 2026
        "schemes": [
            {"name": "SEPA Instant (SCT Inst)", "speed": "Instant (<10s)", "limit": "Bank-set (scheme cap removed)", "cost": "Free (parity with SCT mandated)", "useCase": "Instant P2P, retail", "operator": "EPC scheme; cleared via TIPS / RT1",
             "howItWorks": ["Payer's PSP sends the instant transfer 24/7/365", "Cleared and settled in under 10 seconds via TIPS (Eurosystem) or RT1 (EBA Clearing)", "Beneficiary PSP confirms or rejects within the timeout; funds are immediately available"],
             "features": ["24/7/365 — no cut-offs, no weekends", "Verification of Payee name-check before sending (mandatory for EUR PSPs since Oct 2025)", "Reach: all eurozone PSPs must send and receive under the Instant Payments Regulation"],
             "limits": {"perTransaction": "Bank-set", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "No scheme cap", "note": "The historical €100,000 scheme cap was lifted under the Instant Payments Regulation; PSPs set their own limits and must let customers adjust them"},
             "settlement": "Central-bank money via TIPS, or commercial-bank money via RT1", "reversible": False,
             "protections": ["Verification of Payee (mandatory for EUR since Oct 2025)", "Price parity: instant may not cost more than a standard SCT"],
             "roadmap": ["Instant Payments Regulation: eurozone PSPs had to receive by Jan 2025 and send by Oct 2025", "Non-eurozone EU PSPs follow in 2027"],
             "sources": [{"name": "European Payments Council", "label": "EPC — SEPA Instant Credit Transfer", "url": _EPC_SCT_INST}]},
            {"name": "SEPA Credit Transfer", "speed": "1 business day", "limit": "No limit", "cost": "Free-€1 (domestic-price rule)", "useCase": "Standard EUR cross-border", "operator": "EPC scheme; cleared via STEP2-T",
             "howItWorks": ["Batched pacs.008 files exchanged between PSPs in daily cycles", "Cleared through STEP2-T (EBA Clearing) or bilateral/CSM arrangements", "Credited no later than the next business day (D+1)"],
             "features": ["IBAN-only within SEPA (36 countries)", "ISO 20022 native since inception", "Same price as a domestic transfer by regulation"],
             "limits": {"perTransaction": "No scheme limit", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "No limit", "note": "Business days only — a Friday-evening SCT lands Monday; SCT Inst does not have that gap"},
             "settlement": "Multilateral net settlement in TARGET (STEP2-T cycles)", "reversible": False,
             "protections": ["SEPA recall procedure (best-effort, not guaranteed)"],
             "roadmap": ["2023 rulebook migration to ISO 20022 2019 version complete"],
             "sources": [{"name": "European Payments Council", "label": "EPC — SEPA Credit Transfer", "url": _EPC_SCT}]},
            {"name": "TARGET2", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "€0.80-2.50", "useCase": "High-value, interbank", "operator": "Eurosystem (ECB)",
             "howItWorks": ["Real-time gross settlement in central-bank money, transaction by transaction", "Runs on the consolidated T2 platform (live March 2023), ISO 20022 native", "Final and irrevocable on settlement"],
             "features": ["Settles ~€2 trillion per day", "Operating window roughly 02:30-18:00 CET for customer payments (cut-off 17:00)", "The settlement layer beneath EURO1, STEP2 and securities settlement"],
             "limits": {"perTransaction": "No limit", "perDay": "No limit", "perMonth": "No limit", "receiving": "No limit", "note": "High-value wholesale rail; banks route customer payments here when SCT/SCT Inst limits or timing don't fit"},
             "settlement": "T2 RTGS (final, real-time, central-bank money)", "reversible": False,
             "protections": [],
             "roadmap": ["TARGET2 and TARGET2-Securities consolidated onto the T2/T2S platform in 2023"],
             "sources": [{"name": "European Central Bank", "label": "ECB — What is T2?", "url": _ECB_T2}]},
        ],
    },
    "NGN": {
        "currency": "NGN", "country": "Nigeria", "countryCode": "NG",
        "iban": False,
        "localIdentifier": "NUBAN (10-digit account number)",
        "verifiedAsof": "2026-08",  # verified August 2026
        "schemes": [
            {"name": "NIBSS Instant Pay", "speed": "Instant (seconds)", "limit": "Bank-set (CBN-guided)", "cost": "Free", "useCase": "Retail, P2P", "operator": "NIBSS",
             "howItWorks": ["Payer initiates a transfer from their bank's app, USSD or internet banking", "NIBSS routes the instruction in real time to the receiving bank", "The receiving bank credits the beneficiary instantly; the platform runs 24/7/365"],
             "features": ["Account-number based, online real-time EFT platform (live since 2011)", "24/7/365 availability", "Name-check via the CBN/NIBSS Name Enquiry service"],
             "limits": {"perTransaction": "Bank-set (indemnity required above ₦1M for individuals)", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "CBN circular PSM/DIR/PUB/CIR/01/006 (May 2022): banks must accept indemnity for highly-secured online transfers above ₦1M (individual) / ₦10M (corporate), up to ₦25M individual / ₦250M corporate; each FI maintains its own platform cap"},
             "settlement": "Instant message delivery with immediate value; interbank positions settled on a deferred net basis via NIBSS", "reversible": False,
             "protections": ["CBN/NIBSS Name Enquiry service verifies account names before credit", "Regulated by CBN guidelines; disputes handled through bank claims processes"],
             "roadmap": ["CBN May 2022 circular raised the indemnity ceiling for online transfers to ₦25M (individual) / ₦250M (corporate)"],
             "sources": [
                 {"name": "NIBSS", "label": "NIBSS — NIBSS Instant Payment (NIP)", "url": _NIBSS_NIP},
                 {"name": "Central Bank of Nigeria", "label": "CBN circular — Review of NIP operations and transfer limits (May 2022)", "url": _CBN_NIP_CIRCULAR},
             ]},
            {"name": "NEFT", "speed": "1-2 hours (batch)", "limit": "No limit", "cost": "Minimal", "useCase": "Bulk, payroll", "operator": "NIBSS",
             "howItWorks": ["Bulk payment files are submitted to NIBSS by banks and corporates", "NIBSS exchanges and processes the files on a batch schedule", "Credits are posted on a deferred net basis; used for salaries, standing orders and bulk transfers"],
             "features": ["NIBSS Electronic Funds Transfer (operating since 2004)", "Batch deferred net settlement", "Supports General Interbank Recurring Order (GIRO) retail transfers"],
             "limits": {"perTransaction": "No scheme limit", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Deferred net basis — value is not instant; used for bulk and recurring payments"},
             "settlement": "Batch deferred net settlement via the NIBSS platform", "reversible": False, "protections": [], "roadmap": [],
             "sources": [{"name": "Central Bank of Nigeria", "label": "CBN — Payment Modes in Nigeria (NEFT)", "url": _CBN_NEFT_MODES}]},
            {"name": "CBN RTGS", "speed": "Real-time (RTGS)", "limit": "Bank-set", "cost": "Bank-set", "useCase": "High-value interbank, government, systemic payments", "operator": "Central Bank of Nigeria",
             "howItWorks": ["Payments settle transaction-by-transaction in real time on CBN books", "Used for high-value, time-critical interbank and government transfers", "The RTGS platform runs four settlement sessions; configurations were upgraded in April 2023"],
             "features": ["CBN-owned and operated RTGS — operations began December 2006; current platform deployed December 2013", "Settles scheme positions (e.g. NEFT net positions) in addition to direct high-value transfers", "The large-value complement to instant NIP and batch NEFT"],
             "limits": {"perTransaction": "Bank-set", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "CBN publishes no universal customer limit for RTGS; banks set thresholds and RTGS is typically used for high-value payments"},
             "settlement": "Real-time gross settlement in central-bank accounts; final at settlement", "reversible": False,
             "protections": ["Settlement finality in central-bank money", "CBN ownership and oversight under the national payments system framework"],
             "roadmap": ["April 2023 upgrade extended RTGS configurations to accommodate all schemes and instruments across the four settlement sessions", "PSV2020 policy moved large-value schemes toward central-bank settlement (Survivor Pays model achieved for RTGS)"],
             "sources": [
                 {"name": "Central Bank of Nigeria", "label": "CBN — Large Value Payments (RTGS)", "url": _CBN_RTGS},
                 {"name": "Central Bank of Nigeria", "label": "CBN — Payments System Vision 2020 (PSV2020)", "url": _CBN_PSV2020},
             ]},
        ],
    },
    "KES": {
        "currency": "KES", "country": "Kenya", "countryCode": "KE",
        "iban": False,
        "localIdentifier": "Bank Account Number (per bank)",
        "verifiedAsof": "2026-08",  # verified August 2026
        "schemes": [
            {"name": "KEPSS", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "Bank-set", "useCase": "High-value, interbank, government", "operator": "Central Bank of Kenya",
             "howItWorks": ["Payment instructions settle individually and continuously on a gross basis", "Settlement happens in commercial banks' accounts at the Central Bank of Kenya", "Available 24/7; settlement business hours are determined by CBK in consultation with the industry"],
             "features": ["Kenya Electronic Payment and Settlement System — live since July 29, 2005; upgraded June 5, 2020", "Classified as a systemically important payment system (SIPS)", "Wholly owned and operated by the Central Bank of Kenya"],
             "limits": {"perTransaction": "No universal limit", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Requires sufficient covering balance or credit (settlement limit); banks set customer thresholds"},
             "settlement": "RTGS — continuous real-time gross settlement in banks' CBK accounts; final upon settlement", "reversible": False,
             "protections": ["Real-time gross settlement eliminates systemic net-settlement risk", "Gridlock-resolution mechanism for queued transactions"],
             "roadmap": ["Upgraded June 2020; settles on SWIFT-based message exchange (KEPSS closed user group)"],
             "sources": [
                 {"name": "Central Bank of Kenya", "label": "CBK — National Payments System (KEPSS)", "url": _CBK_NPS},
                 {"name": "Central Bank of Kenya", "label": "CBK — KEPSS/RTGS", "url": "https://www.centralbank.go.ke/national-payments-system/kepss-rtgs/"},
             ]},
            {"name": "PesaLink", "speed": "Instant (seconds)", "limit": "KES 999,999/txn", "cost": "KES 0-150", "useCase": "Bank-to-bank, alias-capable", "operator": "IPSL (Kenya Bankers Assoc.)",
             "howItWorks": ["The sender initiates a transfer on their bank's app, internet banking or USSD", "PesaLink moves the money account-to-account in seconds, 24/7/365", "The beneficiary's account is credited with immediate value"],
             "features": ["Operated by Integrated Payment Services Limited (IPSL), the Kenya Bankers Association's real-time payment services company (est. 2015)", "Interoperable network of 80+ banks, telcos, fintechs and SACCOs", "Migrated to an ISO 20022-based real-time platform"],
             "limits": {"perTransaction": "KES 999,999", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "PesaLink supports transfers of up to KES 999,999 per transaction; banks set their own daily caps"},
             "settlement": "Immediate value with same-day settlement capabilities via the PesaLink platform", "reversible": False,
             "protections": ["End-to-end encrypted transactions across +80 participants", "Operated under the National Payment System (NPS) Act framework"],
             "roadmap": ["ISO 20022 modernization enables new push/pull payment use cases"],
             "sources": [{"name": "IPSL / PesaLink", "label": "PesaLink — About us (IPSL)", "url": _PESALINK}]},
            {"name": "M-Pesa", "speed": "Instant (seconds)", "limit": "KES 250,000/txn, 500,000/day", "cost": "Tiered tariff", "useCase": "Mobile wallet, P2P, merchant", "operator": "Safaricom",
             "howItWorks": ["Sender moves balance within the M-Pesa wallet ledger instantly", "Transfers to other M-Pesa users are immediate ledger moves", "Bank-to-wallet and wallet-to-bank legs run over the banking system's interbank arrangements"],
             "features": ["Mobile-money ledger under CBK supervision (Safaricom is a CBK-licensed mobile money operator)", "Per-transaction cap KES 250,000; daily cap KES 500,000; wallet balance cap KES 500,000", "Tiered transaction tariffs published by Safaricom"],
             "limits": {"perTransaction": "KES 250,000", "perDay": "KES 500,000", "perMonth": "Bank-set", "receiving": "Wallet balance cap KES 500,000", "note": "Safaricom tariff sheet (updated August 2026): maximum amount per transaction KES 250,000; maximum daily transaction value KES 500,000; maximum account balance KES 500,000"},
             "settlement": "Instant wallet-ledger movement within the M-Pesa trust framework; bank legs settle through interbank clearing", "reversible": False,
             "protections": ["CBK-regulated electronic money with reveral/claim processes via Safaricom channels", "Self-reversal within the transaction window (send confirmation to 456)"],
             "roadmap": ["Limits raised to KES 500,000 (wallet and daily) in August 2023"],
             "sources": [{"name": "Safaricom", "label": "Safaricom — M-PESA charges and limits", "url": _SAFARICOM_MPESA}]},
            {"name": "EFT", "speed": "1-2 business days", "limit": "No limit", "cost": "Minimal", "useCase": "Payroll, bulk", "operator": "Kenya Bankers Assoc.",
             "howItWorks": ["Corporates submit bulk files of many credit instructions (payroll, pensions)", "Files are exchanged and processed in batches at the Automated Clearing House", "Settlement is deferred to scheduled session times — value is not delivered in real time"],
             "features": ["Batch electronic funds transfer through the national ACH", "Runs on a deferred net settlement (DNS) basis", "ISO 20022 messaging since the 2023 ACH upgrade"],
             "limits": {"perTransaction": "No scheme limit", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "DNS basis — instructions are held until a designated settlement time at the ACH"},
             "settlement": "Deferred net settlement through the Automated Clearing House (settlement typically once per day)", "reversible": False,
             "protections": ["ACH rules cover return and correction of erroneous credits", "Remitter details mandatory on all payment instructions since 2019"],
             "roadmap": ["Automated Clearing House upgraded to ISO 20022 in 2023, improving turnaround times"],
             "sources": [
                 {"name": "Central Bank of Kenya", "label": "CBK — Automated Clearing House", "url": _CBK_ACH},
                 {"name": "Central Bank of Kenya", "label": "CBK FAQ — EFT vs RTGS (deferred net settlement)", "url": _CBK_EFT_FAQ},
             ]},
            {"name": "Bank Transfer (Direct Credit)", "speed": "Same-day to next business day", "limit": "Bank-set", "cost": "Bank-set", "useCase": "Individual interbank credit transfers", "operator": "Kenya Bankers Assoc. (via the Automated Clearing House)",
             "howItWorks": ["A single credit-transfer instruction from payer to beneficiary, initiated at a branch or online", "The paying bank forwards the individual instruction through the national Automated Clearing House", "Cleared and settled on a deferred net basis in scheduled sessions — typically credited the same day or next business day depending on cut-off", "Contrast with batch EFT: EFT aggregates many instructions into bulk files (payroll, pensions); a bank transfer is one instruction for one payment"],
             "features": ["Individual (single-sender, single-recipient) credit transfer", "Distinct from bulk EFT files and from real-time rails such as PesaLink", "Routed through the same ACH as batch EFT but as a standalone instruction"],
             "limits": {"perTransaction": "Bank-set", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Values above the clearing-house threshold for EFT are generally directed to KEPSS (RTGS) instead"},
             "settlement": "Deferred net settlement through the Automated Clearing House", "reversible": False,
             "protections": ["Clearing-house rules for returning or correcting erroneous credits"],
             "roadmap": ["ACH ISO 20022 upgrade (2023) shortens credit-transfer turnaround"],
             "sources": [
                 {"name": "Central Bank of Kenya", "label": "CBK — Automated Clearing House", "url": _CBK_ACH},
                 {"name": "Kenya Bankers Association", "label": "KBA — Faster funds transfers after ACH upgrade", "url": _KBA_ACH_UPGRADE},
             ]},
        ],
    },
    "INR": {
        "currency": "INR", "country": "India", "countryCode": "IN",
        "iban": False,
        "localIdentifier": "IFSC (11 chars) + Account Number",
        "verifiedAsof": "2026-08",  # verified August 2026
        "schemes": [
            {"name": "UPI", "speed": "Instant (seconds)", "limit": "₹1-5L (bank-set)", "cost": "Free", "useCase": "Everything (P2P, retail, bills)", "operator": "NPCI",
             "howItWorks": ["Payer authorises a payment in a UPI app (UPI PIN)", "The instruction is routed over the IMPS infrastructure in real time, 24/7", "The beneficiary's bank credits the account immediately"],
             "features": ["Built on the IMPS infrastructure — instant, 24/7, 365", "Payment address can be a VPA (mobile/email-style identifier), QR code or account+IFSC", "Operated by NPCI, an RBI-regulated payment utility"],
             "limits": {"perTransaction": "Default ₹1,00,000 (PSP-configurable)", "perDay": "Bank/PSP-set", "perMonth": "Bank/PSP-set", "receiving": "Bank-set", "note": "The standard UPI default cap is ₹1 lakh per transaction; banks and PSPs may set higher limits for specific categories (e.g. capital markets) with RBI/NPCI approval"},
             "settlement": "Interbank positions settle through NPCI's settlement arrangements with member banks; value to the beneficiary is immediate", "reversible": False,
             "protections": ["UPI PIN + device binding; additional risk flags for large-value mandates", "RBI-regulated; disputes resolved through the NPCI/grievance framework"],
             "roadmap": ["Expanding use cases: UPI Circle delegation, UPI for IoT devices (pilot), offshore UPI corridors"],
             "sources": [{"name": "NPCI", "label": "NPCI — UPI: Unified Payments Interface", "url": _NPCI_UPI}]},
            {"name": "IMPS", "speed": "Instant (seconds)", "limit": "₹5,00,000 (bank-set)", "cost": "₹5-15", "useCase": "Instant bank-to-bank", "operator": "NPCI",
             "howItWorks": ["Payer initiates an immediate payment from mobile, internet banking or ATM", "IMPS settles the transfer in real time, round the clock including holidays", "Both parties receive debit/credit confirmations by SMS"],
             "features": ["24x7 availability, functional even on holidays", "Channel-independent: mobile, internet and ATM initiated", "Operated by NPCI with RBI-authorised PPI issuers participating"],
             "limits": {"perTransaction": "Typically up to ₹5,00,000 (bank-set)", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Per-transaction caps are set by member banks within NPCI's framework"},
             "settlement": "Immediate interbank settlement through the IMPS platform", "reversible": False,
             "protections": ["SMS debit/credit confirmations", "RBI-regulated instant payment service"],
             "roadmap": ["UPI (built on IMPS) has become the dominant retail instant rail in India"],
             "sources": [{"name": "NPCI", "label": "NPCI — IMPS (Immediate Payment Service)", "url": _NPCI_IMPS}]},
            {"name": "RTGS", "speed": "Real-time (RTGS)", "limit": "₹2L minimum, no max", "cost": "Free", "useCase": "High-value, corporate", "operator": "RBI",
             "howItWorks": ["Payments settle continuously, transaction-by-transaction, on the books of the RBI", "The beneficiary bank must credit the account within 30 minutes of receiving the message", "Available 24x7x365 since December 14, 2020"],
             "features": ["Minimum ₹2,00,000 per transaction; no upper ceiling", "Next-Generation RTGS built on ISO 20022", "RBI processing charges waived since July 1, 2019; outward charges capped (₹25 / ₹50)"],
             "limits": {"perTransaction": "₹2,00,000 minimum; no maximum", "perDay": "No RBI cap", "perMonth": "No RBI cap", "receiving": "No RBI cap", "note": "Banks may set their own limits with board approval; inward transactions are free, outward charges capped at ₹25 (₹2-5 lakh) and ₹50 (above ₹5 lakh)"},
             "settlement": "Real-time gross settlement in RBI books; final on settlement", "reversible": False,
             "protections": ["Positive confirmation messages confirm beneficiary credit", "Return of un-credited funds within one hour; compensation at repo rate + 2% for delay"],
             "roadmap": ["24x7x365 operation since Dec 2020", "ISO 20022 NG-RTGS with liquidity management and hybrid functionality"],
             "sources": [{"name": "Reserve Bank of India", "label": "RBI — RTGS FAQs", "url": _RBI_RTGS_FAQ}]},
            {"name": "NEFT", "speed": "Half-hourly batches", "limit": "No limit", "cost": "Free", "useCase": "Standard, payroll", "operator": "RBI",
             "howItWorks": ["Instructions received up to each half-hourly batch are processed together", "RBI settles batches on a deferred net basis round the clock", "Credit is posted to the beneficiary's account during the batch cycle (24x7x365)"],
             "features": ["Runs in 48 half-hourly batches, 24x7x365 (since December 16, 2019)", "No floor or ceiling on transaction amount — no RBI-imposed limit", "Owned and operated by the RBI"],
             "limits": {"perTransaction": "No RBI-imposed limit", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "No limit", "note": "Banks may set amount limits based on risk perception with board approval"},
             "settlement": "Deferred net settlement in half-hourly batches through the RBI", "reversible": False,
             "protections": ["RBI-run retail rail; disputes via bank grievance and RBI Ombudsman schemes"],
             "roadmap": ["24x7 operation since Dec 2019; batch intervals standardised at 30 minutes"],
             "sources": [{"name": "Reserve Bank of India", "label": "RBI — NEFT FAQs", "url": _RBI_NEFT_FAQ}]},
        ],
    },
    "AUD": {
        "currency": "AUD", "country": "Australia", "countryCode": "AU",
        "iban": False,
        "localIdentifier": "BSB (6) + Account Number",
        "verifiedAsof": "2026-08",  # verified August 2026
        "schemes": [
            {"name": "NPP / PayID", "speed": "Instant (<15s)", "limit": "Bank-set (100,000+)", "cost": "Free", "useCase": "Instant P2P, retail", "operator": "NPP Australia",
             "howItWorks": ["The payer addresses the payment by PayID (mobile, email, ABN) or BSB + account", "The New Payments Platform moves the payment in near real time, 24/7", "Each payment settles individually via the Fast Settlement Service (built by the RBA)"],
             "features": ["National fast-payments infrastructure, launched February 2018", "Near real-time funds availability to the recipient, 24/7/365", "Overlay services: Osko (consumer transfers), PayID (alias addressing), PayTo"],
             "limits": {"perTransaction": "Participant-set (commonly AUD 100,000 per transfer or higher)", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "NPP Australia sets no universal consumer cap; individual ADIs set their own limits"},
             "settlement": "Fast Settlement Service — individual, near real-time settlement on a 24/7 basis", "reversible": False,
             "protections": ["Final and irrevocable individual settlement", "OSKO/PayID check facilities flag mismatched names where available"],
             "roadmap": ["Richer remittance data than Direct Entry (up to 280 characters, ISO 20022)", "New overlay services continue to launch on the platform"],
             "sources": [
                 {"name": "Reserve Bank of Australia", "label": "RBA — The New Payments Platform", "url": _RBA_NPP},
                 {"name": "Australian Payments Plus", "label": "Australian Payments Plus — NPP", "url": _APLUS_NPP},
             ]},
            {"name": "Direct Entry (BECS)", "speed": "1-2 business days", "limit": "Up to $100M", "cost": "AUD 0.10-0.50", "useCase": "Payroll, direct debit", "operator": "AusPayNet",
             "howItWorks": ["Users submit bulk files or single instructions to their bank", "Financial institutions exchange payment files six times a day on weekdays", "Settlement is deferred to the next exchange; same-day after the first five exchanges"],
             "features": ["Bulk Electronic Clearing System — Australia's primary A2A payment system", "Six official exchanges per weekday (10:00, 13:00, 16:00, 18:30, 20:45 and 22:30 Sydney time)", "Available for payments up to $100 million"],
             "limits": {"perTransaction": "Up to $100,000,000", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "BECS supports single payments up to $100M; banks set their own daily caps"},
             "settlement": "Deferred net settlement across six daily exchange sessions (same-day settlement after each of the first five)", "reversible": False,
             "protections": ["Direct-entry rules let customers stop, cancel or amend direct debits", "Dispute resolution between the collecting business and its FI"],
             "roadmap": ["BECS Transition program — the industry is moving away from the legacy framework toward modern A2A payments (e.g. NPP)"],
             "sources": [{"name": "Australian Payments Network", "label": "AusPayNet — Direct Debits & Electronic Transfers (BECS)", "url": _AUSPAYNET_BECS}]},
            {"name": "RITS", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "Wholesale rates", "useCase": "High-value, interbank", "operator": "RBA",
             "howItWorks": ["Banks settle payment obligations individually on a real-time gross basis", "Settlement is achieved by debiting and crediting Exchange Settlement Accounts (ESAs) at the RBA", "Payments entered directly or delivered via feeder systems (SWIFT, Austraclear, NPP)"],
             "features": ["Australia's high-value settlement system (RTGS since June 22, 1998)", "Final and irrevocable settlement", "Also settles low-value obligations via the Low Value Settlement Service"],
             "limits": {"perTransaction": "No limit", "perDay": "No limit", "perMonth": "No limit", "receiving": "No limit", "note": "RTGS settles out of ESA balances; banks manage intraday liquidity"},
             "settlement": "Real-time gross settlement in Exchange Settlement Accounts at the Reserve Bank — final and irrevocable", "reversible": False,
             "protections": ["Approved RTGS system under the Payment Systems and Netting Act 1998", "Finality protected from the zero-hour rule"],
             "roadmap": ["RITS operates as the settlement backbone for the NPP Fast Settlement Service"],
             "sources": [{"name": "Reserve Bank of Australia", "label": "RBA — About RITS", "url": _RBA_RITS}]},
        ],
    },
    "JPY": {
        "currency": "JPY", "country": "Japan", "countryCode": "JP",
        "iban": False,
        "localIdentifier": "Bank (4) + Branch (3) + Account",
        "verifiedAsof": "2026-08",  # verified August 2026
        "schemes": [
            {"name": "Zengin", "speed": "Same-day (batch)", "limit": "¥100M (clearing cap)", "cost": "Variable", "useCase": "Standard domestic", "operator": "JBA / Zengin-Net",
             "howItWorks": ["Banks exchange transfer messages over the Zengin System (online network)", "Most transfers are credited to the recipient's account almost in real time during operating hours", "The Domestic Funds Transfer System clears obligations between banks; transfers of ¥100M+ settle via BOJ-NET RTGS instead"],
             "features": ["Operated by the Japanese Banks' Payment Clearing Network (Zengin-Net), a licensed clearing agency", "Core Time System: weekdays ~8:30-15:30 (extended on heavy days)", "Zengin EDI System (ZEDI) adds attached EDI data to corporate transfers"],
             "limits": {"perTransaction": "¥100,000,000 clearing cap", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Funds clearing is limited to transactions under ¥100 million; large-value transfers settle through BOJ-NET RTGS"},
             "settlement": "Cleared through the Domestic Funds Transfer System on a net basis between participant banks", "reversible": False,
             "protections": ["Licensed funds clearing agency under the Payment Services Act", "Enhanced safety measures in the 7th-generation system (2019)"],
             "roadmap": ["7th-generation Zengin System live since November 2019", "More Time System (2018) extended operations to 24/7"],
             "sources": [{"name": "Japanese Banks' Payment Clearing Network", "label": "Zengin-Net (English)", "url": _ZENGIN_NET}]},
            {"name": "More Time", "speed": "Instant 24/7", "limit": "JPY 100K-1M (bank-set)", "cost": "Free", "useCase": "Instant P2P", "operator": "JBA / Zengin-Net",
             "howItWorks": ["Telegraphic transfers under ¥100 million are processed during nights, weekends and holidays", "Both sender's and receiver's banks must be connected to the More Time System at the time of the transfer", "If either bank is not connected, the transfer completes on the next business day"],
             "features": ["Launched October 2018 to make the Zengin System operate 24/7", "Covers telegraphic transfers of less than ¥100 million per transaction", "Bank participation is optional — each bank chooses its connection windows"],
             "limits": {"perTransaction": "Under ¥100,000,000", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Post-dated and bulk (salary/bonus) transfers are excluded from More Time"},
             "settlement": "Real-time payment when both banks are connected; otherwise next business day", "reversible": False,
             "protections": ["Real-time confirmation when both banks participate", "Bank-specified channel availability (ATM, internet banking)"],
             "roadmap": ["More Time System (since Oct 2018) complements the Core Time System for 24/7 operations"],
             "sources": [{"name": "Japanese Banks' Payment Clearing Network", "label": "Zengin-Net — More Time System announcement", "url": _ZENGIN_NET}]},
            {"name": "BOJ-NET", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "JPY 100-500", "useCase": "High-value, interbank", "operator": "Bank of Japan",
             "howItWorks": ["Funds transfers are processed and settled individually in real time (RTGS is the sole settlement mode)", "Settlement requires sufficient funds in the participant's BOJ account", "Also settles JGB transactions with delivery-versus-payment (DvP)"],
             "features": ["Bank of Japan Financial Network System — operated by the central bank", "RTGS sole settlement mode since January 2001", "Intraday overdraft facility supports participants' liquidity"],
             "limits": {"perTransaction": "No limit", "perDay": "No limit", "perMonth": "No limit", "receiving": "No limit", "note": "High-value wholesale rail; the destination for Zengin transfers of ¥100M and above"},
             "settlement": "Real-time gross settlement in Bank of Japan accounts; final at settlement", "reversible": False,
             "protections": ["RTGS removes DNS settlement risk for large values", "Central-bank money settlement"],
             "roadmap": ["RTGS-XG project brought liquidity-saving features into BOJ-NET FTS", "Next-generation RTGS continues to evolve under the Bank's payment and settlement roadmap"],
             "sources": [{"name": "Bank of Japan", "label": "Bank of Japan — Outline of Payment and Settlement Systems (BOJ-NET)", "url": _BOJ_OUTLINE}]},
        ],
    },
    "AED": {
        "currency": "AED", "country": "UAE", "countryCode": "AE",
        "iban": True,
        "localIdentifier": "IBAN (mandatory since 2011)",
        "verifiedAsof": "2026-08",  # verified August 2026
        "schemes": [
            {"name": "UAEFTS", "speed": "Same-day (real-time)", "limit": "Bank-set", "cost": "Bank-set", "useCase": "Large-value, interbank, government", "operator": "CBUAE",
             "howItWorks": ["Licensed institutions submit AED fund-transfer instructions during the operating window (~04:30-21:00 UAE time)", "Large-value payments settle in real time on CBUAE books within the same day", "All AED settlement between licensed persons must take place via UAEFTS, per CBUAE rules"],
             "features": ["CBUAE owns, operates and manages UAEFTS as the UAE's large-value payment system", "Real-time settlement of interbank, government and customer large-value payments", "An intraday liquidity facility (ILF) helps participants manage payment gridlocks"],
             "limits": {"perTransaction": "Bank-set", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "UAEFTS is the large-value AED rail; banks set customer thresholds and route lower-value retail transfers over other systems"},
             "settlement": "Real-time gross settlement of AED positions on CBUAE books within the operating window", "reversible": False,
             "protections": ["Settlement in central-bank money with CBUAE oversight", "Licensed-person access only; supervised by CBUAE Banking Supervision"],
             "roadmap": ["CBUAE FIT Programme modernises payments: Aani instant platform (2023), digital dirham and open finance initiatives underway"],
             "sources": [{"name": "Central Bank of the UAE", "label": "CBUAE — Payments and Settlements", "url": _CBUAE_PS}]},
            {"name": "Aani", "speed": "Instant (<10s)", "limit": "AED 50,000", "cost": "Free", "useCase": "Instant P2P, retail", "operator": "Al Etihad Payments",
             "howItWorks": ["Customers transfer using a mobile number, email address, IBAN or QR code", "Aani processes the payment in less than 10 seconds, 24/7", "Settlement is real-time on a gross basis against prefunded positions; success or failure is confirmed instantly"],
             "features": ["Instant payments platform operated by Al Etihad Payments, a CBUAE subsidiary (launched October 2023)", "Proxy payments, QR-code payments, Request to Pay and split payments", "Built on ISO 20022 messaging with event-driven architecture"],
             "limits": {"perTransaction": "AED 50,000", "perDay": "Bank-set", "perMonth": "Bank-set", "receiving": "Bank-set", "note": "Aani transactions are capped at AED 50,000; AEP plans phased increases to accommodate larger transactions"},
             "settlement": "Real-time gross settlement per transaction against prefunded positions", "reversible": False,
             "protections": ["Available only through licensed financial institutions and PSPs", "Predefined settlement exposure limits for participants"],
             "roadmap": ["AEP will review and potentially raise the AED 50,000 limit in phases", "Future international links to overseas instant payment platforms under exploration"],
             "sources": [{"name": "Al Etihad Payments", "label": "AEP — Aani", "url": _AEP_AANI}]},
        ],
    },
}


def get_schemes_for_currency(currency: str) -> Optional[dict]:
    """Return the payment schemes for a given currency code, or None."""
    return _SCHEMES.get(currency.strip().upper())


# ---------------------------------------------------------------------------
# International / SWIFT catalogue entry (plan task 2.2)
#
# One entry describing SWIFT gpi — the cross-border correspondent-payment
# overlay on the SWIFT network. Not a per-currency rail: it deliberately
# lives OUTSIDE _SCHEMES so list_currencies_with_schemes() keeps returning
# exactly the ten domestic currencies.
#
# Field vocabulary matches the domestic rails (sources, verifiedAsof,
# howItWorks, features, limits, settlement, reversible, protections,
# roadmap). The roadmap items are explicitly marked as roadmap — they
# describe the industry's direction of travel (CBPR+/ISO 20022), not
# current SWIFT gpi behaviour.
# ---------------------------------------------------------------------------


INTERNATIONAL_SCHEMES = {
    "scope": "International / SWIFT",
    "name": "SWIFT gpi",
    "speed": "Same-day to 1-3 business days (corridor- and cut-off-dependent)",
    "limit": "Bank/correspondent-set",
    "cost": "Bank/correspondent-set",
    "useCase": "Cross-border correspondent payments (MT103 / pacs.008)",
    "operator": "SWIFT",
    "howItWorks": [
        "The originator bank routes the payment through its correspondent network, hop by hop, to the beneficiary's bank",
        "Each hop is tracked in near real time via the SWIFT gpi tracker, and the UETR (field 121 / pacs.008) identifies the payment end to end",
        "Finality depends on the corridor — the beneficiary bank's credit is the point of no return, and intervening stops (compliance holds, cut-offs) can add days",
    ],
    "features": [
        "UETR end-to-end tracking across the chain",
        "Fee and status transparency (well-known scheme amount, tracking events)",
        "MT103 / pacs.008 messages carry the payment",
    ],
    "limits": {
        "perTransaction": "Correspondent-set",
        "perDay": "Correspondent-set",
        "perMonth": "Correspondent-set",
        "receiving": "Correspondent-set",
        "note": "Limits and fees are set by each bank/correspondent in the chain",
    },
    "settlement": "Correspondent banking — nostro/vostro balances settled between banks, not a central FX rail",
    "reversible": False,
    "protections": [
        "gpi tracking events give all parties a shared view of progress",
        "Errors are returned/recalled through the correspondent chain, not reversed unilaterally",
    ],
    "roadmap": [
        "CBPR+: ISO 20022 translation for cross-border payments in progress",
        "The eventual direction of travel is MT103 usage declining under ISO 20022 migration — roadmap, not current behaviour",
    ],
    "sources": [
        {"name": "SWIFT", "label": "SWIFT gpi — official", "url": _SWIFT_GPI},
        {"name": "SWIFT", "label": "CBPR+ — ISO 20022 end of coexistence", "url": _SWIFT_CBPR},
    ],
    "verifiedAsof": "2026-08",  # verified August 2026
    "disclaimer": (
        "SIMULATION — educational data. Always check the operator's current "
        "rules for production routing."
    ),
}


def get_international_schemes() -> dict:
    """Return the International / SWIFT catalogue entry (SWIFT gpi)."""
    return INTERNATIONAL_SCHEMES


def list_currencies_with_schemes():
    """Return all currency codes that have scheme data."""
    return sorted(_SCHEMES.keys())