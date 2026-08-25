# SSI trust-expansion review evidence

**Status: PENDING OWNER SIGN-OFF.** Eleven identities below were added to
`scripts/ssi-autopilot/trusted_identities.json` by this PR's waves (2026-08-22);
the first three predate this PR and are listed for completeness.
Per `TRUST_REGISTRY.md`, merging requires an SSI/data owner to review this table
and confirm each row's three checks. The registry change must not merge without
that sign-off.

Runtime safeguard (verified): executable routing selects only rows with
`status == "published"` and `bic_only == false` (`app/services/routing.py`, pinned by
`tests/test_routing.py` `published-ssi` assertions). Every row this wave seeded is
`archived` or `unverified` — i.e. informational until a human confirms currency.

| BIC | Bank | Country | Owned domains | Records source | Region |
|---|---|---|---|---|---|
| BBDEBRSP | Banco Bradesco | BR | banco.bradesco | Bradesco official cambio SSI PDF (web.archive.org) | latin-america |
| CMBCCNBS | China Merchants Bank | CN | cmbchina.com | CMB overseas-remittance page (archived 2016-10-16) | china |
| CTBAAU2S | Commonwealth Bank of Australia | AU | commbank.com.au | Commonwealth Bank correspondent list (archived) | oceania |
| UOVBSGSG | United Overseas Bank Limited | SG | uob.com.sg | UOB 'List of Nostro Agents' page (2024 snapshot; 2017 edition corroborates) | singapore |
| OCBCSGSG | Oversea-Chinese Banking Corporation Limited | SG | ocbc.com | OCBC telegraphic-transfer help page (live 2026-08-22) | singapore |
| BBUKIDJA | PT Bank KB Bukopin Tbk | ID | bukopin.co.id | Bukopin depository-correspondent PDF (archived 2017-05-16; RMA directories 2012+2017) | indonesia |
| CERBUGKA | Centenary Rural Development Bank Limited (Centenary Bank Uganda) | UG | centenarybank.co.ug | "Correspondent Bank Address & Swift Codes" page (archived 2016) | uganda |
| HASEHKHH | Hang Seng Bank Limited | HK | hangseng.com | Hang Seng inward-payments 'Smart Tips' PDF (2019+2020 snapshots identical) | hong-kong |
| BEASHKHH | The Bank of East Asia, Limited | HK | hkbea.com | BEA 'Useful information (Inward Remittance)' PDF dated 11/2020 (snapshot 2021-12-05) | hong-kong |
| ESUNTWTP | E.SUN Commercial Bank, Ltd. | TW | esunbank.com.tw | E.SUN self-titled Nostro/SSI list, doc dated 2018-11-29 (snapshot 2019-09-15) | taiwan |
| HNBKTWTP | Hua Nan Commercial Bank, Ltd. | TW | hncb.com.tw | Hua Nan five per-currency remittance PDFs (snapshots 2003-11..2004-01) | taiwan |
| ROYCCAT2 | Royal Bank of Canada | CA | rbcroyalbank.com | RBC wire-transfer inbound correspondent table (live 2026-08-22) | canada |
| CIBCCATT | Canadian Imperial Bank of Commerce | CA | cibc.com | CIBC USD intermediary instructions (live 2026-08-22) | canada |

## Per-identity checks performed by the research agents

1. **BIC** — every beneficiary BIC was confirmed against theswiftcodes.com country
   listing AND corroborated by the bank's own publication printing that BIC.
2. **Name/country** — taken from the directory entry matched above; candidates whose
   name/country disagreed with the registry were rejected at admission.
3. **Domain ownership** — citations must resolve to these hostnames (or a Wayback
   capture whose embedded original host matches); third-party citations are refused
   by `_bank_owned_source`.
4. **Negative findings** are recorded per bank in `scripts/ssi-autopilot/results/*-identities.json`
   (untracked working evidence), summarized into each region's manifest note.

## Owner sign-off

- [ ] Reviewer confirms domain ownership for all twelve hostnames.
- [ ] Reviewer spot-checks one representative archived row per region against its capture.
- [ ] Reviewer approves this file plus `trusted_identities.json` in the PR review.
