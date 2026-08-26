from datetime import datetime, timezone

import pytest

from financial_registry.snapshots import FilesystemSnapshotStore


def test_snapshot_store_is_content_addressed(tmp_path):
    store = FilesystemSnapshotStore(tmp_path)
    retrieved_at = datetime(2026, 8, 26, tzinfo=timezone.utc)
    first = store.put("src_demo", retrieved_at, b"same payload")
    second = store.put("src_demo", retrieved_at, b"same payload")
    assert first.sha256 == second.sha256
    assert first.path == second.path
    assert store.read(first) == b"same payload"


def test_snapshot_store_rejects_path_unsafe_source_id(tmp_path):
    store = FilesystemSnapshotStore(tmp_path)
    with pytest.raises(ValueError, match="path-safe"):
        store.put("../escape", datetime(2026, 8, 26, tzinfo=timezone.utc), b"payload")


def test_snapshot_prune_requires_explicit_keep_set(tmp_path):
    store = FilesystemSnapshotStore(tmp_path)
    retrieved_at = datetime(2026, 8, 26, tzinfo=timezone.utc)
    old = store.put("src_demo", retrieved_at, b"old")
    current = store.put("src_demo", retrieved_at, b"current")
    removed = store.prune("src_demo", keep_digests={current.sha256})
    assert old.sha256 in {item.sha256 for item in removed}
    assert store.read(current) == b"current"


def test_snapshot_store_enforces_size_limit(tmp_path):
    store = FilesystemSnapshotStore(tmp_path, max_snapshot_bytes=4)
    with pytest.raises(ValueError, match="size"):
        store.put("src_demo", datetime(2026, 8, 26, tzinfo=timezone.utc), b"12345")
