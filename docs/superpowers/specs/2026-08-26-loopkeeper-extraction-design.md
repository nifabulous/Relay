# Loopkeeper Review Loop Extraction Design

**Date:** 2026-08-26
**Status:** Design amended after extensive review; written-spec review pending
**Source:** Relay review-loop handover compiled from `origin/main` at `e834773`

## Goal

Extract Relay's review loop into a separate reusable project named **Loopkeeper**. Other projects should be able to adopt it either by adding a small caller workflow per enabled GitHub integration that pins a Loopkeeper reusable workflow plus project policy/context files, or by installing a matching PyPI package and running a provider-neutral CLI from any CI system or locally.

Loopkeeper is not an AI PR reviewer. It is a provider-neutral harness for bounded, sanitized, trust-separated model calls over documented OpenAI-compatible Responses and Chat protocols, with a deterministic, model-free referee that decides when a loop has converged or must stop and receive human attention. PR review is the reference consumer; issue triage and headless agents share the same spine.

## Decisions

- **Name:** Loopkeeper. The name describes bounded lifecycle ownership without implying merge gating. Package, CLI, workflow documentation, and release artifacts use this name.
- **v1 integrations:** GitHub Actions through consumer caller workflows plus pinned remote reusable workflows, and a provider-neutral standalone CLI. Native GitLab/Jenkins/etc. posting adapters are deferred.
- **v1 consumers:** PR review, issue triage, and headless agent execution.
- **Distribution:** Publish a PyPI package and a repository containing reusable workflows and CLI source. Both are released from the same versioned source. Workflows and source checkouts use immutable release SHAs; PyPI consumers use an exact version and published hash/provenance.
- **Core implementation:** Python standard library package plus the existing verified Bash GitHub workers. The Bash worker is not rewritten in Python.
- **Configuration:** Human policy and contract remain Markdown. Manifests and machine-readable outputs use JSON so Python 3.10 retains zero runtime dependencies. Operational settings use explicit CLI flags, then documented environment variables.
- **Public namespace:** New consumers use `LOOPKEEPER_*` settings and `loopkeeper-*` markers. Relay compatibility may accept legacy `CODEX_*`, `RELAY_AGENT_*`, `OPENAI_API_KEY`, and `codex-*` markers only inside the compatibility adapter.
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

The repository has one canonical source tree and explicit adapter boundaries:

```text
loopkeeper/
  src/loopkeeper/                 # canonical dependency-free Python core + CLI
  adapters/github/                # retained Bash orchestration and GitHub I/O
  workflows/                      # reusable pr-review and issue-triage entrypoints
  examples/                       # consumer caller workflows and JSON manifests
  tests/                          # core, adapter, workflow, parity, and mutation tests
  fixtures/relay-e834773/        # frozen source/parity reference artifacts
  docs/                           # schemas, policy, contracts, security, and release docs
```

The extraction begins with a source ledger mapping all 30 Relay files to one of these destinations. The ledger records each source path, its line count at `e834773`, destination, retained behavior, and owning parity test; CI fails if a source file is omitted or remapped without an explicit review. No file is silently dropped because it looks application-specific; domain-specific prompt/configuration is separated from generic worker behavior and either becomes consumer configuration or an explicit adapter.

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

The GitHub adapter retains the existing Bash PR-review and issue-triage workers and their stubbed GitHub test harness. It owns `gh`/GitHub event plumbing, exact-head check-run collection, default-branch trusted reads, comment edits, optional issue writes, and reusable Actions workflows. Bash remains orchestration; shared transport, security transforms, schema parsing, and rendering come from the canonical package or the pinned Loopkeeper checkout rather than a second copied implementation.

The repository ships separate `pr-review` and `issue-triage` reusable workflow entrypoints. Each consumer keeps a small caller workflow in its own default branch. The caller owns the event triggers and invokes the matching Loopkeeper workflow with an immutable Loopkeeper release SHA. The called workflow checks out the consumer repository at a separately verified `CONSUMER_TRUSTED_SHA` for policy/contract/context, and checks out Loopkeeper at `LOOPKEEPER_SHA` for code. These two trust roots are never represented by one variable or one checkout.

A generic PR caller workflow owns `pull_request_target`, `workflow_run`, and manual triggers. The generic PR caller intentionally has no targetless `schedule` trigger. A consumer that needs reconciliation adds a separate scheduled selector that enumerates a bounded set of open PRs and passes one explicit PR number per matrix job; it must not invoke the reusable workflow without a verified target. An issue caller owns issue/manual/schedule triggers. The headless-agent path is a CLI/package capability. Its optional dispatch-only caller invokes the reusable `agent.yml` entrypoint, whose unprivileged callee runs the CLI without executing PR code or granting the model shell/network capability; it is not a PR-triggered workflow.

### Generic CLI adapter

Other CI systems and local runs use the `loopkeeper` executable with JSON manifests. The CLI accepts bounded file references, invokes the same package core, and emits deterministic JSON/Markdown artifacts. It does not assume GitHub credentials, event payloads, comment APIs, or a particular CI vendor. A consuming pipeline decides whether and how to publish those artifacts.

Generic runs declare their trust mode explicitly. `github-forge-verified` is reserved for the GitHub adapter; standalone and other-CI runs use `caller-attested` and must provide repository identity, head SHA, trusted-policy revision, and a verification record that binds those values to the manifest digest. `trust.verification` is mandatory for `caller-attested`, contains a supported method and a trusted record reference, and is validated before any model call; a missing, malformed, unsupported, or unverifiable record exits `4`. Manifests are trusted control-plane inputs and must be created outside PR-controlled content.

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
- **Schema 1** is canonical history. It contains repository identity, PR number, current head SHA, sanitized changed-file set, and chronologically sorted rounds. Valid rounds contain canonical comments with validated trailers; invalid rounds contain only the bounded trailer-validation record and cannot satisfy finding accounting.
- New public trailers use `<!-- loopkeeper-verdict: ... -->`. During Relay migration the parser accepts `codex-verdict` as a legacy input, while new output always uses the Loopkeeper marker. The marker namespace is configuration, not a trust signal.
- Unknown schema versions are rejected; the arbiter never guesses a shape.
- Finding states are `NEW`, `OPEN`, and one-time `RESOLVED`. Silence never resolves a finding. A later regression is a fresh `NEW` identity.
- The existing arbiter disposition vocabulary is preserved: `MERGE-CLEAN`, `MERGE-WITH-GAPS`, `ESCALATE-TO-SCOPING`, `CONTINUE`, and fail-closed `NEEDS-HUMAN`, with the cited rule, loop action, round count, human flag, detail, and proposed gaps in machine-readable output.
- Fail-closed rules include malformed trailer, accounting gap, ambiguous identity/history, orphan state, unverifiable high severity, and unverifiable round cap.
- Thresholds remain configurable positive integers: soft gate (default 5), hard cap (default 10), stuck-P1 rounds (default 5), and unverifiable rounds (default 5). The boundary contract is explicit: four rounds do not fire either boundary, five rounds fire `STUCK-P1` while five unverifiable rounds are still allowed, and the sixth unverifiable round fires `UNVERIFIABLE-ROUND-CAP`.

If a model response has no valid trailer, the review artifact is still retained as an invalid round so the arbiter can fail closed; the adapter must not silently discard it. A review command emits a validation record with `valid: false`, an error code, and bounded diagnostic text. The human comment remains sanitized and bounded, but the invalid round prevents a clean recommendation until a later valid round or a terminating rule applies.

Proposed gap artifacts have a versioned shape containing only bounded, sanitized finding identity, severity, file, category, first-round, and missing-artifact fields. They are issue-creation intents. Neither the generic CLI nor the default workflow turns them into external writes.

### Transport

```python
def request_model(request: ModelRequest, config: TransportConfig) -> ModelResponse:
    ...
```

The transport supports `responses` and `chat` styles, configurable model id/base URL/reasoning effort/timeouts, bounded input/output, and bearer-token authentication. The public key setting is `LOOPKEEPER_API_KEY`; `OPENAI_API_KEY` is accepted only as a documented compatibility fallback. The endpoint must be HTTPS outside loopback and cannot carry a query or fragment. Responses requests set `store: false`; chat requests send no unsupported retention flag. Provider changes are settings changes, not code refactors. Retry policy is explicit: no blind retry of a completed model request, one bounded retry for an unestablished connection when the caller opts in, and no retry may exceed the job deadline or duplicate a provider write.

### Security transforms

```python
def sanitize(text: str, redactor: Redactor | None = None) -> str:
    ...

def wrap_untrusted(label: str, text: str) -> str:
    ...

def truncate_utf8(text: str, max_bytes: int, marker: str) -> str:
    ...
```

The built-in sanitizer covers credentials and common sensitive identifiers carried by source, issue, and payment-domain text. A project redactor plugin is named by trusted configuration as `module:object` and is imported only from the trusted project/package environment, never from a PR-controlled path. Its public contract is:

```python
from typing import NamedTuple, Protocol

class RedactionResult(NamedTuple):
    text: str
    placeholders: tuple[str, ...]

class Redactor(Protocol):
    def redact(self, text: str) -> RedactionResult: ...
```

The result text is subject to the same input byte ceiling as other artifacts. The built-in generic sanitizer runs before the plugin and again over the plugin result. Placeholder names must match the documented uppercase token grammar, and the returned list is deduplicated and bounded before prompt generation. A compatibility shim may wrap Relay's existing string-returning redactor only when its emitted placeholder set is declared and tested. If a configured project plugin cannot be imported or does not satisfy the contract, the run fails closed. The prompt's placeholder list is generated from the actual active redaction result rather than duplicated in prompt text. Sanitization always precedes delimiter wrapping; wrapping only defangs delimiters and does not redact.

### Agent execution

```python
def run_agent(request: AgentRequest, config: AgentConfig) -> AgentResult:
    ...
```

Agent definition bodies are trusted instructions. Task input is untrusted input. The runner uses the same transport and byte/token budgets as review and triage. Definitions are consumer-owned Markdown files with required `name`/`description` frontmatter and a body; Loopkeeper ships reference definitions as examples, not as an implicit policy for every consumer. Public model-binding variables are `LOOPKEEPER_AGENT_<NAME>_MODEL` and `LOOPKEEPER_AGENT_MODEL`. `RELAY_AGENT_*` names are accepted only by the Relay compatibility adapter. `verifying-executor` remains refused until a dispatcher supplies a verifiable, short-lived sandbox attestation; prose in an agent definition is not an enforcement boundary.

### Prompt and policy composition

The review prompt is generic and contains no Relay-specific product name, payment-domain placeholder list, or duplicated review matrix. It references the trusted policy injected for the current consumer. The policy file is the single source of truth for review categories, severity guidance, lifecycle instructions, data-handling rules, and project display name. The active redactor supplies the placeholder list at run time. Any project-specific prompt language is configuration loaded from the trusted policy/role source, never a hardcoded second matrix in the worker.

## Run data flow

Every consumer follows the same sequence:

1. Select the event/run and establish a trusted source or explicitly declared trusted root. For generic runs, the manifest itself is a trusted control-plane file produced outside PR content and declares `caller-attested` trust.
2. Validate repository identity, exact head SHA, event type, required files, schema versions, and positive limits.
3. Load trusted policy, contract, role, and named context files. Branch-controlled copies never enter this channel.
4. Collect bounded PR/issue/task artifacts and exact-head check-run summaries as untrusted data.
5. Sanitize each artifact, defang delimiter-shaped text, wrap it in a labelled untrusted block, and enforce the shared input ceiling. A complete sanitized diff and trusted role/policy are required; silent partial inputs are errors.
6. Call the model through the configured transport, with server-side token ceilings and post-generation byte ceilings.
7. Validate the trailer, sanitize and UTF-8-truncate the human output, and emit machine-readable artifacts.
8. For review loops, build Schema-1 history and call the pure arbiter.
9. Let the provider adapter publish only what its explicit operator configuration permits. Persisted artifacts contain sanitized outputs and bounded provenance only; raw input, API keys, and full model envelopes are never written to logs or uploaded by default.

## Trust and GitHub workflow behavior

### Two channels, never mixed

Trusted policy, contract, agent role, and context files use the model instructions/system channel. PR diffs, issue bodies, prior comments, check-run names/results, and task input use the user/input channel after sanitization and fencing. The model has no repository, shell, network, or tool access.

### Trusted anchor and policy lag

The privileged GitHub workflow checks out the actual default-branch tip and reads trusted files with `git show <trusted-sha>:<path>`. The worker verifies that checkout and binds every GitHub read and write to the supplied repository identity. A PR changing policy or the context allowlist is reviewed using the previous default-branch policy until that policy change merges; this lag is a safety property and remains unchanged.

### Caller and reusable workflow topology

The consumer repository contains a small caller workflow whose `on:` block is read from the consumer default branch. Its generic PR form declares static `pull_request_target`, `workflow_run`, and manual triggers and invokes the pinned Loopkeeper reusable workflow with `uses: <loopkeeper-repo>/.github/workflows/<entrypoint>.yml@<full-sha>`. Scheduled PR reconciliation is an optional consumer-owned selector with explicit bounded enumeration, not a targetless trigger on the generic caller. The remote entrypoint is declared with `workflow_call`; it does not rely on direct triggers that only exist in its own repository. The caller passes the consumer repository, PR/issue identifiers, expected CI workflow name and file, configuration variables, and explicitly scoped secrets.

The called workflow uses two separate checkouts: the consumer repository at the forge-verified `CONSUMER_TRUSTED_SHA` for policy, contracts, and context, and the Loopkeeper repository at the immutable `LOOPKEEPER_SHA` for Bash/Python code. The workflow verifies both values independently and never lets a runtime input replace either trust root.

The consumer caller sets the top-level least-privilege permissions; a called workflow cannot elevate them. The PR entrypoint needs `contents: read`, `actions: read`, `checks: read`, and write permissions only for the explicitly enabled comment path. Issue triage needs `contents: read` and issue-write only when posting is enabled. The model key is passed only to the model-call step; read-only and arbiter jobs do not inherit it.

### Review coverage invariant

Every open PR head handled by the configured GitHub integration receives at least one review result and at most one current-head result after idempotent replacement. CI sequencing may delay review but may never delete coverage.

- `workflow_run: completed` handles the named CI workflow only when the source event is `pull_request`, the run head SHA is exact, and the PR is still open/current. GitHub's `workflow_run.workflows` trigger entries are display names, while discovery may use a file path. Setup and runtime validation resolve the display name through `GET /actions/workflows` to a unique workflow id and require that its `path` matches the configured file; the probe then queries that resolved id. A missing, ambiguous, or mismatched name/file mapping is a configuration failure and must not defer review; the fallback path reviews instead.
- `opened` and `synchronize` remain an exclusive fallback for conflicting PRs where GitHub creates no pull-request CI run. The worker waits only within a bounded discovery window, defers when a matching run exists, and reviews when no run appears or lookup fails.
- Manual, reopened, and ready-for-review paths read currently completed exact-head checks once without polling. An optional scheduled selector follows the same rule after it has resolved a bounded set of explicit, open PR targets.
- A later CI completion can replace a no-CI fallback review for the same head with exact-head evidence.
- Concurrency groups are keyed by PR on every trigger; no run-id fallback may silently disable cancellation.

The default idempotency markers are `loopkeeper-pr-review:<pr>:<head_sha>` for reviewer output, `loopkeeper-issue-triage:<issue>` for triage output, and `loopkeeper-arbiter:<pr>:<head_sha>:<decision_digest>` for each disposition event. Reviewer output also carries a trusted evidence-state field, `fallback` or `ci`, generated by the adapter from the trigger path rather than copied from model text. A repeated fallback suppresses when the same marker and bot author already exist; a CI-completion run explicitly replaces an existing same-head `fallback` comment in place, changing its state to `ci`, and suppresses only when a same-head `ci` result already exists. The reviewer comment upsert runs in the PR-scoped writer concurrency group, re-reads before create, and reconciles any concurrently discovered duplicate to the single canonical comment, so fallback/CI paths cannot leave two current-head results. Arbiter publication is separate and append-only: an exact same-PR/head/decision digest suppresses, while a changed decision or head creates a new immutable event; historical arbiter comments are never patched. Legacy two-part arbiter markers are read-only compatibility records. The Relay adapter may also recognize the corresponding legacy markers during migration.

The privileged path executes no PR code, downloads no PR-controlled artifacts or caches, and exposes the model key only to the model-call step. Check-run summaries are bounded, sanitized untrusted evidence; a green check never proves correctness.

### Writes and supply chain

GitHub writes require `LOOPKEEPER_OPERATOR=1` in the CLI and inside each networked write function. `--post` creates an immutable bot-authored `loopkeeper-arbiter:<pr>:<head_sha>:<decision_digest>` event, identified by both marker and author login. An exact decision retry is suppressed; a changed decision or head creates a new event; no historical arbiter comment is patched. The Relay compatibility adapter may read legacy `codex-arbiter:<pr>` and two-part Loopkeeper markers but never edits them. `--gap-issues` is a second explicit opt-in and is never passed by the default workflow. Gap issue creation also requires a configured existing label from `LOOPKEEPER_GAP_LABEL`; if the label is absent or cannot be verified, Loopkeeper emits an explicit `GAP_LABEL_UNAVAILABLE` result and performs no issue write. Consumer setup may create that label before enabling the flag.

Every GitHub Action and reusable workflow reference is pinned to a full commit SHA. The release process updates pins with version comments and documents the matching package/workflow version. PyPI consumers install an exact `loopkeeper==X.Y.Z` version with a published hash (or an equivalent trusted lock/provenance record); unbounded `pip install loopkeeper` is not a supported production setup.

## CLI contract

The executable exposes these stable commands:

```text
loopkeeper review    --manifest review.json    --output-dir artifacts/
loopkeeper triage    --manifest issue.json     --output-dir artifacts/
loopkeeper agent     --manifest agent.json     --output-dir artifacts/
loopkeeper arbitrate --history history.json    --output decision.json
```

Manifests are JSON and have `manifest: 1`, a `kind`, a `trust` object, trusted file references, bounded untrusted artifact references, and explicit output/configuration overrides. A review manifest includes `trust.repo`, `trust.head_sha`, `trust.trusted_revision`, `trust.mode`, required `trust.verification` when `trust.mode` is `caller-attested`, `trusted.policy`, optional `trusted.contract`, optional `trusted.context_files`, `untrusted.metadata`, `untrusted.diff`, optional `untrusted.previous_review`, optional `untrusted.checks`, and the requested limits. Triage includes the trusted policy/file index and an issue artifact. Agent includes the trusted role file, agent name, and task artifact. Arbitration includes a Schema-1 history file and the arbiter thresholds. Complete examples and a JSON Schema ship with the CLI.

A minimal review manifest is structurally explicit about its trust boundary:

```json
{
  "manifest": 1,
  "kind": "review",
  "trust": {
    "mode": "caller-attested",
    "repo": "example/project",
    "head_sha": "0123456789abcdef0123456789abcdef01234567",
    "trusted_revision": "fedcba9876543210fedcba9876543210fedcba98",
    "verification": {"method": "ci-signed-manifest", "record": "trusted/verification.json"}
  },
  "trusted": {
    "policy": "trusted/review-policy.md",
    "contract": null,
    "context_files": []
  },
  "untrusted": {
    "metadata": "input/pr-metadata.json",
    "diff": "input/diff.patch",
    "previous_review": null,
    "checks": null
  },
  "limits": {"max_input_bytes": 200000, "max_output_bytes": 50000},
  "output_dir": "artifacts"
}
```

The manifest is a trusted control-plane file and must be created outside PR-controlled content. Trusted and untrusted paths are resolved under separate declared roots; `trust.verification.record` is trusted-path material and is never read from the untrusted root. Absolute paths, `..` escapes, control characters, and symlinks that leave the declared root are rejected. Every file is read through a byte cap before parsing. Untrusted inline material is never accepted as trusted policy, contract, role text, endpoint, redactor, or write configuration.

Stable artifact names are:

- Review: `review.md`, `trailer.json`, and `history.json` when collection is requested. `trailer.json` always records `valid`, `schema`, and a bounded error code/message when no valid trailer was returned.
- Triage: `triage.md` and `triage.json`.
- Agent: `agent.md` and `agent.json`.
- Arbiter: `decision.json` and a rendered `arbiter-comment.md`.
- Optional proposed gaps: `gap-issues.json` as versioned, sanitized intents, never an implicit write.

Machine-readable artifacts include `artifact: 1`, `kind`, `trust_mode`, repository/head provenance when applicable, and a status field. They never contain raw model envelopes, API keys, or unsanitized input. A caller may upload sanitized artifacts explicitly, but Loopkeeper does not upload or log them by default.

Completed business dispositions, including escalation, `NEEDS-HUMAN`, and an invalid review trailer that was retained as an invalid round, exit successfully with code `0`; callers inspect the artifact status. Invalid manifests/configuration exit `2`, transport failures exit `3`, and trust/security refusals exit `4`. The GitHub compatibility adapter may translate these to Relay's legacy exit codes. No command implicitly blocks a merge.

### Relay compatibility boundary

Compatibility is isolated to the Relay adapter. It may translate `CODEX_*`, `ARBITER_*`, `RELAY_AGENT_*`, and `OPENAI_API_KEY` into their `LOOPKEEPER_*` equivalents, parse legacy `codex-verdict`/`codex-pr-review`/`codex-arbiter` markers, and preserve legacy exit codes while Relay migrates. The core package, new reusable workflows, new prompts, and new comments emit only Loopkeeper names. This prevents the extraction from silently turning Relay's internal namespace into a public API.

## Configuration and versioning

- Markdown is the human-authored format for review policy and per-branch contracts.
- A trusted context allowlist names repository-relative files; the allowlist and file contents are read from the trusted source and are bounded by count and total bytes.
- A contract is located at `docs/contracts/<slug>-<sha256(branch)[:12]>.md`, where every `/` in the branch name becomes `-`. Its first non-empty line must be `# Contract: <exact branch name>`. The file is read only from the consumer default-branch trusted revision. If it is absent or the header names another branch, the effective contract is empty. Generic callers must provide the already-resolved trusted contract path or explicitly omit contracts.
- Public environment variables use the `LOOPKEEPER_` prefix for model, API style/base URL, reasoning effort, input/output ceilings, request/job timeouts, bot identity, check-run limits, redactor, operator mode, gap label, and arbiter thresholds. The threshold variables are `LOOPKEEPER_SOFT_GATE`, `LOOPKEEPER_HARD_CAP`, `LOOPKEEPER_STUCK_P1_ROUNDS`, and `LOOPKEEPER_UNVERIFIABLE_ROUNDS`; each is a strict positive integer with the defaults stated above. CLI flags override environment values. The GitHub compatibility adapter maps the existing `CODEX_*`, `ARBITER_*`, and `RELAY_AGENT_*` variables to the public names; those legacy names are not part of the new package contract.
- Python support is 3.10 through 3.12 for v1. Runtime dependencies remain zero.
- SemVer governs the PyPI package. Schema versions, CLI manifest versions, artifact names, exit codes, and reusable-workflow inputs are compatibility surfaces and receive explicit compatibility notes.
- A package release and reusable workflow release are built from the same tag and published with checksums and provenance. Consumer examples pin an immutable workflow SHA and install an exact package version with a hash or trusted lock record. The repository includes a license and attribution/provenance notice before the first public release, and publication is gated on package-name/registry availability checks.

## Testing strategy

The extraction starts by porting the complete Relay loop test/fixture surface rather than reimplementing behavior from memory. The existing Bash worker's stubbed GitHub harness and mutation-tested security guards are preserved. A frozen reference harness or golden-output set is pinned to `e834773`; parity tests do not depend on a mutable Relay checkout.

Required layers are:

- Pure arbiter fixtures covering every rule, identity/lifecycle transition, malformed/ambiguous history, thresholds, proposed gaps, and exact disposition vocabulary.
- Differential parity tests against Relay fixtures at `e834773` for schemas, arbiter decisions, sanitization, transport budgets, and agent channel separation.
- Security corpus tests for credential/identifier redaction, delimiter injection, dynamic placeholders, HTML/Markdown-safe rendering, UTF-8 truncation, and plugin fail-closed behavior.
- Transport and model-binding tests for both wire styles, endpoint validation, timeouts, output ceilings, retention flags, settings-based model IDs, and rejection of unsupported/version-pinned model shapes.
- CLI contract tests for manifest validation, stable artifacts, schema rejection, and exit codes.
- GitHub shell/workflow tests for caller-versus-reusable topology, two independent checkouts and SHA verification, least-privilege permissions, SHA-pinned actions, trusted `git show` reads, exact-head check evidence, workflow-run filtering, trigger/probe equality, conflicting-PR fallback, marker+author suppression, append-only arbiter events and exact-retry suppression, opt-in gap issues, no PR-code execution, and no artifact/cache downloads.
- Package build/install tests for clean Python 3.10–3.12 environments and matching source/workflow release versions.
- Manifest/artifact tests for path confinement, symlink escape, trust-mode labeling, invalid-trailer retention, redacted gap intents, and no raw-input logging or upload.
- Mutation tests for every guard added on the security and coverage paths.

## Release and adoption

1. Create the standalone Loopkeeper repository, license/attribution files, and source ledger; port the source, schemas, fixtures, and tests with parity checks.
2. Add package metadata, CLI entry point, separate `pr-review`/`issue-triage` reusable workflow entrypoints, consumer caller examples, release hashes/provenance, and compatibility documentation.
3. Run the generic CLI against fixture manifests and run the GitHub adapter in read-only summary mode with separate consumer and Loopkeeper checkouts.
4. Dogfood a real PR and manually verify CI sequencing, no-CI fallback, exact-head evidence, append-only arbiter disposition events, comment idempotency, and absence of unintended writes.
5. Enable operator posting only after the real-PR evidence is reviewed. Keep gap issues disabled and require exact package/workflow pins for every consumer.
6. Migrate Relay in a separate consumer PR by pinning the Loopkeeper workflow/release, adding policy/contract/context configuration, and using the legacy namespace compatibility adapter only as needed.
7. Add additional consumers through the same caller-workflow/reusable-entrypoint plus policy contract, or through the install-and-run-CLI contract.

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
| A reusable workflow confuses tool code with consumer policy | The caller passes separate Loopkeeper and consumer revisions; the called workflow performs two independent checkouts and verifies both. |
| Generic CI overclaims forge-level trust | Generic artifacts carry `caller-attested` trust mode and the manifest requires an external verification record; GitHub-only guarantees are not claimed. |
| Package and workflow versions drift | They are built from the same tag, parity-tested, checksummed, and consumed by immutable SHA. |
| A PyPI install is replaced or silently upgraded | Production examples require exact versions plus hashes/provenance and a trusted index/lock policy. |
| More artifacts increase model input or cost | Shared complete-input ceiling remains authoritative; check/context counts and byte caps are independently bounded. |
| `unverifiable` becomes a suppression path | It never resolves a finding, requires a named missing artifact, routes high severity to a human, and escalates after the configured cap. |
| Sanitized artifacts leak through CI logs or uploads | Raw input and model envelopes are never logged or uploaded by default; persisted artifacts are bounded, sanitized, and explicitly opt-in. |
| Convergence works in tests but not in production | A real-PR dogfood gate is required before enabling automatic comments; production status is documented as designed-and-tested until then. |

## Acceptance criteria

The design is successful when all of the following hold:

- A new GitHub project can adopt Loopkeeper by adding a small caller workflow for each enabled integration, pinning the matching reusable workflow SHA, and supplying trusted policy/contract/context configuration; it does not copy the worker or arbiter source.
- Every open PR head handled by the configured GitHub integration receives at least one review result, including a conflicting head for which CI never starts; a later exact-head CI result replaces the fallback in place, and duplicate trigger paths leave at most one current-head result.
- A local or non-GitHub CI project can install `loopkeeper` from PyPI, run the documented JSON-manifest CLI, and consume deterministic JSON/Markdown artifacts without GitHub credentials.
- Generic runs identify themselves as `caller-attested`, require a verified `trust.verification` record bound to the manifest digest, fail with exit `4` when that record is missing or invalid, and cannot claim the GitHub adapter's independent forge verification.
- PR review, issue triage, and headless agents share one transport and the same sanitize-then-wrap trust boundary.
- The pure arbiter returns a deterministic disposition for every valid history, fails closed for invalid/ambiguous history, and the configured review triggers bound repeated `CONTINUE` rounds with a hard cap so the loop eventually reaches a terminal or human-escalation state.
- Finding accounting preserves `NEW`/`OPEN`/one-time `RESOLVED` semantics, and `unverifiable` never suppresses a finding.
- Exact-head CI evidence and trusted context files reach the reviewer without executing PR code or moving PR-controlled text into trusted instructions.
- Reviewer comments are idempotent, arbiter disposition history is append-only with exact-retry suppression, gap issues are opt-in and require a verified configured gap label, and all writes are explicitly operator-gated.
- The published package has zero runtime dependencies, is installed with an exact verified version, and the extracted parity, security, workflow, package, and CLI suites pass on supported Python versions.
