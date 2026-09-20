# SSI consolidation wave 10 — Asia-Pacific evidence

This ledger adds 73 unique beneficiary/currency/intermediary route keys from official bank-owned correspondent instructions. Every row is BIC-only metadata: the source publishes a correspondent BIC and currency, but no settlement account or settlement terms. These rows are intentionally marked `status=unverified`, `bic_only=true`, and `terms_inferred=false`; they must not be offered as selectable settlement instructions until independently verified.

| Beneficiary | Official source | Scope | Rows |
| --- | --- | --- | ---: |
| BSP Financial Group Limited (`BOSPPGPMXXX`, Papua New Guinea) | [BSP Swift codes](https://www.bsp.com.pg/help/rates-and-fees/swift-codes/) | AUD (10), NZD (4), PHP (2) | 16 |
| National Australia Bank Limited (`NATAAU3303M`, Australia) | [NAB — receive money from overseas](https://www.nab.com.au/personal/international-banking/receive-money-from-overseas) | USD, GBP, JPY, EUR, NZD | 5 |
| First Commercial Bank Tokyo Branch (`FCBKJPJTXXX`, Japan) | [First Commercial Bank Tokyo Branch](https://www.firstbank.com.tw/sites/fcb/en_US/1565683511170) | JPY, USD | 2 |
| Bank of Communications Hong Kong Branch (`COMMHKHHXXX`, Hong Kong) | [Bank of Communications principal correspondent banks (PDF)](https://www.bankcomm.com.hk/hk/uploadhk/infos/201901/16/2609759/20190116092844_List_of_our_Principal_Correspondent_Banks_en.pdf) | AUD, CAD, CHF, DKK, EUR (2), GBP, JPY (2), NOK, NZD, SEK, SGD, USD (3) | 16 |
| Sunny Bank (`SUNYTWTPXXX`, Taiwan) | [Sunny Bank foreign-currency remittance instructions (PDF)](https://www.sunnybank.com.tw/public/pdf/1040708-%E9%99%BD%E4%BF%A1%E5%95%86%E6%A5%AD%E9%8A%80%E8%A1%8C%E5%8C%AF%E5%85%A5%E6%AC%BE%E5%85%A5%E5%B8%B3%E6%8C%87%E7%A4%BA%28%E6%89%80%E6%9C%89%E5%B9%A3%E5%88%A5%29.pdf) | USD (4), HKD (2), JPY (3), SGD, THB, NZD, AUD, GBP, CHF, EUR (3), CAD (2) | 20 |
| United Overseas Bank Limited Hong Kong Branch (`UOVBHKHHXXX`, Hong Kong) | [UOB Hong Kong inward payment service details (PDF)](https://www.uob.com.sg/web-resources/hk/pdf/hk/application-forms/payments-factsheet-inward-to-uob.pdf) | AUD, CAD, CHF, CNY, DKK, EUR, GBP, JPY, NOK, NZD, SEK, SGD, THB, USD | 14 |

## Extraction and safety notes

- The source pages/PDFs are hosted on the banks' own domains and identify the beneficiary BIC and correspondent BICs. No account numbers, charge codes, value dates, or other settlement terms were copied or inferred.
- Eight-character BICs are represented in canonical 11-character form by appending `XXX`; branch-specific 11-character BICs are preserved exactly (for example, `NATAAU3303M`, `BKNZNZ22985`, and `ICBCTWTP011`).
- Sunny Bank's PDF uses blank currency cells for continuation rows; each continuation is associated with the preceding labelled currency group in the same table. The ledger records only those grouped rows, for a total of 20.
- Candidate keys were compared with the 10,164 route keys on `origin/main` (PR #156); none overlap and all 73 keys are unique within this ledger.
