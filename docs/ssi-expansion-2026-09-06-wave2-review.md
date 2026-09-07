# SSI expansion review — 2026-09-06, wave 2

This wave adds 137 beneficiary SSI routes from bank-owned pages and PDFs: 86
account-backed rows with synthetic `ACCT-` masks and 51 correspondent-only
(`bic_only`) rows. Fourteen new beneficiary banks cover nine countries. All
live desk-research rows are `unverified`; seven AFC Commercial Bank rows are
`archived` because the bank's PDF says it was last updated on 2024-05-03.

The cumulative seed now contains 302 curated banks, 1,426 SSI records, and 72
corridor rules. No real account number is stored.

## Sources and coverage

| Region | Beneficiary banks | Bank-owned source(s) | Routes |
| --- | --- | --- | ---: |
| Bulgaria + Cyprus | Central Cooperative Bank; Alpha Bank Cyprus; Hellenic Bank / current Eurobank Cyprus | [CCB correspondent list](https://www.ccbank.bg/en/za-ckb/international-activity/list-of-ccb-ad-nostro-accounts); [Alpha Cyprus correspondent table](https://www.alphabank.com.cy/en/international/useful-info/correspondent-banks); [Eurobank/Hellenic correspondent PDF](https://www.eurobank.cy/-/media/hbc/international/international-payments/list-of-correspondent-banks---hb.pdf) | 60 |
| Ecuador + Bolivia | Banco Guayaquil; Banco Ganadero | [Banco Guayaquil incoming-transfer instructions](https://ayuda.bancoguayaquil.com/hc/es/articles/4409273800724--Cu%C3%A1les-son-los-datos-para-recibir-una-transferencia-desde-el-exterior); [Banco Ganadero giros page](https://www.bg.com.bo/personas/servicios/transferencias/giros/) | 19 |
| Paraguay + Uruguay | Banco Familiar; Sudameris; Banco Itaú Uruguay; Scotiabank Uruguay | [Familiar comercio exterior](https://www.familiar.com.py/comercio-exterior); [Sudameris correspondent PDF](https://www.sudameris.com.py/storage/app/media/Bancos-Corresponsales.pdf); [Itaú Uruguay May 2023 PDF](https://www.itau.com.uy/inst/aci/docs/PDF%20GIROS%20MAY%202023.pdf); [Scotiabank Uruguay transfers](https://www.scotiabank.com.uy/Empresas/Servicios/Servicios/giros-y-transferencias) | 11 |
| Rwanda + Tanzania | I&M Bank Rwanda; Bank of Kigali; I&M Bank Tanzania | [I&M Rwanda SWIFT transfers](https://www.imbankgroup.com/rw/funds-transfer/swift-transfers/); [Bank of Kigali correspondent banks](https://bk.rw/personal/correspondent-banks); [I&M Tanzania SWIFT transfers](https://imbank.co.tz/funds-transfer/swift-transfers/) | 33 |
| Zimbabwe | AFC Commercial Bank; NMB Bank | [AFC Commercial Bank SSI PDF](https://www.afcholdings.co.zw/wp-content/uploads/2025/05/Standard-Settlement-Instructions-AFC-Commercial-Bank.pdf); [NMB correspondent banking](https://www.nmbz.co.zw/nmb/correspondent-banking) | 14 |

The manifest reserves blocks `91003600` (Bulgaria/Cyprus), `91003700`
(Ecuador/Bolivia/Paraguay/Uruguay), and `91003800` (Rwanda/Tanzania/Zimbabwe).
Eurobank's beneficiary BIC remains the independently listed `HEBACY2N`
(Hellenic Bank name on the BIC registry); the evidence note records the
current Eurobank merger context rather than silently replacing the identity.

## Deliberate exclusions and normalizations

- Banco Ganadero's `PICHUS3MXXX` Miami intermediary was excluded because the
  source did not establish a recognizable CHIPS/Fedwire clearing identity.
- The old Itaú Uruguay `COBADEEF` spelling was excluded; the retained Standard
  Chartered Frankfurt row is normalized to `SCBLDEFFXXX`.
- CCB's and Alpha Cyprus's duplicate/self-referential or repeated table rows
  were reduced to unique `(beneficiary, currency, intermediary)` keys. The
  Eurobank EUR self-loop (`HEBACY2N`) and the dissolved legacy `ERBKCY2N`
  document were excluded.
- I&M Tanzania self-loops, a malformed JPY BIC, and Bank of Kigali's
  currency/account-mismatch rows were excluded. NMB Zimbabwe's obsolete ODDO
  route and mixed-label rows were not carried forward.
- No account, charge-code, or value-date claim is made for `bic_only` rows;
  account-bearing terms are explicitly tagged as inferred pending operator
  review.

All newly enrolled identities and source domains are in
`scripts/ssi-autopilot/trusted_identities.json`. Promotion from `unverified`
to `published` remains an operator action.
