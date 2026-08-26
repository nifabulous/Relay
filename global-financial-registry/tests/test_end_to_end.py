import json
from datetime import datetime, timezone

from financial_registry.connectors.fixture import FixtureConnector
from financial_registry.release import ReleaseBuilder


def test_fixture_connector_produces_publishable_release(tmp_path):
    registry = FixtureConnector("data/fixtures").load_registry()
    ReleaseBuilder().build(
        registry,
        "0.1.0",
        datetime(2026, 8, 26, tzinfo=timezone.utc),
        tmp_path,
        generation_commit="fixture-commit",
    )
    manifest = json.loads((tmp_path / "schema-version.json").read_text())
    assert manifest["release_version"] == "0.1.0"
    assert (tmp_path / "assets-manifest.json").exists()
