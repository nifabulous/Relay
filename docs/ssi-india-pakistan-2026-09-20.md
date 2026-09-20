# India/Pakistan SSI expansion — 2026-09-20

This snapshot contributes **48 new unique beneficiary/currency/intermediary
keys** after de-duplication against the current catalog and the prior
South Asia/global snapshot. Every admitted row is BIC-only, `unverified`, and
non-routable: no account number, charge code, value date, or verifier is
asserted.

Official bank-owned sources and admitted route counts:

| Source | Candidate rows | Admitted rows | Notes |
| --- | ---: | ---: | --- |
| [JS Bank routing PDF](https://www.jsbl.com/wp-content/uploads/2026/03/Routing-details-of-different-currencies-JS-BANK-updated.pdf) | 21 | 5 | 16 keys already existed in the catalog |
| [Central Bank of India NOSTRO PDF](https://www.centralbankofindia.co.in/sites/default/files/documents/FORMAT_OF_MESSAGE_AND_NOSTRO_ACCOUNT_DETAILS_FOR.pdf) | 13 | 12 | One malformed `ANZBA43M` BIC retained only in evidence and excluded |
| [Central Bank of India GIFT IFSC page](https://uat.centralbankofindia.co.in/en/node/225415) | 1 | 1 | Official CBININAAXXX SWIFT and USD correspondent |
| [Bank of India routing PDF](https://bankofindia.co.in/documents/20121/0/wef%2B01.11.2018_ListofSwiftCodesandNostroAcnos.pdf) | 6 | 6 | Treasury-branch BIC `BKIDINBBTRY` |
| [Punjab National Bank remittance page](https://pnb.bank.in/Remittance-Money-to-India.html) | 25 | 24 | One duplicate after canonicalization |

The machine-readable evidence in
[`ssi-india-pakistan-2026-09-20.json`](ssi-india-pakistan-2026-09-20.json)
records source candidate counts, exclusions, malformed source text, and all
BIC normalizations. Eight-character source BICs receive an explicit `XXX`
branch suffix; Wells Fargo's `PNBPUS3NNYC` is normalized to
`PNBPUS33XXX`.
