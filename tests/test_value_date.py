"""
Tests for value-date settlement lag.

Covers the currency defaults used when no scheme is named, which is the
common case for a cross-border instruction: the sender knows the currency
long before the rail is chosen.
"""

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
