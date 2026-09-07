# SSI expansion review — 2026-09-07, wave 13 National Bank of Kenya

This checkpoint adds 16 distinct currency/intermediary SSI rows for National Bank of Kenya Ltd.
(`NBKEKENX`) to the existing North-East Africa region. National Bank of Kenya's official
transactional-accounts / way-of-banking page was captured on 2026-09-07 and publishes rows for
AED, AUD, CAD, CHF, CNY, DKK, EUR, GBP, INR, KES, NOK, SEK, TZS, UGX, USD, and ZAR.

The published account values are masked into the region's `ACCT-910013xx` reservation. The page
does not publish charge or value-date terms, so `SHA` / `spot` are conservatively inferred and
every row is marked `unverified` with `terms_inferred=True`. The beneficiary identity and
bank-owned domain are registered in `scripts/ssi-autopilot/trusted_identities.json`; the active
beneficiary BIC was independently checked against the SWIFT directory. No corridor rule was
inferred.

Admission, revision validation, fold verification, seed invariants, and the generated coverage
test passed. The Kenya region retains its historical malformed `KCBKEN22` forbidden-BIC entry as
compatibility policy data; it is not emitted as a seeded correspondent row.

After folding, the cumulative seed contains **369 curated banks, 2,586 SSI records, and 72
corridor rules**.
