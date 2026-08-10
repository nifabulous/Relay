# Bank detail: settlement instructions and intermediaries

_Design spec — 2026-08-10._

## Purpose

A learner who looks up a bank in Relay currently sees four facts: name, BIC,
country, city. The app already holds far more — published settlement
instructions with real correspondent chains, plus a heuristic corridor
table — but none of it is reachable from the directory.

This spec adds a dedicated bank detail route that surfaces settlement and
intermediary data, and teaches the distinction between the two sources.

## Scope

**In scope:** a deep-linkable bank detail route showing identity, published
SSI grouped by currency, and a heuristic correspondent chain when no SSI
exists.

**Out of scope:** bank street address. There is no address field on `Bank`
(`app/models.py:7`), and no source for the 209 seeded international banks.
`FedACHBank.address` (`app/models.py:90`) exists but that table is empty, is
keyed by ABA routing number rather than BIC, requires `FEDACH_URL`, and is
US-only. Address is deferred until there is a real source. The view shows
city and country and does not pretend to more.

**Also out of scope:** any change to backend endpoints, schemas, or seed data.

## Data reality this design is built on

Measured against the current checkout:

| Fact | Value |
| --- | --- |
| Banks in directory | 209 |
| SSI rows | 303 |
| Banks with any SSI | 28 (13.4%) |
| Corridor rules | 72 |
| Currencies per covered bank | min 1, median 9, max 36 |

Coverage is lopsided by design — the covered banks are the major
correspondents. `SBININBBXXX` (State Bank of India) carries 36 SSI rows across
**36 distinct intermediaries**, four of which are USD alone: Bank of America
New York, Deutsche Bank Trust NY, JP Morgan Chase NY, and Citibank NY.

Two consequences drive the design:

1. **87% of banks have no SSI**, so an SSI-only panel would be blank for most
   lookups. A heuristic fallback is required for the view to be useful.
2. **A bank holds Nostro accounts with several correspondents per currency.**
   Flattening the list would hide that, and it is exactly the mechanic the
   curriculum teaches. Grouping is by currency, with intermediaries nested.

## Route and file layout

New route `explore/banks/:bic`, nested under the existing `explore/banks`
index (`frontend/src/app-shell/App.tsx:52`). Sibling routes are
`explore/schemes` and `explore/glossary`, so this shape is consistent.

New file `frontend/src/features/explore/BankDetailRoute.tsx`, lazy-loaded in
`App.tsx` following the pattern used by every other route target.

`BankDetailCard` today is a module-local function at
`frontend/src/features/explore/ExplorePage.tsx:113`, rendered inside
`BankDirectoryPage` (`ExplorePage.tsx:50`). It moves into the new file.
`BankDirectoryPage`'s search result becomes a link to
`/app/explore/banks/{bic}` rather than rendering the card inline — that link
is what makes a bank shareable.

Unknown or malformed BIC renders a not-found state with a breadcrumb back to
the directory, mirroring `CaseDeskRoute`
(`frontend/src/features/learn/cases/CaseDeskRoute.tsx:23`), so a stale
bookmark degrades gracefully instead of erroring.

## Data flow

Three endpoints, all of which already exist:

| Call | Endpoint | Note |
| --- | --- | --- |
| Identity | `GET /api/lookup?bic=` | `app/routers/directory.py:59` |
| Settlement | `GET /api/ssi?bic=` | currency **omitted** — `app/routers/ssi.py:20` types it `Optional`, and omitting it returns every currency in one call |
| Heuristic | `GET /api/route?bic=&currency=` | `app/routers/routing.py:22`; currency is **required** |

The heuristic currency defaults to the bank's `country_currency`. A Nigerian
bank defaults to NGN, a UK bank to GBP — matching the intent of "how do I pay
this bank". That column is populated for all 209 seeded banks, so the `USD`
fallback for a null value is a defensive path, not a routine one.

### BIC resolution is institution-level, and must be disclosed

All three endpoints resolve a BIC by trying the exact value, then the 8-char
prefix + `XXX`, then the 6-char prefix + `XXXXX`
(`app/routers/ssi.py:39`, `app/services/routing.py:58`). A branch BIC
therefore resolves to its head office:

```
GET /api/ssi?bic=SBININBB123
  → response.beneficiary_bic = "SBININBB123"   (echoes the query)
  → instructions[0].beneficiary_bic = "SBININBBXXX"   (head office)
  → 36 records
```

`GET /api/lookup?bic=SBININBB123` likewise returns `found: true` with bank
`SBININBBXXX`, and `/api/route` resolves the same way.

So the `:bic` route param can differ from the resolved bank's BIC, and the
settlement records can belong to a different BIC than the one searched.
**When the resolved BIC differs from the requested one, the page says so
once, near the bank identity** — e.g. "Showing institution-level records for
SBININBBXXX". Presenting a head office's Nostro accounts as though they were a
specific branch's would overstate their precision, which is the same failure
as blending heuristic data with published data.

Disclose rather than redirect: rewriting the URL to the canonical BIC would
silently discard what the learner actually typed.

**Fire the SSI and route queries in parallel, not conditionally.** The
intuitive design awaits SSI and fetches the route only when it comes back
empty, but 87% of banks take that empty path, so a waterfall penalises the
majority case with two sequential round trips. Firing both costs one wasted
request for the 13% that have SSI and gives every bank a single round trip.
Render SSI when `instructions` is non-empty; otherwise render the heuristic
block.

Each query owns its own loading and error state. A failed `/api/route` must
not blank the SSI panel, and vice versa.

### Query keys

`apiKeys.ssi` and `apiKeys.route` (`frontend/src/api/queryKeys.ts:38-50`) are
both `(bic: string, currency: string)`. The all-currencies SSI call passes the
empty string as the currency component — `apiKeys.ssi(bic, "")` — so it cannot
collide with a currency-scoped entry cached by another surface.

### Schemas

No API-client work. `LookupResponseSchema` (`schemas.ts:92`),
`RouteResponseSchema` (`schemas.ts:118`), `SSIRecordSchema` (`schemas.ts:137`)
and `SSIResponseSchema` (`schemas.ts:154`) already exist and cover every field
this view needs.

## Presentation

### Published settlement instructions

Grouped by each record's own `currency`; each group lists its intermediaries
with `intermediary_bic`, `intermediary_bank_name`, `intermediary_account` (the
Nostro account), `charge_code`, and `value_date`. A currency with four
intermediaries reads as one heading with four rows, which is the point.

Group by `SSIRecord.currency`, never by the response's top-level `currency`
field. When the request omits a currency the endpoint sets that field to the
literal sentinel string `"ALL"` (`app/routers/ssi.py`, `currency=ccy or "ALL"`),
which is not a currency and must never be rendered as one.

`SSIResponse.disclaimer` (`app/schemas.py:97`) is rendered, not dropped.
CLAUDE.md requires the simulation disclaimer on every payment-shaped response,
and settlement accounts are the most payment-shaped data in the app.

### Heuristic correspondent chain

Reuses the existing `PaymentRoute` component
(`frontend/src/design-system/payment-route/PaymentRoute.tsx:148`) via
`buildRouteNodes(intermediaries, beneficiaryBic)`
(`frontend/src/features/learn/labs/routeNodes.ts:12`). Its `IntermediaryLike`
shape (`bic`, optional `bank`) already matches `SuggestedIntermediary`
(`schemas.ts:106`), so the chain renders with no adapter.

**Both are currently dead code.** `PaymentRoute` is referenced only by its own
test file, and `buildRouteNodes` has no importers at all — its docstring claims
it is "Shared between Lab 4 (route demo) and the Capstone (route step)", but
Lab 4 renders its own `<table>` (`Lab4Content.tsx:138`) and nothing imports the
helper. The docstring is stale; verify with
`grep -rn "buildRouteNodes\|<PaymentRoute" frontend/src`.

This is good news rather than bad: a tested, unused component is exactly the
right thing to adopt, and bank detail becomes its first production consumer.

**Targeted refactor:** move `routeNodes.ts` to
`frontend/src/design-system/payment-route/routeNodes.ts`, beside the component
it feeds, since it is a design-system concern and importing it from
`features/explore/` would otherwise create a cross-feature dependency on a
`learn/labs` module. There are **no importers to update** — the move is a
rename plus the new consumer. It also currently has no test file; the move adds
one. This is the only refactor in scope.

Confidence renders as a plain labelled value, **not** a `StatusChip`.
`StatusChipStatus` is `CheckStatus | DecisionQuality | SourceStatus`
(`frontend/src/design-system/types.ts:44`) and has no `high`/`medium`/`low`
member; the existing precedent is plain text (`Lab4Content.tsx:149`). Forcing
confidence through the chip would mean mapping it onto pass/fail semantics it
does not have.

### Labelling the two sources

The blocks are headed **"Published settlement instructions"** and **"Heuristic
correspondent route"**, and are never blended into one list. Relay already
teaches that real correspondent relationships are private and that routing
suggestions are advisory (`app/routers/routing.py:30`). Presenting a guess
with the same weight as a curated instruction would quietly undo that lesson.

## Empty and error states

`/api/route` does **not** 404 when no corridor rule matches. It returns 200
with an empty `suggested_intermediaries` and an explanatory `notes` string,
verified live:

```
GET /api/route?bic=SBININBBXXX&currency=XPF
  → 200, suggested_intermediaries: []
  → notes: "No curated corridor rule for currency=XPF country=IN.
            Contact originator bank for exact chain."
```

Render that `notes` value rather than authoring parallel copy — the backend
already names the currency and country, and duplicating the sentence in the
frontend would let the two drift.

| Condition | Behaviour |
| --- | --- |
| SSI present | Render grouped settlement instructions |
| No SSI, corridor rule found | Render heuristic chain with its confidence and currency |
| Neither | Render the backend's `notes` explanation, plus a line that real correspondent relationships are bank-specific and private — not a bare blank |
| Resolved BIC ≠ requested BIC | Institution-level disclosure near the identity block |
| Unknown BIC | Not-found state with breadcrumb back to the directory |
| Query error | Per-block error; the other block still renders |

## Accessibility

Currency groups use real headings so the structure is navigable by heading
order rather than by sight. `PaymentRoute` already carries
`role="img"` with a generated `aria-label` (`PaymentRoute.tsx:153`).
Status meaning is never carried by colour alone, per `DESIGN.md`.

## Testing

- Unit tests via MSW for: bank found, unknown BIC, SSI present and grouped,
  SSI empty with heuristic fallback, both empty, and independent per-query
  error states.
- A test that a branch BIC whose records resolve to a head office renders the
  institution-level disclosure, and that an exact match does **not** render it.
  Fixture: request `SBININBB123`, records carrying `SBININBBXXX`.
- A test that the `"ALL"` sentinel never reaches the rendered output as a
  currency heading.
- A route test asserting the deep link `/app/explore/banks/:bic` resolves and
  that `BankDirectoryPage` links into it.
- E2E coverage in the Explore spec including an axe pass, since this adds a
  page.
- `buildRouteNodes` has no test file today; the move adds one covering the origin/intermediary/beneficiary node sequence and the empty-intermediaries case.
- New lazy chunk, so the eager shell bundle budget is unaffected. Verify with
  `npm run check:bundle`.

## Invariants preserved

The governing invariant: **the view never presents data with more authority or
more precision than it actually has, and adds no data of its own.** Every rule
below is an instance of it.

- No backend, schema, or seed changes.
- The SSI disclaimer ships with any rendered settlement data.
- `ACCT-` placeholder accounts are displayed as-is and never presented as
  real. This view reads seed data; it does not add any.
- Heuristic and published data stay visually and semantically distinct
  (authority).
- Institution-level records resolved from a branch BIC are disclosed as such
  (precision).
- Empty states use the backend's own explanation rather than frontend copy
  that can drift from it.
