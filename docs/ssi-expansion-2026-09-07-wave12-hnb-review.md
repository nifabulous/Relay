# SSI expansion review — 2026-09-07, wave 12 Hatton National Bank

This checkpoint adds 38 distinct currency/intermediary SSI rows for Hatton National Bank PLC
(`HBLILKLX`) to the existing Sri Lanka region. HNB's official Standard Settlement Instruction
page was captured on 2026-09-07 and publishes rows across AED, AUD, CAD, CHF, CNY, DKK, EUR,
GBP, HKD, INR, JPY, NOK, NZD, SAR, SEK, SGD, THB, and USD.

Published account values are masked into the existing `ACCT-910039xx` reservation. The block had
already been used by earlier Sri Lanka banks, so the available suffixes are reused deliberately
after the reserved series was exhausted; no source account value is present in the seed. The page
does not publish charge or value-date terms, so `SHA` / `spot` are conservatively inferred and
every row is marked `unverified` with `terms_inferred=True`. HNB publishes two INR rows under the
same `(currency, intermediary BIC)` key; the canonical fold retains one trade-related row and
holds out the duplicate key. No corridor rule was inferred.

The beneficiary identity and bank-owned domain are registered in
`scripts/ssi-autopilot/trusted_identities.json`. Admission, revision validation, fold verification,
seed invariants, and the generated coverage test passed.

After folding, the cumulative seed contains **368 curated banks, 2,570 SSI records, and 72
corridor rules**.
