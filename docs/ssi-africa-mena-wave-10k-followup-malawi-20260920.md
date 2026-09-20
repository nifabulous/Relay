# Africa/MENA SSI expansion follow-up: Malawi (2026-09-20)

This standalone follow-up contributes 9 additional National Bank of Malawi
beneficiary/currency/intermediary routes from the bank's official correspondent
table. The beneficiary BIC is corroborated by the bank's annual report. All rows
are BIC-only metadata: account fields are empty, status is `unverified`, and
routes remain non-routable pending independent operational verification. Routes
already present in the catalog were excluded.

Evidence is recorded in
[`ssi-africa-mena-wave-10k-followup-malawi-2026-09-20.json`](../scripts/ssi-autopilot/evidence/ssi-africa-mena-wave-10k-followup-malawi-2026-09-20.json).

| Beneficiary | BIC | Routes | Official source |
| --- | --- | ---: | --- |
| National Bank of Malawi Plc | `NBMAMWMWXXX` | 9 | [Correspondent-bank table](https://www.natbank.co.mw/about-us/correspondent-banks) ([beneficiary BIC](https://www.natbank.co.mw/publications/annual-reports/309-annual-report-2022/file)) |

The regression test `tests/test_ssi_africa_mena_wave_10k_followup_malawi_20260920.py`
checks exact counts, canonical 11-character BICs, unique route keys, source
coverage parity, and BIC-only safety invariants.
