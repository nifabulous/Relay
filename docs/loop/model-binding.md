# Model binding — where every agent slot's model comes from

Loop-engineering plan §9.1 promises that swapping any model is a settings
change, never a refactor. This is the binding table that promise resolves
to: for each slot, where the default lives, what overrides it, and what
keeps the binding honest.

No slot names a versioned model id anywhere a drift test can't see one
(`tests/test_model_pinning.py` bans versioned Claude ids outright, and
hardcoded vendor ids outside a `|| '<fallback>'` shape).

## Automation slots (run in CI)

| Slot | Default | Binding point | Notes |
|---|---|---|---|
| PR reviewer | `gpt-5.3-codex` | Repo **Variable** `CODEX_MODEL` (workflow fallback) | Also `CODEX_REASONING_EFFORT`, byte/token budgets, timeouts |
| Issue triage | `gpt-5.3-codex` | Repo **Variable** `CODEX_MODEL` (workflow fallback) | Same shape as the reviewer |

Both slots call through `scripts/codex_responses.py`, whose endpoint and
wire format are themselves bound, not hardcoded:

| Setting | Default | Binding point |
|---|---|---|
| Wire style | `responses` | `--api-style` flag, else `CODEX_API_STYLE` (`responses` \| `chat`) |
| Endpoint URL | OpenAI per-style default | `--api-url` flag, else `CODEX_API_BASE_URL`, else per-style default |

`chat` speaks the OpenAI-compatible chat completions shape most third-party
providers and gateways expose, so a cross-vendor swap is: set
`CODEX_MODEL` to the provider's model id, `CODEX_API_BASE_URL` to its
endpoint, and put its key in the `OPENAI_API_KEY` secret (used as a bearer
token). The base URL must be https outside loopback — the key travels as a
header — and may not carry a query or fragment.

## Research agents (`.claude/agents/*.md`)

Five definitions: `domain-researcher`, `feasibility-researcher`,
`precedent-researcher`, `impact-researcher`, `verifying-executor`.

- **Interactive dispatch (default).** Claude Code reads the frontmatter —
  `model:` is a tier alias (`opus`/`sonnet`/`haiku`/`fable`), never a
  versioned id — and dispatches via its Agent tool. Changing a tier is a
  one-line edit to the definition.
- **Headless dispatch (any provider).** `scripts/agent_runner.py` executes
  the same definition through the same transport as the reviewer: the body
  after the frontmatter rides the trusted instructions channel, the task
  input rides the user channel, and the model is bound by environment:

  | Precedence | Source | Example |
  |---|---|---|
  | 1 | `--model` flag | `--model grok-4` |
  | 2 | Per-agent env, derived from the filename | `RELAY_AGENT_DOMAIN_RESEARCHER_MODEL` |
  | 3 | Shared env for all agents | `RELAY_AGENT_MODEL` |

  No model bound at all is a loud failure naming every source it tried —
  an agent silently running on whatever the process happens to have is the
  failure mode this chain exists to prevent.

  The frontmatter `model:` alias is ignored on this path: it has no
  meaning outside Claude Code, and pretending otherwise would make a tier
  word look like a binding.

## What stays true regardless of dispatcher

- The trusted/untrusted channel split: role prompts and policy ride the
  instructions/system channel; PR text, issue text, and task input ride
  the user channel inside untrusted blocks. A hostile payload cannot
  present itself as policy on either wire format.
- `store: false` on the Responses API (retention is a decision, not an
  inherited default); chat completions does not retain by default and
  sends no store flag.
- Output ceilings are enforced twice: server-side token caps and
  post-generation byte checks, on both wire styles.
