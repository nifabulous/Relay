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


def test_every_currency_block_has_verified_asof():
    import re

    from app.data.payment_schemes import (
        get_schemes_for_currency,
        list_currencies_with_schemes,
    )
    for ccy in list_currencies_with_schemes():
        data = get_schemes_for_currency(ccy)
        assert "verifiedAsof" in data, f"{ccy} missing verifiedAsof"
        assert re.match(r"^\d{4}-\d{2}$", data["verifiedAsof"]), data["verifiedAsof"]


def test_interac_enriched_with_corrected_limits_and_roadmap():
    from app.data.payment_schemes import get_schemes_for_currency
    interac = next(s for s in get_schemes_for_currency("CAD")["schemes"] if s["name"] == "Interac e-Transfer")
    assert "Autodeposit" in " ".join(interac["features"])
    assert interac["limits"]["perTransaction"].startswith("$3,000")
    assert interac["limits"]["perMonth"] == "$30,000"
    assert any("RTR" in r for r in interac["roadmap"])
    assert "05:00 ET" not in " ".join(interac.get("processingWindows", []))  # Interac is not windowed


def test_eft_has_three_processing_windows():
    from app.data.payment_schemes import get_schemes_for_currency
    eft = next(s for s in get_schemes_for_currency("CAD")["schemes"] if s["name"] == "EFT")
    assert eft["processingWindows"] == ["05:00 ET", "14:15 ET", "19:00 ET"]


def test_chaps_teaches_iso20022_and_protections():
    from app.data.payment_schemes import get_schemes_for_currency
    chaps = next(s for s in get_schemes_for_currency("GBP")["schemes"] if s["name"] == "CHAPS")
    assert any("Nov 2026" in r or "November 2026" in r for r in chaps["roadmap"])
    assert any("Confirmation of Payee" in p for p in chaps["protections"])


def test_fps_teaches_app_reimbursement():
    from app.data.payment_schemes import get_schemes_for_currency
    fps = next(s for s in get_schemes_for_currency("GBP")["schemes"] if "Faster Payments" in s["name"])
    assert any("85,000" in p for p in fps["protections"])


def test_other_currencies_have_no_enriched_fields():
    from app.data.payment_schemes import get_schemes_for_currency
    usd = get_schemes_for_currency("USD")["schemes"][0]
    assert "roadmap" not in usd and "protections" not in usd
