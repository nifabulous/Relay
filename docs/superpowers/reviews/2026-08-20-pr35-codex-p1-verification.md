# Verification Response — PR #35 Codex P1 (BLOCK)

- **Date:** 2026-08-20
- **PR:** [#35 — feat(ssi): 8 region settlement data wave](https://github.com/nifabulous/Relay/pull/35)
- **Head SHA verified:** `3ffce4e43fa03d3c7ad2548f2c83c383b76020c0`
- **Review under response:** Codex read-only review, marker `codex-pr-review:35:3ffce4e4…` — verdict **BLOCK**, one **P1**
- **Verdict of this response:** **P1 not reproducible.** Every specific claim it makes is contradicted by the code at the SHA the review itself names. **No production logic and no test assertion changed in response** — the only code edit is an explanatory docstring on the `_approve_ssi_rows` test helper (see *Change made* below).

This document exists so that the next reviewer — human or automated — can see the
check that was run rather than repeat it.

## The P1 as filed

> **P1 — Routing tests use redaction placeholders as routable accounts**
>
> The changed tests nevertheless:
> - assert that placeholder values such as `"[ACCOUNT]"` and `"[IBAN]"` are usable;
> - make `_approve_ssi_rows()` assign `"[ACCOUNT]"` as the intermediary account before asserting that the rows are routable.
>
> **Impact:** The PR's claimed green `pytest` result is not reproducible from the supplied diff.

## Claim-by-claim verification

### Claim 1 — tests assert `[ACCOUNT]` and `[IBAN]` are usable

Contradicted. `tests/test_routing.py:54-59` asserts the exact opposite:

```python
@pytest.mark.parametrize(
    "value",
    ["[ACCOUNT]", "ACCOUNT", "ACCT-1234", "MASKED-1234", "XXXX1234", "1234****"],
)
def test_masked_ssi_accounts_are_not_usable(value):
    assert not _is_usable_ssi_account(value)
```

`[ACCOUNT]` is asserted **not** usable, which is the invariant the review asks for.

`[IBAN]` does not occur anywhere in `tests/test_routing.py`. Repo-wide, the only
occurrences are in `app/tutor/redaction.py`, `app/data/tutor_knowledge.py`, and the
tutor tests — a module PR #35 does not touch. The claim appears to merge the tutor
redaction vocabulary into the routing tests.

### Claim 2 — `_approve_ssi_rows()` assigns `[ACCOUNT]` as the intermediary account

Contradicted. `tests/test_routing.py:48-49`:

```python
row.intermediary_account = "021000089"
row.beneficiary_account = "NG1234567890"
```

Both are synthetic concrete identifiers. Neither is a redaction token.

### Claim 3 — `test_concrete_ssi_accounts_are_usable` uses redaction placeholders

Contradicted. `tests/test_routing.py:62-64`:

```python
@pytest.mark.parametrize("value", ["123456789", "GB29NWBK60161331926819"])
def test_concrete_ssi_accounts_are_usable(value):
    assert _is_usable_ssi_account(value)
```

These are exactly the "non-sensitive synthetic alphanumeric identifiers" the review's
own focused fix prescribes. The prescribed companion assertion — "add a separate
assertion that redaction tokens are rejected" — is already present as
`test_masked_ssi_accounts_are_not_usable` (Claim 1).

### Claim 4 — the tests cannot reach the routable path and will fail while indexing

Contradicted, and the tests are not vacuous. They fail loudly rather than silently
passing on an empty result set:

- `TestSuggestFromSSI::test_published_correspondents_carry_settlement_ids` indexes
  `by_bic["CITIUS33XXX"]` and `by_bic["BKTRUS33XXX"]` — a `KeyError` if no suggestion
  is produced.
- `TestSuggestFromSSI::test_ssi_lookup_matches_8char_prefix` asserts `len(suggestions) >= 3`.
- `TestSuggestRoute::test_verified_ssi_wins_over_corridor` asserts `basis == "published-ssi"`
  and `"BKTRUS33XXX" in bics`.

If `_approve_ssi_rows()` produced non-routable rows, all three would fail. They pass.

### Change made

One edit, in `tests/test_routing.py`: the `_approve_ssi_rows` docstring now states
that its account values are concrete synthetic identifiers rather than redaction
tokens, and points at `test_masked_ssi_accounts_are_not_usable` for the rejection
side. No assertion, fixture value, or production line was altered. The intent is
that the next reader of this helper does not have to reconstruct the invariant.

### Production logic was not weakened

`app/services/routing.py:146-178` (`_is_usable_ssi_account`) is unchanged by this
response. The rejection the review asks to keep — brackets, masking markers,
`ACCT`/`ACCOUNT`/`PLACEHOLDER`/`MASK`/`REDACT` substrings, `XX` runs, non-alphanumeric
shapes, and any value without a digit — remains in force, and `_is_routable_ssi`
(`app/services/routing.py:181-199`) still gates on both account fields.

## Evidence

Run from the repository root at `3ffce4e`, Python 3.12:

| Command | Result |
|---|---|
| `python -m pytest tests/test_routing.py -q` | `85 passed in 2.82s` |
| `python -m pytest tests/tutor/ -q` | `565 passed in 2.63s` |
| `python -m pytest tests/ -q` (base install, `.[dev]` only — what CI installs) | **`1702 passed in 117.01s`** |
| `python -m pytest tests/ -q` (developer venv with the optional `.[ai]` extra) | `2 failed, 1700 passed in 111.41s` — see below |
| `gh pr checks 35` | 10 checks pass, 1 skipped (`tutor-live-eval`, by design) |

CI on the exact head SHA is green, including `test (3.10)`, `test (3.11)`,
`test (3.12)`, `quality-gate`, `tutor-provider-contract`, `tutor-release-contract`,
and `frontend`. The review's stated impact — "the PR's claimed green `pytest` result
is not reproducible" — does not hold for the reason given.

## The two local failures, and why they are not this PR

A full local run **in a venv that has the optional `.[ai]` extra installed** shows
two failures. The same suite, same commit, in a clean `.[dev]`-only virtualenv —
the install CI performs — is **`1702 passed`**. The two failures are therefore an
artifact of the local environment, not of the code:

```
FAILED tests/tutor/test_config.py::test_importing_configuration_does_not_import_a_provider_sdk
FAILED tests/tutor/test_engine.py::test_importing_the_engine_does_not_import_a_provider_sdk
```

Both assert `"pydantic_ai" not in sys.modules`. Root cause, traced with a
`sys.meta_path` import trap:

```
sentry_sdk/integrations/pydantic_ai/__init__.py, line 7, in <module>
```

`sentry_sdk.init()` — called by `tests/test_observability.py::test_formatted_log_event_has_no_logging_payload_after_scrubbing`
— auto-enables sentry-sdk 2.68.0's `pydantic_ai` integration, which imports the real
`pydantic_ai` at module scope and leaves it in `sys.modules` for the rest of the
session. Every later canary in that process then sees it.

This is not attributable to PR #35:

- `tests/test_observability.py` is byte-identical to `origin/main`
  (`git diff origin/main...HEAD -- tests/test_observability.py` is empty).
- PR #35 changes no file under `app/tutor/` or `tests/tutor/`.
- Each of the eight test files PR #35 does touch was run followed by the canary;
  none of them pollute `sys.modules`.
- `pydantic-ai` is declared only in the optional `[ai]` extra in `pyproject.toml`.
  CI installs `.[dev]`, so the sentry integration cannot load there. Confirmed
  directly: a fresh `.[dev]`-only virtualenv at this same commit runs the full
  suite to `1702 passed`, and `import pydantic_ai` in it raises
  `ModuleNotFoundError`.

The canary is nonetheless weaker than intended: a process-global `sys.modules` check
cannot distinguish "`app/` eagerly imported a provider SDK" — the invariant CLAUDE.md
actually cares about — from "an unrelated third-party library imported it". Tracked
as separate follow-up work; deliberately **not** folded into this PR.

## Probable cause of the false positive

PR #35 contains `8a8d2a9 ci: raise Codex review input budget`, and the review
describes itself as working from "bounded artifacts". Fabricated file contents are
consistent with the reviewer reasoning over truncated input rather than the diff.
The budget increase in this PR did not eliminate the failure mode. This is a
hypothesis about the tooling, not a verified root cause.

## Review items that remain open

Nothing below is disputed by this document. These are human-verification items from
the same review, and they stay open:

- Execute the Alembic upgrade and downgrade paths against a supported PostgreSQL
  version and confirm the Boolean defaults, CHECK constraints, and trigger behavior.
- Exercise the SQLite compatibility rebuild against a representative copy of a
  deployed database, including operator-owned constraints and indexes.
- Have the payment-data owner approve the informational BIC-only versus executable
  settlement-instruction split, the seeded sources, and each routing classification.
- Verify the seed reconciliation and retirement policy against a production-like
  database, especially operator-corrected rows and legacy rows without fingerprints.
- Separately approve the `.github/workflows/codex-pr-review.yml` input-limit change,
  including model-cost and timeout implications.

No merge or deployment decision should rest on this document alone.
