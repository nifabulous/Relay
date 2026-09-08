# SSI expansion review — 2026-09-07, wave 5 Caucasus and Central Asia

This checkpoint adds 134 rows across ten beneficiary banks in Armenia, Azerbaijan, Georgia,
Kyrgyzstan, and Tajikistan. Eighty-seven rows have masked account placeholders in the reserved
`ACCT-910046xx` range; 47 are correspondent-only mappings with no account or settlement terms.

| Country / bank | BIC | Rows | Ordinary / BIC-only | Bank-published source | Observation date |
| --- | --- | ---: | ---: | --- | --- |
| Armenia — ACBA Bank OJSC | `AGCAAM22` | 10 | 10 / 0 | [requisites PDF](https://acba.am/uploaded/Requisite_1.pdf) | 2026-09-06 |
| Armenia — Inecobank CJSC | `INJSAM22` | 8 | 4 / 4 | [correspondent relations](https://www.inecobank.am/en/useful-information/correspondent-relations) and linked PDFs | 2026-08-18 |
| Azerbaijan — International Bank of Azerbaijan (ABB) | `IBAZAZ2X` | 19 | 0 / 19 | [correspondent banks](https://abb-bank.az/en/haqqimizda/muxbir-banklar) | 2026-09-06 |
| Georgia — JSC Cartu Bank | `CRTUGE22` | 4 | 4 / 0 | [correspondent banks](https://www.cartubank.ge/index.php?lng=eng&m=356) | 2026-09-06 |
| Georgia — JSC Terabank | `TEBAGE22` | 22 | 22 / 0 | [correspondent banks](https://terabank.ge/ka/about/correspondentbanks) | 2026-09-06 |
| Georgia — JSC Liberty Bank | `LBRTGE22` | 24 | 0 / 24 | [correspondent banks](https://libertybank.ge/en/chven-shesakheb/kompaniis-shesakheb/sakorespondento-bankebi) | 2026-09-06 |
| Kyrgyzstan — Bank of Asia CJSC | `ASCJKG22` | 18 | 18 / 0 | [correspondent banks](https://www.bankasia.kg/en/correspondent-banks/) | 2026-09-06 |
| Tajikistan — Bank Eskhata | `EJSATJ22` | 7 | 7 / 0 | [requisites](https://eskhata.com/about/info/requisites/) | 2026-08-19 |
| Tajikistan — Spitamen Bank CJSC | `SPRBTJ22` | 3 | 3 / 0 | [bank details](https://www.spitamenbank.tj/en/about/details/) | 2026-09-06 |
| Kyrgyzstan — Kyrgyz Investment and Credit Bank | `KICBKG22` | 19 | 19 / 0 | [current requisites](https://kicb.net/en/about/requisites/) | 2026-09-06 |

The ordinary rows retain only masked `ACCT-` values; charge/value terms are conservative `SHA` /
`spot` inferences and remain `unverified`. Inecobank's EUR/CHF/GBP/CAD entries and all Liberty /
ABB entries are intentionally non-selectable BIC-only relationships. ABB's source row placing
`CHASGB2L` under a USD/New York heading was excluded. Terabank's two Araratbank rows were held out
because the source groups two accounts without assigning them to USD versus EUR. The source's
seven-character BICs and malformed glyphs were not repaired by invention.

Where Eskhata explicitly names a correspondent plus a BNY/JPMorgan intermediary, the route is
preserved in the correspondent label and a validated BIC is used for the fold; duplicate
beneficiary/currency/intermediary keys are not duplicated. No corridor rules were inferred. All
ten beneficiary identities and their source domains are registered in
`scripts/ssi-autopilot/trusted_identities.json`; admission, validation, fold verification, and the
generated coverage test passed.

After folding, the cumulative seed contains **359 curated banks, 2,382 SSI records, and 72 corridor
rules**.
