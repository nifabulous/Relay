import httpx
import pytest

from financial_registry.fetch_policy import (
    AssetPolicyError,
    SafeHttpxAssetFetcher,
    UnsafeSourceUrl,
    validate_source_url,
)


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
