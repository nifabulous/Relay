# Africa/MENA SSI expansion follow-up: Great Lakes (2026-09-20)

This standalone follow-up contributes 24 unique Rwanda/Uganda
beneficiary/currency/intermediary routes from two official bank-owned SWIFT
pages/PDFs.  All rows are BIC-only metadata: account fields are empty, status
is `unverified`, and routes remain non-routable pending independent operational
verification. Existing BPR Rwanda and Stanbic Uganda routes were excluded when
they already existed in the catalog.

Evidence is recorded in
[`ssi-africa-mena-wave-10k-followup-great-lakes-2026-09-20.json`](../scripts/ssi-autopilot/evidence/ssi-africa-mena-wave-10k-followup-great-lakes-2026-09-20.json).

| Beneficiary | BIC | Routes | Official source |
| --- | --- | ---: | --- |
| I&M Bank Rwanda Plc | `IMRWRWRWXXX` | 18 | [SWIFT transfer table](https://www.imbankgroup.com/rw/funds-transfer/swift-transfers/) |
| Stanbic Bank Uganda Limited | `SBICUGKXXXX` | 6 | [Correspondent-bank PDF](https://www.stanbicbank.co.ug/static_file/Uganda/Downloadable%20files/BB%20account%20opening%20doc/SWIFT%20CODE.pdf) |

The regression test `tests/test_ssi_africa_mena_wave_10k_followup_great_lakes_20260920.py`
checks exact counts, canonical 11-character BICs, unique route keys, source
coverage parity, and BIC-only safety invariants.
