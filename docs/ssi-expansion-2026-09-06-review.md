# SSI expansion review — 2026-09-06

This wave adds 107 beneficiary SSI routes from bank-owned publications. All
account-bearing values in `app/services/seed.py` are synthetic `ACCT-` masks;
no real account identifiers were copied into the repository. Rows sourced from
correspondent-only tables are marked `bic_only` and expose no account, charge,
or value-date claim. Every new row is `unverified` pending operator review.

## Sources and coverage

| Region | Beneficiary banks | Bank-owned source | Routes |
| --- | --- | --- | ---: |
| Japan | Daiwa Next Bank; Rakuten Bank; au Jibun Bank | [Daiwa Next remittance guidance](https://www.bank-daiwa.co.jp/saving/fc_futsu/transfer/); [Rakuten incoming transfer guide](https://www.rakuten-bank.co.jp/geo/incoming/flow-02.html); [au Jibun remittance PDF](https://www.jibunbank.co.jp/service/foreign_money_order/howto/pdf/remittance_request.pdf) | 22 |
| Western Europe | Cassa Centrale Banca; Banco BPM; Aresbank; Alpha Bank | [Cassa Centrale correspondent list](https://www.cassacentrale.it/sites/default/files/documents_attachments/Lista%20Corrispondenti%202025.pdf); [Banco BPM SSI document](https://gruppo.bancobpm.it/download/standard-settlement-instructions-per-il-regolamento-dei-fx-banche/); [Aresbank correspondent table](https://www.aresbank.es/es/centro-de-informacion/bancos-corrresponsales-moneda-extranjera); [Alpha Bank financial-institutions page](https://www.alpha.gr/en/retail/support-center/legal-and-regulatory-framework/financial-institutions) | 33 |
| Mauritius | MauBank; AfrAsia Bank | [MauBank August 2026 SSI PDF](https://maubank.mu/media/xewjema3/list-of-ssi-august-2026.pdf); [AfrAsia correspondent table](https://www.afrasiabank.com/en/international/correspondent-banks) | 52 |

The autopilot manifest reserves blocks `91002600` (Japan), `91003400`
(Western Europe), and `91003500` (Mauritius). Settlement terms are not
published by the account-bearing sources, so their `SHA`/`spot` fields are
explicitly tagged `terms_inferred`.

## Deliberate exclusions

- Aresbank and Alpha Bank EUR self-routing rows were excluded; the data model
  does not self-loop a beneficiary onto its own BIC as a correspondent.
- Bank One Mauritius was deferred because its accessible SSI PDF is labelled
  only “2024”, not an ISO `as_of` date accepted by the admission gate.
- AfrAsia rows with the printed SGD typo, the mixed-case BDT transcription, and
  legacy Frankfurt `SCBLDEFX` forms were excluded rather than silently corrected.
- Western-European banks without a bank-owned currency/correspondent table
  (Banco BPI, Belfius, de Volksbank, Rabobank, Banque Cantonale Vaudoise, and
  BAWAG) remain unseeded.

Operator review of the newly enrolled trusted identities is still required
before any route is promoted from `unverified` to `published`.
