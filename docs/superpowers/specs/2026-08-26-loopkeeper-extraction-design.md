# Loopkeeper Review Loop Extraction Design

**Date:** 2026-08-26  
**Status:** Design approved in conversation; written-spec review pending  
**Source:** Relay review-loop handover compiled from `origin/main` at `e834773`

## Goal

Extract Relay's review loop into a separate reusable project named **Loopkeeper**. Other projects should be able to adopt it either by pinning one reusable GitHub Actions workflow plus project policy/context files, or by installing a matching PyPI package and running a provider-neutral CLI from any CI system or locally.

Loopkeeper is not an AI PR reviewer. It is a provider-agnostic harness for bounded, sanitized, trust-separated model calls in CI, with a deterministic, model-free referee that decides when a loop has converged or must stop and receive human attention. PR review is the reference consumer; issue triage and headless agents share the same spine.

## Decisions

- **Name:** Loopkeeper. The name describes bounded lifecycle ownership without implying merge gating. Package, CLI, workflow documentation, and release artifacts use this name.
- **v1 integrations:** GitHub Actions and a provider-neutral standalone CLI. Native GitLab/Jenkins/etc. posting adapters are deferred.
- **v1 consumers:** PR review, issue triage, and headless agent execution.
- **Distribution:** Publish a PyPI package and a repository containing reusable workflows and CLI source. Both are released from the same versioned source and may be consumed by immutable release SHA/tag.
- **Core implementation:** Python standard library package plus the existing verified Bash GitHub workers. The Bash worker is not rewritten in Python.
- **Configuration:** Human policy and contract remain Markdown. Manifests and machine-readable outputs use JSON so Python 3.10 retains zero runtime dependencies. Operational settings use explicit CLI flags, then documented environment variables.
- **Writes:** Advisory by default. GitHub posting is separately operator-gated; gap-issue filing requires an additional explicit flag. The generic CLI never performs provider-specific writes.
- **Relay migration:** Not part of extraction. Relay becomes a consumer in a separate PR only after the packaged path has reviewed a real PR.

## Problem and product boundary

The current Relay implementation has three useful consumers over one transport, but they are coupled to an application repository:

1. The PR reviewer sends a bounded, sanitized diff and metadata to a model and emits a structured trailer.
2. Issue triage sends sanitized issue material through the same model transport.
3. The headless agent runner loads trusted agent definitions and sends untrusted task input through the same channel split.

The deterministic arbiter is the differentiated part. It consumes a versioned canonical history, tracks finding identity and lifecycle, verifies accounting, and applies terminating rules in a fixed order. It does not call a model or access the repository. A reusable project must preserve that seam rather than extract only a reviewer script.

The user-facing promise is:

> A new project adds configuration and an invocation, not a copy of thousands of security-sensitive lines.

## Architecture

Loopkeeper is a separate repository with one Python package and two integration layers.

### Core package

The `loopkeeper` package owns:

- Schema-1 canonical history and Schema-2 reviewer trailer types and validators.
- The pure deterministic arbiter and contract thresholds.
- Model transport supporting Responses and OpenAI-compatible Chat Completions wire formats through standard-library HTTP.
- Generic credential/identifier sanitization, project redaction-plugin loading, delimiter defanging, and UTF-8-safe truncation.
- Trusted agent-definition loading, model binding, bounded input/output, and sandbox-attestation refusal for execution-capable agents.
- Generic manifest parsing and artifact rendering.
- Narrow adapter interfaces for collectors and publishers.

The package has no runtime dependencies. Development and test dependencies are allowed but are not imported by the runtime path.

### GitHub adapter

The GitHub adapter retains the existing Bash PR-review and issue-triage workers and their stubbed GitHub test harness. It owns `gh`/GitHub event plumbing, exact-head check-run collection, default-branch trusted reads, comment edits, optional issue writes, and reusable Actions workflows.

The reusable workflow is consumed from an immutable Loopkeeper release SHA. A consumer supplies its policy, contract, optional context allowlist, model settings, secrets, and labels/variables through the documented workflow inputs and repository configuration.

### Generic CLI adapter

Other CI systems and local runs use the `loopkeeper` executable with JSON manifests. The CLI accepts bounded file references, invokes the same package core, and emits deterministic JSON/Markdown artifacts. It does not assume GitHub credentials, event payloads, comment APIs, or a particular CI vendor. A consuming pipeline decides whether and how to publish those artifacts.

### Public seam

The arbiter is the strongest seam in the system:

```python
def decide(history: History, config: ArbiterConfig) -> Decision:
    ...
```

The function is pure and deterministic. All network, filesystem, model, and provider writes occur outside it, in adapters that produce or consume its versioned data structures.

## Component contracts

### Schemas and lifecycle

- **Schema 2** is the reviewer trailer. It contains `schema`, `verdict`, and structured findings with severity, lifecycle state, file, category, stable proposal id, optional bounded evidence, and optional `unverifiable.missing` text.
- **Schema 1** is canonical history. It contains repository identity, PR number, current head SHA, sanitized changed-file set, and chronologically sorted canonical comments with validated trailers.
- Unknown schema versions are rejected; the arbiter never guesses a shape.
- Finding states are `NEW`, `OPEN`, and one-time `RESOLVED`. Silence never resolves a finding. A later regression is a fresh `NEW` identity.
- The existing arbiter disposition vocabulary is preserved: `MERGE-CLEAN`, `MERGE-WITH-GAPS`, `ESCALATE-TO-SCOPING`, `CONTINUE`, and fail-closed `NEEDS-HUMAN`, with the cited rule, loop action, round count, human flag, detail, and proposed gaps in machine-readable output.
- Fail-closed rules include malformed trailer, accounting gap, ambiguous identity/history, orphan state, unverifiable high severity, and unverifiable round cap.
- Thresholds remain configurable positive integers: soft gate (default 5), hard cap (default 10), stuck-P1 rounds (default 3), and unverifiable rounds (default 2).

### Transport

```python
def request_model(request: ModelRequest, config: TransportConfig) -> ModelResponse:
    ...
```

The transport supports `responses` and `chat` styles, configurable model id/base URL/reasoning effort/timeouts, bounded input/output, and bearer-token authentication. The endpoint must be HTTPS outside loopback and cannot carry a query or fragment. Responses requests set `store: false`; chat requests rely on its non-retaining request shape. Provider changes are settings changes, not code refactors.

### Security transforms

```python
def sanitize(text: str, redactor: Redactor | None = None) -> str:
    ...

def wrap_untrusted(label: str, text: str) -> str:
    ...

def truncate_utf8(text: str, max_bytes: int, marker: str) -> str:
    ...
```

The built-in sanitizer covers credentials and sensitive identifiers carried by source, issue, and payment-domain text. A project redactor plugin has this contract:

```python
class Redactor(Protocol):
    def redact(self, text: str) -> str: ...
    def placeholders(self) -> tuple[str, ...]: ...
```

If a configured project plugin cannot be imported or does not satisfy the contract, the run fails closed. The prompt's placeholder list is generated from the active plugin rather than duplicated in prompt text. Sanitization always precedes delimiter wrapping; wrapping only defangs delimiters and does not redact.

### Agent execution

```python
def run_agent(request: AgentRequest, config: AgentConfig) -> AgentResult:
    ...
```

Agent definition bodies are trusted instructions. Task input is untrusted input. The runner uses the same transport and byte/token budgets as review and triage. `verifying-executor` remains refused until a dispatcher supplies a verifiable, short-lived sandbox attestation; prose in an agent definition is not an enforcement boundary.

## Run data flow

Every consumer follows the same sequence:

1. Select the event/run and establish a trusted source or explicitly declared trusted root.
2. Validate repository identity, exact head SHA, event type, required files, schema versions, and positive limits.
3. Load trusted policy, contract, role, and named context files. Branch-controlled copies never enter this channel.
4. Collect bounded PR/issue/task artifacts and exact-head check-run summaries as untrusted data.
5. Sanitize each artifact, defang delimiter-shaped text, wrap it in a labelled untrusted block, and enforce the shared input ceiling. A complete sanitized diff and trusted role/policy are required; silent partial inputs are errors.
6. Call the model through the configured transport, with server-side token ceilings and post-generation byte ceilings.
7. Validate the trailer, sanitize and UTF-8-truncate the human output, and emit machine-readable artifacts.
8. For review loops, build Schema-1 history and call the pure arbiter.
9. Let the provider adapter publish only what its explicit operator configuration permits.

## Trust and GitHub workflow behavior

### Two channels, never mixed

Trusted policy, contract, agent role, and context files use the model instructions/system channel. PR diffs, issue bodies, prior comments, check-run names/results, and task input use the user/input channel after sanitization and fencing. The model has no repository, shell, network, or tool access.

### Trusted anchor and policy lag

The privileged GitHub workflow checks out the actual default-branch tip and reads trusted files with `git show <trusted-sha>:<path>`. The worker verifies that checkout and binds every GitHub read and write to the supplied repository identity. A PR changing policy or the context allowlist is reviewed using the previous default-branch policy until that policy change merges; this lag is a safety property and remains unchanged.

### Review coverage invariant

Every reachable open PR head receives exactly one review path. CI sequencing may delay review but may never delete it.

- `workflow_run: completed` handles the named CI workflow only when the source event is `pull_request`, the run head SHA is exact, and the PR is still open/current.
- `opened` and `synchronize` remain an exclusive fallback for conflicting PRs where GitHub creates no pull-request CI run. The worker waits only within a bounded discovery window, defers when a matching run exists, and reviews when no run appears or lookup fails.
- Manual, reopened, ready-for-review, and scheduled paths read currently completed exact-head checks once without polling.
- A later CI completion can replace a no-CI fallback review for the same head with exact-head evidence.
- Concurrency groups are keyed by PR on every trigger; no run-id fallback may silently disable cancellation.

The privileged path executes no PR code, downloads no PR-controlled artifacts or caches, and exposes the model key only to the model-call step. Check-run summaries are bounded, sanitized untrusted evidence; a green check never proves correctness.

### Writes and supply chain

GitHub writes require `ARBITER_OPERATOR=1` in the CLI and inside each networked write function. `--post` creates or edits one bot-authored `codex-arbiter:<pr>` comment, identified by both marker and author login. `--gap-issues` is a second explicit opt-in and is never passed by the default workflow.

Every GitHub Action and reusable workflow reference is pinned to a full commit SHA. The release process updates pins with version comments and documents the matching package/workflow version.

## CLI contract

The executable exposes these stable commands:

```text
loopkeeper review    --manifest review.json    --output-dir artifacts/
loopkeeper triage    --manifest issue.json     --output-dir artifacts/
loopkeeper agent     --manifest agent.json     --output-dir artifacts/
loopkeeper arbitrate --history history.json    --output decision.json
```

Manifests are JSON and have a version field, a kind, trusted file references, bounded untrusted artifact references, and explicit output/configuration overrides. Trusted and untrusted paths are resolved and validated separately; untrusted inline material is never accepted as trusted policy or role text.

Stable artifact names are:

- Review: `review.md`, `trailer.json`, and `history.json` when collection is requested.
- Triage: `triage.md` and `triage.json`.
- Agent: `agent.md` and `agent.json`.
- Arbiter: `decision.json` and a rendered `arbiter-comment.md`.
- Optional proposed gaps: `gap-issues.json` as intents, never an implicit write.

Completed business dispositions, including escalation and `NEEDS-HUMAN`, exit successfully with code `0`; callers inspect the JSON disposition. Invalid manifests/configuration exit `2`, transport failures exit `3`, and trust/security refusals exit `4`. No command implicitly blocks a merge.

## Configuration and versioning

- Markdown is the human-authored format for review policy and per-branch contracts.
- A trusted context allowlist names repository-relative files; the allowlist and file contents are read from the trusted source and are bounded by count and total bytes.
- Environment variables retain the existing names for model, API style/base URL, reasoning effort, input/output ceilings, request/job timeouts, bot identity, check-run limits, and arbiter thresholds. CLI flags override environment values.
- Python support is 3.10 through 3.12 for v1. Runtime dependencies remain zero.
- SemVer governs the PyPI package. Schema versions, CLI manifest versions, artifact names, exit codes, and reusable-workflow inputs are compatibility surfaces and receive explicit compatibility notes.
- A package release and reusable workflow release are built from the same tag and published with checksums. Consumer examples always pin an immutable SHA.

## Testing strategy

The extraction starts by porting the complete Relay loop test/fixture surface rather than reimplementing behavior from memory. The existing Bash worker's stubbed GitHub harness and mutation-tested security guards are preserved.

Required layers are:

- Pure arbiter fixtures covering every rule, identity/lifecycle transition, malformed/ambiguous history, thresholds, proposed gaps, and exact disposition vocabulary.
- Differential parity tests against Relay fixtures at `e834773` for schemas, arbiter decisions, sanitization, transport budgets, and agent channel separation.
- Security corpus tests for credential/identifier redaction, delimiter injection, dynamic placeholders, HTML/Markdown-safe rendering, UTF-8 truncation, and plugin fail-closed behavior.
- Transport tests for both wire styles, endpoint validation, timeouts, output ceilings, and retention flags.
- CLI contract tests for manifest validation, stable artifacts, schema rejection, and exit codes.
- GitHub shell/workflow tests for SHA-pinned actions, trusted `git show` reads, exact-head check evidence, workflow-run filtering, conflicting-PR fallback, marker+author suppression, idempotent arbiter updates, opt-in gap issues, no PR-code execution, and no artifact/cache downloads.
- Package build/install tests for clean Python 3.10–3.12 environments and matching source/workflow release versions.
- Mutation tests for every guard added on the security and coverage paths.

## Release and adoption

1. Create the standalone Loopkeeper repository and port the source, schemas, fixtures, and tests with parity checks.
2. Add package metadata, CLI entry point, reusable workflows, consumer examples, release checksums, and compatibility documentation.
3. Run the generic CLI against fixture manifests and run the GitHub adapter in read-only summary mode.
4. Dogfood a real PR and manually verify CI sequencing, no-CI fallback, exact-head evidence, arbiter disposition, comment idempotency, and absence of unintended writes.
5. Enable operator posting only after the real-PR evidence is reviewed. Keep gap issues disabled.
6. Migrate Relay in a separate consumer PR by pinning the Loopkeeper workflow/release and adding policy/context configuration.
7. Add additional consumers through the same one-workflow/one-policy or install-and-run-CLI contracts.

## Out of scope

- Merge gating, required-check enforcement, auto-merge, deployment, or policy self-update.
- Rewriting the Bash worker in Python.
- Native provider adapters beyond GitHub in v1.
- Removing the trusted-policy lag.
- Implementing a sandbox for `verifying-executor` in this extraction.
- Default automatic gap-issue filing.
- Relay migration in the extraction project.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| The model treats a green check as proof | Check-run data is explicitly untrusted evidence; policy language and review tests reinforce this distinction. |
| A project redactor is missing or incomplete | Plugin import/contract failure is fail-closed; placeholder names are generated from the active plugin; corpus tests are required. |
| CI discovery races GitHub | Exact-head binding, bounded polling, exclusive fallback, and “probe error means review” preserve coverage. |
| Package and workflow versions drift | They are built from the same tag, parity-tested, checksummed, and consumed by immutable SHA. |
| More artifacts increase model input or cost | Shared complete-input ceiling remains authoritative; check/context counts and byte caps are independently bounded. |
| `unverifiable` becomes a suppression path | It never resolves a finding, requires a named missing artifact, routes high severity to a human, and escalates after the configured cap. |
| Convergence works in tests but not in production | A real-PR dogfood gate is required before enabling automatic comments; production status is documented as designed-and-tested until then. |

## Acceptance criteria

The design is successful when all of the following hold:

- A new GitHub project can adopt Loopkeeper by pinning one reusable workflow and supplying policy/context configuration; it does not copy the worker or arbiter source.
- A local or non-GitHub CI project can install `loopkeeper` from PyPI, run the documented JSON-manifest CLI, and consume deterministic JSON/Markdown artifacts without GitHub credentials.
- PR review, issue triage, and headless agents share one transport and the same sanitize-then-wrap trust boundary.
- The pure arbiter reaches a deterministic terminal or human-escalation disposition for every valid history and fails closed for invalid/ambiguous history.
- Finding accounting preserves `NEW`/`OPEN`/one-time `RESOLVED` semantics, and `unverifiable` never suppresses a finding.
- Exact-head CI evidence and trusted context files reach the reviewer without executing PR code or moving PR-controlled text into trusted instructions.
- GitHub comments are idempotent, gap issues are opt-in, and all writes are explicitly operator-gated.
- The published package has zero runtime dependencies and the extracted parity, security, workflow, package, and CLI suites pass on supported Python versions.

