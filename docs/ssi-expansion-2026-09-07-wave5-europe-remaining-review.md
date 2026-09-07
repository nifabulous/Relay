# SSI expansion review — 2026-09-07, wave 5 Europe remaining

This checkpoint adds 69 SSI rows across five previously uncovered European beneficiary banks:
Ziraat Bank Montenegro, Bank of Valletta, MeDirect Bank Malta, Islandsbanki, and Kvika banki.
Seventeen rows carry masked account placeholders in the reserved `ACCT-910047xx` range; the
remaining 52 rows are correspondent-only relationships because the bank publication did not
provide account, charge-code, or value-date terms.

| Country / bank | BIC | Rows | Bank-published source | Observation date |
| --- | --- | ---: | --- | --- |
| Montenegro — Ziraat Bank Montenegro | `TCZBMEPG` | 6 | [correspondent banking](https://ziraatbank.me/en/correspondent-banking) | 2026-09-06 |
| Malta — Bank of Valletta plc | `VALLMTMT` | 25 | [corresponding banks](https://www.bov.com/meta/downloads/corresponding-banks) | 2025-05-29 |
| Malta — MeDirect Bank Malta | `MBWMMTMT` | 15 | [correspondent-bank network PDF](https://www.medirect.com.mt/wp-content/uploads/Correspondent-Bank-Network-for-Business-Accounts.pdf) | 2025-06-23 |
| Iceland — Islandsbanki hf. | `GLITISRE` | 12 | [foreign settlement banks](https://www.islandsbanki.is/is/grein/erlendir-vidskiptabankar-islandsbanka) | 2026-09-06 |
| Iceland — Kvika banki hf. | `MPBAISRE` | 11 | [standard settlement instructions](https://kvika.is/en/standard-settlement-instructions/) | 2026-09-06 |

The Ziraat and Kvika rows are account-backed but account values are never copied into the
repository; they are masked into the reserved block. Kvika's source uses non-ISO labels such as
`ANYY`, `COPA`, and `FOEX`; these are preserved in the correspondent label while the normalized
charge field is `SHA` with `terms_inferred=true`. Islandsbanki's source includes an eight-character
`CHASDEFX` identifier, which is stored in the canonical `CHASDEFXXXX` form.

The direct self-settlement rows for Kvika's local `MPBAISRE` relationship and other beneficiary
self-loops were excluded. A researched PriBank Kosovo candidate was deferred because the strict BIC
validator rejects the Kosovo `XK` country code; no Kosovo row was invented. No corridor rules were
inferred. All five beneficiary identities and their bank-owned source domains are registered in
`scripts/ssi-autopilot/trusted_identities.json`; admission, results validation, fold verification,
and the generated coverage test passed.

After folding, the cumulative seed contains **346 curated banks, 2,199 SSI records, and 72 corridor
rules**.
