from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import SSI, Bank

OLD_BIC = "EDBBEB22XXX"
CANONICAL_BIC = "WBWCLULLXXX"


def _session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    return engine, sessionmaker(bind=engine, future=True)()


def test_edb_seed_and_validator_use_the_published_bic():
    from app.services.seed import BANKS, SSI_RECORDS
    from app.services.validator import validate_bic

    assert any(row[0] == CANONICAL_BIC for row in BANKS)
    assert not any(row[0] == OLD_BIC for row in BANKS)
    assert any(row[0] == CANONICAL_BIC for row in SSI_RECORDS)
    assert not any(row[0] == OLD_BIC for row in SSI_RECORDS)
    assert validate_bic(OLD_BIC)[0] is False
    assert validate_bic(CANONICAL_BIC)[0] is True


def test_seed_rollout_rekeys_old_edb_rows_and_preserves_operator_fields(monkeypatch):
    import app.services.seed as seed_module

    source = next(
        row
        for row in seed_module.SSI_RECORDS
        if row[0] == CANONICAL_BIC and (len(row) <= 13 or not row[13])
    )
    legacy = (OLD_BIC, *source[1:])
    canonical = (CANONICAL_BIC, *source[1:])
    monkeypatch.setattr(
        seed_module,
        "BANKS",
        ((CANONICAL_BIC, "European Depositary Bank SA", "LU", "Luxembourg", "EUR"),),
    )
    monkeypatch.setattr(seed_module, "SSI_RECORDS", (canonical,))
    monkeypatch.setattr(seed_module, "CORRIDOR_RULES", ())
    monkeypatch.setattr(seed_module, "ACCOUNT_RECORDS", ())

    engine, session = _session()
    try:
        session.add(Bank(bic=OLD_BIC, bank_name="European Depositary Bank SA", country_code="LU", city="Luxembourg", country_currency="EUR"))
        session.add(SSI(
            beneficiary_bic=OLD_BIC,
            beneficiary_bank_name=legacy[1],
            currency=legacy[2],
            intermediary_bic=legacy[3],
            intermediary_bank_name=legacy[4],
            intermediary_account="OPERATOR-ACCOUNT",
            beneficiary_account=legacy[6],
            charge_code=legacy[7],
            value_date=legacy[8],
            notes=legacy[9] + "\nOperator note: verified locally",
            as_of=legacy[10],
            status=legacy[11],
            verified_by="operator",
        ))
        session.commit()

        seed_module.seed_if_empty(session)

        assert session.query(SSI).filter_by(beneficiary_bic=OLD_BIC).count() == 0
        row = session.query(SSI).filter_by(beneficiary_bic=CANONICAL_BIC).one()
        assert row.intermediary_account == "OPERATOR-ACCOUNT"
        assert row.notes.endswith("Operator note: verified locally")
        assert session.query(Bank).filter_by(bic=OLD_BIC).count() == 0
        assert session.query(Bank).filter_by(bic=CANONICAL_BIC).count() == 1
    finally:
        session.close()
        engine.dispose()


def test_seed_rollout_rejects_two_operator_owned_alias_rows_atomically(monkeypatch):
    import app.services.seed as seed_module

    source = next(
        row
        for row in seed_module.SSI_RECORDS
        if row[0] == CANONICAL_BIC and (len(row) <= 13 or not row[13])
    )
    monkeypatch.setattr(seed_module, "BANKS", ())
    monkeypatch.setattr(seed_module, "SSI_RECORDS", (source,))
    monkeypatch.setattr(seed_module, "CORRIDOR_RULES", ())
    monkeypatch.setattr(seed_module, "ACCOUNT_RECORDS", ())

    engine, session = _session()
    try:
        for bic in (OLD_BIC, CANONICAL_BIC):
            session.add(SSI(
                beneficiary_bic=bic,
                beneficiary_bank_name=source[1],
                currency=source[2],
                intermediary_bic=source[3],
                intermediary_bank_name=source[4],
                intermediary_account=f"REAL-{bic[:4]}",
                beneficiary_account="REAL-BEN",
                charge_code=source[7],
                value_date=source[8],
                notes="Operator-owned row",
                as_of=source[10],
                status=source[11],
                verified_by="operator",
            ))
        session.commit()

        try:
            seed_module.seed_if_empty(session)
        except ValueError as exc:
            assert "two operator-owned" in str(exc)
            session.rollback()
        else:
            raise AssertionError("alias collision should fail")

        assert session.query(SSI).filter_by(beneficiary_bic=OLD_BIC).count() == 1
        assert session.query(SSI).filter_by(beneficiary_bic=CANONICAL_BIC).count() == 1
    finally:
        session.close()
        engine.dispose()
