from app.data.payment_schemes import get_schemes_for_currency


def test_kes_has_kepss_rtgs():
    data = get_schemes_for_currency("KES")
    names = [s["name"] for s in data["schemes"]]
    assert any("KEPSS" in n for n in names)
    kepss = next(s for s in data["schemes"] if "KEPSS" in s["name"])
    assert "RTGS" in kepss["speed"]
    assert kepss["operator"] == "Central Bank of Kenya"


def test_kes_mpesa_limits_are_cbk_approved():
    data = get_schemes_for_currency("KES")
    mpesa = next(s for s in data["schemes"] if s["name"] == "M-Pesa")
    # CBK-approved figures in force through 2026.
    assert "250,000" in mpesa["limit"]  # per-transaction
    assert "500,000" in mpesa["limit"]  # daily / wallet cap
