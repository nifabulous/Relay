"""
Tests for value-date settlement lag.

Covers the currency defaults used when no scheme is named, which is the
common case for a cross-border instruction: the sender knows the currency
long before the rail is chosen.
"""

import dataclasses
from datetime import datetime

from app.services.value_date import calculate_value_date

# A Monday, well before every cut-off in the table, so nothing here is
# measuring cut-off roll-over.
MONDAY_MORNING = datetime(2026, 9, 14, 9, 0)


class TestCurrencyDefaultLag:
    """The default lag when the caller names no scheme."""

    def test_gbp_without_a_scheme_settles_t_plus_2(self):
        """
        GBP defaulted to T+0, which is CHAPS behaviour applied to every GBP
        payment. A cross-border GBP instruction with no rail named settles
        spot, like any other currency: T+2. CHAPS and Faster Payments are
        reached by naming them, not by being GBP.
        """
        result = calculate_value_date(MONDAY_MORNING, "GBP")

        assert result.business_days == 2
        assert result.settlement_type == "T+2"
        assert result.value_date == datetime(2026, 9, 16, 9, 0).date()

    def test_gbp_via_chaps_still_settles_same_day(self):
        result = calculate_value_date(MONDAY_MORNING, "GBP", scheme="CHAPS")

        assert result.business_days == 0
        assert result.value_date == MONDAY_MORNING.date()

    def test_gbp_via_faster_payments_is_instant(self):
        result = calculate_value_date(MONDAY_MORNING, "GBP", scheme="Faster Payments")

        assert result.business_days == 0
        assert result.value_date == MONDAY_MORNING.date()
        assert "instant" in result.settlement_type.lower()

    def test_ngn_without_a_scheme_settles_t_plus_2(self):
        """
        Same defect as GBP: NGN defaulted to T+0, presenting every naira
        payment as instant because NIBSS Instant exists domestically. A
        cross-border NGN instruction with no rail named settles spot.
        """
        result = calculate_value_date(MONDAY_MORNING, "NGN")

        assert result.business_days == 2
        assert result.settlement_type == "T+2"

    def test_kes_without_a_scheme_settles_t_plus_2(self):
        result = calculate_value_date(MONDAY_MORNING, "KES")

        assert result.business_days == 2
        assert result.settlement_type == "T+2"

    def test_ngn_via_nibss_instant_is_still_instant(self):
        result = calculate_value_date(MONDAY_MORNING, "NGN", scheme="NIBSS Instant")

        assert result.business_days == 0
        assert result.value_date == MONDAY_MORNING.date()
        assert "instant" in result.settlement_type.lower()

    def test_kes_via_m_pesa_is_still_instant(self):
        result = calculate_value_date(MONDAY_MORNING, "KES", scheme="M-Pesa")

        assert result.business_days == 0
        assert "instant" in result.settlement_type.lower()

    def test_kes_via_pesalink_is_still_instant(self):
        result = calculate_value_date(MONDAY_MORNING, "KES", scheme="Pesalink")

        assert result.business_days == 0
        assert "instant" in result.settlement_type.lower()

    def test_no_currency_default_claims_same_day_settlement(self):
        """
        A same-day default says "this currency is instant everywhere", which
        is a property of a rail, not of a currency. Any future entry has to
        be reached by naming its scheme.
        """
        from app.services.value_date import DEFAULT_LAG_BY_CURRENCY

        zero_lag = {c for c, lag in DEFAULT_LAG_BY_CURRENCY.items() if lag == 0}
        assert zero_lag == set(), zero_lag

    def test_usd_default_is_unchanged(self):
        """Guards against a blanket edit to the currency table."""
        result = calculate_value_date(MONDAY_MORNING, "USD")

        assert result.business_days == 2

    def test_eur_default_is_unchanged(self):
        result = calculate_value_date(MONDAY_MORNING, "EUR")

        assert result.business_days == 1


class TestHolidayCalendarCoverage:
    """
    HOLIDAYS.get(currency, []) returns an empty set for any currency the
    table does not list, so the calculation silently treats every weekday as
    a settlement day. The value date is then presented with exactly the same
    confidence as one computed against real holiday data.
    """

    # Wed 2026-12-23: T+2 lands on Fri 2026-12-25, a holiday in most markets.
    BEFORE_CHRISTMAS = datetime(2026, 12, 23, 9, 0)

    def test_known_currency_rolls_over_the_holiday(self):
        """Control: USD has holiday data and behaves correctly."""
        result = calculate_value_date(self.BEFORE_CHRISTMAS, "USD")

        assert result.value_date.isoformat() == "2026-12-28"
        assert "2026-12-25" in result.skipped_holidays
        assert result.holiday_calendar_available is True

    def test_unknown_currency_declares_its_calendar_missing(self):
        """
        CHF is not in HOLIDAYS. The result may not imply a verified
        settlement date — it has to say the calendar is unavailable.
        """
        result = calculate_value_date(self.BEFORE_CHRISTMAS, "CHF")

        assert result.holiday_calendar_available is False
        assert "holiday calendar" in result.explanation.lower()
        assert "CHF" in result.explanation

    def test_known_currency_does_not_carry_the_caveat(self):
        result = calculate_value_date(self.BEFORE_CHRISTMAS, "USD")

        assert "holiday calendar" not in result.explanation.lower()

    def test_every_lag_currency_has_holiday_data(self):
        """
        A currency given a settlement lag but no holiday calendar produces a
        confident answer from half the inputs. Adding one without the other
        should fail here.
        """
        from app.services.value_date import DEFAULT_LAG_BY_CURRENCY, HOLIDAYS

        missing = sorted(set(DEFAULT_LAG_BY_CURRENCY) - set(HOLIDAYS))
        assert missing == [], missing

    def test_instant_rail_on_an_unknown_currency_still_flags_the_gap(self):
        """
        An instant rail settles same-day regardless, so the calendar does not
        change the answer — but the field must still report the truth rather
        than defaulting to True.
        """
        result = calculate_value_date(self.BEFORE_CHRISTMAS, "CHF", scheme="RTP")

        assert result.value_date == self.BEFORE_CHRISTMAS.date()
        assert result.holiday_calendar_available is False


class TestValueDateEndpointCoverageFlag:
    def test_endpoint_reports_a_missing_calendar(self, client):
        body = client.post("/api/value-date", json={
            "send_datetime": "2026-12-23T09:00:00",
            "currency": "CHF",
        }).json()

        assert body["holiday_calendar_available"] is False
        assert "holiday calendar" in body["explanation"].lower()

    def test_endpoint_reports_a_present_calendar(self, client):
        body = client.post("/api/value-date", json={
            "send_datetime": "2026-12-23T09:00:00",
            "currency": "USD",
        }).json()

        assert body["holiday_calendar_available"] is True
        assert body["value_date"] == "2026-12-28"


class TestCalendarFlagCannotFailOpen:
    """
    A field whose entire purpose is to flag missing data must not default to
    "data present". Both constructors are required to state what is known.
    """

    def test_result_requires_an_explicit_calendar_flag(self):
        from app.services.value_date import ValueDateResult

        fields = ValueDateResult.__dataclass_fields__
        f = fields["holiday_calendar_available"]
        assert f.default is dataclasses.MISSING, "must not default"
        assert f.default_factory is dataclasses.MISSING, "must not default"

    def test_response_requires_an_explicit_calendar_flag(self):
        from app.schemas import ValueDateResponse

        assert ValueDateResponse.model_fields["holiday_calendar_available"].is_required()


class TestInstantRailCalendarCaveat:
    """
    The flag and the explanation have to agree. An instant result that
    reports holiday_calendar_available=False while saying nothing about it
    is the same "looks verified" problem one layer down.
    """

    BEFORE_CHRISTMAS = datetime(2026, 12, 23, 9, 0)

    def test_instant_on_unknown_currency_explains_the_missing_calendar(self):
        result = calculate_value_date(self.BEFORE_CHRISTMAS, "CHF", scheme="RTP")

        assert result.holiday_calendar_available is False
        assert "holiday calendar" in result.explanation.lower()
        assert "CHF" in result.explanation

    def test_instant_caveat_does_not_imply_a_different_value_date(self):
        """
        Same-day settlement does not depend on the calendar, so the caveat
        must not suggest the date is in doubt — only that the calendar is.
        """
        result = calculate_value_date(self.BEFORE_CHRISTMAS, "CHF", scheme="RTP")

        assert result.value_date == self.BEFORE_CHRISTMAS.date()
        assert "does not affect" in result.explanation.lower()

    def test_instant_on_known_currency_carries_no_caveat(self):
        result = calculate_value_date(self.BEFORE_CHRISTMAS, "USD", scheme="FedNow")

        assert result.holiday_calendar_available is True
        assert "holiday calendar" not in result.explanation.lower()

    def test_flag_and_explanation_agree_on_every_path(self):
        """One rule, checked across instant and non-instant alike."""
        cases = [
            ("CHF", None), ("CHF", "RTP"), ("CHF", "SWIFT"),
            ("USD", None), ("USD", "FedNow"), ("GBP", "CHAPS"),
        ]
        for currency, scheme in cases:
            r = calculate_value_date(self.BEFORE_CHRISTMAS, currency, scheme=scheme)
            mentions = "holiday calendar" in r.explanation.lower()
            assert mentions is (not r.holiday_calendar_available), (currency, scheme)
