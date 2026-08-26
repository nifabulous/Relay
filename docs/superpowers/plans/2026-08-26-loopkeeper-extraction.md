# Loopkeeper Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Loopkeeper as a standalone, dependency-free Python package with a pinned GitHub Actions adapter and reusable workflows so a new project can adopt the review loop without copying Relay's security-sensitive implementation.

**Architecture:** The implementation target is a new repository initialized from Relay's verified `e834773` source snapshot. The canonical `src/loopkeeper` package owns schemas, the pure arbiter, transport, sanitization, manifests, artifacts, and the CLI; `adapters/github` retains Bash orchestration and GitHub I/O. Consumer repositories keep small caller workflows that invoke pinned `workflow_call` entrypoints, while the generic CLI uses explicit `caller-attested` manifests.

**Tech Stack:** Python 3.10–3.12 standard library at runtime; `urllib.request`, `json`, `dataclasses`, `typing`, and `hashlib`; Bash with `gh`, `git`, `jq`, and `python3` for the GitHub adapter; GitHub Actions reusable workflows; `pytest`, `ruff`, and shell harnesses for development and verification.

## Global Constraints

- The implementation target is a separate Loopkeeper repository; this Relay checkout stores the design and plan only until a separate extraction repository is created.
- Runtime dependencies remain zero on Python 3.10–3.12.
- New public settings use `LOOPKEEPER_*`; `CODEX_*`, `ARBITER_*`, `RELAY_AGENT_*`, `OPENAI_API_KEY`, and `codex-*` markers exist only in the Relay compatibility adapter.
- The Bash worker remains the GitHub orchestration path; it is ported and pared into an adapter, not rewritten from memory in Python.
- Trusted policy, contracts, roles, verification records, and context files never come from PR-controlled paths.
- PR/issue/task material is sanitized, delimiter-defanged, wrapped as untrusted input, and bounded before a model call.
- `github-forge-verified` is GitHub-only; generic manifests require `caller-attested` plus a verified `trust.verification` record, or exit `4`.
- Caller attestation uses verification schema `1`, canonical manifest SHA-256, an HMAC-SHA256 signature, and a key selected by `key_id` from protected `LOOPKEEPER_TRUST_KEY_FILE`; signature comparison is constant-time.
- Every open PR head handled by the configured GitHub integration receives at least one review result, including a conflicting head with no CI run; a later exact-head CI result replaces a fallback in place.
- GitHub writes are advisory, operator-gated, idempotent, and gap-issue creation is separately opt-in with a verified existing `LOOPKEEPER_GAP_LABEL`.
- The pure arbiter performs no I/O or model calls and fails closed for malformed or ambiguous history.
- Production workflow and action references use full commit SHAs; PyPI consumers install an exact version with a published hash or trusted provenance record.
- The unrelated Relay edits and untracked files present when this plan is authored are preserved and are not part of Loopkeeper implementation commits.

---

## Source and destination map

All paths below are relative to the new Loopkeeper repository root. The ledger is created before porting and records source path, the `e834773` line count, destination, retained behavior, and parity-test owner. The source snapshot contains a consumer `.github/workflows/ci.yml` in addition to these 30 extraction-scope files; it is intentionally not ported. It is used only as a fixture for workflow-name/file resolution and trigger sequencing.

| Relay source at `e834773` | Lines | Destination | Responsibility after extraction |
|---|---:|---|---|
| `scripts/codex_arbiter.py` | 1446 | `src/loopkeeper/arbiter.py` plus `adapters/github/arbiter_io.py` | Pure decisions in the package; GitHub collection/posting in the adapter |
| `scripts/codex_review_pr.sh` | 734 | `adapters/github/review_pr.sh` | GitHub event selection, trusted reads, collection, model invocation, and reviewer comment upsert |
| `scripts/codex_responses.py` | 488 | `src/loopkeeper/transport.py` | Responses/Chat HTTP transport and budget enforcement |
| `scripts/codex_sanitize.py` | 244 | `src/loopkeeper/redaction.py` plus `adapters/relay/redactor.py` | Generic redaction core and Relay-specific compatibility hook |
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
| `docs/loop/schemas.md` | 129 | `docs/schemas.md` plus `schemas/*.schema.json` | Normative Schema-1/Schema-2 and invalid-round contract |
| `.github/codex/review-policy.md` | 114 | `examples/relay/review-policy.md` | Relay fixture policy, never the package default policy |
| `docs/CODEX_GITHUB_AUTOMATION.md` | 104 | `docs/github-adapter.md` | GitHub adapter operations, trust, permissions, and writes |
| `docs/contracts/README.md` | 94 | `docs/contracts/README.md` | Contract derivation and trusted-default-branch rules |
| `docs/loop/model-binding.md` | 72 | `docs/model-binding.md` | Public model/environment binding contract |
| `.github/codex/context-files.txt` | 2 | `examples/relay/context-files.txt` | Relay fixture context allowlist |
| `docs/contracts/feat-loop-arbiter-564bdc00f842.md` | 105 | `examples/relay/contracts/feat-loop-arbiter-564bdc00f842.md` | Frozen contract-format fixture |

These 30 rows sum to 10,801 source lines at `e834773`. The ledger test compares the checked-out source list and line counts against this table before any extraction commit.

The source ledger also records that the Relay consumer's `.github/workflows/ci.yml` remains outside the extraction. Its `name: CI` and path `ci.yml` become the test case proving that GitHub trigger names are resolved to workflow IDs before the discovery probe queries a file/path.

## Task 1: Bootstrap the standalone repository and ledger

**Files:**
- Create: `loopkeeper/pyproject.toml`
- Create: `loopkeeper/src/loopkeeper/__init__.py`
- Create: `loopkeeper/src/loopkeeper/__main__.py`
- Create: `loopkeeper/LICENSE`
- Create: `loopkeeper/NOTICE`
- Create: `loopkeeper/.gitignore`
- Create: `loopkeeper/README.md`
- Create: `loopkeeper/docs/source-ledger.md`
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

Add a ledger test that parses the Markdown table, asserts exactly 30 source rows, asserts the line-count total is `10801`, and asserts `.github/workflows/ci.yml` appears only in the explicit exclusion note. This prevents the consumer CI workflow from being silently bundled into the reusable project.

- [ ] **Step 2: Run the focused test to verify the bootstrap is absent.**

Run from the new repository root: `python3.12 -m pytest tests/test_package.py -q`

Expected: FAIL because `loopkeeper` is not importable.

- [ ] **Step 3: Create the package metadata and entrypoint.**

```toml
# loopkeeper/pyproject.toml
[project]
name = "loopkeeper"
version = "0.1.0"
description = "Bounded, trust-separated model-call loops with a deterministic arbiter"
requires-python = ">=3.10,<3.13"
dependencies = []

[project.scripts]
loopkeeper = "loopkeeper.cli:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

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


def main() -> int:
    if sys.argv[1:] == ["--version"]:
        print(f"loopkeeper {__version__}")
        return 0
    print("use `loopkeeper --help` for commands")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Create the standalone checkout before copying source:

```bash
mkdir -p ../loopkeeper
git init --initial-branch=main ../loopkeeper
mkdir -p ../loopkeeper/src/loopkeeper ../loopkeeper/tests ../loopkeeper/docs
```

Populate `docs/source-ledger.md` from the table above and copy only the 30 listed paths with `git show e834773:"$SOURCE_PATH"` into their frozen fixture or port destination. Do not copy the Relay application tree or the excluded consumer `ci.yml`. Copy the license and attribution notice required by the source repository, add `src`, `.venv`, build outputs, and test caches to `.gitignore`, and make `README.md` state that this repository is the Loopkeeper extraction rather than an AI PR-review product.

- [ ] **Step 4: Install and rerun the smoke test.**

Run: `python3.12 -m pip install -e . && python3.12 -m pytest tests/test_package.py -q`

Expected: `2 passed` and no runtime dependency installation beyond the editable package itself.

- [ ] **Step 5: Commit the bootstrap.**

```bash
git add pyproject.toml src/loopkeeper/__init__.py src/loopkeeper/__main__.py LICENSE NOTICE .gitignore README.md docs/source-ledger.md tests/test_package.py
git commit -m "chore: bootstrap Loopkeeper package"
```

## Task 2: Define the normative schemas and typed data model

**Files:**
- Create: `loopkeeper/src/loopkeeper/types.py`
- Create: `loopkeeper/src/loopkeeper/schema.py`
- Create: `loopkeeper/src/loopkeeper/errors.py`
- Create: `loopkeeper/schemas/reviewer-trailer.schema.json`
- Create: `loopkeeper/schemas/history.schema.json`
- Create: `loopkeeper/docs/schemas.md`
- Test: `loopkeeper/tests/unit/test_schema.py`

**Interfaces:**
- `parse_trailer(text: str, accepted_markers: tuple[str, ...] = ("loopkeeper-verdict", "codex-verdict")) -> TrailerValidation`.
- `render_trailer(trailer: Trailer) -> str`, which emits only `loopkeeper-verdict`.
- `parse_history(value: object) -> History` and `render_history(history: History) -> dict[str, object]`.
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
git add src/loopkeeper/types.py src/loopkeeper/schema.py src/loopkeeper/errors.py schemas docs/schemas.md tests/unit/test_schema.py
git commit -m "feat: define Loopkeeper history and trailer schemas"
```

## Task 3: Extract the pure deterministic arbiter

**Files:**
- Create: `loopkeeper/src/loopkeeper/arbiter.py`
- Create: `loopkeeper/src/loopkeeper/contract.py`
- Create: `loopkeeper/tests/unit/test_arbiter.py`
- Create: `loopkeeper/tests/unit/test_roundtrip.py`
- Create: `loopkeeper/tests/fixtures/relay-e834773/live_reviewer_capture.md`
- Copy: `loopkeeper/tests/fixtures/relay-e834773/*.json`

**Interfaces:**
- `ArbiterConfig(soft_gate: int = 5, hard_cap: int = 10, stuck_p1_rounds: int = 3, unverifiable_rounds: int = 2)`.
- `Decision(recommendation, loop_action, cited_rule, needs_human, round_count, proposed_gaps, detail)`.
- `decide(history: History, config: ArbiterConfig) -> Decision`; it performs no environment reads, filesystem reads, subprocesses, network calls, or model calls.
- `build_history(comments: Sequence[Comment], current_head_sha: str, current_diff_files: Sequence[str]) -> History` lives in the adapter-facing collector module, not in the pure arbiter.

- [ ] **Step 1: Port parity tests before changing behavior.**

Copy the complete rule fixtures from `tests/test_codex_arbiter.py` into `tests/unit/test_arbiter.py`, change imports to `loopkeeper.arbiter`, and keep the expected vocabulary exactly: `MERGE-CLEAN`, `MERGE-WITH-GAPS`, `ESCALATE-TO-SCOPING`, `CONTINUE`, and `NEEDS-HUMAN`.

- [ ] **Step 2: Run the parity tests to verify the new core is absent.**

Run: `python3.12 -m pytest tests/unit/test_arbiter.py tests/unit/test_roundtrip.py -q`

Expected: FAIL at import time because `loopkeeper.arbiter` has not been implemented.

- [ ] **Step 3: Extract only pure decision logic.**

Port the normalization, identity, accounting, lifecycle, threshold, and terminating-rule functions from `scripts/codex_arbiter.py`. Move `gh`, subprocess, comment collection, comment rendering, and operator-gated writes to a later GitHub adapter task. Preserve first-match rule order: fail-closed validation, clean, stuck P1, pending human, hard cap, exhausted novelty, soft gate, then continue. Invalid rounds increment `round_count` and produce `NEEDS-HUMAN` through `MALFORMED-TRAILER`; they never satisfy finding accounting.

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

- [ ] **Step 4: Run parity and mutation checks.**

Run: `python3.12 -m pytest tests/unit/test_arbiter.py tests/unit/test_roundtrip.py -q`

Expected: all copied Relay fixtures produce the same decisions as the frozen `e834773` reference, and invalid-round tests return fail-closed dispositions.

- [ ] **Step 5: Commit the pure core.**

```bash
git add src/loopkeeper/arbiter.py src/loopkeeper/contract.py tests/unit/test_arbiter.py tests/unit/test_roundtrip.py tests/fixtures/relay-e834773
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


def test_wrap_defangs_delimiters_but_does_not_replace_redaction():
    assert "[REDACTED_TOKEN]" not in wrap_untrusted("diff", "sk-live-value")
    assert "sk-live-value" in wrap_untrusted("diff", "sk-live-value")
```

- [ ] **Step 2: Run the focused security tests and verify failure.**

Run: `python3.12 -m pytest tests/unit/test_redaction.py tests/unit/test_untrusted.py tests/unit/test_truncate.py -q`

Expected: FAIL because the package security modules do not exist.

- [ ] **Step 3: Port the generic sanitizer and enforce the plugin contract.**

Port the credential, token, cookie, card, and identifier corpus from `scripts/codex_sanitize.py`. Run the built-in sanitizer before and after the project plugin. Validate plugin output byte length, placeholder grammar `^[A-Z][A-Z0-9_]{0,31}$`, deduplicate placeholders in first-seen order, and reject a plugin that returns a string, non-string text, unsafe token, or unbounded output. The Relay adapter may wrap `redact_sensitive_text_preserving_bic(value: str) -> str` only with a declared/tested placeholder set.

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

`wrap_untrusted` must escape the opening/closing fence and include a bounded label. `truncate_utf8` must never split a UTF-8 code point and must return a bounded marker when the marker itself is larger than the ceiling.

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
- `load_policy(path: Path) -> Policy`, where the policy is the single source for categories, severity guidance, lifecycle instructions, data handling, and display name.
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


def test_prompt_uses_policy_and_active_redactor_placeholders():
    prompt = render_review_prompt(policy, RedactionResult("safe", ("ACCOUNT",)), artifacts)
    assert "ACCOUNT" in prompt.instructions
    assert "Relay" not in prompt.instructions
    assert "payment-domain" not in prompt.instructions
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

Load review policy from the trusted path and render the prompt from that policy plus the active `RedactionResult`. The policy file is the only review matrix; the prompt builder must not contain Relay's product name, payment-domain placeholder list, or a second category/severity table. Put consumer-specific wording in trusted policy/role Markdown, not in the adapter shell heredoc.

- [ ] **Step 4: Run transport, model-binding, and parity tests.**

Run: `python3.12 -m pytest tests/unit/test_transport.py tests/unit/test_model_binding.py tests/unit/test_prompt.py -q`

Expected: all fake-opener tests pass for both wire styles, timeout/deadline failures, output ceilings, retry limits, and model precedence.

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
- Create: `loopkeeper/schemas/manifest.schema.json`
- Create: `loopkeeper/schemas/verification.schema.json`
- Test: `loopkeeper/tests/unit/test_manifest.py`
- Test: `loopkeeper/tests/unit/test_attestation.py`

**Interfaces:**
- `TrustMode = Literal["github-forge-verified", "caller-attested"]`.
- `load_manifest(path: Path, trusted_root: Path, untrusted_root: Path) -> Manifest`.
- `validate_manifest(manifest: Mapping[str, object], trusted_root: Path, untrusted_root: Path) -> Manifest`.
- `resolve_bounded_path(raw: str, root: Path, max_bytes: int) -> Path`.
- `AttestationVerifier.verify(record: VerificationRecord, manifest: Manifest, key_file: Path) -> None`.
- `verify_caller_attestation(manifest: Manifest, record: VerificationRecord, verifier: AttestationVerifier) -> None`.
- `ManifestError` maps to exit `2`; `TrustError` maps to exit `4`.

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
    unsigned.get("trust", {}).pop("verification", None)
    canonical = json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(canonical).hexdigest()
```

- [ ] **Step 4: Run the trust matrix.**

Run: `python3.12 -m pytest tests/unit/test_manifest.py tests/unit/test_attestation.py -q`

Expected: all valid manifests load; absent/invalid verification records exit through `TrustError`; path and symlink escapes are rejected.

- [ ] **Step 5: Commit the manifest and trust boundary.**

```bash
git add src/loopkeeper/manifest.py src/loopkeeper/paths.py src/loopkeeper/attestation.py src/loopkeeper/exit_codes.py schemas/manifest.schema.json schemas/verification.schema.json tests/unit/test_manifest.py tests/unit/test_attestation.py
git commit -m "feat: enforce Loopkeeper manifest trust boundaries"
```

## Task 7: Build deterministic artifacts and the CLI command surface

**Files:**
- Create: `loopkeeper/src/loopkeeper/artifacts.py`
- Create: `loopkeeper/src/loopkeeper/cli.py`
- Create: `loopkeeper/tests/unit/test_cli.py`
- Create: `loopkeeper/tests/unit/test_artifacts.py`
- Create: `loopkeeper/examples/manifests/review.json`
- Create: `loopkeeper/examples/manifests/review-invalid.json`
- Create: `loopkeeper/examples/manifests/triage.json`
- Create: `loopkeeper/examples/manifests/agent.json`
- Create: `loopkeeper/examples/manifests/history.json`

**Interfaces:**
- Commands: `loopkeeper review`, `loopkeeper triage`, `loopkeeper agent`, `loopkeeper arbitrate`.
- `Provenance(repo: str | None, head_sha: str | None, trusted_revision: str | None)`.
- `render_artifact(kind: str, status: str, provenance: Provenance, payload: Mapping[str, object]) -> ArtifactEnvelope`.
- `write_artifacts(output_dir: Path, artifacts: Mapping[str, str | bytes]) -> None`.
- Exit codes: business dispositions and retained invalid trailers `0`; config/manifest `2`; transport `3`; trust/security `4`.

- [ ] **Step 1: Write CLI and artifact tests.**

```python
from types import SimpleNamespace

from loopkeeper.artifacts import Provenance
from loopkeeper.cli import main as cli_main


def run_cli(argv: list[str]) -> SimpleNamespace:
    return SimpleNamespace(exit_code=cli_main(argv))


def provenance(repo: str) -> Provenance:
    return Provenance(repo=repo, head_sha=None, trusted_revision=None)


def test_invalid_review_trailer_is_a_successful_business_result(tmp_path):
    result = run_cli(["review", "--manifest", "examples/manifests/review-invalid.json", "--output-dir", str(tmp_path)])
    assert result.exit_code == 0
    trailer = json.loads((tmp_path / "trailer.json").read_text())
    assert trailer["valid"] is False
    assert trailer["error_code"] == "MALFORMED-TRAILER"


def test_artifact_envelope_excludes_raw_model_and_api_key():
    envelope = render_artifact("review", "complete", provenance("example/project"), {"text": "safe"})
    encoded = json.dumps(envelope)
    assert "raw_model" not in encoded
    assert "OPENAI_API_KEY" not in encoded
```

- [ ] **Step 2: Run focused CLI tests and verify failure.**

Run: `python3.12 -m pytest tests/unit/test_cli.py tests/unit/test_artifacts.py -q`

Expected: FAIL because the CLI and artifact renderer do not exist.

- [ ] **Step 3: Implement command dispatch and stable artifact envelopes.**

Use `argparse` with explicit subcommands. Review writes `review.md`, `trailer.json`, and optional `history.json`; triage writes `triage.md` and `triage.json`; agent writes `agent.md` and `agent.json`; arbitration writes `decision.json` and `arbiter-comment.md`; proposed gap intents write `gap-issues.json`. Every machine-readable file includes `artifact: 1`, `kind`, `trust_mode`, bounded provenance, and `status`. Never include raw model envelopes, API keys, or unsanitized input.

```python
def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return COMMANDS[args.command](args)
    except ManifestError:
        return EXIT_CONFIG
    except TransportError:
        return EXIT_TRANSPORT
    except TrustError:
        return EXIT_TRUST
```

Make invalid/no-trailer business output exit `0` while retaining the validation record. Do not make any CLI command post to GitHub; publishing belongs to the adapter. Include complete example manifests and the JSON Schema in the package distribution.

- [ ] **Step 4: Run CLI contract and install tests.**

Run: `python3.12 -m pytest tests/unit/test_cli.py tests/unit/test_artifacts.py -q`

Expected: stable artifact names and exit codes pass, including missing verification (`4`), malformed manifests (`2`), transport failures (`3`), and business dispositions (`0`).

- [ ] **Step 5: Commit the CLI surface.**

```bash
git add src/loopkeeper/artifacts.py src/loopkeeper/cli.py tests/unit/test_cli.py tests/unit/test_artifacts.py examples/manifests
git commit -m "feat: add Loopkeeper manifest CLI and artifacts"
```

## Task 8: Add trusted agent execution

**Files:**
- Create: `loopkeeper/src/loopkeeper/agent.py`
- Create: `loopkeeper/src/loopkeeper/agent_definitions.py`
- Create: `loopkeeper/examples/agents/domain-researcher.md`
- Create: `loopkeeper/examples/agents/feasibility-researcher.md`
- Create: `loopkeeper/examples/agents/precedent-researcher.md`
- Create: `loopkeeper/examples/agents/impact-researcher.md`
- Create: `loopkeeper/examples/agents/verifying-executor.md`
- Test: `loopkeeper/tests/unit/test_agent.py`

**Interfaces:**
- `AgentRequest(agent_name: str, task_text: str, trusted_definition: Path)`.
- `AgentConfig(model: str, transport: TransportConfig, max_input_bytes: int, max_output_tokens: int, max_output_bytes: int)`.
- `run_agent(request: AgentRequest, config: AgentConfig) -> AgentResult`.
- `load_definition(path: Path) -> AgentDefinition` requiring `name` and `description` frontmatter.
- Public bindings: a normalized slot-specific `LOOPKEEPER_AGENT_..._MODEL` variable, then `LOOPKEEPER_AGENT_MODEL`; for example, `domain-researcher` uses `LOOPKEEPER_AGENT_DOMAIN_RESEARCHER_MODEL`.

- [ ] **Step 1: Write agent tests.**

```python
def test_definition_body_is_trusted_and_task_is_user_input(fake_transport):
    result = run_agent(
        AgentRequest("domain-researcher", "untrusted task", trusted_definition),
        config,
    )
    assert fake_transport.instructions == trusted_definition_body
    assert fake_transport.user_input == "untrusted task"


def test_verifying_executor_is_refused_without_dispatcher_attestation():
    with pytest.raises(PermissionError, match="sandbox"):
        run_agent(AgentRequest("verifying-executor", "task", definition), config)
```

- [ ] **Step 2: Run agent tests and verify failure.**

Run: `python3.12 -m pytest tests/unit/test_agent.py -q`

Expected: FAIL because the package agent modules do not exist.

- [ ] **Step 3: Implement frontmatter parsing, model precedence, and refusal.**

Read only the trusted definition path, require a fenced frontmatter block, bound the body, and send the definition body through the instructions channel. Sanitize, fence, and send task text through the user channel. Reject `verifying-executor` unconditionally until a dispatcher supplies a verified short-lived sandbox attestation; do not treat a model-written or Markdown instruction as enforcement.

- [ ] **Step 4: Run agent and channel-separation tests.**

Run: `python3.12 -m pytest tests/unit/test_agent.py -q`

Expected: all five example definitions parse, model precedence is deterministic, task text never enters trusted instructions, and executor refusal is fail-closed.

- [ ] **Step 5: Commit agent execution.**

```bash
git add src/loopkeeper/agent.py src/loopkeeper/agent_definitions.py examples/agents tests/unit/test_agent.py
git commit -m "feat: add trusted headless agent runner"
```

## Task 9: Port the GitHub adapter and isolate Relay compatibility

**Files:**
- Create: `loopkeeper/adapters/github/review_pr.sh`
- Create: `loopkeeper/adapters/github/triage_issue.sh`
- Create: `loopkeeper/adapters/github/arbiter_io.py`
- Create: `loopkeeper/adapters/github/common.sh`
- Create: `loopkeeper/adapters/relay/compat.py`
- Create: `loopkeeper/docs/github-adapter.md`
- Create: `loopkeeper/docs/compatibility.md`
- Test: `loopkeeper/tests/github/test_automation.sh`
- Test: `loopkeeper/tests/unit/test_compatibility.py`

**Interfaces:**
- `collect_history(repo: str, pr: int, trusted_sha: str, bot_login: str) -> History`.
- `upsert_review_comment(repo: str, pr: int, head_sha: str, evidence_state: Literal["fallback", "ci"], body: str) -> None`.
- `post_arbiter_comment(repo: str, pr: int, decision: Decision, operator: bool) -> None`.
- `map_relay_environment(env: Mapping[str, str]) -> dict[str, str]`.

- [ ] **Step 1: Port the existing shell harness and change imports to canonical modules.**

Copy the verified Bash workers and test harness from the ledger. Replace public worker settings with `LOOPKEEPER_*`, invoke `python -m loopkeeper` or the package modules from the pinned checkout, and keep Relay legacy names only in `adapters/relay/compat.py`. Preserve `git show "$TRUSTED_SHA:$path"` quoting, `GH_REPO` binding, exact-head reads, no PR-code execution, no artifact/cache downloads, and the existing bounded `gh` queries.

- [ ] **Step 2: Run the ported shell harness before adapter changes.**

Run: `bash tests/github/test_automation.sh`

Expected: FAIL only where the new canonical paths, marker names, and public environment names have not yet been wired.

- [ ] **Step 3: Implement trusted collection and compatibility mapping.**

The GitHub adapter is the only place that can claim `github-forge-verified`. It verifies the default-branch checkout against the forge API, reads policy/contract/context with `git show`, and passes PR content only through the untrusted channel. `compat.py` maps legacy `CODEX_*`, `ARBITER_*`, `RELAY_AGENT_*`, and `OPENAI_API_KEY`, parses legacy markers, and translates exit codes; the package and new workflows emit only Loopkeeper names.

Implement comment upsert with this state machine: same-head fallback plus new fallback suppresses; same-head fallback plus CI evidence updates the existing comment in place and changes the adapter-generated evidence state to `ci`; same-head CI plus any duplicate suppresses; no existing state performs a create. Run the reviewer writer in a PR-scoped concurrency group and re-read before create/reconcile so a fallback and CI trigger cannot leave two current-head comments. `LOOPKEEPER_OPERATOR=1` is required inside every write function. `LOOPKEEPER_GAP_LABEL` must resolve to an existing label before `--gap-issues`; otherwise emit `GAP_LABEL_UNAVAILABLE` and perform no write.

- [ ] **Step 4: Run GitHub adapter, compatibility, and security tests.**

Run: `bash tests/github/test_automation.sh && python3.12 -m pytest tests/unit/test_compatibility.py -q`

Expected: all source-pin, trusted-read, exact-head, marker+author, fallback replacement, operator-gate, gap-label, and legacy-mapping checks pass.

- [ ] **Step 5: Commit the adapter boundary.**

```bash
git add adapters/github adapters/relay docs/compatibility.md tests/github/test_automation.sh tests/unit/test_compatibility.py
git commit -m "feat: add GitHub adapter and Relay compatibility boundary"
```

## Task 10: Build reusable workflows and consumer caller examples

**Files:**
- Create: `loopkeeper/.github/workflows/pr-review.yml`
- Create: `loopkeeper/.github/workflows/issue-triage.yml`
- Create: `loopkeeper/examples/github/pr-review-caller.yml`
- Create: `loopkeeper/examples/github/issue-triage-caller.yml`
- Create: `loopkeeper/examples/github/agent-caller.yml`
- Create: `loopkeeper/tests/github/test_workflow_contract.py`
- Create: `loopkeeper/docs/consumer-guide.md`

**Interfaces:**
- Reusable entrypoints use `on: workflow_call`; they do not own consumer triggers.
- PR caller owns `pull_request_target`, `workflow_run`, manual, and schedule triggers.
- Issue caller owns issue, manual, and schedule triggers.
- Called workflow inputs include consumer repository, `CONSUMER_TRUSTED_SHA`, `LOOPKEEPER_SHA`, PR/issue identifiers, expected CI workflow display name and file, policy/contract/context references, and explicitly scoped secrets.

- [ ] **Step 1: Write workflow contract tests.**

```python
import re
from pathlib import Path


def test_reusable_pr_workflow_has_workflow_call_and_no_direct_trigger():
    raw = Path(".github/workflows/pr-review.yml").read_text()
    assert "workflow_call:" in raw
    assert "pull_request_target:" not in raw


def test_caller_pins_remote_workflow_and_keeps_triggers_on_default_branch():
    raw = Path("examples/github/pr-review-caller.yml").read_text()
    assert "types: [opened, synchronize, reopened, ready_for_review]" in raw
    assert "workflows: [CI]" in raw
    assert re.search(r"uses: example-org/loopkeeper/.github/workflows/pr-review.yml@[0-9a-f]{40}", raw)
```

- [ ] **Step 2: Run workflow tests and verify failure.**

Run: `python3.12 -m pytest tests/github/test_workflow_contract.py -q`

Expected: FAIL because the reusable entrypoints and caller examples do not exist.

- [ ] **Step 3: Implement the reusable entrypoints and caller templates.**

The fixture caller uses the literal repository slug `example-org/loopkeeper` and a 40-hex release pin so the YAML contract is testable; release documentation requires replacing that fixture slug before publication. The called workflow checks out the consumer repository at forge-verified `CONSUMER_TRUSTED_SHA` and Loopkeeper at immutable `LOOPKEEPER_SHA` in separate directories. The caller sets top-level permissions because the called workflow cannot elevate them.

```yaml
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
  pull-requests: write
jobs:
  review:
    uses: example-org/loopkeeper/.github/workflows/pr-review.yml@0123456789abcdef0123456789abcdef01234567
    with:
      ci_workflow_name: CI
      ci_workflow_file: ci.yml
    secrets:
      model_api_key: ${{ secrets.LOOPKEEPER_API_KEY }}
```

The implementation must resolve `CI` through `GET /actions/workflows` to a unique workflow ID whose path is `ci.yml`, then probe that ID. It must not compare the strings `CI` and `ci.yml`. A missing, ambiguous, or mismatched mapping does not defer review; the fallback path reviews the current head. The PR writer uses a PR-scoped concurrency group; collection jobs may cancel stale work, but the comment upsert path serializes fallback/CI replacement.

Permissions are explicit: PR review gets `contents: read`, `actions: read`, `checks: read`, and only enabled comment-write permissions; issue triage gets `contents: read` and issue-write only when posting is enabled; the model secret is passed only to the model step. The agent example is a CLI invocation and never runs privileged PR code.

- [ ] **Step 4: Run workflow topology and shell tests.**

Run: `python3.12 -m pytest tests/github/test_workflow_contract.py -q && bash tests/github/test_automation.sh`

Expected: workflow call topology, two-checkout SHA separation, trigger/probe resolution, least permissions, action pins, fallback coverage, replacement markers, and no PR-code execution all pass.

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
    manifest = json.loads(Path("examples/manifests/review.json").read_text())
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
    assert (tmp_path / "review.md").exists()
    assert (tmp_path / "trailer.json").exists()
    assert "raw_model" not in (tmp_path / "review.md").read_text()


def test_generic_review_without_attestation_exits_four(tmp_path):
    result = run_generic_review(tmp_path, verification=None)
    assert result.exit_code == 4
```

The integration helper sets `LOOPKEEPER_TRUST_KEY_FILE` to the checked-in test key, uses the valid signed verification record from `examples/manifests/review.json` when `verification="valid"`, and monkeypatches `loopkeeper.transport.request_model` to return a bounded deterministic response. This keeps the test network-free while proving the attestation gate runs before the model call.

- [ ] **Step 2: Run the integration tests before wiring the examples.**

Run: `python3.12 -m pytest tests/integration/test_generic_cli.py -q`

Expected: FAIL because generic manifests and triage wiring are incomplete.

- [ ] **Step 3: Wire triage and provider-neutral examples.**

Keep `caller-attested` in every generic artifact. Load manifests from the trusted control plane, resolve trusted/untrusted roots independently, call the shared transport, and write only bounded sanitized Markdown/JSON. The example scripts must not contain `gh`, `GITHUB_TOKEN`, or provider-specific API calls. A consuming pipeline decides whether to upload artifacts.

- [ ] **Step 4: Run generic integration and leak tests.**

Run: `python3.12 -m pytest tests/integration/test_generic_cli.py -q && rg -n "OPENAI_API_KEY|GITHUB_TOKEN|raw_model" examples/ci src/loopkeeper`

Expected: integration tests pass; the search finds only configuration-key validation strings and no secret or raw-envelope logging/upload path.

- [ ] **Step 5: Commit generic and triage integration.**

```bash
git add src/loopkeeper/cli.py adapters/github/triage_issue.sh examples/ci tests/integration/helpers.py tests/integration/test_generic_cli.py
git commit -m "feat: support issue triage and generic CI runs"
```

## Task 12: Add release, supply-chain, and operator documentation

**Files:**
- Create: `loopkeeper/.github/workflows/ci.yml`
- Create: `loopkeeper/.github/workflows/release.yml`
- Create: `loopkeeper/docs/security.md`
- Create: `loopkeeper/docs/release.md`
- Create: `loopkeeper/docs/operator-runbook.md`
- Create: `loopkeeper/tests/release/test_release_contract.py`
- Modify: `loopkeeper/README.md`

**Interfaces:**
- CI runs Python 3.10, 3.11, and 3.12; unit, shell, workflow, parity, and package-install suites.
- Release produces a matching package/workflow version, hashes, provenance, source ledger, license, and attribution notice.
- Consumer examples pin full workflow SHAs and exact package versions with hashes or trusted lock/provenance records.

- [ ] **Step 1: Write release contract tests.**

```python
import re
import tomllib
from pathlib import Path


def read_project_metadata(path: str) -> dict[str, object]:
    with open(path, "rb") as stream:
        return tomllib.load(stream)["project"]


def workflow_refs(root: str) -> list[str]:
    refs = []
    for path in Path(root).rglob("*.yml"):
        refs.extend(re.findall(r"uses:\s*[^@\s]+@([0-9a-f]{40})\b", path.read_text()))
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
    assert all(len(sha) == 40 for sha in workflow_refs("examples/github"))
    assert package_install_examples("docs") == ["loopkeeper==0.1.0"]


def test_license_notice_and_source_ledger_are_present():
    assert Path("LICENSE").is_file()
    assert Path("NOTICE").is_file()
    assert Path("docs/source-ledger.md").is_file()
```

- [ ] **Step 2: Run release tests and verify failure.**

Run: `python3.12 -m pytest tests/release/test_release_contract.py -q`

Expected: FAIL until release metadata and workflows exist.

- [ ] **Step 3: Implement CI, build, provenance, and operator docs.**

Use `python -m build --sdist --wheel`, `python -m pip install --no-deps --target /tmp/loopkeeper-clean-install/site dist/loopkeeper-0.1.0-py3-none-any.whl`, and a hash manifest generated from the exact artifacts. The release workflow must reject unpinned action/reusable-workflow references, verify the source ledger has no omitted extraction-scope file, and publish package/workflow version parity. Document the Relay migration as a separate consumer PR and keep automatic gap issues disabled until the real-PR gate passes.

Document the trust model, `LOOPKEEPER_*` settings, `LOOPKEEPER_GAP_LABEL`, operator gate, artifact retention policy, caller-attested limitations, contract derivation, CI workflow name/file resolution, and fallback/replacement state machine.

- [ ] **Step 4: Run package builds and release checks.**

Run: `python3.12 -m pytest tests/release/test_release_contract.py -q && python3.12 -m build --sdist --wheel`

Expected: release contract tests pass and both artifacts build with zero runtime dependencies.

- [ ] **Step 5: Commit release controls.**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml docs/security.md docs/release.md docs/operator-runbook.md tests/release/test_release_contract.py README.md
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
- Dogfood evidence records CI sequencing, conflicting-PR fallback, exact-head checks, arbiter disposition, comment replacement/idempotency, absence of unintended writes, and artifact/log privacy.

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
```

The shell mutation harness must fail when any of these protections is removed: trusted `git show` read, exact-head binding, `workflow_run` event filtering, workflow ID/path mapping, fallback path, evidence-state replacement, marker+author suppression, operator gate, gap-label verification, path confinement, caller-attestation verification, or sanitize-before-wrap ordering.

- [ ] **Step 2: Run parity and mutation tests before dogfood.**

Run: `python3.12 -m pytest tests/parity -q && bash tests/mutation/test_security_guards.sh`

Expected: all frozen decisions match; every mutation is detected by at least one test.

- [ ] **Step 3: Execute the read-only real-PR gate.**

Use a consumer repository with a pinned caller workflow and Loopkeeper release SHA. Keep `LOOPKEEPER_OPERATOR` unset, `--gap-issues` disabled, and model output/artifact uploads off by default. Exercise: a normal PR with CI, a conflicting PR where no CI run appears, a later CI completion replacing fallback evidence, an issue triage run, and a generic caller-attested manifest. Record only bounded sanitized artifacts and job summaries.

- [ ] **Step 4: Verify the dogfood evidence.**

Run: `python3.12 -m pytest -q && bash tests/github/test_automation.sh && git diff --check`

Expected: supported-version tests pass, the real-PR run demonstrates at least one result for every handled open head, fallback-to-CI replacement leaves one current-head comment, no write occurs without operator mode, and no raw input/API key/model envelope appears in logs or uploads.

- [ ] **Step 5: Commit the verification evidence and close the release gate.**

```bash
git add tests/parity tests/mutation docs/dogfood-runbook.md docs/release.md tests/github/test_automation.sh
git commit -m "test: verify Loopkeeper parity and coverage invariants"
```

## Final verification checklist

- [ ] `python3.10 -m pytest -q` passes in a clean environment.
- [ ] `python3.11 -m pytest -q` passes in a clean environment.
- [ ] `python3.12 -m pytest -q` passes in a clean environment.
- [ ] `bash tests/github/test_automation.sh` passes with all actions and reusable workflow references pinned.
- [ ] `python3.12 -m build --sdist --wheel` produces matching package/workflow version artifacts.
- [ ] `git diff --check` passes and `docs/source-ledger.md` accounts for all 30 extraction-scope files plus the explicit `ci.yml` exclusion.
- [ ] A caller-attested manifest without a valid verification record exits `4` before any model call.
- [ ] A conflicting PR with no CI run still receives a review result.
- [ ] A later exact-head CI result replaces a same-head fallback review rather than being suppressed by the idempotency marker.
- [ ] Every artifact is bounded, sanitized, provenance-labelled, and free of raw model envelopes/API keys.
- [ ] GitHub writes remain disabled until a human enables `LOOPKEEPER_OPERATOR=1`; gap issue filing remains separately disabled.

Plan complete and saved to `docs/superpowers/plans/2026-08-26-loopkeeper-extraction.md`. Two execution options:

1. **Subagent-Driven (recommended):** dispatch a fresh worker per task with review gates between tasks.
2. **Inline Execution:** execute the tasks in this session with checkpointed batches.
