# SSI expansion review — 2026-09-07, wave 10 Tanzania

This checkpoint extends the existing Africa region with nine BIC-only SSI rows for Absa Bank
Tanzania Limited (`BARCTZTZ`). Absa's official corresponding-banks page was captured on
2026-09-07 and lists DKK, EUR, GBP, JPY, KES, NOK, TZS, USD, and ZAR intermediaries.

The source does not publish beneficiary account numbers, charge terms, or value dates. The rows
therefore carry no account, charge, or value-date fields and are explicitly marked BIC-only and
non-selectable; they preserve the published correspondent/BIC evidence without presenting a
usable settlement instruction. The beneficiary BIC was checked against the active Tanzania bank
directory entry before admission. No corridor rule was inferred.

The beneficiary identity and bank-owned domain are registered in
`scripts/ssi-autopilot/trusted_identities.json`. Admission, revision validation, fold verification,
seed invariants, and the generated coverage test passed.

After folding, the cumulative seed contains **367 curated banks, 2,527 SSI records, and 72
corridor rules**.
