from datetime import date

from app.models import SSI
from app.services.ssi_quality import build_quality_snapshot


def _row(**overrides):
    values = {
        "beneficiary_bic": "BANKUS33XXX",
        "beneficiary_bank_name": "Example Bank",
        "currency": "USD",
        "intermediary_bic": "CITIUS33XXX",
        "intermediary_bank_name": "Citibank N.A.",
        "intermediary_account": "ACCT-0001",
        "beneficiary_account": "ACCT-0002",
        "charge_code": "SHA",
        "value_date": "spot",
        "notes": "Source: https://example.test/ssi",
        "as_of": "2026-09-01",
        "status": "unverified",
        "bic_only": False,
        "terms_inferred": False,
    }
    values.update(overrides)
    return SSI(**values)


def test_quality_snapshot_keeps_instruction_and_bic_only_denominators_distinct(db_session_clean):
    db_session_clean.query(SSI).delete()
    db_session_clean.add_all([
        _row(),
        _row(
            beneficiary_bic="BANKGB22XXX",
            currency="GBP",
            as_of="2025-01-01",
            status="archived",
        ),
        _row(
            beneficiary_bic="BANKCA33XXX",
            currency="CAD",
            intermediary_account=None,
            beneficiary_account=None,
            charge_code=None,
            value_date=None,
            notes="Source: https://example.test/correspondents",
            as_of=None,
            status="unverified",
            bic_only=True,
        ),
        _row(
            beneficiary_bic="BANKAU33XXX",
            currency="AUD",
            terms_inferred=True,
        ),
    ])
    db_session_clean.commit()

    snapshot = build_quality_snapshot(
        db_session_clean,
        today=date(2026, 9, 21),
        stale_after_days=180,
        queue_limit=10,
    )

    assert snapshot.totals.total_rows == 4
    assert snapshot.totals.instruction_rows == 3
    assert snapshot.totals.bic_only_rows == 1
    assert snapshot.totals.terms_inferred_rows == 1
    assert snapshot.totals.routing_ready_rows == 0
    assert snapshot.totals.stale_rows == 1
    assert snapshot.totals.missing_source_date_rows == 1
    assert snapshot.totals.unique_beneficiaries == 4
    assert snapshot.totals.unique_intermediaries == 1
    assert {bucket.label for bucket in snapshot.freshness} == {
        "0-30 days",
        "31-90 days",
        "91-180 days",
        ">180 days",
        "No source date",
    }
    assert next(item for item in snapshot.freshness if item.label == ">180 days").count == 1
    queue_bics = {item.beneficiary_bic for item in snapshot.queue}
    assert {"BANKGB22XXX", "BANKCA33XXX", "BANKAU33XXX"} <= queue_bics
    archived = next(item for item in snapshot.queue if item.beneficiary_bic == "BANKGB22XXX")
    assert archived.age_days == 628
    assert "stale-source" in archived.issues


def test_quality_snapshot_queue_is_bounded_and_ordered_by_actionability(db_session_clean):
    db_session_clean.query(SSI).delete()
    db_session_clean.add_all([
        _row(
            beneficiary_bic=f"BNK{i:02d}US33X",
            notes=None,
            as_of=None,
            status="illustrative",
        )
        for i in range(6)
    ])
    db_session_clean.commit()

    snapshot = build_quality_snapshot(
        db_session_clean,
        today=date(2026, 9, 21),
        queue_limit=3,
    )

    assert len(snapshot.queue) == 3
    assert all("missing-citation" in item.issues for item in snapshot.queue)


def test_quality_endpoint_exposes_a_stable_snapshot_contract(client):
    response = client.get("/api/ssi/quality", params={"stale_after_days": 90, "limit": 7})

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"generated_at", "stale_after_days", "totals", "freshness", "queue", "disclaimer"}
    assert body["stale_after_days"] == 90
    assert body["totals"]["total_rows"] == (
        body["totals"]["instruction_rows"] + body["totals"]["bic_only_rows"]
    )
    assert len(body["queue"]) <= 7
    assert {item["label"] for item in body["freshness"]} == {
        "0-30 days",
        "31-90 days",
        "91-180 days",
        ">180 days",
        "No source date",
    }
    assert body["disclaimer"]
