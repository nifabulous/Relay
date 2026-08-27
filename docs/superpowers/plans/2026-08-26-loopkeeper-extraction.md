# Loopkeeper Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Loopkeeper as a standalone, dependency-free Python package with a pinned GitHub Actions adapter and reusable workflows so a new project can adopt the review loop without copying Relay's security-sensitive implementation.

**Architecture:** The implementation target is a new repository initialized from Relay's verified `e834773` source snapshot. The canonical `src/loopkeeper` package owns schemas, the pure arbiter, transport, sanitization, manifests, artifacts, and the CLI; `adapters/github` retains Bash orchestration and GitHub I/O. Consumer repositories keep small caller workflows that invoke pinned `workflow_call` entrypoints, while the generic CLI uses explicit `caller-attested` manifests.

**Tech Stack:** Python 3.10–3.12 standard library at runtime; `urllib.request`, `json`, `dataclasses`, `typing`, and `hashlib`; Bash with `gh`, `git`, `jq`, and `python3` for the GitHub adapter; GitHub Actions reusable workflows; `pytest`, `ruff`, and shell harnesses for development and verification.

**Delivery shape:** This is one product with two release gates. Phase 1 (Tasks 1–8 plus the package portion of Task 12) ships the provider-neutral package, signed caller-attestation verifier, CLI, artifacts, and headless agents without GitHub credentials or provider writes. Phase 2 (Tasks 9–13 plus the workflow portion of Task 12) adds the GitHub adapter, reusable workflows, Relay compatibility, and real-PR dogfood. Phase 2 starts from a tagged Phase 1 package and cannot enable writes until its workflow and dogfood gates pass.

## Global Constraints

- The implementation target is a separate Loopkeeper repository; this Relay checkout stores the design and plan only until a separate extraction repository is created.
- Repository creation is an explicit preflight, not an implicit side effect: confirm the final remote owner/name and sibling path, require the destination to be absent or empty, record the remote URL in the new repository, and abort rather than initializing over an existing checkout.
- Runtime dependencies remain zero on Python 3.10–3.12.
- New public settings use `LOOPKEEPER_*`; `CODEX_*`, `ARBITER_*`, `RELAY_AGENT_*`, `OPENAI_API_KEY`, and `codex-*` markers exist only in the Relay compatibility adapter.
- Public markers are exact and adapter-owned: reviewer comments use `loopkeeper-pr-review:{pr}:{head_sha}`, evidence state uses `loopkeeper-evidence:{fallback|ci}`, arbiter comments use `loopkeeper-arbiter:{pr}`, and triage comments use `loopkeeper-issue-triage:{issue}`; the model cannot author or mutate these markers.
- The Bash worker remains the GitHub orchestration path; it is ported and pared into an adapter, not rewritten from memory in Python.
- Trusted policy, contracts, roles, verification records, and context files never come from PR-controlled paths.
- PR/issue/task material is sanitized, delimiter-defanged, wrapped as untrusted input, and bounded before a model call.
- `github-forge-verified` is GitHub-only; generic manifests require `caller-attested` plus a verified `trust.verification` record, or exit `4`.
- Caller attestation uses verification schema `1`, canonical manifest SHA-256, an HMAC-SHA256 signature, and a key selected by `key_id` from protected `LOOPKEEPER_TRUST_KEY_FILE`; signature comparison is constant-time.
- Every open PR head handled by the configured GitHub integration receives at least one review result, including a conflicting head with no CI run; a later exact-head CI result replaces a fallback in place.
- GitHub writes are advisory, operator-gated, idempotent, and gap-issue creation is separately opt-in with a verified existing `LOOPKEEPER_GAP_LABEL`.
- The coverage invariant counts a bounded review artifact/result even when posting is disabled; enabling `LOOPKEEPER_OPERATOR=1` adds the corresponding comment write but is never required for the review computation itself.
- The pure arbiter performs no I/O or model calls and fails closed for malformed or ambiguous history.
- Production workflow and action references use full commit SHAs; PyPI consumers install an exact version with a published hash or trusted provenance record.
- The unrelated Relay edits and untracked files present when this plan is authored are preserved and are not part of Loopkeeper implementation commits.

## Phase gates and execution flow

```text
Phase 1: trusted package
  schemas -> pure arbiter -> redaction -> transport -> attested manifests
       -> CLI/artifacts -> headless agents -> package build/install gate
                                      |
                                      v
                         immutable Phase 1 release tag
                                      |
Phase 2: GitHub integration
  trust-root resolver + workflow identity -> two checkouts
       -> bounded collection -> model call -> serialized writer
       -> reusable callers -> Relay compatibility -> read-only dogfood
                                      |
                                      v
                         operator-approved write enablement
```

Phase 1 is complete only when a clean Python 3.10–3.12 environment can install the exact package, verify a valid HMAC manifest, reject every invalid attestation before a model call, and produce bounded artifacts with no provider credentials. Phase 2 is complete only when the trust-root, workflow-name/file, fallback-coverage, replacement, operator-gate, and no-unintended-write tests pass; Stage A has recorded read-only real-PR evidence; and Stage B has recorded write-path evidence from a disposable consumer under explicit human approval.

## Performance budgets

| Surface | Bound | Failure behavior |
|---|---:|---|
| Manifest/trusted/untrusted file read | declared byte cap | reject before parsing |
| Model input/output | manifest and transport ceilings | return config/transport error; never retry a completed request |
| Check-run collection | item, raw-byte, page, and retained-byte caps | emit explicit unavailable evidence and continue review |
| Context allowlist | file count and rendered-byte cap | omit excess reference material and record truncation |
| Comment history | bounded pagination and bounded body bytes | fail closed to a human-needed result |
| Workflow identity lookup | bounded pages and response bytes | use fallback review, never defer coverage |

Every cap is enforced at the stream boundary before materializing untrusted
content. Tests assert both the returned status and the maximum retained item
count; a cap is not considered implemented merely because the final artifact is
truncated.

---

## Source and destination map

All paths below are relative to the new Loopkeeper repository root. The ledger is created before porting and records source path, the `e834773` line count, destination, retained behavior, and parity-test owner. The source snapshot contains a consumer `.github/workflows/ci.yml` in addition to these 30 extraction-scope files; it is intentionally not ported. It is used only as a fixture for workflow-name/file resolution and trigger sequencing.

| Relay source at `e834773` | Lines | Destination | Responsibility after extraction |
|---|---:|---|---|
| `scripts/codex_arbiter.py` | 1446 | `src/loopkeeper/arbiter.py`; `adapters/github/arbiter_io.py` | Pure decisions in the package; GitHub collection/posting in the adapter |
| `scripts/codex_review_pr.sh` | 734 | `adapters/github/review_pr.sh` | GitHub event selection, trusted reads, collection, model invocation, and reviewer comment upsert |
| `scripts/codex_responses.py` | 488 | `src/loopkeeper/transport.py` | Responses/Chat HTTP transport and budget enforcement |
| `scripts/codex_sanitize.py` | 244 | `src/loopkeeper/redaction.py`; `adapters/relay/redactor.py` | Generic redaction core and Relay-specific compatibility hook |
| `scripts/agent_runner.py` | 233 | `src/loopkeeper/agent.py` | Trusted definition loading and headless agent execution |
| `scripts/codex_triage_issue.sh` | 154 | `adapters/github/triage_issue.sh` | GitHub issue selection, sanitization, model call, and triage comment upsert |
| `scripts/codex_untrusted.py` | 61 | `src/loopkeeper/untrusted.py` | Delimiter defanging and labelled untrusted blocks |
| `scripts/codex_truncate.py` | 60 | `src/loopkeeper/truncate.py` | UTF-8-safe byte ceilings |
| `tests/test_codex_arbiter.py` | 2272 | `tests/unit/test_arbiter.py` | Full pure-rule and lifecycle coverage |
| `tests/test_codex_automation.sh` | 2073 | `tests/github/test_automation.sh` | Stubbed `gh`/`git` integration and mutation guards |
| `tests/test_codex_responses.py` | 650 | `tests/unit/test_transport.py` | Wire shapes, limits, timeouts, and endpoint validation |
| `tests/test_codex_sanitize.py` | 319 | `tests/unit/test_redaction.py` | Secret, identifier, plugin, and placeholder corpus |
| `tests/test_model_pinning.py` | 253 | `tests/unit/test_model_binding.py` | Settings-based model binding and unsupported model-shape rejection |
| `tests/test_agent_runner.py` | 236 | `tests/unit/test_agent.py` | Definition parsing, model precedence, channel separation, and refusal |
| `tests/test_arbiter_roundtrip.py` | 96 | `tests/unit/test_roundtrip.py` | Collector-to-core history round trip |
| `tests/test_codex_untrusted.py` | 74 | `tests/unit/test_untrusted.py` | Delimiter and label safety |
| `tests/test_codex_truncate.py` | 63 | `tests/unit/test_truncate.py` | Multibyte truncation and marker bounds |
| `tests/fixtures/arbiter/live_reviewer_capture.md` | 20 | `tests/fixtures/relay-e834773/live_reviewer_capture.md` | Frozen live reviewer capture |
| `tests/fixtures/arbiter/pr21_history.json` | 125 | `tests/fixtures/relay-e834773/pr21_history.json` | Frozen Schema-1 history |
| `tests/fixtures/arbiter/pr22_history.json` | 79 | `tests/fixtures/relay-e834773/pr22_history.json` | Frozen Schema-1 history |
| `tests/fixtures/arbiter/pr24_history.json` | 105 | `tests/fixtures/relay-e834773/pr24_history.json` | Frozen Schema-1 history |
| `.github/workflows/codex-pr-review.yml` | 270 | `.github/workflows/pr-review.yml` | Pinned reusable PR-review entrypoint; no direct consumer triggers |
| `.github/workflows/codex-issue-triage.yml` | 126 | `.github/workflows/issue-triage.yml` | Pinned reusable issue-triage entrypoint; no direct consumer triggers |
| `docs/loop/schemas.md` | 129 | `docs/schemas.md`; `src/loopkeeper/resources/schemas/*.schema.json` | Normative Schema-1/Schema-2 and invalid-round contract |
| `.github/codex/review-policy.md` | 114 | `examples/relay/review-policy.md` | Relay fixture policy, never the package default policy |
| `docs/CODEX_GITHUB_AUTOMATION.md` | 104 | `docs/github-adapter.md` | GitHub adapter operations, trust, permissions, and writes |
| `docs/contracts/README.md` | 94 | `docs/contracts/README.md` | Contract derivation and trusted-default-branch rules |
| `docs/loop/model-binding.md` | 72 | `docs/model-binding.md` | Public model/environment binding contract |
| `.github/codex/context-files.txt` | 2 | `examples/relay/context-files.txt` | Relay fixture context allowlist |
| `docs/contracts/feat-loop-arbiter-564bdc00f842.md` | 105 | `examples/relay/contracts/feat-loop-arbiter-564bdc00f842.md` | Frozen contract-format fixture |

These 30 rows sum to 10,801 source lines at `e834773`. The ledger test compares the checked-out source list and line counts against this table before any extraction commit.

The source ledger also records that the Relay consumer's `.github/workflows/ci.yml` remains outside the extraction. Its `name: CI` and path `ci.yml` become the test case proving that GitHub trigger names are resolved to workflow IDs before the discovery probe queries a file/path. When a row has multiple destinations, the Markdown cell uses a semicolon-separated list and the ledger parser validates each path independently.

## Task 1: Bootstrap the standalone repository and ledger

**Files:**
- Create: `loopkeeper/pyproject.toml`
- Create: `loopkeeper/src/loopkeeper/__init__.py`
- Create: `loopkeeper/src/loopkeeper/__main__.py`
- Create: `loopkeeper/src/loopkeeper/resources/__init__.py`
- Create: `loopkeeper/LICENSE`
- Create: `loopkeeper/NOTICE`
- Create: `loopkeeper/.gitignore`
- Create: `loopkeeper/README.md`
- Create: `loopkeeper/docs/source-ledger.md`
- Create: `loopkeeper/docs/contracts/README.md`
- Create: `loopkeeper/.extraction-source`
- Test: `loopkeeper/tests/test_package.py`
- Test: `loopkeeper/tests/test_source_ledger.py`

**Interfaces:**
- Produces `loopkeeper.__version__` and `python -m loopkeeper --version`.
- Produces a `src/`-layout package with no `project.dependencies` entries.
- Produces the 30-row source ledger above and a recorded exclusion for consumer `ci.yml`.

- [ ] **Step 1: Write the failing package smoke test.**

```python
# loopkeeper/tests/test_package.py
import subprocess
import sys


def test_package_import_and_version_without_runtime_dependencies():
    result = subprocess.run(
        [sys.executable, "-c", "import loopkeeper; print(loopkeeper.__version__)"],
        check=True,
        capture_output=True,
        text=True,
    )
    assert result.stdout.strip() == "0.1.0"


def test_module_entrypoint_prints_version():
    result = subprocess.run(
        [sys.executable, "-m", "loopkeeper", "--version"],
        check=True,
        capture_output=True,
        text=True,
    )
    assert result.stdout.strip() == "loopkeeper 0.1.0"
```

Add a ledger test that parses the Markdown table, asserts exactly 30 source rows, asserts the line-count total is `10801`, asserts every row has a non-empty destination and parity owner, and asserts `.github/workflows/ci.yml` appears only in the explicit exclusion note. The final parity gate adds the destination-existence check after all tasks land. This prevents the consumer CI workflow from being silently bundled into the reusable project or a ledger row from becoming documentation-only scope.

- [ ] **Step 2: Run the focused test to verify the bootstrap is absent.**

Run from the new repository root: `python3.12 -m pytest tests/test_package.py tests/test_source_ledger.py -q`

Expected: FAIL because `loopkeeper` is not importable.

- [ ] **Step 3: Create the package metadata and entrypoint.**

```toml
# loopkeeper/pyproject.toml
[project]
name = "loopkeeper"
dynamic = ["version"]
description = "Bounded, trust-separated model-call loops with a deterministic arbiter"
requires-python = ">=3.10,<3.13"
dependencies = []

[project.optional-dependencies]
dev = [
  "pytest>=8,<9",
  "ruff>=0.6,<1",
  "build>=1.2,<2",
  "tomli>=2,<3; python_version < '3.11'",
]

[project.scripts]
loopkeeper = "loopkeeper.cli:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.setuptools.package-data]
loopkeeper = [
  "resources/schemas/*.json",
  "resources/manifests/*.json",
  "resources/agents/*.md",
]

[tool.setuptools.dynamic]
version = {attr = "loopkeeper.__version__"}

[tool.pytest.ini_options]
testpaths = ["tests"]
```

```python
# loopkeeper/src/loopkeeper/__init__.py
__version__ = "0.1.0"
```

```python
# loopkeeper/src/loopkeeper/__main__.py
import sys

from . import __version__


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv == ["--version"]:
        print(f"loopkeeper {__version__}")
        return 0
    from .cli import main as cli_main

    return cli_main(argv)


if __name__ == "__main__":
    raise SystemExit(main())
```

Create the standalone checkout before copying source:

```bash
if [[ -e ../loopkeeper ]] && [[ -n "$(find ../loopkeeper -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "../loopkeeper exists and is not empty; choose an explicit destination before continuing." >&2
  exit 2
fi
mkdir -p ../loopkeeper
if [[ -d ../loopkeeper/.git ]]; then
  echo "../loopkeeper is already a Git repository; do not reinitialize it." >&2
  exit 2
fi
git init --initial-branch=main ../loopkeeper
mkdir -p ../loopkeeper/src/loopkeeper ../loopkeeper/tests ../loopkeeper/docs
printf '%s\n' "source_repository=Relay" "source_commit=e834773" > ../loopkeeper/.extraction-source
# After the owner confirms the destination repository, add its remote explicitly:
# (do not invent or silently create a GitHub repository in this task).
# git -C ../loopkeeper remote add origin "$CONFIRMED_LOOPKEEPER_REMOTE_URL"
```

Capture `SOURCE_REPO="$(git rev-parse --show-toplevel)"` before changing directories. Populate `docs/source-ledger.md` from the table above and copy only the 30 listed paths from the Relay object database with `git -C "$SOURCE_REPO" show "e834773:$SOURCE_PATH"` into their frozen fixture or port destination; a fresh Loopkeeper repository does not contain the Relay commit and must never be treated as the source of truth. Do not copy the Relay application tree or the excluded consumer `ci.yml`. Copy the license and attribution notice required by the source repository, add `src`, `.venv`, build outputs, and test caches to `.gitignore`, and make `README.md` state that this repository is the Loopkeeper extraction rather than an AI PR-review product.

- [ ] **Step 4: Install and rerun the smoke test.**

Run: `python3.12 -m pip install -e '.[dev]' && python3.12 -m pytest tests/test_package.py tests/test_source_ledger.py -q`

Expected: `3 passed` and no runtime dependency installation beyond the editable package itself.

- [ ] **Step 5: Commit the bootstrap.**

```bash
git add pyproject.toml src/loopkeeper/__init__.py src/loopkeeper/__main__.py LICENSE NOTICE .gitignore README.md .extraction-source docs/source-ledger.md docs/contracts/README.md tests/test_package.py tests/test_source_ledger.py
git commit -m "chore: bootstrap Loopkeeper package"
```

## Task 2: Define the normative schemas and typed data model

**Files:**
- Create: `loopkeeper/src/loopkeeper/types.py`
- Create: `loopkeeper/src/loopkeeper/schema.py`
- Create: `loopkeeper/src/loopkeeper/errors.py`
- Create: `loopkeeper/src/loopkeeper/resources/schemas/reviewer-trailer.schema.json`
- Create: `loopkeeper/src/loopkeeper/resources/schemas/history.schema.json`
- Create: `loopkeeper/docs/schemas.md`
- Test: `loopkeeper/tests/unit/test_schema.py`

**Interfaces:**
- `parse_trailer(text: str, accepted_markers: tuple[str, ...] = ("loopkeeper-verdict", "codex-verdict")) -> TrailerValidation`.
- `render_trailer(trailer: Trailer) -> str`, which emits only `loopkeeper-verdict`.
- `parse_history(value: object) -> History` and `render_history(history: History) -> dict[str, object]`.
- `TrustedReader = Protocol` with `read_text(path: str, max_bytes: int) -> str`; this small dependency-neutral seam is defined with the shared types and reused by contract, policy, manifest, and agent loaders.
- `HistoryRound(kind: Literal["valid", "invalid"], comment: Comment | None, validation: TrailerValidation | None)`; invalid rounds contain no findings and count toward hard-cap accounting.
- `SchemaError` for unknown versions, malformed fields, duplicate trailers, invalid identity, and invalid lifecycle transitions.

- [ ] **Step 1: Write failing schema tests.**

```python
def test_new_output_uses_loopkeeper_marker_and_legacy_input_is_accepted():
    source = '<!-- codex-verdict: {"schema":2,"verdict":"CLEAN","findings":[]} -->'
    parsed = parse_trailer(source)
    assert parsed.valid is True
    assert parsed.trailer.verdict == "CLEAN"
    assert render_trailer(parsed.trailer).startswith("<!-- loopkeeper-verdict:")


def test_invalid_trailer_is_retained_as_an_invalid_round():
    parsed = parse_trailer("model text without a trailer")
    assert parsed.valid is False
    assert parsed.error_code == "MALFORMED-TRAILER"
    history = parse_history({
        "schema": 1,
        "repo": "example/project",
        "pr": 24,
        "current_head_sha": "0" * 40,
        "current_diff_files": [],
        "rounds": [{"kind": "invalid", "validation": parsed.to_dict()}],
    })
    assert history.rounds[0].kind == "invalid"


def test_unknown_schema_is_rejected_without_guessing():
    with pytest.raises(SchemaError, match="unsupported schema"):
        parse_history({"schema": 99})
```

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run: `python3.12 -m pytest tests/unit/test_schema.py -q`

Expected: FAIL because the typed schema functions do not exist.

- [ ] **Step 3: Implement typed models and JSON Schema.**

Use frozen dataclasses and explicit validators. Normalize trailer `P0` to the internal `P1` tier at parse time, require `RESOLVED` evidence, reject repeated `RESOLVED` findings in later rounds, bound diagnostic text, and accept zero or one trailer per comment only. Canonical history sorts valid and invalid rounds by `(created_at, comment_id)` and requires repository, PR, head SHA, and sanitized changed-file fields.

```python
@dataclass(frozen=True)
class TrailerValidation:
    valid: bool
    trailer: Trailer | None
    error_code: str | None
    diagnostic: str

    def to_dict(self) -> dict[str, object]:
        return {
            "valid": self.valid,
            "schema": self.trailer.schema if self.trailer else None,
            "error_code": self.error_code,
            "diagnostic": self.diagnostic[:512],
        }
```

Document that the marker is not a trust signal, that `codex-verdict` is input-only compatibility, and that `docs/schemas.md` is the tiebreaker for prompts and validators. Keep JSON Schemas machine-checkable with `additionalProperties: false` on trusted control-plane records.

- [ ] **Step 4: Run schema and JSON-Schema validation.**

Run: `python3.12 -m pytest tests/unit/test_schema.py -q`

Expected: all schema tests pass, including invalid-round retention and legacy marker parsing.

- [ ] **Step 5: Commit the schema contract.**

```bash
git add src/loopkeeper/types.py src/loopkeeper/schema.py src/loopkeeper/errors.py src/loopkeeper/resources/schemas docs/schemas.md tests/unit/test_schema.py
git commit -m "feat: define Loopkeeper history and trailer schemas"
```

## Task 3: Extract the pure deterministic arbiter

**Files:**
- Create: `loopkeeper/src/loopkeeper/arbiter.py`
- Create: `loopkeeper/src/loopkeeper/contract.py`
- Create: `loopkeeper/tests/unit/test_arbiter.py`
- Create: `loopkeeper/tests/unit/test_contract.py`
- Create: `loopkeeper/tests/unit/test_roundtrip.py`
- Create: `loopkeeper/tests/fixtures/relay-e834773/live_reviewer_capture.md`
- Copy: `loopkeeper/tests/fixtures/relay-e834773/*.json`

**Interfaces:**
- `ArbiterConfig(soft_gate: int = 5, hard_cap: int = 10, stuck_p1_rounds: int = 3, unverifiable_rounds: int = 2)`.
- `Decision(recommendation, loop_action, cited_rule, needs_human, round_count, proposed_gaps, detail)`.
- `decide(history: History, config: ArbiterConfig) -> Decision`; it performs no environment reads, filesystem reads, subprocesses, network calls, or model calls.
- `build_history(comments: Sequence[Comment], current_head_sha: str, current_diff_files: Sequence[str]) -> History` lives in the adapter-facing collector module, not in the pure arbiter.
- `contract_relative_path(branch: str) -> PurePosixPath` applies the exact slug-plus-SHA-12 convention from `docs/contracts/README.md`.
- `parse_contract(text: str, expected_branch: str) -> Contract` requires the first non-empty line to be `# Contract: branch_name` with the actual expected branch substituted; `load_contract_or_empty(reader, branch)` returns an empty contract for an absent file or a mismatched header.

- [ ] **Step 1: Port parity tests before changing behavior.**

Copy the complete rule fixtures from `tests/test_codex_arbiter.py` into `tests/unit/test_arbiter.py`, change imports to `loopkeeper.arbiter`, and keep the expected vocabulary exactly: `MERGE-CLEAN`, `MERGE-WITH-GAPS`, `ESCALATE-TO-SCOPING`, `CONTINUE`, and `NEEDS-HUMAN`.

- [ ] **Step 2: Run the parity tests to verify the new core is absent.**

Run: `python3.12 -m pytest tests/unit/test_arbiter.py tests/unit/test_contract.py tests/unit/test_roundtrip.py -q`

Expected: FAIL at import time because `loopkeeper.arbiter` has not been implemented.

- [ ] **Step 3: Extract only pure decision logic.**

Port the normalization, identity, accounting, lifecycle, threshold, and terminating-rule functions from `scripts/codex_arbiter.py`. Move `gh`, subprocess, comment collection, comment rendering, and operator-gated writes to a later GitHub adapter task. Preserve first-match rule order: fail-closed validation, clean, stuck P1, pending human, hard cap, exhausted novelty, soft gate, then continue. Invalid rounds increment `round_count` and produce `NEEDS-HUMAN` through `MALFORMED-TRAILER`; they never satisfy finding accounting.

Keep contract derivation and parsing pure and independently testable here. Cover slash replacement, collision-resistant branch hashing, empty branch names, control characters, a missing contract, a mismatched header, and a valid exact-header contract. The adapter may only call the loader with a reader bound to the verified default-branch object; the contract parser itself must not open arbitrary paths or invoke Git.

```python
def decide(history: History, config: ArbiterConfig) -> Decision:
    config.validate()
    validated = validate_history(history)
    if validated.error_code is not None:
        return needs_human(validated.error_code, history.round_count)
    state = replay_findings(history)
    return apply_terminating_rules(state, config)
```

`ArbiterConfig` rejects non-positive thresholds at construction. Proposed gaps contain only bounded finding identity, severity, file, category, first-round, and missing-artifact data. The arbiter never closes a finding by itself; P1 resolutions remain human-pending.

Add explicit negative cases for an empty history, repository/PR identity
mismatch, current-head mismatch, duplicate round IDs, repeated `RESOLVED`
findings, and a malformed trailer that appears alongside a valid trailer in the
same comment. Each case must return a deterministic `NEEDS-HUMAN` result and
must not be converted into a clean or merge disposition.

- [ ] **Step 4: Run parity and mutation checks.**

Run: `python3.12 -m pytest tests/unit/test_arbiter.py tests/unit/test_contract.py tests/unit/test_roundtrip.py -q`

Expected: all copied Relay fixtures produce the same decisions as the frozen `e834773` reference, and invalid-round tests return fail-closed dispositions.

- [ ] **Step 5: Commit the pure core.**

```bash
git add src/loopkeeper/arbiter.py src/loopkeeper/contract.py tests/unit/test_arbiter.py tests/unit/test_contract.py tests/unit/test_roundtrip.py tests/fixtures/relay-e834773 docs/contracts/README.md
git commit -m "feat: extract deterministic Loopkeeper arbiter"
```

## Task 4: Implement redaction, untrusted wrapping, and truncation

**Files:**
- Create: `loopkeeper/src/loopkeeper/redaction.py`
- Create: `loopkeeper/src/loopkeeper/redactor_loader.py`
- Create: `loopkeeper/src/loopkeeper/untrusted.py`
- Create: `loopkeeper/src/loopkeeper/truncate.py`
- Create: `loopkeeper/adapters/relay/redactor.py`
- Test: `loopkeeper/tests/unit/test_redaction.py`
- Test: `loopkeeper/tests/unit/test_untrusted.py`
- Test: `loopkeeper/tests/unit/test_truncate.py`

**Interfaces:**
- `RedactionResult(text: str, placeholders: tuple[str, ...])`.
- `Redactor` protocol with `redact(text: str) -> RedactionResult`.
- `sanitize(text: str, redactor: Redactor | None = None) -> str` and `sanitize_with_metadata(text: str, redactor: Redactor | None = None) -> RedactionResult`.
- `load_redactor(spec: str | None, trusted_roots: tuple[Path, ...]) -> Redactor | None`; `module:object` imports only from trusted package paths.
- `wrap_untrusted(label: str, text: str) -> str`; `truncate_utf8(text: str, max_bytes: int, marker: str) -> str`.

- [ ] **Step 1: Write the security corpus tests.**

```python
class PluginReturning:
    def __init__(self, text: str, placeholders: tuple[str, ...]):
        self.text = text
        self.placeholder_values = placeholders

    def redact(self, text: str) -> RedactionResult:
        return RedactionResult(self.text, self.placeholder_values)


def test_plugin_placeholders_are_deduplicated_and_exposed():
    result = sanitize_with_metadata(
        "acct 1234",
        PluginReturning("[ACCOUNT]", ("ACCOUNT", "ACCOUNT")),
    )
    assert result.text == "[ACCOUNT]"
    assert result.placeholders == ("ACCOUNT",)


def test_plugin_loaded_from_untrusted_path_is_refused(tmp_path):
    with pytest.raises(SecurityError, match="trusted environment"):
        load_redactor("evil:redactor", (tmp_path / "trusted",))


def test_plugin_module_file_must_resolve_inside_a_trusted_root(tmp_path, monkeypatch):
    trusted = tmp_path / "trusted"
    trusted.mkdir()
    module = import_module_from_fixture("plugin", source_root=tmp_path / "outside")
    with pytest.raises(SecurityError, match="module path"):
        validate_plugin_module(module, (trusted,))


def test_builtin_or_namespace_module_without_a_file_is_refused(tmp_path):
    with pytest.raises(SecurityError, match="module path"):
        validate_plugin_module(sys, (tmp_path,))


def test_wrap_defangs_delimiters_but_does_not_replace_redaction():
    assert "[REDACTED_TOKEN]" not in wrap_untrusted("diff", "sk-live-value")
    assert "sk-live-value" in wrap_untrusted("diff", "sk-live-value")
```

- [ ] **Step 2: Run the focused security tests and verify failure.**

Run: `python3.12 -m pytest tests/unit/test_redaction.py tests/unit/test_untrusted.py tests/unit/test_truncate.py -q`

Expected: FAIL because the package security modules do not exist.

- [ ] **Step 3: Port the generic sanitizer and enforce the plugin contract.**

Port the credential, token, cookie, card, and identifier corpus from `scripts/codex_sanitize.py`. Run the built-in sanitizer before and after the project plugin. Validate the imported module's resolved `__file__` is inside a trusted root before loading its object, validate plugin output byte length, enforce placeholder grammar `^[A-Z][A-Z0-9_]{0,31}$`, deduplicate placeholders in first-seen order, and reject a plugin that returns a string, non-string text, unsafe token, or unbounded output. The Relay adapter may wrap `redact_sensitive_text_preserving_bic(value: str) -> str` only with a declared/tested placeholder set.

```python
class Redactor(Protocol):
    def redact(self, text: str) -> RedactionResult: ...


def sanitize_with_metadata(text: str, redactor: Redactor | None = None) -> RedactionResult:
    generic = _generic_redact(text)
    if redactor is None:
        return RedactionResult(generic, ())
    result = redactor.redact(generic)
    _validate_result(result)
    return RedactionResult(_generic_redact(result.text), _normalize_placeholders(result.placeholders))
```

`wrap_untrusted` must escape the opening/closing fence and include a bounded label. `truncate_utf8` rejects non-positive ceilings, never splits a UTF-8 code point, and returns a safely truncated marker when the marker itself is larger than the ceiling; every returned string is at most `max_bytes` when encoded as UTF-8.

- [ ] **Step 4: Run the security corpus and import checks.**

Run: `python3.12 -m pytest tests/unit/test_redaction.py tests/unit/test_untrusted.py tests/unit/test_truncate.py -q`

Expected: all corpus tests pass, including secrets in headers, grouped identifiers, delimiter injection, dynamic placeholders, and multibyte truncation.

- [ ] **Step 5: Commit the security transforms.**

```bash
git add src/loopkeeper/redaction.py src/loopkeeper/redactor_loader.py src/loopkeeper/untrusted.py src/loopkeeper/truncate.py adapters/relay/redactor.py tests/unit/test_redaction.py tests/unit/test_untrusted.py tests/unit/test_truncate.py
git commit -m "feat: add Loopkeeper trust-boundary transforms"
```

## Task 5: Extract transport, public model binding, and prompt composition

**Files:**
- Create: `loopkeeper/src/loopkeeper/transport.py`
- Create: `loopkeeper/src/loopkeeper/model_binding.py`
- Create: `loopkeeper/src/loopkeeper/policy.py`
- Create: `loopkeeper/src/loopkeeper/prompt.py`
- Create: `loopkeeper/tests/unit/test_transport.py`
- Create: `loopkeeper/tests/unit/test_model_binding.py`
- Create: `loopkeeper/tests/unit/test_prompt.py`
- Create: `loopkeeper/tests/unit/conftest.py`
- Create: `loopkeeper/docs/model-binding.md`

**Interfaces:**
- `ModelRequest(instructions, input_text, model, reasoning_effort, max_output_tokens, max_output_bytes)`.
- `TransportConfig(api_style, base_url, api_key, request_timeout, job_deadline_epoch, retry_unestablished_connection=False)`.
- `ModelResponse(text, raw_bytes, truncated, request_id)`.
- `build_payload(request: ModelRequest, api_style: str) -> dict[str, object]`.
- `UrlOpener = Callable[[urllib.request.Request, float], IO[bytes]]` for deterministic fake-opener tests.
- `request_model(request: ModelRequest, config: TransportConfig, opener: UrlOpener = urllib.request.urlopen) -> ModelResponse`.
- `resolve_model(slot: str, override: str | None, env: Mapping[str, str]) -> str` with flag > the normalized slot-specific `LOOPKEEPER_*_MODEL` variable > `LOOPKEEPER_MODEL` precedence; for example, `domain-researcher` maps to `LOOPKEEPER_AGENT_DOMAIN_RESEARCHER_MODEL`.
- `resolve_settings(flags: Mapping[str, object], env: Mapping[str, str]) -> Settings` applies one documented precedence for all operational values: explicit CLI flag > validated `LOOPKEEPER_*` environment value > default. Invalid environment values fail with `ConfigError`; they are never silently coerced.
- `load_policy(path: Path, trusted_root: Path, reader: TrustedReader) -> Policy`, where the policy is the single source for categories, severity guidance, lifecycle instructions, data handling, and display name. The loader rejects a path outside the already validated trusted root and never opens a raw path supplied by untrusted input.
- `render_review_prompt(policy: Policy, redaction: RedactionResult, artifacts: UntrustedArtifacts) -> Prompt` with no Relay product name, payment placeholder list, or duplicated review matrix in code.
- `Policy(display_name: str, categories: tuple[str, ...], severity_guidance: str, lifecycle_rules: str, data_handling: str)`.
- `UntrustedArtifacts(metadata: str, diff: str, previous_review: str | None, checks: str | None)` and `Prompt(instructions: str, input_text: str)`.

- [ ] **Step 1: Write transport tests against a recording fake opener.**

```python
from loopkeeper.redaction import RedactionResult


def test_responses_payload_is_non_retaining_and_preserves_channels():
    request = ModelRequest("trusted policy", "UNTRUSTED_DIFF_BLOCK", "example-model", "none", 100, 400)
    payload = build_payload(request, api_style="responses")
    assert payload["instructions"] == "trusted policy"
    assert payload["input"] == "UNTRUSTED_DIFF_BLOCK"
    assert payload["store"] is False


def test_chat_payload_has_no_unsupported_store_flag():
    payload = build_payload(
        ModelRequest("policy", "input", "example-model", "none", 100, 400),
        api_style="chat",
    )
    assert "store" not in payload


def test_missing_model_binding_fails_loudly():
    with pytest.raises(ConfigError, match="no model bound"):
        resolve_model("AGENT_DOMAIN_RESEARCHER", None, {})


def test_flag_environment_default_precedence_is_shared_across_settings():
    settings = resolve_settings({"max_input_bytes": 10}, {"LOOPKEEPER_MAX_INPUT_BYTES": "20"})
    assert settings.max_input_bytes == 10
    with pytest.raises(ConfigError):
        resolve_settings({}, {"LOOPKEEPER_MAX_INPUT_BYTES": "not-an-integer"})


def test_prompt_uses_policy_and_active_redactor_placeholders():
    prompt = render_review_prompt(policy, RedactionResult("safe", ("ACCOUNT",)), artifacts)
    assert "ACCOUNT" in prompt.instructions
    assert "Relay" not in prompt.instructions
    assert "payment-domain" not in prompt.instructions


def test_transport_retries_only_before_a_response_is_established(recording_opener):
    recording_opener.fail_before_response_once = True
    response = request_model(request, config_with_retry, opener=recording_opener)
    assert response.text == "bounded result"
    assert recording_opener.call_count == 2


def test_transport_never_retries_after_a_response_or_after_deadline(recording_opener):
    recording_opener.response_then_error = True
    with pytest.raises(TransportError):
        request_model(request, config_with_retry, opener=recording_opener)
    assert recording_opener.call_count == 1
```

Define `policy` and `artifacts` as pytest fixtures in `tests/unit/conftest.py`: the policy fixture contains only the categories `functional` and `security`, and the artifacts fixture contains bounded strings `metadata`, `diff`, `previous_review`, and `checks`.

- [ ] **Step 2: Run the tests and verify the transport is absent.**

Run: `python3.12 -m pytest tests/unit/test_transport.py tests/unit/test_model_binding.py tests/unit/test_prompt.py -q`

Expected: FAIL because `loopkeeper.transport` and `loopkeeper.model_binding` do not exist.

- [ ] **Step 3: Port the standard-library HTTP implementation.**

Port Responses and Chat payload construction, endpoint validation, bearer authentication, response envelope bounds, output byte checks, and deadline calculations from `scripts/codex_responses.py`. Use `LOOPKEEPER_API_KEY`, accepting `OPENAI_API_KEY` only through the Relay adapter. Reject non-HTTPS endpoints outside loopback and URLs containing query or fragment components. Never retry a completed request; allow one caller-opted retry only when no response was established and the job deadline still has room.

```python
def request_model(request: ModelRequest, config: TransportConfig, opener=urlopen) -> ModelResponse:
    deadline = min(config.request_timeout, remaining_seconds(config.job_deadline_epoch))
    response = _open_once(request, config, opener, timeout=deadline)
    return _parse_bounded_response(response, request.max_output_bytes)
```

Bind reviewer and triage slots to `LOOPKEEPER_MODEL`, `LOOPKEEPER_REASONING_EFFORT`, `LOOPKEEPER_API_STYLE`, `LOOPKEEPER_API_BASE_URL`, and explicit per-agent model variables. Reject unsupported/version-pinned model shapes in the binding test rather than silently selecting a default.

Load review policy from the trusted path and render the prompt from that policy plus the active `RedactionResult`. The policy file is the only review matrix; the prompt builder must not contain Relay's product name, payment-domain placeholder list, or a second category/severity table. Bound each Markdown section, reject duplicate/unknown machine-readable category headings, and preserve a deterministic section order. Put consumer-specific wording in trusted policy/role Markdown, not in the adapter shell heredoc.

- [ ] **Step 4: Run transport, model-binding, and parity tests.**

Run: `python3.12 -m pytest tests/unit/test_transport.py tests/unit/test_model_binding.py tests/unit/test_prompt.py -q`

Expected: all fake-opener tests pass for both wire styles, timeout/deadline failures, output ceilings, retry limits, response-established versus unestablished retry behavior, and model precedence. The fake opener records every timeout and call so a passing test cannot hide a retry or deadline regression.

- [ ] **Step 5: Commit transport and binding.**

```bash
git add src/loopkeeper/transport.py src/loopkeeper/model_binding.py src/loopkeeper/policy.py src/loopkeeper/prompt.py tests/unit/test_transport.py tests/unit/test_model_binding.py tests/unit/test_prompt.py docs/model-binding.md
git commit -m "feat: extract provider-neutral model transport"
```

## Task 6: Add manifests, path confinement, and attested trust

**Files:**
- Create: `loopkeeper/src/loopkeeper/manifest.py`
- Create: `loopkeeper/src/loopkeeper/paths.py`
- Create: `loopkeeper/src/loopkeeper/attestation.py`
- Create: `loopkeeper/src/loopkeeper/exit_codes.py`
- Create: `loopkeeper/src/loopkeeper/resources/schemas/manifest.schema.json`
- Create: `loopkeeper/src/loopkeeper/resources/schemas/verification.schema.json`
- Create: `loopkeeper/tests/fixtures/attestation/trust-keys.json`
- Create: `loopkeeper/tests/fixtures/attestation/README.md`
- Test: `loopkeeper/tests/unit/test_manifest.py`
- Test: `loopkeeper/tests/unit/test_attestation.py`

**Interfaces:**
- `TrustMode = Literal["github-forge-verified", "caller-attested"]`.
- Re-export the shared `TrustedReader` protocol from the manifest boundary; GitHub implementations bind it to `git show "$TRUSTED_SHA:$path"`, and generic implementations bind it to the manifest's trusted root.
- `load_manifest(path: Path, trusted_root: Path, untrusted_root: Path) -> Manifest`.
- `validate_manifest(manifest: Mapping[str, object], trusted_root: Path, untrusted_root: Path) -> Manifest`.
- `resolve_bounded_path(raw: str, root: Path, max_bytes: int) -> Path`.
- `AttestationVerifier.verify(record: VerificationRecord, manifest: Manifest, key_file: Path) -> None`.
- `verify_caller_attestation(manifest: Manifest, record: VerificationRecord, verifier: AttestationVerifier) -> None`.
- `ManifestError` maps to exit `2`; `TrustError` maps to exit `4`.
- The protected key file is a UTF-8 JSON object `{"schema":1,"keys":{"key_id":"base64-secret"}}`; its path comes only from the process environment/CLI configuration, never from the manifest. On POSIX, reject group/world-readable key files and symlinked paths; on other platforms, document the equivalent protected-secret requirement. Decode each secret once, require at least 32 bytes, and keep the decoded key in memory only for the verification call. Unknown key IDs, duplicate keys, malformed/short encoding, and unreadable files fail closed.

- [ ] **Step 1: Write tests for trust and path refusal.**

```python
def review_manifest(mode: str, verification: dict[str, object] | None) -> dict[str, object]:
    trust = {
        "mode": mode,
        "repo": "example/project",
        "head_sha": "0" * 40,
        "trusted_revision": "1" * 40,
    }
    if verification is not None:
        trust["verification"] = verification
    return {
        "manifest": 1,
        "kind": "review",
        "trust": trust,
        "trusted": {"policy": "policy.md", "contract": None, "context_files": []},
        "untrusted": {"metadata": "metadata.json", "diff": "diff.patch"},
        "limits": {"max_input_bytes": 200000, "max_output_bytes": 50000},
    }


def test_caller_attested_requires_verification_record(tmp_path):
    manifest = review_manifest(mode="caller-attested", verification=None)
    with pytest.raises(TrustError, match="verification"):
        validate_manifest(manifest, tmp_path / "trusted", tmp_path / "untrusted")


def test_symlink_escape_is_rejected(tmp_path):
    trusted = tmp_path / "trusted"
    untrusted = tmp_path / "untrusted"
    trusted.mkdir()
    untrusted.mkdir()
    (trusted / "escape").symlink_to(untrusted, target_is_directory=True)
    with pytest.raises(ManifestError, match="leaves declared root"):
        resolve_bounded_path("escape/input.json", trusted, 1000)


def test_canonical_manifest_digest_includes_the_required_trailing_newline():
    unsigned = review_manifest(mode="caller-attested", verification=None)
    assert unsigned_manifest_digest(unsigned) == sha256(
        (json.dumps(unsigned, sort_keys=True, separators=(",", ":")) + "\\n").encode("utf-8")
    ).hexdigest()


def test_attestation_canonicalization_is_utf8_and_key_order_independent():
    left = {"z": "é", "a": {"b": 2, "a": 1}}
    right = {"a": {"a": 1, "b": 2}, "z": "é"}
    assert unsigned_manifest_digest(left) == unsigned_manifest_digest(right)


def test_bad_attestation_never_invokes_the_model(tmp_path, fake_model):
    manifest = signed_review_manifest(tmp_path, signature="00" * 32)
    with pytest.raises(TrustError):
        load_manifest_and_verify(manifest, fake_model=fake_model)
    assert fake_model.call_count == 0


@pytest.mark.parametrize("mutation", ["repo", "head_sha", "trusted_revision", "manifest_sha256", "signature", "key_id", "method"])
def test_each_attestation_subject_or_signature_mutation_exits_four(tmp_path, fake_model, mutation):
    manifest = signed_review_manifest(tmp_path)
    mutate(manifest, mutation)
    with pytest.raises(TrustError):
        load_manifest_and_verify(manifest, fake_model=fake_model)
    assert fake_model.call_count == 0
```

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `python3.12 -m pytest tests/unit/test_manifest.py tests/unit/test_attestation.py -q`

Expected: FAIL because the manifest and trust modules do not exist.

- [ ] **Step 3: Implement manifest validation and canonical attestation digest.**

Validate `manifest: 1`, kind-specific required fields, strict trust mode, positive limits, repository/head/trusted revision shapes, and separate trusted/untrusted roots. Reject absolute paths, `..`, control characters, symlink escapes, and files over their byte cap before parsing.

For a caller-attested manifest, require `trust.verification` with `method`, `record`, and a trusted record containing `schema: 1`, `method: "hmac-sha256"`, `key_id`, `repo`, `head_sha`, `trusted_revision`, `manifest_sha256`, and `signature`. Compute `manifest_sha256` over canonical UTF-8 JSON with sorted keys, compact separators, and a trailing newline after removing `trust.verification` to avoid a self-referential digest. Compute the HMAC over `loopkeeper-manifest-v1\n{manifest_sha256}\n{repo}\n{head_sha}\n{trusted_revision}` using the key selected by `key_id` from the protected `LOOPKEEPER_TRUST_KEY_FILE`; the key is never read from the manifest or PR-controlled content. Compare signatures in constant time. Missing key, missing record, unsupported method, bad signature, subject mismatch, unknown key, or malformed JSON raises `TrustError` and exit `4` before model invocation.

```python
def unsigned_manifest_digest(value: dict[str, object]) -> str:
    unsigned = json.loads(json.dumps(value))
    trust = unsigned.get("trust")
    if not isinstance(trust, dict):
        raise ManifestError("trust must be an object")
    trust.pop("verification", None)
    canonical = (json.dumps(unsigned, sort_keys=True, separators=(",", ":")) + "\\n").encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()
```

- [ ] **Step 4: Run the trust matrix.**

Run: `python3.12 -m pytest tests/unit/test_manifest.py tests/unit/test_attestation.py -q`

Expected: all valid manifests load; absent/invalid verification records exit through `TrustError`; path and symlink escapes are rejected.

- [ ] **Step 5: Commit the manifest and trust boundary.**

```bash
git add src/loopkeeper/manifest.py src/loopkeeper/paths.py src/loopkeeper/attestation.py src/loopkeeper/exit_codes.py src/loopkeeper/resources/schemas/manifest.schema.json src/loopkeeper/resources/schemas/verification.schema.json tests/unit/test_manifest.py tests/unit/test_attestation.py
git commit -m "feat: enforce Loopkeeper manifest trust boundaries"
```

## Task 7: Build deterministic artifacts and the CLI command surface

**Files:**
- Create: `loopkeeper/src/loopkeeper/artifacts.py`
- Create: `loopkeeper/src/loopkeeper/cli.py`
- Create: `loopkeeper/tests/unit/test_cli.py`
- Create: `loopkeeper/tests/unit/test_artifacts.py`
- Create: `loopkeeper/src/loopkeeper/resources/manifests/review.json`
- Create: `loopkeeper/src/loopkeeper/resources/manifests/review-invalid.json`
- Create: `loopkeeper/src/loopkeeper/resources/manifests/triage.json`
- Create: `loopkeeper/src/loopkeeper/resources/manifests/agent.json`
- Create: `loopkeeper/src/loopkeeper/resources/manifests/history.json`

**Interfaces:**
- Commands: `loopkeeper review`, `loopkeeper triage`, `loopkeeper agent`, `loopkeeper arbitrate`.
- `loopkeeper --version` and `python -m loopkeeper --version` return the same dynamic package version without loading a manifest, key file, network client, or model transport.
- Global CLI options include `--trusted-root`, `--untrusted-root`, `--output-dir`, and an explicit `--trust-key-file` override whose default is the protected `LOOPKEEPER_TRUST_KEY_FILE`; neither the manifest nor untrusted artifacts can select or replace the key file.
- `Provenance(repo: str | None, head_sha: str | None, trusted_revision: str | None)`.
- `render_artifact(kind: str, status: str, provenance: Provenance, payload: Mapping[str, object]) -> ArtifactEnvelope`.
- `write_artifacts(output_dir: Path, artifacts: Mapping[str, str | bytes]) -> None`.
- Exit codes: business dispositions and retained invalid trailers `0`; config/manifest `2`; transport `3`; trust/security `4`.
- `status` is an allowlisted value; `GAP_LABEL_UNAVAILABLE`, `MALFORMED-TRAILER`, and `UNVERIFIABLE` are business results with explicit machine-readable fields, not silent skips or generic success text.

- [ ] **Step 1: Write CLI and artifact tests.**

```python
from types import SimpleNamespace

from loopkeeper.artifacts import Provenance
from loopkeeper.cli import main as cli_main


def run_cli(argv: list[str]) -> SimpleNamespace:
    return SimpleNamespace(exit_code=cli_main(argv))


def provenance(repo: str) -> Provenance:
    return Provenance(repo=repo, head_sha=None, trusted_revision=None)


def test_invalid_review_trailer_is_a_successful_business_result(tmp_path, monkeypatch):
    monkeypatch.setattr("loopkeeper.transport.request_model", fake_bounded_model)
    manifest = sign_manifest_for_fixture(
        json.loads(resource_path("manifests/review-invalid.json").read_text()),
        tmp_path,
        key_id="test-v1",
    )
    manifest_path = tmp_path / "review-invalid.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    result = run_cli(["review", "--manifest", str(manifest_path), "--output-dir", str(tmp_path)])
    assert result.exit_code == 0
    trailer = json.loads((tmp_path / "trailer.json").read_text())
    assert trailer["valid"] is False
    assert trailer["error_code"] == "MALFORMED-TRAILER"


def test_module_entrypoint_dispatches_non_version_commands(tmp_path, monkeypatch):
    monkeypatch.setattr("loopkeeper.cli.main", lambda argv: 7)
    assert module_main(["review", "--manifest", "fixture.json"]) == 7


def test_console_entrypoint_version_does_not_require_manifest_or_key_file():
    assert cli_main(["--version"]) == 0


def test_artifact_writer_accepts_only_declared_names_and_writes_atomically(tmp_path):
    write_artifacts(tmp_path, {"review.md": "safe"})
    assert (tmp_path / "review.md").read_text() == "safe"
    with pytest.raises(ValueError, match="artifact name"):
        write_artifacts(tmp_path, {"../escaped.md": "nope"})


def test_model_echo_is_redacted_before_trailer_parse_and_artifact_write(tmp_path, monkeypatch):
    monkeypatch.setattr("loopkeeper.transport.request_model", fake_model_echoing_secret)
    result = run_cli(["review", "--manifest", str(valid_fixture_manifest(tmp_path)), "--output-dir", str(tmp_path)])
    assert result.exit_code == 0
    persisted = "\\n".join(p.read_text() for p in tmp_path.glob("*.md"))
    assert "sk-live-value" not in persisted


def test_artifact_envelope_excludes_raw_model_and_api_key():
    envelope = render_artifact("review", "complete", provenance("example/project"), {"text": "safe"})
    encoded = json.dumps(envelope.to_dict())
    assert "raw_model" not in encoded
    assert "OPENAI_API_KEY" not in encoded
```

- [ ] **Step 2: Run focused CLI tests and verify failure.**

Run: `python3.12 -m pytest tests/unit/test_cli.py tests/unit/test_artifacts.py -q`

Expected: FAIL because the CLI and artifact renderer do not exist.

- [ ] **Step 3: Implement command dispatch and stable artifact envelopes.**

Use `argparse` with explicit subcommands. Review writes `review.md`, `trailer.json`, and optional `history.json`; triage writes `triage.md` and `triage.json`; agent writes `agent.md` and `agent.json`; arbitration writes `decision.json` and `arbiter-comment.md`; proposed gap intents write `gap-issues.json`. The model response is sanitized before trailer parsing, Markdown rendering, or artifact persistence; raw response bytes are used only for bounded diagnostics and are never written or logged. Every machine-readable file includes `artifact: 1`, `kind`, `trust_mode`, bounded provenance, and `status`. Never include raw model envelopes, API keys, or unsanitized input. Artifact names are a fixed allowlist, output paths stay under the requested directory, and writes use a temporary sibling plus atomic replace so partial files are never presented as complete artifacts.

```python
def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return COMMANDS[args.command](args)
    except ManifestError:
        return EXIT_CONFIG
    except ConfigError:
        return EXIT_CONFIG
    except TransportError:
        return EXIT_TRANSPORT
    except (TrustError, SecurityError, PermissionError):
        return EXIT_TRUST
```

Make invalid/no-trailer business output exit `0` while retaining the validation record. Do not make any CLI command post to GitHub; publishing belongs to the adapter. Expose a small `resource_path(kind, name)` helper using `importlib.resources` so the complete example manifests and JSON Schemas are available from both an installed wheel and a source checkout. Root-level consumer workflow templates remain repository documentation, not package data.

- [ ] **Step 4: Run CLI contract and install tests.**

Run: `python3.12 -m pytest tests/unit/test_cli.py tests/unit/test_artifacts.py -q`

Expected: stable artifact names and exit codes pass, including missing verification (`4`), malformed manifests (`2`), transport failures (`3`), and business dispositions (`0`).

- [ ] **Step 5: Commit the CLI surface.**

```bash
git add src/loopkeeper/artifacts.py src/loopkeeper/cli.py src/loopkeeper/resources/manifests tests/unit/test_cli.py tests/unit/test_artifacts.py
git commit -m "feat: add Loopkeeper manifest CLI and artifacts"
```

## Task 8: Add trusted agent execution

**Files:**
- Create: `loopkeeper/src/loopkeeper/agent.py`
- Create: `loopkeeper/src/loopkeeper/agent_definitions.py`
- Create: `loopkeeper/src/loopkeeper/resources/agents/domain-researcher.md`
- Create: `loopkeeper/src/loopkeeper/resources/agents/feasibility-researcher.md`
- Create: `loopkeeper/src/loopkeeper/resources/agents/precedent-researcher.md`
- Create: `loopkeeper/src/loopkeeper/resources/agents/impact-researcher.md`
- Create: `loopkeeper/src/loopkeeper/resources/agents/verifying-executor.md`
- Test: `loopkeeper/tests/unit/test_agent.py`

**Interfaces:**
- `AgentRequest(manifest: Manifest, agent_name: str, task_text: str, trusted_reader: TrustedReader)`; the agent command accepts a manifest rather than a raw definition path so the same trust-mode and root-confinement checks run before model invocation.
- `AgentConfig(model: str, transport: TransportConfig, max_input_bytes: int, max_output_tokens: int, max_output_bytes: int)`.
- `run_agent(request: AgentRequest, config: AgentConfig) -> AgentResult`.
- `load_definition(path: Path, trusted_root: Path, reader: TrustedReader) -> AgentDefinition` requiring `name` and `description` frontmatter; definition reads use the same trusted-reader boundary as policy and contract reads.
- Public bindings: a normalized slot-specific `LOOPKEEPER_AGENT_..._MODEL` variable, then `LOOPKEEPER_AGENT_MODEL`; for example, `domain-researcher` uses `LOOPKEEPER_AGENT_DOMAIN_RESEARCHER_MODEL`.

- [ ] **Step 1: Write agent tests.**

```python
def test_definition_body_is_trusted_and_task_is_user_input(fake_transport):
    result = run_agent(
        AgentRequest(valid_agent_manifest, "domain-researcher", "untrusted task", trusted_reader),
        config,
    )
    assert fake_transport.instructions == trusted_definition_body
    assert fake_transport.user_input == "untrusted task"


def test_verifying_executor_is_refused_without_dispatcher_attestation():
    with pytest.raises(PermissionError, match="sandbox"):
        run_agent(AgentRequest(valid_executor_manifest, "verifying-executor", "task", trusted_reader), config)


def test_agent_manifest_without_caller_attestation_fails_before_definition_read(fake_reader):
    with pytest.raises(TrustError):
        run_agent(invalid_agent_manifest, config)
    assert fake_reader.read_calls == 0


@pytest.mark.parametrize("definition_text", ["", "name: missing-fence", "---\nname: x\n---\n" + "x" * 200001])
def test_definition_parse_errors_and_oversize_bodies_fail_closed(definition_text, trusted_reader):
    with pytest.raises((ValueError, SecurityError)):
        load_definition_from_reader(definition_text, trusted_reader)
```

- [ ] **Step 2: Run agent tests and verify failure.**

Run: `python3.12 -m pytest tests/unit/test_agent.py -q`

Expected: FAIL because the package agent modules do not exist.

- [ ] **Step 3: Implement frontmatter parsing, model precedence, and refusal.**

Validate the agent manifest and caller attestation before reading the definition. Read only the trusted definition path through `TrustedReader`, require a fenced frontmatter block, bound the body, and send the definition body through the instructions channel. Sanitize, fence, and send task text through the user channel. Reject `verifying-executor` unconditionally until a dispatcher supplies a verified short-lived sandbox attestation; do not treat a model-written or Markdown instruction as enforcement. A raw definition path or raw task argument cannot bypass manifest validation.

- [ ] **Step 4: Run agent and channel-separation tests.**

Run: `python3.12 -m pytest tests/unit/test_agent.py -q`

Expected: all five example definitions parse, model precedence is deterministic, task text never enters trusted instructions, and executor refusal is fail-closed.

- [ ] **Step 5: Commit agent execution.**

```bash
git add src/loopkeeper/agent.py src/loopkeeper/agent_definitions.py src/loopkeeper/resources/agents tests/unit/test_agent.py
git commit -m "feat: add trusted headless agent runner"
```

## Task 9: Port the GitHub adapter and isolate Relay compatibility

**Files:**
- Create: `loopkeeper/adapters/github/review_pr.sh`
- Create: `loopkeeper/adapters/github/triage_issue.sh`
- Create: `loopkeeper/adapters/github/arbiter_io.py`
- Create: `loopkeeper/adapters/github/common.sh`
- Create: `loopkeeper/adapters/github/trust.py`
- Create: `loopkeeper/adapters/github/workflow_identity.py`
- Create: `loopkeeper/adapters/github/comment_state.py`
- Create: `loopkeeper/adapters/relay/compat.py`
- Create: `loopkeeper/docs/github-adapter.md`
- Create: `loopkeeper/docs/compatibility.md`
- Test: `loopkeeper/tests/github/test_automation.sh`
- Test: `loopkeeper/tests/github/test_trust_roots.py`
- Test: `loopkeeper/tests/github/test_workflow_identity.py`
- Test: `loopkeeper/tests/github/test_comment_state.py`
- Test: `loopkeeper/tests/unit/test_compatibility.py`

**Interfaces:**
- `collect_history(repo: str, pr: int, trusted_sha: str, bot_login: str) -> History`.
- `CommentWriter` is a protocol with bounded `read_head`, `read_comments`, `create`, and `update` operations; it never exposes a bulk-delete operation.
- `upsert_review_comment(repo: str, pr: int, head_sha: str, evidence_state: Literal["fallback", "ci"], body: str, writer: CommentWriter) -> None`.
- `post_arbiter_comment(repo: str, pr: int, decision: Decision, operator: bool) -> None`.
- `map_relay_environment(env: Mapping[str, str]) -> dict[str, str]`.
- `resolve_consumer_trusted_sha(repo: str, default_branch: str, api: GitHubApi) -> str` resolves the default branch through the forge and rejects a caller-provided SHA that differs from the returned full commit SHA.
- `verify_loopkeeper_checkout(root: Path, expected_sha: str, release_manifest: Path) -> None` requires a full lowercase SHA, verifies `git rev-parse HEAD`, and checks the release manifest binds the checked-out package/workflow version to that SHA. Release-time provenance/signature verification happens in the release workflow; the runtime verifier claims only exact commit and manifest binding, not a new cryptographic signature scheme.
- `resolve_workflow_target(repo: str, display_name: str, expected_file: str, api: GitHubApi, max_pages: int = 10) -> WorkflowTarget` follows bounded pagination for `GET /actions/workflows`, resolves the display name to one active workflow ID, and requires its returned path to equal the configured file. Exhausting or truncating the page budget is a configuration failure that triggers fallback review rather than silently probing an incomplete list.
- `select_workflow_run_target(event: str, source_event: str, run_head_sha: str, current_pr_head_sha: str, pr_state: str, target_pr: int, run_pull_request_numbers: Sequence[int]) -> Reviewability` is a pure filter requiring `workflow_run`, source event `pull_request`, exact head equality, `OPEN` PR state, and exactly one explicit `workflow_run.pull_requests` association for `target_pr`; missing, duplicated, or ambiguous associations take the fallback path.
- `decide_comment_action(existing: Sequence[CommentState], evidence_state: Literal["fallback", "ci"], head_sha: str) -> CommentAction` returns one of `CREATE`, `REPLACE_FALLBACK`, `SUPPRESS_FALLBACK`, `SUPPRESS_DUPLICATE`, or `RECONCILE_DUPLICATES` without network or environment reads.
- `render_comment(model_markdown: str, marker: str, evidence_state: Literal["fallback", "ci"], max_bytes: int) -> str` adds the adapter-owned marker/evidence footer after sanitizing and UTF-8-truncating model Markdown; marker-like text in model output is escaped and cannot satisfy suppression. The marker/footer reservation is included in the byte budget.
- Marker serialization is fixed in one module and tested byte-for-byte: `<!-- loopkeeper-pr-review:{pr}:{head_sha} -->` followed by `<!-- loopkeeper-evidence:{fallback|ci} -->`. Suppression parses only these exact HTML comments plus the authenticated bot author; prose that resembles a marker is never sufficient.
- `verify_gap_label(repo: str, label: str, api: GitHubApi) -> None` performs an exact, bounded label lookup before any issue-create request; blank, control-character, or missing labels raise `GapLabelUnavailable` and yield the `GAP_LABEL_UNAVAILABLE` result.
- Arbiter comments use the same marker-plus-author lookup and serialized writer as reviewer comments. The body carries the current head and decision artifact, repeats update in place for the same head, and never creates a second current-head arbiter comment.

- [ ] **Step 1: Port the existing shell harness and change imports to canonical modules.**

Copy the verified Bash workers and test harness from the ledger. Replace public worker settings with `LOOPKEEPER_*`, invoke `python -m loopkeeper` or the package modules from the pinned checkout, and keep Relay legacy names only in `adapters/relay/compat.py`. Preserve `git show "$TRUSTED_SHA:$path"` quoting, `GH_REPO` binding, exact-head reads, no PR-code execution, no artifact/cache downloads, and the existing bounded `gh` queries. Validate `GH_REPO` as `owner/name` before interpolation, keep every API path and `git show` argument quoted, and test metacharacter/branch/path inputs against the stub harness. Rework comment collection to page through a configured page/body cap instead of materializing an unbounded `--paginate` response; malformed or truncated comment evidence must disable suppression and take the fail-closed fallback path.

- [ ] **Step 2: Run the ported shell harness before adapter changes.**

Run: `bash tests/github/test_automation.sh`

Expected: FAIL only where the new canonical paths, marker names, and public environment names have not yet been wired.

- [ ] **Step 3: Implement trusted collection and compatibility mapping.**

The GitHub adapter is the only place that can claim `github-forge-verified`. It verifies the default-branch checkout against the forge API, reads policy/contract/context with `git show`, and passes PR content only through the untrusted channel. `compat.py` maps legacy `CODEX_*`, `ARBITER_*`, `RELAY_AGENT_*`, and `OPENAI_API_KEY`, parses legacy markers, and translates exit codes; the package and new workflows emit only Loopkeeper names.

Keep this step reviewable as three commits: (a) trust-root and workflow-identity
resolution plus bounded collection, (b) the pure comment-state machine and
operator-gated writer, and (c) the Relay compatibility adapter. Each commit
must keep the shell harness green for the behavior it owns; do not combine
namespace translation with trust-root changes.

The trust-root resolver is executable rather than a naming convention. The validated `consumer_trusted_sha` input is resolved from the forge's default-branch ref and compared with the checkout before any trusted file is read; if the default branch moves between resolution and checkout, the run fails closed and the next trigger retries it. `loopkeeper_sha` is declared twice in each protected caller, once in the `uses:` pin and once as a `workflow_call` input; a static caller test requires those literals to match, while the called workflow verifies its Loopkeeper checkout SHA and release-manifest binding before invoking scripts. Release-time provenance/signature verification is a separate gate in the release workflow. The called workflow must not accept a branch, tag, or mutable ref as a substitute for either SHA. The adapter records both verified roots in the artifact provenance.

Read-only GitHub API calls may retry bounded 5xx/429 responses with a
deadline-aware backoff, but a failed or truncated read is never interpreted as
“no CI run” or “no comments.” The fallback path records unavailable evidence;
write calls are handled only by the idempotent writer state machine.

Implement comment upsert with this state machine: same-head fallback plus new fallback suppresses; same-head fallback plus CI evidence updates the existing comment in place and changes the adapter-generated evidence state to `ci`; same-head CI plus any duplicate suppresses; no existing state performs a create. The adapter-generated marker and evidence state are appended outside the model body, so model text cannot forge or change the state. The rendered body is sanitized and bounded, including the marker/footer reservation. When duplicate current-head comments already exist, keep the oldest qualifying bot-authored comment as canonical and rewrite every other qualifying marker to a bounded `loopkeeper-superseded:{pr}:{head_sha}:{comment_id}` marker in the same operator-gated transaction; never silently delete review history. Run a dedicated PR-scoped writer job with `cancel-in-progress: false`, re-read the PR head and comments immediately before the write, and retry only the reconciliation read when the head moved. Collection/model jobs may cancel stale work, but the writer cannot be canceled after it owns the group. `LOOPKEEPER_OPERATOR=1` is required inside every write function. `LOOPKEEPER_GAP_LABEL` must resolve to an existing label before `--gap-issues`; otherwise emit `GAP_LABEL_UNAVAILABLE` and perform no write.

- [ ] **Step 4: Run GitHub adapter, compatibility, and security tests.**

Run: `bash tests/github/test_automation.sh && python3.12 -m pytest tests/github/test_trust_roots.py tests/github/test_workflow_identity.py tests/github/test_comment_state.py tests/unit/test_compatibility.py -q`

Expected: all source-pin, independently resolved trust-root, trusted-read, exact-head, marker+author, bounded read retry, fallback replacement, serialized-writer, duplicate-reconciliation, operator-gate, gap-label, workflow identity, and legacy-mapping checks pass.

- [ ] **Step 5: Commit the adapter boundary.**

```bash
git add adapters/github adapters/relay docs/compatibility.md tests/github/test_automation.sh tests/github/test_trust_roots.py tests/github/test_workflow_identity.py tests/github/test_comment_state.py tests/unit/test_compatibility.py
git commit -m "feat: add GitHub adapter and Relay compatibility boundary"
```

## Task 10: Build reusable workflows and consumer caller examples

**Files:**
- Create: `loopkeeper/.github/workflows/pr-review.yml`
- Create: `loopkeeper/.github/workflows/issue-triage.yml`
- Create: `loopkeeper/examples/github/pr-review-caller.yml`
- Create: `loopkeeper/examples/github/pr-review-posting-caller.yml`
- Create: `loopkeeper/examples/github/issue-triage-caller.yml`
- Create: `loopkeeper/examples/github/issue-triage-posting-caller.yml`
- Create: `loopkeeper/examples/github/agent-caller.yml`
- Create: `loopkeeper/tests/github/test_workflow_contract.py`
- Create: `loopkeeper/docs/consumer-guide.md`

**Interfaces:**
- Reusable entrypoints use `on: workflow_call`; they do not own consumer triggers.
- PR caller owns `pull_request_target`, `workflow_run`, manual, and schedule triggers.
- Issue caller owns issue, manual, and schedule triggers.
- Called workflow inputs use lowercase snake_case keys (`consumer_repo`, optional `consumer_trusted_sha` hint, `loopkeeper_sha`, `ci_workflow_name`, `ci_workflow_file`, `job_timeout_seconds`, and `post_comments`) and are copied into uppercase runtime variables only after validation. The runtime always resolves the consumer default-branch SHA from the forge; the hint is compared for diagnostics and can never replace that result. Inputs also include PR/issue identifiers, policy/contract/context references, and explicitly scoped secrets.
- Read-only caller examples request only read permissions; posting caller examples are separate and request the smallest write permission for the enabled comment/issue path. The reusable workflow never tries to elevate caller permissions.

- [ ] **Step 1: Write workflow contract tests.**

```python
from dataclasses import dataclass
import re
import pytest
from pathlib import Path


def test_reusable_pr_workflow_has_workflow_call_and_no_direct_trigger():
    raw = Path(".github/workflows/pr-review.yml").read_text()
    assert "workflow_call:" in raw
    assert "pull_request_target:" not in raw
    for name in ("consumer_repo", "consumer_trusted_sha", "loopkeeper_sha", "ci_workflow_name", "ci_workflow_file", "job_timeout_seconds", "post_comments"):
        assert re.search(rf"^\s+{name}:$", raw, re.MULTILINE)


def test_all_action_and_reusable_workflow_refs_are_full_sha_pinned():
    for path in list(Path(".github/workflows").rglob("*.yml")) + list(Path("examples/github").rglob("*.yml")):
        for ref in re.findall(r"uses:\s*[^@\s]+@([^\s#]+)", path.read_text()):
            assert re.fullmatch(r"[0-9a-f]{40}", ref), (path, ref)


def test_model_secret_is_scoped_to_model_step():
    raw = Path(".github/workflows/pr-review.yml").read_text()
    assert "model_api_key" in raw
    assert "env:" in raw
    assert "LOOPKEEPER_API_KEY" not in raw.split("jobs:", 1)[0]


def test_workflow_run_path_filters_event_head_and_open_pr():
    result = select_workflow_run_target(
        event="workflow_run",
        source_event="pull_request",
        run_head_sha=HEAD,
        current_pr_head_sha=HEAD,
        pr_state="OPEN",
        target_pr=7,
        run_pull_request_numbers=[7],
    )
    assert result.reviewable is True
    assert select_workflow_run_target("workflow_run", "push", HEAD, HEAD, "OPEN", 7, [7]).reviewable is False
    assert select_workflow_run_target("workflow_run", "pull_request", "a" * 40, HEAD, "OPEN", 7, [7]).reviewable is False
    assert select_workflow_run_target("workflow_run", "pull_request", HEAD, HEAD, "CLOSED", 7, [7]).reviewable is False
    assert select_workflow_run_target("workflow_run", "pull_request", HEAD, HEAD, "OPEN", 7, []).reviewable is False
    assert select_workflow_run_target("workflow_run", "pull_request", HEAD, HEAD, "OPEN", 7, [8]).reviewable is False
    assert select_workflow_run_target("workflow_run", "pull_request", HEAD, HEAD, "OPEN", 7, [7, 8]).reviewable is False


def test_caller_pins_remote_workflow_and_keeps_triggers_on_default_branch():
    raw = Path("examples/github/pr-review-caller.yml").read_text()
    assert "types: [opened, synchronize, reopened, ready_for_review]" in raw
    assert "workflows: [CI]" in raw
    assert re.search(r"uses: example-org/loopkeeper/.github/workflows/pr-review.yml@[0-9a-f]{40}", raw)


def test_caller_uses_pin_and_loopkeeper_sha_input_are_identical():
    for path in Path("examples/github").glob("*.yml"):
        raw = path.read_text()
        use_sha = re.search(r"uses: [^@]+@([0-9a-f]{40})", raw).group(1)
        input_sha = re.search(r"loopkeeper_sha:\s*([0-9a-f]{40})", raw).group(1)
        assert use_sha == input_sha, path


def test_posting_and_read_only_callers_have_distinct_permissions():
    readonly = Path("examples/github/pr-review-caller.yml").read_text()
    posting = Path("examples/github/pr-review-posting-caller.yml").read_text()
    assert "pull-requests: write" not in readonly
    assert "pull-requests: write" in posting


def test_called_workflow_writer_concurrency_is_non_cancelable():
    raw = Path(".github/workflows/pr-review.yml").read_text()
    assert "cancel-in-progress: false" in raw
    assert re.search(r"concurrency:\s*\n\s+group:.*pr", raw)


def test_workflow_identity_uses_id_and_normalizes_api_path():
    api = FakeGitHubApi({"workflows": [
        {"id": 17, "name": "CI", "path": ".github/workflows/ci.yml", "state": "active"},
    ]})
    target = resolve_workflow_target("example/project", "CI", "ci.yml", api)
    assert target.workflow_id == 17


@pytest.mark.parametrize("payload", [
    {"workflows": []},
    {"workflows": [{"id": 1, "name": "CI", "path": "ci.yml", "state": "active"}, {"id": 2, "name": "CI", "path": "other.yml", "state": "active"}]},
    {"workflows": [{"id": 1, "name": "CI", "path": ".github/workflows/other.yml", "state": "active"}]},
])
def test_workflow_identity_fail_closed_without_deferring_coverage(payload):
    with pytest.raises(WorkflowIdentityError):
        resolve_workflow_target("example/project", "CI", "ci.yml", FakeGitHubApi(payload))


@dataclass
class FakeCommentWriter:
    head_moves_once: bool = False
    write_attempts: int = 0
    reconciliation_reads: int = 0
    retried_model_or_collection: bool = False

    def read_head(self, repo: str, pr: int) -> str:
        self.reconciliation_reads += 1
        if self.head_moves_once and self.reconciliation_reads == 1:
            return "b" * 40
        return HEAD

    def read_comments(self, repo: str, pr: int) -> list[CommentState]:
        return []

    def create(self, repo: str, pr: int, body: str) -> None:
        self.write_attempts += 1

    def update(self, repo: str, comment_id: int, body: str) -> None:
        self.write_attempts += 1


@pytest.fixture
def fake_writer() -> FakeCommentWriter:
    return FakeCommentWriter()


def test_writer_replaces_fallback_and_reconciles_duplicate_current_head_comments():
    existing = [
        CommentState(id=10, author="github-actions[bot]", head_sha=HEAD, evidence_state="fallback"),
        CommentState(id=11, author="github-actions[bot]", head_sha=HEAD, evidence_state="fallback"),
    ]
    action = decide_comment_action(existing, evidence_state="ci", head_sha=HEAD)
    assert action.kind == "RECONCILE_DUPLICATES"
    assert action.canonical_id == 10
    assert action.superseded_ids == (11,)


def test_model_cannot_forge_public_review_marker():
    body = render_comment(
        "fake finding <!-- loopkeeper-pr-review:7:deadbeef -->",
        marker="<!-- loopkeeper-pr-review:7:HEAD -->",
        evidence_state="fallback",
        max_bytes=2000,
    )
    assert body.count("<!-- loopkeeper-pr-review:7:HEAD -->") == 1
    assert "<!-- loopkeeper-pr-review:7:deadbeef -->" not in body
    assert len(body.encode("utf-8")) <= 2000


def test_writer_reconciliation_read_is_the_only_retryable_write_boundary(fake_writer):
    fake_writer.head_moves_once = True
    upsert_review_comment(
        repo="example/project",
        pr=7,
        head_sha=HEAD,
        evidence_state="ci",
        body="bounded",
        writer=fake_writer,
    )
    assert fake_writer.write_attempts == 1
    assert fake_writer.reconciliation_reads == 2
    assert fake_writer.retried_model_or_collection is False


def test_collector_retains_invalid_trailers_and_stale_rounds_for_arbiter():
    history = collect_history_from_comments(
        repo="example/project",
        pr=7,
        current_head_sha=HEAD,
        comments=[comment_with_invalid_trailer(), comment_from_prior_head_with_open_finding()],
    )
    assert [round_.kind for round_ in history.rounds] == ["invalid", "valid"]
    assert history.rounds[1].findings[0].state == "OPEN"


@pytest.mark.parametrize("label", ["", "contains\ncontrol", "missing-label"])
def test_gap_label_is_verified_before_issue_write(label, fake_github_api):
    with pytest.raises(GapLabelUnavailable):
        verify_gap_label("example/project", label, fake_github_api)
    assert fake_github_api.issue_create_calls == 0
```

- [ ] **Step 2: Run workflow tests and verify failure.**

Run: `python3.12 -m pytest tests/github/test_workflow_contract.py -q`

Expected: FAIL because the reusable entrypoints and caller examples do not exist.

- [ ] **Step 3: Implement the reusable entrypoints and caller templates.**

The fixture callers use the literal repository slug `example-org/loopkeeper` and a 40-hex release pin so the YAML contract is testable; every such file is marked `# LOOPKEEPER-TEMPLATE` and release documentation requires replacing that fixture slug before publication. The called workflow declares every `workflow_call` input with an explicit string/boolean/number type, requiredness, and default, and declares only the named model secret. It checks out the consumer repository at forge-verified `CONSUMER_TRUSTED_SHA` and Loopkeeper at immutable `LOOPKEEPER_SHA` in separate directories. It runs the pinned adapter with `PYTHONPATH="$LOOPKEEPER_ROOT/src"` or installs the exact local wheel with `--no-deps`; it never downloads package code at runtime. The caller sets top-level permissions because the called workflow cannot elevate them.

Add the `# LOOPKEEPER-TEMPLATE` marker to the first comment block of all five
caller files (read-only and posting PR review, read-only and posting issue
triage, and the generic agent caller). A publishable consumer copy must replace
the fixture slug and SHA and must remove the template marker only after the
release pin and repository ownership have been reviewed.

```yaml
# LOOPKEEPER-TEMPLATE: replace the repository slug and release SHA before copying.
# examples/github/pr-review-caller.yml
name: Loopkeeper PR Review
on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_run:
    workflows: [CI]
    types: [completed]
  workflow_dispatch:
  schedule:
    - cron: "17 2 * * 1-5"
permissions:
  contents: read
  actions: read
  checks: read
  pull-requests: read
jobs:
  review:
    uses: example-org/loopkeeper/.github/workflows/pr-review.yml@0123456789abcdef0123456789abcdef01234567
    with:
      consumer_repo: ${{ github.repository }}
      ci_workflow_name: CI
      ci_workflow_file: ci.yml
      loopkeeper_sha: 0123456789abcdef0123456789abcdef01234567
      job_timeout_seconds: 1200
      post_comments: false
    secrets:
      model_api_key: ${{ secrets.LOOPKEEPER_API_KEY }}

The separate `examples/github/pr-review-posting-caller.yml` repeats the same
trigger and immutable pins but changes only `pull-requests: write` and the
explicit `post_comments: true` input. Issue triage has the same read-only and
posting pair, with `issues: read` in the read-only caller and `issues: write`
present only in the posting caller. This
avoids granting a reusable workflow a write-capable token merely because a
consumer has not enabled posting.
```

The implementation must resolve `CI` through bounded, byte-capped `GET /actions/workflows` pages to a unique active workflow ID whose returned `path` is `.github/workflows/ci.yml` (normalize the leading `.github/workflows/` before comparing to the configured `ci.yml`), then probe that numeric ID. It must not compare the strings `CI` and `ci.yml`. A missing, ambiguous, inactive, truncated, or mismatched mapping does not defer review; the fallback path reviews the current head. The caller passes a positive `job_timeout_seconds`; the called workflow stamps `LOOPKEEPER_JOB_DEADLINE_EPOCH` before checkout/model work and passes the remaining budget into transport. The PR writer uses a PR-scoped concurrency group with `cancel-in-progress: false`; collection jobs may cancel stale work, but the comment upsert path serializes fallback/CI replacement.

Permissions are explicit: PR review gets `contents: read`, `actions: read`, `checks: read`, `pull-requests: read`, and only the posting caller adds `pull-requests: write`; issue triage gets `contents: read`, `issues: read`, and only the posting caller adds `issues: write`; the model secret is passed only to the model step. The agent example is a CLI invocation and never runs privileged PR code.

Issue triage uses an issue-number marker plus authenticated bot author and the
same bounded body/upsert helper. Replays update the existing triage comment in
place; a changed issue revision creates a new artifact but never reuses a PR
review marker.

- [ ] **Step 4: Run workflow topology and shell tests.**

Run: `python3.12 -m pytest tests/github/test_workflow_contract.py -q && bash tests/github/test_automation.sh`

Expected: workflow call topology, exact matching `uses`/`LOOPKEEPER_SHA` pins, two-checkout SHA separation, independently resolved trust roots, trigger/probe resolution, read-only versus posting permissions, deadline propagation, action pins, fallback coverage, replacement markers, and no PR-code execution all pass.

- [ ] **Step 5: Commit reusable workflows and examples.**

```bash
git add .github/workflows/pr-review.yml .github/workflows/issue-triage.yml examples/github tests/github/test_workflow_contract.py docs/consumer-guide.md
git commit -m "feat: publish pinned Loopkeeper reusable workflows"
```

## Task 11: Integrate issue triage and artifact-only generic consumers

**Files:**
- Modify: `loopkeeper/src/loopkeeper/cli.py`
- Modify: `loopkeeper/adapters/github/triage_issue.sh`
- Create: `loopkeeper/examples/ci/generic-review.sh`
- Create: `loopkeeper/examples/ci/generic-triage.sh`
- Create: `loopkeeper/tests/integration/helpers.py`
- Create: `loopkeeper/tests/integration/test_generic_cli.py`

**Interfaces:**
- Generic CI invokes `loopkeeper review --manifest ...` or `loopkeeper triage --manifest ...` and receives artifacts only.
- No generic command reads GitHub credentials or performs provider-specific writes.
- Issue triage uses the same transport, sanitizer, placeholder list, and artifact envelope as review.

- [ ] **Step 1: Write end-to-end generic CLI tests.**

```python
import json
from pathlib import Path
from types import SimpleNamespace

from loopkeeper import cli


def run_generic_review(tmp_path: Path, verification: str | None):
    manifest = json.loads(resource_path("manifests/review.json").read_text())
    if verification == "valid":
        manifest = sign_manifest_for_fixture(manifest, tmp_path, key_id="test-v1")
    if verification is None:
        manifest["trust"].pop("verification", None)
    manifest_path = tmp_path / "review.json"
    manifest_path.write_text(json.dumps(manifest))
    exit_code = cli.main([
        "review",
        "--manifest", str(manifest_path),
        "--output-dir", str(tmp_path / "artifacts"),
    ])
    return SimpleNamespace(exit_code=exit_code)


def test_generic_review_requires_attestation_and_writes_only_sanitized_artifacts(tmp_path):
    result = run_generic_review(tmp_path, verification="valid")
    assert result.exit_code == 0
    assert (tmp_path / "artifacts" / "review.md").exists()
    assert (tmp_path / "artifacts" / "trailer.json").exists()
    assert "raw_model" not in (tmp_path / "artifacts" / "review.md").read_text()


def test_generic_review_without_attestation_exits_four(tmp_path):
    result = run_generic_review(tmp_path, verification=None)
    assert result.exit_code == 4


def test_generic_triage_uses_same_attestation_and_artifact_envelope(tmp_path):
    result = run_generic_triage(tmp_path, verification="valid")
    assert result.exit_code == 0
    triage = json.loads((tmp_path / "artifacts" / "triage.json").read_text())
    assert triage["trust_mode"] == "caller-attested"
    assert triage["artifact"] == 1


def test_generic_agent_writes_artifact_only_and_refuses_executor(tmp_path):
    assert run_generic_agent(tmp_path, "domain-researcher", verification="valid").exit_code == 0
    assert run_generic_agent(tmp_path, "verifying-executor", verification="valid").exit_code == 4
```

The integration helper sets `LOOPKEEPER_TRUST_KEY_FILE` to the checked-in test key, creates trusted and untrusted fixture roots, signs the manifest after all paths and content are written (so the fixture cannot accidentally validate a different document), and monkeypatches `loopkeeper.transport.request_model` to return a bounded deterministic response. It asserts the fake model call count, verifies the output directory explicitly, and keeps the test network-free while proving the attestation gate runs before the model call. The example resource is an unsigned template; `sign_manifest_for_fixture` is the only test helper that creates the valid record. The helper also covers wrong key IDs, changed `repo`, changed `head_sha`, changed `trusted_revision`, changed untrusted content, malformed record JSON, and a missing key; each must exit `4` with zero model calls.

- [ ] **Step 2: Run the integration tests before wiring the examples.**

Run: `python3.12 -m pytest tests/integration/test_generic_cli.py -q`

Expected: FAIL because generic manifests and triage wiring are incomplete.

- [ ] **Step 3: Wire triage and provider-neutral examples.**

Keep `caller-attested` in every generic artifact. Load manifests from the trusted control plane, resolve trusted/untrusted roots independently, call the shared transport, and write only bounded sanitized Markdown/JSON. The example scripts must not contain `gh`, `GITHUB_TOKEN`, or provider-specific API calls. A consuming pipeline decides whether to upload artifacts.

- [ ] **Step 4: Run generic integration and leak tests.**

Run: `python3.12 -m pytest tests/integration/test_generic_cli.py -q && rg -n "OPENAI_API_KEY|GITHUB_TOKEN|raw_model" examples/ci src/loopkeeper`

Expected: integration tests pass; the search finds no `OPENAI_API_KEY`, `GITHUB_TOKEN`, or `raw_model` string in `examples/ci` or `src/loopkeeper` at all. Legacy names may appear only under `adapters/relay/compat.py`, where the mapping is unit-tested, and no secret or raw-envelope logging/upload path exists.

- [ ] **Step 5: Commit generic and triage integration.**

```bash
git add src/loopkeeper/cli.py adapters/github/triage_issue.sh examples/ci tests/integration/helpers.py tests/integration/test_generic_cli.py
git commit -m "feat: support issue triage and generic CI runs"
```

## Task 12: Add release, supply-chain, and operator documentation

**Files:**
- Create: `loopkeeper/.github/workflows/ci.yml`
- Create: `loopkeeper/.github/workflows/release.yml`
- Create: `loopkeeper/MANIFEST.in`
- Create: `loopkeeper/docs/security.md`
- Create: `loopkeeper/docs/release.md`
- Create: `loopkeeper/docs/operator-runbook.md`
- Create: `loopkeeper/schemas/release-manifest.schema.json`
- Create: `loopkeeper/release/release-manifest.json`
- Create: `loopkeeper/tests/release/test_release_contract.py`
- Modify: `loopkeeper/README.md`

**Interfaces:**
- CI runs Python 3.10, 3.11, and 3.12; unit, shell, workflow, parity, and package-install suites. The shell job asserts compatible `bash`, `git`, `gh`, `jq`, and `python3` versions before running and records their versions in the job summary so a hosted-runner image change cannot masquerade as a product regression.
- Each Python matrix job installs `.[dev]` before tests; the production wheel is then installed into a separate target with `--no-deps` to prove runtime dependency isolation. CI never relies on globally preinstalled pytest/ruff/build binaries. A workflow-validation job runs a pinned `actionlint` binary over reusable workflows and caller templates, and a shell-validation job runs `shellcheck` over adapter workers.
- Release produces a matching package/workflow version, hashes, provenance, source ledger, license, and attribution notice.
- Consumer examples pin full workflow SHAs and exact package versions with hashes or trusted lock/provenance records.
- Phase 1 publishes the package and its signed provenance without enabling GitHub writes. Phase 2 publishes the reusable-workflow release from the same tag only after the workflow contract, adapter, and read-only dogfood gates pass.
- Distribution targets are CPython 3.10–3.12 on Linux, macOS, and Windows for the provider-neutral package; the GitHub adapter is supported on GitHub-hosted Ubuntu runners because it requires Bash, `gh`, `jq`, and `git`. No native binaries are produced.
- `release/release-manifest.json` has a normative schema containing `schema`, `version`, `commit_sha`, `package_sha256`, `workflow_paths`, and provenance metadata. The called workflow compares `commit_sha` to `loopkeeper_sha`; the release workflow verifies the package hash and provenance before publication.

- [ ] **Step 1: Write release contract tests.**

```python
import json
import re
import tarfile
import zipfile
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python 3.10 support
    import tomli as tomllib


def read_project_metadata(path: str) -> dict[str, object]:
    with open(path, "rb") as stream:
        return tomllib.load(stream)["project"]


def workflow_refs(root: str) -> list[str]:
    refs = []
    for path in Path(root).rglob("*.yml"):
        refs.extend(re.findall(r"uses:\s*[^@\s]+@([0-9a-f]{40})\b", path.read_text()))
    return refs


def all_uses_refs(root: str) -> list[str]:
    refs = []
    for path in Path(root).rglob("*.yml"):
        refs.extend(re.findall(r"uses:\s*[^@\s]+@([^\s#]+)", path.read_text()))
    return refs


def publishable_workflow_refs(root: str) -> list[str]:
    refs = []
    for path in Path(root).rglob("*.yml"):
        raw = path.read_text()
        if "# LOOPKEEPER-PUBLISHABLE" in raw:
            refs.extend(re.findall(r"uses:\s*[^@\s]+@([0-9a-f]{40})\b", raw))
    return refs


def package_install_examples(root: str) -> list[str]:
    matches = []
    for path in Path(root).rglob("*.md"):
        matches.extend(re.findall(r"loopkeeper==[0-9]+\.[0-9]+\.[0-9]+", path.read_text()))
    return matches


def test_runtime_dependencies_are_empty():
    metadata = read_project_metadata("pyproject.toml")
    assert metadata["dependencies"] == []


def test_release_examples_use_full_sha_and_exact_package_version():
    refs_in_source = all_uses_refs("examples/github")
    assert refs_in_source
    assert all(re.fullmatch(r"[0-9a-f]{40}", sha) for sha in refs_in_source)
    workflow_refs_in_source = all_uses_refs(".github/workflows")
    assert workflow_refs_in_source
    assert all(re.fullmatch(r"[0-9a-f]{40}", sha) for sha in workflow_refs_in_source)
    refs = workflow_refs("examples/github")
    assert refs
    assert all(re.fullmatch(r"[0-9a-f]{40}", sha) for sha in refs)
    publishable = publishable_workflow_refs("examples/github")
    assert publishable
    assert all(sha != "0" * 40 and sha != "0123456789abcdef0123456789abcdef01234567" for sha in publishable)
    assert all("example-org/loopkeeper" not in path.read_text() for path in Path("examples/github").rglob("*.yml") if "# LOOPKEEPER-PUBLISHABLE" in path.read_text())
    assert package_install_examples("docs") == ["loopkeeper==0.1.0"]


def test_non_publishable_templates_are_marked_and_not_accidentally_shipped():
    for path in Path("examples/github").rglob("*.yml"):
        raw = path.read_text()
        if "# LOOPKEEPER-PUBLISHABLE" not in raw:
            assert "# LOOPKEEPER-TEMPLATE" in raw
            assert "example-org/loopkeeper" in raw


def test_source_and_built_package_versions_have_one_source_of_truth():
    source_version = re.search(r"__version__\s*=\s*['\"]([^'\"]+)", Path("src/loopkeeper/__init__.py").read_text()).group(1)
    assert source_version == "0.1.0"
    wheel = next(Path("dist").glob("loopkeeper-*.whl"))
    with zipfile.ZipFile(wheel) as archive:
        metadata_name = next(name for name in archive.namelist() if name.endswith(".dist-info/METADATA"))
        wheel_version = re.search(r"^Version:\s*(.+)$", archive.read(metadata_name).decode("utf-8"), re.MULTILINE).group(1)
    assert wheel_version == source_version
    release_version = json.loads(Path("release/release-manifest.json").read_text())["version"]
    assert release_version == source_version


def test_license_notice_and_source_ledger_are_present():
    assert Path("LICENSE").is_file()
    assert Path("NOTICE").is_file()
    assert Path("docs/source-ledger.md").is_file()


def test_wheel_contains_cli_resources():
    wheel = next(Path("dist").glob("loopkeeper-*.whl"))
    names = zipfile.ZipFile(wheel).namelist()
    assert "loopkeeper/resources/schemas/manifest.schema.json" in names
    assert "loopkeeper/resources/manifests/review.json" in names
    assert "loopkeeper/resources/agents/domain-researcher.md" in names
    assert not any(name.endswith("trust-keys.json") for name in names)


def test_sdist_excludes_attestation_key_fixture():
    sdist = next(Path("dist").glob("loopkeeper-*.tar.gz"))
    with tarfile.open(sdist, "r:gz") as archive:
        assert not any(name.endswith("tests/fixtures/attestation/trust-keys.json") for name in archive.getnames())


def test_release_tree_contains_no_attestation_secret_or_key_file():
    for path in Path(".").rglob("*"):
        if path.is_file() and ".git" not in path.parts and path.name not in {"test_release_contract.py"}:
            raw = path.read_text(errors="ignore")
            assert "base64-secret" not in raw
            assert path.name != "trust-keys.json" or "tests" in path.parts
```

- [ ] **Step 2: Run release tests and verify failure.**

Run: `python3.12 -m pytest tests/release/test_release_contract.py -q`

Expected: FAIL until release metadata and workflows exist.

- [ ] **Step 3: Implement CI, build, provenance, and operator docs.**

Create `MANIFEST.in` with an explicit exclusion for the test key and any other test-only secret material:

```text
exclude tests/fixtures/attestation/trust-keys.json
```

Use `python -m build --sdist --wheel`, `mkdir -p /tmp/loopkeeper-clean-install/site`, then `python -m pip install --no-deps --target /tmp/loopkeeper-clean-install/site dist/loopkeeper-0.1.0-py3-none-any.whl`, and generate a hash manifest from the exact artifacts. The release test inspects both the wheel and sdist. A manual release preflight checks PyPI name/ownership and the reusable-workflow repository namespace before the first publish; publication requires a human approval. The release workflow must reject unpinned action/reusable-workflow references, reject fixture slugs and all-zero/example SHAs from publishable examples, verify the source ledger has no omitted extraction-scope file, and publish package/workflow version parity. Phase 1's release job must be able to run without GitHub write permissions; Phase 2's workflow release job is gated on the adapter and dogfood evidence. Document the Relay migration as a separate consumer PR and keep automatic gap issues disabled until the real-PR gate passes.

Document the trust model, `LOOPKEEPER_*` settings, `LOOPKEEPER_GAP_LABEL`, operator gate, artifact retention policy, caller-attested limitations, contract derivation, CI workflow name/file resolution, and fallback/replacement state machine.
Document key rotation for caller attestation: publish a new `key_id`, allow an
overlap window where both keys verify, remove the old key from protected
stores, and reject retired IDs. Never commit the key file or embed a secret in
the manifest, examples, artifacts, or workflow logs.

- [ ] **Step 4: Run package builds and release checks.**

Run: `python3.10 -m pytest tests/release/test_release_contract.py -q && python3.12 -m pytest tests/release/test_release_contract.py -q && ruff check src adapters tests && python3.12 -m build --sdist --wheel`

Expected: release contract tests pass and both artifacts build with zero runtime dependencies.

- [ ] **Step 5: Commit release controls.**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml MANIFEST.in docs/security.md docs/release.md docs/operator-runbook.md schemas/release-manifest.schema.json release/release-manifest.json tests/release/test_release_contract.py README.md
git commit -m "chore: add Loopkeeper release and operator controls"
```

## Task 13: Run frozen parity, mutation, and real-PR dogfood gates

**Files:**
- Create: `loopkeeper/tests/parity/test_relay_e834773.py`
- Create: `loopkeeper/tests/mutation/test_security_guards.sh`
- Create: `loopkeeper/docs/dogfood-runbook.md`
- Modify: `loopkeeper/tests/github/test_automation.sh`
- Modify: `loopkeeper/docs/release.md`

**Interfaces:**
- Parity tests compare Loopkeeper outputs to frozen fixtures from `e834773`, never a mutable Relay checkout.
- Mutation tests remove or weaken each trust, coverage, marker, path, redaction, and operator guard and must fail.
- Dogfood evidence is staged: operator-off Stage A proves CI sequencing, conflicting-PR fallback coverage, exact-head checks, absence of unintended writes, and artifact/log privacy; operator-on Stage B proves the write-dependent comment and arbiter behavior only in a disposable consumer repository.

- [ ] **Step 1: Write parity and mutation assertions.**

```python
EXPECTED_DISPOSITIONS = {
    "pr21_history.json": "ESCALATE-TO-SCOPING",
    "pr22_history.json": "MERGE-CLEAN",
    "pr24_history.json": "ESCALATE-TO-SCOPING",
}


def test_frozen_histories_preserve_decisions():
    for fixture in sorted(Path("tests/fixtures/relay-e834773").glob("*_history.json")):
        history = load_history(fixture)
        assert decide(history, ArbiterConfig()).recommendation == EXPECTED_DISPOSITIONS[fixture.name]


def test_source_ledger_destinations_exist_after_extraction():
    for row in load_source_ledger("docs/source-ledger.md"):
        for destination in row.destinations:
            assert Path(destination).exists(), destination
```

The shell mutation harness must fail when any of these protections is removed: trusted `git show` read, exact-head binding, `workflow_run` event filtering, workflow ID/path mapping, fallback path, evidence-state replacement, marker+author suppression, operator gate, gap-label verification, path confinement, caller-attestation verification, or sanitize-before-wrap ordering.

Include a fixture where one commit is the head of two open PRs. A CI run is
evidence for only the PR explicitly listed in `workflow_run.pull_requests`;
missing or ambiguous association data must take the fallback path for the
target PR rather than borrowing another PR's run or silently skipping both.

Capture adapter stdout, stderr, step summaries, and uploaded artifact manifests
in the harness. Assert that a synthetic credential, raw model envelope, and
untrusted issue/diff payload do not appear in any persisted output, including
error paths such as a failed model request, failed check-run page, and rejected
attestation.

- [ ] **Step 2: Run parity and mutation tests before dogfood.**

Run: `python3.12 -m pytest tests/parity -q && bash tests/mutation/test_security_guards.sh`

Expected: all frozen decisions match; every mutation is detected by at least one test.

Add a bounded performance test before dogfood: a synthetic history at the
maximum configured rounds/findings, a paginated check-run response at the
maximum page/item/raw-byte caps, and a redaction payload at the input ceiling
must finish within the documented job deadline without allocating an
unbounded aggregate. Assert maximum retained comments/checks/pages and record
elapsed time as a diagnostic, not as a flaky hard wall-clock threshold.

- [ ] **Step 3: Execute Stage A of the real-PR gate with writes disabled.**

Use a consumer repository with a pinned caller workflow and Loopkeeper release SHA. Keep `LOOPKEEPER_OPERATOR` unset, `--gap-issues` disabled, and model output/artifact uploads off by default. Exercise a normal PR with CI, a conflicting PR where no CI run appears, a later exact-head CI completion for the same head, an issue triage run, and a generic caller-attested manifest. For the fallback/CI pair, assert that Stage A records a fallback result and then a separate CI-evidence artifact for the same head; it must not claim comment replacement because writes are disabled. Record only bounded sanitized artifacts and job summaries.

Stage A must prove at least one bounded review result for every handled open
head, exact-head and explicit-PR association filtering, no comment/issue/check
run writes, and absence of raw inputs, credentials, or model envelopes in
logs/uploads. A failed or truncated read must remain an unavailable-evidence
result rather than being interpreted as a no-CI condition.

Record Stage A evidence with `dogfood_stage: "A-read-only"`, the consumer
repository and caller/workflow SHAs, the observed head/run identifiers, the
operator state (`false`), and the write-attempt count (`0`). Keep local
artifacts bounded and sanitized; do not upload raw model or API responses.

- [ ] **Step 4: Execute Stage B of the write-path gate in a disposable consumer repository.**

Obtain explicit human approval for a throwaway consumer repository, set
`LOOPKEEPER_OPERATOR=1` only for that repository, keep `--gap-issues` disabled,
and use a short-lived model credential with no production write token. Seed a
PR with no CI run and verify creation of one fallback review comment; then
deliver a later exact-head CI completion and verify in-place replacement with
the `loopkeeper-evidence:ci` marker. Seed duplicate current-head bot comments
and verify deterministic oldest-comment canonicalization plus bounded
`loopkeeper-superseded:{pr}:{head_sha}:{comment_id}` markers. Exercise a real
arbiter disposition and replay the same fallback/CI events to prove
idempotent suppression. Capture the final comment bodies, bounded API write
log, artifact provenance, and arbiter output; assert no write escaped the
throwaway repository and no gap issue was created.

Stage B is the only dogfood stage that may create or update GitHub comments.
Its evidence is invalid if `LOOPKEEPER_OPERATOR` was unset, if the target
repository was not disposable, or if any production repository/token was in
scope. This preserves the operator gate for real consumers while allowing the
highest-risk writer and arbiter paths to execute once under human control.

Record Stage B evidence with `dogfood_stage: "B-disposable-write"`, an explicit
throwaway-repository identifier, the human approval reference, operator state
(`true`), gap-issue state (`false`), bounded write request/response summaries,
and final marker/comment counts. Redact credentials and raw API/model payloads
before persistence.

- [ ] **Step 5: Verify both dogfood stages and approve production enablement separately.**

Run: `python3.12 -m pytest -q && bash tests/github/test_automation.sh && if rg -n "^(from|import) (app|frontend|global_financial_registry)" src adapters; then exit 1; fi && git diff --check`

Expected: supported-version tests pass; Stage A demonstrates coverage for every
handled open head, exact-head evidence, privacy, and zero unintended writes;
Stage B demonstrates fallback creation, fallback-to-CI replacement, duplicate
reconciliation, one current-head comment, arbiter disposition, and idempotent
replay; no raw input/API key/model envelope appears in logs or uploads; and the
standalone package has no imports from Relay's `app` package or repository-local
application modules. Production write enablement remains a separate human
change after both evidence sets are reviewed; it is not part of this command.

- [ ] **Step 6: Commit the verification evidence and close the release gate.**

```bash
git add tests/parity tests/mutation docs/dogfood-runbook.md docs/release.md tests/github/test_automation.sh
git commit -m "test: verify Loopkeeper parity and coverage invariants"
```

## Final verification checklist

- [ ] `python3.10 -m pip install -e '.[dev]' && python3.10 -m pytest -q` passes in a clean environment.
- [ ] `python3.11 -m pip install -e '.[dev]' && python3.11 -m pytest -q` passes in a clean environment.
- [ ] `python3.12 -m pip install -e '.[dev]' && python3.12 -m pytest -q` passes in a clean environment.
- [ ] `bash tests/github/test_automation.sh` passes with all actions and reusable workflow references pinned.
- [ ] `python3.12 -m build --sdist --wheel` produces matching package/workflow version artifacts.
- [ ] `git diff --check` passes and `docs/source-ledger.md` accounts for all 30 extraction-scope files plus the explicit `ci.yml` exclusion.
- [ ] Phase 1 can be tagged and installed independently of GitHub; Phase 2 consumes only the immutable Phase 1 package/workflow release.
- [ ] Contract derivation, exact-header validation, default-branch loading, and empty-contract fallback are covered by pure tests.
- [ ] The called workflow independently resolves the consumer default-branch SHA, verifies the Loopkeeper checkout and release manifest, and rejects altered or mutable trust-root inputs before reading trusted files.
- [ ] Workflow display-name/file mapping resolves through a unique workflow ID and rejects missing, ambiguous, or mismatched API results without deferring review.
- [ ] Stage A runs with `LOOPKEEPER_OPERATOR` unset and proves coverage, exact-head evidence, artifact privacy, and zero unintended writes.
- [ ] Stage B runs only against a human-approved disposable consumer with `LOOPKEEPER_OPERATOR=1` and proves fallback creation, fallback-to-CI replacement, deterministic duplicate reconciliation, arbiter disposition, and idempotent replay.
- [ ] The fallback/CI writer uses a non-cancelable PR-scoped writer, performs deterministic duplicate reconciliation, and has a fake concurrent-create test.
- [ ] A caller-attested manifest without a valid verification record exits `4` before any model call.
- [ ] A conflicting PR with no CI run still receives a review result.
- [ ] A later exact-head CI result replaces a same-head fallback review rather than being suppressed by the idempotency marker.
- [ ] Every artifact is bounded, sanitized, provenance-labelled, and free of raw model envelopes/API keys.
- [ ] GitHub writes remain disabled for real consumers until a human enables `LOOPKEEPER_OPERATOR=1`; the Stage B exception is limited to the disposable dogfood repository, and gap issue filing remains separately disabled.

Plan complete and saved to `docs/superpowers/plans/2026-08-26-loopkeeper-extraction.md`. Two execution options:

1. **Subagent-Driven (recommended):** dispatch a fresh worker per task with review gates between tasks.
2. **Inline Execution:** execute the tasks in this session with checkpointed batches.

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|---|---|---|
| Architecture | DONE | Two release phases now separate the provider-neutral trust boundary from GitHub writes; the plan preserves separate consumer and Loopkeeper checkouts and makes release provenance a distinct gate. |
| Code quality | DONE | Public `LOOPKEEPER_*` APIs stay provider-neutral, Relay compatibility is isolated, package resources use `importlib.resources`, and trusted reads share one `TrustedReader` seam. |
| Security/trust | DONE | Caller attestation is mandatory for `caller-attested` mode and fails with exit `4`; HMAC canonicalization, protected key-file rules, exact SHA binding, path confinement, redaction order, and operator gates are explicit. |
| GitHub correctness | DONE | Workflow display names resolve to a unique numeric ID and normalized path; workflow-run evidence requires exactly one explicit target-PR association; fallback coverage and exact-head CI replacement are acceptance criteria. |
| Idempotency/concurrency | DONE | Marker suppression includes authenticated author and evidence state; fallback-to-CI replacement is explicit; duplicate comments reconcile deterministically; the PR writer is serialized with `cancel-in-progress: false` and retries only its final reconciliation read. Disposable-repository Stage B now executes these write-dependent paths under explicit human approval. |
| Tests | DONE | The plan adds negative, mutation, race, two-PR/same-commit, privacy, bounded-pagination, workflow-contract, wheel, and sdist checks, with concrete commands and expected outcomes. |
| Performance/release | DONE | Stream/page/item/body ceilings, deadline propagation, no retry after response establishment, package-version single source of truth, immutable pins, and exclusion of test attestation keys from both wheel and sdist are specified. |

### Findings folded into the plan

- `trust.verification` is required whenever `trust.mode` is `caller-attested`; missing or malformed records fail before model invocation with exit `4`.
- Fallback and later CI evidence use an explicit evidence-state marker, so same-head CI replaces fallback instead of being suppressed by the base idempotency marker.
- The no-CI/conflicting-PR coverage invariant is present in global constraints, phase gates, acceptance checks, mutation tests, and the real-PR dogfood gate.
- `workflows: [CI]` is never compared textually with `ci.yml`; the adapter resolves the display name through `/actions/workflows`, normalizes the returned path, requires one active workflow ID, and then probes that ID.
- The ambiguous “reachable” qualifier was removed from the safety invariant; scope is now the configured integration’s handled open heads, with a bounded artifact counted even when posting is disabled.
- The writer contract now includes a fake race test, deterministic duplicate reconciliation, a non-cancelable concurrency group, and a strict rule that only the final reconciliation read may retry.
- All caller templates carry an explicit template marker, every caller checks its `uses` SHA against `loopkeeper_sha`, and release tests reject unpinned refs, fixture slugs, and placeholder SHAs.
- The release plan now declares `MANIFEST.in` and tests both wheel and sdist contents so the attestation key fixture cannot ship.
- The dogfood gate is now staged: operator-off Stage A proves coverage, exact-head evidence, privacy, and zero writes; operator-on Stage B runs only in a disposable consumer and proves comment creation, fallback-to-CI replacement, duplicate reconciliation, arbiter disposition, and idempotent replay before production enablement.

### Residual implementation gates

The plan is implementation-ready, but the new repository owner/remote, final published workflow/package SHAs, release provenance signature, protected production key store, and staged Stage A/Stage B dogfood evidence remain deliberate execution gates. They are not silently invented in this Relay checkout.

VERDICT: READY_FOR_IMPLEMENTATION_WITH_PHASE_GATES

NO UNRESOLVED DECISIONS
