# Correspondent Atlas — design spec

**Date:** 2026-09-13
**Status:** approved design, not yet planned
**Surface:** Relay Explore — new page at `/app/explore/atlas`
**Supersedes:** nothing. Extends the Explore workspace.

---

## What this is

A country-first world map of **correspondent network position**, built from the SSI
corpus. It answers "who settles through whom, and how well do we know it" — a
reference instrument in Explore, alongside Bank Directory, Schemes and Glossary.

It is not a learning module. No gates, no checkpoints, no progress, no badges.

It is not a volume map. See the next section.

---

## Governing invariant

> **The atlas may state only what the collected rows entail, and may never state an
> aggregate without its denominator.**

Two clauses because there are two distinct failure modes.

**Entailment** blocks fabricated channels. If a visual channel cannot be traced to a
column, it does not render. No amount moved, no market share, no verification the
rows do not carry.

**Mandatory denominator** blocks the subtler failure: a true count read as a world
share. "US correspondents reach 223 banks" is true. Rendered as circle area with no
denominator, it reads as market position. The denominator is 251 — the banks we have
collected — and it travels with the number in the payload, not as UI copy that can be
dropped.

An earlier draft of this invariant read "the atlas never asserts more than the row
beneath it asserts." That is wrong: every aggregate says something no single row says,
so the strict reading outlaws the feature. Recorded here because the imprecise version
is the tempting one.

---

## What the data can and cannot say

Measured against `swift_routing.db` on 2026-09-13. Reproduction queries in the
appendix. The endpoint computes live, so live figures will differ as waves land.

### Cannot: volume

There is no amount column, no transaction count, no date of flow. A map implying
volume fabricates. Volume requires licensed flow data (SWIFT Watch, Accuity) that this
project does not hold and cannot derive.

### Cannot: verification

| status | rows |
|---|---|
| unverified | 3,228 |
| archived | 712 |
| illustrative | 12 |
| **published** | **0** |

Nothing in the corpus has earned `published`. The atlas states that as a datum, never
as hardcoded copy — see AC-B5.

### Can: network position

The corpus describes a star, and the concentration is measurable.

| measure | value |
|---|---|
| distinct correspondents | 713 |
| serve exactly 1 beneficiary bank | 374 (52%) |
| serve ≥ 10 | 73 |
| serve ≥ 40 | 14 |
| correspondents per beneficiary bank | avg 13.2, range 1–57 |

Fourteen institutions carry the structure. 374 appear once. That is the lesson of
correspondent banking and every claim in it is defensible from rows in the repo.

### Can: institution role

| correspondent | banks served | currencies | role |
|---|---|---|---|
| Citibank N.A. | 108 | 3 | USD gateway |
| Commerzbank Frankfurt | 92 | 18 | multi-currency hub |
| JPMorgan Chase NY | 84 | 1 | single-currency |
| BNY Mellon NY | 72 | 14 | multi-currency |
| Deutsche Bank Frankfurt | 62 | 15 | multi-currency |

Reach and breadth are different axes. Volume data would flatten this; reach data shows
it.

### Can: the shape of what is missing

`bic_only` is a schema fact, not an editorial choice. A `bic_only` row asserts
correspondent **availability** and publishes no accounts, charge code or value date;
routing already rejects such rows as settlement instructions.

| view | countries | banks | rows |
|---|---|---|---|
| all rows | 103 | 251 | 3,952 |
| settleable (`bic_only = 0`) | 82 | 196 | 2,973 |
| availability only (`bic_only = 1`) | 52 | 65 | 979 |

Filtering to settleable removes **21 countries** from the map:

```
BW CA CL CO EE ES ET GR LT MN MT MW MZ NA PE PY RS SG SI UY ZM
```

Canada, Spain and Singapore go dark not because they lack correspondent banking but
because nothing collected for them asserts a settlement instruction. This is the most
informative single interaction in the feature.

Note the 103 versus 102: the country count is derived from BIC positions 5–6 and
includes one code that does not resolve in ISO 3166-1, so 103 countries are counted and
102 can be drawn. See Open questions.

---

## Decisions

| # | Decision | Rejected alternative and why |
|---|---|---|
| D1 | Measure is **network position** from SSI alone | Volume headline — undeliverable without licensed data. Combined SSI + external scale — deferred to D2. |
| D2 | External scale layer **deferred**, seam designed in | Shipping both now doubles the provenance burden before the first version proves useful. |
| D3 | Job is an **Explore atlas** — reference, ungated | Learning layer, front door, internal coverage tool. Each remains possible later; none is v1. |
| D4 | Spine is **country-first**, drilling into `BankDetailRoute` | Bank-first would never show the network. Corridor-first overlaps Operate. |
| D5 | Evidence is a **spoke-side channel only** | Evidence on hub nodes is a category error — see below. |
| D6 | Coverage is a **separate always-on frame** | Folding coverage into evidence conflates "we did not look" with "we looked and the source was weak". |
| D7 | **Live endpoint**, computed per request | Startup cache goes stale on `/api/import/ssi`. A static artifact introduces DB-vs-artifact drift. |
| D8 | **Map plus synced table**, both views | Map-only fails accessibility and hides institution-level facts. Table-only loses the geography that makes the spoke view legible. |

### D5 in detail — why evidence cannot sit on a hub node

A row's provenance describes the **disclosing** bank's document. Real row from the
corpus:

```
HDFC Bank Ltd  ->  JPMorgan Chase NY
Source: https://web.archive.org/web/20260116222141/https://www.hdfc.bank.in/...
        (as of 2026-01-16). Sourced from bank-published SSI page.
```

The source is `hdfc.bank.in`. The evidence describes HDFC's disclosure quality. Roll it
onto the US node and JPMorgan's mark wears the archive-freshness of HDFC's website.
Citibank's node would carry the disclosure practices of 108 banks across Kenya, India
and Pakistan.

Consequence: a country is both spoke and hub, and only the spoke role can carry
evidence. That kills the single blended map and forces two views.

---

## Backend

New `app/routers/atlas.py`, logic in `app/services/atlas.py`. Read-only, no auth gate
(consistent with `/api/ssi`). No caching layer — none exists in `app/` today and none
is warranted at this size.

### `GET /api/atlas/network`

```jsonc
{
  "totals": {
    "ssi_rows": 3952,
    "beneficiary_banks": 251,          // the denominator; required, never omitted
    "correspondents": 713,
    "currencies": 86,
    "by_status_and_tier": [            // cross-tab, not flattened
      { "status": "unverified",   "bic_only": false, "count": 2458 },
      { "status": "unverified",   "bic_only": true,  "count": 770  },
      { "status": "archived",     "bic_only": false, "count": 503  },
      { "status": "archived",     "bic_only": true,  "count": 209  },
      { "status": "illustrative", "bic_only": false, "count": 12   },
      { "status": "published",    "bic_only": false, "count": 0    }
    ]
  },
  "spokes": [
    { "iso2": "IN", "beneficiary_banks": 24, "rows": 366,
      "evidence": [
        { "status": "unverified", "bic_only": false, "count": 313 },
        { "status": "archived",   "bic_only": false, "count": 52  },
        { "status": "unverified", "bic_only": true,  "count": 1   }
      ] }
  ],
  "hubs": [
    { "bic": "CITIUS33XXX", "name": "Citibank N.A.", "iso2": "US",
      "banks_served": 108, "currencies": 3 }
  ],
  "observed_bic_country_codes": ["AE", "AL", "..."],
  "disclaimer": "<_ATLAS_DISCLAIMER>"
}
```

Contract rules, each with a test:

1. **`hubs` objects have no `evidence` key.** Not nullable, not optional — absent. See
   D5.
2. **`totals.beneficiary_banks` is required.** Any consumer rendering reach must have
   the denominator available.
3. **`banks_served` and reach figures are distinct counts, never sums.** A country's
   correspondents overlap in whom they serve; summing double-counts and manufactures a
   volume-shaped number.
4. **No geography in the response.** `iso2` only — no coordinates, no ISO numeric, no
   topology keys. Map keying is a rendering concern. This also avoids depending on
   `pycountry`, which is present in the venv but **undeclared**, arriving transitively
   via `schwifty`.
5. **`observed_bic_country_codes` is raw.** The backend reports what it saw; the
   frontend, which owns the ISO table, decides what is unresolvable.
6. **Every status key is emitted at zero.** A missing key reads as not-applicable; a
   zero reads as checked.

### `GET /api/atlas/country/{iso2}`

Drill-down: which correspondents reach banks in this country, from where, in which
currencies, at what evidence tier. Links out to `BankDetailRoute`.

`iso2` is constrained to exactly two alpha characters at the boundary, mirroring the
Tier-0 `max_length` hardening. SQLAlchemy parameterises, so this is input hygiene
rather than injection defence.

### `_ATLAS_DISCLAIMER`

New constant in `app/routers/_shared.py`, added to `__all__`. It must **not** reuse
`_SSI_DISCLAIMER`, which reads:

> "Account numbers in seed data are ILLUSTRATIVE placeholders. Replace with values
> from the beneficiary bank's published SSI list or a licensed feed…"

The atlas renders no account numbers. That disclaimer misdirects — it implies the
weakness is placeholder accounts when the real weaknesses are unverified provenance and
partial coverage. The atlas disclaimer states those two.

### Performance

Measured on `swift_routing.db`, 3,952 rows:

| query | time |
|---|---|
| hub rollup | 23.8 ms |
| spoke rollup | 2.3 ms |
| hub list (713 rows) | 6.4 ms |
| **total** | **32.5 ms** |

`substr(intermediary_bic, 5, 2)` cannot use an index, which is why the hub rollup is
73% of the cost. Fine now. The fix, when it is needed, is a persisted country column
written on insert — not a cache.

- **AC-B10** — a test asserts the SSI row count is below 20,000, failing with a message
  pointing at this section.

  A prose note saying "revisit at ~20k rows" is something nobody re-reads. Given you
  land waves continuously, the threshold will arrive during ordinary work, and the
  signal should be a failing test that explains itself rather than a slow endpoint
  someone eventually notices. The test asserts corpus size, not query duration —
  timing assertions are flaky on shared CI runners and would be the wrong instrument.

---

## Frontend

### Structure

```
frontend/src/features/explore/atlas/
  AtlasPage.tsx        route: view + filter state, URL-synced
  AtlasMap.tsx         SVG choropleth + hub circles (d3-geo projection)
  AtlasTable.tsx       ranked table, selection synced with the map
  AtlasPanel.tsx       country / institution detail -> BankDetailRoute
  atlasEncoding.ts     pure: hatch bands, scales, denominators
  isoNumeric.ts        ISO2 -> topology feature id
  atlasTypes.ts
```

Lazy route, same pattern as the other Explore pages. The bundle gate sums only the
**eager** shell against 215,040 bytes, so a lazy atlas chunk does not touch it. Measure
and record the chunk anyway.

### Dependencies

Add `d3-geo`, `d3-scale`, `topojson-client`. Do **not** add `world-atlas`: the package
is 8.2 MB unpacked (110m, 50m and 10m resolutions, countries and land) for one file.

Vendor `countries-110m.json` as a static asset served from the app's own origin —
39 KB gzip, cacheable, fetched by the atlas route on demand. No third-party CDN in the
page load and no CSP question.

Measured unpacked sizes: `d3-geo` 227 KB, `d3-scale` 174 KB, `topojson-client` 68 KB.
These tree-shake (the atlas needs `geoNaturalEarth1`, `geoPath`, `geoCentroid`,
`scaleSqrt`, `scaleLinear`, `feature`); unpacked size is not bundled size and the real
chunk figure must be measured at implementation, not estimated here.

### Two views

**Spoke view — "who gets reached"**

| channel | encodes |
|---|---|
| country fill, sequential single hue | beneficiary banks collected there |
| hatch density, 3 bands | archived share of that country's rows |

Bands: none below 25%, light 25–74%, heavy 75% and above. The data supports the
channel — archived share runs the full 0–100% range (Uganda, Taiwan, Peru, Kuwait,
China, Chile and Australia are 100%; India 14%; Sri Lanka 8%).

Known limitation: hatch is illegible on small-area countries. Hong Kong (76% archived),
Singapore, Malta and Bahrain carry interesting evidence stories the map cannot show.
The synced table carries them instead. This is a real weakness of the geographic form,
accepted rather than solved.

**Hub view — "who does the reaching"**

| channel | encodes |
|---|---|
| circle area | banks reached, as a share of the collected denominator |
| circle fill depth | currency breadth |

**No evidence channel, at all.** The panel states why in one line and lists the
disclosing banks' evidence spread, which is the true statement.

Known limitation: circles sit at country centroids, so the US mark dominates
mid-continent, Europe overlaps, and small financial centres get circles larger than
their landmass. More seriously, **country aggregation hides the institution-level
finding** — the US shows 15 currencies because 36 institutions collectively span 15,
which is not the Citi-versus-Commerzbank story. That story lives in the table. The hub
map is the weaker half of this feature and is shipped as a secondary read, not as the
payoff.

**Settleability filter** is orthogonal to the view. It filters rows; both views
recompute. Countries do not dim, they leave.

### The synced table is the accessibility answer

A choropleth is not readable by a screen reader and hatch density is not readable
without vision. The ranked table is the map's **text equivalent** — same data, same
filter, same selection, keyboard-navigable. WCAG 2.2 AA is already a project
invariant, so the table is a requirement, not a second feature. This is the primary
justification for D8.

### Enforce the invariant at the parse boundary

`SSIRecordSchema` already sets the precedent: `superRefine` rejects a `bic_only` row
carrying settlement fields. Apply the same technique:

```ts
AtlasHubSchema = z.object({
  bic, name, iso2, banks_served, currencies
}).strict()
```

`.strict()` makes a hub object arriving with an `evidence` key a **parse failure**, not
a silently-unrendered field. D5 becomes impossible to reintroduce.

Clause 2 gets the same treatment, but at the **type** level rather than one component's
props. `beneficiaryBanksTotal` is a required field on the shared parsed-payload type
that `AtlasMap`, `AtlasTable` and `AtlasPanel` all thread through, so no consumer can
construct a reach figure without its denominator.

Putting it on `AtlasMap` alone would protect the map and leave the table bare — and the
table is what a screen-reader user gets instead of the map. See AC-F3 and AC-F9.

### Coverage frame (D6)

Always on, not dismissible, not filterable. States the collected countries against the
map's own feature count, and gives never-collected countries a visibly distinct
treatment from collected-but-thin ones. A blank country must never read as "no
correspondent banking here".

### Layer seam (D2)

Two things only: the render loop iterates an ordered list of layer descriptors rather
than hardcoding one source, and the legend renders per-layer with that layer's own
attribution. v1 ships one descriptor. Adding an external scale layer later is adding an
entry, not a refactor. Anything more is speculative.

---

## Integration points

A new Explore page must be registered in four places. Verified 2026-09-13:

| # | File | What |
|---|---|---|
| 1 | `frontend/src/app-shell/App.tsx` | lazy import + `<Route path="explore/atlas">`, alongside `explore/banks`, `explore/schemes`, `explore/glossary` |
| 2 | `frontend/src/features/explore/ExplorePage.tsx` | category card on the Explore index |
| 3 | `frontend/src/features/explore/search/CommandSearch.tsx` | destination entry |
| 4 | `frontend/src/observability.ts` | route allowlist |

---

## Acceptance criteria

Each AC names the invariant clause or decision it enforces. Clause 1 is *entailment*,
clause 2 is *mandatory denominator*; see Governing invariant.

### Backend

- **AC-B1** — `/api/atlas/network` totals match direct SQL counts.
- **AC-B2** *(clause 1)* — reach and `banks_served` are distinct counts. Fixture with deliberately
  overlapping correspondents asserts the result is not the sum.
- **AC-B3** — `by_status_and_tier` entries sum to `totals.ssi_rows`.
- **AC-B4** *(D5)* — every `hubs` object fails a schema check if it carries an
  `evidence` key.
- **AC-B5** — every status appears in `by_status_and_tier` even at count zero, so
  `published: 0` is always a datum. No frontend copy hardcodes the number.
- **AC-B6** — `/api/atlas/country/{iso2}` rejects any value that is not exactly two
  alpha characters.
- **AC-B7** — the response carries `_ATLAS_DISCLAIMER`; a test asserts it is not
  `_SSI_DISCLAIMER`.
- **AC-B8** *(clause 1)* — the response contains no coordinates, no ISO numeric codes
  and no topology keys.
- **AC-B9** *(clause 1)* — no field in the response schema admits a monetary or value
  unit. A test enumerates the response keys against an allowlist, so adding an
  amount-shaped field to the payload is a deliberate act that fails a test, not an
  oversight.
- **AC-B10** — corpus-size threshold assertion against the **seeded** corpus, so an
  oversized import inside another test cannot trip it. Defined in full under
  Performance, listed here so this section is the complete checklist.

### Frontend

- **AC-F1** *(clause 1)* — every code in `observed_bic_country_codes` either resolves to
  a feature that **exists in `countries-110m.json`**, or appears in an explicit
  `KNOWN_UNRESOLVABLE` allowlist carrying a one-line reason per entry. The allowlist
  starts with `EB` and its open question. Any code that is neither fails the test.

  This is the load-bearing test. `world-atlas` feature ids are zero-padded strings
  (`"008"`, `"036"`, `"050"`); an integer-keyed lookup silently renders every country
  with an ISO numeric below 100 as blank — Bangladesh, Australia, Azerbaijan, Bahrain,
  Armenia and others. A map that looks complete and is not is the failure mode this
  feature cannot afford.

  The allowlist form matters: asserting bare resolution would make the suite red on
  current data, and the only ways to green it are weakening the test or deleting a row.
  An allowlist keeps the anomaly visible, reviewable and countable instead.

- **AC-F2** *(D5)* — a hub object carrying `evidence` fails Zod parse.
- **AC-F3** *(clause 2)* — `AtlasMap` cannot be constructed without
  `beneficiaryBanksTotal`.
- **AC-F4** — hatch bands assert at their boundaries: 24, 25, 74, 75.
- **AC-F5** — the settleability filter drops a country whose rows are wholly
  `bic_only` and keeps one holding both tiers. Asserted against a **fixture**, not
  against the live corpus.

  The 21-country list in "What the data can and cannot say" is a dated observation, not
  a test oracle. Asserting it directly would turn the first settleable row for Botswana
  into a red suite — a false alarm, and false alarms train people to update fixtures
  without reading them.

- **AC-F6** — table and map stay synced: selecting in either highlights the other, and
  the table reflects the active view and filter.
- **AC-F7** *(D6)* — the coverage frame is present in every view and filter state and
  cannot be dismissed.
- **AC-F8** — axe passes on the atlas route.
- **AC-F9** *(clause 2)* — `AtlasTable` and `AtlasPanel` cannot render a reach figure
  without its denominator, enforced by the same required field as AC-F3.

  This is not a repeat of AC-F3. The table is what a screen-reader user gets *instead
  of* the map (see "The synced table is the accessibility answer"), so enforcing the
  denominator on the map alone protects it exactly where it is least needed and drops
  it where it matters most. A bare `223` in a ranked column is the easiest place in the
  whole feature to read reach as market share.

- **AC-F10** *(clause 2)* — **every data-driven scale** states its actual range in the
  legend, read from the data and never hardcoded. That is all three: the choropleth
  fill (beneficiary banks), the hub circle area (reach), and the hub circle fill depth
  (currency breadth).

  A scale's meaning lives entirely in its domain, and every one of these domains shifts
  as waves land. "Dark" otherwise means "large relative to whatever today's maximum
  happens to be" — an aggregate with no stated denominator. Stated as a rule over all
  scales rather than per-channel, because the per-channel form is what let the hub
  fill-depth scale slip through the first pass.

  Hatch bands are exempt: a percentage of a country's own rows is self-denominating.
- **AC-F11** *(clause 1)* — no rendered numeric in any atlas component carries a
  currency symbol or value unit. Component-level assertion complementing AC-B9's
  payload-level one.
- **AC-F12** *(D6)* — never-collected countries are visually distinct from
  collected-but-thin ones, and the legend names both. AC-F7 covers the frame's
  presence; this covers its substance — a blank country must never read as "no
  correspondent banking here".
- **AC-F13** *(D2)* — the render loop and the legend iterate a layer descriptor list.
  A test adds a second, inert descriptor and asserts both that it renders and that its
  attribution appears separately from the first layer's. An untested seam closes at the
  first refactor.

  The second descriptor is a **test fixture only**. No second layer, and no external
  data, ships in v1 — see Out of scope.

### Error and partial states

- **AC-F14** — a failed `/api/atlas/network` renders `AsyncRegion`'s error state with
  retry. No map is drawn.
- **AC-F15** — a response that parses but is missing `spokes` or `hubs` renders the
  surviving view with `AsyncRegion`'s `partialNote` naming what is absent. A half-drawn
  map must announce itself, because a map that looks complete and is not is this
  feature's defining failure mode — the same one AC-F1 guards at the data layer.

  `partialNote` already exists on `AsyncRegion` and is currently used by no page; the
  atlas is its first consumer.

### E2E

- **AC-E1** — the atlas route loads and renders a map.
- **AC-E2** — toggling settleability changes the displayed counts.
- **AC-E3** — clicking a country opens the panel; the panel links into
  `BankDetailRoute`.

---

## Out of scope for v1

External scale layer (seam only, no data). Drawn edges or arcs on the map. Animation.
Institution city coordinates. Any volume, value or market-share figure. Learning gates,
progress or badges — this is Explore and it stays ungated.

---

## Open questions

**`EDBBEB22XXX` — European Depositary Bank SA.** Six rows (USD, EUR, GBP, JPY, AUD,
CAD). BIC positions 5–6 hold `EB`, which does not resolve in ISO 3166-1, so the bank
cannot be placed on any map. The project's own validator accepts it:

```
validate_bic("EDBBEB22XXX") -> (True, 'EDBBEB22XXX', 'EB', [])
```

Whether `EB` is a reserved SWIFT code or a defective seed row is a domain question that
cannot be settled from the repository; it needs a source check. Either way AC-F1
surfaces it automatically, which is an argument for rendering the unresolvable-codes
report as a visible v1 element rather than a footnote.

---

## Risks

| Risk | Clause | Mitigation |
|---|---|---|
| A value or volume figure reaches the render | 1 | AC-B9 at the payload, AC-F11 at the component. The primary risk, so it is guarded at both layers. |
| A reader takes reach for market share | 2 | Denominator is a required field on the shared payload type: AC-F3 (map), AC-F9 (table and panel) |
| Choropleth darkness read as an absolute | 2 | AC-F10 — legend states its actual scale range, read from data |
| A reader takes collection shape for world structure | 2 | D6 coverage frame, always on and never dismissible: AC-F7 for presence, AC-F12 for the never-collected vs thin distinction |
| Evidence attribution regresses in a later change | D5 | AC-B4 and AC-F2 make it a parse failure, not a review question |
| Silent blank countries | 1 | AC-F1 asserts against the topology, with unresolvable codes named in a reviewed allowlist rather than silently absent |
| A partial load reads as a complete map | 1 | AC-F15 — a missing section renders `partialNote` naming what is absent |
| The layer seam closes at the first refactor | D2 | AC-F13 renders a second inert descriptor and asserts its separate attribution |
| A **dimensionless** composite score is added later | 1 | **Not fully guarded.** AC-B9 and AC-F11 catch currency symbols and value units. A blended "importance index" over reach and currency breadth would carry neither, pass both, and still assert something no row entails. The control is review discipline, not a test. Recorded because a guard with a known hole is safer than one believed complete. |
| Hub map read as the primary finding | — | Shipped as a secondary read; the institution-level story lives in the table |
| Query cost as the corpus grows | — | Threshold asserted, not just noted — see Performance |

---

## Appendix — reproduction

All figures measured against `swift_routing.db` on 2026-09-13.

```sql
-- concentration
SELECT intermediary_bic, COUNT(DISTINCT beneficiary_bic) b
FROM ssi GROUP BY 1 ORDER BY b DESC;

-- status x tier cross-tab
SELECT status, bic_only, COUNT(*) FROM ssi GROUP BY 1, 2;

-- settleability impact
SELECT COUNT(DISTINCT SUBSTR(beneficiary_bic,5,2)),
       COUNT(DISTINCT beneficiary_bic), COUNT(*)
FROM ssi WHERE bic_only = 0;

-- countries removed by the settleable filter
SELECT DISTINCT SUBSTR(beneficiary_bic,5,2) FROM ssi WHERE bic_only = 1
EXCEPT
SELECT DISTINCT SUBSTR(beneficiary_bic,5,2) FROM ssi WHERE bic_only = 0;

-- spoke-side evidence spread
SELECT SUBSTR(beneficiary_bic,5,2) cc, COUNT(*) rows,
       SUM(CASE WHEN status='archived' THEN 1 ELSE 0 END) arch
FROM ssi GROUP BY 1;
```
