# SSI expansion review — 2026-09-07, wave 7 Uzbekistan

This checkpoint extends the existing Uzbekistan region with 51 account-backed SSI rows for JSIC
Bank Ipak Yuli (`INIPUZ22`) and Uzbekistan Industrial and Construction Bank (Uzpromstroybank)
(`UJSIUZ22`). Ipak Yuli's bank-owned correspondent page was captured as of 2026-09-07; the SQB
correspondent page was captured as of 2025-02-13. Every published account value is masked into the
reserved `ACCT-910048xx` block. Neither source publishes charge or value-date terms, so `SHA` /
`spot` remain conservative inferred values and every row is marked `unverified`.

The Ipak Yuli table covers EUR, USD, GBP, JPY, CNY, CHF, RUB, and AED through Commerzbank,
Raiffeisen Bank International, First Jiangsu Bank, Citibank, Kookmin Bank, NBU, Uzpromstroybank,
Asia-Invest Moscow, Raiffeisenbank Moscow, and Bank of America. The SQB table covers USD, EUR,
GBP, JPY, CHF, RUB, CNY, AED, and TRY through Citi, JPMorgan, Berliner Sparkasse, Commerzbank,
Solae, Banca Popolare di Sondrio, Raiffeisen Bank International, Asia-Invest Moscow, Kookmin,
SMBC, NBU, and Caytürk. Bank-published 11-character BICs are preserved where supplied (including
`FJIBCNBA500`, `BOMLAEADXXX`, and `ABOCCNBJ260`); LORO/VOSTRO lists and non-selectable rows were
not seeded. No corridor rules were inferred.

The identities and bank-owned domains are registered in
`scripts/ssi-autopilot/trusted_identities.json`. Admission, validation, fold verification, seed
invariants, and the generated coverage test passed.

After folding, the cumulative seed contains **362 curated banks, 2,453 SSI records, and 72 corridor
rules**.
