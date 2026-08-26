# Global Financial Brand Registry and Logo API Design

**Date:** 2026-08-26  
**Status:** Design approved in conversation; awaiting written-spec review  
**Product boundary:** Standalone product, separate from the Relay/SWIFT Routing application

## Summary

Build a global, source-driven registry of financial institutions and customer-facing financial brands, with verified logo assets, identifier resolution, provenance, rights metadata, open-source release bundles, and a hosted API/CDN.

The product is not a manually curated folder of images and is not a promise that every global trademark can be redistributed. Its durable value is the relationship between legal entities, brands, identifiers, source evidence, logo assets, and release history.

## Decisions

- The product is standalone. The current Relay/SWIFT Routing application may consume it later, but it is not the product's primary runtime.
- Open-source users and hosted API customers are equally important first-release audiences.
- The registry includes all financial brands, not only deposit-taking banks. Categories remain explicit rather than flattening banks, wallets, payment institutions, remittance providers, card networks, and fintechs into one type.
- Logo rights use a hybrid model. Code and normalized metadata can be open; each logo has its own provenance and rights state. A repository license never claims ownership of third-party marks.
- The product has an open/self-hostable core and a managed API/CDN with free and paid tiers.
- An internal stable institution ID is canonical. LEI, BIC, national codes, domains, names, aliases, brands, and subsidiaries are mapped identifiers or relationships.
- Identity sources are checked daily. Logo/source checks run weekly. Urgent takedowns and rebrands can produce immediate patch releases.
- The published release bundle is the source of truth. Operational databases and API indexes are generated read models, not competing canonical stores.
- Initial implementation uses a modular application and background workers, not a fleet of microservices.

## Goals

1. Provide a global institution and brand directory that developers can search by name, domain, LEI, BIC, national identifier, routing code, or alias.
2. Provide safe, normalized logo assets with variants, checksums, source URLs, verification dates, and rights metadata.
3. Make every published record reproducible from a versioned release and source manifest.
4. Publish downloadable open data and packages for assets that are permitted to be redistributed.
5. Provide a reliable hosted API/CDN with authentication, rate limits, usage tiers, immutable URLs, and a convenient latest alias.
6. Make coverage gaps, stale sources, unresolved matches, and rights gaps visible rather than silently hiding them.
7. Give institutions and rights holders a correction, replacement, and removal workflow.

## Non-goals for the first release

- Guaranteeing redistribution rights for every global logo or trademark.
- Real-time synchronization with every regulator worldwide.
- Completing every small, inactive, historical, or branch-level financial entity before launch.
- Serving assets marked `unknown`, `source_link_only`, or `removed`.
- Replacing licensed SWIFT/BIC reference products with an unauthorized full-directory redistribution.
- Building a payment-processing or banking-connectivity product.

## Users and use cases

### Developers

- Resolve a bank or financial brand from a BIC, LEI, national code, domain, or user-entered name.
- Display a current logo in a dashboard, payment flow, account selector, or directory.
- Pin a release for deterministic builds or use `latest` for ordinary application display.
- Download JSON/CSV or install a language package for offline use.

### Data maintainers and researchers

- Inspect institution/brand relationships and source evidence.
- Compare changes across releases.
- Run the ingestion and publication pipeline self-hosted.
- Contribute corrections or source adapters.

### Institutions and rights holders

- Verify a displayed logo and metadata.
- Submit a new official asset or a rebrand.
- Request correction or removal and receive an auditable outcome.

## Scope and taxonomy

The registry supports, at minimum, these categories:

- commercial/deposit-taking bank;
- central bank;
- investment, merchant, development, mortgage, and building-society bank;
- cooperative bank and credit union;
- microfinance and community financial institution;
- payment institution, electronic-money institution, and mobile wallet;
- remittance and money-transfer provider;
- card network and payment scheme;
- broker, exchange, neobank, and other fintech brand.

Category values are controlled and extensible. An institution can have multiple permitted categories with source evidence; the same consumer brand can relate to multiple country-specific legal entities.

## Architecture

```text
Source registry
    ↓
Connector runs → raw snapshots/object storage
    ↓
Normalized candidates
    ↓
Deterministic entity resolver
    ↓
Logo/rights asset pipeline
    ↓
Human review queue
    ↓
Immutable release bundle
    ├── open dataset/packages
    ├── API read model
    └── permitted CDN assets
```

### Components

1. **Registry core** — the canonical published model of institutions, brands, identifiers, relationships, sources, assets, and releases.
2. **Source connectors** — bounded adapters for regulators, GLEIF, public BIC lookup, open-finance directories, official domains, approved repositories, and contributor submissions.
3. **Entity resolver** — deterministic matching and review suggestions; fuzzy matching never publishes an automatic merge.
4. **Asset pipeline** — fetch, validate, sanitize, normalize, deduplicate, hash, and classify logo assets.
5. **Review console** — approve, reject, supersede, or remove candidate records and assets with the evidence visible.
6. **Publication builder** — create immutable release bundles, manifests, checksums, package artifacts, and API read models.
7. **Hosted API/CDN** — serve permitted metadata and binaries with authentication, quotas, caching, and plan limits.
8. **Contributor/takedown workflow** — accept corrections and rights-holder requests into a quarantined review queue.
9. **Public catalog** — provide a read-only searchable web catalog for browsing institutions, brands, identifiers, logo variants, provenance, and rights states.
10. **Operations and observability** — monitor source health, asset drift, stale records, unresolved entities, rights coverage, and release quality.

Raw source snapshots and downloaded originals are stored outside Git in content-addressed object storage. Git contains the processing code, source manifests, normalized release artifacts, and assets whose redistribution status permits inclusion.

## Canonical data model

### Institution

- immutable internal ID;
- legal name and normalized name;
- country and jurisdiction;
- one or more controlled categories;
- regulator and license references;
- lifecycle status: `active`, `inactive`, `merged`, `renamed`, or `unknown`;
- effective dates when known;
- source evidence and confidence.

### Brand

- immutable brand ID;
- display name, aliases, localized names, and domains;
- relationship to one or more institutions;
- parent brand or successor brand;
- app/product names kept separate from legal entities;
- active and historical display periods when known.

### Identifier

```text
institution_id
identifier_type: LEI | BIC | national_code | routing_number | domain | tax_id
identifier_value
country
source_id
valid_from
valid_to
confidence
```

No external identifier is the primary key. Identifiers can be missing, retired, reused, scoped to a branch, or scoped to a country-specific entity.

### Asset

```text
asset_id
institution_id or brand_id
variant: primary | monochrome | mark | wordmark | dark | light
format: svg | png | webp
sha256
perceptual_hash
dimensions
source_id
source_uri
rights_status
license_note
verified_at
review_status
```

Rights states are explicit:

- `redistributable` — permitted by the recorded source terms;
- `licensed` — covered by a permission or commercial agreement;
- `source_link_only` — metadata/source link may be published, binary may not;
- `unknown` — quarantined and not publicly served;
- `removed` — intentionally unavailable after a request or review.

### Source and release metadata

Each source records publisher, jurisdiction, URL, source type, terms URL, trust tier, connector version, check frequency, and last successful run. Each release records schema version, generation commit, source-run IDs, counts, unresolved matches, stale sources, and provenance coverage.

## Sources and ingestion

The source hierarchy is:

1. national regulators, central banks, and banking associations for institution identity and status;
2. GLEIF for open global legal-entity reference data and LEI relationships;
3. licensed or permitted BIC/SWIFT reference access for BIC identity data;
4. official bank/brand domains and brand-guideline pages for logo assets;
5. official open-banking/open-finance participant directories;
6. approved open repositories and file-level licensed collections;
7. direct institution or rights-holder submissions;
8. commercial providers only where their terms permit the intended hosted use.

Each connector follows:

```text
discover → fetch snapshot → normalize candidates → extract assets
        → resolve entities → validate assets → create review items
```

Matching order:

1. exact LEI, BIC, national identifier, or regulator ID;
2. exact verified domain;
3. exact normalized name plus country/jurisdiction;
4. name, address, parent-brand, and country similarity as a review suggestion only.

A failed connector is quarantined and cannot erase a previously verified record. A source outage leaves the prior record published with a stale-source warning.

## Asset processing and review

For every candidate asset:

- allow HTTPS sources only;
- block localhost, private-network, metadata-service, and unsafe redirect targets;
- enforce response-size, image-dimension, decompression, and SVG-complexity limits;
- sanitize scripts, event handlers, external references, and embedded objects;
- preserve the original separately from derived public variants;
- generate canonical SVG/PNG variants when permitted;
- calculate SHA-256 and perceptual hashes;
- deduplicate identical content;
- create a visual review item whenever the asset changes.

Review states are:

```text
candidate → needs_review → approved | rejected | superseded | removed
```

Reviewers see old and new assets, source URL, institution/brand match, rights state, source terms, and provenance before approving a change.

## Publication and API

Each release produces:

```text
release/
  institutions.json
  brands.json
  identifiers.json
  relationships.json
  assets-manifest.json
  sources.json
  checksums.txt
  schema-version.json
  assets/
```

Initial API:

```text
GET /v1/institutions/{id}
GET /v1/institutions?country=&category=&status=&page=
GET /v1/resolve?q=&country=&identifier_type=
GET /v1/institutions/{id}/logos
GET /v1/assets/{asset_id}
GET /v1/releases/latest
GET /v1/releases/{version}/manifest
```

Responses include canonical identity, identifiers, brand relationships, logo variants, rights state, source URI, verification date, and confidence.

Immutable URLs use release versions:

```text
/releases/2026.09.0/assets/asset_abc123.svg
```

The `latest` alias is a convenience for application developers and is excluded from canonical checksums and reproducible examples.

Distribution targets:

- open repository with normalized data, manifests, processing code, and permitted assets;
- JSON, CSV, and compressed bulk releases;
- JavaScript/TypeScript and Python packages first;
- public searchable catalog with links to API records and permitted assets;
- hosted API/CDN with public low-volume access, API keys, quotas, and paid higher-volume tiers;
- self-hosting against any release bundle without the managed service.

## Operations and freshness

- identity-source checks: daily;
- logo/source checks: weekly;
- ordinary publication: weekly reviewed release;
- urgent takedown or rebrand: immediate patch release;
- source failure: preserve last verified record and emit stale-source warning.

Operational metrics include connector success/failure, source age, unresolved candidates, asset drift, rights gaps, provenance coverage, release duration, API latency, cache hit rate, and removal-request resolution time.

## Security, legal, and governance

- Source fetchers run in isolated workers with controlled egress.
- Contributor URLs and assets are quarantined until review.
- API and ingestion credentials are separate.
- Raw snapshots and review notes are private.
- Public responses never imply bank endorsement or affiliation.
- Logos marked `unknown`, `source_link_only`, or `removed` are not served as binaries.
- Every removal retains an audit record and release reference.
- The product must not redistribute restricted SWIFT/BIC datasets or third-party logos without the applicable permission.

## Testing strategy

- fixture-based tests for every connector;
- golden tests for entity matching, alias resolution, and merge prevention;
- SVG security, malformed-image, oversized-image, and decompression-bomb tests;
- deterministic rebuild tests from a fixed snapshot;
- schema, relationship, checksum, and rights-gate tests;
- API contract, search, pagination, rate-limit, and authentication tests;
- CDN asset-availability and cache-control smoke tests;
- load tests for common resolution and asset-delivery paths;
- end-to-end tests covering submission, review, release, API lookup, and takedown.

## Delivery strategy and effort

The architecture is global from day one, but coverage grows in country/source packs.

### First release

Target several thousand high-value institutions and brands, with clearly reported coverage and gaps. Include the full schema, release builder, provenance, review workflow, API, CDN, open data, and initial package targets.

### Expansion

Add regulator connectors and official logo sources country by country, then extend into smaller, inactive, historical, and branch-level entities. Do not claim global completeness until coverage is measured by jurisdiction and category.

### Effort

With 2–3 experienced engineers plus data-quality support:

- schema and source framework: 1–2 weeks;
- seed imports and entity deduplication: 3–6 weeks;
- source connectors: 4–10 weeks;
- asset pipeline and review: 4–8 weeks;
- API/CDN/packages/gallery: 3–6 weeks;
- operations, legal workflow, and hardening: 2–4 weeks.

Parallelized, a credible v1 is approximately 10–16 weeks. A solo engineer should expect roughly 4–9 months. Broad long-tail global coverage is an ongoing data operation requiring approximately 1–2 dedicated data/curation roles in addition to product engineering.

## Success criteria

1. Every published record has traceable provenance.
2. Every published binary asset has a permitted rights state; `source_link_only` records may publish metadata and source links without a binary.
3. Failed source runs never delete previously verified records.
4. Releases rebuild deterministically from recorded inputs.
5. Common identifiers and names resolve consistently.
6. A self-hosted user can run any release without the managed service.
7. Coverage gaps, stale data, unresolved matches, and rights gaps are measurable.
8. Institutions and rights holders can correct or remove assets through an auditable workflow.
