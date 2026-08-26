import json
from datetime import datetime, timezone

from financial_registry.connectors.fixture import FixtureConnector
from financial_registry.release import ReleaseBuilder


def test_release_contract_has_required_files_and_rights_gate(tmp_path):
    registry = FixtureConnector("data/fixtures").load_registry()
    ReleaseBuilder().build(
        registry,
        "0.1.0",
        datetime(2026, 8, 26, tzinfo=timezone.utc),
        tmp_path,
        generation_commit="fixture-commit",
    )
    required = {
        "institutions.json",
        "brands.json",
        "identifiers.json",
        "aliases.json",
        "rekey-events.json",
        "relationships.json",
        "assets-manifest.json",
        "sources.json",
        "checksums.txt",
        "schema-version.json",
    }
    assert required <= {path.name for path in tmp_path.iterdir()}
    assets = json.loads((tmp_path / "assets-manifest.json").read_text())
    assert all(asset["rights_status"] in {"redistributable", "licensed", "source_link_only"} for asset in assets)
    assert all(asset.get("binary_path") is not None for asset in assets if asset["rights_status"] in {"redistributable", "licensed"})
    assert all(
        not asset.get("binary_path") or not (tmp_path / asset["binary_path"]).exists()
        for asset in assets
        if asset["rights_status"] == "source_link_only"
    )
    checksums = (tmp_path / "checksums.txt").read_text().splitlines()
    assert {line.split("  ", 1)[1] for line in checksums} == {
        str(path.relative_to(tmp_path))
        for path in tmp_path.rglob("*")
        if path.is_file() and path.name != "checksums.txt"
    }
