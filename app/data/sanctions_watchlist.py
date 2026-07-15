"""
Mock sanctions watchlist — entirely fictional, for training/education only.

DO NOT use against any real system. DO NOT reproduce real OFAC entries.
Every name below is invented. The structure mimics a real consolidated-list
record (primary name, AKA, type, program) so it teaches the shape of screening.

Clearly labeled TRAINING USE ONLY — FICTIONAL in the UI and seed file.
"""

WATCHLIST = [
    {
        "id": "TRN-001",
        "name": "Tariq Kassem",
        "aliases": ["Tariq Mahmoud Kassem", "Qassem Tariq"],
        "type": "individual",
        "program": "SDGT",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-002",
        "name": "Abdul Rahman Al-Farsi",
        "aliases": ["Abd al-Rahman al-Farsi", "A. R. Farsi"],
        "type": "individual",
        "program": "SDGT",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-003",
        "name": "Novak Industries Holding Ltd",
        "aliases": ["Novak Holding", "NOVAK-IND"],
        "type": "entity",
        "program": "UKRAINE-EO",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-004",
        "name": "Meridian Defense Systems OOO",
        "aliases": ["Meridian DS", "MDS"],
        "type": "entity",
        "program": "SSI",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-005",
        "name": "Sergei Korolev",
        "aliases": ["Korolov S.", "Sergey Korolev"],
        "type": "individual",
        "program": "SDN",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-006",
        "name": "Petro-Carib Refining SA",
        "aliases": ["PetroCarib", "PC Refining"],
        "type": "entity",
        "program": "SDNTK",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-007",
        "name": "MV Desert Star",
        "aliases": ["ex-Northern Light"],
        "type": "vessel",
        "program": "IRAN-SHIP",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-008",
        "name": "Desert Ventures LLP",
        "aliases": ["DV Trading"],
        "type": "entity",
        "program": "SDGT",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-009",
        "name": "Lin Wei",
        "aliases": ["Lin W."],
        "type": "individual",
        "program": "SDN",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-010",
        "name": "Al-Salam Foundation Mock Trust",
        "aliases": ["Salam Foundation", "ASF Mock"],
        "type": "entity",
        "program": "SDGT",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-011",
        "name": "Volga Shipping Company JSC",
        "aliases": ["Volga-Line"],
        "type": "entity",
        "program": "SSI",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-012",
        "name": "Caribbean Exchange House SA",
        "aliases": ["CaribX", "CEX SA"],
        "type": "entity",
        "program": "SDNTK",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-013",
        "name": "Mohammed Ali",
        "aliases": ["Ali Mohammed", "Mohammad A."],
        "type": "individual",
        "program": "SDN",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-014",
        "name": "Viktor Dragomirov",
        "aliases": ["V. Dragomirov", "Dragomirov V."],
        "type": "individual",
        "program": "SDN",
        "country": "XX",
        "authority": "OFAC",
    },
    {
        "id": "TRN-015",
        "name": "Granite Security Group Mock",
        "aliases": ["Granite Security", "GSG Mock"],
        "type": "entity",
        "program": "SDN",
        "country": "XX",
        "authority": "OFAC",
    },
]

DISCLAIMER = (
    "TRAINING DATA — FICTIONAL. This is not a real sanctions list. "
    "Every name is invented. Do not use this tool for real screening."
)
