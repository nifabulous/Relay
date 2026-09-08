# SSI expansion review — 2026-09-07, Kenya correspondent banks

This checkpoint adds 52 distinct currency/intermediary SSI rows to the existing North-East Africa
region: 24 for Stanbic Bank Kenya Limited (`SBICKENX`), 13 for SBM Bank (Kenya) Limited
(`SBMKKENA`), and 15 for Sidian Bank Limited (`SIDNKENA`). The rows were read from each bank's
official correspondent/settlement page on 2026-09-07.

Stanbic publishes account-backed mappings across AED, AUD, BIF, CAD, CHF, CNY, EUR, GBP, GHS,
INR, JPY, KES, MUR, RWF, SEK, SSP, TZS, UGX, USD, and ZAR. SBM publishes account-backed
mappings across AUD, CAD, CNY, EUR, GBP, INR, JPY, and USD; its `CP,FX` settlement label is
preserved in the correspondent label while the canonical `SHA` / `spot` fields remain explicitly
inferred. Sidian publishes account-backed Eco Bank / Standard Bank mappings for AUD, CAD, EUR,
GBP, JPY, USD, and ZAR, plus a Central Bank of Kenya local/East Africa list without bank account
numbers. Those seven Sidian local/East Africa rows are therefore admitted as BIC-only records;
the CBK BIC is normalized from the independently checked SWIFT directory.

All published account values are masked into the existing `ACCT-910013xx` reservation. Rows are
marked `unverified` with `terms_inferred=True` where canonical charge/value fields are not
published. The beneficiary identities and bank-owned domains are registered in
`scripts/ssi-autopilot/trusted_identities.json`; each beneficiary BIC was checked against the
SWIFT directory. No corridor rule was inferred.

Admission, revision validation, fold verification, seed invariants, and the generated coverage
test passed. After folding, the cumulative seed contains **372 curated banks, 2,638 SSI records,
and 72 corridor rules**.
