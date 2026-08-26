# Registry and Release Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first independently testable subproject of the global financial brand product: a standalone package that ingests normalized candidates, resolves entities deterministically, validates logo assets and rights, and emits reproducible release bundles.

**Architecture:** Create an isolated Python package under `global-financial-registry/`; do not modify the existing Relay/SWIFT Routing runtime. The release bundle is the source of truth, while source runs, snapshots, and processing code make releases reproducible. This plan includes connector interfaces and a fixture connector, not live regulator crawlers, hosted API/CDN, review UI, billing, or SDK publication.

**Tech Stack:** Python 3.10+, Pydantic v2, Typer, pytest, httpx-compatible fetcher interfaces, `defusedxml`, Pillow, CairoSVG, and ImageHash. Filesystem storage is used in tests and local development; object-storage adapters and the hosted serving plane belong to later plans.

## Global Constraints

- The product is standalone; do not modify `app/`, `frontend/`, or Relay routes.
- The published release bundle is the source of truth; no mutable database is introduced in this plan.
- Internal IDs are stable and opaque; LEI, BIC, national codes, domains, and names are identifiers or aliases, never primary keys.
- Fuzzy matching can create review suggestions but can never publish an automatic merge.
- Every published record has at least one source reference.
- Every published binary asset has a permitted rights state, source URI, SHA-256 checksum, and review state `approved`.
- Assets with rights state `unknown`, `source_link_only`, or `removed` cannot be emitted as public binaries.
- Code defaults to Apache-2.0; project-created normalized metadata defaults to CC BY 4.0; third-party assets retain per-asset rights terms.
- JSON serialization is deterministic: UTF-8, sorted keys, stable list ordering, and a trailing newline.
- Source failures preserve the prior verified record and are represented as warnings, not destructive deletes.
- Network behavior is injected behind interfaces; tests must not depend on live websites.
- Follow the repository’s TDD convention: write a focused failing test, verify failure, implement the smallest change, run the focused and surrounding suites, then commit.

---

## File map

Create an isolated package with these responsibilities:

```text
global-financial-registry/
├── pyproject.toml                         # package metadata, dependencies, CLI entry point
├── README.md                              # local development and release-bundle usage
├── LICENSE                                 # Apache-2.0 code license text
├── src/financial_registry/
│   ├── __init__.py                         # package version and public exports
│   ├── domain.py                           # Pydantic canonical models and enums
│   ├── ids.py                              # stable internal ID allocation
│   ├── normalize.py                        # deterministic name/domain/identifier normalization
│   ├── resolver.py                         # exact matching and review-only suggestions
│   ├── sources.py                          # source definitions, runs, connector protocols
│   ├── snapshots.py                        # content-addressed filesystem snapshots
│   ├── fetch_policy.py                     # URL and response safety policy
│   ├── assets.py                            # asset validation, sanitization, hashing, variants
│   ├── release.py                           # release validation and deterministic bundle writing
│   ├── cli.py                               # validate and release-build commands
│   └── connectors/
│       ├── __init__.py
│       └── fixture.py                       # deterministic fixture connector for tests/dev
├── data/fixtures/
│   ├── source-definition.json               # one source manifest fixture
│   ├── candidates.json                      # two institutions, one brand, identifiers, assets
│   └── logos/
│       ├── example-bank.svg                 # approved fixture asset
│       └── example-wallet.svg               # source-link-only fixture candidate
└── tests/
    ├── conftest.py
    ├── test_package.py
    ├── test_domain.py
    ├── test_ids.py
    ├── test_normalize.py
    ├── test_resolver.py
    ├── test_sources.py
    ├── test_snapshots.py
    ├── test_fetch_policy.py
    ├── test_assets.py
    ├── test_release.py
    ├── test_cli.py
    └── test_end_to_end.py
```

The package must be independently installable with `pip install -e .` from its directory. Root Relay tests must continue to run without importing this package.

### Task 1: Scaffold the standalone package

**Files:**
- Create: `global-financial-registry/pyproject.toml`
- Create: `global-financial-registry/README.md`
- Create: `global-financial-registry/LICENSE`
- Create: `global-financial-registry/src/financial_registry/__init__.py`
- Create: `global-financial-registry/tests/test_package.py`

**Interfaces:**
- Produces package import `financial_registry` and version `0.1.0`.
- Produces console script `financial-registry` that initially responds to `--help`.

- [ ] **Step 1: Write the failing package smoke test**

```python
# global-financial-registry/tests/test_package.py
from typer.testing import CliRunner

from financial_registry import __version__
from financial_registry.cli import app


def test_package_version_is_exposed():
    assert __version__ == "0.1.0"


def test_cli_help_is_available():
    result = CliRunner().invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "validate" in result.stdout
    assert "release-build" in result.stdout
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_package.py -q
```

Expected: FAIL because the package, CLI, and commands do not exist.

- [ ] **Step 3: Add package metadata and the minimal CLI**

```toml
# global-financial-registry/pyproject.toml
[project]
name = "global-financial-registry"
version = "0.1.0"
description = "Reproducible global financial institution and brand registry core"
requires-python = ">=3.10"
license = { text = "Apache-2.0" }
dependencies = [
  "cairosvg>=2.7,<3",
  "defusedxml>=0.7,<1",
  "imagehash>=4.3,<5",
  "pillow>=10,<12",
  "pydantic>=2.5,<3",
  "typer>=0.12,<1",
]

[project.optional-dependencies]
dev = [
  "httpx>=0.27,<1",
  "pytest>=8,<9",
  "pytest-cov>=5,<7",
]

[project.scripts]
financial-registry = "financial_registry.cli:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

```python
# global-financial-registry/src/financial_registry/__init__.py
__version__ = "0.1.0"

__all__ = ["__version__"]
```

```python
# global-financial-registry/src/financial_registry/cli.py
import typer

app = typer.Typer(no_args_is_help=True)


@app.command("validate")
def validate(input_path: str = typer.Argument(..., help="Canonical JSON input")) -> None:
    """Validate a canonical registry input file."""
    raise typer.Exit(code=0)


@app.command("release-build")
def release_build(input_path: str = typer.Argument(...), output_dir: str = typer.Argument(...)) -> None:
    """Build a deterministic release bundle from canonical input."""
    raise typer.Exit(code=0)


def main() -> None:
    app()
```

Create `README.md` with the exact local setup and test commands:

```bash
cd global-financial-registry
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
python -m pytest -q
financial-registry --help
```

Add the standard Apache-2.0 text to `LICENSE`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
cd global-financial-registry
pip install -e '.[dev]'
python -m pytest tests/test_package.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add global-financial-registry
git commit -m "feat(registry-core): scaffold standalone package"
```

### Task 2: Define canonical domain models and stable IDs

**Files:**
- Create: `global-financial-registry/src/financial_registry/domain.py`
- Create: `global-financial-registry/src/financial_registry/ids.py`
- Create: `global-financial-registry/tests/conftest.py`
- Create: `global-financial-registry/tests/test_domain.py`
- Create: `global-financial-registry/tests/test_ids.py`

**Interfaces:**
- Produces Pydantic models `Institution`, `Brand`, `Identifier`, `Relationship`, `Asset`, `AssetCandidate`, `SourceDefinition`, `SourceRun`, `CandidateRecord`, `ReleaseManifest`, and `RegistryInput`.
- Produces enums `InstitutionStatus`, `RightsStatus`, `ReviewStatus`, `RelationType`, `SourceType`, and `TrustTier`.
- Produces `StableIdAllocator.allocate(kind: str, identity_key: str) -> str`.

- [ ] **Step 1: Write failing validation and ID tests**

```python
# global-financial-registry/tests/test_domain.py
import pytest
from pydantic import ValidationError

from financial_registry.domain import (
    Asset,
    Identifier,
    Institution,
    RightsStatus,
    ReviewStatus,
)


def test_institution_requires_two_letter_country_code():
    with pytest.raises(ValidationError):
        Institution(id="inst_demo", legal_name="Demo Bank", country_code="NGA")


def test_binary_asset_requires_source_and_non_unknown_rights():
    with pytest.raises(ValidationError):
        Asset(
            id="asset_demo",
            owner_id="inst_demo",
            variant="primary",
            format="svg",
            source_id="src_demo",
            source_uri="https://example.test/logo.svg",
            rights_status=RightsStatus.UNKNOWN,
            review_status=ReviewStatus.APPROVED,
            sha256="a" * 64,
            binary_path="assets/asset_demo.svg",
        )


def test_source_link_only_asset_can_have_metadata_without_binary_path():
    asset = Asset(
        id="asset_demo",
        owner_id="inst_demo",
        variant="primary",
        format="svg",
        source_id="src_demo",
        source_uri="https://example.test/logo.svg",
        rights_status=RightsStatus.SOURCE_LINK_ONLY,
        review_status=ReviewStatus.APPROVED,
        sha256=None,
        binary_path=None,
    )
    assert asset.binary_path is None
```

```python
# global-financial-registry/tests/test_ids.py
from financial_registry.ids import StableIdAllocator


def test_stable_ids_are_deterministic_and_kind_scoped():
    allocator = StableIdAllocator()
    first = allocator.allocate("institution", "gleif:529900demo")
    second = allocator.allocate("institution", "gleif:529900demo")
    brand = allocator.allocate("brand", "gleif:529900demo")
    assert first == second
    assert first.startswith("inst_")
    assert brand.startswith("brand_")
    assert brand != first
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_domain.py tests/test_ids.py -q
```

Expected: FAIL because the domain models and allocator are not implemented.

- [ ] **Step 3: Implement the models and allocator**

Use `ConfigDict(extra="forbid")` on every published model. The core fields must include the design-approved relationship, source, rights, lifecycle, and provenance fields. Use an opaque UUID5 derived from `financial-registry:{kind}:{identity_key}` and prefix it with `inst_`, `brand_`, `asset_`, or `rel_`; never expose the identity key as the public ID.

```python
# global-financial-registry/src/financial_registry/ids.py
from uuid import NAMESPACE_URL, uuid5


class StableIdAllocator:
    _prefixes = {
        "institution": "inst",
        "brand": "brand",
        "asset": "asset",
        "relationship": "rel",
    }

    def allocate(self, kind: str, identity_key: str) -> str:
        prefix = self._prefixes[kind]
        normalized = identity_key.strip().casefold()
        value = uuid5(NAMESPACE_URL, f"financial-registry:{kind}:{normalized}").hex
        return f"{prefix}_{value}"
```

```python
# global-financial-registry/src/financial_registry/domain.py
from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, ConfigDict, Field


class RightsStatus(str, Enum):
    REDISTRIBUTABLE = "redistributable"
    LICENSED = "licensed"
    SOURCE_LINK_ONLY = "source_link_only"
    UNKNOWN = "unknown"
    REMOVED = "removed"


class ReviewStatus(str, Enum):
    CANDIDATE = "candidate"
    NEEDS_REVIEW = "needs_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"
    REMOVED = "removed"


class Identifier(BaseModel):
    model_config = ConfigDict(extra="forbid")
    owner_id: str
    type: str
    value: str
    country_code: str | None = None
    source_id: str
    valid_from: str | None = None
    valid_to: str | None = None
    confidence: float = Field(ge=0, le=1, default=1)


class Asset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    variant: str
    format: str
    source_id: str
    source_uri: str
    rights_status: RightsStatus
    review_status: ReviewStatus
    sha256: str | None = None
    binary_path: str | None = None
    staging_path: str | None = None
    license_name: str | None = None
    license_url: str | None = None
    permission_reference: str | None = None
    territories: list[str] = Field(default_factory=list)
    expires_at: str | None = None


class InstitutionStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    DISSOLVED = "dissolved"
    UNKNOWN = "unknown"


class RelationType(str, Enum):
    BRAND_OF = "brand_of"
    SUBSIDIARY_OF = "subsidiary_of"
    BRANCH_OF = "branch_of"
    SUCCESSOR_OF = "successor_of"
    PREVIOUS_BRAND_OF = "previous_brand_of"
    OPERATES_IN = "operates_in"


class SourceType(str, Enum):
    REGULATOR = "regulator"
    GLEIF = "gleif"
    BIC = "bic"
    OFFICIAL_DOMAIN = "official_domain"
    OPEN_FINANCE = "open_finance"
    REPOSITORY = "repository"
    SUBMISSION = "submission"
    COMMERCIAL_PROVIDER = "commercial_provider"


class TrustTier(str, Enum):
    AUTHORITATIVE = "authoritative"
    OFFICIAL = "official"
    APPROVED = "approved"
    SUBMITTED = "submitted"
    COMMERCIAL = "commercial"


class Institution(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    legal_name: str
    short_name: str | None = None
    country_code: str
    jurisdictions: list[str] = Field(default_factory=list)
    status: InstitutionStatus = InstitutionStatus.UNKNOWN
    source_ids: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    identifiers: list[Identifier] = Field(default_factory=list)


class Brand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    display_name: str
    owner_id: str
    country_codes: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    status: InstitutionStatus = InstitutionStatus.UNKNOWN


class Relationship(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    relation_type: RelationType
    from_id: str
    to_id: str
    source_id: str
    confidence: float = Field(ge=0, le=1, default=1)


class AssetCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str | None = None
    owner_id: str
    variant: str
    source_id: str
    source_uri: str
    rights_status: RightsStatus
    staging_path: str | None = None
    license_name: str | None = None
    license_url: str | None = None
    permission_reference: str | None = None
    territories: list[str] = Field(default_factory=list)
    expires_at: str | None = None


class SourceDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    publisher: str
    jurisdiction: str
    source_type: SourceType
    url: str
    terms_url: str | None = None
    trust_tier: TrustTier
    check_frequency: str


class SourceRun(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: str
    started_at: str
    finished_at: str | None = None
    status: str
    snapshot_path: str | None = None
    candidate_count: int = Field(ge=0, default=0)
    warnings: list[str] = Field(default_factory=list)


class CandidateRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: str
    source_record_id: str
    legal_name: str
    country_code: str
    identifiers: list[Identifier] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    brand_name: str | None = None
    source_uri: str | None = None


class ReleaseManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    release_version: str
    schema_version: str
    generated_at: str
    lifecycle_status: str
    files: list[str] = Field(default_factory=list)
    checksums: dict[str, str] = Field(default_factory=dict)


class RegistryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    institutions: list[Institution] = Field(default_factory=list)
    brands: list[Brand] = Field(default_factory=list)
    identifiers: list[Identifier] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)
    assets: list[Asset] = Field(default_factory=list)
    sources: list[SourceDefinition] = Field(default_factory=list)
    asset_root: str | None = None
```

Define the remaining enums as `str, Enum` classes (not `StrEnum`, so Python 3.10 remains supported): `InstitutionStatus` (`active`, `inactive`, `dissolved`, `unknown`), `RelationType` (`brand_of`, `subsidiary_of`, `branch_of`, `successor_of`, `previous_brand_of`, `operates_in`), `SourceType` (`regulator`, `gleif`, `bic`, `official_domain`, `open_finance`, `repository`, `submission`, `commercial_provider`), and `TrustTier` (`authoritative`, `official`, `approved`, `submitted`, `commercial`).

Implement the models in dependency order so the interfaces used by later tasks are concrete rather than forward references:

- `Identifier`: `owner_id`, `type`, `value`, optional `country_code`, `source_id`, validity dates, and confidence.
- `Institution`: `id`, `legal_name`, optional `short_name`, `country_code`, `jurisdictions`, `status`, `source_ids`, `domains`, and embedded `identifiers` used by the resolver tests.
- `Brand`: `id`, `display_name`, `owner_id`, `country_codes`, `domains`, `source_ids`, and `status`.
- `Relationship`: `id`, `relation_type`, `from_id`, `to_id`, `source_id`, and confidence.
- `AssetCandidate`: optional `id`, `owner_id`, `variant`, `source_id`, `source_uri`, `rights_status`, optional rights metadata, and optional `staging_path`.
- `Asset`: the normalized candidate plus `review_status`, `sha256`, `binary_path`, `staging_path`, license/permission metadata, territory limits, and expiry.
- `SourceDefinition`: `id`, `publisher`, `jurisdiction`, `source_type`, `url`, optional `terms_url`, `trust_tier`, and `check_frequency`.
- `SourceRun`: `source_id`, `started_at`, `finished_at`, `status`, optional snapshot reference, candidate count, and warnings.
- `CandidateRecord`: `source_id`, `source_record_id`, `legal_name`, `country_code`, optional identifiers, domains, brand data, and source URI metadata.
- `ReleaseManifest`: `release_version`, `schema_version`, `generated_at`, `lifecycle_status`, file list, and checksums.
- `RegistryInput`: the lists shown above plus optional `asset_root`; all list fields default to empty lists for fixture loading.

Create `global-financial-registry/tests/conftest.py` in this task with a `demo_registry` fixture. It must create a temporary `asset_root`, write one tiny valid SVG under `logos/demo.svg`, and return a `RegistryInput` containing one institution, one brand, one identifier, one `brand_of` relationship, one approved redistributable `Asset` whose `staging_path` is `logos/demo.svg`, and one authoritative source. The fixture is shared by the release tests and must not depend on package fixture files.

The Pydantic models must enforce:

- ISO-like two-letter uppercase country/territory codes;
- non-empty names and source IDs;
- 64-character lowercase hexadecimal SHA-256 values when present;
- `source_link_only` assets have no `binary_path` or `sha256`;
- binary assets have `source_uri`, `binary_path`, checksum, and a rights state of `redistributable` or `licensed`;
- relationship endpoints and identifier owners are non-empty IDs;
- release records contain a semantic version and an explicit lifecycle status.

- [ ] **Step 4: Run focused and package tests**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_domain.py tests/test_ids.py tests/test_package.py -q
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add global-financial-registry/src/financial_registry/domain.py \
  global-financial-registry/src/financial_registry/ids.py \
  global-financial-registry/tests/conftest.py \
  global-financial-registry/tests/test_domain.py \
  global-financial-registry/tests/test_ids.py
git commit -m "feat(registry-core): define canonical domain models"
```

### Task 3: Add source definitions, connector contracts, and snapshots

**Files:**
- Create: `global-financial-registry/src/financial_registry/sources.py`
- Create: `global-financial-registry/src/financial_registry/snapshots.py`
- Create: `global-financial-registry/tests/test_sources.py`
- Create: `global-financial-registry/tests/test_snapshots.py`

**Interfaces:**
- Consumes `SourceDefinition`, `SourceRun`, and `CandidateRecord` from `domain.py`.
- Produces `RawSnapshot`, `Connector` protocol, and `ConnectorRunResult`.
- Produces `FilesystemSnapshotStore.put(source_id, retrieved_at, body) -> RawSnapshot` and `.read(snapshot) -> bytes`.
- Produces `ConnectorRunResult` with status, candidate count, snapshot reference, and warnings.

- [ ] **Step 1: Write failing source and snapshot tests**

```python
# global-financial-registry/tests/test_snapshots.py
from datetime import datetime, timezone

from financial_registry.snapshots import FilesystemSnapshotStore


def test_snapshot_store_is_content_addressed(tmp_path):
    store = FilesystemSnapshotStore(tmp_path)
    retrieved_at = datetime(2026, 8, 26, tzinfo=timezone.utc)
    first = store.put("src_demo", retrieved_at, b"same payload")
    second = store.put("src_demo", retrieved_at, b"same payload")
    assert first.sha256 == second.sha256
    assert first.path == second.path
    assert store.read(first) == b"same payload"
```

```python
# global-financial-registry/tests/test_sources.py
from financial_registry.domain import SourceDefinition, SourceType, TrustTier


def test_source_definition_carries_terms_and_schedule():
    source = SourceDefinition(
        id="src_regulator_demo",
        publisher="Demo Regulator",
        jurisdiction="XX",
        source_type=SourceType.REGULATOR,
        url="https://regulator.example.test/register",
        terms_url="https://regulator.example.test/terms",
        trust_tier=TrustTier.AUTHORITATIVE,
        check_frequency="daily",
    )
    assert source.trust_tier.value == "authoritative"
    assert source.check_frequency == "daily"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_sources.py tests/test_snapshots.py -q
```

Expected: FAIL because source models and snapshot storage do not exist.

- [ ] **Step 3: Implement source contracts and content-addressed storage**

Use `SourceType` values `regulator`, `gleif`, `bic`, `official_domain`, `open_finance`, `repository`, `submission`, and `commercial_provider`. Use `TrustTier` values `authoritative`, `official`, `approved`, `submitted`, and `commercial`.

```python
# global-financial-registry/src/financial_registry/snapshots.py
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
from pathlib import Path


@dataclass(frozen=True)
class RawSnapshot:
    source_id: str
    retrieved_at: datetime
    sha256: str
    path: str


class FilesystemSnapshotStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)

    def put(self, source_id: str, retrieved_at: datetime, body: bytes) -> RawSnapshot:
        digest = sha256(body).hexdigest()
        path = self.root / source_id / f"{digest}.bin"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(body)
        return RawSnapshot(source_id, retrieved_at, digest, str(path))

    def read(self, snapshot: RawSnapshot) -> bytes:
        return Path(snapshot.path).read_bytes()
```

The connector protocol must expose `definition`, `fetch()`, and `normalize(snapshot)` methods. `fetch()` returns a `RawSnapshot`; `normalize()` returns candidate records with source references and never mutates canonical records directly. A failed run returns warnings and retains the prior successful snapshot reference.

```python
# global-financial-registry/src/financial_registry/sources.py
from dataclasses import dataclass
from typing import Protocol

from .domain import CandidateRecord, SourceDefinition
from .snapshots import RawSnapshot


@dataclass(frozen=True)
class ConnectorRunResult:
    status: str
    candidate_count: int
    snapshot: RawSnapshot | None
    warnings: list[str]


class Connector(Protocol):
    definition: SourceDefinition

    def fetch(self) -> RawSnapshot: ...

    def normalize(self, snapshot: RawSnapshot) -> list[CandidateRecord]: ...
```

Add a runner helper that catches connector failures, returns `ConnectorRunResult(status="failed", snapshot=previous_snapshot, warnings=[...])`, and never replaces a last verified snapshot with an empty failure. Successful runs return `status="succeeded"` and the new snapshot reference.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_sources.py tests/test_snapshots.py -q
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add global-financial-registry/src/financial_registry/sources.py \
  global-financial-registry/src/financial_registry/snapshots.py \
  global-financial-registry/tests/test_sources.py \
  global-financial-registry/tests/test_snapshots.py
git commit -m "feat(registry-core): add source and snapshot contracts"
```

### Task 4: Implement normalization and deterministic entity resolution

**Files:**
- Create: `global-financial-registry/src/financial_registry/normalize.py`
- Create: `global-financial-registry/src/financial_registry/resolver.py`
- Create: `global-financial-registry/tests/test_normalize.py`
- Create: `global-financial-registry/tests/test_resolver.py`

**Interfaces:**
- Produces `normalize_name(value) -> str`, `normalize_domain(value) -> str`, and `normalize_identifier(type, value) -> str`.
- Produces `EntityResolver.resolve(candidate, existing) -> Resolution`.
- `Resolution` has `action` (`match`, `create`, `review`), `matched_id`, `match_method`, `confidence`, and `reasons`.

- [ ] **Step 1: Write failing normalization and resolution tests**

```python
# global-financial-registry/tests/test_normalize.py
from financial_registry.normalize import normalize_domain, normalize_name, normalize_identifier


def test_name_normalization_collapses_case_spacing_and_punctuation():
    assert normalize_name("  Banco  Example, S.A. ") == "banco example sa"


def test_domain_normalization_removes_scheme_and_default_path():
    assert normalize_domain("https://WWW.Example.com/") == "example.com"


def test_identifier_normalization_removes_bic_spacing():
    assert normalize_identifier("bic", " abcd gb 2l ") == "ABC DGB2L".replace(" ", "")
```

```python
# global-financial-registry/tests/test_resolver.py
from financial_registry.domain import CandidateRecord, Identifier, Institution
from financial_registry.resolver import EntityResolver


def test_exact_identifier_matches_without_review():
    existing = [
        Institution(id="inst_demo", legal_name="Demo Bank", country_code="GB")
    ]
    existing[0].identifiers = [
        Identifier(owner_id="inst_demo", type="bic", value="DEMO GB2L", source_id="src")
    ]
    candidate = CandidateRecord(
        source_id="src_new",
        source_record_id="row-1",
        legal_name="Different Display Name",
        country_code="GB",
        identifiers=[
            Identifier(
                owner_id="inst_candidate",
                type="bic",
                value="DEMOGB2L",
                source_id="src_new",
            )
        ],
    )
    result = EntityResolver().resolve(candidate, existing)
    assert result.action == "match"
    assert result.matched_id == "inst_demo"
    assert result.match_method == "exact_identifier"


def test_fuzzy_name_match_creates_review_not_merge():
    existing = [Institution(id="inst_demo", legal_name="Demo Bank", country_code="GB")]
    candidate = CandidateRecord(
        source_id="src_new",
        source_record_id="row-2",
        legal_name="Demo Banking Group",
        country_code="GB",
    )
    result = EntityResolver().resolve(candidate, existing)
    assert result.action == "review"
    assert result.matched_id == "inst_demo"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_normalize.py tests/test_resolver.py -q
```

Expected: FAIL because normalization, candidate records, and resolution are not implemented.

- [ ] **Step 3: Implement normalization and resolution**

Normalization must be deterministic and locale-safe: Unicode NFKC, casefold, whitespace collapse, punctuation removal for names, IDNA lowercasing for domains, and type-specific trimming for BIC/LEI/national codes. Preserve the original source value in the candidate; only normalized values participate in matching.

The resolver must apply this exact order:

```python
if exact_identifier_match:
    return Resolution("match", matched_id, "exact_identifier", 1.0, reasons)
if exact_verified_domain_match:
    return Resolution("match", matched_id, "verified_domain", 0.98, reasons)
if exact_name_and_country_match:
    return Resolution("review", matched_id, "name_country", 0.90, reasons)
if fuzzy_name_candidate:
    return Resolution("review", candidate_id, "fuzzy_name", score, reasons)
return Resolution("create", None, "no_match", 0.0, reasons)
```

Never call a fuzzy result `match`, never overwrite an existing record from a candidate, and include all competing candidates in the review reasons.

- [ ] **Step 4: Run focused and regression tests**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_normalize.py tests/test_resolver.py tests/test_domain.py -q
```

Expected: all focused tests pass, including the exact-match and fuzzy-review cases.

- [ ] **Step 5: Commit**

```bash
git add global-financial-registry/src/financial_registry/normalize.py \
  global-financial-registry/src/financial_registry/resolver.py \
  global-financial-registry/tests/test_normalize.py \
  global-financial-registry/tests/test_resolver.py
git commit -m "feat(registry-core): add deterministic entity resolution"
```

### Task 5: Add URL policy, SVG safety, asset hashing, and rights gates

**Files:**
- Create: `global-financial-registry/src/financial_registry/fetch_policy.py`
- Create: `global-financial-registry/src/financial_registry/assets.py`
- Create: `global-financial-registry/tests/test_fetch_policy.py`
- Create: `global-financial-registry/tests/test_assets.py`

**Interfaces:**
- Produces `validate_source_url(url, resolver=None) -> str`; redirect handling belongs to the fetcher.
- Produces `AssetFetcher` protocol with `fetch(url) -> FetchedAsset`.
- Produces `AssetProcessor.process(candidate: AssetCandidate, fetcher: AssetFetcher) -> ProcessedAsset`.
- Produces `AssetPolicyError` for unsafe URLs, oversized bodies, invalid content, or prohibited rights states.

- [ ] **Step 1: Write failing security and asset tests**

```python
# global-financial-registry/tests/test_fetch_policy.py
import pytest

from financial_registry.fetch_policy import UnsafeSourceUrl, validate_source_url


def test_source_url_requires_https():
    with pytest.raises(UnsafeSourceUrl):
        validate_source_url("http://example.test/logo.svg")


def test_source_url_rejects_loopback_resolution():
    with pytest.raises(UnsafeSourceUrl):
        validate_source_url("https://localhost/logo.svg", resolver=lambda host: ["127.0.0.1"])
```

```python
# global-financial-registry/tests/test_assets.py
from financial_registry.assets import AssetProcessor, FetchedAsset
from financial_registry.domain import AssetCandidate, RightsStatus


class FakeFetcher:
    def __init__(self, body: bytes, content_type: str = "image/svg+xml"):
        self.body = body
        self.content_type = content_type

    def fetch(self, url: str) -> FetchedAsset:
        return FetchedAsset(url=url, final_url=url, body=self.body, content_type=self.content_type)


def test_svg_is_sanitized_and_hashed():
    body = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="4" height="4"/></svg>'
    candidate = AssetCandidate(
        owner_id="brand_demo",
        variant="primary",
        source_id="src_demo",
        source_uri="https://example.test/logo.svg",
        rights_status=RightsStatus.REDISTRIBUTABLE,
    )
    result = AssetProcessor(url_validator=lambda url: url).process(candidate, FakeFetcher(body))
    assert b"script" not in result.sanitized_bytes
    assert len(result.sha256) == 64


def test_source_link_only_asset_has_no_public_binary():
    body = b"unused"
    candidate = AssetCandidate(
        owner_id="brand_demo",
        variant="primary",
        source_id="src_demo",
        source_uri="https://example.test/logo.svg",
        rights_status=RightsStatus.SOURCE_LINK_ONLY,
    )
    result = AssetProcessor(url_validator=lambda url: url).process(candidate, FakeFetcher(body))
    assert result.public_binary is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_fetch_policy.py tests/test_assets.py -q
```

Expected: FAIL because URL policy and asset processing are not implemented.

- [ ] **Step 3: Implement the safe asset processor**

The URL policy must reject non-HTTPS schemes, empty hosts, localhost, loopback, link-local, private, multicast, and unspecified IP addresses. Inject DNS resolution so tests can cover DNS-rebinding behavior. Follow at most three redirects, revalidate the destination after every redirect, reject bodies over 5 MiB, reject SVGs over 1 MiB or with more than 10,000 XML nodes, and reject raster dimensions above 4096×4096.

Sanitize SVG with `defusedxml`, remove scripts/event attributes/external references/embedded objects, then rasterize the sanitized bytes with CairoSVG using a `url_fetcher` that always raises. Normalize raster output with Pillow, compute SHA-256 and ImageHash values, and return the normalized public bytes only for `redistributable` or `licensed` assets. Preserve the original body in the private processing result, never in the public release bundle.

```python
# global-financial-registry/src/financial_registry/fetch_policy.py
from ipaddress import ip_address
from urllib.parse import urlparse


class UnsafeSourceUrl(ValueError):
    pass


def validate_source_url(url: str, resolver=None) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise UnsafeSourceUrl("source URL must use HTTPS and include a hostname")
    resolver = resolver or default_dns_resolver
    addresses = [ip_address(value) for value in resolver(parsed.hostname)]
    if any(value.is_private or value.is_loopback or value.is_link_local or value.is_multicast or value.is_unspecified for value in addresses):
        raise UnsafeSourceUrl("source URL resolves to a non-public address")
    return url
```

Implement `default_dns_resolver(hostname)` with `socket.getaddrinfo` and deduplicate returned addresses. Keep the resolver injectable so all security tests use deterministic addresses and do not contact live sites.

Define the asset interfaces explicitly in `assets.py`:

```python
from dataclasses import dataclass
from typing import Protocol


class AssetPolicyError(ValueError):
    pass


@dataclass(frozen=True)
class FetchedAsset:
    url: str
    final_url: str
    body: bytes
    content_type: str


class AssetFetcher(Protocol):
    def fetch(self, url: str) -> FetchedAsset: ...


@dataclass(frozen=True)
class ProcessedAsset:
    sanitized_bytes: bytes
    sha256: str
    imagehash: str | None
    public_binary: bytes | None
```

`AssetProcessor.process` must call the fetcher only after URL validation, enforce the byte/XML/dimension limits, and return `public_binary=None` for `source_link_only`, `unknown`, or `removed` rights states. For binary-permitted states it returns deterministic sanitized bytes and hashes; the release builder is responsible for assigning the final stable asset ID and public path.

Give `AssetProcessor` an injectable constructor argument `url_validator: Callable[[str], str] = validate_source_url`. Tests that use a fake fetcher must pass `url_validator=lambda url: url`; live DNS is never part of the test suite.

Treat `Asset.staging_path` as a private path containing the already-sanitized bytes produced by `AssetProcessor`; raw fetched bodies stay outside the release input. The fixture connector uses checked-in, pre-sanitized SVGs, and a future live connector will write `ProcessedAsset.public_binary` to its staging path before creating the canonical `Asset`.

- [ ] **Step 4: Run focused and security regression tests**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_fetch_policy.py tests/test_assets.py -q
```

Expected: all focused tests pass, including script removal, source-link-only suppression, and private-address rejection.

- [ ] **Step 5: Commit**

```bash
git add global-financial-registry/src/financial_registry/fetch_policy.py \
  global-financial-registry/src/financial_registry/assets.py \
  global-financial-registry/tests/test_fetch_policy.py \
  global-financial-registry/tests/test_assets.py
git commit -m "feat(registry-core): add safe asset and rights pipeline"
```

### Task 6: Build deterministic release validation and bundle writing

**Files:**
- Create: `global-financial-registry/src/financial_registry/release.py`
- Create: `global-financial-registry/tests/test_release.py`

**Interfaces:**
- Produces `ReleaseBuilder.validate(input: RegistryInput) -> list[ValidationIssue]`.
- Produces `ReleaseBuilder.build(input, version, generated_at, output_dir) -> ReleaseManifest`, resolving each `Asset.staging_path` relative to `RegistryInput.asset_root`.
- Produces deterministic `institutions.json`, `brands.json`, `identifiers.json`, `relationships.json`, `assets-manifest.json`, `sources.json`, `checksums.txt`, and `schema-version.json`.
- Produces release lifecycle values `draft`, `validated`, `published`, `superseded`, and `withdrawn`.

- [ ] **Step 1: Write failing release tests**

```python
# global-financial-registry/tests/test_release.py
from datetime import datetime, timezone

import pytest

from financial_registry.release import ReleaseBuilder, ReleaseValidationError
from financial_registry.domain import RegistryInput, RightsStatus


def test_release_is_byte_for_byte_reproducible(tmp_path, demo_registry: RegistryInput):
    generated_at = datetime(2026, 8, 26, tzinfo=timezone.utc)
    first_dir = tmp_path / "first"
    second_dir = tmp_path / "second"
    ReleaseBuilder().build(demo_registry, "0.1.0", generated_at, first_dir)
    ReleaseBuilder().build(demo_registry, "0.1.0", generated_at, second_dir)
    first = sorted(path.relative_to(first_dir) for path in first_dir.rglob("*") if path.is_file())
    second = sorted(path.relative_to(second_dir) for path in second_dir.rglob("*") if path.is_file())
    assert first == second
    for relative in first:
        assert (first_dir / relative).read_bytes() == (second_dir / relative).read_bytes()


def test_release_rejects_binary_with_unknown_rights(demo_registry: RegistryInput):
    demo_registry.assets[0].rights_status = RightsStatus.UNKNOWN
    with pytest.raises(ReleaseValidationError, match="rights"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            "/tmp/unused-release",
        )
```

The `demo_registry` fixture is created in `tests/conftest.py` during this task and uses a temporary `asset_root` plus a fixture SVG. The release builder copies only sanitized bytes into `assets/`; `staging_path` is never emitted in the public manifest.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_release.py -q
```

Expected: FAIL because the release builder and validation rules do not exist.

- [ ] **Step 3: Implement validation and deterministic writing**

Validate these invariants before writing anything:

- IDs are unique within each entity type;
- every identifier, relationship, asset owner, and source reference resolves;
- every published record has a source reference;
- every binary asset has approved review state, permitted rights, source URI, 64-character SHA-256, and a matching file body;
- `source_link_only`, `unknown`, and `removed` assets have no public binary path;
- no fuzzy resolution result is marked as an automatic match;
- all arrays are sorted by stable ID or the documented stable key;
- the same input and explicit `generated_at` produce identical bytes.

Write JSON with `json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\\n"`. Write `checksums.txt` using sorted relative paths and lowercase SHA-256 values. Write the release manifest only after all files and checksums validate. The API read model is not created in this plan; the release bundle is the only publication output.

- [ ] **Step 4: Run release and full core tests**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_release.py tests/test_domain.py tests/test_assets.py -q
```

Expected: all release invariants and deterministic-output tests pass.

- [ ] **Step 5: Commit**

```bash
git add global-financial-registry/src/financial_registry/release.py \
  global-financial-registry/tests/test_release.py
git commit -m "feat(registry-core): build reproducible release bundles"
```

### Task 7: Add fixture connector, fixture data, and CLI commands

**Files:**
- Create: `global-financial-registry/src/financial_registry/connectors/__init__.py`
- Create: `global-financial-registry/src/financial_registry/connectors/fixture.py`
- Modify: `global-financial-registry/src/financial_registry/cli.py`
- Create: `global-financial-registry/data/fixtures/source-definition.json`
- Create: `global-financial-registry/data/fixtures/candidates.json`
- Create: `global-financial-registry/data/fixtures/logos/example-bank.svg`
- Create: `global-financial-registry/data/fixtures/logos/example-wallet.svg`
- Create: `global-financial-registry/tests/test_cli.py`
- Create: `global-financial-registry/tests/test_end_to_end.py`

**Interfaces:**
- Produces `FixtureConnector.fetch()` and `.normalize()` using only local fixture files.
- CLI commands `financial-registry validate INPUT` and `financial-registry release-build INPUT OUTPUT --version VERSION --generated-at ISO_TIMESTAMP`.
- Produces an end-to-end release bundle under a caller-specified output directory.

- [ ] **Step 1: Write failing CLI and end-to-end tests**

```python
# global-financial-registry/tests/test_cli.py
from typer.testing import CliRunner

from financial_registry.cli import app


def test_validate_fixture_succeeds():
    result = CliRunner().invoke(app, ["validate", "data/fixtures/candidates.json"])
    assert result.exit_code == 0
    assert "valid" in result.stdout.lower()


def test_release_build_writes_manifest(tmp_path):
    result = CliRunner().invoke(
        app,
        [
            "release-build",
            "data/fixtures/candidates.json",
            str(tmp_path),
            "--version",
            "0.1.0",
            "--generated-at",
            "2026-08-26T00:00:00+00:00",
        ],
    )
    assert result.exit_code == 0
    assert (tmp_path / "schema-version.json").exists()
    assert (tmp_path / "checksums.txt").exists()
```

```python
# global-financial-registry/tests/test_end_to_end.py
import json
from datetime import datetime, timezone

from financial_registry.connectors.fixture import FixtureConnector
from financial_registry.release import ReleaseBuilder


def test_fixture_connector_produces_publishable_release(tmp_path):
    registry = FixtureConnector("data/fixtures").load_registry()
    ReleaseBuilder().build(
        registry,
        "0.1.0",
        datetime(2026, 8, 26, tzinfo=timezone.utc),
        tmp_path,
    )
    manifest = json.loads((tmp_path / "schema-version.json").read_text())
    assert manifest["release_version"] == "0.1.0"
    assert (tmp_path / "assets-manifest.json").exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_cli.py tests/test_end_to_end.py -q
```

Expected: FAIL because the fixture connector, fixture files, and real CLI behavior do not exist.

- [ ] **Step 3: Add deterministic fixture data and implement the commands**

The fixture must contain:

- `inst_example_bank`, an active commercial bank in `GB` with one BIC and one domain identifier;
- `brand_example_bank`, related through `brand_of`;
- `brand_example_wallet`, represented by a `source_link_only` asset so the release proves metadata-only handling;
- one `redistributable` SVG asset with a stable source URI and SHA-256;
- source definitions and source references for every record.

`candidates.json` stores asset `staging_path` values relative to `data/fixtures/logos`; `FixtureConnector.load_registry()` sets `RegistryInput.asset_root` to that directory. The CLI resolves a JSON input's `asset_root` relative to the input file's parent when the path is relative.

Implement the CLI with Typer. `validate` loads JSON into `RegistryInput`, runs `ReleaseBuilder.validate`, prints `valid: <path>` on success, and exits 1 with one issue per line on failure. `release-build` parses the explicit timestamp, calls the builder, prints the release version and output path, and exits 1 without leaving a partial release directory when validation fails.

```python
# global-financial-registry/src/financial_registry/cli.py
from datetime import datetime
from pathlib import Path
import json

import typer

from .domain import RegistryInput
from .release import ReleaseBuilder, ReleaseValidationError

app = typer.Typer(no_args_is_help=True)


def _load(path: str) -> RegistryInput:
    input_path = Path(path).resolve()
    registry = RegistryInput.model_validate(json.loads(input_path.read_text(encoding="utf-8")))
    if registry.asset_root and not Path(registry.asset_root).is_absolute():
        registry = registry.model_copy(
            update={"asset_root": str((input_path.parent / registry.asset_root).resolve())}
        )
    return registry


@app.command("validate")
def validate(input_path: str = typer.Argument(...)) -> None:
    try:
        registry = _load(input_path)
        issues = ReleaseBuilder().validate(registry)
    except Exception as exc:
        typer.echo(f"invalid: {exc}", err=True)
        raise typer.Exit(code=1) from exc
    if issues:
        for issue in issues:
            typer.echo(f"invalid: {issue}", err=True)
        raise typer.Exit(code=1)
    typer.echo(f"valid: {input_path}")


@app.command("release-build")
def release_build(
    input_path: str = typer.Argument(...),
    output_dir: str = typer.Argument(...),
    version: str = typer.Option(..., "--version"),
    generated_at: str = typer.Option(..., "--generated-at"),
) -> None:
    try:
        registry = _load(input_path)
        timestamp = datetime.fromisoformat(generated_at)
        manifest = ReleaseBuilder().build(registry, version, timestamp, Path(output_dir))
    except (ValueError, ReleaseValidationError, OSError) as exc:
        typer.echo(f"release failed: {exc}", err=True)
        raise typer.Exit(code=1) from exc
    typer.echo(f"release {manifest.release_version}: {output_dir}")


def main() -> None:
    app()
```

- [ ] **Step 4: Run focused, end-to-end, and full core tests**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_cli.py tests/test_end_to_end.py -q
python -m pytest -q
```

Expected: all tests pass; the fixture release contains no public binary for the source-link-only wallet asset.

- [ ] **Step 5: Commit**

```bash
git add global-financial-registry/src/financial_registry \
  global-financial-registry/data/fixtures \
  global-financial-registry/tests
git commit -m "feat(registry-core): add fixture release workflow"
```

### Task 8: Document the release contract and complete verification

**Files:**
- Modify: `global-financial-registry/README.md`
- Create: `global-financial-registry/tests/test_release_contract.py`

**Interfaces:**
- Documents the canonical JSON shape, rights states, release lifecycle, deterministic-build command, and source-link-only behavior.
- Adds a contract test that verifies the fixture release contains the required top-level files and no prohibited binary assets.

- [ ] **Step 1: Write the failing release-contract test**

```python
# global-financial-registry/tests/test_release_contract.py
import json
from datetime import datetime, timezone

from financial_registry.connectors.fixture import FixtureConnector
from financial_registry.release import ReleaseBuilder


def test_release_contract_has_required_files_and_rights_gate(tmp_path):
    registry = FixtureConnector("data/fixtures").load_registry()
    ReleaseBuilder().build(
        registry,
        "0.1.0",
        datetime(2026, 8, 26, tzinfo=timezone.utc),
        tmp_path,
    )
    required = {
        "institutions.json",
        "brands.json",
        "identifiers.json",
        "relationships.json",
        "assets-manifest.json",
        "sources.json",
        "checksums.txt",
        "schema-version.json",
    }
    assert required <= {path.name for path in tmp_path.iterdir()}
    assets = json.loads((tmp_path / "assets-manifest.json").read_text())
    assert all(asset["rights_status"] in {"redistributable", "licensed", "source_link_only"} for asset in assets)
    assert all(asset.get("binary_path") is not None for asset in assets if asset["rights_status"] in {"redistributable", "licensed"})
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_release_contract.py -q
```

Expected: FAIL until the release bundle and fixture workflow satisfy the complete contract.

- [ ] **Step 3: Update the README with the exact release contract**

Document these commands and guarantees:

```bash
cd global-financial-registry
pip install -e '.[dev]'
python -m pytest -q
financial-registry validate data/fixtures/candidates.json
financial-registry release-build data/fixtures/candidates.json dist/release \
  --version 0.1.0 \
  --generated-at 2026-08-26T00:00:00+00:00
```

State explicitly that the release bundle is the source of truth; binary assets are emitted only for `redistributable` and `licensed` rights states; `source_link_only` emits metadata and a source URI without a binary; and this package does not perform live regulator scraping in this plan.

- [ ] **Step 4: Run final verification**

Run:

```bash
cd global-financial-registry
python -m pytest -q
python -m pytest --cov=financial_registry --cov-report=term-missing -q
python -m compileall -q src
git diff --check
```

Expected: all tests pass, compilation succeeds, and `git diff --check` reports no whitespace errors. Run the existing root suite separately to verify no Relay behavior changed:

```bash
python -m pytest tests/ -q
```

- [ ] **Step 5: Commit**

```bash
git add global-financial-registry/README.md \
  global-financial-registry/tests/test_release_contract.py
git commit -m "docs(registry-core): document release contract"
```

## Plan self-review

- **Spec coverage:** Tasks 1–2 cover the standalone package, canonical models, IDs, taxonomy, and rights fields. Task 3 covers source definitions and snapshots. Task 4 covers deterministic resolution and fuzzy-match review behavior. Task 5 covers URL safety, SVG sanitization, hashes, variants, and rights gates. Task 6 covers immutable lifecycle-ready release bundles, checksums, and reproducibility. Tasks 7–8 cover fixture ingestion, CLI workflow, contract verification, and documentation. Hosted API/CDN, public catalog, governance UI, packages, billing, and live country connectors are intentionally excluded and belong to the later plans defined by the spec.
- **Placeholder scan:** The plan contains no `TBD`, `TODO`, “implement later,” or unspecified test steps.
- **Type consistency:** `RegistryInput`, `AssetCandidate`, `SourceDefinition`, `ReleaseBuilder`, `FixtureConnector`, `RightsStatus`, and `ReleaseManifest` are named consistently across tasks. The implementation must add any model field referenced by a later test before running that task’s focused suite.
- **Safety:** The plan never fetches live websites in tests, never emits restricted binaries, preserves source failures, and keeps the existing Relay application untouched.

## Engineering Review Findings

**Review date:** 2026-08-26
**Verdict:** NOT CLEARED for implementation yet. The package boundary and task sequencing are sound, but the P1 findings below can produce incorrect identity merges, non-reproducible releases, unsafe asset fetches, or legally over-broad binary publication.

### Scope and acceptance criteria

- **S1 (P1) The plan does not define a complete Plan 1 acceptance contract.** The fixture release proves that a small happy-path dataset can be serialized, but it does not prove the core guarantees for conflicting sources, stale-source retention, rebrands, rights expiry, or withdrawn releases. Add a release acceptance matrix with one passing and one failing fixture for every global constraint in lines 13-24.
- **S2 (P2) “Global” is not measurable in this plan.** That is acceptable for a fixture-only foundation, but the README and release manifest should state that coverage is intentionally not a launch claim and expose counts for institutions, brands, identifiers, unresolved candidates, stale sources, and rights gaps.

### Architecture and data flow

- **1A (P1) The canonical models are narrower than the approved design.** `Institution` at lines 433-444 lacks controlled categories, normalized name, regulator identifier/reference, operating markets, effective dates, and explicit evidence/confidence fields. `Brand` at lines 446-455 lacks aliases, localized names, historical display periods, and multi-institution ownership. `Relationship` at lines 457-464 lacks `valid_from` and `valid_to`. `Asset` at lines 378-395 lacks perceptual hash, dimensions, attribution, license note, verification/reviewer fields, and review timestamps. `ReleaseManifest` at lines 518-525 lacks generation commit, source-run IDs, counts, unresolved matches, stale sources, and provenance coverage. Add these fields now; otherwise Plans 2-4 will require a breaking schema retrofit.
- **1B (P1) Lifecycle enums drift from the approved design.** The plan uses `dissolved` but omits the designed `merged` and `renamed` states, and reuses `InstitutionStatus` for brands. Align the status vocabulary with the spec and add effective intervals so historical entities and rebrands are representable without inventing ad hoc strings.
- **1C (P1) Brand ownership is modeled as singular even though the design permits multiple legal entities.** `Brand.owner_id` cannot represent a consumer brand used by country-specific institutions. Make the canonical relationship graph authoritative for ownership, or replace `owner_id` with an explicit set plus a validation invariant that every owner has a sourced relationship. Do not keep two independently editable ownership representations.
- **1D (P1) Identifiers have two competing canonical representations.** `RegistryInput.identifiers` is a top-level collection, while `Institution.identifiers` is embedded solely for resolver tests (lines 433-444 and 528-536). This will drift and produce ambiguous release output. Choose one source of truth. Recommended: keep identifiers top-level, build a resolver index from them, and remove embedded identifiers from published models.
- **1E (P1) Stable ID allocation has no re-key policy.** UUID5 over an arbitrary `identity_key` (lines 319-338) is deterministic only while that key remains unchanged. The plan does not define how an institution keeps its ID when a source identifier is corrected, a BIC is retired, or a legal entity succeeds another. Add an explicit curated `canonical_key`, alias/re-key records, and tests proving source-key changes do not silently create a second institution.
- **1F (P1) Source precedence and conflict evidence are described in the design but absent from the implementation plan.** `SourceDefinition` and `TrustTier` alone do not implement separate identity-versus-logo precedence, scoped-source exceptions, or retained conflicting evidence. Add a deterministic precedence module, a conflict/review record, and tests for higher-ranked stale data versus lower-ranked current data.
- **1G (P1) Source failure retention is prose, not a complete state transition.** The plan names `ConnectorRunResult` and says a runner preserves `previous_snapshot` (line 715), but no runner interface, persisted last-success pointer, failure state, or test exists. Define `run(connector, previous_snapshot)`, persist `SourceRun`, and test that a failed run leaves the prior verified snapshot and release record intact.
- **1H (P1) The release is not yet the complete reproducibility boundary.** `ReleaseBuilder` reads mutable files through `RegistryInput.asset_root` (line 1050), but the release manifest does not record the canonical input digest, source-run IDs, processor version, generation commit, or staged asset digests. A file can change between validation and build while retaining the same logical input. Make all inputs content-addressed, record their digests, and verify them immediately before atomic publication.
- **1I (P1) Asset URL safety is specified more strongly than the interfaces implement.** `AssetFetcher` is only a protocol (lines 1002-1014); no concrete streaming HTTP implementation models redirect limits, DNS revalidation after each redirect, response-size limits, content-type checks, timeouts, or redirect target policy. Either add a `SafeHttpxAssetFetcher` with injected DNS/transport and adversarial tests, or explicitly move all fetching out of Plan 1 and remove those guarantees from this plan.
- **1J (P1) The staging trust boundary is incomplete.** The plan says `staging_path` contains sanitized bytes (line 1019), but it does not require the release builder to reject symlink escapes, absolute paths, `..` traversal, duplicate output paths, or a staged checksum mismatch. Add path containment and checksum verification before any output is written.
- **1K (P1) Rights gates do not distinguish licensed assets from merely labeled licensed assets.** A `licensed` binary needs a permission reference, applicable license/territory terms, and an unexpired permission. Add validators and release tests for missing permission, expired permission, and territory mismatch. `source_link_only`, `unknown`, and `removed` should also have an explicit metadata-only publication policy.
- **1L (P1) Release lifecycle values are listed but no transitions are designed.** Lines 1048-1052 name `draft`, `validated`, `published`, `superseded`, and `withdrawn`, but there is no transition function, predecessor/supersession reference, withdrawal reason, or test that withdrawn releases disappear from ordinary listings while remaining auditable. Define lifecycle transition rules or narrow Plan 1 to emitting only `validated` bundles.

### Code quality and interface precision

- **2A (P1) Several interfaces are named but not defined.** `Resolution`, `ValidatedUrl`, `ValidationIssue`, `ReleaseValidationError`, and the concrete release/run result shapes are referenced without fields, serialization rules, or error codes. Add exact dataclasses/Pydantic models and make every later test import a defined interface rather than relying on prose.
- **2B (P2) Published model validation is underspecified in code.** The snippets use free-form strings for status, format, variant, dates, semver, and country values, while the prose promises strict validation. Use controlled enums where the taxonomy is closed, timezone-aware datetimes for run/review fields, a semver validator, and explicit ISO country/territory validation. Add lowercase/invalid-date/invalid-semver tests.
- **2C (P2) The file map is incomplete.** Task 1 creates `src/financial_registry/cli.py` but does not list it in the Task 1 file set, and Task 8 creates `tests/test_release_contract.py` but the top-level file map omits it. Add both so the plan can be executed without discovering missing files mid-task.
- **2D (P2) The CLI example catches `Exception` broadly.** That turns programming errors into user-facing “invalid” data errors and makes debugging harder. Catch expected parse/validation exceptions, preserve a traceback for unexpected failures in debug mode, and add stable error codes for automation.
- **2E (P2) The plan does not connect the standalone package to repository quality gates.** The root project already runs Python 3.10-3.12 and Ruff in CI, but the standalone package has no Ruff dependency, package-specific CI job, or matrix command. Add a workflow or CI job that installs `global-financial-registry[dev]`, runs its lint/tests on 3.10-3.12, and keeps root Relay tests separate.

### Test review

- **3A (P1) Security coverage is far below the stated threat model.** Current tests cover only HTTP rejection, one loopback resolver, script removal, and source-link-only suppression. Add tests for redirect-to-private, DNS rebinding, localhost aliases, IPv4-mapped IPv6, oversized streaming bodies, decompression bombs, malformed SVG/XML, external references, event handlers, embedded objects, oversized dimensions, content-type mismatch, and symlink/path traversal.
- **3B (P1) Release tests do not exercise the global invariants.** Add failing fixtures for duplicate IDs, missing source references, dangling relationships/identifiers/assets, unapproved binaries, checksum mismatch, licensed-without-permission, unknown/removed binary paths, expired rights, invalid lifecycle, semver errors, and missing provenance.
- **3C (P1) The deterministic rebuild test is too weak.** It builds the same in-memory object twice. Add a test that permutes input list order, rebuilds from a fresh parsed JSON snapshot, changes file mtimes, and confirms byte-identical output. Also assert that the manifest records the input/source/processor digests.
- **3D (P1) The CLI failure contract is untested.** Add tests that validation failures return exit code 1, emit stable machine-readable diagnostics, and leave no partial output directory. Test invalid timestamps, missing input files, output collisions, and path traversal.
- **3E (P2) Resolver tests do not cover the dangerous cases.** Add competing exact identifiers, exact identifiers pointing to different entities, unverified domains, retired identifiers, aliases/localized names, deterministic fuzzy ties, and the invariant that no fuzzy result becomes a merge.
- **3F (P2) Source-run retention is untested.** Add a fixture connector that succeeds, then fails, and assert the previous snapshot, record, warning, and release input remain available.
- **3G (P2) The contract test does not prove the binary gate.** It checks manifest fields but does not assert that source-link-only assets have no file under `assets/`, that checksums cover every emitted file, or that restricted/removed assets are absent from public paths.
- **3H (P2) No cross-version or property-style tests are planned.** The package promises Python 3.10+, deterministic normalization, and stable IDs. Add the 3.10-3.12 CI matrix and property tests for normalization/idempotence and stable sorting.

### Performance and operations

- **4A (P2) Resolver complexity is unspecified.** A naive scan of every existing institution for every candidate will become quadratic at the planned several-thousand-entity scale and worse during global expansion. Build indexes for normalized identifiers, verified domains, and names; define a fixture-size target and a p95 resolution budget.
- **4B (P2) Asset processing has no resource/concurrency budget.** CairoSVG/Pillow work can consume substantial CPU and memory. Define bounded worker concurrency, per-asset wall-clock/memory limits, and whether processing is serial in the core or delegated to isolated workers in the next plan.
- **4C (P2) Snapshot and release storage behavior is incomplete.** Define retention, maximum snapshot size, atomic writes, fsync/rename semantics, and cleanup of abandoned temporary releases. The current filesystem store is suitable for a demo, but not yet a reliable release source.
- **4D (P3) Operational observability is absent from the first package.** At minimum, emit structured run warnings and counts that later schedulers can consume; document that alerting/metrics are deferred to the operations layer rather than implying the 15-minute target is already implemented.

### Parallelization and execution order

The current linear order is safe but slower than necessary. After Tasks 1-2 land, run three independent lanes in parallel: Lane A source/snapshot contracts (Task 3), Lane B normalization/resolution (Task 4), and Lane C fetch/asset safety (Task 5). Merge those before Task 6 release writing, then run Task 7 fixture/CLI, then Task 8 contract and CI verification. Tasks 3-5 must not concurrently edit `domain.py`; make the domain schema a hard dependency and keep their changes in separate modules.

### What already exists

The repository contains the Relay/SWIFT Routing application, its BIC-keyed `Bank` model, and root CI/test tooling. It does not contain a `global-financial-registry/` package, source connector framework, release builder, or global logo dataset. The existing dirty changes are unrelated and must remain untouched; reusing `app/` models would violate the standalone boundary.

### Failure modes that remain if implementation starts now

1. A source-key correction can create a duplicate institution or silently change a canonical ID.
2. A conflicting exact identifier or unverified domain can produce the wrong automatic match.
3. A restricted, expired, or path-escaped asset can reach a public release because the rights and staging gates are incomplete.
4. A staged file or source snapshot can change between validation and build, making the release non-reproducible.
5. A failed connector can be represented as a warning without a durable last-success pointer, allowing accidental data loss on the next release.

## Implementation Tasks

Synthesized from this review's findings. These tasks should be folded into the plan before implementation begins.

- [ ] **T1 (P1, human: ~1-2 days / CC: ~20 min)** - Canonical schema alignment - expand models and enums to match the approved design, including categories, aliases, geography, lifecycle dates, asset rights/reviewer fields, source-run metadata, and release counts/provenance.
  - Surfaced by: 1A, 1B, 1C, 2B.
  - Files: `global-financial-registry/src/financial_registry/domain.py`, `global-financial-registry/tests/test_domain.py`.
  - Verify: focused domain tests plus serialized fixture snapshots on Python 3.10, 3.11, and 3.12.
- [ ] **T2 (P1, human: ~1 day / CC: ~15 min)** - Canonical identity and identifier ownership - define curated canonical keys, re-key/alias behavior, one identifier source of truth, and multi-owner brand relationships.
  - Surfaced by: 1C, 1D, 1E.
  - Files: `global-financial-registry/src/financial_registry/ids.py`, `domain.py`, `resolver.py`, `tests/test_ids.py`, `tests/test_resolver.py`.
  - Verify: source-key correction, retired identifier, multi-owner brand, and duplicate-prevention tests.
- [ ] **T3 (P1, human: ~1-2 days / CC: ~20 min)** - Source precedence and failure retention - implement deterministic identity/logo precedence, conflict evidence, durable source runs, and last-success preservation.
  - Surfaced by: 1F, 1G, 3F.
  - Files: `sources.py`, `snapshots.py`, `domain.py`, `tests/test_sources.py`, `tests/test_snapshots.py`.
  - Verify: conflicting-source and success-then-failure fixture runs.
- [ ] **T4 (P1, human: ~2 days / CC: ~30 min)** - Hardened asset fetch and sanitizer - add a concrete injected HTTP fetcher with streaming limits, redirect/DNS revalidation, content sniffing, and adversarial image/SVG handling.
  - Surfaced by: 1I, 3A.
  - Files: `fetch_policy.py`, `assets.py`, `tests/test_fetch_policy.py`, `tests/test_assets.py`.
  - Verify: SSRF, rebinding, redirect, bomb, malformed-content, dimension, and sanitization tests without live network access.
- [ ] **T5 (P1, human: ~1-2 days / CC: ~20 min)** - Rights and staging gate - require licensed permissions, enforce expiry/territory rules, reject path escapes and symlinks, and verify staged bytes before publication.
  - Surfaced by: 1J, 1K, 3B, 3G.
  - Files: `domain.py`, `assets.py`, `release.py`, `tests/test_domain.py`, `tests/test_assets.py`, `tests/test_release.py`.
  - Verify: rights matrix, checksum mismatch, traversal, symlink, and public-binary absence tests.
- [ ] **T6 (P1, human: ~1-2 days / CC: ~20 min)** - Reproducible atomic release - add input/source/processor digests, UTC/semver validation, lifecycle transitions, atomic temp-directory publication, and withdrawal metadata.
  - Surfaced by: 1H, 1L, 3C, 3D.
  - Files: `release.py`, `domain.py`, `cli.py`, `tests/test_release.py`, `tests/test_cli.py`.
  - Verify: reordered-input rebuild, staged-file mutation, failed-build cleanup, supersede, and withdrawn-release tests.
- [ ] **T7 (P2, human: ~1 day / CC: ~15 min)** - Resolver determinism and indexing - define exact interface/error shapes, verified-domain semantics, conflict handling, tie-breaking, and indexed lookup performance.
  - Surfaced by: 2A, 3E, 4A.
  - Files: `normalize.py`, `resolver.py`, `tests/test_normalize.py`, `tests/test_resolver.py`.
  - Verify: competing matches, alias cases, deterministic ties, and a several-thousand-record p95 benchmark.
- [ ] **T8 (P2, human: ~1 day / CC: ~15 min)** - Standalone CI and contract coverage - add the package to Python 3.10-3.12 lint/test CI and complete the release contract/negative CLI tests.
  - Surfaced by: 2C, 2E, 3B, 3D, 3H.
  - Files: `global-financial-registry/pyproject.toml`, `.github/workflows/ci.yml` or a new package workflow, `tests/test_release_contract.py`, `README.md`.
  - Verify: clean checkout installs and passes Ruff, focused tests, coverage, and the root Relay suite independently.
- [ ] **T9 (P3, human: ~0.5 day / CC: ~10 min)** - Document deferred operations and licensing - record snapshot retention, resource limits, coverage disclaimers, CC BY metadata attribution, and the boundary between this package and the later serving/governance plans.
  - Surfaced by: S2, 4B, 4C, 4D.
  - Files: `global-financial-registry/README.md`, `LICENSE`, release documentation.
  - Verify: README command/contract review and a clean legal/operations checklist.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | Not run in this review |
| Codex Review | `/codex review` | Independent second opinion | 0 | - | Not run; no outside voice available |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_OPEN | 31 findings, 18 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | No UI in this plan |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | Not run |

**VERDICT:** Scope decomposition is accepted, but the plan is not ready to implement until P1 tasks T1-T6 are folded in and re-reviewed.

**UNRESOLVED DECISIONS:**
- Choose the single canonical representation for identifiers and decide whether brand ownership is relationship-only or also denormalized.
- Define the institution canonical-key and re-key policy for corrected, retired, merged, or succeeded entities.
- Decide whether Plan 1 includes a concrete safe HTTP fetcher or defers all live fetching to a later connector plan.
- Decide whether Plan 1 implements full release lifecycle transitions or emits only validated bundles.
