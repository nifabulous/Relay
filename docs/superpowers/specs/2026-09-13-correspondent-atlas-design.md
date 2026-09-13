# Correspondent Atlas — design spec

**Date:** 2026-09-13
**Status:** review changes applied; engineering re-review required before implementation
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
as hardcoded copy — see AC-B3a.

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

Note the 103 versus 102: the beneficiary-country count is derived from
`beneficiary_bic` positions 5–6 and includes one code that does not resolve in ISO
3166-1, so 103 countries are counted and 102 can be drawn. See Resolved data anomaly.

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
| D9 | Unresolvable BIC country codes are a **visible coverage datum** | A footnote hides a corpus defect. Silently dropping the row makes the map look more complete than the source data. |
| D14 | Hub circle fill is **flat**; currency breadth moves to the table | Translucent overlapping marks sum to a value that encodes nothing, and the European hubs overlap heavily. Channel destruction where the data matters most. |
| D15 | The hub table is **two-tier** (country aggregate + institutions) | The map is country-grain and an institution-only table has no row for the aggregate a sighted user reads. Text-equivalence fails without it. |
| D16 | `black` theme gets a **distinct land surface** | A shipped third theme where canvas is #000000 and surface #18181b. "Ocean is the canvas" dissolves the map in it. |
| D11 | The data ramp is **neutral ink**; blue stays action-only | A blue ramp breaks DESIGN.md:28 and makes a blue selected edge invisible against a blue fill. Amending DESIGN.md to carve out data encoding was considered and rejected: it weakens the rule for every future surface, and this is the first feature to ask. |
| D12 | **Hub is the default view** | Spoke shows collection coverage; hub shows the star that justified the feature. Landing on the weaker read and hoping for a toggle is not a default, it is a hope. |
| D13 | The hub map **survives DESIGN.md:138** | The ranked table states reach better, but cannot state *where* hubs cluster. The map carries a spatial fact the comparison cannot, which is the test rule 138 actually sets. |
| D10 | Visual direction is an **editorial instrument**, rendered with D3/SVG | A cinematic MapCN/MapLibre treatment adds motion, glow and map-product conventions that imply traffic or live flow. A hosted basemap adds visual noise, provider cost and attribution without helping the country-first question. |

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

New `app/routers/atlas.py`, typed response models in `app/schemas.py`, and aggregation
logic in `app/services/atlas.py`. Register the router in `app/main.py`. Read-only, no
auth gate (consistent with `/api/ssi`). No caching layer — none exists in `app/` today
and none is warranted at this size.

### `GET /api/atlas/network?scope=all|settleable`

`scope` defaults to `all`. `settleable` applies `SSI.bic_only.is_(False)` before every
aggregate. The endpoint recomputes the entire response for the selected scope; the
frontend must not derive filtered distinct counts from the unfiltered rollups. That is
mathematically impossible for hub reach because the same beneficiary bank may appear
behind several correspondents.

```jsonc
{
  "scope": "all",
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
      { "status": "illustrative", "bic_only": true,  "count": 0    },
      { "status": "published",    "bic_only": false, "count": 0    },
      { "status": "published",    "bic_only": true,  "count": 0    }
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
  "hub_countries": [
    { "iso2": "US", "banks_served": 223, "currencies": 15,
      "correspondents": 36 }
  ],
  "hubs": [
    { "bic": "CITIUS33XXX", "name": "Citibank N.A.", "iso2": "US",
      "banks_served": 108, "currencies": 3 }
  ],
  "observed_beneficiary_country_codes": ["AE", "AL", "..."],
  "observed_intermediary_country_codes": ["AE", "AL", "..."],
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
4. **The settleability scope is applied before aggregation.** `scope=settleable` cannot
   be produced by subtracting `bic_only` row counts from unfiltered distinct counts.
5. **`hub_countries` and `hubs` are separate grains.** The map renders one
   `hub_countries` circle per country. The table renders institution-level `hubs`.
   `hub_countries.banks_served` and `.currencies` are independently distinct-counted
   from rows, never summed from `hubs`.
6. **No geography in the response.** `iso2` only — no coordinates, no ISO numeric, no
   topology keys. Map keying is a rendering concern. This also avoids depending on
   `pycountry`, which is present in the venv but **undeclared**, arriving transitively
   via `schwifty`.
7. **Observed country-code lists are raw, role-specific, and corpus-wide.** The backend
   reports what it saw in beneficiary and intermediary BICs separately, and **never
   filters these lists by scope**. The frontend, which owns the ISO table, decides what
   is unresolvable in each view.

   Scope-independence is load-bearing, not incidental. Subtracting the scoped `spokes`
   from the corpus-wide observed list is what lets the map tell a **never-collected**
   country apart from one that is collected but has nothing in the selected scope. Under
   `scope=settleable` those are 21 different countries, including Canada and Spain, and
   rendering them identically to France would repeat at the map level the conflation the
   country endpoint's `collected` field exists to prevent. No new payload field is
   needed; scope-filtering these lists would destroy the distinction.
8. **The status cross-tab is complete.** Emit the Cartesian product of
   `SSI_STATUSES` and both `bic_only` values, including zeroes. A missing pair reads as
   not-applicable; a zero reads as checked.

### `GET /api/atlas/country/{iso2}?scope=all|settleable`

Drill-down: which correspondents reach banks in this beneficiary country, from where,
in which currencies, and on the strength of which spoke-side disclosures. Links out to
`BankDetailRoute` by beneficiary BIC.

```jsonc
{
  "scope": "all",
  "iso2": "IN",
  "collected": true,                 // corpus-wide, NEVER scope-filtered
  "in_scope":   { "beneficiary_banks": 24, "beneficiary_banks_total": 251,
                  "rows": 366, "ssi_rows_total": 3952 },
  "all_scopes": { "beneficiary_banks": 24, "beneficiary_banks_total": 251,
                  "rows": 366, "ssi_rows_total": 3952 },
  "correspondents": [
    {
      "bic": "CHASUS33XXX",
      "name": "JPMorgan Chase NY",
      "iso2": "US",
      "beneficiary_banks": 18,
      "currencies": ["USD"],
      "disclosures": [
        {
          "beneficiary_bic": "HDFCINBBXXX",
          "beneficiary_bank_name": "HDFC Bank Ltd",
          "status": "unverified",
          "bic_only": false,
          "row_count": 1
        }
      ]
    }
  ],
  "disclaimer": "<_ATLAS_DISCLAIMER>"
}
```

`disclosures` stays attached to the beneficiary bank that published the source. The
correspondent object has no aggregate `evidence` field. Arrays use deterministic order:
correspondents by `beneficiary_banks DESC, name ASC`, currencies alphabetically, and
disclosures by beneficiary bank name then BIC.

Every count is paired with its own denominator inside its own block, so clause 2 holds
structurally rather than by convention. `in_scope` is filtered by the selected scope;
`all_scopes` is corpus-wide. Under `scope=all` the two blocks are identical, which is
the correct and uninteresting case. The country response is safe to render on its own:
it never depends on a previously cached network response to explain “24 of 251 banks.”

**`collected` is corpus-wide and MUST NOT be scope-filtered.** It answers one question:
does the corpus hold any row for this country. Deriving it from the scoped relation
would make Canada report `collected: false` under `scope=settleable` — Canada has 2
banks and 15 rows collected, all of them `bic_only`, so the scoped count is zero while
the corpus count is not. Reporting that as “not collected” asserts nobody looked, which
is the “we did not look” versus “we looked and the source was weak” conflation D6 exists
to prevent. Returning `404` had the same defect in a different costume; moving to `200`
without splitting the field would carry it across.

The split is what lets the drill-down explain the feature's headline interaction. A
country that leaves the map under `scope=settleable` must be able to say the true and
far more useful thing:

> Canada — 15 rows collected, none of them settlement instructions.

not

> No rows collected for Canada.

A recognized ISO2 the corpus has never seen returns the same shape with
`collected: false`, zeroes in both blocks, the correct denominators in each, and an
empty `correspondents` array — “No rows collected for France”, which is then true.

`iso2` is uppercased and constrained with FastAPI `Path(min_length=2, max_length=2,
pattern="^[A-Za-z]{2}$")`, mirroring the Tier-0 boundary hardening. Every well-formed
code returns `200` whether or not the selected scope contains rows; only malformed path
input returns `422`. Geographic resolution remains the frontend's responsibility under
contract rule 7. SQLAlchemy parameterises, so this is input hygiene rather than
injection defence.

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

Do not make corpus growth fail a correctness test. Row count is only a proxy for
latency, and a threshold test would block a valid SSI import without proving the atlas
is slow. Add `scripts/benchmark_atlas.py` instead. It records the row count, per-query
timings, total timing, database engine, and query plans against a named database. The
implementation PR records the current baseline and a synthetic 20,000-row run. The
review trigger is either a measured total above 150 ms on the reference machine or a
query-plan change; CI still guards the number of SQL statements so an N+1 regression
cannot hide behind runner variance.

---

## Frontend

### Structure

```
frontend/src/features/explore/atlas/
  AtlasPage.tsx        route: view + filter state, URL-synced
  AtlasMap.tsx         SVG choropleth + one aggregate circle per hub country
  AtlasTable.tsx       ranked table, selection synced with the map
  AtlasPanel.tsx       country / institution detail -> BankDetailRoute
  atlasEncoding.ts     pure: hatch bands, scales, denominators
  isoNumeric.ts        ISO2 -> topology feature id
  atlasSchemas.ts      strict Zod schemas + inferred types
```

Lazy route, same pattern as the other Explore pages. The bundle gate sums only the
**eager** shell against 215,040 bytes, so a lazy atlas chunk does not touch it. Measure
and record the chunk anyway.

### Dependencies

Add `d3-geo`, `d3-scale`, `topojson-client`. Do **not** add `world-atlas`: the package
is 8.2 MB unpacked (110m, 50m and 10m resolutions, countries and land) for one file.

Vendor `countries-110m.json` under
`frontend/src/features/explore/atlas/assets/` beside its source/hash record and ISC
license notice. Import it with Vite's explicit URL form:

```ts
import topologyUrl from "./assets/countries-110m.json?url";
```

The file is larger than Vite's inline threshold, so the production build emits it with
a content-hashed name under `app/static/relay/assets/`. Its browser URL therefore lives
under `/app/assets/`, the only Relay asset path mounted by `app/main.py`. Do not place
it in `frontend/public/`: that directory does not exist, and Vite would copy the file
to `/app/atlas/...`, where the SPA catch-all returns `index.html` with status 200.

The atlas fetches `topologyUrl` on demand and rejects a non-JSON content type, malformed
JSON, or an object without the expected `countries` topology. Those failures enter the
table-plus-map-unavailable state in AC-F15. No third-party CDN participates in the page
load and no new FastAPI static mount is required.

Record the exact `world-atlas` release/source URL and SHA-256 against the **vendored
source bytes**, not the build filename. Geography provenance is part of the feature
contract, not an undocumented build step. The build's filename hash is cache identity;
the recorded SHA-256 is the auditable provenance check.

Measured unpacked sizes: `d3-geo` 227 KB, `d3-scale` 174 KB, `topojson-client` 68 KB.
These tree-shake (the atlas needs `geoNaturalEarth1`, `geoPath`, `geoCentroid`,
`scaleSqrt`, `scaleLinear`, `feature`); unpacked size is not bundled size and the real
chunk figure must be measured at implementation, not estimated here.

MapCN is useful reference material, not a dependency. Its attractive primitives sit on
MapLibre and are strongest when the product needs pan-and-zoom basemaps, terrain,
markers or animated arcs. This atlas needs none of those in v1. Using it as the core
would trade exact SVG control for a larger rendering stack and tempt the interface
toward movement and route lines the corpus cannot substantiate. MapLibre remains the
right upgrade path only if a later layer needs tiled geography or city-level detail.

### Visual direction — editorial instrument

The atlas should feel like a carefully edited reference plate inside Relay, not a
generic consumer map and not a network-operations dashboard. The selected direction is
quiet, precise and typographic. Data earns the contrast; chrome recedes.

**Composition**

- A compact title and scope statement sit above the instrument. The governing caveat
  — observed SSI relationships, not payment volume — remains visible without becoming
  a warning banner.
- **The two controls sit above the work area, left-aligned, as segmented controls.**
  View: "Who gets reached" / "Who does the reaching", defaulting to the latter (D12).
  Scope: "All collected rows" / "Settlement instructions only", defaulting to the
  former. Neither label uses the word "settleable" — it is a coined term from the
  schema, not language a learner reads.
- **The coverage frame sits directly beneath the map, above the legend, spanning the
  map column.** It is a distinct element, never folded into the metric rail. The rail
  already carries "drawable countries", and collapsing the two destroys the three-state
  distinction AC-F12b depends on.
- **The concentration finding appears in the interface, not only in this document.**
  Fourteen institutions carry a network of 251 banks; 374 correspondents appear exactly
  once. That is the lesson, it is entailed by the rows, and it currently lives nowhere
  a user can see. One line in the title block.
- A narrow metric rail establishes the sample before the map: beneficiary banks,
  correspondents, and drawable countries, each with its denominator or scope. **The
  rail is figures on a ruled band, not cards** — DESIGN.md:90 allows a card only when
  the surface is independently selectable, movable or meaningfully bounded, and
  DESIGN.md:132 forbids a mosaic of equal cards. Four equal boxes is that mosaic.
- **The dominant action is selecting an institution or country** (DESIGN.md Principle
  1). Everything else on the plate orients or filters. The ranked table is where that
  action is easiest, which is why it is a peer of the map rather than an appendix.
- The page states its own coverage before its data, so a reader who leaves after five
  seconds leaves with the sample, not with a false impression of the world.
- On wide screens the map owns roughly two thirds of the work area and the ranked table
  owns one third. Selection opens detail in the table/panel column instead of covering
  the geography with a floating card.
- On narrow screens the text-equivalent table comes first. The map follows as an
  exploratory enhancement; no interaction requires precise pointer input.

**Graphic language**

- Use `geoNaturalEarth1` with a fixed initial world extent. The complete world remains
  visible on load; v1 has no slippy-map controls, terrain, streets, labels, or tiles.
- Ocean is the page canvas in light and dark. Land is a quiet surface with hairline
  borders. There is no decorative graticule, shadow, bevel, glow, or texture beyond the
  evidence hatch.
- **`black` theme gets its own land treatment.** Relay ships three themes, not two:
  `tokens.css:262` defines `:root[data-theme="black"]` with `--color-canvas: #000000`
  and `--color-surface: #18181b` — a 1.18:1 canvas-to-land step. "Ocean is the canvas"
  dissolves the map entirely there. In `black`, land lifts to an explicit surface step
  with a perceptible boundary and hairlines strengthen. The neutral ramp needs no
  special case: `--color-ink-strong` is already `#f3f4f6` in that theme, so the ramp
  inverts correctly on its own. Every visual assertion covers three themes.
- **The sequential country ramp is neutral ink, never blue.** DESIGN.md:28 reserves
  `--color-action` `#3157D5` for "Primary actions, selected navigation, links,
  progress." A blue data ramp spends the product's one reserved colour on decoration
  and, worse, makes selection invisible: a blue selected edge against a blue fill is
  no edge at all. The ramp runs light neutral to `--color-ink-strong` `#16233D`;
  `#3157D5` keeps its single job. Checked in both light and dark themes.
- Never-collected land stays visibly neutral and distinct from the ramp's light end.
  Selected geography uses the action edge **plus** a non-colour cue, per DESIGN.md's
  rule that status is never carried by colour alone.
- Hub circles are crisp translucent marks with a solid outline. They do not pulse,
  travel, or emit arcs. The absence of animation is semantic: the data is a collected
  network position, not live movement.
- Use `Instrument Sans` for interface text and `IBM Plex Mono` for counts, BICs,
  percentages and compact labels. Do not introduce a display face solely for this
  page; the editorial character comes from scale, spacing and alignment.
- Legends read as small explanatory sentences with endpoints and denominators, not as
  detached colour swatches. Tooltips are compact evidence cards, never the only place
  a value can be read.

**Interaction and motion**

- Hover/focus links map and table; click/Enter pins the same selection and updates the
  URL. Escape clears it. Focus order follows the table, not SVG path order.
- **The map SVG is `aria-hidden` with a text alternative naming the table.** Its 177
  paths are not individually focusable. The table already carries every value the map
  encodes, so exposing both duplicates the content and turns the map into a 177-stop
  keyboard trap between the toggles and the data.
- **Selection never requires hitting a country.** Every country reachable on the map is
  reachable in the table, and the table row is the 44×44px target (DESIGN.md:121).
  Malta is roughly two pixels wide at 390px; a design that requires tapping it is a
  design that excludes phones. Map hit areas are enlarged where geometry allows, but
  the table is the guaranteed path, not the fallback.
- **Below 768px the table becomes a labeled record list** (DESIGN.md:124), not a
  horizontally scrolling table. It is simultaneously the narrow-screen-first element
  and the accessibility equivalent, so it is the one component that cannot degrade.
- View and settleability changes use the existing control motion only. Map marks may
  cross-fade within the standard duration token; paths do not fly, morph across the
  globe, or animate along routes.
- Respect `prefers-reduced-motion` by removing the cross-fade. Information order and
  selection feedback remain unchanged.

Direction **A — Editorial instrument** is the **author's proposal**, with B (cinematic
MapCN network) and C (hosted MapLibre map product) argued against on the grounds in D10.

Provenance note: an earlier revision recorded Direction A as selected by the user in the
visual companion. No such selection appears in the design conversation, where the
companion was never started and the choices put to the user were about measure, job,
spine, evidence channel, coverage, delivery and hub treatment — not visual direction.
The claim is withdrawn rather than restated. If that choice was made elsewhere, cite
where and this reverts to a decision; until then it is a proposal that has not been
reviewed.

**Design-system alignment.** Colours come from the named tokens in
`frontend/src/design-system/tokens.css`, not from new hexes: `--color-action`
(selection and controls only), `--color-ink-strong` (ramp dark end and primary text),
`--color-ink`, `--color-ink-muted`, `--color-canvas`, `--color-surface`,
`--color-border`, `--color-border-strong`.

The map is a component type DESIGN.md:88 does not list. Adding it to that vocabulary
is a DESIGN.md change, not an atlas change, and is out of scope here — but the
implementer should expect the component to define every state DESIGN.md:92-98 requires
of a shared component, because it will become one.

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
| one circle per hub country | country-level network position |
| circle area | distinct beneficiary banks reached by correspondents in that country, as a share of the collected denominator |

**Circle fill is flat, and encodes nothing beyond identity.** An earlier revision put
currency breadth on fill depth. Translucent marks that overlap — and the European hubs
overlap heavily — sum to a third, darker value that encodes nothing while looking like
data. Overlap is not a layout nuisance there, it is channel destruction, and it lands
exactly where the hubs are. Currency breadth lives in the table, where it is legible
and sortable.

**No evidence channel, at all.** The panel states why in one line and lists the
disclosing banks' evidence spread, which is the true statement.

Known limitation: circles sit at country centroids, so the US mark dominates
mid-continent, Europe overlaps, and small financial centres get circles larger than
their landmass. Render one circle per country from `hub_countries`; rendering one per
institution would put 36 US marks at the exact same coordinate and make the visible
result depend on DOM order. Country aggregation still hides the institution-level
finding — the US shows 15 currencies because 36 institutions collectively span 15,
which is not the Citi-versus-Commerzbank story. That story lives in the synced table,
which ranks the `hubs` array.

**Hub is the default view.** The feature's thesis is the star — 14 institutions
carrying a network of 251 banks — and landing on the spoke view shows collection
coverage instead, which is the less interesting of the two. An earlier revision called
the hub map "the weaker half, shipped as a secondary read"; that is withdrawn. It
cannot be both the default and a secondary read. What survives from that assessment is
narrower and still true: the hub *map* carries less of the finding than the hub
*table* does, so on arrival the table is doing the explanatory work and the map is
doing the spatial work.

**Why the hub map survives DESIGN.md:138** ("No chart when the payment route or a
direct value comparison communicates the point better"). The ranked table states reach
and currency breadth better than any circle. What it cannot state is *where* the hubs
are: that they cluster in the US, Germany, the UK, Japan and Switzerland, and that
almost nothing in the global south appears. That is a spatial fact, and a table of
country codes does not communicate it. The rule is satisfied because the map carries
something the comparison cannot, not because the map is prettier. Recorded here so a
later reviewer re-testing rule 138 finds the argument instead of re-litigating it.

**Settleability filter** is orthogonal to the view. It changes the URL and refetches
`/api/atlas/network` with the selected `scope`; both views receive recomputed distinct
counts. Countries do not dim, they leave. The React Query key includes the scope so
all and settleable results cannot overwrite each other.

### Table specification

The document called this a "ranked table" repeatedly without naming a column. It is the
accessibility surface, so it is the one component that cannot be left to the implementer.

**Spoke view** — one row per country: country, beneficiary banks (with denominator),
rows, archived share as numerator-of-denominator plus percent, coverage state.

**Hub view — two tiers (D15).** Country aggregate rows carrying `banks_served` and
`currencies` with their denominators, with institution rows grouped beneath and
expandable. The map renders country grain and an institution-grain table alone would
mean the aggregate a sighted user reads — "US: 223 banks" — exists in no row at all.
That is the number AC-F9 was written to protect, so an institution-only table leaves
that AC guarding a cell that does not exist.

Default sort is reach descending; sort is user-controllable and lives in the URL beside
view, scope and selection. Below 768px the table becomes a labeled record list using the
`data-label` pattern already shipped in `SchemeTable.tsx:57`, not a horizontally
scrolling table.

### Ramp binning

The distribution is heavily skewed — 52% of correspondents serve exactly one bank — so a
linear ramp renders a near-uniformly pale world and communicates nothing. Use quantile
binning with five steps, and state the method as well as the range in the legend. AC-F10
required the range; the method is the decision that determines whether the map says
anything at all.

Zero-count categories render as text ("0 published"), never as an empty legend swatch.
An empty colour band reads as a rendering bug, which is the opposite of the rigor the
zero is there to demonstrate.

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

The network envelope, `spokes`, `hub_countries`, and `hubs` are all required. The app's
HTTP client calls `schema.parse()` on a successful response, so a missing section is a
contract failure and renders the full error state. Partial rendering is reserved for
independent resources: if atlas data loads but `countries-110m.json` does not, the
ranked table survives and `AsyncRegion.partialNote` states that the map is unavailable.

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
correspondent banking here". It also states how many observed BIC country codes could
not be mapped and lists those codes with their reviewed reasons (D9).

Under a non-default scope the frame distinguishes three states, not two: never
collected, collected but nothing in the selected scope, and collected and in scope
(AC-F12b). "Collected but out of scope" is the 21-country set the settleability filter
removes; it is the most informative thing the frame can say, and collapsing it into
"never collected" throws it away.

Every tooltip, panel, and table cell that shows a derived count carries its denominator
in the same accessible text. Examples: “24 of 251 collected beneficiary banks” and
“52 archived of 366 collected rows (14%).” A percentage is not a substitute for the
sample size.

### Layer seam (D2)

Two things only: the render loop iterates an ordered list of layer descriptors rather
than hardcoding one source, and the legend renders per-layer with that layer's own
attribution. v1 ships one descriptor. Adding an external scale layer later is adding an
entry, not a refactor. Anything more is speculative.

---

## What already exists

| Sub-problem | Existing code | Reuse decision |
|---|---|---|
| Request-scoped database access | `app/db.py:get_db` | Reuse in the atlas router; no new session lifecycle. |
| SSI source of truth and constraints | `app/models.py:SSI` | Query directly; do not create an atlas persistence model. |
| Shared public-response disclaimers | `app/routers/_shared.py` | Add an atlas-specific constant beside `_SSI_DISCLAIMER`. |
| Typed HTTP failures and Zod validation | `frontend/src/api/client.ts:apiRequest` | Reuse; strict schema failure becomes the full atlas error state. |
| Query cache identity | `frontend/src/api/queryKeys.ts:apiKeys` | Extend with scope-aware atlas keys. |
| Loading, empty, error, and partial UI | `frontend/src/design-system/AsyncRegion.tsx` | Reuse; partial is only for the independently fetched topology asset. |
| Explore routing and discovery | `App.tsx`, `ExplorePage.tsx`, `CommandSearch.tsx` | Extend the existing lazy-route and destination patterns. |
| Bank drill-down | `frontend/src/features/explore/BankDetailRoute.tsx` | Link beneficiary BICs to the existing route; do not build a second bank page. |
| Route telemetry redaction | `frontend/src/observability.ts` | Add static atlas paths and a parameterised country route. |

No existing code computes the required country and institution distinct-count rollups.
That logic belongs in one new service module shared by both atlas endpoints.

---

## Architecture and data flow

```text
URL state: view=spoke|hub, scope=all|settleable, selected=<id>
              │
              ├──────── React Query key includes scope
              │                    │
              │                    ▼
              │       GET /api/atlas/network?scope=...
              │                    │
              │      Atlas router + strict response model
              │                    │
              │                    ▼
              │              atlas service
              │          filter SSI rows first
              │        ┌───────────┼────────────┐
              │        ▼           ▼            ▼
              │      spokes   hub_countries    hubs
              │        └───────────┼────────────┘
              │                    ▼
              │        strict feature-local Zod parse
              │                    │
              ├────────────────────┼───────────────┐
              ▼                    ▼               ▼
        coverage frame        synced table     map renderer
                                                   │
                                     countries-110m.json
                                      independent fetch

Map selection ───────────────► URL selected state ◄──────── Table selection
Country panel ───────────────► /api/atlas/country/{iso2}?scope=...
Beneficiary row ─────────────► /app/explore/banks/{bic}
```

The API payload is atomic. A malformed or incomplete network envelope is an error. The
topology is a separate static request, so its failure can degrade to table-only without
pretending the map is complete.

---

## Integration points

The implementation crosses the following existing registration and contract seams.
Verified 2026-09-13:

| # | File | What |
|---|---|---|
| 1 | `app/main.py` | import and include the atlas router |
| 2 | `app/schemas.py` | strict network and country response models; forbid unexpected fields |
| 3 | `app/routers/_shared.py` | add `_ATLAS_DISCLAIMER` and export it |
| 4 | `frontend/src/api/queryKeys.ts` | add network and country keys including `scope` |
| 5 | `frontend/src/app-shell/App.tsx` | lazy import + `<Route path="explore/atlas">`, alongside `explore/banks`, `explore/schemes`, `explore/glossary` |
| 6 | `frontend/src/features/explore/ExplorePage.tsx` | category card on the Explore index |
| 7 | `frontend/src/features/explore/search/CommandSearch.tsx` | destination entry |
| 8 | `frontend/src/observability.ts` | allowlist `/app/explore/atlas`, `/api/atlas/network`, and parameterise `/api/atlas/country/:iso2` without logging the raw code |
| 9 | `frontend/src/features/tutor/` | publish atlas context via `usePublishTutorContext`, matching the other Explore routes |
| 10 | `frontend/src/features/explore/BankDetailRoute.tsx` | reciprocal "network position" link back into the atlas, so the drill-down is not one-way |
| 11 | `frontend/src/features/explore/atlas/assets/` | topology source asset, source/SHA-256 record, ISC license notice, and Vite `?url` import that emits beneath the existing `/app/assets` mount |

---

## Acceptance criteria

Each AC names the invariant clause or decision it enforces. Clause 1 is *entailment*,
clause 2 is *mandatory denominator*; see Governing invariant.

### Backend

- **AC-B1** — `/api/atlas/network` totals match direct SQL counts.
- **AC-B2** *(clause 1)* — reach and `banks_served` are distinct counts. Fixture with deliberately
  overlapping correspondents asserts the result is not the sum.
- **AC-B3** — `by_status_and_tier` entries sum to `totals.ssi_rows`.
- **AC-B3a** — `by_status_and_tier` contains exactly the Cartesian product of
  `SSI_STATUSES` and `{false, true}`, including zero-count pairs. The expected set and
  count are derived from `SSI_STATUSES`; neither the service nor the test hardcodes
  eight or repeats the status literals. This also proves `published: 0` remains a datum
  when the corpus has no published rows; frontend copy never hardcodes that number.
- **AC-B4** *(D5)* — every `hubs` object fails a schema check if it carries an
  `evidence` key. The Pydantic response models forbid extra fields rather than silently
  dropping them.
- **AC-B5** — `/api/atlas/country/{iso2}` rejects values that are not exactly two
  alpha characters.
- **AC-B6** — the response carries `_ATLAS_DISCLAIMER`; a test asserts it is not
  `_SSI_DISCLAIMER`.
- **AC-B7** *(clause 1)* — the response contains no coordinates, no ISO numeric codes
  and no topology keys.
- **AC-B8** *(clause 1)* — no field in the response schema admits a monetary or value
  unit. A test enumerates the response keys against an allowlist, so adding an
  amount-shaped field to the payload is a deliberate act that fails a test, not an
  oversight.
- **AC-B9** — `scope=settleable` applies the row filter before every aggregate.
  A fixture with overlapping correspondents proves filtered hub reach and currency
  breadth are recomputed as distinct counts, not derived by subtraction or summation.
- **AC-B10** — `hub_countries` contains at most one object per ISO2. Its reach and
  currency breadth match direct distinct-count SQL and are not sums of institution
  rollups.
- **AC-B11** — country drill-down ordering is deterministic and every disclosure stays
  attached to its beneficiary bank. `in_scope` and `all_scopes` each carry their own
  required denominators. Every well-formed ISO2 returns `200`; malformed codes return
  `422`.
- **AC-B11a** *(D6)* — `collected` is corpus-wide and never scope-filtered. The test
  asserts a country whose rows are wholly `bic_only` returns `collected: true` with
  `in_scope.rows == 0` and `all_scopes.rows > 0` under `scope=settleable`, and that a
  country absent from the corpus returns `collected: false` with zeroes in both blocks.

  Without this the drill-down cannot distinguish "nobody looked" from "we looked and
  found only availability rows" — and the second is the answer to the feature's most
  informative interaction.
- **AC-B12** — the network request executes a fixed number of SQL statements independent
  of result size. `scripts/benchmark_atlas.py` records the current and synthetic
  20,000-row baselines; timing is evidence in the PR, not a flaky CI assertion.

### Frontend

- **AC-F1** *(clause 1)* — every code in both role-specific observed-country arrays
  either resolves to
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
- **AC-F6a** — changing settleability updates the URL, uses a scope-specific React Query
  key, and requests the matching backend scope. No client code derives filtered hub
  distinct counts from the unfiltered payload.
- **AC-F7** *(D6)* — the coverage frame is present in every view and filter state and
  cannot be dismissed.
- **AC-F8** — axe passes on the atlas route. **Axe is a floor, not coverage for this
  feature**: a choropleth with no text equivalent passes it trivially, and every
  accessibility failure this spec guards against (AC-F9, AC-F12b, AC-F24, AC-F26) is
  invisible to it. A green axe run is not evidence the atlas is accessible.
- **AC-F9** *(clause 2)* — `AtlasTable` and `AtlasPanel` cannot render a reach figure
  without its denominator, enforced by the same required field as AC-F3.

  This is not a repeat of AC-F3. The table is what a screen-reader user gets *instead
  of* the map (see "The synced table is the accessibility answer"), so enforcing the
  denominator on the map alone protects it exactly where it is least needed and drops
  it where it matters most. A bare `223` in a ranked column is the easiest place in the
  whole feature to read reach as market share.

- **AC-F10** *(clause 2)* — **every data-driven scale** states its actual range in the
  legend, read from the data and never hardcoded. That is all three: the choropleth
  fill (beneficiary banks) and the hub circle area (reach). Fill depth is no longer a
  scale — see D14.

  A scale's meaning lives entirely in its domain, and every one of these domains shifts
  as waves land. "Dark" otherwise means "large relative to whatever today's maximum
  happens to be" — an aggregate with no stated denominator. Stated as a rule over all
  scales rather than per-channel, because the per-channel form is what let the hub
  fill-depth scale slip through the first pass.

  Hatch bands are exempt from a scale-range legend because their thresholds are fixed
  percentages. They are not exempt from AC-F10a's numerator-and-denominator text.
- **AC-F10a** *(clause 2)* — every derived count and percentage in tooltips, panels, and
  table cells renders its numerator and denominator in the same accessible text.
  Archived share, for example, renders “52 archived of 366 collected rows (14%),” not
  a bare percentage.
- **AC-F11** *(clause 1)* — no rendered numeric in any atlas component carries a
  currency symbol or value unit. Component-level assertion complementing AC-B8's
  payload-level one.
- **AC-F12** *(D6)* — never-collected countries are visually distinct from
  collected-but-thin ones, and the legend names both. AC-F7 covers the frame's
  presence; this covers its substance — a blank country must never read as "no
  correspondent banking here".
- **AC-F12b** *(D6)* — under a non-default scope the map renders **three** coverage
  states, not two: never collected, collected but nothing in this scope, and collected
  and in scope. The legend names all three. Derived by subtracting scoped `spokes` from
  the corpus-wide observed list (contract rule 7).

  **The three states are stated as text in the coverage frame, not only drawn.** The
  frame gives the count in each state and makes the out-of-scope set enumerable. An
  earlier revision required only the map and legend, which made the feature's own
  headline interaction — 21 countries leaving — a purely visual assertion. A table of
  the countries that remain cannot say "Canada left". That is the D6 conflation
  reproduced one layer up, and it is exactly the failure this AC exists to prevent.

  AC-F12 covers two states because `scope=all` only has two. The moment a scope filter
  is applied, a country like Canada — 2 banks, 15 rows, none settleable — becomes a
  third thing, and drawing it like France repeats at the map level the defect AC-B11a
  fixes at the panel level.
- **AC-F12a** *(D9)* — observed but unresolvable beneficiary or intermediary BIC
  country codes are shown in the corresponding view's coverage frame with their reason;
  they are not silently counted as never-collected.
- **AC-F13** *(D2)* — the render loop and the legend iterate a layer descriptor list.
  A test adds a second, inert descriptor and asserts both that it renders and that its
  attribution appears separately from the first layer's. An untested seam closes at the
  first refactor.

  The second descriptor is a **test fixture only**. No second layer, and no external
  data, ships in v1 — see Out of scope.

### Loading, empty and default states

DESIGN.md Principle 7 requires five states on every async region. Error, partial and
success were specified; loading and empty were not, and the panel column had no
default at all.

**Loading.** Two independent requests — the atlas payload and the topology asset. The
metric rail and the map skeleton resolve separately: the rail shows its own loading
state and fills first, the map region holds a neutral land silhouette (no fill ramp,
no hatch) until the payload lands. Never show a coloured map that is about to change
colour; a fill that shifts under the reader looks like data changing, not loading.

**Empty.** A reachable state, not a hypothetical: `seed_if_empty` can fail and
`/health` then reports `degraded`. Zero rows renders the frame, the legend and the
neutral world with an explicit statement that no rows are loaded, plus the one relevant
action (retry). It must never render as a world where nothing was ever collected —
that is the D6 conflation again, arriving through an infrastructure failure instead of
a scope filter.

**Panel default.** One third of the work area has nothing in it before a selection.
It carries the current view's top-ranked entry, labelled as a default rather than a
selection, so the column teaches what selection produces instead of sitting blank.

- **AC-F21** *(D11)* — no atlas fill, ramp stop, or hatch resolves to `--color-action`
  or any blue in its family. A test asserts the choropleth ramp endpoints against the
  neutral tokens, and that the selected-country treatment is the only element using the
  action colour. Blue means action; DESIGN.md:28 is the contract.
- **AC-F22** *(D12)* — the hub view is the default on first load with no URL state, and
  the ranked table is populated on arrival.
- **AC-F23** — the metric rail renders as figures on a ruled band with no per-metric
  card border, background fill, or shadow (DESIGN.md:90, :132).
- **AC-F24** — the map SVG is `aria-hidden="true"` and carries no focusable descendants;
  a text alternative names the table as the equivalent. An axe run plus a keyboard walk
  assert that tabbing from the toggles reaches the table without traversing geometry.
- **AC-F25** — every country present in the current view is selectable from the table,
  and each table row meets the 44×44px target. No assertion depends on hitting map
  geometry.
- **AC-F26** — below 768px the table renders as a labeled record list, not a scrolling
  table (DESIGN.md:124).

- **AC-F30** *(D16)* — every visual assertion covers three themes: light, dark and
  `black`. In `black`, land renders as an explicit surface step against the canvas with
  a measured boundary, not as canvas-coloured land.
- **AC-F31** *(D15)* — the hub table renders country aggregate rows whose
  `banks_served` and `currencies` match the map's circles, with institution rows grouped
  beneath. Every value visible on the map exists in a table row.
- **AC-F32** *(D14)* — hub circle fill is flat; no scale maps to fill opacity or depth.
- **AC-F33** — the choropleth uses quantile binning with a stated step count, and the
  legend names the method as well as the range.
- **AC-F34** — sort key and direction live in the URL alongside view, scope and
  selection, and back/forward restores them.
- **AC-F35** — reduced motion is honoured through **both** paths: the
  `prefers-reduced-motion` media query and Relay's in-app `[data-reduced-motion="true"]`
  flag (`theme.ts:103`, `global.css:212`). Testing only the media query leaves the
  in-app preference unverified.
- **AC-F36** — the atlas publishes tutor context via `usePublishTutorContext`, as
  `ExplorePage`, `LearnModulePage` and `TrackingPage` already do. Without it the tutor
  goes context-blind on a new Explore route.
- **AC-F37** — zero-count evidence categories render as text, never as an empty legend
  swatch.
- **AC-F38** — search resolves a country or correspondent into the same selection state
  the map and table produce, and the result is reachable by keyboard alone.
- **AC-F39** — the atlas map satisfies DESIGN.md's **geographic instrument** contract:
  synced text equivalent carrying every encoded value, marks out of the accessibility
  tree, no reserved colour on a data scale, selection reachable without hitting geometry.

### Loading, empty and default states

- **AC-F27** — while either request is outstanding the map renders neutral land with no
  ramp and no hatch, and the metric rail shows its own loading state. No coloured fill
  is drawn that a completed load would then change.
- **AC-F28** — a zero-row corpus renders the frame, legend and neutral world with an
  explicit "no rows loaded" statement and a retry action. It never renders as a world
  where nothing was collected.
- **AC-F29** — before any selection the panel shows the current view's top-ranked entry,
  labelled as a default rather than as a selection.

### Error and partial states

`AsyncRegion`'s `partial` branch renders `partialNote` as a `<p role="note">` with **no
retry control** — retry exists only on the `error` branch. So the table-plus-no-map state
is not recoverable in place. Either the atlas adds its own retry affordance beside the
note, or the spec states that reload is the recovery. It must not claim "reuse
AsyncRegion" and leave the user stranded.

The country panel is a second async region with its own fetch, and DESIGN.md Principle 7
applies to it too: it needs loading, empty, error, success and partial states of its own.
On a failed country fetch the selection stays in the URL and the panel offers retry; the
map and table selection do not reset.

- **AC-F14** — a failed `/api/atlas/network` renders `AsyncRegion`'s error state with
  retry. No map is drawn.
- **AC-F15** — a successful atlas response with a failed topology-asset request renders
  the ranked table and `AsyncRegion`'s `partialNote` naming the unavailable map. The
  topology request is considered failed on a non-2xx response, non-JSON content type,
  malformed JSON, or a JSON value without the expected `countries` topology. This
  explicitly catches the SPA-index-as-200 failure mode. A network payload missing
  `spokes`, `hub_countries`, or `hubs` fails strict parsing and renders the full error
  state; it never becomes a half-drawn map.

  `partialNote` already exists on `AsyncRegion` and is currently used by no page; the
  atlas is its first consumer for this genuinely independent-resource failure.
- **AC-F16** — the hub map renders one circle per `hub_countries` entry. Two
  institution hubs sharing an ISO2 produce one map circle and two table rows, so DOM
  order cannot hide an institution.
- **AC-F17** — the vendored source topology bytes match the recorded SHA-256 and expose
  the retained source and license notice in the layer attribution. A production-build
  test verifies the `?url` import resolves beneath `/app/assets/` and that FastAPI serves
  the emitted file as JSON rather than returning the SPA index.
- **AC-F18** *(D10)* — the initial view uses `geoNaturalEarth1` and fits the complete
  world without pan/zoom controls. The production dependency graph contains no
  MapLibre, Mapbox, MapTiler, Leaflet, or MapCN runtime package.
- **AC-F19** *(D10)* — component and E2E assertions cover the deterministic visual
  contracts: wide versus narrow map/table order, metric rail presence, selected and
  never-collected non-colour cues, hatch legend text, and the one-circle-per-country
  rule in an overlapping European fixture. Pixel-baseline comparison is not introduced
  in v1; T7 records human visual review across the full matrix.
- **AC-F20** *(D10)* — map marks render no route arcs, pulsing states, or perpetual
  animation. With `prefers-reduced-motion: reduce`, view/filter changes preserve all
  information and selection feedback with transition duration removed.

### E2E

- **AC-E1** — the atlas route loads and renders a map.
- **AC-E2** — toggling settleability changes the URL, sends the new API scope, and
  changes the displayed counts after the scoped response arrives.
- **AC-E3** — clicking a country opens the panel; the panel links into
  `BankDetailRoute`.

---

## NOT in scope for v1

Atlas search and the DESIGN.md geographic-instrument entry were considered out of scope
during the design review and pulled back in — see T9 and D10. What follows is what
stayed out.

External scale layer (seam only, no data). Drawn edges or arcs on the map. Animation.
Institution city coordinates. Pixel-diff screenshot infrastructure. Any volume, value
or market-share figure. Learning gates,
progress or badges — this is Explore and it stays ungated.

---

## Resolved data anomaly

**`EDBBEB22XXX` — European Depositary Bank SA.** Six rows (USD, EUR, GBP, JPY, AUD,
CAD). BIC positions 5–6 hold `EB`, which does not resolve in ISO 3166-1, so the bank
cannot be placed on any map. The project's own validator accepts it:

```
validate_bic("EDBBEB22XXX") -> (True, 'EDBBEB22XXX', 'EB', [])
```

Whether `EB` is a reserved SWIFT code or a defective seed row is a domain question that
cannot be settled from the repository; it needs a source check. V1 does not guess. It
keeps the row in non-geographic totals, excludes it from geometry, and names `EB` in the
visible unresolvable-codes report with that reason (D9, AC-F12a). Source verification is
deferred without hiding the anomaly.

---

## Risks

| Risk | Clause | Mitigation |
|---|---|---|
| A value or volume figure reaches the render | 1 | AC-B8 at the payload, AC-F11 at the component. The primary risk, so it is guarded at both layers. |
| A reader takes reach for market share | 2 | Denominator is a required field on the shared payload type: AC-F3 (map), AC-F9 (table and panel) |
| Choropleth darkness read as an absolute | 2 | AC-F10 — legend states its actual scale range, read from data |
| A reader takes collection shape for world structure | 2 | D6 coverage frame, always on and never dismissible: AC-F7 for presence, AC-F12 for the never-collected vs thin distinction |
| Evidence attribution regresses in a later change | D5 | AC-B4 and AC-F2 make it a parse failure, not a review question |
| Silent blank countries | 1 | AC-F1 asserts against the topology, with unresolvable codes named in a reviewed allowlist rather than silently absent |
| A partial load reads as a complete map | 1 | AC-F15 — the only partial state is API data without topology; missing API sections fail closed |
| Institution circles at the same centroid hide one another | 1 | Map uses `hub_countries`; institution `hubs` remain separate table rows (AC-B10, AC-F16) |
| A client derives filtered reach from non-decomposable totals | 1 | Scope is applied before aggregation and is part of the API and query-cache key (AC-B9, AC-F6a) |
| The layer seam closes at the first refactor | D2 | AC-F13 renders a second inert descriptor and asserts its separate attribution |
| Scoped emptiness reported as never-collected | 2 | `collected` is corpus-wide (AC-B11a); the map renders a distinct third state under a scope filter (AC-F12b). Canada under `scope=settleable` is the canonical case. |
| A **dimensionless** composite score is added later | 1 | **Not fully guarded.** AC-B8 and AC-F11 catch currency symbols and value units. A blended "importance index" over reach and currency breadth would carry neither, pass both, and still assert something no row entails. The control is review discipline, not a test. Recorded because a guard with a known hole is safer than one believed complete. |
| Hub map read as the primary finding | — | Shipped as a secondary read; the institution-level story lives in the table |
| Query cost as the corpus grows | — | Fixed SQL-count test plus reproducible benchmark at current and 20k-row corpora — see Performance |

---

## Implementation Tasks

Each step ends green before the next begins. Structural contract work lands before UI
rendering so the frontend cannot accidentally grow around an unstable payload.

1. [ ] **T1 — Contract fixtures and backend schemas**
   - Add representative overlapping-correspondent fixtures for both scopes.
   - Define strict Pydantic network and country response models in `app/schemas.py`.
   - Write failing contract tests for AC-B1–B11 before service code.
2. [ ] **T2 — Aggregation service and router**
   - Implement scope filtering once, then compute totals, spokes, `hub_countries`, and
     institution `hubs` from that filtered relation.
   - Implement deterministic country drill-down and register the router in `app/main.py`.
   - Add the fixed-SQL-count assertion and benchmark script (AC-B12).
3. [ ] **T3 — Frontend contracts and query state**
   - Add strict feature-local Zod schemas and scope-aware query keys.
   - Make view, scope, and selection URL-owned. Back/forward restores the same atlas.
   - Cover schema rejection, scope isolation, and denominator helpers with Vitest.
4. [ ] **T4 — Topology asset and pure encodings**
   - Vendor the pinned asset, source/hash record, and license notice in the feature's
     `assets/` directory; import the JSON with `?url`.
   - Verify a production build emits the asset beneath `/app/assets/` and FastAPI serves
     JSON bytes at that URL instead of the SPA index.
   - Implement ISO2-to-feature resolution, the reviewed unresolvable allowlist, hatch
     thresholds, scale domains, and accessible numerator/denominator strings as pure code.
5. [ ] **T5 — Table, map, and panel**
   - Build the table first as the complete semantic representation.
   - Add the spoke choropleth and country-aggregated hub circles over the same selection
     model. Then add the panel and `BankDetailRoute` links.
6. [ ] **T6 — Discovery, observability, and end-to-end coverage**
   - Register the page in all integration points above.
   - Run unit, component, accessibility, responsive, E2E, bundle, and benchmark checks.
7. [ ] **T7 — Visual QA evidence**
   - Review spoke and hub views at 390, 768, 1024, and 1440 pixels in light and dark
     themes, including selected, never-collected, hatch-heavy, and overlapping-Europe
     fixtures.
   - Attach screenshots and a completed checklist to the implementation review. This is
     human design verification, not a new pixel-baseline test subsystem.

8. [ ] **T8 (P1) — Design-review corrections, folded into T4/T5**
   - Neutral ink ramp with quantile binning; `--color-action` reserved for selection
     only (AC-F21, AC-F33).
   - Hub default view; two-tier hub table; flat circle fill (AC-F22, AC-F31, AC-F32).
   - Three themes including `black` land surface (AC-F30).
   - Loading, empty and panel-default states; country-panel async states (AC-F27–F29).
   - Coverage frame states its three counts as text (AC-F12b).
   - `aria-hidden` map, table-only selection path, record list below 768px
     (AC-F24–F26).
   - Both reduced-motion paths; tutor context; zero-count legend text
     (AC-F35–F37).
9. [ ] **T9 (P1) — Atlas search**
   - Type-ahead over countries and correspondents, resolving into the same selection
     model as the map and table. Extends `CommandSearch` rather than adding a second
     search surface.
   - DESIGN.md:81 makes Explore search-first; a reference instrument over 251 banks and
     102 countries without it does not match the workspace it lives in.
10. [ ] **T10 (P2) — Reciprocal link and discovery**
   - "Network position" link on `BankDetailRoute` back into the atlas.
   - Concentration finding (14 hubs / 374 single-appearance correspondents) in the
     title block.

### Execution lanes

```text
Lane A: backend fixtures/schemas → service/router → backend tests/benchmark
Lane B: topology asset provenance → ISO mapping/encoding tests
                                  ↘
Lane C (after backend contract): frontend schemas/state → table → map/panel
                                  ↓
Final lane: route/search/observability integration → E2E + bundle verification → visual QA
```

Lanes A and B can run in parallel. Lane C may use the agreed JSON fixtures while the
service is implemented, but final integration waits for Lane A. Route and observability
files stay in the final lane to avoid merge conflicts across frontend work.

### Test coverage map

```text
BACKEND CODE PATHS                              FRONTEND USER FLOWS
/api/atlas/network                             /app/explore/atlas
├── scope=all [unit + API]                     ├── API loading → complete view [component]
├── scope=settleable [unit + API]              ├── API error → retry, no map [component]
├── invalid scope → 422 [API]                  ├── topology error → table + note [component]
├── empty corpus → zero cross-tab [unit]       ├── spoke ↔ hub URL state [component + E2E]
├── overlapping hubs → distinct reach [unit]  ├── scope toggle refetches [component + E2E]
└── fixed SQL statement count [unit]           ├── map ↔ table selection [component]
                                                ├── country → panel [component + E2E]
/api/atlas/country/{iso2}                      ├── beneficiary → BankDetailRoute [E2E]
├── malformed code → 422 [API]                 ├── keyboard-only full flow [component]
├── never collected → 200, collected:false     ├── 390/768/1024/1440 layouts [E2E]
├── scoped-empty → collected:true [API+UI]     ├── three coverage states under scope [E2E]
├── paired in_scope/all_scopes totals [API]    ├── uncollected country truthfully named [E2E]
├── both scopes [unit + API]                   └── axe + readable text equivalent [E2E]
└── deterministic disclosure order [unit]

STATIC/CONTRACT PATHS
├── topology hash + feature ids [unit]
├── known-unresolvable reporting [unit]
├── forbidden hub evidence [Pydantic + Zod]
├── required denominators [typecheck + component]
└── all data-driven domains and labels [unit]
```

### Failure modes registry

| Path | Production failure | Test | Handling | User-visible result |
|---|---|---|---|---|
| Network request | timeout, 5xx, malformed JSON, or strict-schema failure | AC-F14 | React Query error + retry | Clear full-region error; no map |
| Topology request | missing/corrupt asset or hash mismatch | AC-F15, AC-F17 | isolate from data request | Complete table plus map-unavailable note |
| Scope change | stale all-scope data overwrites settleable response | AC-F6a | scope in query key; request cancellation | Latest URL state wins |
| Hub aggregation | overlapping correspondents are summed | AC-B2, AC-B9, AC-B10 | distinct SQL counts | Correct reach with denominator |
| Geometry join | ISO numeric string loses leading zero | AC-F1 | string-keyed lookup + allowlist | No silent blank country |
| Country drill-down | scoped emptiness reported as never-collected | AC-B11a, AC-F12b | corpus-wide `collected` plus paired `in_scope`/`all_scopes` blocks | "15 rows collected, none of them settlement instructions" |
| Country drill-down | malformed code, or a code the corpus has never seen | AC-B5, AC-B11 | boundary validation plus corpus-wide `collected` | 422 for malformed input; "No rows collected for France" for a genuinely uncollected country |
| Map selection | stacked institution circles hide rows | AC-F16 | one country circle; institutions in table | Deterministic map and complete table |
| Evidence display | source quality is attributed to a hub | AC-B4, AC-F2 | strict backend and frontend schemas | Contract error, never misleading evidence |

No listed path has a silent failure with neither a test nor recovery behavior.

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

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run; governing product decisions were approved during design |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | UNAVAILABLE | Codex aborted: `Error loading config.toml: data did not match any variant of untagged enum FeatureToml in features.multi_agent_v2`. Local config fault, not auth. Outside voices ran `[single-model]` |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | STALE | CLEAR at 2026-09-13T17:21Z against commit 1ab9478. The plan has changed materially since — contract split of `collected`, three-state coverage, two-tier table, new async states. Re-run required |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ISSUES OPEN | score 6/10 → 8/10, 11 decisions, 1 unresolved. 7 passes plus an independent Claude design subagent |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not required for an end-user Explore feature |

**Pass scores:** Info Arch 5→8 · States 3→9 · Journey 4→7 · AI Slop 8→9 · Design System 4→9 · Responsive/A11y 5→9 · Decisions 11 resolved, 1 deferred.

**OUTSIDE VOICE:** An independent Claude design subagent found five issues this review's own passes missed, each verified against the repo before acting: a third shipped theme (`tokens.css:262`, `data-theme="black"`) in which the map's figure-ground collapses; `AsyncRegion`'s partial branch having no retry control; an in-app `[data-reduced-motion="true"]` path separate from the media query; the `data-label` record-list pattern already shipped in `SchemeTable.tsx`; and `usePublishTutorContext` being consumed by every other Explore route. It also found two defects in acceptance criteria written during the preceding engineering review — AC-F9 protecting a value with no table row, and AC-F12b making the feature's headline interaction sighted-only.

**VERDICT:** DESIGN REVIEWED, NOT CLEARED TO IMPLEMENT. The design contract violations are closed and DESIGN.md itself was corrected (stale three-theme text, new geographic-instrument component entry). Engineering review must re-run: this revision changed the payload grain consumed by the table, added six interaction states, and pulled search into scope.

**UNRESOLVED DECISIONS:**
- Overlapping hub circles in Europe still corrupt the area channel. Removing fill depth (D14) fixed additive opacity, but two overlapping circles of different sizes remain hard to read by area, and no mitigation is specified. Deferred rather than solved; the ranked table carries the same values exactly.
- `EB` / `EDBBEB22XXX` remains unclassified pending a source check (carried from prior review).
