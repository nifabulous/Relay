# SSI expansion review — 2026-09-07, wave 9 Sri Lanka

This checkpoint extends the existing Sri Lanka region with 35 account-backed SSI rows for Seylan
Bank PLC (`SEYBLKLX`). Seylan's live official correspondent-bank table was captured on 2026-09-07;
all published account values are masked into the existing `ACCT-910039xx` reservation, using the
unused suffixes 47–81. The page does not publish charge or value-date terms, so `SHA` / `spot` are
conservative inferred values and every row is marked `unverified`.

The table covers AED, AUD, CAD, CHF, CNY, DKK, EUR, GBP, HKD, INR, JPY, NOK, NZD, SAR, SEK, SGD,
and USD through First Abu Dhabi Bank, Standard Chartered, JPMorgan, Royal Bank of Canada,
Agricultural Bank of China, Commerzbank, Deutsche Bank, Bank of Ceylon, Indian Bank, Indian
Overseas Bank, DNB, Saudi Awwal Bank, Korea Exchange Bank, Kookmin, Standard Chartered Pakistan,
Deutsche Bank Trust Company Americas, Standard Chartered New York, Habib American Bank, JPMorgan
New York, Commerzbank's secondary code-table row, OCBC, and Mashreq. The source's malformed
`BOMLAEADA`, seven-character `SCBLBDD`, and directory-unmatched `PNBPUS3N` entries were held out;
duplicate code-table alternatives were only retained when they added a new currency/BIC key. No
corridor rules were inferred.

The beneficiary identity and bank-owned domain are registered in
`scripts/ssi-autopilot/trusted_identities.json`. Admission, revision validation, fold verification,
seed invariants, and the generated coverage test passed.

After folding, the cumulative seed contains **366 curated banks, 2,518 SSI records, and 72 corridor
rules**.
