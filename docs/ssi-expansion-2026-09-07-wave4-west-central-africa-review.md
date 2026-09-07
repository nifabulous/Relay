# SSI expansion review — 2026-09-07, wave 4 West/Central Africa

This checkpoint adds 20 SSI rows across BSIC Guinea and BSIC Benin. Four rows carry
masked UBAF Paris account placeholders; the remaining 16 rows are correspondent-only
relationships because the bank publication did not provide account, charge-code, or
value-date terms.

| Beneficiary | BIC | Rows | Bank-owned source | Observation date |
| --- | --- | ---: | --- | --- |
| BSIC Guinea | `BSGNGNGN` | 10 | [Notre réseau](https://www.bsic-guinee.com/notre-reseau/) | 2026-09-06 |
| BSIC Benin | `BSAHBJBJ` | 10 | [Nos correspondants](https://bsic-guinee.com/benin/reseaux/nos-correspondants/) | 2026-09-06 |

Both pages list EUR and USD relationships with UBAF Paris (`UBAFFRPP`), BIA Paris,
A&T Bank (`ATUBTRIS`), Alubaf International Bank Tunis (`ALUBTNTT`), and BMCE
Bank International Madrid (`BMCEESMM`). The USD BIA line is represented through
the published JPMorgan clearing intermediary `CHASUS33`; the A&T USD line retains
the source's parenthesized `IRVTUS3N` presentation in the correspondent label while
using the canonical BIC for the validated intermediary field.

No local-currency corridor rule was inferred. Account values remain synthetic
`ACCT-910042xx` masks, and every row is `unverified` with a bank-owned citation.
The two beneficiary identities and the shared bank-owned domain are registered in
`scripts/ssi-autopilot/trusted_identities.json`; admission, results validation,
fold verification, and the generated coverage test all passed.

After folding, the cumulative seed contains **341 curated banks, 2,130 SSI records,
and 72 corridor rules**.
