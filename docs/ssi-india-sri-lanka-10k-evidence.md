# India and Sri Lanka SSI wave 10k (batch 1)

This ledger adds 94 unique BIC-level relationships to the 10,164-key
`origin/main` baseline. A key is `(beneficiary BIC, currency, intermediary
BIC)` after canonicalizing valid eight-character BICs to their eleven-character
form with the `XXX` branch suffix. Four raw candidates were dropped because
the same key already existed in the baseline or earlier in this batch. Seven
additional candidates printed legacy alias values (`SCBLDEFXXXX` or
`PNBPUS3NNYC`) that normalize to the repository's canonical
`SCBLDEFFXXX`/`PNBPUS33XXX`; those rows are omitted so production parity stays
canonical.

All rows are deliberately non-routable metadata: the source pages list a
correspondent relationship but do not provide a repository-approved account
number. The 15-field rows therefore have null account/charge/value fields,
`status=unverified`, `bic_only=true`, and `terms_inferred=false`. No BIC was
invented; the only transformation is the conventional branch suffix on an
official eight-character BIC.

## Official sources

| Beneficiary | Source | As of | Unique rows |
| --- | --- | --- | ---: |
| Punjab National Bank (`PUNBINBBISB`) | [PNB remittance/correspondent page](https://pnb.bank.in/Remittance-Money-to-India.html) | 2026-09-20 | 23 |
| South Indian Bank (`SOININ55XXX`) | [South Indian Bank NRI newsletter PDF](https://www.southindianbank.bank.in/UserFiles/NriNewsLetter/nri_news_letter_december_2023.pdf) | 2023-12-01 | 13 |
| Karnataka Bank (`KARBINBBXXX`) | [Karnataka Bank Nostro Accounts PDF](https://d3sdkw7nvdnqts.cloudfront.net/s3fs-public/2024-10/nostro-account-latest-%283%29.pdf) | 2024-10-04 | 12 |
| City Union Bank (`CIUBINBBXXX`) | [City Union Bank currency correspondent pages](https://www.cityunionbank.com/cub-correspondent-banks-for-currency-exchange) | 2025-04-05 | 8 |
| Kalupur Commercial Co-operative Bank (`KALUINBBXXX`) | [Kalupur foreign-exchange page](https://kalupur.bank.in/services/foreign-exchange/) | 2026-09-20 | 6 |
| Commercial Bank of Ceylon (`COMBLKLXXXX`) | [Commercial Bank correspondent-banks page](https://www.combank.lk/info/12.) | 2026-09-20 | 32 |

The ledger is intentionally separate from `seed.py`; the central loader can
admit it in a later integration commit after review.
