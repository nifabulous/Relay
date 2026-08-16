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

1. **Pick the next region** from `scripts/ssi-autopilot/regions.json` that has
   no seed records yet (check `autopilot.py status`, then confirm against
   `app/services/seed.py`). Prefer regions the manifest lists first.

2. **Research** — dispatch general-purpose research agents, one per region (up
   to 3 concurrently), with this standing protocol (paste verbatim into each
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

3. **Capture results** as a JSON file matching the validator schema, one per
   region: `{"region": "<name>", "banks": [{"bic": "<8char>", "name": "...",
   "records": [{"currency", "correspondent", "int_bic", "nostro", "with_an",
   "charge_code", "value_date", "source", "as_of"}]}]}`. Accounts in the
   results must already be masked `ACCT-` placeholders (transcribe any real
   digits to the region's masked block).

4. **Validate** — `python scripts/ssi-autopilot/autopilot.py validate <results.json>`.
   It rejects: real account numbers, unmasked accounts, invalid BICs,
   out-of-region currencies, missing sources, missing as-of dates, duplicate
   (ben_bic, ccy, int_bic), and forbidden/mislabeled BICs. Fix the results and
   re-run until clean. NOT SEEDABLE banks stay out of the results entirely.

5. **Fold** — append the validated records to `SSI_RECORDS` in
   `app/services/seed.py` and add the banks to `BANKS` (5-tuple:
   bic11, name, country, city, currency). Sourced records carry a note ending
   with `"Source: <url>. " + _SSI_REAL_NOTE`. Add corridor rules only when the
   source justifies local-currency settlement.

6. **Commit** — `python scripts/ssi-autopilot/autopilot.py commit <results.json>
   --source "<bank names>"`. This scaffolds the coverage test, runs pytest on
   `tests/test_data_consistency.py` (fail → no commit), commits with
   `feat(ssi): seed <region> SSIs (<source>)`, and bumps the counter.

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

## Troubleshooting

- `pytest` fails after scaffolding: the coverage test asserts every manifest
  bank has ≥1 record for its currencies and exists in BANKS. Seed missing
  records, don't edit the test to pass.
- `maybe-pr` fails on auth: run `gh auth status`; the loop can continue
  locally and the PR opens on the next threshold hit.
- Manifest BIC wrong: a research agent may return a corrected beneficiary BIC
  (e.g. BPI is BOPIPHMM not BPIPPHMM). Update `regions.json` and add the wrong
  form to `forbidden_bics` so it can never be seeded.
