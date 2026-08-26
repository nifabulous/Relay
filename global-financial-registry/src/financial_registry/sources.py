from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .domain import CandidateRecord, SourceDefinition, SourceRun, SourceRunStatus, SourceType
from .snapshots import RawSnapshot


@dataclass(frozen=True)
class ConflictEvidence:
    field_kind: str
    winner_source_id: str
    losing_source_id: str
    winner_value: str
    losing_value: str
    reason: str


@dataclass(frozen=True)
class ConnectorRunResult:
    status: SourceRunStatus
    candidate_count: int
    snapshot: RawSnapshot | None
    source_run: SourceRun
    warnings: list[str]
    conflicts: tuple[ConflictEvidence, ...] = ()

    @classmethod
    def succeeded(cls, connector, snapshot, candidate_count, now):
        run = SourceRun(
            id=f"{connector.definition.id}:{snapshot.sha256}",
            source_id=connector.definition.id,
            started_at=now,
            finished_at=now,
            status=SourceRunStatus.SUCCEEDED,
            snapshot_path=snapshot.path,
            snapshot_sha256=snapshot.sha256,
            candidate_count=candidate_count,
        )
        return cls(SourceRunStatus.SUCCEEDED, candidate_count, snapshot, run, [])

    @classmethod
    def failed(cls, connector, previous_snapshot, warning, now, previous_run_id=None):
        previous_digest = previous_snapshot.sha256 if previous_snapshot else None
        run = SourceRun(
            id=f"{connector.definition.id}:{now.isoformat()}:failed",
            source_id=connector.definition.id,
            started_at=now,
            finished_at=now,
            status=SourceRunStatus.FAILED,
            snapshot_path=previous_snapshot.path if previous_snapshot else None,
            snapshot_sha256=previous_digest,
            previous_snapshot_sha256=previous_digest,
            previous_run_id=previous_run_id,
            candidate_count=0,
            warnings=[warning],
        )
        return cls(SourceRunStatus.FAILED, 0, previous_snapshot, run, [warning])


class Connector(Protocol):
    definition: SourceDefinition

    def fetch(self) -> RawSnapshot: ...

    def normalize(self, snapshot: RawSnapshot) -> list[CandidateRecord]: ...


def source_precedence(source_type: SourceType, field_kind: str) -> int:
    identity = {SourceType.REGULATOR: 10, SourceType.GLEIF: 20, SourceType.BIC: 30}
    logo = {SourceType.OFFICIAL_DOMAIN: 10, SourceType.OPEN_FINANCE: 20, SourceType.REPOSITORY: 30}
    table = logo if field_kind == "logo" else identity
    return table.get(source_type, 90)


def run_connector(connector, previous_snapshot, now, previous_run_id=None):
    try:
        snapshot = connector.fetch()
        candidates = connector.normalize(snapshot)
        return ConnectorRunResult.succeeded(connector, snapshot, len(candidates), now)
    except Exception as exc:
        return ConnectorRunResult.failed(connector, previous_snapshot, str(exc), now, previous_run_id)
