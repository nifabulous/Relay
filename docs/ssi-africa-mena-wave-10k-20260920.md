# Africa/MENA SSI expansion wave (2026-09-20)

This standalone ledger contributes 63 additional beneficiary/currency/intermediary
routes across Africa and the Middle East.  Every route is BIC-only metadata from
an official bank-owned correspondent or SSI page/PDF; account fields are empty,
the status is `unverified`, and routes remain non-routable pending operational
verification.

Evidence is recorded in
[`ssi-africa-mena-wave-10k-2026-09-20.json`](../scripts/ssi-autopilot/evidence/ssi-africa-mena-wave-10k-2026-09-20.json).

| Beneficiary | BIC | Routes | Official source |
| --- | --- | ---: | --- |
| Sohar International Bank S.A.O.G. | `BSHROMRUXXX` | 31 | [Correspondent-bank table](https://soharinternational.com/personal-banking/global-transfers-overview/our-financial-institution-partners/) |
| National Microfinance Bank PLC (Tanzania) | `NMIBTZTZXXX` | 10 | [SWIFT application form](https://www.nmbbank.co.tz/investor-relations-nmb/financial-and-regulatory-reports/presentations/category/1-downloads?download=23%3Aswift-application-form) |
| Bank Nizwa SAOG | `BNZWOMRXXXX` | 2 | [SSI list PDF](https://www.banknizwa.om/media/3939/ssi-list-bank-nizwa-feb-2023.pdf) |
| AfrAsia Bank Limited | `AFBLMUMUXXX` | 8 | [Correspondent-bank table](https://www.afrasiabank.com/en/international/correspondent-banks) |
| I&M Bank Tanzania Limited | `IMBLTZTZXXX` | 3 | [SWIFT transfer table](https://imbank.co.tz/funds-transfer/swift-transfers/) |
| CRDB Bank Burundi S.A. | `CORUBIBUXXX` | 3 | [International-transfer instructions](https://crdbbank.co.bi/en/for-you/ways-to-bank/international-transfer) |
| Bank of Baroda (Seychelles) Limited | `BARBSCSCXXX` | 3 | [Cross-border SWIFT page](https://www.bankofbaroda.sc/services/remittance-facility/cross-border-transfer-swift) |
| First National Bank of Botswana Limited | `FIRNBWGXXXX` | 2 | [Nostro services table](https://www.rmb.co.bw/page/nostro-services-for-foreign-banks) |
| Access Bank Zambia Limited | `AZAMZMLUXXX` | 1 | [Bank identifier code PDF](https://zambia.accessbankplc.com/access/media/Media-PDF-Attachment/Bank-Identifier-Code.pdf) |

The regression test `tests/test_ssi_africa_mena_wave_10k_20260920.py` checks
exact route counts, canonical 11-character BICs, uniqueness of the
`(beneficiary_bic, currency, intermediary_bic)` key, source/count parity, and
the BIC-only safety invariants.
