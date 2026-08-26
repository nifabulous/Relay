# Global Financial Registry Core

Reproducible global financial institution and brand registry core.

This package is a standalone, reproducible registry that ingests normalized candidates, resolves entities deterministically, validates logo assets and rights, and emits deterministic release bundles. It is isolated from the Relay/SWIFT Routing runtime.

## Local development

```bash
cd global-financial-registry
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
python -m pytest -q
financial-registry --help
```

## Release contract

The release bundle is the source of truth; no mutable database is introduced. All published dates are timezone-aware UTC, release versions are SemVer 2.0.0, and JSON is deterministic (UTF-8, sorted keys, stable list ordering, trailing newline).

```bash
cd global-financial-registry
pip install -e '.[dev]'
python -m pytest -q
financial-registry validate data/fixtures/candidates.json
financial-registry release-build data/fixtures/candidates.json dist/release \
  --version 0.1.0 \
  --generated-at 2026-08-26T00:00:00+00:00 \
  --generation-commit fixture-commit
```

### Guarantees

- **Source of truth:** The published release bundle (`institutions.json`, `brands.json`, `identifiers.json`, `aliases.json`, `rekey-events.json`, `relationships.json`, `assets-manifest.json`, `sources.json`, `checksums.txt`, `schema-version.json`) is the only publication output.
- **Rights gate:** Binary assets are emitted only for `redistributable` and `licensed` rights states. `source_link_only` emits metadata and a source URI without a public binary. `unknown`, `removed`, and `source_link_only` assets never emit a public binary; licensed assets require `permission_reference`, territory coverage, and a non-expired permission.
- **No live scraping in this plan:** This package provides a `SafeHttpxAssetFetcher` with injected transport/DNS and a deterministic fixture connector. Live regulator crawlers are deferred.
- **Identity:** Every institution has a curated `canonical_key`; source identifiers are aliases and `RekeyEvent` preserves history without changing the canonical ID. Brand ownership is via sourced `Relationship(brand_of)`.
- **Provenance:** Every published record references a source and successful `SourceRun`. Source failures preserve the prior verified snapshot as warnings.
- **Determinism:** Same input and explicit `--generated-at` produce byte-identical outputs; builds are atomic via temporary directories and `checksums.txt`.
- **Lifecycle:** `draft -> validated -> published -> superseded` and `published -> withdrawn` with predecessor/successor/withdrawal metadata. Only a validated bundle may be published.
- **Coverage disclaimer:** This fixture-only core makes no global coverage claim and publishes counts, unresolved matches, stale sources, and provenance gaps in `schema-version.json`. Raw snapshots are stored outside public releases.
- **Licensing:** Code is Apache-2.0; project-created normalized metadata is CC BY 4.0 (attribution required); third-party assets retain per-asset rights terms.
- **Deferred:** Schedulers, metrics, object storage, API/CDN, public catalog, governance UI, SDK packages, and billing belong to later plans.

## Testing

```bash
python -m pytest -q
python -m pytest --cov=financial_registry --cov-report=term-missing -q
ruff check src tests
```

## Fixture data

`data/fixtures/candidates.json` contains two institutions (`inst_example_bank` GB and `inst_example_wallet` NG), two brands, identifiers (BIC and domain), brand_of relationships, a redistributable SVG asset (`example-bank.svg`) and a source-link-only wallet asset, source definitions, successful source runs, an alias, and a rekey event. `asset_root` is `logos` relative to the fixture directory; `FixtureConnector` resolves it to `data/fixtures/logos`.

## CI

Standalone workflow `.github/workflows/registry-core.yml` runs on Python 3.10-3.12, installs `global-financial-registry[dev]`, runs `ruff`, `pytest`, and coverage (85% threshold) without importing the Relay application.

## License

Apache-2.0 (see `LICENSE`). Normalized metadata: CC BY 4.0.
