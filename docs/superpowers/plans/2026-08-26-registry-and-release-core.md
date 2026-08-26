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
- Canonical identifiers are stored only in `RegistryInput.identifiers`; resolver indexes are derived read-only views, never a second editable representation.
- Brand ownership is represented by sourced `Relationship` rows; `Brand` has no singular owner field.
- Every institution receives a curated `canonical_key`; source identifiers are aliases and re-key events never silently create a new canonical institution.
- Plan 1 includes a concrete `SafeHttpxAssetFetcher` with injected transport and DNS resolver, but no live country/regulator connector.
- Releases are built in a temporary sibling directory and atomically renamed only after validation, checksum generation, and manifest verification; failed builds leave no public output.
- All published dates are timezone-aware UTC values; release versions are SemVer 2.0.0 strings and schema compatibility is versioned separately.
- Follow the repository’s TDD convention: write a focused failing test, verify failure, implement the smallest change, run the focused and surrounding suites, then commit.

## Review-derived architecture decisions

The engineering review is folded into this plan with these resolved choices:

1. **Identifier authority:** top-level `RegistryInput.identifiers` is canonical. `EntityResolver` builds an in-memory `ResolverIndex` keyed by normalized identifier, verified domain, and normalized name. `Institution` does not embed identifiers.
2. **Brand ownership:** `Relationship(relation_type=brand_of)` is authoritative and may point one brand to many institutions. `Brand` stores display metadata only.
3. **Stable IDs:** `StableIdAllocator.allocate(kind, canonical_key)` uses a curated canonical key. `IdentityAlias` and `RekeyEvent` preserve old source keys and successor history without changing the canonical ID.
4. **Fetching:** this plan implements `SafeHttpxAssetFetcher`; tests inject an `httpx.MockTransport`, DNS resolver, clock, and redirect policy. No test contacts the public internet.
5. **Release lifecycle:** this plan implements `draft -> validated -> published -> superseded` and `published -> withdrawn`, including predecessor, supersession, and withdrawal metadata. Only a validated bundle may be promoted to published.

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
    ├── test_release_contract.py
    ├── test_cli.py
    └── test_end_to_end.py
.github/workflows/registry-core.yml              # standalone 3.10-3.12 CI matrix
```

The package must be independently installable with `pip install -e .` from its directory. Root Relay tests must continue to run without importing this package.

### Task 1: Scaffold the standalone package

**Files:**
- Create: `global-financial-registry/pyproject.toml`
- Create: `global-financial-registry/README.md`
- Create: `global-financial-registry/LICENSE`
- Create: `global-financial-registry/src/financial_registry/__init__.py`
- Create: `global-financial-registry/src/financial_registry/cli.py`
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
  "httpx>=0.27,<1",
  "imagehash>=4.3,<5",
  "pillow>=10,<12",
  "pycountry>=24.6,<25",
  "pydantic>=2.5,<3",
  "typer>=0.12,<1",
]

[project.optional-dependencies]
dev = [
  "pytest>=8,<9",
  "pytest-cov>=5,<7",
  "ruff>=0.4,<1",
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

[tool.ruff]
target-version = "py310"
line-length = 100
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
- Produces Pydantic models `Institution`, `Brand`, `Identifier`, `IdentityAlias`, `RekeyEvent`, `Relationship`, `Asset`, `AssetCandidate`, `SourceDefinition`, `SourceRun`, `CandidateRecord`, `ReleaseManifest`, and `RegistryInput`.
- Produces enums `InstitutionStatus`, `BrandStatus`, `RightsStatus`, `ReviewStatus`, `RelationType`, `SourceType`, `TrustTier`, `SourceRunStatus`, `ReleaseStatus`, `AssetVariant`, `AssetFormat`, and `FinancialCategory`.
- Produces `StableIdAllocator.allocate(kind: str, canonical_key: str) -> str`.

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
        Institution(
            id="inst_demo",
            canonical_key="institution:demo-bank-ng",
            legal_name="Demo Bank",
            normalized_name="demo bank",
            country_code="NGA",
            regulator_jurisdiction="NG",
        )


def test_published_country_code_must_be_uppercase_iso_alpha2():
    with pytest.raises(ValidationError):
        Institution(
            id="inst_demo",
            canonical_key="institution:demo-bank-gb",
            legal_name="Demo Bank",
            normalized_name="demo bank",
            country_code="gb",
            regulator_jurisdiction="GB",
        )


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


def test_licensed_binary_requires_permission_reference():
    with pytest.raises(ValidationError, match="permission_reference"):
        Asset(
            id="asset_demo",
            owner_id="inst_demo",
            variant="primary",
            format="svg",
            source_id="src_demo",
            source_uri="https://example.test/logo.svg",
            rights_status=RightsStatus.LICENSED,
            review_status=ReviewStatus.APPROVED,
            sha256="a" * 64,
            binary_path="assets/asset_demo.svg",
        )
```

```python
# global-financial-registry/tests/test_ids.py
from financial_registry.ids import StableIdAllocator


def test_stable_ids_are_deterministic_and_kind_scoped():
    allocator = StableIdAllocator()
    first = allocator.allocate("institution", "institution:demo-bank-gb")
    second = allocator.allocate("institution", "institution:demo-bank-gb")
    brand = allocator.allocate("brand", "brand:demo-bank")
    assert first == second
    assert first.startswith("inst_")
    assert brand.startswith("brand_")
    assert brand != first


def test_source_identifier_changes_do_not_change_curated_id():
    allocator = StableIdAllocator()
    canonical = allocator.allocate("institution", "institution:demo-bank-gb")
    assert allocator.allocate("institution", "institution:demo-bank-gb") == canonical
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd global-financial-registry
python -m pytest tests/test_domain.py tests/test_ids.py -q
```

Expected: FAIL because the domain models and allocator are not implemented.

- [ ] **Step 3: Implement the models and allocator**

Use `ConfigDict(extra="forbid")` on every published model. The core fields must include the design-approved relationship, source, rights, lifecycle, and provenance fields. Use an opaque UUID5 derived from `financial-registry:{kind}:{canonical_key}` and prefix it with `inst_`, `brand_`, `asset_`, or `rel_`; never expose the canonical key as the public ID.

```python
# global-financial-registry/src/financial_registry/ids.py
import unicodedata
from uuid import NAMESPACE_URL, uuid5


class StableIdAllocator:
    _prefixes = {
        "institution": "inst",
        "brand": "brand",
        "asset": "asset",
        "relationship": "rel",
    }

    def allocate(self, kind: str, canonical_key: str) -> str:
        if kind not in self._prefixes:
            raise ValueError(f"unsupported ID kind: {kind}")
        normalized = unicodedata.normalize("NFKC", canonical_key).strip().casefold()
        if not normalized:
            raise ValueError("canonical_key must not be empty")
        value = uuid5(NAMESPACE_URL, f"financial-registry:{kind}:{normalized}").hex
        prefix = self._prefixes[kind]
        return f"{prefix}_{value}"
```

```python
# global-financial-registry/src/financial_registry/domain.py
from __future__ import annotations

from datetime import datetime
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _validate_alpha2(value: str) -> str:
    if len(value) != 2 or not value.isascii() or value != value.upper():
        raise ValueError("country or territory code must be uppercase ISO-like alpha-2")
    return value


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


class BrandStatus(str, Enum):
    ACTIVE = "active"
    HISTORICAL = "historical"
    UNKNOWN = "unknown"


class SourceRunStatus(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    QUARANTINED = "quarantined"


class ReleaseStatus(str, Enum):
    DRAFT = "draft"
    VALIDATED = "validated"
    PUBLISHED = "published"
    SUPERSEDED = "superseded"
    WITHDRAWN = "withdrawn"


class AssetVariant(str, Enum):
    PRIMARY = "primary"
    MONOCHROME = "monochrome"
    MARK = "mark"
    WORDMARK = "wordmark"
    DARK = "dark"
    LIGHT = "light"


class AssetFormat(str, Enum):
    SVG = "svg"
    PNG = "png"
    WEBP = "webp"


class FinancialCategory(str, Enum):
    COMMERCIAL_BANK = "commercial_bank"
    CENTRAL_BANK = "central_bank"
    INVESTMENT_BANK = "investment_bank"
    MERCHANT_BANK = "merchant_bank"
    DEVELOPMENT_BANK = "development_bank"
    MORTGAGE_BANK = "mortgage_bank"
    BUILDING_SOCIETY = "building_society"
    COOPERATIVE_BANK = "cooperative_bank"
    CREDIT_UNION = "credit_union"
    MICROFINANCE = "microfinance"
    PAYMENT_INSTITUTION = "payment_institution"
    ELECTRONIC_MONEY_INSTITUTION = "electronic_money_institution"
    MOBILE_WALLET = "mobile_wallet"
    REMITTANCE_PROVIDER = "remittance_provider"
    CARD_NETWORK = "card_network"
    BROKER = "broker"
    EXCHANGE = "exchange"
    NEOBANK = "neobank"
    FINTECH = "fintech"


class Identifier(BaseModel):
    model_config = ConfigDict(extra="forbid")
    owner_id: str
    type: str
    value: str
    country_code: str | None = None
    source_id: str
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    confidence: float = Field(ge=0, le=1, default=1)

    @field_validator("country_code")
    @classmethod
    def validate_country_code(cls, value):
        return _validate_alpha2(value) if value is not None else value


class Asset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    variant: AssetVariant
    format: AssetFormat
    source_id: str
    source_uri: str
    rights_status: RightsStatus
    review_status: ReviewStatus
    sha256: str | None = None
    perceptual_hash: str | None = None
    width: int | None = Field(default=None, ge=1, le=4096)
    height: int | None = Field(default=None, ge=1, le=4096)
    binary_path: str | None = None
    staging_path: str | None = None
    license_note: str | None = None
    license_name: str | None = None
    license_url: str | None = None
    permission_reference: str | None = None
    attribution_text: str | None = None
    territories: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None
    verified_at: datetime | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None

    @field_validator("sha256")
    @classmethod
    def validate_sha256(cls, value):
        if value is not None and (len(value) != 64 or any(char not in "0123456789abcdef" for char in value)):
            raise ValueError("sha256 must be a lowercase hexadecimal SHA-256 digest")
        return value

    @field_validator("territories")
    @classmethod
    def validate_territories(cls, values):
        return [_validate_alpha2(value) for value in values]

    @model_validator(mode="after")
    def validate_public_binary_rights(self):
        binary = self.binary_path is not None or self.sha256 is not None
        if self.rights_status in {RightsStatus.SOURCE_LINK_ONLY, RightsStatus.UNKNOWN, RightsStatus.REMOVED}:
            if binary:
                raise ValueError("restricted rights states cannot carry a public binary")
        elif binary:
            if not self.source_uri or not self.sha256 or not self.binary_path:
                raise ValueError("public binaries require source URI, checksum, and binary path")
            if self.rights_status is RightsStatus.LICENSED and not self.permission_reference:
                raise ValueError("licensed binaries require permission_reference")
        return self


class InstitutionStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    MERGED = "merged"
    RENAMED = "renamed"
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
    canonical_key: str
    legal_name: str
    normalized_name: str
    short_name: str | None = None
    country_code: str
    regulator_jurisdiction: str
    regulator_identifier: str | None = None
    operating_markets: list[str] = Field(default_factory=list)
    categories: list[FinancialCategory] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    jurisdictions: list[str] = Field(default_factory=list)
    status: InstitutionStatus = InstitutionStatus.UNKNOWN
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    source_ids: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1, default=1)

    @field_validator("country_code", "regulator_jurisdiction")
    @classmethod
    def validate_country_fields(cls, value):
        return _validate_alpha2(value)

    @field_validator("operating_markets", "jurisdictions")
    @classmethod
    def validate_market_fields(cls, values):
        return [_validate_alpha2(value) for value in values]


class Brand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    display_name: str
    aliases: list[str] = Field(default_factory=list)
    localized_names: dict[str, str] = Field(default_factory=dict)
    country_codes: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    status: BrandStatus = BrandStatus.UNKNOWN
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    confidence: float = Field(ge=0, le=1, default=1)

    @field_validator("country_codes")
    @classmethod
    def validate_country_codes(cls, values):
        return [_validate_alpha2(value) for value in values]


class Relationship(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    relation_type: RelationType
    from_id: str
    to_id: str
    source_id: str
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    confidence: float = Field(ge=0, le=1, default=1)


class IdentityAlias(BaseModel):
    model_config = ConfigDict(extra="forbid")
    owner_id: str
    alias_type: str
    alias_value: str
    source_id: str
    valid_from: datetime | None = None
    valid_to: datetime | None = None


class RekeyEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    old_key: str
    new_key: str
    source_id: str
    occurred_at: datetime
    reason: str


class AssetCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str | None = None
    owner_id: str
    variant: AssetVariant
    source_id: str
    source_uri: str
    rights_status: RightsStatus
    staging_path: str | None = None
    license_name: str | None = None
    license_url: str | None = None
    permission_reference: str | None = None
    territories: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None


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
    connector_version: str


class SourceRun(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    source_id: str
    started_at: datetime
    finished_at: datetime | None = None
    status: SourceRunStatus
    snapshot_path: str | None = None
    snapshot_sha256: str | None = None
    previous_snapshot_sha256: str | None = None
    previous_run_id: str | None = None
    candidate_count: int = Field(ge=0, default=0)
    warnings: list[str] = Field(default_factory=list)


class CandidateRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: str
    source_record_id: str
    legal_name: str
    country_code: str
    regulator_jurisdiction: str | None = None
    regulator_identifier: str | None = None
    categories: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    operating_markets: list[str] = Field(default_factory=list)
    identifiers: list[Identifier] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    brand_name: str | None = None
    source_uri: str | None = None

    @field_validator("country_code", "regulator_jurisdiction")
    @classmethod
    def validate_candidate_country_fields(cls, value):
        return _validate_alpha2(value) if value is not None else value


class ReleaseManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    release_version: str
    schema_version: str
    generated_at: datetime
    lifecycle_status: ReleaseStatus
    generation_commit: str
    source_run_ids: list[str] = Field(default_factory=list)
    predecessor_release: str | None = None
    supersedes_release: str | None = None
    successor_release: str | None = None
    withdrawal_reason: str | None = None
    withdrawn_at: datetime | None = None
    counts: dict[str, int] = Field(default_factory=dict)
    unresolved_matches: int = Field(ge=0, default=0)
    stale_sources: int = Field(ge=0, default=0)
    provenance_coverage: float = Field(ge=0, le=1, default=1)
    input_sha256: str
    processor_version: str
    files: list[str] = Field(default_factory=list)
    checksums: dict[str, str] = Field(default_factory=dict)


class RegistryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    institutions: list[Institution] = Field(default_factory=list)
    brands: list[Brand] = Field(default_factory=list)
    identifiers: list[Identifier] = Field(default_factory=list)
    aliases: list[IdentityAlias] = Field(default_factory=list)
    rekey_events: list[RekeyEvent] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)
    assets: list[Asset] = Field(default_factory=list)
    sources: list[SourceDefinition] = Field(default_factory=list)
    source_runs: list[SourceRun] = Field(default_factory=list)
    asset_root: str | None = None
```

Define all enums as `str, Enum` classes (not `StrEnum`, so Python 3.10 remains supported): `InstitutionStatus` (`active`, `inactive`, `merged`, `renamed`, `unknown`), `BrandStatus` (`active`, `historical`, `unknown`), `RightsStatus` (`redistributable`, `licensed`, `source_link_only`, `unknown`, `removed`), `ReviewStatus` (`candidate`, `needs_review`, `approved`, `rejected`, `superseded`, `removed`), `RelationType` (`brand_of`, `subsidiary_of`, `branch_of`, `successor_of`, `previous_brand_of`, `operates_in`), `SourceType` (`regulator`, `gleif`, `bic`, `official_domain`, `open_finance`, `repository`, `submission`, `commercial_provider`), `TrustTier` (`authoritative`, `official`, `approved`, `submitted`, `commercial`), `SourceRunStatus` (`succeeded`, `failed`, `quarantined`), and `ReleaseStatus` (`draft`, `validated`, `published`, `superseded`, `withdrawn`). `AssetVariant`, `AssetFormat`, and `FinancialCategory` use the exact controlled values shown in the model code above.

Implement the models in dependency order so the interfaces used by later tasks are concrete rather than forward references:

- `Identifier`: `owner_id`, `type`, `value`, optional `country_code`, `source_id`, validity dates, and confidence.
- `Institution`: `id`, curated `canonical_key`, legal/normalized names, aliases, country, regulator jurisdiction/identifier, operating markets, categories, lifecycle dates/status, source IDs, domains, and confidence. Identifiers stay top-level.
- `Brand`: `id`, display/localized names, aliases, country codes, domains, source IDs, lifecycle dates/status, and confidence. Ownership is represented only by sourced relationships.
- `Relationship`: `id`, `relation_type`, `from_id`, `to_id`, `source_id`, validity dates, and confidence.
- `IdentityAlias` and `RekeyEvent`: sourced history that preserves old source keys without changing the canonical ID.
- `AssetCandidate`: optional `id`, `owner_id`, `variant`, `source_id`, `source_uri`, `rights_status`, optional rights metadata, and optional `staging_path`.
- `Asset`: the normalized candidate plus controlled variant/format, `review_status`, SHA-256/perceptual hash, dimensions, binary/staging paths, license/permission/attribution metadata, territory limits, expiry, and reviewer timestamps.
- `SourceDefinition`: `id`, publisher, jurisdiction, source type, URL, terms URL, trust tier, check frequency, and connector version.
- `SourceRun`: stable run ID, source ID, UTC start/finish, status, snapshot path/digest, previous successful snapshot digest and run ID, candidate count, and warnings.
- `CandidateRecord`: source identity, legal/normalized names, country/regulator data, categories, aliases, operating markets, identifiers, domains, brand data, and source URI metadata.
- `ReleaseManifest`: SemVer release/schema versions, UTC generation timestamp, lifecycle metadata, generation commit, source-run IDs, predecessor/successor/supersession and withdrawal metadata, input/processor digests, counts, unresolved/stale/provenance metrics, file list, and checksums.
- `RegistryInput`: the lists shown above plus optional `asset_root`; all list fields default to empty lists for fixture loading.

Create `global-financial-registry/tests/conftest.py` in this task with a `demo_registry` fixture and a `flaky_connector` fixture. `demo_registry` must create a temporary `asset_root`, write one tiny valid SVG under `logos/demo.svg`, and return a `RegistryInput` containing one institution with a curated canonical key, one brand, one top-level identifier, one `brand_of` relationship, one approved redistributable `Asset` whose `staging_path` is `logos/demo.svg`, one authoritative source, and one successful `SourceRun`. `flaky_connector` must return one valid snapshot on its first `fetch()` call and raise `RuntimeError("fixture outage")` on its second call. These fixtures are shared by the release/source tests and must not depend on package fixture files.

The Pydantic models must enforce:

- ISO-like two-letter uppercase country/territory codes;
- actual ISO 3166-1 alpha-2 values for published records, with `XX` allowed only in test fixtures;
- non-empty names and source IDs;
- 64-character lowercase hexadecimal SHA-256 values when present;
- `source_link_only` assets have no `binary_path` or `sha256`;
- binary assets have `source_uri`, `binary_path`, checksum, approved review state, and a rights state of `redistributable` or `licensed`;
- `licensed` binaries require `permission_reference`, applicable territory terms, and an unexpired `expires_at` when the permission expires;
- relationship endpoints and identifier owners are non-empty IDs;
- release records contain SemVer 2.0.0 versions, UTC timestamps, an explicit lifecycle status, source-run IDs, input/processor digests, and provenance metrics.

Use `pycountry.countries.get(alpha_2=code)` for published institution, brand, identifier, and relationship market codes. Source definitions may use the fixture-only jurisdiction `XX`; release validation must reject `XX` on publishable entity records.

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
- Produces `RawSnapshot`, `Connector` protocol, `ConnectorRunResult`, `ConflictEvidence`, and `run_connector(connector, previous_snapshot, now, previous_run_id=None) -> ConnectorRunResult`.
- Produces `FilesystemSnapshotStore.put(source_id, retrieved_at, body) -> RawSnapshot` and `.read(snapshot) -> bytes`.
- Produces `FilesystemSnapshotStore.prune(source_id, keep_digests) -> list[RawSnapshot]` for explicit retention; pruning is never implicit during a failed run.
- Produces `source_precedence(source_type, field_kind) -> int`; lower numeric rank wins and identity/logo precedence are independent.
- Produces `ConnectorRunResult` with a typed status, durable `SourceRun`, candidate count, snapshot reference, and warnings.

- [ ] **Step 1: Write failing source and snapshot tests**

```python
# global-financial-registry/tests/test_snapshots.py
from datetime import datetime, timezone

import pytest

from financial_registry.snapshots import FilesystemSnapshotStore


def test_snapshot_store_is_content_addressed(tmp_path):
    store = FilesystemSnapshotStore(tmp_path)
    retrieved_at = datetime(2026, 8, 26, tzinfo=timezone.utc)
    first = store.put("src_demo", retrieved_at, b"same payload")
    second = store.put("src_demo", retrieved_at, b"same payload")
    assert first.sha256 == second.sha256
    assert first.path == second.path
    assert store.read(first) == b"same payload"


def test_snapshot_store_rejects_path_unsafe_source_id(tmp_path):
    store = FilesystemSnapshotStore(tmp_path)
    with pytest.raises(ValueError, match="path-safe"):
        store.put("../escape", datetime(2026, 8, 26, tzinfo=timezone.utc), b"payload")


def test_snapshot_prune_requires_explicit_keep_set(tmp_path):
    store = FilesystemSnapshotStore(tmp_path)
    retrieved_at = datetime(2026, 8, 26, tzinfo=timezone.utc)
    old = store.put("src_demo", retrieved_at, b"old")
    current = store.put("src_demo", retrieved_at, b"current")
    removed = store.prune("src_demo", keep_digests={current.sha256})
    assert old.sha256 in {item.sha256 for item in removed}
    assert store.read(current) == b"current"


def test_snapshot_store_enforces_size_limit(tmp_path):
    store = FilesystemSnapshotStore(tmp_path, max_snapshot_bytes=4)
    with pytest.raises(ValueError, match="size"):
        store.put("src_demo", datetime(2026, 8, 26, tzinfo=timezone.utc), b"12345")
```

```python
# global-financial-registry/tests/test_sources.py
from datetime import datetime, timezone

from financial_registry.domain import SourceDefinition, SourceType, TrustTier
from financial_registry.sources import ConflictEvidence, run_connector, source_precedence


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
        connector_version="fixture-1",
    )
    assert source.trust_tier.value == "authoritative"
    assert source.check_frequency == "daily"


def test_identity_and_logo_precedence_are_separate():
    assert source_precedence(SourceType.REGULATOR, "identity") < source_precedence(SourceType.REPOSITORY, "identity")
    assert source_precedence(SourceType.OFFICIAL_DOMAIN, "logo") < source_precedence(SourceType.REGULATOR, "logo")


def test_conflict_evidence_retains_losing_value():
    evidence = ConflictEvidence(
        field_kind="identity",
        winner_source_id="src_regulator",
        losing_source_id="src_repository",
        winner_value="Demo Bank PLC",
        losing_value="Demo Bank",
        reason="authoritative source precedence",
    )
    assert evidence.losing_value == "Demo Bank"


def test_failed_run_retains_previous_verified_snapshot(flaky_connector):
    connector = flaky_connector
    first = run_connector(connector, previous_snapshot=None, now=datetime(2026, 8, 26, tzinfo=timezone.utc))
    second = run_connector(
        connector,
        previous_snapshot=first.snapshot,
        previous_run_id=first.source_run.id,
        now=datetime(2026, 8, 27, tzinfo=timezone.utc),
    )
    assert first.status.value == "succeeded"
    assert second.status.value == "failed"
    assert second.snapshot == first.snapshot
    assert second.source_run.previous_snapshot_sha256 == first.snapshot.sha256
    assert second.source_run.previous_run_id == first.source_run.id
    assert second.warnings
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
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path


@dataclass(frozen=True)
class RawSnapshot:
    source_id: str
    retrieved_at: datetime
    sha256: str
    path: str


class FilesystemSnapshotStore:
    def __init__(self, root: str | Path, max_snapshot_bytes: int = 50 * 1024 * 1024):
        self.root = Path(root).resolve()
        self.max_snapshot_bytes = max_snapshot_bytes

    def put(self, source_id: str, retrieved_at: datetime, body: bytes) -> RawSnapshot:
        if not source_id or Path(source_id).name != source_id:
            raise ValueError("source_id must be a single path-safe component")
        if retrieved_at.tzinfo is None or retrieved_at.utcoffset() is None:
            raise ValueError("retrieved_at must be timezone-aware")
        if len(body) > self.max_snapshot_bytes:
            raise ValueError("snapshot exceeds size limit")
        digest = sha256(body).hexdigest()
        path = self.root / source_id / f"{digest}.bin"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            temporary = path.with_suffix(".tmp")
            with temporary.open("wb") as handle:
                handle.write(body)
                handle.flush()
                os.fsync(handle.fileno())
            temporary.replace(path)
            try:
                directory_fd = os.open(path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            except OSError:
                pass
        return RawSnapshot(source_id, retrieved_at, digest, str(path))

    def read(self, snapshot: RawSnapshot) -> bytes:
        path = Path(snapshot.path).resolve()
        path.relative_to(self.root)
        body = path.read_bytes()
        if sha256(body).hexdigest() != snapshot.sha256:
            raise ValueError("snapshot checksum mismatch")
        return body

    def prune(self, source_id: str, keep_digests: set[str]) -> list[RawSnapshot]:
        if not source_id or Path(source_id).name != source_id:
            raise ValueError("source_id must be a single path-safe component")
        if any(
            len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest)
            for digest in keep_digests
        ):
            raise ValueError("keep_digests must contain lowercase SHA-256 values")
        source_dir = (self.root / source_id).resolve()
        source_dir.relative_to(self.root)
        if not source_dir.exists():
            return []
        removed = []
        for path in sorted(source_dir.glob("*.bin")):
            digest = path.stem
            if digest in keep_digests:
                continue
            stat = path.stat()
            path.unlink()
            removed.append(
                RawSnapshot(
                    source_id=source_id,
                    retrieved_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                    sha256=digest,
                    path=str(path),
                )
            )
        for temporary in source_dir.glob("*.tmp"):
            temporary.unlink()
        return removed
```

The connector protocol must expose `definition`, `fetch()`, and `normalize(snapshot)` methods. `fetch()` returns a `RawSnapshot`; `normalize()` returns candidate records with source references and never mutates canonical records directly. A failed run returns warnings and retains the prior successful snapshot reference.

```python
# global-financial-registry/src/financial_registry/sources.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .domain import CandidateRecord, SourceDefinition, SourceRun, SourceRunStatus, SourceType
from .snapshots import RawSnapshot


@dataclass(frozen=True)
class ConnectorRunResult:
    status: SourceRunStatus
    candidate_count: int
    snapshot: RawSnapshot | None
    source_run: SourceRun
    warnings: list[str]
    conflicts: tuple[ConflictEvidence, ...] = ()

    @classmethod
    def succeeded(cls, connector, snapshot, candidate_count, now):
        run = SourceRun(
            id=f"{connector.definition.id}:{snapshot.sha256}",
            source_id=connector.definition.id,
            started_at=now,
            finished_at=now,
            status=SourceRunStatus.SUCCEEDED,
            snapshot_path=snapshot.path,
            snapshot_sha256=snapshot.sha256,
            candidate_count=candidate_count,
        )
        return cls(SourceRunStatus.SUCCEEDED, candidate_count, snapshot, run, [])

    @classmethod
    def failed(cls, connector, previous_snapshot, warning, now, previous_run_id=None):
        previous_digest = previous_snapshot.sha256 if previous_snapshot else None
        run = SourceRun(
            id=f"{connector.definition.id}:{now.isoformat()}:failed",
            source_id=connector.definition.id,
            started_at=now,
            finished_at=now,
            status=SourceRunStatus.FAILED,
            snapshot_path=previous_snapshot.path if previous_snapshot else None,
            snapshot_sha256=previous_digest,
            previous_snapshot_sha256=previous_digest,
            previous_run_id=previous_run_id,
            candidate_count=0,
            warnings=[warning],
        )
        return cls(SourceRunStatus.FAILED, 0, previous_snapshot, run, [warning])


class Connector(Protocol):
    definition: SourceDefinition

    def fetch(self) -> RawSnapshot: ...

    def normalize(self, snapshot: RawSnapshot) -> list[CandidateRecord]: ...
```

Add these exact source-run interfaces. The runner catches connector failures, returns `ConnectorRunResult(status=SourceRunStatus.FAILED, snapshot=previous_snapshot, warnings=[failure_message])`, and never replaces a last verified snapshot with an empty failure. Successful runs return `status=SourceRunStatus.SUCCEEDED` and the new snapshot reference. `ConflictEvidence` is retained in the run output when two sources disagree; it is never silently discarded.

```python
@dataclass(frozen=True)
class ConflictEvidence:
    field_kind: str
    winner_source_id: str
    losing_source_id: str
    winner_value: str
    losing_value: str
    reason: str


def source_precedence(source_type: SourceType, field_kind: str) -> int:
    identity = {SourceType.REGULATOR: 10, SourceType.GLEIF: 20, SourceType.BIC: 30}
    logo = {SourceType.OFFICIAL_DOMAIN: 10, SourceType.OPEN_FINANCE: 20, SourceType.REPOSITORY: 30}
    table = logo if field_kind == "logo" else identity
    return table.get(source_type, 90)


def run_connector(connector, previous_snapshot, now, previous_run_id=None):
    try:
        snapshot = connector.fetch()
        candidates = connector.normalize(snapshot)
        return ConnectorRunResult.succeeded(connector, snapshot, len(candidates), now)
    except Exception as exc:
        return ConnectorRunResult.failed(connector, previous_snapshot, str(exc), now, previous_run_id)
```

Tests must assert that unexpected exceptions are recorded as warnings while the previous snapshot remains readable.

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
- Produces `ResolverIndex.from_registry(input: RegistryInput) -> ResolverIndex`.
- Produces `EntityResolver.resolve(candidate: CandidateRecord, index: ResolverIndex) -> Resolution`.
- `Resolution` is a frozen dataclass with `action` (`match`, `create`, `review`), `matched_id`, `match_method`, `confidence`, `reasons`, and `competing_ids`.
- Exact identifiers and verified domains can return `match`; exact names, aliases, and all fuzzy candidates return `review` unless a previously approved review decision exists.

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


def test_normalization_is_idempotent_and_domains_are_idna_safe():
    value = normalize_name(" Banco Example, S.A. ")
    assert normalize_name(value) == value
    assert normalize_domain("https://例え.テスト/") == "xn--r8jz45g.xn--zckzah"
```

```python
# global-financial-registry/tests/test_resolver.py
from financial_registry.domain import CandidateRecord, Identifier, Institution
from financial_registry.resolver import EntityResolver, ResolverIndex


def test_exact_identifier_matches_without_review():
    existing = [
        Institution(
            id="inst_demo",
            canonical_key="institution:demo-bank-gb",
            legal_name="Demo Bank",
            normalized_name="demo bank",
            country_code="GB",
            regulator_jurisdiction="GB",
        )
    ]
    identifiers = [
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
    index = ResolverIndex.from_parts(existing, identifiers, verified_domains={})
    result = EntityResolver().resolve(candidate, index)
    assert result.action == "match"
    assert result.matched_id == "inst_demo"
    assert result.match_method == "exact_identifier"


def test_fuzzy_name_match_creates_review_not_merge():
    existing = [
        Institution(
            id="inst_demo",
            canonical_key="institution:demo-bank-gb",
            legal_name="Demo Bank",
            normalized_name="demo bank",
            country_code="GB",
            regulator_jurisdiction="GB",
        )
    ]
    candidate = CandidateRecord(
        source_id="src_new",
        source_record_id="row-2",
        legal_name="Demo Banking Group",
        country_code="GB",
    )
    index = ResolverIndex.from_parts(existing, identifiers=[], verified_domains={})
    result = EntityResolver().resolve(candidate, index)
    assert result.action == "review"
    assert result.matched_id == "inst_demo"


def test_conflicting_exact_identifiers_never_auto_merge():
    existing = [
        Institution(
            id="inst_a",
            canonical_key="institution:a-gb",
            legal_name="Demo A",
            normalized_name="demo a",
            country_code="GB",
            regulator_jurisdiction="GB",
        ),
        Institution(
            id="inst_b",
            canonical_key="institution:b-gb",
            legal_name="Demo B",
            normalized_name="demo b",
            country_code="GB",
            regulator_jurisdiction="GB",
        ),
    ]
    identifiers = [
        Identifier(owner_id="inst_a", type="bic", value="DEMO GB2L", source_id="src_a"),
        Identifier(owner_id="inst_b", type="bic", value="DEMOGB2L", source_id="src_b"),
    ]
    candidate = CandidateRecord(
        source_id="src_new",
        source_record_id="row-conflict",
        legal_name="Demo",
        country_code="GB",
        identifiers=[Identifier(owner_id="candidate", type="bic", value="DEMOGB2L", source_id="src_new")],
    )
    result = EntityResolver().resolve(candidate, ResolverIndex.from_parts(existing, identifiers, {}))
    assert result.action == "review"
    assert result.match_method == "conflicting_identifier"
    assert result.competing_ids == ("inst_a", "inst_b")
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

Define the resolver records before implementing the algorithm:

```python
from dataclasses import dataclass

from .domain import Institution, RegistryInput
from .normalize import normalize_domain, normalize_identifier, normalize_name


@dataclass(frozen=True)
class Resolution:
    action: str
    matched_id: str | None
    match_method: str
    confidence: float
    reasons: tuple[str, ...]
    competing_ids: tuple[str, ...]


@dataclass(frozen=True)
class ResolverIndex:
    institutions: tuple[Institution, ...]
    identifiers_by_key: dict[tuple[str, str], tuple[str, ...]]
    verified_domains: dict[str, tuple[str, ...]]
    names_by_country: dict[tuple[str, str], tuple[str, ...]]

    @classmethod
    def from_parts(cls, institutions, identifiers, verified_domains: dict[str, tuple[str, ...]]):
        registry = RegistryInput(
            institutions=list(institutions),
            identifiers=list(identifiers),
            sources=[],
        )
        index = cls.from_registry(registry)
        return cls(index.institutions, index.identifiers_by_key, verified_domains, index.names_by_country)

    @classmethod
    def from_registry(cls, registry: RegistryInput) -> "ResolverIndex":
        institutions = tuple(sorted(registry.institutions, key=lambda item: item.id))
        ids = {item.id for item in institutions}
        if len(ids) != len(institutions):
            raise ValueError("duplicate institution ID")
        identifier_map: dict[tuple[str, str], list[str]] = {}
        for item in registry.identifiers:
            if item.owner_id not in ids:
                raise ValueError(f"identifier owner does not resolve: {item.owner_id}")
            key = (item.type, normalize_identifier(item.type, item.value))
            identifier_map.setdefault(key, []).append(item.owner_id)
        domain_map: dict[str, list[str]] = {}
        trusted_sources = {
            source.id
            for source in registry.sources
            if source.trust_tier.value in {"authoritative", "official", "approved"}
        }
        for item in institutions:
            if not trusted_sources.intersection(item.source_ids):
                continue
            for domain in item.domains:
                domain_map.setdefault(normalize_domain(domain), []).append(item.id)
        name_map: dict[tuple[str, str], list[str]] = {}
        for item in institutions:
            key = (item.country_code, normalize_name(item.normalized_name))
            name_map.setdefault(key, []).append(item.id)
        institution_by_id = {item.id: item for item in institutions}
        for alias in registry.aliases:
            owner = institution_by_id.get(alias.owner_id)
            if owner:
                key = (owner.country_code, normalize_name(alias.alias_value))
                name_map.setdefault(key, []).append(owner.id)
        return cls(
            institutions=institutions,
            identifiers_by_key={key: tuple(sorted(set(values))) for key, values in identifier_map.items()},
            verified_domains={key: tuple(sorted(set(values))) for key, values in domain_map.items()},
            names_by_country={key: tuple(sorted(set(values))) for key, values in name_map.items()},
        )
```

Add the methods `ids_for_identifier`, `ids_for_verified_domains`, `ids_for_name_and_country`, and `fuzzy_candidates`. Each method must normalize input keys, sort returned IDs by stable ID, and never mutate the index.

The resolver must apply this exact order:

```python
identifier_ids = index.ids_for_identifier(candidate.identifiers)
if len(identifier_ids) == 1:
    return Resolution("match", identifier_ids[0], "exact_identifier", 1.0, reasons, [])
if len(identifier_ids) > 1:
    return Resolution("review", None, "conflicting_identifier", 0.0, reasons, identifier_ids)
domain_ids = index.ids_for_verified_domains(candidate.domains)
if len(domain_ids) == 1:
    return Resolution("match", domain_ids[0], "verified_domain", 0.98, reasons, [])
if len(domain_ids) > 1:
    return Resolution("review", None, "conflicting_verified_domain", 0.0, reasons, domain_ids)
name_ids = index.ids_for_name_and_country(candidate.legal_name, candidate.country_code)
if name_ids:
    return Resolution("review", name_ids[0], "name_country", 0.90, reasons, name_ids)
fuzzy_ids = index.fuzzy_candidates(candidate.legal_name, candidate.country_code)
if fuzzy_ids:
    return Resolution("review", fuzzy_ids[0].id, "fuzzy_name", fuzzy_ids[0].score, reasons, [item.id for item in fuzzy_ids])
return Resolution("create", None, "no_match", 0.0, reasons, [])
```

`ResolverIndex` must contain only normalized, source-verified keys. A domain enters the verified index only when its `Identifier`/source evidence is from an approved or authoritative source. Fuzzy candidates are sorted by descending score then stable ID, and a score tie remains `review` with all competing IDs. Never call a fuzzy result `match`, never overwrite an existing record from a candidate, and include all competing candidates in the review reasons.

Build the indexes once per release input rather than scanning all institutions for every candidate. Add a benchmark fixture with 10,000 institutions and assert exact-identifier resolution p95 under 50 ms and name-resolution p95 under 250 ms on the CI runner; the benchmark is a regression guard, not a launch SLA.

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
- Produces `validate_source_url(url, resolver=None) -> str` and `SafeHttpxAssetFetcher(client, resolver, max_redirects=3, max_bytes=5*1024*1024).fetch(url) -> FetchedAsset`.
- Produces `AssetFetcher` protocol with `fetch(url) -> FetchedAsset`; the concrete fetcher streams bytes, revalidates DNS after every redirect, and enforces timeout/header/body limits.
- Produces `AssetProcessor(url_validator, clock).process(candidate: AssetCandidate, fetcher: AssetFetcher) -> ProcessedAsset`.
- Produces `AssetPolicyError` for unsafe URLs, oversized bodies, invalid content, or prohibited rights states.

- [ ] **Step 1: Write failing security and asset tests**

```python
# global-financial-registry/tests/test_fetch_policy.py
import httpx
import pytest

from financial_registry.fetch_policy import AssetPolicyError, SafeHttpxAssetFetcher, UnsafeSourceUrl, validate_source_url


def test_source_url_requires_https():
    with pytest.raises(UnsafeSourceUrl):
        validate_source_url("http://example.test/logo.svg")


def test_source_url_rejects_loopback_resolution():
    with pytest.raises(UnsafeSourceUrl):
        validate_source_url("https://localhost/logo.svg", resolver=lambda host: ["127.0.0.1"])


@pytest.mark.parametrize("address", ["127.0.0.1", "::ffff:127.0.0.1", "169.254.1.1"])
def test_source_url_rejects_private_and_mapped_addresses(address):
    with pytest.raises(UnsafeSourceUrl):
        validate_source_url("https://public.test/logo.svg", resolver=lambda host: [address])


def test_fetcher_revalidates_redirect_destination():
    transport = httpx.MockTransport(
        lambda request: httpx.Response(302, headers={"location": "https://private.test/logo.svg"})
    )
    client = httpx.Client(transport=transport)
    fetcher = SafeHttpxAssetFetcher(
        client=client,
        resolver=lambda host: ["127.0.0.1"] if host == "private.test" else ["8.8.8.8"],
    )
    with pytest.raises(UnsafeSourceUrl):
        fetcher.fetch("https://public.test/logo.svg")


def test_fetcher_rejects_body_over_limit():
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, headers={"content-type": "image/svg+xml"}, content=b"x" * 32)
    )
    client = httpx.Client(transport=transport)
    fetcher = SafeHttpxAssetFetcher(
        client=client,
        resolver=lambda host: ["8.8.8.8"],
        max_bytes=16,
    )
    with pytest.raises(AssetPolicyError, match="size"):
        fetcher.fetch("https://public.test/logo.svg")


def test_fetcher_rejects_ambiguous_content_type():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=b"not-an-image"))
    fetcher = SafeHttpxAssetFetcher(
        client=httpx.Client(transport=transport),
        resolver=lambda host: ["8.8.8.8"],
    )
    with pytest.raises(AssetPolicyError, match="content type"):
        fetcher.fetch("https://public.test/logo.svg")
```

```python
# global-financial-registry/tests/test_assets.py
import pytest

from financial_registry.assets import AssetProcessor, FetchedAsset
from financial_registry.domain import AssetCandidate, RightsStatus
from financial_registry.fetch_policy import AssetPolicyError


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


def test_svg_external_reference_is_rejected():
    body = b'<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/x"/></svg>'
    candidate = AssetCandidate(
        owner_id="brand_demo",
        variant="primary",
        source_id="src_demo",
        source_uri="https://example.test/logo.svg",
        rights_status=RightsStatus.REDISTRIBUTABLE,
    )
    with pytest.raises(AssetPolicyError):
        AssetProcessor(url_validator=lambda url: url).process(candidate, FakeFetcher(body))
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
from dataclasses import dataclass
from ipaddress import ip_address
from urllib.parse import urljoin, urlparse


class AssetPolicyError(ValueError):
    pass


class UnsafeSourceUrl(ValueError):
    pass


@dataclass(frozen=True)
class FetchedAsset:
    url: str
    final_url: str
    body: bytes
    content_type: str


def validate_source_url(url: str, resolver=None) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise UnsafeSourceUrl("source URL must use HTTPS and include a hostname")
    if parsed.username or parsed.password:
        raise UnsafeSourceUrl("credential-bearing source URLs are not allowed")
    hostname = parsed.hostname.casefold().rstrip(".")
    if hostname == "localhost" or hostname.endswith(".localhost"):
        raise UnsafeSourceUrl("localhost source is not allowed")
    resolver = resolver or default_dns_resolver
    addresses = [ip_address(value) for value in resolver(parsed.hostname)]
    if any(value.is_private or value.is_loopback or value.is_link_local or value.is_multicast or value.is_unspecified for value in addresses):
        raise UnsafeSourceUrl("source URL resolves to a non-public address")
    return url
```

Implement `default_dns_resolver(hostname)` with `socket.getaddrinfo` and deduplicate returned addresses:

```python
import socket


def default_dns_resolver(hostname: str) -> list[str]:
    return sorted({row[4][0] for row in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)})
```

Keep the resolver injectable so all security tests use deterministic addresses and do not contact live sites.

Implement the concrete fetcher with streaming reads and redirect revalidation:

```python
class SafeHttpxAssetFetcher:
    def __init__(self, client, resolver, max_redirects=3, max_bytes=5 * 1024 * 1024, timeout=10.0):
        self.client = client
        self.resolver = resolver
        self.max_redirects = max_redirects
        self.max_bytes = max_bytes
        self.timeout = timeout

    def fetch(self, url: str) -> FetchedAsset:
        current = url
        for redirect_count in range(self.max_redirects + 1):
            validate_source_url(current, resolver=self.resolver)
            with self.client.stream("GET", current, follow_redirects=False, timeout=self.timeout) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise AssetPolicyError("redirect missing location")
                    if redirect_count == self.max_redirects:
                        raise AssetPolicyError("redirect limit exceeded")
                    current = urljoin(current, location)
                    continue
                if response.status_code >= 400:
                    raise AssetPolicyError(f"asset source returned HTTP {response.status_code}")
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > self.max_bytes:
                        raise AssetPolicyError("asset response exceeds size limit")
                content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if content_type not in {"image/svg+xml", "image/png", "image/webp"}:
                    raise AssetPolicyError("ambiguous asset content type")
                return FetchedAsset(url=url, final_url=current, body=bytes(body), content_type=content_type)
        raise AssetPolicyError("unreachable redirect state")
```

The fetcher must reject ambiguous content types, compressed responses whose decompressed body crosses the limit, and any response with a private/link-local redirect target. Asset processing adds the 1 MiB SVG, 10,000-node XML, 4,096×4,096 raster, archive, and external-reference limits.

Add adversarial tests for DNS rebinding, IPv4-mapped IPv6, localhost aliases, redirect chains, chunked oversized bodies, decompression bombs, malformed XML/SVG, scripts/event handlers, external references, embedded objects, oversized raster dimensions, content-type mismatch, and symlinked staging paths. All use `httpx.MockTransport`, injected DNS, and temporary files; no live network or unbounded fixture is permitted.

Keep the core processor single-threaded and bounded in this plan; expose `max_bytes`, `max_redirects`, `max_svg_nodes`, `max_svg_bytes`, `max_dimension`, and `timeout` as constructor values. A later worker plan may add concurrency, but no asset processing call may exceed the configured limits or retain the original body after the call returns.

Define the asset interfaces explicitly in `assets.py`:

```python
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from .fetch_policy import AssetPolicyError, FetchedAsset


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

Use this processing boundary so restricted assets never enter the public variant path:

```python
from hashlib import sha256
from datetime import datetime, timezone

from .domain import RightsStatus
from .fetch_policy import AssetPolicyError, validate_source_url


class AssetProcessor:
    def __init__(
        self,
        url_validator=validate_source_url,
        clock=lambda: datetime.now(timezone.utc),
        max_bytes=5 * 1024 * 1024,
        max_svg_bytes=1 * 1024 * 1024,
        max_svg_nodes=10_000,
        max_dimension=4096,
    ):
        self.url_validator = url_validator
        self.clock = clock
        self.max_bytes = max_bytes
        self.max_svg_bytes = max_svg_bytes
        self.max_svg_nodes = max_svg_nodes
        self.max_dimension = max_dimension

    def process(self, candidate, fetcher):
        self.url_validator(candidate.source_uri)
        self._enforce_rights(candidate, self.clock())
        fetched = fetcher.fetch(candidate.source_uri)
        if len(fetched.body) > self.max_bytes:
            raise AssetPolicyError("asset body exceeds size limit")
        sanitized = self._sanitize_and_normalize(fetched)
        public_binary = sanitized if candidate.rights_status in {RightsStatus.REDISTRIBUTABLE, RightsStatus.LICENSED} else None
        return ProcessedAsset(
            sanitized_bytes=sanitized,
            sha256=sha256(sanitized).hexdigest(),
            imagehash=compute_imagehash(sanitized),
            public_binary=public_binary,
        )

    def _enforce_rights(self, candidate, now):
        if now.tzinfo is None or now.utcoffset() is None:
            raise AssetPolicyError("rights clock must be timezone-aware")
        if candidate.rights_status is RightsStatus.LICENSED and not candidate.permission_reference:
            raise AssetPolicyError("licensed asset is missing permission_reference")
        if candidate.expires_at and candidate.expires_at <= now:
            raise AssetPolicyError("asset rights have expired")
```

Implement `_sanitize_and_normalize` with the stated SVG/Pillow/CairoSVG limits and make `_enforce_rights` raise `AssetPolicyError` for missing licensed permission or expired rights. `sha256` and `compute_imagehash` are imported helpers in `assets.py`; the returned bytes are deterministic for identical input.

Give `AssetProcessor` injectable constructor arguments `url_validator: Callable[[str], str] = validate_source_url`, `clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc)`, `max_bytes=5 MiB`, `max_svg_bytes=1 MiB`, `max_svg_nodes=10_000`, and `max_dimension=4096`. Tests that use a fake fetcher must pass `url_validator=lambda url: url` and a fixed UTC clock when testing expiry; live DNS is never part of the test suite.

Treat `Asset.staging_path` as a private path containing the already-sanitized bytes produced by `AssetProcessor`; raw fetched bodies stay outside the release input. The fixture connector uses checked-in, pre-sanitized SVGs, and a future live connector will write `ProcessedAsset.public_binary` to its staging path before creating the canonical `Asset`.

Pass an injected UTC `clock()` into rights validation. At release generation time, a licensed asset is publishable only when `expires_at` is absent or later than the generation timestamp and its territory set covers the release market; an expired or out-of-territory asset becomes metadata-only and raises a release validation issue if it still declares a public binary.

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
- Produces `ValidationIssue(code: str, path: str, message: str)` and `ReleaseValidationError(issues: tuple[ValidationIssue, ...])`.
- Produces `ReleaseBuilder.validate(input: RegistryInput, generation_commit: str) -> list[ValidationIssue]`.
- Produces `ReleaseBuilder.build(input, version, generated_at, output_dir, generation_commit, lifecycle=ReleaseStatus.VALIDATED) -> ReleaseManifest`, resolving each `Asset.staging_path` relative to `RegistryInput.asset_root` only after containment and checksum checks.
- Produces `ReleaseLifecycle.promote(manifest, target, successor=None, reason=None, validation_issues=(), at=None) -> ReleaseManifest` with only the transitions approved in the architecture decision above.
- Produces deterministic `institutions.json`, `brands.json`, `identifiers.json`, `aliases.json`, `rekey-events.json`, `relationships.json`, `assets-manifest.json`, `sources.json`, `checksums.txt`, and `schema-version.json`.
- Produces release lifecycle values `draft`, `validated`, `published`, `superseded`, and `withdrawn`, with predecessor/supersession/withdrawal metadata.

Define the error interfaces in `release.py` before the builder:

```python
from dataclasses import dataclass
import re


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    path: str
    message: str


class ReleaseValidationError(ValueError):
    def __init__(self, issues: tuple[ValidationIssue, ...]):
        self.issues = issues
        super().__init__("; ".join(f"{issue.code} at {issue.path}: {issue.message}" for issue in issues))


SEMVER_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")
```

- [ ] **Step 1: Write failing release tests**

```python
# global-financial-registry/tests/test_release.py
from datetime import datetime, timezone
from pathlib import Path

import pytest

from financial_registry.release import ReleaseBuilder, ReleaseLifecycle, ReleaseValidationError
from financial_registry.domain import RegistryInput, ReleaseStatus, RightsStatus


def test_release_is_byte_for_byte_reproducible(tmp_path, demo_registry: RegistryInput):
    generated_at = datetime(2026, 8, 26, tzinfo=timezone.utc)
    first_dir = tmp_path / "first"
    second_dir = tmp_path / "second"
    ReleaseBuilder().build(demo_registry, "0.1.0", generated_at, first_dir, generation_commit="test-commit")
    ReleaseBuilder().build(demo_registry, "0.1.0", generated_at, second_dir, generation_commit="test-commit")
    first = sorted(path.relative_to(first_dir) for path in first_dir.rglob("*") if path.is_file())
    second = sorted(path.relative_to(second_dir) for path in second_dir.rglob("*") if path.is_file())
    assert first == second
    for relative in first:
        assert (first_dir / relative).read_bytes() == (second_dir / relative).read_bytes()


def test_release_is_invariant_to_input_order_fresh_parse_and_mtime(tmp_path, demo_registry: RegistryInput):
    import json
    import os

    generated_at = datetime(2026, 8, 26, tzinfo=timezone.utc)
    reordered = demo_registry.model_copy(deep=True)
    for field in ("institutions", "brands", "identifiers", "aliases", "rekey_events", "relationships", "assets", "sources", "source_runs"):
        values = getattr(reordered, field)
        values.reverse()
    reparsed = RegistryInput.model_validate(json.loads(demo_registry.model_dump_json()))
    os.utime(Path(reparsed.asset_root) / "logos" / "demo.svg", (1, 1))
    first_dir = tmp_path / "ordered"
    second_dir = tmp_path / "reparsed"
    ReleaseBuilder().build(reordered, "0.1.0", generated_at, first_dir, generation_commit="test-commit")
    ReleaseBuilder().build(reparsed, "0.1.0", generated_at, second_dir, generation_commit="test-commit")
    first = sorted(path.relative_to(first_dir) for path in first_dir.rglob("*") if path.is_file())
    second = sorted(path.relative_to(second_dir) for path in second_dir.rglob("*") if path.is_file())
    assert first == second
    assert [(path, (first_dir / path).read_bytes()) for path in first] == [
        (path, (second_dir / path).read_bytes()) for path in second
    ]


def test_release_rejects_invalid_semver_and_naive_timestamp(tmp_path, demo_registry: RegistryInput):
    with pytest.raises(ReleaseValidationError, match="SemVer"):
        ReleaseBuilder().build(
            demo_registry,
            "1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            tmp_path / "bad-version",
            generation_commit="test-commit",
        )
    with pytest.raises(ReleaseValidationError, match="UTC"):
        ReleaseBuilder().build(
            demo_registry,
            "1.0.0",
            datetime(2026, 8, 26),
            tmp_path / "naive-time",
            generation_commit="test-commit",
        )


def test_release_rejects_binary_with_unknown_rights(tmp_path, demo_registry: RegistryInput):
    demo_registry.assets[0].rights_status = RightsStatus.UNKNOWN
    with pytest.raises(ReleaseValidationError, match="rights"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            tmp_path / "release",
            generation_commit="test-commit",
        )


def test_release_rejects_staging_path_escape(tmp_path, demo_registry: RegistryInput):
    demo_registry.assets[0].staging_path = "../outside.svg"
    with pytest.raises(ReleaseValidationError, match="staging"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            tmp_path / "release",
            generation_commit="test-commit",
        )


def test_release_has_input_and_processor_digests(tmp_path, demo_registry: RegistryInput):
    manifest = ReleaseBuilder().build(
        demo_registry,
        "0.1.0",
        datetime(2026, 8, 26, tzinfo=timezone.utc),
        tmp_path / "release",
        generation_commit="test-commit",
    )
    assert len(manifest.input_sha256) == 64
    assert manifest.processor_version
    assert manifest.provenance_coverage == 1


def test_release_rejects_expired_licensed_asset(tmp_path, demo_registry: RegistryInput):
    demo_registry.assets[0].rights_status = RightsStatus.LICENSED
    demo_registry.assets[0].permission_reference = "permission/demo"
    demo_registry.assets[0].expires_at = datetime(2026, 8, 25, tzinfo=timezone.utc)
    with pytest.raises(ReleaseValidationError, match="expired"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            tmp_path / "release",
            generation_commit="test-commit",
        )


def test_release_rejects_licensed_asset_outside_territory(tmp_path, demo_registry: RegistryInput):
    demo_registry.assets[0].rights_status = RightsStatus.LICENSED
    demo_registry.assets[0].permission_reference = "permission/demo"
    demo_registry.assets[0].territories = ["US"]
    with pytest.raises(ReleaseValidationError, match="territory"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            tmp_path / "release",
            generation_commit="test-commit",
        )


def test_release_lifecycle_requires_valid_transition(tmp_path, demo_registry: RegistryInput):
    manifest = ReleaseBuilder().build(
        demo_registry,
        "0.1.0",
        datetime(2026, 8, 26, tzinfo=timezone.utc),
        tmp_path / "release",
        generation_commit="test-commit",
    )
    published = ReleaseLifecycle.promote(manifest, ReleaseStatus.PUBLISHED)
    superseded = ReleaseLifecycle.promote(
        published,
        ReleaseStatus.SUPERSEDED,
        successor="0.2.0",
    )
    assert superseded.successor_release == "0.2.0"
    withdrawn = ReleaseLifecycle.promote(
        published,
        ReleaseStatus.WITHDRAWN,
        reason="rights request",
        at=datetime(2026, 8, 27, tzinfo=timezone.utc),
    )
    assert withdrawn.lifecycle_status is ReleaseStatus.WITHDRAWN
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
- every `licensed` binary has permission reference, territory terms, and a non-expired permission;
- `source_link_only`, `unknown`, and `removed` assets have no public binary path;
- every staging path resolves beneath `asset_root`, is not a symlink, and matches the declared SHA-256;
- every emitted binary path is relative, unique, and derived from the stable asset ID; no caller-controlled `..` or absolute path is accepted;
- no fuzzy resolution result is marked as an automatic match;
- the input JSON, source snapshots, staged asset bytes, and processor version are hashed into the manifest;
- `generated_at` is timezone-aware UTC and `version` is valid SemVer 2.0.0;
- all arrays are sorted by stable ID or the documented stable key;
- the same input and explicit `generated_at` produce identical bytes.

Add parameterized release tests for duplicate entity IDs, missing source references, dangling relationship/identifier/asset owners, invalid country codes, unapproved binaries, checksum mismatches, missing licensed permission, expired/out-of-territory licensed rights, restricted binaries, invalid lifecycle transitions, invalid SemVer, naive timestamps, missing provenance, output collisions, and failed-build cleanup. Each case must assert a typed `ValidationIssue.code`, exit before the first public file is written, and leave an existing output directory untouched.

Build under `output_dir.parent / f".{output_dir.name}.tmp-<random>"`, write all JSON and permitted assets there, fsync files, write `checksums.txt` excluding itself, validate the completed manifest and checksums, then atomically rename the temporary directory to `output_dir`. If any step fails, remove only the temporary directory and leave an existing output directory untouched. Serialize Pydantic records with `model_dump(mode="json", exclude_none=True)` and then use `json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\\n"`. The API read model is not created in this plan; the release bundle is the only publication output.
`ReleaseManifest.files` enumerates every emitted file covered by `checksums.txt` and excludes `checksums.txt` itself; the lifecycle checksum guard compares these sets exactly.

Implement `ReleaseLifecycle.promote` with these exact guards: `draft -> validated` requires an empty `validation_issues` sequence; `validated -> published` requires a non-empty `files` list whose paths exactly match the checksum manifest; `published -> superseded` requires a successor release version; and `published -> withdrawn` requires a non-empty reason plus an injected timezone-aware transition timestamp. No other transition is accepted.

```python
class ReleaseLifecycle:
    _allowed = {
        ReleaseStatus.DRAFT: {ReleaseStatus.VALIDATED},
        ReleaseStatus.VALIDATED: {ReleaseStatus.PUBLISHED},
        ReleaseStatus.PUBLISHED: {ReleaseStatus.SUPERSEDED, ReleaseStatus.WITHDRAWN},
    }

    @classmethod
    def promote(cls, manifest, target, successor=None, reason=None, validation_issues=(), at=None):
        if target not in cls._allowed.get(manifest.lifecycle_status, set()):
            raise ValueError("invalid release lifecycle transition")
        if target is ReleaseStatus.VALIDATED and validation_issues:
            raise ValueError("cannot validate release with unresolved issues")
        if target is ReleaseStatus.PUBLISHED:
            if not manifest.files or set(manifest.files) != set(manifest.checksums):
                raise ValueError("published release requires complete checksum manifest")
        if target is ReleaseStatus.SUPERSEDED and not successor:
            raise ValueError("superseded release requires successor version")
        if target is ReleaseStatus.WITHDRAWN and not reason:
            raise ValueError("withdrawn release requires reason")
        if target is ReleaseStatus.WITHDRAWN and (at is None or at.tzinfo is None or at.utcoffset() is None):
            raise ValueError("withdrawn release requires a timezone-aware transition timestamp")
        return manifest.model_copy(
            update={
                "lifecycle_status": target,
                "successor_release": successor if target is ReleaseStatus.SUPERSEDED else manifest.successor_release,
                "withdrawal_reason": reason if target is ReleaseStatus.WITHDRAWN else manifest.withdrawal_reason,
                "withdrawn_at": at if target is ReleaseStatus.WITHDRAWN else manifest.withdrawn_at,
            }
        )
```

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
- CLI commands `financial-registry validate INPUT` and `financial-registry release-build INPUT OUTPUT --version VERSION --generated-at ISO_TIMESTAMP --generation-commit COMMIT`.
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
            "--generation-commit",
            "fixture-commit",
        ],
    )
    assert result.exit_code == 0
    assert (tmp_path / "schema-version.json").exists()
    assert (tmp_path / "checksums.txt").exists()


def test_release_build_failure_leaves_no_partial_output(tmp_path):
    output = tmp_path / "release"
    result = CliRunner().invoke(
        app,
        [
            "release-build",
            "data/fixtures/invalid.json",
            str(output),
            "--version",
            "not-semver",
            "--generated-at",
            "2026-08-26T00:00:00+00:00",
            "--generation-commit",
            "fixture-commit",
        ],
    )
    assert result.exit_code == 1
    assert not output.exists()
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
        generation_commit="fixture-commit",
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

- `inst_example_bank`, an active commercial bank in `GB` with a curated canonical key, regulator jurisdiction, one BIC, and one verified domain identifier;
- `brand_example_bank`, related through a sourced `brand_of` relationship;
- `brand_example_wallet`, related to a second country-specific institution and represented by a `source_link_only` asset so the release proves metadata-only handling;
- one `redistributable` SVG asset with a stable source URI and SHA-256;
- source definitions with connector versions, one successful source run, and source references for every record;
- one re-key event and one alias proving that source-key changes preserve the canonical ID.

`candidates.json` stores asset `staging_path` values relative to `data/fixtures/logos`; `FixtureConnector.load_registry()` sets `RegistryInput.asset_root` to that directory. The CLI resolves a JSON input's `asset_root` relative to the input file's parent when the path is relative.

Implement the CLI with Typer. `validate` loads JSON into `RegistryInput`, runs `ReleaseBuilder.validate`, prints `valid: <path>` on success, and exits 1 with one issue per line on failure. `release-build` parses the explicit timestamp, calls the builder, prints the release version and output path, and exits 1 without leaving a partial release directory when validation fails.

Use stable stderr prefixes: `error[input_not_found]`, `error[input_invalid]`, `error[release_invalid]`, and `error[release_io]`. Catch only `FileNotFoundError`, `json.JSONDecodeError`, `pydantic.ValidationError`, `ValueError`, `ReleaseValidationError`, and `OSError`; unexpected exceptions must propagate in tests so programming errors are not mislabeled as bad data.

```python
# global-financial-registry/src/financial_registry/cli.py
from datetime import datetime
from pathlib import Path
import json

import typer
from pydantic import ValidationError

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
        issues = ReleaseBuilder().validate(registry, generation_commit="validation")
    except FileNotFoundError as exc:
        typer.echo(f"error[input_not_found] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except (json.JSONDecodeError, ValidationError) as exc:
        typer.echo(f"error[input_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except ReleaseValidationError as exc:
        typer.echo(f"error[release_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except OSError as exc:
        typer.echo(f"error[release_io] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except ValueError as exc:
        typer.echo(f"error[release_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    if issues:
        for issue in issues:
            typer.echo(f"error[release_invalid] {issue}", err=True)
        raise typer.Exit(code=1)
    typer.echo(f"valid: {input_path}")


@app.command("release-build")
def release_build(
    input_path: str = typer.Argument(...),
    output_dir: str = typer.Argument(...),
    version: str = typer.Option(..., "--version"),
    generated_at: str = typer.Option(..., "--generated-at"),
    generation_commit: str = typer.Option(..., "--generation-commit"),
) -> None:
    try:
        registry = _load(input_path)
        timestamp = datetime.fromisoformat(generated_at)
        manifest = ReleaseBuilder().build(
            registry,
            version,
            timestamp,
            Path(output_dir),
            generation_commit=generation_commit,
        )
    except FileNotFoundError as exc:
        typer.echo(f"error[input_not_found] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except (json.JSONDecodeError, ValidationError) as exc:
        typer.echo(f"error[input_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except ReleaseValidationError as exc:
        typer.echo(f"error[release_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except OSError as exc:
        typer.echo(f"error[release_io] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except ValueError as exc:
        typer.echo(f"error[release_invalid] {exc}", err=True)
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
- Create: `.github/workflows/registry-core.yml`

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
        generation_commit="fixture-commit",
    )
    required = {
        "institutions.json",
        "brands.json",
        "identifiers.json",
        "aliases.json",
        "rekey-events.json",
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
    assert all(
        not asset.get("binary_path") or not (tmp_path / asset["binary_path"]).exists()
        for asset in assets
        if asset["rights_status"] == "source_link_only"
    )
    checksums = (tmp_path / "checksums.txt").read_text().splitlines()
    assert {line.split("  ", 1)[1] for line in checksums} == {
        str(path.relative_to(tmp_path))
        for path in tmp_path.rglob("*")
        if path.is_file() and path.name != "checksums.txt"
    }
```

Use this acceptance matrix as the Plan 1 release gate; each row must have one passing fixture assertion and one negative assertion that fails closed:

| Invariant | Passing fixture/assertion | Failing fixture/assertion |
|---|---|---|
| Canonical identity | curated key, alias, and re-key event preserve one institution ID | corrected source key cannot create a duplicate canonical institution |
| Source provenance | every published record references a source and successful `SourceRun` | dangling source/identifier/relationship/asset references produce `missing_provenance` or `dangling_reference` |
| Conflict safety | exact identifier/domain match resolves deterministically | competing exact identifiers/domains produce review with all competing IDs |
| Failure retention | failed connector retains prior snapshot, run ID, warning, and release input | failed run cannot replace the last-successful snapshot with an empty record |
| Rights gate | redistributable asset emits a checked binary; source-link-only emits metadata only | unknown/removed/expired/out-of-territory or unapproved binary fails validation and emits no public file |
| Staging safety | sanitized staging bytes match the declared digest | absolute, `..`, symlink, duplicate, or checksum-mismatched paths fail before output |
| Reproducibility | reordered JSON, fresh parse, changed mtimes, and fixed timestamp produce identical bytes | staged-file mutation between validation and publication aborts atomically |
| Lifecycle | validated bundle can publish, supersede, and withdraw with audit metadata | invalid transition, incomplete checksums, or withdrawal without reason/timestamp is rejected |
| Operational contract | manifest exposes counts, unresolved matches, stale sources, rights gaps, input/source/processor digests | missing/invalid SemVer, naive timestamps, or missing provenance returns a stable CLI error and leaves no partial output |

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
  --generated-at 2026-08-26T00:00:00+00:00 \
  --generation-commit fixture-commit
```

State explicitly that the release bundle is the source of truth; binary assets are emitted only for `redistributable` and `licensed` rights states; `source_link_only` emits metadata and a source URI without a binary; and this package does not perform live regulator scraping in this plan.

Also document that the release contains `aliases.json` and `rekey-events.json`, that this fixture-only core makes no global coverage claim, publishes counts and rights/provenance gaps in `schema-version.json`, stores raw snapshots outside public releases, requires CC BY 4.0 attribution for project-created normalized metadata, and defers schedulers, metrics, object storage, API/CDN, catalog, governance UI, packages, and billing to the later plans.

Create `.github/workflows/registry-core.yml` with a matrix for Python 3.10, 3.11, and 3.12. The job must install `global-financial-registry[dev]`, run `ruff check src tests`, run `python -m pytest -q`, run coverage with a failure threshold of 85%, and never install or import the Relay application. Keep the existing root CI job unchanged.

Use this workflow:

```yaml
name: Global Registry Core

on:
  push:
    paths:
      - "global-financial-registry/**"
      - ".github/workflows/registry-core.yml"
  pull_request:
    paths:
      - "global-financial-registry/**"
      - ".github/workflows/registry-core.yml"

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0
        with:
          python-version: ${{ matrix.python-version }}
      - run: python -m pip install --upgrade pip
      - run: pip install -e '.[dev]'
        working-directory: global-financial-registry
      - run: ruff check src tests
        working-directory: global-financial-registry
      - run: python -m pytest --cov=financial_registry --cov-fail-under=85 -q
        working-directory: global-financial-registry
```

- [ ] **Step 4: Run final verification**

Run:

```bash
cd global-financial-registry
python -m pytest -q
python -m pytest --cov=financial_registry --cov-report=term-missing -q
python -m compileall -q src
ruff check src tests
git diff --check
```

Expected: all tests pass, compilation succeeds, and `git diff --check` reports no whitespace errors. Run the existing root suite separately to verify no Relay behavior changed:

```bash
python -m pytest tests/ -q
```

- [ ] **Step 5: Commit**

```bash
git add global-financial-registry/README.md \
  global-financial-registry/tests/test_release_contract.py \
  .github/workflows/registry-core.yml
git commit -m "docs(registry-core): document release contract"
```

## Plan self-review

- **Spec coverage:** Tasks 1–2 cover the standalone package, complete canonical models, curated IDs, aliases/re-key events, taxonomy, and rights fields. Task 3 covers source definitions, precedence/conflict evidence, durable runs, failure retention, and snapshots. Task 4 covers indexed deterministic resolution, verified-domain trust, aliases, conflict review, and fuzzy-match prevention. Task 5 covers the concrete safe fetcher, URL/DNS/redirect policy, SVG/image sanitization, hashes, limits, variants, and rights gates. Task 6 covers atomic lifecycle-aware release bundles, input/source/processor digests, checksums, path containment, and reproducibility. Tasks 7–8 cover fixture ingestion, negative CLI behavior, contract verification, standalone CI, documentation, and coverage disclaimers. Hosted API/CDN, public catalog, governance UI, packages, billing, and live country connectors are intentionally excluded and belong to the later plans defined by the spec.
- **Placeholder scan:** The plan contains no unresolved placeholders or unspecified test steps.
- **Type consistency:** `RegistryInput`, `ResolverIndex`, `AssetCandidate`, `SourceDefinition`, `SourceRun`, `ReleaseBuilder`, `ReleaseLifecycle`, `FixtureConnector`, `RightsStatus`, `ReleaseStatus`, and `ReleaseManifest` are defined before later tasks consume them; build/validate signatures include the required generation commit and lifecycle inputs.
- **Safety:** The plan uses injected HTTP/DNS transports in tests, rejects unsafe redirects and staged paths, requires licensed permission metadata, never emits restricted binaries, preserves source failures, atomically publishes releases, and keeps the existing Relay application untouched.

## Engineering Review Findings

**Review date:** 2026-08-26
**Verdict:** CLEARED after revision. The original findings are retained as an audit trail; their required decisions, interfaces, tests, and safeguards are now folded into the executable tasks above.
The line references in the historical findings below refer to the pre-revision plan and are retained only to explain why each remediation was added.

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

Synthesized from this review's findings. These hardening tasks are now integrated into the main task sequence and must be completed as part of implementation.

- [ ] **T1 (P1, human: ~1-2 days / CC: ~20 min)** - Canonical schema alignment - expand models and enums to match the approved design, including categories, aliases, geography, lifecycle dates, asset rights/reviewer fields, source-run metadata, and release counts/provenance.
  - Surfaced by: 1A, 1B, 1C, 2B.
  - Files: `global-financial-registry/src/financial_registry/domain.py`, `global-financial-registry/tests/test_domain.py`.
  - Verify: focused domain tests plus serialized fixture snapshots on Python 3.10, 3.11, and 3.12.
- [ ] **T2 (P1, human: ~1 day / CC: ~15 min)** - Canonical identity and identifier ownership - define curated canonical keys, re-key/alias behavior, one identifier source of truth, and multi-owner brand relationships.
  - Surfaced by: 1C, 1D, 1E.
  - Files: `global-financial-registry/src/financial_registry/ids.py`, `domain.py`, `resolver.py`, `tests/test_ids.py`, `tests/test_resolver.py`.
  - Verify: source-key correction, retired identifier, multi-owner brand, and duplicate-prevention tests.
- [ ] **T3 (P1, human: ~1-2 days / CC: ~20 min)** - Source precedence and failure retention - implement deterministic identity/logo precedence, conflict evidence, durable source runs with prior snapshot/run pointers, and last-success preservation.
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
  - Files: `global-financial-registry/pyproject.toml`, `.github/workflows/registry-core.yml`, `tests/test_release_contract.py`, `README.md`.
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
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN | 31 findings folded, 0 unresolved critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | No UI in this plan |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | Not run |

**VERDICT:** ENG CLEARED after revision. The plan is ready for implementation using the revised task order and safeguards.

NO UNRESOLVED DECISIONS
