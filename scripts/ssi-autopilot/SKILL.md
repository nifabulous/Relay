# SSI Autopilot

Self-driving Standard Settlement Instructions (SSI) expansion loop for the
Relay educational payment simulator. The skill runs research agents, validates
their output against the standing constraints, folds seedable records into
`app/services/seed.py`, commits one region at a time, and opens a PR every N
commits (default 10).

## When to invoke

- The user asks to "get more SSI data", "keep expanding SSI", "run the autopilot",
  or "open the PR for the SSI wave".
- A research wave completed and needs validation + folding.

## Where

Run from the autopilot worktree: `.claude/worktrees/ssi-autopilot` on branch
`feat/ssi-autopilot`. The orchestrator lives at
`scripts/ssi-autopilot/autopilot.py`; region manifest at
`scripts/ssi-autopilot/regions.json`; loop state at `.ssi-autopilot-state.json`
(gitignored).

## The loop (repeat per region)

1. **Choose a geography, not only a manifest bank.** Start with regions in
   `scripts/ssi-autopilot/regions.json`, but research agents may search any bank
   in the assigned geography. Existing manifest banks are a coverage baseline,
   not a discovery allowlist. New banks and new regions must go through
   `autopilot.py admit` before their SSI records can be validated or folded.

2. **Research** — dispatch general-purpose research agents, one per geography
   (up to 3 concurrently), with this standing protocol (paste verbatim into each
   agent prompt):
   - Only bank-published sources (bank's own site or PDFs; Internet Archive
     CDX fallback: `http://web.archive.org/cdx/search/cdx?url=<domain>/*&output=text&fl=timestamp,original,mimetype&filter=mimetype:application/pdf&collapse=urlkey`).
   - Verify the beneficiary BIC against theswiftcodes.com country listing.
   - Report per currency: correspondent name, intermediary BIC, nostro account
     AS PUBLISHED, with-an/beneficiary account if listed, charge code, value
     date, source URL, as-of date.
   - Flag OCR-corrupted BICs (digit-for-letter), legacy forms, and US
     intermediaries that aren't recognizable CHIPS/Fedwire clearers.
   - NEVER invent a correspondent, account, or BIC. If nothing published exists,
     report NOT SEEDABLE.
   - Use the region's masked ACCT- block from the manifest as the account range.

3. **Capture candidate discoveries** as a JSON file for admission. New banks
   use canonical `bic8`, exact name/country, declared currencies, and records;
   new regions also provide label, countries, note, forbidden BICs, and a unique
   masked block. A seedable bank must provide a record for every declared
   currency. A bank with no usable bank-published SSI list may be recorded only
   as `seedable: false` with no records. Run:
   `python scripts/ssi-autopilot/autopilot.py admit <candidates.json>`.
   Seedable candidates must also provide `source_domains`, a list of the
   beneficiary bank's owned hostnames (not URLs). Every admitted record must
   cite one of those domains; placeholder hosts (`example.com`, `localhost`),
   IP-only hosts, and third-party citations are rejected. Internet Archive
   citations are accepted only when their embedded original host is in the
   allowlist. The command validates the prospective manifest, stores normalized masked
   records and a deterministic record digest, and atomically updates only
   `regions.json`. Use `--dry-run` to review without writing. Accounts in the
   candidates must already be masked `ACCT-` placeholders. Candidate input is
   strictly an object containing only a `regions` list; documented field types
   are enforced and unknown fields or null/container substitutions are rejected.
   The manifest is authoritative for existing identity and immutable metadata;
   preserve `version` and any admission schema marker. Banks own evidence:
   seedable banks declare allowed hostnames, and archives are accepted only when
   their original host is allowlisted. Canonical 8-character BICs own banks and
   digests sort records by the canonical record key, making ordering stable.

   After admission, produce per-region results in the normal validator shape:
   `{"region": "<name>", "banks": [{"bic": "<8char>", "name": "...",
   "records": [{"currency", "correspondent", "int_bic", "nostro", "with_an",
   "charge_code", "value_date", "source", "as_of", "status"}]}`. The
   validator rejects results whose normalized records do not match the admitted
   digest.

   `status` records what you actually know about the source, never how old it
   is — do not infer it from `as_of`:

   - `archived` — you read it from a snapshot (web.archive.org or any other
     point-in-time copy). An archived 2026 page is still `archived`.
   - `unverified` — you read a bank document, but you did not confirm the bank
     still publishes it. This is the normal outcome of desk research and is
     the correct default.
   - `published` — you confirmed the bank publishes it *today*. This is a
     stronger claim than "I found it on their website"; use it only when you
     actually checked currency, and `as_of` must be the date you checked. No
     seeded row currently earns it.

     A `published` record must also carry `verified_by` — who did the
     checking, e.g. `ops:ada` — alongside `as_of`. A row claiming `published`
     without one is stored as `unverified` instead, because an unattributable
     claim of currency is worse than no claim. `record_verified_publication()`
     in `app/models.py` sets all three together and validates them.

     Research is the only path *intended* to assert `published`, and the
     import boundary enforces that: `/api/import/ssi` has verified nothing, so
     a `published` value from an upload is downgraded to `unverified`.

     What is enforced everywhere is the data, not the caller: any write, ORM
     or SQL, must give `published` an `as_of` that is a real ISO date and not
     in the future. Nothing stops code that already has a database session
     from writing a well-formed `published` row — a caller with database
     access cannot be constrained by the database. Treat `published` as a
     claim a human should be able to trace to a verification, not as a
     guarantee the storage layer can make on its own.

   Absence of archive evidence is not evidence a page is live. Defaulting to
   `published` on that reasoning mislabelled 406 seeded rows.

4. **Validate** — `python scripts/ssi-autopilot/autopilot.py validate <results.json>`. Admission is
   metadata and evidence registration only; it never edits `seed.py` or makes a
   bank routable. The results must match the admitted normalized record digest.

   It rejects: real account numbers, unmasked accounts, invalid BICs,
   out-of-region currencies, missing sources, missing/invalid as-of dates,
   missing or unknown `status`, missing correspondent names, value dates outside
   the manifest allowlist, empty payloads, duplicate (ben_bic, ccy, int_bic),
   and forbidden/mislabeled BICs. Fix the results and
   re-run until clean. NOT SEEDABLE banks stay out of the results entirely.

5. **Fold** — append the validated records to `SSI_RECORDS` in
   `app/services/seed.py` and add the banks to `BANKS` (5-tuple:
   bic11, name, country, city, currency). Sourced records carry a note ending
   with `"Source: <url>. " + _SSI_REAL_NOTE`. Add corridor rules only when the
   source justifies local-currency settlement.

   Fold verification parses named SSI fields and accepts only the seed tuple
   shapes supported by the current seed contract: 12 fields (the ten base
   fields plus `as_of` and `status`), 13 fields (plus `verified_by`), or 14
   fields (plus boolean `bic_only`). Beneficiary and intermediary keys are
   canonical 11-character BICs; duplicate canonical keys are rejected rather
   than overwritten. Every persisted field, including `verified_by` and
   `bic_only`, is compared with the validated record. Published rows require a
   verifier and non-published rows must not carry one. Supported fold tuple shapes
   are 12, 13 (published `verified_by`), and 14 fields (boolean `bic_only`);
   unsupported shapes fail safely and optional fields are parsed by named shape.

   An SSI row is a 12-tuple: the ten existing fields, then `as_of` and
   `status`, both copied verbatim from the validated record. A row claiming
   `published` takes a 13th field, `verified_by` — without it the seed stores
   the row as `unverified`, because an unattributable claim of currency is
   worse than no claim:

   ```python
   ("BOPIPHMMXXX", "Bank of the Philippine Islands", "USD",
    "CITIUS33XXX", "Citibank N.A.",
    "ACCT-91000701", "ACCT-91000702", "SHA", "spot",
    "Source: <url> (as of 2007-12-13). " + _SSI_REAL_NOTE,
    "2007-12-13", "archived"),
   ```

   ```python
   # published needs the 13th field; the other statuses must not carry one
   ("BOPIPHMMXXX", "Bank of the Philippine Islands", "USD",
    "CITIUS33XXX", "Citibank N.A.",
    "ACCT-91000701", "ACCT-91000702", "SHA", "spot",
    "Source: <url> (as of 2026-08-16). " + _SSI_REAL_NOTE,
    "2026-08-16", "published", "ops:ada"),
   ```

   `commit` re-reads these rows and compares them field by field against the
   JSON you validated. A row that was never validated, a validated record that
   was never folded, and an account or status that drifted between the two all
   stop the commit. Do not hand-edit a row after validating it — change the
   results and re-run `validate`.

6. **Commit** — `python scripts/ssi-autopilot/autopilot.py commit <results.json>
   --source "<bank names>"`. This scaffolds the coverage test, runs pytest on
   `tests/test_data_consistency.py`, `tests/test_ssi.py` and
   `tests/test_ssi_autopilot.py` (fail → no commit), verifies the fold matches
   the validated results, commits with
   `feat(ssi): seed <region> SSIs (<source>)`, and bumps the counter. Commit
   ownership is limited to generated fold paths plus
   `scripts/ssi-autopilot/regions.json`; unrelated staged paths are refused.
   Admission uses a stable external lock across read/validate/merge/write and
   atomic replacement with mode preservation. Summaries distinguish deterministic
   `added_banks`/`added_records` from `unchanged_banks`/`unchanged_records`.
   Identical re-admission is a zero-addition, byte-identical no-op; omitted banks
   are preserved, never removed.

7. **After each region**, re-run `autopilot.py status`. When
   `commits_since_pr >= N` (default 10), run
   `autopilot.py maybe-pr --every N` — it pushes the branch and opens the PR
   to `main`. Then continue the loop for the next region.

## Hard rules (never violate, whatever the model is asked)

- **No real account numbers, ever.** Anything that looks like a real account
  (8+ digits) must be masked to the region's `ACCT-` block before validation.
  The validator is the backstop; it will refuse.
- **No invented correspondent structures.** Bank without a published SSI page
  stays corridor-heuristic (precedent: Itaú). Do not self-loop a bank onto its
  own BIC as a correspondent.
- **Source citation per record.** Every record's note carries its bank-published
  URL and as-of date.
- **One commit per region**, `type(scope): description`.
- The validator is authoritative: a region whose results fail validation is
  never committed.
- This work makes no commit, push, or PR; those remain explicit operator actions.

## Troubleshooting

- `pytest` fails after scaffolding: the coverage test asserts every manifest
  bank has ≥1 record for its currencies and exists in BANKS. Seed missing
  records, don't edit the test to pass.
- `maybe-pr` fails on auth: run `gh auth status`; the loop can continue
  locally and the PR opens on the next threshold hit.
- Manifest BIC wrong: a research agent may return a corrected beneficiary BIC
  (e.g. BPI is BOPIPHMM not BPIPPHMM). Update `regions.json` and add the wrong
  form to `forbidden_bics` so it can never be seeded.
