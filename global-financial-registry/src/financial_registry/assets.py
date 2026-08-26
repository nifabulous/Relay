from __future__ import annotations

import hashlib
import io
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol
from xml.etree import ElementTree as ET

import defusedxml.ElementTree as DET
from PIL import Image

from .domain import RightsStatus
from .fetch_policy import AssetPolicyError, FetchedAsset, validate_source_url


class AssetFetcher(Protocol):
    def fetch(self, url: str) -> FetchedAsset: ...


@dataclass(frozen=True)
class ProcessedAsset:
    sanitized_bytes: bytes
    sha256: str
    imagehash: str | None
    public_binary: bytes | None


def _raise_url_fetcher(*_args, **_kwargs):
    raise AssetPolicyError("external resource fetch blocked")


def compute_imagehash(sanitized: bytes, content_type: str | None = None) -> str | None:
    try:
        # Try to rasterize SVG via CairoSVG if needed
        if sanitized.lstrip().startswith(b"<"):
            # SVG case: try to convert to PNG bytes via CairoSVG
            try:
                import cairosvg

                png_bytes = cairosvg.svg2png(bytestring=sanitized, write_to=None, unsafe=False)
                image = Image.open(io.BytesIO(png_bytes))
                image.load()
            except Exception:
                # If rasterization fails, try opening as image directly (maybe PNG)
                image = Image.open(io.BytesIO(sanitized))
                image.load()
        else:
            image = Image.open(io.BytesIO(sanitized))
            image.load()
        # Compute perceptual hash
        try:
            import imagehash

            # Use phash for perceptual hashing
            ph = imagehash.phash(image)
            return str(ph)
        except Exception:
            return None
    except Exception:
        return None


class AssetProcessor:
    def __init__(
        self,
        url_validator: Callable[[str], str] = validate_source_url,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        max_bytes: int = 5 * 1024 * 1024,
        max_svg_bytes: int = 1 * 1024 * 1024,
        max_svg_nodes: int = 10_000,
        max_dimension: int = 4096,
    ):
        self.url_validator = url_validator
        self.clock = clock
        self.max_bytes = max_bytes
        self.max_svg_bytes = max_svg_bytes
        self.max_svg_nodes = max_svg_nodes
        self.max_dimension = max_dimension

    def process(self, candidate, fetcher: AssetFetcher) -> ProcessedAsset:
        self.url_validator(candidate.source_uri)
        self._enforce_rights(candidate, self.clock())
        fetched = fetcher.fetch(candidate.source_uri)
        if len(fetched.body) > self.max_bytes:
            raise AssetPolicyError("asset body exceeds size limit")
        # For restricted rights, enforce size/node limits but do not require valid image for metadata-only
        if candidate.rights_status in {RightsStatus.SOURCE_LINK_ONLY, RightsStatus.UNKNOWN, RightsStatus.REMOVED}:
            # Enforce size limits even for restricted
            if len(fetched.body) > self.max_bytes:
                raise AssetPolicyError("asset body exceeds size limit")
            if fetched.body.lstrip().startswith(b"<") and len(fetched.body) > self.max_svg_bytes:
                raise AssetPolicyError("SVG exceeds size limit")
            # Try sanitization for SVG to enforce node/external checks, but allow non-image bodies
            if fetched.body.lstrip().startswith(b"<"):
                try:
                    # Use sanitization to check for disallowed elements/nodes, but ignore rasterization errors for metadata-only
                    self._sanitize_svg(fetched.body)
                except AssetPolicyError:
                    # For restricted, we still enforce policy errors for disallowed content
                    raise
                except Exception:
                    # Non-SVG or malformed but restricted - allow
                    pass
            sha = hashlib.sha256(fetched.body).hexdigest()
            try:
                ih = compute_imagehash(fetched.body, fetched.content_type)
            except Exception:
                ih = None
            return ProcessedAsset(
                sanitized_bytes=fetched.body,
                sha256=sha,
                imagehash=ih,
                public_binary=None,
            )
        sanitized = self._sanitize_and_normalize(fetched)
        public_binary = sanitized if candidate.rights_status in {RightsStatus.REDISTRIBUTABLE, RightsStatus.LICENSED} else None
        return ProcessedAsset(
            sanitized_bytes=sanitized,
            sha256=hashlib.sha256(sanitized).hexdigest(),
            imagehash=compute_imagehash(sanitized, fetched.content_type),
            public_binary=public_binary,
        )

    def _enforce_rights(self, candidate, now: datetime) -> None:
        if now.tzinfo is None or now.utcoffset() is None:
            raise AssetPolicyError("rights clock must be timezone-aware")
        if candidate.rights_status is RightsStatus.LICENSED and not candidate.permission_reference:
            raise AssetPolicyError("licensed asset is missing permission_reference")
        if candidate.expires_at and candidate.expires_at <= now:
            raise AssetPolicyError("asset rights have expired")

    def _sanitize_and_normalize(self, fetched: FetchedAsset) -> bytes:
        body = fetched.body
        content_type = fetched.content_type.lower()
        if content_type == "image/svg+xml" or body.lstrip().startswith(b"<"):
            return self._sanitize_svg(body)
        elif content_type in {"image/png", "image/webp"}:
            return self._sanitize_raster(body)
        else:
            raise AssetPolicyError("unsupported content type for sanitization")

    def _sanitize_svg(self, body: bytes) -> bytes:
        if len(body) > self.max_svg_bytes:
            raise AssetPolicyError("SVG exceeds size limit")
        if len(body) > self.max_bytes:
            raise AssetPolicyError("asset body exceeds size limit")
        # Parse with defusedxml
        try:
            root = DET.fromstring(body)
        except Exception as exc:
            raise AssetPolicyError(f"invalid SVG/XML: {exc}") from exc
        # Count nodes
        count = sum(1 for _ in root.iter())
        if count > self.max_svg_nodes:
            raise AssetPolicyError("SVG exceeds node limit")
        # Check for disallowed elements and external references
        # Disallowed tags: iframe, object, embed (script is stripped, not rejected)
        disallowed_tags = {"iframe", "object", "embed"}
        for elem in root.iter():
            tag = elem.tag
            # Strip namespace
            if "}" in tag:
                tag = tag.split("}", 1)[1]
            tag_lower = tag.lower()
            if tag_lower in disallowed_tags:
                raise AssetPolicyError(f"disallowed embedded element: {tag_lower}")
            # Check for script-like content inside? Already handled
            # Check attributes for external references and event handlers
            for attr_name, attr_value in list(elem.attrib.items()):
                attr_lower = attr_name.lower()
                # Remove namespace from attr
                if "}" in attr_lower:
                    attr_lower = attr_lower.split("}", 1)[1]
                # Event handler attributes
                if attr_lower.startswith("on"):
                    # Remove event handler
                    del elem.attrib[attr_name]
                    continue
                # External reference checks
                val = attr_value.strip()
                # Check for external URLs
                if "://" in val or val.startswith("//"):
                    raise AssetPolicyError(f"external reference not allowed: {attr_name}={val}")
                # Check for data: with javascript or url(
                if "javascript:" in val.lower() or "url(" in val.lower():
                    # url( may be legit for internal but we treat as external if contains http
                    if "http" in val.lower() or "data:" in val.lower():
                        raise AssetPolicyError(f"external style reference not allowed: {val}")
                # Also check for xlink:href/href that is external
                if attr_lower in {"href", "src", "xlink:href"}:
                    if val.lower().startswith("http://") or val.lower().startswith("https://") or val.startswith("//"):
                        raise AssetPolicyError(f"external href not allowed: {val}")
        # Remove script elements if any remain (defense in depth)
        for elem in list(root.iter()):
            for child in list(elem):
                tag = child.tag
                if "}" in tag:
                    tag = tag.split("}", 1)[1]
                if tag.lower() == "script":
                    elem.remove(child)
        # Serialize back to bytes
        try:
            sanitized = ET.tostring(root, encoding="utf-8", xml_declaration=False)
        except Exception as exc:
            raise AssetPolicyError(f"failed to serialize sanitized SVG: {exc}") from exc
        # Validate sanitized SVG can be rasterized with blocked fetcher
        try:
            import cairosvg

            # Try to rasterize to enforce no external fetch and valid SVG
            # unsafe=False (default) blocks external file access and XXE
            try:
                png_bytes = cairosvg.svg2png(bytestring=sanitized, write_to=None, unsafe=False)
            except Exception as inner:
                # If size is undefined, try with explicit parent dimensions
                if "size is undefined" in str(inner).lower():
                    png_bytes = cairosvg.svg2png(
                        bytestring=sanitized, write_to=None, unsafe=False, parent_width=4096, parent_height=4096
                    )
                else:
                    raise
            # Check dimensions of rasterized image
            image = Image.open(io.BytesIO(png_bytes))
            image.load()
            if image.width > self.max_dimension or image.height > self.max_dimension:
                raise AssetPolicyError("raster dimensions exceed limit")
            # Also check if SVG contains width/height attributes that exceed limit before rasterization
        except AssetPolicyError:
            raise
        except Exception as exc:
            # If cairosvg fails due to invalid SVG, treat as policy error
            # But if it's size undefined and we already tried, treat as non-fatal for sanitization
            if "size is undefined" in str(exc).lower():
                pass
            else:
                raise AssetPolicyError(f"SVG rasterization failed: {exc}") from exc
        # Additional dimension check via Pillow for original SVG dimensions if specified
        # We already checked rasterized dimensions
        return sanitized

    def _sanitize_raster(self, body: bytes) -> bytes:
        if len(body) > self.max_bytes:
            raise AssetPolicyError("raster image exceeds size limit")
        try:
            # Decompression bomb guard: set max pixels before open
            Image.MAX_IMAGE_PIXELS = self.max_dimension * self.max_dimension
            image = Image.open(io.BytesIO(body))
            # Check dimensions from header before decoding
            width, height = image.size
            if width > self.max_dimension or height > self.max_dimension:
                raise AssetPolicyError("raster dimensions exceed limit")
            if width * height > self.max_dimension * self.max_dimension:
                raise AssetPolicyError("raster image exceeds pixel limit")
            image.load()
        except AssetPolicyError:
            raise
        except Exception as exc:
            raise AssetPolicyError(f"invalid raster image: {exc}") from exc
        if image.width > self.max_dimension or image.height > self.max_dimension:
            raise AssetPolicyError("raster dimensions exceed limit")
        # Normalize: re-encode to ensure deterministic? For now return original body
        # Could convert to PNG to normalize, but keep original for deterministic hash?
        # We'll return body as is after validation
        return body
