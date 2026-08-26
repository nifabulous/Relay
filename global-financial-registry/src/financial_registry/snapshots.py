import os
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path


@dataclass(frozen=True)
class RawSnapshot:
    source_id: str
    retrieved_at: datetime
    sha256: str
    path: str


class FilesystemSnapshotStore:
    def __init__(self, root: str | Path, max_snapshot_bytes: int = 50 * 1024 * 1024):
        self.root = Path(root).resolve()
        self.max_snapshot_bytes = max_snapshot_bytes

    def put(self, source_id: str, retrieved_at: datetime, body: bytes) -> RawSnapshot:
        if not source_id or Path(source_id).name != source_id:
            raise ValueError("source_id must be a single path-safe component")
        if retrieved_at.tzinfo is None or retrieved_at.utcoffset() is None:
            raise ValueError("retrieved_at must be timezone-aware")
        if len(body) > self.max_snapshot_bytes:
            raise ValueError("snapshot exceeds size limit")
        digest = sha256(body).hexdigest()
        path = self.root / source_id / f"{digest}.bin"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            temporary = path.with_suffix(".tmp")
            with temporary.open("wb") as handle:
                handle.write(body)
                handle.flush()
                os.fsync(handle.fileno())
            temporary.replace(path)
            try:
                directory_fd = os.open(path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            except OSError:
                pass
        return RawSnapshot(source_id, retrieved_at, digest, str(path))

    def read(self, snapshot: RawSnapshot) -> bytes:
        path = Path(snapshot.path).resolve()
        path.relative_to(self.root)
        body = path.read_bytes()
        if sha256(body).hexdigest() != snapshot.sha256:
            raise ValueError("snapshot checksum mismatch")
        return body

    def prune(self, source_id: str, keep_digests: set[str]) -> list[RawSnapshot]:
        if not source_id or Path(source_id).name != source_id:
            raise ValueError("source_id must be a single path-safe component")
        if any(
            len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest)
            for digest in keep_digests
        ):
            raise ValueError("keep_digests must contain lowercase SHA-256 values")
        source_dir = (self.root / source_id).resolve()
        source_dir.relative_to(self.root)
        if not source_dir.exists():
            return []
        removed = []
        for path in sorted(source_dir.glob("*.bin")):
            digest = path.stem
            if digest in keep_digests:
                continue
            stat = path.stat()
            path.unlink()
            removed.append(
                RawSnapshot(
                    source_id=source_id,
                    retrieved_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                    sha256=digest,
                    path=str(path),
                )
            )
        for temporary in source_dir.glob("*.tmp"):
            temporary.unlink()
        return removed
