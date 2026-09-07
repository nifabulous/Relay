# SSI expansion review — 2026-09-07, wave 8 Caucasus revision

This checkpoint revises the existing Caucasus region with 30 account-backed SSI rows for
Araratbank OJSC (`ARMCAM22`), AccessBank CJSC (`ACABAZ22`), and Unibank CB (`UBAZAZ22`). The
bank-owned Araratbank PDFs were captured as of 2026-08-17; AccessBank and Unibank correspondent
pages were captured as of 2026-09-06. Published account values are masked into the existing
`ACCT-910046xx` reservation. The revision uses the unused suffixes first and reuses the final
placeholder only after the 100-value block is exhausted; these values are synthetic masks, never
source account numbers. Neither source publishes charge or value-date terms, so `SHA` / `spot`
remain conservative inferred values and every row is marked `unverified`.

Araratbank covers USD, EUR, GBP, CHF, CNY, AED, GEL, and CAD through National Bank of Canada,
Commerzbank, Intesa Sanpaolo, Barclays, UBS, Zhejiang Chouzhou, Mashreqbank, Bank of Georgia,
TBC Bank, and JPMorgan's London intermediary. AccessBank covers USD, EUR, GBP, RUB, and TRY
through Raiffeisen, BNY Mellon, Bank of Georgia, Bank CenterCredit, Societe Generale, LBBW,
IBA-Moscow, and Misyon Bank. Unibank covers USD, EUR, GBP, RUB, and GEL through BNY Mellon,
Societe Generale, Commerzbank, Asian-Pacific Bank, and Bank of Georgia. The source AZN rows ending
in a Cyrillic `C` were held out; Araratbank's unpublished/currently absent BYN and RUB mappings
were also held out. No corridor rules were inferred.

The identities and bank-owned domains are registered in
`scripts/ssi-autopilot/trusted_identities.json`. Admission, revision validation, fold verification,
seed invariants, and the generated coverage test passed.

After folding, the cumulative seed contains **365 curated banks, 2,483 SSI records, and 72 corridor
rules**.
