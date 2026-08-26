from __future__ import annotations

import socket
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


def default_dns_resolver(hostname: str) -> list[str]:
    return sorted({row[4][0] for row in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)})


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
    try:
        raw_addresses = resolver(parsed.hostname)
    except Exception as exc:
        raise UnsafeSourceUrl(f"DNS resolution failed for {parsed.hostname}: {exc}") from exc
    if not raw_addresses:
        raise UnsafeSourceUrl("source URL resolves to no address")
    addresses = []
    for value in raw_addresses:
        try:
            addresses.append(ip_address(value))
        except ValueError as exc:
            raise UnsafeSourceUrl(f"invalid IP address returned for {parsed.hostname}: {value}") from exc
    if any(
        value.is_private
        or value.is_loopback
        or value.is_link_local
        or value.is_multicast
        or value.is_unspecified
        for value in addresses
    ):
        raise UnsafeSourceUrl("source URL resolves to a non-public address")
    # Also check for IPv4-mapped private/loopback via ipv4_mapped if present
    for value in addresses:
        # For IPv6 addresses, check embedded IPv4
        if value.version == 6 and value.ipv4_mapped is not None:
            mapped = value.ipv4_mapped
            if mapped.is_private or mapped.is_loopback or mapped.is_link_local:
                raise UnsafeSourceUrl("source URL resolves to a non-public address")
    return url


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
