# SSI expansion review — 2026-09-07, wave 3

This wave adds 146 SSI routes across nine beneficiary banks. The research was
limited to bank-owned pages or bank-owned PDFs; account values are represented
only by synthetic, region-scoped `ACCT-` masks. Rows remain `unverified` and
the SHA/spot fields are explicitly marked inferred when the bank publication
does not state charge or value-date terms.

| Region block | Beneficiary banks | Added rows | Bank-owned evidence |
| --- | ---: | ---: | --- |
| `91003900` — Sri Lanka | National Savings Bank; People's Bank | 46 | [NSB correspondent banks](https://www.nsb.lk/correspondent-banks/); [People's Bank foreign remittance](https://www.peoplesbank.lk/foreign-remittance/) |
| `91004000` — Kazakhstan | ForteBank; Bank CenterCredit; Altyn Bank; Kazakhstan-Ziraat International Bank | 65 | [Forte correspondent relations](https://business.forte.kz/en/corespondent-relations); [Bank CenterCredit requisites PDF](https://www.bcc.kz/documents/rekvizity.pdf); [Altyn Bank requisites](https://altynbank.kz/en/about/requisites); [KZI correspondent banking](https://kzibank.kz/en/correspondent-banking) |
| `91004100` — Southern Africa | Banco de Fomento Angola; Moza Banco; National Bank of Malawi | 35 | [BFA transfers](https://www.bfa.ao/en/personal/services/bfa-transfers/); [Moza correspondent banks](https://www.mozabanco.co.mz/en/institutional/information/list-of-correspondent-banks/); [National Bank of Malawi correspondents](https://www.natbank.co.mw/about-us/correspondent-banks) |

The beneficiary BICs were checked against country listings on
[The SWIFT Codes — Kazakhstan](https://www.theswiftcodes.com/kazakhstan/),
[Sri Lanka](https://www.theswiftcodes.com/sri-lanka/),
[Angola](https://www.theswiftcodes.com/angola/),
[Mozambique](https://www.theswiftcodes.com/mozambique/), and
[Malawi](https://www.theswiftcodes.com/malawi/). Source-spaced eight-character
intermediary BICs were normalized to canonical eleven-character forms. The NSB
publication's nine-character `UNICRITMM` spelling was not copied; the validated
canonical `UNCRITMMXXX` form is seeded and the source typo is called out in the
candidate evidence.

Moza Banco's image is dated 2020-07-10 and publishes BIC/currency names only,
so those 13 rows are deliberately `bic_only` and flagged as stale/legacy in
the region note. National Bank of Malawi likewise publishes correspondent BICs
and currencies without accounts or terms. The BFA table publishes account
fields; those values are masked. ForteBank's GBP BNY Mellon line did not publish
an account in the source and is therefore `bic_only`.

The research also checked Sri Lanka's remaining lane and several Central Asian
and Southern African markets. Nepal, Cambodia, Laos, Myanmar, Georgia,
Armenia, Azerbaijan, Uzbekistan, Botswana, Zambia, Namibia, Lesotho, and
eSwatini were not seeded in this wave because the reviewed bank-owned material
was generic, supplied only a bank's own BIC, exposed domestic settlement codes,
or did not provide an exact currency/correspondent SSI mapping. In particular,
SIRESS was excluded as a regional settlement code rather than a SWIFT BIC.

After folding, the cumulative seed contains 311 curated banks, 1,572 SSI
records, and 72 corridor rules. No real account digits were retained, and no
row was marked `published`.
