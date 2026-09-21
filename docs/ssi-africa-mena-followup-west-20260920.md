# Africa/MENA SSI 10k follow-up — Nigeria and Cameroon

This standalone ledger adds 24 BIC-only correspondent routes from two official
bank sources. It intentionally contains no customer account numbers and is
marked `unverified`/non-routable pending central seed integration and review.

Sources:

- Access Bank Nigeria credit inflow instructions: six currency/correspondent
  routes for beneficiary BIC `ABNGNGLA` (canonicalized to `ABNGNGLAXXX`).
- Afriland First Bank Cameroon correspondent table: eighteen currency/
  correspondent routes for beneficiary BIC `CCEICMCX` (canonicalized to
  `CCEICMCXXXX`). The printed Standard Chartered `SCBLDEFXXXX` row was omitted
  because that alias canonicalizes to `SCBLDEFFXXX` and has caused collisions in
  the central catalog.

Regression coverage in `tests/test_ssi_africa_mena_followup_west_20260920.py`
checks exact counts, canonical BICs, uniqueness, source parity, and BIC-only
safety.
