# India and Sri Lanka SSI wave 10k (batch 2)

This follow-up ledger adds 37 further unique BIC-level relationships after
deduplication against the 10,164-key `origin/main` baseline and batch 1. The
source tables exposed 42 raw candidates: four were already present for HNB and
one SBI row used the legacy `SCBLDEFXXXX` alias, which was omitted rather than
creating a non-canonical route. All emitted rows use canonical eleven-character
BICs, have no settlement account fields, and remain `unverified`,
`bic_only=true`, and non-routable.

| Beneficiary | Source | As of | Unique rows |
| --- | --- | --- | ---: |
| Hatton National Bank (`HNBKLKLXXXX`) | [HNB Standard Settlement Instruction](https://www.hnb.lk/standard-settlement-instruction) | 2026-09-20 | 34 |
| State Bank of India (`SBININBBXXX`) | [SBI Correspondent Bank Accounts](https://sbi.bank.in/web/nri/remittances/correspondent-bank-accounts) | 2026-09-20 | 3 |

The SBI page displays an older “Last Updated On” label, so the records are
kept as unverified BIC-only metadata pending a fresh operational confirmation.
The ledger is independent of `seed.py`; central integration can admit it after
the usual parity review.
