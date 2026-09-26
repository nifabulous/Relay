# Continuous 2026-09-22 static SSI scope

The 360 rows in the European/RBSI ledgers are a bounded, manually curated
metadata batch. Each row carries the source URL and source date supplied with
the ledger, but this batch has no independent retrieval, PDF/HTML extraction,
or route-level digest gate. The citations are therefore provenance pointers,
not proof that the source currently publishes the exact beneficiary,
currency, or intermediary tuple.

Every row is deliberately `unverified`, BIC-only, has no settlement account or
terms, and is non-routable. This batch must not be described as source-verified
availability metadata until a maintainer-controlled retrieval gate covers all
360 route tuples.
