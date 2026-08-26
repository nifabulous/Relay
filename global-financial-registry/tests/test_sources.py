from datetime import datetime, timezone

from financial_registry.domain import SourceDefinition, SourceType, TrustTier
from financial_registry.sources import ConflictEvidence, run_connector, source_precedence


def test_source_definition_carries_terms_and_schedule():
    source = SourceDefinition(
        id="src_regulator_demo",
        publisher="Demo Regulator",
        jurisdiction="XX",
        source_type=SourceType.REGULATOR,
        url="https://regulator.example.test/register",
        terms_url="https://regulator.example.test/terms",
        trust_tier=TrustTier.AUTHORITATIVE,
        check_frequency="daily",
        connector_version="fixture-1",
    )
    assert source.trust_tier.value == "authoritative"
    assert source.check_frequency == "daily"


def test_identity_and_logo_precedence_are_separate():
    assert source_precedence(SourceType.REGULATOR, "identity") < source_precedence(SourceType.REPOSITORY, "identity")
    assert source_precedence(SourceType.OFFICIAL_DOMAIN, "logo") < source_precedence(SourceType.REGULATOR, "logo")


def test_conflict_evidence_retains_losing_value():
    evidence = ConflictEvidence(
        field_kind="identity",
        winner_source_id="src_regulator",
        losing_source_id="src_repository",
        winner_value="Demo Bank PLC",
        losing_value="Demo Bank",
        reason="authoritative source precedence",
    )
    assert evidence.losing_value == "Demo Bank"


def test_failed_run_retains_previous_verified_snapshot(flaky_connector):
    connector = flaky_connector
    first = run_connector(connector, previous_snapshot=None, now=datetime(2026, 8, 26, tzinfo=timezone.utc))
    second = run_connector(
        connector,
        previous_snapshot=first.snapshot,
        previous_run_id=first.source_run.id,
        now=datetime(2026, 8, 27, tzinfo=timezone.utc),
    )
    assert first.status.value == "succeeded"
    assert second.status.value == "failed"
    assert second.snapshot == first.snapshot
    assert second.source_run.previous_snapshot_sha256 == first.snapshot.sha256
    assert second.source_run.previous_run_id == first.source_run.id
    assert second.warnings
