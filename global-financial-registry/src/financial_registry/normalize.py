import unicodedata
from urllib.parse import urlparse


def normalize_name(value: str) -> str:
    if not isinstance(value, str):
        raise TypeError("name must be a string")
    normalized = unicodedata.normalize("NFKC", value)
    normalized = normalized.casefold()
    # Remove punctuation characters (Unicode category P*)
    filtered = "".join(ch for ch in normalized if not unicodedata.category(ch).startswith("P"))
    collapsed = " ".join(filtered.split())
    return collapsed


def normalize_domain(value: str) -> str:
    if not isinstance(value, str):
        raise TypeError("domain must be a string")
    value = value.strip()
    if not value:
        return ""
    # Ensure urlparse can extract hostname; add scheme if missing
    to_parse = value if "://" in value else f"https://{value}"
    parsed = urlparse(to_parse)
    hostname = parsed.hostname or value
    # hostname may still contain unicode; casefold and strip
    hostname = hostname.strip().casefold().rstrip(".")
    hostname = hostname.removeprefix("www.")
    # Remove port if present (hostname already excludes port, but for non-url fallback)
    # IDNA encoding for unicode domains
    try:
        hostname = hostname.encode("idna").decode("ascii")
    except Exception:
        # If IDNA fails, keep as is (already ascii)
        pass
    return hostname


def normalize_identifier(type: str, value: str) -> str:
    if not isinstance(type, str) or not isinstance(value, str):
        raise TypeError("identifier type and value must be strings")
    normalized = unicodedata.normalize("NFKC", value).strip()
    t = type.strip().casefold()
    if t in {"bic", "swift", "lei", "national", "national_code"}:
        # Remove spaces, hyphens, and then uppercase
        cleaned = "".join(ch for ch in normalized if ch not in " \t\n\r-")
        return cleaned.upper()
    # Generic: remove whitespace and uppercase
    cleaned = "".join(normalized.split())
    # Also remove hyphens for generic?
    cleaned = cleaned.replace("-", "")
    return cleaned.upper()
