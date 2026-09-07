# SSI expansion review — 2026-09-07, wave 4 Europe

This checkpoint adds 323 SSI rows across 16 previously uncovered European beneficiary banks. It is
split into 144 account-backed rows (all account values masked into the reserved `ACCT-910043xx`
range) and 179 correspondent-only rows. The source observations are unverified: they are bank-owned
pages or PDFs that were read during desk research, not present-tense operational attestations.

| Country / bank | BIC | Rows | Bank-published source | Observation date |
| --- | --- | ---: | --- | --- |
| Serbia — Halkbank a.d. Beograd | `CABARS22` | 18 | [foreign-payment operations](https://www.halkbank.rs/Business/Accounts/Foreign-payment-account/foreign-payment-operations.393.html) | 2026-09-06 |
| Croatia — Slatinska Banka d.d. | `SBSLHR2X` | 31 | [correspondent banks](https://www.slatinska-banka.hr/kontokorenti/) | 2026-09-06 |
| Croatia — OTP banka d.d. | `OTPVHR2X` | 26 seeded rows (direct self-loop excluded) | [22 Dec 2025 SSI PDF](https://www.otpbanka.hr/sites/default/files/doc/Public%20SSI%20-%20OTP%20Banka%20-%2022.12.2025.pdf) | 2025-12-22 |
| Slovakia — EXIMBANKA SR | `EXSKSKBX` | 6 | [correspondent-banks PDF](https://eximbanka.sk/wp-content/uploads/2025/04/CORRESPONDENT-BANKS.pdf) | 2025-04-01 |
| Slovenia — NLB d.d., Ljubljana | `LJBASI2X` | 34 | [correspondent relationship network](https://www.nlb.si/en/financial-institutions/correspondent-relationship-network) | 2026-09-06 |
| Lithuania — AB SEB bankas | `CBVILT2X` | 32 | [SEB correspondent banks](https://www.seb.lt/privatiems/kasdiene-bankininkyste/pervedimai/bankai-korespondentai) | 2026-09-06 |
| Lithuania — Citadele branch | `INDULT2X` | 12 | [Citadele correspondent banks](https://www.citadele.lt/en/contacts/correspondent-banks/) | 2026-09-06 |
| Latvia — Swedbank AS | `HABALV22` | 23 | [Swedbank correspondent banks](https://www.swedbank.lv/about/swedbank/contacts/corbanks?language=ENG) | 2026-09-06 |
| Latvia — AS Citadele banka | `PARXLV22` | 14 | [Citadele correspondent banks](https://www.citadele.lv/en/contacts/correspondent-banks/) | 2026-09-06 |
| Estonia — AS SEB Pank | `EEUHEE2X` | 19 | [SEB correspondent banks](https://www.seb.ee/en/private/daily-banking/payments/correspondent-banks) | 2026-09-06 |
| Moldova — National Bank of Moldova | `NBMDMD2X` | 9 | [official correspondent list](https://www.bnm.md/en/node/45291) | 2026-01-02 |
| Albania — ABI Bank sh.a. | `EMPOALTR` | 7 | [bank information](https://www.abi.al/eng/c/45/information) | 2026-09-06 |
| Bosnia — NLB Banka d.d., Sarajevo | `TBTUBA22` | 23 | [correspondent and kontokorent list](https://www.nlb-fbih.ba/pravna-lica/usluge/lista-kontokorentnih-i-korespondentnih-banaka) | 2026-09-06 |
| North Macedonia — Komercijalna Banka AD Skopje | `KOBSMK2X` | 24 | [January 2026 correspondent PDF](https://www.kb.mk/content/Correspondents-January-2026.pdf) | 2026-01-01 |
| North Macedonia — Stopanska Banka AD Skopje | `STOBMK2X` | 19 | [main correspondent banks](https://www.stb.com.mk/en/the-bank/main-corespondent-banks/) | 2026-09-06 |
| Ukraine — Ukrgasbank JSC | `UGASUAUK` | 26 | [correspondents](https://www.ukrgasbank.com/for_financial_organizations/correspondents/) | 2026-09-06 |

## Fidelity and exclusions

- Account numbers from the OTP, EXIMBANKA, Moldova, ABI, Bosnia, North Macedonia, and Ukrgasbank
  publications are never copied into the repository; every account-backed row is a reserved mask.
- NLB, SEB, Citadele, Swedbank, and several correspondent pages publish a bank/currency mapping but
  no account or settlement terms. Those rows are explicitly `bic_only` and cannot be selected as a
  complete SSI.
- The OTP Croatia PDF's direct `OTPVHR2X` EUR TARGET2 self-loop is excluded. The Swedbank
  `PNBPUS3NNYC` USD line and Moldova `FRNYUS33` USD line are excluded because the intermediary BICs
  were not verified in the settlement directory. Komercijalna's legacy `IMBKRUMM` RUB line is also
  excluded. No corridor rules were inferred from these lists.
- All 16 beneficiary identities and their bank-owned source domains are registered in
  `scripts/ssi-autopilot/trusted_identities.json`; the manifest and results passed admission and
  fold verification before commit.

After folding, the cumulative seed contains **339 curated banks, 2,110 SSI records, and 72 corridor
rules**. The Europe coverage test is generated in `tests/test_data_consistency.py`; the regional gate
passed the data-consistency, SSI, and autopilot suites after installing the repository's declared test
dependencies in the local environment.
