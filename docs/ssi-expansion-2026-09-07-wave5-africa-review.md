# SSI expansion review — 2026-09-07, wave 5 Africa

This checkpoint adds 49 correspondent relationships across Zambia, Botswana, and Ethiopia.
All rows are deliberately correspondent-only: the source publications either provide only a
currency/BIC mapping or print an intermediary/group nostro account without a beneficiary credit-to
account. No real account digits are copied or synthesized.

| Country / bank | BIC | Rows | Bank-published source | Observation date |
| --- | --- | ---: | --- | --- |
| Zambia — Access Bank Zambia Limited | `AZAMZMLU` | 4 | [bank identifier PDF](https://zambia.accessbankplc.com/access/media/Media-PDF-Attachment/Bank-Identifier-Code.pdf) | 2026-09-06 |
| Botswana — First National Bank of Botswana Limited | `FIRNBWGX` | 27 | [RMB Botswana nostro services](https://www.rmb.co.bw/page/nostro-services-for-foreign-banks) | 2026-09-06 |
| Ethiopia — Bank of Abyssinia | `ABYSETAA` | 18 | [correspondent banks](https://www.bankofabyssinia.com/correspondent-banks/) | 2026-09-06 |

Access Bank Zambia publishes USD, GBP, and ZAR relationships; its PDF includes intermediary
account references but no final-credit/customer account, so those relationships remain availability-
only. The PDF's contradictory “CITIBANK EUR” heading is not seeded as EUR, and the ZMW section has
no usable correspondent.

The FNB Botswana table contains 29 source rows. The BWP `FIRNBWG` and MZN `FIRNMZM` values are
seven-character invalid BICs and were excluded without appending invented characters. The CHF
`UBSWCHZH` head-office BIC is retained exactly as published and validated; no branch suffix was
invented. Bank of Abyssinia's duplicate/mislabeled African Export Import Bank row was removed when
it repeated `EABDDJJD`.

A separate First National Bank Zambia FAQ was excluded: although hosted on a Zambia domain, its
table identifies the South African beneficiary `FIRNZAJJ`, not the Zambian `FIRNZMLX`. No Zambia SSI
row was invented from that mismatch. No corridor rules were inferred. The three beneficiary
identities and their bank-owned source domains are registered in
`scripts/ssi-autopilot/trusted_identities.json`; admission, validation, fold verification, and the
generated coverage test passed.

After folding, the cumulative seed contains **349 curated banks, 2,248 SSI records, and 72 corridor
rules**.
