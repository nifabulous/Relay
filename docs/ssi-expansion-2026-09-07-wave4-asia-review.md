# SSI expansion review — 2026-09-07, wave 4 Asia-Pacific

This checkpoint adds 215 SSI rows across 12 beneficiary banks in Nepal,
Mongolia, Brunei, and Cambodia. Local retrieval occurred on 2026-09-07, but
the seed uses UTC-safe `as_of` 2026-09-06 for live pages because the runtime
clock was still on 2026-09-06 UTC. Older bank publications retain their own
document dates.

| Market | Banks | Rows | Evidence |
| --- | ---: | ---: | --- |
| Nepal | Agricultural Development Bank; Everest Bank; Laxmi Sunrise; Citizens Bank; Nabil Bank | 75 | [Agricultural Development Bank correspondent network](https://adbl.gov.np/en/global-correspondent-network), [Everest](https://everestbankltd.com/product-and-services/remittance/swift/), [Laxmi Sunrise](https://www.laxmisunrise.com/correspondent-banking/), [Citizens PDFs](https://www.ctznbank.com/assets/backend/uploads/correspondent%20banks/SCB%20EUR.pdf), [Nabil](https://www.nabilbank.com/nabilbank/products/correspondent-banking-details) |
| Mongolia | Transport and Development Bank (TransBank); XacBank | 50 | [TransBank](https://transbank.mn/en/organization/foreign-payments-and-settlements-organization/correspondent-banks), [XacBank](https://xacbank.mn/en/correspondent-banks) |
| Brunei | Baiduri Bank; Bank of China Brunei branch | 37 | [Baiduri SSI PDF](https://www.baiduri.com.bn/clients/Baiduri_Bank_02_DB46FAE5-2CE9-4217-B0E0-B472FC448BAF/contentms/img/download-centre/BAIDURI-BANK-BERHAD-SSI-SETTLEMENT-JUNE-2023.pdf), [Bank of China Brunei remittance](https://www.bankofchina.com.bn/m/en-bn/segment/personal-banking/remittance-and-exchanges/remittance-inward-outward.html) |
| Cambodia | ABA Bank; Foreign Trade Bank; Phnom Penh Commercial Bank | 53 | [ABA correspondents](https://www.ababank.com/about-us/correspondent-banks/), [FTB 2024 annual report](https://ftb.com.kh/uploads/2025/06/Final-FTB-AR-2024-EN.pdf), [PPCBank international transfer](https://www.ppcbank.com.kh/fund-transfer/international-transfer/) |

Account fields from bank publications are replaced with region-scoped
`ACCT-910044xx` masks. Charge/value fields are `SHA`/`spot` only where the
source omitted terms and are marked inferred; BIC-only publications carry no
accounts, charge codes, or value dates. The legacy `SCBLDEFX` spelling in
South Asian tables is normalized to `SCBLDEFFXXX` and called out in the region
note. Mongolia's customer-eligibility footnotes remain visible in the source
note; the rows are not marked `published`.

Laos, Myanmar, Fiji, Timor-Leste, and additional Cambodian/Laotian tables were
reviewed but not folded where the exact row matrix was incomplete, generic, or
did not identify a beneficiary BIC under the standing protocol. No real account
digits were retained.

The cumulative seed now contains 323 curated banks, 1,787 SSI records, and 72
corridor rules.
