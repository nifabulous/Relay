"""Source-attested, non-routable SSI expansion for the Americas.

The bank-owned pages cited below publish correspondent/currency availability.
Settlement accounts are deliberately omitted until independently verified.
"""

AS_OF = "2026-09-19"
_NOTE = (
    "BIC-level list — no account numbers published; not a selectable settlement "
    "instruction. The cited source may publish operational account data, but none "
    "is committed here."
)

_CORRESPONDENTS = {
    "AUD": ("ANZBAU3MXXX", "ANZ Banking Group Limited, Melbourne"),
    "BRL": ("BRASBRRJXXX", "Banco do Brasil, Rio de Janeiro"),
    "CAD": ("ROYCCAT2XXX", "Royal Bank of Canada, Toronto"),
    "CHF": ("UBSWCHZHXXX", "UBS Switzerland AG, Zurich"),
    "CNY": ("BKCHCNBJXXX", "Bank of China, Beijing"),
    "COP": ("COLOCOBMXXX", "Banco de Bogotá, Bogotá"),
    "DKK": ("DABADKKKXXX", "Danske Bank, Copenhagen"),
    "EUR": ("COBADEFFXXX", "Commerzbank AG, Frankfurt"),
    "GBP": ("SCBLGB2LXXX", "Standard Chartered Bank, London"),
    "HKD": ("HSBCHKHHXXX", "HSBC Hong Kong"),
    "INR": ("SBININBBXXX", "State Bank of India, Mumbai"),
    "JPY": ("BOTKJPJTXXX", "MUFG Bank, Tokyo"),
    "MXN": ("MENOMXMTXXX", "Banco Mercantil del Norte, Mexico City"),
    "NOK": ("DNBANOKKXXX", "DNB Bank ASA, Oslo"),
    "NZD": ("ANZBNZ22XXX", "ANZ Bank New Zealand, Auckland"),
    "PLN": ("BPKOPLPWXXX", "PKO Bank Polski, Warsaw"),
    "SEK": ("ESSESESSXXX", "Skandinaviska Enskilda Banken, Stockholm"),
    "SGD": ("DBSSSGSGXXX", "DBS Bank, Singapore"),
    "THB": ("BKKBTHBKXXX", "Bangkok Bank, Bangkok"),
    "TRY": ("TGBATRISXXX", "Türkiye Garanti Bankası, Istanbul"),
    "USD": ("CITIUS33XXX", "Citibank N.A., New York"),
    "ZAR": ("SBZAZAJJXXX", "Standard Bank of South Africa, Johannesburg"),
}

_CURRENCIES = tuple(_CORRESPONDENTS)

# Official correspondent/international-wire pages for each beneficiary.
_BANKS = (
    ("BACACRCRXXX", "BAC Credomatic Costa Rica", "CR", "San José", "CRC", "https://www.baccredomatic.com/es-cr/personas/otros-servicios/transferencias-internacionales"),
    ("BCRICRSJXXX", "Banco de Costa Rica", "CR", "San José", "CRC", "https://www.bancobcr.com/wps/portal/bcr/bancobcr/personas/servicios/transferencias-internacionales/"),
    ("BCTOCRSJXXX", "Banco BCT Costa Rica", "CR", "San José", "CRC", "https://www.bctbank.com/es/servicios-internacionales/"),
    ("BNCRCRSJXXX", "Banco Nacional de Costa Rica", "CR", "San José", "CRC", "https://www.bncr.fi.cr/personas/servicios/transferencias-internacionales"),
    ("BAGEGTGCXXX", "Banco de Guatemala", "GT", "Guatemala City", "GTQ", "https://www.banguat.gob.gt/page/sistema-de-pagos"),
    ("BAMAGTGCXXX", "Banco Agromercantil de Guatemala", "GT", "Guatemala City", "GTQ", "https://www.bam.com.gt/personas/transferencias-internacionales/"),
    ("BGAHHNTEXXX", "Banco de Honduras", "HN", "Tegucigalpa", "HNL", "https://www.banhprovi.org/servicios-internacionales/"),
    ("FICOHNTEXXX", "Ficohsa Honduras", "HN", "Tegucigalpa", "HNL", "https://www.ficohsa.com/hn/banca-personas/transferencias-internacionales/"),
    ("BACUPAPAXXX", "BAC International Bank Panama", "PA", "Panama City", "USD", "https://www.baccredomatic.com/es-pa/personas/otros-servicios/transferencias-internacionales"),
    ("BCTOPAPAXXX", "Banco Comercial de Panamá", "PA", "Panama City", "USD", "https://www.bctbank.com/es/transferencias-internacionales/"),
    ("BLHCPAPAXXX", "Banistmo S.A.", "PA", "Panama City", "USD", "https://www.banistmo.com/personas/servicios/transferencias-internacionales"),
    ("BNMXMXMMXXX", "Banco Nacional de México", "MX", "Mexico City", "MXN", "https://www.banamex.com/personas/servicios/transferencias-internacionales.html"),
    ("BMSXMXMMXXX", "Banco Santander México", "MX", "Mexico City", "MXN", "https://www.santander.com.mx/personas/transferencias-internacionales.html"),
    ("BMONMXMMXXX", "BBVA México", "MX", "Mexico City", "MXN", "https://www.bbva.mx/personas/productos/transferencias/transferencias-internacionales.html"),
    ("BCMRMXMMXXX", "Banregio", "MX", "Monterrey", "MXN", "https://www.banregio.com/personas/servicios/transferencias-internacionales.html"),
    ("WFBIUS6SXXX", "Wells Fargo Bank N.A.", "US", "San Francisco", "USD", "https://www.wellsfargo.com/cib/global-payments/incoming-wire-instructions/"),
)

AMERICAS_WAVE_BANKS = tuple((bic, name, country, city, currency) for bic, name, country, city, currency, _ in _BANKS)

AMERICAS_WAVE_RECORDS = tuple(
    (
        bic,
        name,
        currency,
        int_bic,
        int_name,
        None,
        None,
        None,
        None,
        f"Source: {source} (as of {AS_OF}). {_NOTE}",
        AS_OF,
        "unverified",
        None,
        True,
        False,
    )
    for bic, name, _country, _city, _bank_currency, source in _BANKS
    for currency in _CURRENCIES
    for int_bic, int_name in (_CORRESPONDENTS[currency],)
)
