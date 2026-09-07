# SSI expansion review — 2026-09-07, wave 11 Namibia

This checkpoint adds five BIC-only SSI rows for First National Bank of Namibia Limited
(`FIRNNANX`). FNB Namibia's official FX guidance page was captured on 2026-09-07 and publishes
currency-to-correspondent mappings for AUD, CHF, EUR, GBP, and USD.

The page does not publish beneficiary account numbers, charge terms, or value dates. The rows
therefore carry no account, charge, or value-date fields and are explicitly marked BIC-only and
non-selectable; they preserve the bank's published intermediary evidence without presenting a
usable settlement instruction. The beneficiary BIC was checked against the active Namibia bank
directory entry before admission. No corridor rule was inferred.

The beneficiary identity and bank-owned domain are registered in
`scripts/ssi-autopilot/trusted_identities.json`. Admission, revision validation, fold verification,
seed invariants, and the generated coverage test passed.

After folding, the cumulative seed contains **368 curated banks, 2,532 SSI records, and 72
corridor rules**.
