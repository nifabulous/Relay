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
