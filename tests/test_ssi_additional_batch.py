"""Focused contract for the next source-backed SSI expansion batch."""

from app.services.seed import SSI_RECORDS


_ADDITIONAL_BICS = {
    "HBUKGB4BXXX",
    "BPMOIT22XXX",
    "DEUTMYKLXXX",
    "DEUTPHMMXXX",
    "DEUTKRSEXXX",
    "HDFCINAAXXX",
    "GOSKPLPWXXX",
    "KMBLNPKAXXX",
    "ORFBUZ22XXX",
    "SDBLBDDHXXX",
    "CIBLBDDHXXX",
    "CBININBBXXX",
    "IDIBINBBXXX",
    "PRVUNPKAXXX",
    "CCEYLKLXXXX",
    "MIDLAM22XXX",
    "ANIKAM22XXX",
    "ARMJAM22XXX",
    "WPACAU2SXXX",
    "RZBAATWWXXX",
    "RLNWATWWXXX",
    "OBKLAT2LXXX",
    "VKBLAT2LXXX",
    "UNCRBGSFXXX",
    "ICRAITRRXXX",
    "OTPVUAUKXXX",
    "AKBKDEFFXXX",
}


def test_additional_batch_has_new_beneficiaries_and_routes():
    rows = [row for row in SSI_RECORDS if row[0] in _ADDITIONAL_BICS]
    assert {row[0] for row in rows} == _ADDITIONAL_BICS
    assert len(rows) >= 450
    assert all("Source: http" in row[9] for row in rows)
