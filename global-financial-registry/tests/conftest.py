from datetime import datetime, timezone

import pytest

from financial_registry.domain import (
    Asset,
    Brand,
    Identifier,
    Institution,
    RegistryInput,
    Relationship,
    RelationType,
    ReviewStatus,
    RightsStatus,
    SourceDefinition,
    SourceRun,
    SourceRunStatus,
    SourceType,
    TrustTier,
)


@pytest.fixture
def demo_registry(tmp_path):
    asset_root = tmp_path / "asset_root"
    logos_dir = asset_root / "logos"
    logos_dir.mkdir(parents=True, exist_ok=True)
    svg_path = logos_dir / "demo.svg"
    svg_path.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#3157D5"/></svg>',
        encoding="utf-8",
    )
    svg_bytes = svg_path.read_bytes()
    import hashlib

    sha = hashlib.sha256(svg_bytes).hexdigest()

    institution = Institution(
        id="inst_demo",
        canonical_key="institution:demo-bank-gb",
        legal_name="Demo Bank",
        normalized_name="demo bank",
        country_code="GB",
        regulator_jurisdiction="GB",
        source_ids=["src_demo"],
        domains=["example.test"],
    )
    brand = Brand(
        id="brand_demo",
        display_name="Demo Bank",
        source_ids=["src_demo"],
        country_codes=["GB"],
        domains=["example.test"],
    )
    identifier = Identifier(
        owner_id="inst_demo",
        type="bic",
        value="DEMOGB2L",
        source_id="src_demo",
    )
    relationship = Relationship(
        id="rel_demo",
        relation_type=RelationType.BRAND_OF,
        from_id="brand_demo",
        to_id="inst_demo",
        source_id="src_demo",
    )
    asset = Asset(
        id="asset_demo",
        owner_id="inst_demo",
        variant="primary",
        format="svg",
        source_id="src_demo",
        source_uri="https://example.test/logo.svg",
        rights_status=RightsStatus.REDISTRIBUTABLE,
        review_status=ReviewStatus.APPROVED,
        sha256=sha,
        binary_path="assets/asset_demo.svg",
        staging_path="logos/demo.svg",
    )
    source = SourceDefinition(
        id="src_demo",
        publisher="Demo Regulator",
        jurisdiction="GB",
        source_type=SourceType.REGULATOR,
        url="https://example.test/register",
        terms_url="https://example.test/terms",
        trust_tier=TrustTier.AUTHORITATIVE,
        check_frequency="daily",
        connector_version="fixture-1",
    )
    source_run = SourceRun(
        id="src_demo:demo",
        source_id="src_demo",
        started_at=datetime(2026, 8, 26, tzinfo=timezone.utc),
        finished_at=datetime(2026, 8, 26, tzinfo=timezone.utc),
        status=SourceRunStatus.SUCCEEDED,
        snapshot_path=str(asset_root / "snapshot.bin"),
        snapshot_sha256="a" * 64,
        candidate_count=1,
    )
    return RegistryInput(
        institutions=[institution],
        brands=[brand],
        identifiers=[identifier],
        relationships=[relationship],
        assets=[asset],
        sources=[source],
        source_runs=[source_run],
        asset_root=str(asset_root),
    )


@pytest.fixture
def flaky_connector(tmp_path):
    # Provide a connector that succeeds once then fails, retaining previous snapshot.
    # Lazy imports avoid hard dependency on snapshots module before Task 3.
    try:
        from financial_registry.domain import SourceDefinition, SourceType, TrustTier
        from financial_registry.snapshots import FilesystemSnapshotStore

        store = FilesystemSnapshotStore(tmp_path / "snapshots")

        class _FlakyConnector:
            def __init__(self):
                self.definition = SourceDefinition(
                    id="src_demo",
                    publisher="Demo Regulator",
                    jurisdiction="XX",
                    source_type=SourceType.REGULATOR,
                    url="https://example.test/register",
                    terms_url="https://example.test/terms",
                    trust_tier=TrustTier.AUTHORITATIVE,
                    check_frequency="daily",
                    connector_version="fixture-1",
                )
                self._calls = 0
                self._store = store

            def fetch(self):
                self._calls += 1
                if self._calls == 1:
                    return self._store.put(
                        self.definition.id,
                        datetime(2026, 8, 26, tzinfo=timezone.utc),
                        b"fixture payload",
                    )
                raise RuntimeError("fixture outage")

            def normalize(self, snapshot):
                from financial_registry.domain import CandidateRecord

                return [
                    CandidateRecord(
                        source_id=self.definition.id,
                        source_record_id="row-1",
                        legal_name="Demo Bank",
                        country_code="GB",
                    )
                ]

        return _FlakyConnector()
    except Exception:
        # Fallback for Task 2 before snapshots exist: minimal stub that will be replaced.
        # Tests that use this fixture in Task 2 are not run; Task 3 will overwrite behavior.
        class _Stub:
            def __init__(self):
                self.definition = SourceDefinition(
                    id="src_demo",
                    publisher="Demo Regulator",
                    jurisdiction="XX",
                    source_type=SourceType.REGULATOR,
                    url="https://example.test/register",
                    terms_url="https://example.test/terms",
                    trust_tier=TrustTier.AUTHORITATIVE,
                    check_frequency="daily",
                    connector_version="fixture-1",
                )

            def fetch(self):
                raise RuntimeError("fixture outage")

            def normalize(self, snapshot):
                return []

        return _Stub()
