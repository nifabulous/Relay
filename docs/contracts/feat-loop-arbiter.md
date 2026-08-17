# Contract: feat/loop-arbiter

## Goal

Give the PR review loop a deterministic arbiter, reviewer finding-memory, a
durable gap ledger, and a research-agent dispatch protocol, so the loop can
distinguish "defect — fix it" from "limitation of the approach — stop and
re-scope" instead of iterating on a critic/fixer pair that never terminates
on its own (plan: `docs/superpowers/plans/2026-08-17-loop-engineering.md`,
tasks T1-T6).

## Invariants

- **The arbiter's termination logic is deterministic Python — no model
  call.** The component whose job is to terminate arguments must not be
  arguable-with (plan §6, §9).
- **The reviewer's BLOCK/NEEDS-FOLLOW-UP verdict remains advisory input
  only.** The arbiter computes recommendations from findings, states, and
  severities, not from the bot's verdict string (plan §6.2, decision §2.3).
  No reviewer-prompt retraining is in scope for this wave.
- **A contract binds only from the default-branch checkout.** The reviewer
  and arbiter trust a contract only as read from `main`; a branch's own copy
  is untrusted input, same as the PR diff (`docs/contracts/README.md` §4.1).
  This contract is itself subject to that rule once merged.
- **No contract on `main` = an empty contract.** Nothing is out of scope and
  no limits are accepted until a contract merges; every arbiter termination
  rule still functions without one (`docs/contracts/README.md`, plan §4.1).
- **A dropped finding is never a resolution.** An open finding missing from
  the latest trailer's accounting produces `CONTINUE` + `needs-human`, never
  a merge recommendation (plan §5, §6.1).
- **Malformed or unknown-schema input fails closed.** A missing, unparseable,
  or unrecognized-schema trailer, or an ambiguous identity/history
  (duplicate bot comments for one head SHA, a renamed slug reusing an open
  `(file, cat)`), never produces a merge recommendation (plan §6.1).
- **`RESOLVED` on a P1 never yields `MERGE-CLEAN` by itself.** It becomes
  `pending-human`; a maintainer must review the cited evidence against the
  current head (plan §5, §6.1).
- **Merge stays a human action.** The arbiter recommends; it never merges,
  and nothing in this wave changes the maintainer pull request completion
  checklist (plan §3, §11; repo `CLAUDE.md`).
- **Gap acceptance stays human.** The poster opens `proposed-gap` issues;
  only a maintainer relabel to `accepted-gap` — or a human-approved contract
  decision — makes a gap acceptable. A P1 gap additionally requires an
  explicit human line in the contract (plan §6.4, §11).
- **Gap-issue bodies are sanitized and size-bounded, never verbatim.**
  Findings quote diff content, so gap issues pass through
  `codex_sanitize.py` and a size bound before posting, per the repository's
  data-handling policy (plan §6.4).
- **Local arbiter runs are read-only by default.** Posting is an explicit,
  separately opted-into operator mode; it is not the default local behavior
  (plan §6, §6.3).
- **Model slots stay swappable.** Any Claude agent introduced by T6 declares
  a tier alias (`opus`/`sonnet`/`haiku`/`fable`), never a versioned model ID
  (plan §9.1).

## In scope

- **T1** — the contract convention (`docs/contracts/`, this format, the
  §4.1 trust rule) and the round/trailer schemas (`docs/loop/schemas.md`).
  Documents only.
- **T2** — reviewer structured output: NEW/OPEN/RESOLVED lifecycle with full
  accounting, structured trailer (`file`, `cat`, `id`); prior review
  sanitized then placed in the untrusted channel.
- **T3** — the arbiter as collector / pure core / poster, `--history` mode,
  and the §6.3 fixture suite (replaying PRs 21/22/24; omission, rename,
  malformed, out-of-order histories; no-contract mode).
- **T4** — the durable gap ledger: sanitized, size-bounded `proposed-gap`
  issues with idempotency markers; maintainer relabel to `accepted-gap`.
- **T5** — contract injection into review instructions, read from the
  default-branch checkout.
- **T6** — the research dispatch protocol (§7.1), the five research-agent
  definitions, and the model-drift test (§9.1).

## Out of scope

- **T7 (ssi-autopilot deterministic fold, §8.2).** DECISION: sequenced after
  this wave in the plan's build order (`docs/superpowers/plans/2026-08-17-loop-engineering.md`
  §10) because it depends on nothing this contract delivers and is
  independently useful on its own schedule. Tracked as the plan's T7 line
  item; no issue opened yet.
- **T8 (arbiter promotion into CI).** DECISION: gated on decision §2.2 —
  promotion happens only after the arbiter's local recommendation matches
  the human merge decision on action and cited rule, on two consecutive PRs
  (decision §2.7). This wave keeps the arbiter local-only; CI promotion is
  a separate, later contract once that agreement is observed. Tracked as
  the plan's T8 line item.
- **T9 (new producers: corridor expander, proposal agent, gap miner).**
  DECISION: a later wave in the plan's build order (§10); this contract's
  goal is the arbiter/memory/ledger/agent foundation, not new producer
  loops. Tracked as the plan's T9 line item.
- **Any model-based gap acceptance.** DECISION: permanently out of scope,
  not just for this wave — gap acceptance is a human relabel action, and a
  P1 gap additionally requires an explicit human line in the contract (plan
  §6.4, §11). No future wave under this contract may change this without a
  new, separately reviewed contract decision.

## Accepted limits

- **Local posting is best-effort, not exactly-once.** A local operator who
  explicitly enables `--post` accepts best-effort marker dedupe rather than
  the exactly-once guarantee the serialized CI writer provides (plan §6.3,
  §6.4).
- **The arbiter runs locally this wave.** It is not wired into CI as part of
  this contract; CI promotion is out of scope above and gated on decision
  §2.2/§2.7.
