# SWIFT Intermediary Routing API

A small FastAPI service that validates IBAN/BIC, looks up banks, and returns
**heuristic intermediary bank suggestions** for cross-border payments.

> ⚠️ **Important limitation**: there is no public, free, authoritative dataset of
> SWIFT correspondent relationships — real routing is private, bilateral, and
> bank-specific. This service uses a **curated corridor table** as a stand-in.
> For production accuracy you'd license [SWIFTRef](https://www.swift.com/our-solutions/compliance-and-shared-services/financial-crime-compliance/swiftref)
> or [Accuity Bankers Almanac](https://accuity.com/).

## Quick start (local, zero setup)

```bash
cd swift-routing
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

Open the interactive docs: <http://127.0.0.1:8000/docs>

By default the app uses **SQLite** (`swift_routing.db`, auto-created + seeded).
No Docker / Postgres needed for local dev.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Service + data status (incl. Fed + SSI counts) |
| `GET` | `/api/validate?value=<iban-or-bic>` | Validate IBAN/BIC, derive BIC from IBAN |
| `GET` | `/api/lookup?bic=<bic>` | SWIFT bank directory lookup |
| `GET` | `/api/us-bank?routing_number=<9-digits>` | US bank lookup (Fedwire/FedACH) |
| `GET` | `/api/route?bic=<bic-or-routing>&currency=<CCY>` | Suggested intermediary banks |
| `GET` | `/api/ssi?bic=<bic>&currency=<CCY>` | Standard Settlement Instructions |
| `POST` | `/api/verify-payee` | Verification of Payee (name ↔ account match) |
| `POST` | `/api/prepare-payment` | **One-call orchestration: validate + VoP + route + SSI → recommendation** |
| `POST` | `/api/track/create` | Create a payment with UETR tracking (simulated gpi) |
| `GET` | `/api/track/{uetr}` | Retrieve payment status timeline by UETR |
| `GET` | `/api/schemes?currency=<CCY>` | Payment schemes (Faster Payments, SEPA, CHAPS, etc.) |
| `POST` | `/api/fees/simulate` | Simulate OUR/SHA/BEN fee deduction across intermediary hops |
| `POST` | `/api/screen` | Sanctions screening (fictional watchlist — training only) |
| `POST` | `/api/value-date` | Calculate settlement value date (cut-offs, holidays, T+n) |
| `POST` | `/api/message/stp-check` | MT103 straight-through-processing checker (12 rules) |
| `GET` | `/api/progress` | Learning progress + badges (for the Payment Lab) |
| `POST` | `/api/import/fedwire` | Reload Fedwire directory (requires `FEDWIRE_URL` + admin key) |
| `POST` | `/api/import/fedach` | Reload FedACH directory (requires `FEDACH_URL` + admin key) |
| `POST` | `/api/import/ssi` | Upload CSV/JSON of SSI records (requires admin key) |

### Examples

```bash
# Validate an IBAN
curl "http://127.0.0.1:8000/api/validate?value=GB29NWBK60161331926819"

# Look up a bank
curl "http://127.0.0.1:8000/api/lookup?bic=GTBINGLAXXX"

# Get intermediary suggestions for a USD->NGN payment
curl "http://127.0.0.1:8000/api/route?bic=GTBINGLAXXX&currency=NGN"

# One-call payment preparation (the headline endpoint)
curl -X POST "http://127.0.0.1:8000/api/prepare-payment" \
  -H "Content-Type: application/json" \
  -d '{"beneficiary_iban":"NG3705000012345678901234","beneficiary_name":"Olaniyi Oladokun","beneficiary_bic":"GTBINGLAXXX","currency":"USD","amount":1000}'
# → {"recommendation":"PROCEED","reason":"All checks passed. Safe to proceed.", ...}
```

Sample `/route` response:

```json
{
  "bic": "GTBINGLAXXX",
  "bank": {
    "bic": "GTBINGLAXXX",
    "bank_name": "Guaranty Trust Bank",
    "country_code": "NG",
    "city": "Lagos",
    "country_currency": "NGN"
  },
  "beneficiary_country": "NG",
  "currency": "NGN",
  "valid": true,
  "suggested_intermediaries": [
    {"bic": "CITIUS33XXX", "bank": "Citibank N.A.", "corridor": "USD->NG", "confidence": "high"},
    {"bic": "BOFAUS3NXXX", "bank": "Bank of America", "corridor": "USD->NG", "confidence": "medium"},
    {"bic": "SCBLGB22XXX", "bank": "Standard Chartered", "corridor": "USD->NG", "confidence": "medium"}
  ],
  "notes": "Routing is heuristic. Exact chain depends on originator bank's Nostro relationships...",
  "source": "curated-corridor-table"
}
```

## Using Postgres

```bash
export DATABASE_URL="postgresql+psycopg2://user:pass@localhost:5432/swift_routing"
pip install -e ".[postgres]"
uvicorn app.main:app --reload
```

(Tables are auto-created on startup; use Alembic for managed migrations in production.)

## Importing the Federal Reserve bank directory (legit, free, public)

The FRB E-Payments Routing Directory is the authoritative free source for US
bank routing (ABA) numbers. This project ships a parser + importer for both:

- **Fedwire Funds** (`fpddir.txt`) — ~7,500 banks eligible for wire transfers
- **FedACH** (`FedACHdir.txt`) — ~25,000 ACH-eligible institutions

> **Terms note**: the data is free and public. The FRB asks you to accept their
> Terms of Use at <https://www.frbservices.org/resources/routing-number-directory>.
> The importer defaults to a widely-mirrored open copy for development; set
> `FEDWIRE_URL` / `FEDACH_URL` env vars to point at your own downloaded copy.

### Load it (CLI — recommended for one-time / batch loads)

```bash
python -m app.cli stats            # see current row counts
python -m app.cli import-fedwire   # ~7,500 rows
python -m app.cli import-fedach    # ~25,000 rows
python -m app.cli stats            # confirm loaded
```

### Or via API (admin use — heavy operations)

```bash
curl -X POST http://127.0.0.1:8000/api/import/fedwire
curl -X POST http://127.0.0.1:8000/api/import/fedach
```

### Then query a US bank by routing number

```bash
curl "http://127.0.0.1:8000/api/us-bank?routing_number=011000015"
# → { "routing_number": "011000015", "found": true,
#     "bank": { "customer_name": "FEDERAL RESERVE BANK OF BOSTON",
#               "city": "BOSTON", "state_code": "MA", "source": "fedwire" } }
```

### And route domestic USD (no intermediary needed)

```bash
curl "http://127.0.0.1:8000/api/route?bic=011000015&currency=USD"
# → notes: "Domestic USD wire via Fedwire Funds — no SWIFT intermediary required..."
```

## Prepare Payment (combined endpoint)

The headline endpoint. One call that runs all four pre-send checks —
validation, VoP (name verification), routing, and SSI (settlement) — and
returns a single `recommendation` that tells the caller whether to enable
the Send button.

### Request

```bash
curl -X POST http://127.0.0.1:8000/api/prepare-payment \
  -H "Content-Type: application/json" \
  -d '{
    "beneficiary_iban": "NG3705000012345678901234",
    "beneficiary_name": "Olaniyi Oladokun",
    "beneficiary_bic": "GTBINGLAXXX",
    "currency": "USD",
    "amount": 1000,
    "strictness": "standard"
  }'
```

### The recommendation

| Recommendation | `is_blocking` | Meaning |
|---|---|---|
| **PROCEED** | No | All checks passed — safe to send |
| **PROCEED_WITH_CAUTION** | No | Sendable, but SSI accounts unverified or name close (lenient) |
| **REVIEW** | No | Name is a close match — payer must confirm (standard) |
| **CAUTION** | No | Payee couldn't be verified — proceed at own risk |
| **STOP** | **Yes** | Name doesn't match (fraud risk) or strict mode blocked |
| **BLOCKED** | **Yes** | No route to destination for this currency |
| **REJECT** | **Yes** | Beneficiary details failed validation |

### Decision layers (in priority order)

```
1. Validation gate    → invalid details = REJECT (nothing else matters)
2. VoP safety check   → NO_MATCH = STOP, CLOSE_MATCH = REVIEW/STOP (by strictness)
3. Routing            → no intermediaries = BLOCKED
4. SSI readiness      → real accounts = PROCEED, placeholders = PROCEED_WITH_CAUTION
```

### Strictness modes

| Mode | CLOSE_MATCH | NOT_CHECKED |
|---|---|---|
| `lenient` | PROCEED_WITH_CAUTION (warn but allow) | CAUTION |
| `standard` (default) | REVIEW (human must confirm) | CAUTION |
| `strict` | STOP (block) | STOP (block) |

### Live-verified example

```json
{
  "recommendation": "PROCEED",
  "reason": "All checks passed. Safe to proceed.",
  "is_blocking": false,
  "uetr": "63813477-98d5-4589-a323-ac0ab4114757",
  "validation": { "valid": true, "bic": "GTBINGLAXXX" },
  "vop": { "outcome": "MATCH", "score": 1.0 },
  "routing": { "suggested_intermediaries": [
    { "bic": "CITIUS33XXX", "bank": "Citibank N.A.", "confidence": "high" }
  ]},
  "ssi": { "instructions": [...], "has_real_accounts": true },
  "warnings": [],
  "blocks": []
}
```

The `uetr` bridges to the tracking endpoint — if the payment is sent, use this UETR with `POST /api/track/create`.

## Standard Settlement Instructions (SSI)

SSI records are the **production-grade** counterpart to the heuristic `/route`
suggestions. A real SSI carries the actual account numbers that make a payment
settle — the thing `/route` deliberately omits.

### `/route` vs `/ssi` — what's the difference?

| | `/api/route` | `/api/ssi` |
|---|---|---|
| **Purpose** | "Which intermediary banks *might* clear this?" | "How do I *actually* settle this payment?" |
| **Intermediary BIC** | ✓ | ✓ |
| **Nostro account at intermediary** | ✗ | ✓ |
| **Beneficiary account** | ✗ | ✓ |
| **Charge code (OUR/SHA/BEN)** | ✗ | ✓ |
| **Value date** | ✗ | ✓ |
| **Authority** | Heuristic (curated) | Definitive (bank-published) |

### Query SSI for a beneficiary bank

```bash
# All settlement instructions for a bank
curl "http://127.0.0.1:8000/api/ssi?bic=GTBINGLAXXX"

# Filter to a single currency
curl "http://127.0.0.1:8000/api/ssi?bic=GTBINGLAXXX&currency=USD"
```

Sample response:

```json
{
  "beneficiary_bic": "GTBINGLAXXX",
  "currency": "USD",
  "instructions": [
    {
      "beneficiary_bic": "GTBINGLAXXX",
      "beneficiary_bank_name": "Guaranty Trust Bank",
      "currency": "USD",
      "intermediary_bic": "CITIUS33XXX",
      "intermediary_bank_name": "Citibank N.A.",
      "intermediary_account": "ACCT-36012609",
      "beneficiary_account": "ACCT-0001234567",
      "charge_code": "SHA",
      "value_date": "spot",
      "notes": "Illustrative placeholder ..."
    }
  ],
  "disclaimer": "Account numbers in seed data are ILLUSTRATIVE placeholders..."
}
```

> ⚠️ **Critical**: the seeded account numbers are `ACCT-` placeholders, **not
> real account numbers**. Real SSI data is bank-specific, changes over time,
> and must be sourced from each bank's published treasury/correspondent-banking
> page or a licensed feed (Accuity, SWIFTRef). Never wire funds using seed data.
> The placeholder format is deliberate — tests enforce that every seed account
> starts with `ACCT-` so no synthetic number can be mistaken for real.

### Where to get real SSI data

Unlike the CHIPS UID lookup (third-party, ToS-restricted), **SSI data is
first-party** — banks *publish their own* SSI lists because they want
counterparties to know how to pay them:

- Bank treasury / correspondent banking pages (Standard Chartered, Citi, GTBank,
  Standard Bank, Ecobank, etc.)
- SWIFT MT999/MT199 messages to clients
- Licensed aggregators: Accuity Bankers Almanac, SWIFTRef

### Importing real SSI data (CSV / JSON)

The seed SSI records use `ACCT-` placeholder account numbers. To load real data
from a bank's published SSI list, use the importer — it handles CSV and JSON,
validates every row (BIC checksums, charge codes, currency codes), and uses
**upsert** semantics so re-importing updates account numbers rather than
creating duplicates.

**CSV format** (see `samples/ssi_sample.csv`):

```csv
beneficiary_bic,beneficiary_bank_name,currency,intermediary_bic,intermediary_bank_name,intermediary_account,beneficiary_account,charge_code,value_date,notes
GTBINGLAXXX,Guaranty Trust Bank,USD,CITIUS33XXX,Citibank N.A.,36012609,0001234567,SHA,spot,From GTBank treasury page
```

**JSON format** (see `samples/ssi_sample.json`) — array of objects or `{"records": [...]}`.

**Required fields:** `beneficiary_bic`, `currency`, `intermediary_bic`
**Optional fields:** `beneficiary_bank_name`, `intermediary_bank_name`,
`intermediary_account`, `beneficiary_account`, `charge_code` (default `SHA`),
`value_date` (default `spot`), `notes`

**Valid charge codes:** `OUR`, `SHA`, `BEN`
**Valid value dates:** `same-day`, `spot`, `T+1`, `T+2`, `T+3`

#### Load via CLI

```bash
python -m app.cli import-ssi samples/ssi_sample.csv
# → [ssi] SSI import: 0 inserted, 5 updated, 0 rejected (5 total rows).

python -m app.cli import-ssi samples/ssi_sample.json
# → [ssi] SSI import: 0 inserted, 2 updated, 0 rejected (2 total rows).
```

#### Or upload via API

```bash
curl -X POST http://127.0.0.1:8000/api/import/ssi \
  -F "file=@samples/ssi_sample.csv"
```

Response includes per-row rejection details:

```json
{
  "inserted": 1,
  "updated": 0,
  "rejected": 1,
  "total_rows": 2,
  "errors": [
    {"row": 2, "errors": ["Invalid/missing beneficiary_bic: 'BADBIC01'"]}
  ]
}
```

#### Upsert behavior

Records are keyed by `(beneficiary_bic, currency, intermediary_bic)`. Re-importing
the same key **updates** the account numbers and charge code — so when a bank
publishes revised SSIs, you just re-import the file. Bad rows are rejected with
reasons and do not abort the batch.

## Verification of Payee (VoP)

Verifies that a beneficiary name matches the account holder on record, *before*
the payment is sent — reducing misdirected payments and fraud. Follows the
[EPC103-24 VoP scheme](https://www.europeanpaymentscouncil.eu/document-library/implementation-guidelines/verification-payee-scheme-inter-psp-api-specifications-0)
contract (mandatory in the EEA since Jan 2025).

### Request

```bash
curl -X POST http://127.0.0.1:8000/api/verify-payee \
  -H "Content-Type: application/json" \
  -d '{"iban":"GB29NWBK60161331926819","name":"John Smith"}'
```

### Response outcomes

| Outcome | When | Account name returned? | Advice |
|---|---|---|---|
| **MATCH** | Name matches (≥90% similarity) | No (implicit) | Safe to proceed |
| **CLOSE_MATCH** | Similar but not exact (75–90%) | **Yes** — for payer review | Confirm before proceeding |
| **NO_MATCH** | Does not match (<75%) | **No** (privacy) | Do NOT proceed |
| **NOT_CHECKED** | Account not found / bank doesn't participate | No | Proceed with caution |

```json
{
  "iban": "GB29NWBK60161331926819",
  "submitted_name": "Jon Smyth",
  "outcome": "CLOSE_MATCH",
  "score": 0.8421,
  "account_holder_name": "John Smith",
  "account_type": "personal",
  "advice": "Name is similar but not exact. The account holder name is provided for review..."
}
```

### How matching works

The name-matching engine normalizes both names (accent-stripping, case-folding,
title removal, punctuation stripping, token-sorting) then compares with
`difflib.SequenceMatcher`. This makes the comparison robust to:
- Case differences: `JOHN SMITH` ≈ `john smith`
- Name order: `John Smith` ≈ `Smith, John`
- Accents: `Hans Müller` ≈ `Hans Mueller`
- Titles: `Mr John Smith` ≈ `John Smith`
- Minor typos: `Jon Smyth` → CLOSE_MATCH with `John Smith`

### Privacy (per EPC scheme)

- On **CLOSE_MATCH**, the real account-holder name is returned so the payer can confirm.
- On **NO_MATCH**, the name is **withheld** — you only learn that it doesn't match, not who the actual holder is.

### Production adapter

This implementation uses a **local synthetic account registry** (seeded `Account`
records). The `VoPBackend` protocol defines the adapter interface so a real
gateway can be dropped in:

```python
class VoPBackend(Protocol):
    def resolve_account(self, session, iban) -> Optional[Account]: ...
```

For production, implement a backend that calls:
- **EPC VoP gateway** (SurePay, Tink, TrueLayer) for EEA IBANs
- **UK Confirmation of Payee** (Pay.UK) for GBP accounts
- The receiving bank's core banking system / CIF for proprietary rails

## SWIFT gpi Payment Tracking (UETR)

Tracks a payment's journey through the correspondent chain using its UETR
(Unique End-to-End Transaction Reference) — a 36-character UUID per the
SWIFT gpi spec (MT103 field 121 / pacs.008).

> ⚠️ **SIMULATION**: Real SWIFT gpi tracking requires SWIFT membership and a
> connection to the gpi tracker gateway. This implementation **simulates**
> realistic status events. The data model and API contract match the real
> spec, so swapping in a real SWIFT connection later means replacing one
> function (`generate_timeline`) with a gateway call.

### Create a tracked payment

```bash
curl -X POST http://127.0.0.1:8000/api/track/create \
  -H "Content-Type: application/json" \
  -d '{
    "originator_bic": "BOFAUS3NXXX",
    "originator_name": "Bank of America",
    "beneficiary_bic": "GTBINGLAXXX",
    "beneficiary_name": "Guaranty Trust Bank",
    "currency": "USD",
    "amount": 5000.00,
    "intermediary_bics": ["CITIUS33XXX"],
    "intermediary_names": ["Citibank N.A."],
    "charge_code": "SHA"
  }'
```

Returns a UETR + the full status timeline:

```
[0] INITIATED    Bank of America          — Payment initiated
[1] ACCEPTED     Citibank N.A.            — Accepted for processing
[2] IN_PROGRESS  Citibank N.A.            — Processing
[3] FORWARDED    Citibank N.A.            — Forwarded to GTBank (fee: $2.50)
[4] ACCEPTED     Guaranty Trust Bank      — Received
[5] CREDITED     Guaranty Trust Bank      — Credited to beneficiary

Sent: $5000.00  Final: $4997.50  Total fees: $2.50
```

### Retrieve a payment by UETR

```bash
curl http://127.0.0.1:8000/api/track/{uetr}
```

### Simulated outcomes

| `outcome` param | What happens |
|---|---|
| `credited` (default) | Payment flows through all hops and is credited to the beneficiary |
| `rejected` | First intermediary rejects (compliance screening) — timeline stops |

### Fee deduction by charge code

| Code | Behavior |
|---|---|
| `SHA` (default) | Intermediary fees deducted from amount as it passes through |
| `BEN` | Same as SHA — beneficiary bears intermediary fees |
| `OUR` | No deduction — sender pays all fees, beneficiary receives full amount |

### Status codes (per SWIFT gpi conventions)

| Status | Meaning |
|---|---|
| `INITIATED` | Originator bank created the payment (UETR assigned) |
| `ACCEPTED` | Bank acknowledged receipt |
| `IN_PROGRESS` | Bank is processing |
| `FORWARDED` | Bank debited Nostro, forwarded to next hop |
| `CREDITED` | Beneficiary bank credited the final account (terminal) |
| `REJECTED` | A bank rejected — compliance, bad details (terminal) |
| `RETURNED` | Payment returned to originator (terminal) |

## Run tests

```bash
pip install -e ".[dev]"
pytest -v
```

## Project layout

```
swift-routing/
├── app/
│   ├── main.py              # FastAPI app + lifespan (creates tables, seeds)
│   ├── config.py            # DATABASE_URL (SQLite default, Postgres via env)
│   ├── db.py                # engine + session
│   ├── models.py            # Bank, CorridorRule
│   ├── schemas.py           # Pydantic request/response models
│   ├── routers/
│   │   └── lookup.py        # all API endpoints
│   └── services/
│       ├── validator.py     # IBAN/BIC validation via schwifty
│       ├── routing.py       # intermediary suggestion + US bank resolver
│       ├── fed_importer.py  # Fedwire/FedACH download + parser + loader
│       ├── ssi_importer.py  # SSI CSV/JSON parser + validator + upsert loader
│       ├── name_matcher.py  # fuzzy name matching (normalize + similarity)
│       ├── vop.py           # Verification of Payee service + adapter interface
│       ├── recommendation.py # pure decision matrix (PROCEED/STOP/REJECT/...)
│       ├── prepare.py       # orchestration: validate+VoP+route+SSI → recommendation
│       ├── tracking.py      # UETR generation + simulated gpi timeline
│       └── seed.py          # curated banks + corridors + SSI + accounts
│   └── cli.py               # import-fedwire | import-fedach | import-ssi | stats
└── samples/
    ├── ssi_sample.csv       # example SSI import file (CSV)
    └── ssi_sample.json      # example SSI import file (JSON)
└── tests/
    └── test_api.py
```

## Extending it

| You want... | Do this |
|---|---|
| Better BIC data | Replace `services/seed.py:BANKS` with a SWIFTRef / Accuity import |
| Accurate routing | Replace `CORRIDOR_RULES` with licensed correspondent-relationship data |
| **Real SSI data** | Replace `SSI_RECORDS` placeholders with bank-published account numbers |
| **US ABA→bank** | ✅ Already supported — run `python -m app.cli import-fedwire` |
| **Name verification** | ✅ Already supported — `POST /api/verify-payee` |
| **One-call prep** | ✅ Already supported — `POST /api/prepare-payment` |
| **Production VoP** | Implement `VoPBackend` to call SurePay / Tink / TrueLayer / CoP |
| Fee/FX transparency | Add fields to `CorridorRule` and surface in `/route` |
| Real tracking | Connect to SWIFT gpi gateway (requires SWIFT membership) |

## Disclaimer

Curated corridor data is illustrative, not authoritative. Do not use this MVP's
routing output for actual payment decisions without verifying against a licensed
reference feed.
