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
