import pytest
from pydantic import ValidationError

from financial_registry.domain import (
    Asset,
    Institution,
    ReviewStatus,
    RightsStatus,
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
