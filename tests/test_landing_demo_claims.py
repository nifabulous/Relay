"""Every demonstration value on the landing page that claims a computed result
is checked here against the real Relay code.

The values live in frontend/src/landing/render/demo.json, which the page
renders from. Change a service and this test says which claim on the page
stopped being true.
"""
import datetime as dt
import json
from pathlib import Path

import pytest
from schwifty import IBAN

from app.services import stp_checker
from app.services.fee_calculator import simulate_fees
from app.services.name_matcher import match_names
from app.services.recommendation import decide
from app.services.screening import screen_name, screen_payment
from app.services.tracking import iso_transaction_status
from app.services.validator import validate_iban
from app.services.value_date import calculate_value_date

DEMO = json.loads(
    (
        Path(__file__).resolve().parents[1]
        / "frontend" / "src" / "landing" / "render" / "demo.json"
    ).read_text(encoding="utf-8")
)
AS_OF = dt.date.fromisoformat(DEMO["asOf"])
NAMES = DEMO["payment"]


def test_demo_iban_validates_and_parses_as_shown():
    demo = DEMO["iban"]
    assert "".join(demo["groups"]) == demo["value"]
    result = validate_iban(demo["value"])
    assert result.valid is True
    assert result.country_code == demo["countryCode"]
    parsed = IBAN(demo["value"], validate_bban=True)
    assert parsed.length == demo["length"]
    assert parsed.checksum_digits == demo["checkDigits"]
    assert parsed.bank_code == demo["bankCode"]
    assert parsed.branch_code == demo["sortCode"]


def test_demo_payee_is_a_close_match():
    demo = DEMO["payee"]
    result = match_names(demo["entered"], demo["onFile"])
    assert result.outcome.value == demo["outcome"]


@pytest.mark.parametrize("strictness", ["lenient", "standard", "strict"])
def test_demo_prepare_verdict_for_each_strictness(strictness):
    demo = DEMO["prepare"]
    result = decide(
        validation_valid=demo["validationValid"],
        vop_outcome=demo["payeeOutcome"],
        has_routing=True,
        has_real_ssi_accounts=False,
        has_placeholder_ssi_only=True,
        strictness=strictness,
    )
    assert result.recommendation.value == demo["verdicts"][strictness]


@pytest.mark.parametrize("charge_code", ["OUR", "SHA", "BEN"])
def test_demo_fees_for_each_charge_code(charge_code):
    demo = DEMO["fees"]
    expected = demo["byChargeCode"][charge_code]
    result = simulate_fees(
        NAMES["amount"],
        NAMES["currency"],
        charge_code,
        [demo["intermediaryBic"]],
        [NAMES["correspondent"]["name"]],
    )
    assert result.received_amount == pytest.approx(expected["received"])
    assert result.total_fees == pytest.approx(expected["totalFees"])
    assert result.sender_pays_extra == pytest.approx(expected["senderPaysExtra"])


def test_demo_screening_hops_and_scores():
    demo = DEMO["screening"]
    result = screen_payment(
        NAMES["origin"]["name"],
        NAMES["beneficiary"]["name"],
        [demo["intermediaryBic"]],
        [NAMES["correspondent"]["name"]],
    )
    assert [hop.bank_name for hop in result.hops] == [hop["name"] for hop in demo["hops"]]
    assert [hop.decision for hop in result.hops] == [hop["decision"] for hop in demo["hops"]]
    assert result.overall_recommendation == demo["overall"]
    for hop in demo["hops"]:
        assert round(screen_name(hop["name"]).score, 2) == hop["score"]


def test_demo_value_date_skips_the_holiday():
    demo = DEMO["valueDate"]
    result = calculate_value_date(
        dt.datetime.fromisoformat(demo["sentAt"]), demo["currency"], demo["scheme"]
    )
    assert result.cut_off_local == demo["cutOff"]
    assert result.missed_cut_off is True
    assert result.trade_date.isoformat() == demo["tradeDate"]
    assert result.value_date.isoformat() == demo["valueDate"]
    assert result.skipped_holidays == demo["skippedHolidays"]
    assert result.business_days == demo["businessDays"]


def test_demo_mt103_is_clean_on_the_demonstration_date(monkeypatch):
    class _AsOf(dt.date):
        @classmethod
        def today(cls):
            return AS_OF

    # Rule 11 reads date.today(); pin it, or the verdict changes tomorrow.
    monkeypatch.setattr(stp_checker, "date", _AsOf)
    result = stp_checker.check_stp(DEMO["stp"]["message"])
    assert result.verdict == DEMO["stp"]["verdict"]
    assert result.findings == []


def test_demo_tracking_codes_match_the_gpi_mapping():
    for step in DEMO["tracking"]:
        assert iso_transaction_status(step["status"]) == step["code"]


def test_demo_accounts_are_placeholders():
    accounts = [value for key, value in DEMO["ssiSample"] if value.startswith("ACCT-")]
    message = DEMO["stp"]["message"]
    accounts += [message["ordering"]["account"], message["beneficiary"]["account"]]
    assert len(accounts) == 4
    assert all(account.startswith("ACCT-") for account in accounts)


def test_demo_uses_only_the_fictional_institutions():
    names = {NAMES[role]["name"] for role in ("origin", "correspondent", "beneficiary")}
    assert names == {"Harborline Bank", "Meridian Clearing", "Northstar Bank"}
