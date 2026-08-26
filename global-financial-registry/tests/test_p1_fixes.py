from datetime import datetime, timezone
from pathlib import Path

import pytest

from financial_registry.domain import RightsStatus
from financial_registry.release import ReleaseBuilder, ReleaseStatus, ReleaseValidationError
from financial_registry.snapshots import FilesystemSnapshotStore


def test_asset_path_overwrite_rejected(demo_registry):
    demo_registry.assets[0].binary_path = "institutions.json"
    with pytest.raises(ReleaseValidationError, match="binary path"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            Path("/tmp/test_overwrite"),
            generation_commit="test",
        )


def test_asset_path_not_derived_rejected(demo_registry):
    demo_registry.assets[0].binary_path = "assets/wrong_name.svg"
    with pytest.raises(ReleaseValidationError, match="derived from asset ID"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            Path("/tmp/test_derived"),
            generation_commit="test",
        )


def test_lifecycle_bypass_rejected(demo_registry):
    with pytest.raises(ReleaseValidationError, match="lifecycle"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            Path("/tmp/test_lifecycle"),
            generation_commit="test",
            lifecycle=ReleaseStatus.PUBLISHED,
        )


def test_failed_source_run_rejected(demo_registry):
    # Make source run failed
    demo_registry.source_runs[0].status = "failed"  # type: ignore
    # Need to use enum
    from financial_registry.domain import SourceRunStatus

    demo_registry.source_runs[0].status = SourceRunStatus.FAILED
    with pytest.raises(ReleaseValidationError, match="stale_source|successful"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            Path("/tmp/test_failed"),
            generation_commit="test",
        )


def test_licensed_no_territory_rejected(demo_registry):
    demo_registry.assets[0].rights_status = RightsStatus.LICENSED
    demo_registry.assets[0].permission_reference = "perm"
    demo_registry.assets[0].territories = []
    with pytest.raises(ReleaseValidationError, match="territory"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            Path("/tmp/test_licensed_territory"),
            generation_commit="test",
        )


def test_snapshot_rejects_dotdot(tmp_path):
    store = FilesystemSnapshotStore(tmp_path)
    with pytest.raises(ValueError, match="path-safe"):
        store.put("..", datetime(2026, 8, 26, tzinfo=timezone.utc), b"data")
    with pytest.raises(ValueError, match="path-safe"):
        store.put(".", datetime(2026, 8, 26, tzinfo=timezone.utc), b"data")


def test_semver_rejects_invalid_prerelease(demo_registry):
    with pytest.raises(ReleaseValidationError, match="SemVer"):
        ReleaseBuilder().build(
            demo_registry,
            "1.0.0-alpha..1",
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            Path("/tmp/test_semver"),
            generation_commit="test",
        )


def test_utc_rejects_non_utc_offset(demo_registry):
    from datetime import timedelta

    tz_plus5 = timezone(timedelta(hours=5))
    dt_plus5 = datetime(2026, 8, 26, tzinfo=tz_plus5)
    with pytest.raises(ReleaseValidationError, match="UTC"):
        ReleaseBuilder().build(
            demo_registry,
            "0.1.0",
            dt_plus5,
            Path("/tmp/test_utc"),
            generation_commit="test",
        )
