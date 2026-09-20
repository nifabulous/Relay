# SSI batch 111 — Asia-Pacific correspondent evidence

This review ledger records 11 additional, non-duplicate correspondent routes
from official bank-owned sources in Singapore, Thailand, and New Zealand.  The
published tables expose BICs but no settlement account numbers, so every route
is seeded as BIC-only, `unverified`, and non-routable until an independent SSI
verification supplies the account and settlement terms.

| Beneficiary | Official source | Added routes |
| --- | --- | ---: |
| UOB Singapore (`UOVBSGSGXXX`) | <https://www.uob.com.sg/business/help-support/list-of-nostro-agents.page> | 2 |
| DBS Singapore (`DBSSSGSGXXX`) | <https://www.dbs.com.sg/sme/day-to-day/collections/incoming-funds/telegraphic-transfer-info.page> | 1 |
| Kasikornbank Thailand (`KASITHBKXXX`) | <https://www.kasikornbank.com/TH/ApplyForServices/ApplyForServiceForm/GlobalInward_091158.pdf> | 2 |
| ICBC New Zealand (`ICBKNZ2AXXX`) | <https://nz.icbc.com.cn/en/page/721852469130067989.html> | 6 |

The UOB, DBS, Kasikornbank, and ICBC New Zealand rows are copied from the
corresponding official tables as accessed on 2026-09-20.  Eight-character BICs
are normalized to their `XXX` head-office form by the seed loader.  The
UOB table labels its yuan rows `RMB`; these are normalized to ISO `CNY` in the
ledger, matching the repository's currency-alias policy.  UOB's two CNY rows
were already present in the canonical seed after that normalization and are
therefore omitted from this batch's non-duplicate ledger.

The
Kasikornbank PDF row rendered as `SMBCJPT` (not a valid 8/11-character BIC) was
intentionally excluded rather than inferred; similarly, ICBC New Zealand's
NZD self-route was excluded because the source did not publish an intermediary.

The source review found no further high-confidence non-duplicate routes in the
available APAC tables, so this batch is below the 2,500-route target by design.
