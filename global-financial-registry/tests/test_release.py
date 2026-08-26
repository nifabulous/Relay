from datetime import datetime, timezone
from pathlib import Path

import pytest

from financial_registry.domain import RegistryInput, ReleaseStatus, RightsStatus
from financial_registry.release import ReleaseBuilder, ReleaseLifecycle, ReleaseValidationError


def test_release_is_byte_for_byte_reproducible(tmp_path, demo_registry: RegistryInput):
    generated_at = datetime(2026, 8, 26, tzinfo=timezone.utc)
    first_dir = tmp_path / "first"
    second_dir = tmp_path / "second"
    ReleaseBuilder().build(demo_registry, "0.1.0", generated_at, first_dir, generation_commit="test-commit")
    ReleaseBuilder().build(demo_registry, "0.1.0", generated_at, second_dir, generation_commit="test-commit")
    first = sorted(path.relative_to(first_dir) for path in first_dir.rglob("*") if path.is_file())
    second = sorted(path.relative_to(second_dir) for path in second_dir.rglob("*") if path.is_file())
    assert first == second
    for relative in first:
        assert (first_dir / relative).read_bytes() == (second_dir / relative).read_bytes()


def test_release_is_invariant_to_input_order_fresh_parse_and_mtime(tmp_path, demo_registry: RegistryInput):
    import json
    import os

    generated_at = datetime(2026, 8, 26, tzinfo=timezone.utc)
    reordered = demo_registry.model_copy(deep=True)
    for field in ("institutions", "brands", "identifiers", "aliases", "rekey_events", "relationships", "assets", "sources", "source_runs"):
        values = getattr(reordered, field)
        values.reverse()
    reparsed = RegistryInput.model_validate(json.loads(demo_registry.model_dump_json()))
    os.utime(Path(reparsed.asset_root) / "logos" / "demo.svg", (1, 1))
    first_dir = tmp_path / "ordered"
    second_dir = tmp_path / "reparsed"
    ReleaseBuilder().build(reordered, "0.1.0", generated_at, first_dir, generation_commit="test-commit")
    ReleaseBuilder().build(reparsed, "0.1.0", generated_at, second_dir, generation_commit="test-commit")
    first = sorted(path.relative_to(first_dir) for path in first_dir.rglob("*") if path.is_file())
    second = sorted(path.relative_to(second_dir) for path in second_dir.rglob("*") if path.is_file())
    assert first == second
    assert [(path, (first_dir / path).read_bytes()) for path in first] == [
        (path, (second_dir / path).read_bytes()) for path in second
    ]


def test_release_rejects_invalid_semver_and_naive_timestamp(tmp_path, demo_registry: RegistryInput):
    with pytest.raises(ReleaseValidationError, match="SemVer"):
        ReleaseBuilder().build(
            demo_registry,
            "1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            tmp_path / "bad-version",
            generation_commit="test-commit",
        )
    with pytest.raises(ReleaseValidationError, match="UTC"):
        ReleaseBuilder().build(
            demo_registry,
            "1.0.0",
            datetime(2026, 8, 26),
            tmp_path / "naive-time",
            generation_commit="test-commit",
        )


def test_release_rejects_binary_with_unknown_rights(tmp_path, demo_registry: RegistryInput):
    demo_registry.assets[0].rights_status = RightsStatus.UNKNOWN
    with pytest.raises(ReleaseValidationError, match="rights"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            tmp_path / "release",
            generation_commit="test-commit",
        )


def test_release_rejects_staging_path_escape(tmp_path, demo_registry: RegistryInput):
    demo_registry.assets[0].staging_path = "../outside.svg"
    with pytest.raises(ReleaseValidationError, match="staging"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            tmp_path / "release",
            generation_commit="test-commit",
        )


def test_release_has_input_and_processor_digests(tmp_path, demo_registry: RegistryInput):
    manifest = ReleaseBuilder().build(
        demo_registry,
        "0.1.0",
        datetime(2026, 8, 26, tzinfo=timezone.utc),
        tmp_path / "release",
        generation_commit="test-commit",
    )
    assert len(manifest.input_sha256) == 64
    assert manifest.processor_version
    assert manifest.provenance_coverage == 1


def test_release_rejects_expired_licensed_asset(tmp_path, demo_registry: RegistryInput):
    demo_registry.assets[0].rights_status = RightsStatus.LICENSED
    demo_registry.assets[0].permission_reference = "permission/demo"
    demo_registry.assets[0].expires_at = datetime(2026, 8, 25, tzinfo=timezone.utc)
    with pytest.raises(ReleaseValidationError, match="expired"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            tmp_path / "release",
            generation_commit="test-commit",
        )


def test_release_rejects_licensed_asset_outside_territory(tmp_path, demo_registry: RegistryInput):
    demo_registry.assets[0].rights_status = RightsStatus.LICENSED
    demo_registry.assets[0].permission_reference = "permission/demo"
    demo_registry.assets[0].territories = ["US"]
    with pytest.raises(ReleaseValidationError, match="territory"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            tmp_path / "release",
            generation_commit="test-commit",
        )


def test_release_lifecycle_requires_valid_transition(tmp_path, demo_registry: RegistryInput):
    manifest = ReleaseBuilder().build(
        demo_registry,
        "0.1.0",
        datetime(2026, 8, 26, tzinfo=timezone.utc),
        tmp_path / "release",
        generation_commit="test-commit",
    )
    published = ReleaseLifecycle.promote(manifest, ReleaseStatus.PUBLISHED)
    superseded = ReleaseLifecycle.promote(
        published,
        ReleaseStatus.SUPERSEDED,
        successor="0.2.0",
    )
    assert superseded.successor_release == "0.2.0"
    withdrawn = ReleaseLifecycle.promote(
        published,
        ReleaseStatus.WITHDRAWN,
        reason="rights request",
        at=datetime(2026, 8, 27, tzinfo=timezone.utc),
    )
    assert withdrawn.lifecycle_status is ReleaseStatus.WITHDRAWN
