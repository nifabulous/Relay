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
