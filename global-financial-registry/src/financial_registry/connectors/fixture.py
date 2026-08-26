from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from ..domain import CandidateRecord, RegistryInput
from ..snapshots import RawSnapshot


class FixtureConnector:
    def __init__(self, fixtures_dir: str | Path = "data/fixtures"):
        # Resolve fixtures_dir robustly: try as given, then try relative to package root
        p = Path(fixtures_dir)
        if not p.is_absolute():
            # Try relative to cwd
            if (Path.cwd() / p).exists():
                p = (Path.cwd() / p).resolve()
            elif (Path.cwd() / "global-financial-registry" / p).exists():
                p = (Path.cwd() / "global-financial-registry" / p).resolve()
            else:
                # Try relative to this file's package root (src's parent)
                # global-financial-registry/data/fixtures
                pkg_root = Path(__file__).resolve().parents[3]
                candidate = pkg_root / p
                if candidate.exists():
                    p = candidate.resolve()
                else:
                    # Fallback to resolved given
                    p = p.resolve()
        else:
            p = p.resolve()
        self.fixtures_dir = p
        # Load source definition for definition attribute
        source_def_path = self.fixtures_dir / "source-definition.json"
        if source_def_path.exists():
            from ..domain import SourceDefinition

            self.definition = SourceDefinition.model_validate(json.loads(source_def_path.read_text(encoding="utf-8")))
        else:
            # Fallback dummy
            from ..domain import SourceDefinition, SourceType, TrustTier

            self.definition = SourceDefinition(
                id="src_fixture",
                publisher="Fixture",
                jurisdiction="GB",
                source_type=SourceType.REGULATOR,
                url="https://example.test/register",
                terms_url="https://example.test/terms",
                trust_tier=TrustTier.AUTHORITATIVE,
                check_frequency="daily",
                connector_version="fixture-1",
            )

    def load_registry(self) -> RegistryInput:
        candidates_path = self.fixtures_dir / "candidates.json"
        if not candidates_path.exists():
            # Try alternative: fixtures_dir may be "data/fixtures" relative to global-financial-registry
            alt = Path.cwd() / "global-financial-registry" / "data" / "fixtures" / "candidates.json"
            if alt.exists():
                candidates_path = alt
        data = json.loads(candidates_path.read_text(encoding="utf-8"))
        registry = RegistryInput.model_validate(data)
        # Set asset_root to logos directory
        logos_dir = self.fixtures_dir / "logos"
        if not logos_dir.exists():
            alt_logos = Path.cwd() / "global-financial-registry" / "data" / "fixtures" / "logos"
            if alt_logos.exists():
                logos_dir = alt_logos
        # Resolve asset_root: if registry has asset_root relative, resolve it relative to fixtures_dir
        # But spec says set to logos directory absolute
        registry = registry.model_copy(update={"asset_root": str(logos_dir.resolve())})
        return registry

    def fetch(self) -> RawSnapshot:
        # Return snapshot of candidates.json content
        candidates_path = self.fixtures_dir / "candidates.json"
        body = candidates_path.read_bytes()
        from hashlib import sha256

        digest = sha256(body).hexdigest()
        # Use a temporary snapshot store? For simplicity, return RawSnapshot with path to candidates file
        return RawSnapshot(
            source_id=self.definition.id,
            retrieved_at=datetime.now(timezone.utc),
            sha256=digest,
            path=str(candidates_path.resolve()),
        )

    def normalize(self, snapshot: RawSnapshot) -> list[CandidateRecord]:
        # Parse candidates.json and return candidate records (simplified)
        data = json.loads(Path(snapshot.path).read_bytes())
        # If data is RegistryInput-like, convert institutions to CandidateRecords
        candidates = []
        for inst in data.get("institutions", []):
            candidates.append(
                CandidateRecord(
                    source_id=self.definition.id,
                    source_record_id=inst.get("id", ""),
                    legal_name=inst.get("legal_name", ""),
                    country_code=inst.get("country_code", "GB"),
                    regulator_jurisdiction=inst.get("regulator_jurisdiction"),
                    categories=inst.get("categories", []),
                    aliases=inst.get("aliases", []),
                    operating_markets=inst.get("operating_markets", []),
                    domains=inst.get("domains", []),
                )
            )
        return candidates
