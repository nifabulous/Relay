# SSI Admission Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden SSI autopilot admission so only type-safe, bank-evidenced, identity-bound, digest-stable candidates can enter `regions.json`, while fold verification and CLI writes remain atomic, serialized, idempotent, and safe.

**Architecture:** Keep admission in `scripts/ssi-autopilot/autopilot.py` as a pure normalization/validation layer followed by a locked atomic manifest update. Keep the existing `validate_results()` authoritative for privacy, BIC, currency, account-mask, provenance, date, charge, and value-date rules. Keep fold verification separate and compare canonical identities plus the complete supported seed-row shape.

**Tech Stack:** Python 3, `pytest`, `argparse`, JSON, `hashlib`, `ast`, Unix `fcntl`, atomic `os.replace`, subprocess/temp-path fixtures, and the existing SSI manifest/seed conventions.

## Global Constraints

- Work only in `/Users/olaniyi.oladokun/Leatherback/ssi-data-wave`.
- Do not commit, push, open, update, or merge a PR.
- Preserve all existing SSI data and the Southern Africa manifest correction.
- Modify only `scripts/ssi-autopilot/autopilot.py`, `scripts/ssi-autopilot/SKILL.md`, and `tests/test_ssi_autopilot.py`.
- Use red-green-refactor for every behavior: failing test, focused failure run, minimal fix, focused pass, regression run.
- Reject `None`, numbers, lists, and mappings instead of coercing them to strings.
- Do not weaken `validate_results()` or account/privacy rules to satisfy admission or fold tests.
- The manifest update must remain atomic, preserve its file mode, and leave no lock/temp file beside tracked `regions.json`.

---

## Current Worktree Baseline

The target worktree already has uncommitted changes in the scoped files, a modified `regions.json`, and an untracked `scripts/ssi-autopilot/regions.json.lock`. Treat them as user-owned. Before implementation, record them and confirm the lock is not held by an active process. Do not reset or overwrite the Southern Africa correction.

Run:

```sh
cd /Users/olaniyi.oladokun/Leatherback/ssi-data-wave
git status --short
git diff -- scripts/ssi-autopilot/autopilot.py scripts/ssi-autopilot/SKILL.md tests/test_ssi_autopilot.py scripts/ssi-autopilot/regions.json
python -m pytest tests/test_ssi_autopilot.py -q
```

Expected: the current state and failures are recorded, existing edits remain intact, and no lock is removed while held. If the lock is stale, remove only that generated artifact during Task 5.

## File Map

- Modify `scripts/ssi-autopilot/autopilot.py` for admission schema/type validation, deterministic digests, identity/evidence checks, fold parsing, locking, atomic writes, summaries, and commit-owned paths.
- Modify `tests/test_ssi_autopilot.py` for all regression, CLI, persistence, and concurrency tests.
- Modify `scripts/ssi-autopilot/SKILL.md` for the final admission schema, evidence policy, digest key, lock behavior, summary semantics, fold shapes, and idempotency contract.
- Preserve `scripts/ssi-autopilot/regions.json` and its Southern Africa correction.

## Task 1: Establish type-safe admission and deterministic digests

**Files:**
- Modify: `scripts/ssi-autopilot/autopilot.py:_normalize_record`, `_normalize_bank`, `_validate_admission_envelope`, `record_digest`
- Test: `tests/test_ssi_autopilot.py` admission section

**Interfaces:**
- Add `_require_mapping(value: object, path: str) -> dict` and `_require_sequence(value: object, path: str) -> list` for controlled errors.
- Add `_record_sort_key(record: dict) -> tuple[str, ...]` over normalized fields in this order: `currency`, `int_bic`, `correspondent`, `nostro`, `with_an`, `charge_code`, `value_date`, `source`, `as_of`, `status`, and `verified_by`.
- Make `record_digest(records: list[dict]) -> str` hash a sorted copy using `_canonical_json`; never mutate the input list.

- [ ] **Step 1: Add failing tests.** Add tests named `test_admission_rejects_null_and_wrong_container_types`, `test_admission_rejects_non_string_record_fields_and_unknown_fields`, and `test_record_digest_is_order_independent`.

Use these concrete cases:

```python
def test_admission_rejects_null_and_wrong_container_types():
    for payload in (None, [], {"regions": None}, {"regions": {}}):
        with pytest.raises(ValueError):
            autopilot._validate_admission_envelope(payload, MANIFEST)


def test_admission_rejects_non_string_record_fields_and_unknown_fields():
    record = dict(admission_bank()["records"][0])
    record["currency"] = None
    with pytest.raises(ValueError, match="currency"):
        autopilot._validate_admission_envelope(
            {"regions": [{"name": "southeast-asia", "banks": [admission_bank(records=[record])]}]}, MANIFEST
        )

    record = dict(admission_bank()["records"][0])
    record["unexpected"] = "reject me"
    with pytest.raises(ValueError, match="unknown fields"):
        autopilot._validate_admission_envelope(
            {"regions": [{"name": "southeast-asia", "banks": [admission_bank(records=[record])]}]}, MANIFEST
        )


def test_record_digest_is_order_independent():
    records = admission_bank()["records"] + [{
        "currency": "EUR", "correspondent": "Citibank N.A.",
        "int_bic": "CITIUS33XXX", "nostro": "ACCT-91000752",
        "with_an": "ACCT-91000753", "charge_code": "SHA",
        "value_date": "spot", "source": "https://bank.example/eur",
        "as_of": "2026-08-19", "status": "unverified",
    }]
    assert autopilot.record_digest(records) == autopilot.record_digest(list(reversed(records)))
```

- [ ] **Step 2: Run the focused tests and confirm intended failures.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'malformed or non_string or digest_is_order_independent' -q
```

Expected: failures identify coercion, missing type guards, or order-sensitive hashing; no unrelated validator failure is acceptable.

- [ ] **Step 3: Implement the minimal fix.** Type-check every region, bank, list, metadata field, record field, and optional verifier before calling `.strip()`, `.upper()`, `set()`, or `len()`. Preserve normalized record content while sorting only inside `record_digest`.

- [ ] **Step 4: Run admission tests.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'admission or digest' -q
```

Then run `git diff --check`.

## Task 2: Validate new-region metadata and cross-candidate conflicts

**Files:**
- Modify: `scripts/ssi-autopilot/autopilot.py:_validate_admission_envelope` and admission schema constants
- Test: `tests/test_ssi_autopilot.py` admission/new-region section

**Interfaces:**
- Keep candidate input exactly `{"regions": [...]}`; reject unknown top-level fields.
- Validate all new-region metadata before merging it into the prospective manifest.
- Treat canonical BIC prefixes, forbidden BIC prefixes, region names, and masked blocks as global admission keys.

- [ ] **Step 1: Add failing metadata tests.** Cover `label`, `note`, `countries`, `forbidden_bics`, `banks`, `bic8`, `name`, `country`, `currencies`, `seedable`, and `records` with `None`, numbers, mappings where lists are required, and strings where containers are required. Add tests named `test_admission_rejects_cross_candidate_forbidden_bic_conflict`, `test_admission_rejects_duplicate_canonical_candidate_bic`, `test_admission_rejects_new_region_metadata_types`, and `test_admission_new_region_block_must_not_overlap_candidate_region`.

- [ ] **Step 2: Run the new tests and confirm failure.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'metadata or candidate or conflict or overlap' -q
```

- [ ] **Step 3: Implement full envelope validation.** Normalize candidate regions into deep copies, reject malformed forbidden lists/countries/currencies, compare every candidate against both the existing manifest and the other candidates, and only then call `validate_results()`.

- [ ] **Step 4: Add a manifest schema marker only if persisted admission metadata changes.** Add a top-level integer `admission_schema` with an explicit next value, preserve the existing `version`, and do not change `SSI_RECORDS`, bank seed tuples, or existing region content.

- [ ] **Step 5: Run the admission/new-region group.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'admission or region or conflict or overlap' -q
```

## Task 3: Bind admitted results to bank identity and evidence

**Files:**
- Modify: `scripts/ssi-autopilot/autopilot.py:validate_admitted_results`, admission source-policy helpers, `_validate_admission_envelope`
- Test: `tests/test_ssi_autopilot.py` admission/provenance sections
- Docs: `scripts/ssi-autopilot/SKILL.md`

**Interfaces:**
- Add `_canonical_bic8(value: object, path: str) -> str` for manifest/result identity.
- Add `_bank_owned_source(source: str, bank: dict) -> bool`. Seedable admitted banks must carry a normalized bank-owned source-domain allowlist; an Internet Archive URL is accepted only when its archived original host is in that allowlist. Reject placeholder/third-party hosts, `example.com`, `localhost`, IP-only hosts, and archive URLs without an allowed original host.
- `validate_admitted_results(results: dict, manifest: dict) -> list[str]` must compare canonical BIC, exact normalized bank name, admitted digest, and normalized record content.

- [ ] **Step 1: Add failing tests.** Add tests named `test_admitted_results_require_manifest_bank_name`, `test_admission_rejects_placeholder_source`, `test_admission_rejects_third_party_source`, `test_admission_rejects_illustrative_seedable_record`, `test_admission_accepts_bank_owned_source`, and `test_published_verified_by_is_preserved`.

Example identity assertion:

```python
def test_admitted_results_require_manifest_bank_name():
    payload = {"regions": [{"name": "southeast-asia", "banks": [admission_bank()]}]}
    normalized = autopilot._validate_admission_envelope(payload, MANIFEST)
    manifest = json.loads(json.dumps(MANIFEST))
    manifest["regions"][0]["banks"].append(normalized[0]["banks"][-1])
    results = {"region": "southeast-asia", "banks": [{
        "bic": "TESTPHMM", "name": "Wrong Bank Name",
        "records": admission_bank()["records"],
    }]}
    assert any("name" in problem for problem in autopilot.validate_admitted_results(results, manifest))
```

- [ ] **Step 2: Run the focused tests and confirm failure.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'admitted_results or source or illustrative or verified_by' -q
```

- [ ] **Step 3: Implement exact identity matching.** Reject non-string result BIC/name values, canonicalize 8/11-character BICs consistently, require the result name to match the admitted manifest name after documented whitespace normalization, and reject duplicate supplied banks that collapse to one canonical BIC.

- [ ] **Step 4: Implement the evidence policy without duplicating `validate_results()`.** Store normalized source-domain metadata with admitted seedable banks, require each admitted seedable record to pass `_bank_owned_source()`, reject `status == "illustrative"`, and continue delegating URL syntax, account masks, dates, currencies, charges, values, and provenance to `validate_results()`.

- [ ] **Step 5: Run admission/provenance tests.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'admission or admitted_results or source or provenance or illustrative' -q
```

## Task 4: Make fold verification canonical and arity-safe

**Files:**
- Modify: `scripts/ssi-autopilot/autopilot.py:verify_fold`, `_ssi_rows`, and fold helpers
- Test: `tests/test_ssi_autopilot.py` fold section
- Docs: `scripts/ssi-autopilot/SKILL.md`

**Interfaces:**
- Add `_canonical_bic11(value: object, path: str) -> str` for beneficiary and intermediary fold keys.
- Add `_fold_row_shape(row: tuple[str, ...]) -> dict` that validates supported seed tuple arities and returns named fields including `beneficiary_bic`, `currency`, `intermediary_bic`, `verified_by`, `status`, and `bic_only` where present.
- Detect duplicate canonical expected keys while building `expected`; report both colliding records rather than overwriting one.

- [ ] **Step 1: Add failing fold tests.** Cover branch-qualified beneficiary/intermediary BICs, duplicate canonical `(beneficiary, currency, intermediary)` keys, changed `verified_by`, published rows without a verifier, non-published rows carrying a verifier, short rows, unsupported tuple arities, and the accepted 12/14-field variants from the review. Include a row where an omitted optional field would shift provenance indexes.

The arity fixtures must be derived from the actual `SSI_RECORDS` tuple contract in `app/services/seed.py`; encode the final accepted shapes explicitly rather than trusting the current comments or raw indexes.

- [ ] **Step 2: Run fold tests and confirm failure.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'fold or verifier or arity or canonical or collision' -q
```

- [ ] **Step 3: Implement canonical fold parsing.** Parse rows into named fields, reject unsupported arities with controlled messages, compare every persisted field including `verified_by` and `bic_only`, and require published rows to retain their verifier. Preserve the rule that pre-existing rows are history and are not revalidated unless newly added.

- [ ] **Step 4: Run fold/privacy regression tests.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'fold or privacy or placeholder or verifier' -q
```

## Task 5: Make locking, dry-run, atomic writes, summaries, and commit ownership safe

**Files:**
- Modify: `scripts/ssi-autopilot/autopilot.py:_manifest_lock`, `_write_manifest_atomic`, `admit_candidates`, `cmd_admit`, `cmd_commit`
- Test: `tests/test_ssi_autopilot.py` CLI/atomic/concurrency sections

**Interfaces:**
- Keep one lock around read → validate → merge → write. Use a deterministic OS temp/cache lock path derived from the resolved manifest path; never create `regions.json.lock` beside tracked `regions.json`.
- Return deterministic `added_banks`, `added_records`, `unchanged_banks`, and `unchanged_records` counts plus sorted region names. Identical re-admission must produce zero additions and no manifest byte change.
- Define the commit-owned path set as exactly the generated fold paths plus `scripts/ssi-autopilot/regions.json`: `app/services/seed.py`, `tests/test_data_consistency.py`, and `scripts/ssi-autopilot/regions.json` when present. Reject every other staged path before committing.

- [ ] **Step 1: Add failing tests.** Add tests for `cmd_commit` allowing the complete owned set and rejecting unrelated staged paths; dry-run byte identity and no repository lock/temp artifact; addition/no-op summary counts; atomic replacement failure; lock cleanup; and two subprocesses contending on one temporary manifest.

- [ ] **Step 2: Run CLI/lock tests and confirm failure.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'commit or dry_run or summary or atomic or lock or contention or concurrent' -q
```

- [ ] **Step 3: Move the lock outside the repository.** Use a stable OS temp/cache path, open it with `r+`/`w+`, acquire `fcntl.LOCK_EX`, hold it through the full critical section, and release it in `finally`. Do not unlink a shared lock inode while another process may be waiting; the tracked-directory cleanup assertion must remain true.

- [ ] **Step 4: Preserve atomic-writer guarantees.** Keep `mkstemp`, flush, `os.fsync`, mode preservation, `os.replace`, directory `fsync`, and `finally` cleanup. Test successful replacement and injected `OSError` without altering the original manifest.

- [ ] **Step 5: Compute before/after summaries.** Count a bank as added only when its canonical BIC was absent; count newly admitted records only; count identical existing banks/records as unchanged. Print fields in a fixed order and make dry-run output explicit about not writing.

- [ ] **Step 6: Make `cmd_commit` own the full fold.** Include `regions.json` in the staged-path allowlist, use `git add` plus `git commit --only` with exact owned paths, and keep unrelated-index rejection before any commit side effect.

- [ ] **Step 7: Re-run CLI/lock tests.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'commit or dry_run or summary or atomic or lock or contention or concurrent' -q
```

## Task 6: Cover successful new-region persistence and document the operator workflow

**Files:**
- Modify: `scripts/ssi-autopilot/autopilot.py` only where persistence/reload behavior needs correction
- Modify: `tests/test_ssi_autopilot.py`
- Modify: `scripts/ssi-autopilot/SKILL.md`

- [ ] **Step 1: Add a valid new-region lifecycle test.** Use a unique region name, valid country metadata, a non-overlapping masked block, one seedable bank, and a bank-owned source. Admit it into a temporary manifest, assert the addition summary, reload with `load_manifest()`, validate the admitted result, and assert stable ordering, canonical BIC ownership, and the persisted digest.

- [ ] **Step 2: Add idempotency and omission tests.** Re-admit the exact candidate and assert zero additions plus byte-identical JSON. Re-admit a payload omitting an existing bank and assert that existing banks remain; omission is not a removal operation.

- [ ] **Step 3: Update `SKILL.md`.** Document candidate type/unknown-field rejection, the manifest schema marker, bank-owned source/archive evidence, canonical BIC identity, order-independent digest key, seed tuple arities and published `verified_by`, lock location and atomic writes, `added_*` versus `unchanged_*` summaries, commit-owned paths including `regions.json`, dry-run/idempotent behavior, and the no-commit/no-PR constraint for this work.

- [ ] **Step 4: Run lifecycle tests.**

```sh
python -m pytest tests/test_ssi_autopilot.py -k 'new_region or lifecycle or idempotent or omission' -q
```

## Task 7: Full verification and handoff without commit

- [ ] **Step 1: Run the focused autopilot suite.**

```sh
/Users/olaniyi.oladokun/Leatherback/swift-routing/.venv/bin/python -m pytest tests/test_ssi_autopilot.py -q
```

Expected: all autopilot tests pass, including subprocess lock tests; only the existing warning set is permitted.

- [ ] **Step 2: Run the SSI regression suite.**

```sh
/Users/olaniyi.oladokun/Leatherback/swift-routing/.venv/bin/python -m pytest tests/test_ssi_autopilot.py tests/test_ssi.py tests/test_data_consistency.py tests/test_ssi_importer.py -q
```

Expected: no seed-data, provenance, importer, or data-consistency regression.

- [ ] **Step 3: Run syntax, manifest, and whitespace checks.**

```sh
/Users/olaniyi.oladokun/Leatherback/swift-routing/.venv/bin/python -m py_compile scripts/ssi-autopilot/autopilot.py
python scripts/ssi-autopilot/autopilot.py verify
```

Then run `git diff --check`.

- [ ] **Step 4: Exercise the real CLI in a temporary copy.** Run one `admit --dry-run` and one successful temporary-manifest admission, reload and validate the manifest, and confirm the tracked directory contains no `regions.json.lock`, `.regions.json.*`, or other generated lock/temp artifact.

- [ ] **Step 5: Confirm no commit or PR was created.** Run these commands separately:

```sh
git status --short
git log -1 --oneline
gh pr list --head "$(git branch --show-current)" --state all --limit 1
```

Expected: only intended working-tree edits and this plan are present; no implementation commit was made and no PR was opened or updated. Report pre-existing dirty files, evidence-policy limitations, and platform limitations separately.

## Acceptance Checklist

- [ ] Null, wrong-container, wrong-field-type, and unknown-field admissions fail with controlled errors.
- [ ] Record digests are independent of input order and preserve normalized content.
- [ ] Bank BIC/name identity is enforced for admitted results.
- [ ] Placeholder, third-party, non-bank-owned, and illustrative seedable evidence is rejected.
- [ ] Canonical BIC collisions and duplicate fold keys are rejected rather than overwritten.
- [ ] Published `verified_by` survives admission and fold verification.
- [ ] Supported 12/14-field fold variants are parsed by named fields; unsupported arities fail safely.
- [ ] `regions.json` is included in commit ownership checks.
- [ ] Dry-run and failure paths leave no tracked lock/temp artifacts.
- [ ] Concurrent admissions serialize and preserve both updates.
- [ ] Addition and idempotent no-op summary counts are deterministic.
- [ ] New-region admission persists, reloads, validates, and respects block/forbidden-BIC ownership.
- [ ] Full verification passes without a commit or PR.
