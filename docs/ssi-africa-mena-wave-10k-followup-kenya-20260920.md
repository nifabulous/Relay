# Africa/MENA SSI expansion follow-up: Kenya (2026-09-20)

This follow-up adds 53 unique East African beneficiary/currency/intermediary
routes from three official Kenya bank sources.  All rows are BIC-only metadata:
account fields are empty, status is `unverified`, and routes remain non-routable
pending independent operational verification.

Evidence is recorded in
[`ssi-africa-mena-wave-10k-followup-kenya-2026-09-20.json`](../scripts/ssi-autopilot/evidence/ssi-africa-mena-wave-10k-followup-kenya-2026-09-20.json).

| Beneficiary | BIC | Routes | Official source |
| --- | --- | ---: | --- |
| Stanbic Bank Kenya Limited | `SBICKENXXXX` | 24 | [Standard settlement instructions](https://www.stanbicbank.co.ke/kenya/personal/about-us/standard-settlement-instructions) |
| The Co-operative Bank of Kenya Limited | `KCOOKENAXXX` | 19 | [SWIFT correspondent table](https://www.co-opbank.co.ke/money-transfer/swift-transfers/) ([beneficiary BIC](https://www.co-opbank.co.ke/faq/bank-swift-code-and-bank-code/)) |
| Guaranty Trust Bank (Kenya) Ltd | `GTBIKENAXXX` | 10 | [Corresponding banking partners PDF](https://gtbank-kenya.files.svdcdn.com/production/general/GTBank-Kenya-Corresponding-Banking-Partners.pdf) |

The regression test `tests/test_ssi_africa_mena_wave_10k_followup_kenya_20260920.py`
checks exact counts, canonical 11-character BICs, unique route keys, source
coverage parity, and the BIC-only safety invariants.
