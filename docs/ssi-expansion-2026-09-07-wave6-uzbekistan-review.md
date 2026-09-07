# SSI expansion review — 2026-09-07, wave 6 Uzbekistan

This checkpoint adds 20 account-backed SSI rows for Ipoteka Bank JSC (`UZHOUZ22`). The source
table was last updated 2026-04-16; every published account value is masked into the reserved
`ACCT-910048xx` block, and `SHA` / `spot` terms are conservative inferences because the bank does
not publish charge or value-date fields.

The table covers USD, EUR, CHF, CNY, and RUB through JPMorgan, OTP Hungary, Commerzbank,
Landesbank Berlin, LBBW Stuttgart, Raiffeisen Vienna, Agricultural Bank of China, Asia-Invest
Moscow, Raiffeisenbank Moscow, and Uzbekistan's NBU, Asaka, Uzpromstroybank, and Orient Finans.
No corridor rules were inferred. The beneficiary BIC is active and verified as `UZHOUZ22` /
`UZHOUZ22XXX`; the bank-owned source and identity are registered in
`scripts/ssi-autopilot/trusted_identities.json`. Admission, validation, fold verification, and the
generated coverage test passed.

After folding, the cumulative seed contains **360 curated banks, 2,402 SSI records, and 72 corridor
rules**.
