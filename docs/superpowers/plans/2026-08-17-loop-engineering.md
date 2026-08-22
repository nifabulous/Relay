# Loop engineering: arbiter, research agents, and producer loops

Status: revision 4, addressing three plan-review rounds (7 + 6 + 2 findings) ·
Decisions §2 locked by the owner.

## 1. Why this plan exists

Three PRs in one session produced clean evidence of what the current loop can
and cannot do:

| PR | Scope | Review trajectory | Outcome |
|----|-------|-------------------|---------|
| 22 | timeout configuration (narrow, achievable) | BLOCK ×3 → NO-ACTIONABLE-FINDINGS | converged in 4 rounds |
| 21 | classify 738 SSI rows from evidence | BLOCK ×7 | human merged over the verdicts |
| 24 | authorization at the data layer (unachievable there) | 21 rounds: 16 BLOCK, 5 NEEDS-FOLLOW-UP, 0 clean | human stopped it |

The loop today is a **producer** (fixer) and a **critic** (Codex reviewer),
both competent, with nothing that can rule on scope. That pair is
non-terminating by construction: the critic always finds something, the fixer
always fixes it. PR 24's recurring P1 ("`published` is self-assertable") was
*correct every round* — and unsatisfiable in the layer under review, because a
data layer cannot know caller identity. No round could ever end it.

Second-order failure, also observed: the fixer degrades under iteration. In
the later PR 24 rounds roughly half the findings were defects in the previous
round's fix (three remediations written but never executed, two dialect bugs,
one silent data-corruption bug). Each patch adds surface for the next round.

Two things are missing:

- an **arbiter** that distinguishes "defect — fix it" from "limitation of the
  approach — stop and re-scope";
- **research and producer capacity** so that stopping is a hand-off, not an
  abandonment, and the pipeline has an origination side, not only a
  correction side.

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Soft gate | **round 5** (`ARBITER_SOFT_GATE=5`, configurable) |
| 2 | Where the arbiter runs | **local first**; promote to CI after its recommendation matches the human decision on two consecutive PRs |
| 3 | Reviewer verdict semantics | **advisory** — the bot keeps saying BLOCK freely; the arbiter reinterprets. No reviewer-prompt retraining |
| 4 | Where memos live | **files** under `docs/research/`, linked from issues |
| 5 | Proposal agent cadence | **on demand** for now; revisit once the gap ledger has content worth mining |
| 6 | Memo retention | defer — archive policy waits until volume is a real problem |
| 7 | Arbiter CI-promotion criterion | agreement means matching the human decision on **action and cited rule**, on two consecutive PRs — an impatience-merge does not count |

## 3. The target state machine

```
             ┌────────────────────────────────────────────────┐
             ▼                                                │
  SCOPE ──► CONTRACT ──► BUILD ──► REVIEW ──► ARBITER ──► ESCALATE-TO-SCOPING
 (research    (merged      (fix     (codex     │  │
  + producer  to main,      loop)    round)    │  ├──► CONTINUE (next fix round)
  agents)     then binds)                      │  ├──► MERGE-CLEAN
                                               │  └──► MERGE-WITH-GAPS (+ proposed issues;
                                               │                       human acceptance pending)
                                               ▼
                                        human clicks merge
```

Terminal states are decisions, not exhaustion. Merge itself stays human — the
repo's maintainer checklist already requires that and this plan does not
change it. The arbiter *recommends*; it never pushes the button.

## 4. The contract (fixes the loop at its input)

PR 24's reviewer kept re-raising the same P1 partly because the PR description
*claimed* enforcement the code could not provide. The reviewer was holding the
diff to its stated contract, and the stated contract was wrong.

Every loop-managed PR gets a contract file: `docs/contracts/<slug>-<hash>.md` (12-hex sha256 prefix of the branch; see docs/contracts/README.md).

```markdown
# Contract: <branch>
## Goal            — one sentence
## Invariants      — what must remain true (flag-off behavior, retry safety…)
## In scope        — the deliverable
## Out of scope    — with the DECISION that put it there, and where it went
                     (issue link, follow-up plan)
## Accepted limits — residual risks the owner has signed off on
```

### 4.1 Trust rule: a contract binds only from `main`

A contract that rode in on the PR branch is PR-controlled text; letting it
into the reviewer's trusted channel would let any branch declare its own
findings out of scope. The fix is already built: **the review workflow checks
out only the trusted default branch** (that is how PR 15 shipped it), so the
contract read from that checkout is `main`'s version *by construction*. A new
or amended contract therefore lands first as its own small, maintainer-merged
PR — which is exactly the "human signs the scope decision" step §11 requires,
now enforced by plumbing rather than convention.

What goes where:

| Content | Channel |
|---|---|
| Repository review policy (`.github/codex/review-policy.md`) | trusted `instructions` |
| Contract, as read from the default-branch checkout | trusted `instructions` |
| PR diff, PR body, branch copy of the contract (if it differs) | untrusted `input`: `codex_sanitize.py` → `codex_untrusted.py` |
| Previous review comment (for repeat-marking, §5) | untrusted `input`: `codex_sanitize.py` → `codex_untrusted.py` |

The prior review comment is bot-authored, but its findings quote PR-controlled
text verbatim, so it goes in the untrusted channel like everything else that
can carry attacker bytes — and it passes through **both** filters in order:
`codex_sanitize.py` redacts (the untrusted wrapper only defangs delimiters; it
performs no redaction), then `codex_untrusted.py` fences. The instructions tell the reviewer: a divergence
between the branch's contract copy and the bound one is itself a finding.

Rollout compatibility: no contract on `main` = an empty contract. Nothing is
out of scope, no limits are accepted, and every arbiter rule still functions
(§6 depends on contracts only for gap acceptance, not for termination).

## 5. Finding memory

The arbiter needs to know whether a finding is new. Text similarity is
unreliable; the reviewer does the matching — it is already the component
reading both texts — but per §6.1 the arbiter **verifies rather than trusts**
what comes back.

Change to `scripts/codex_review_pr.sh`: include the previous marked review
comment in the untrusted input (§4.1), and require the reviewer to run a
**full accounting**: every finding it has previously raised on this PR must
appear in the new trailer with a lifecycle state. Silence is not resolution —
a finding the model simply stops mentioning must never read as fixed.

```
NEW        first appearance
OPEN       previously raised, still present (with one line on whether the
           last fix attempt changed anything)
RESOLVED   previously raised, verified fixed in this diff (with the evidence)
```

The machine-readable trailer carries structured fields, not just a slug:

```json
<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[
  {"sev":"P1","state":"OPEN","file":"app/models.py","cat":"authorization",
   "id":"published-self-assert"},
  {"sev":"P2","state":"NEW","file":"alembic/versions/20260816_ssi_verified_by.py",
   "cat":"tz-consistency","id":"utc-preflight"},
  {"sev":"P2","state":"RESOLVED","file":"scripts/codex_sanitize.py",
   "cat":"redaction","id":"cookie-header",
   "evidence":{"files":["scripts/codex_sanitize.py"],
              "verification":"tests/test_codex_sanitize.py::test_cookie_header"}}]} -->
```

`schema` is versioned so the arbiter can refuse trailers it does not
understand. Note what is *not* here: no `rounds` count. The reviewer marks
identity and lifecycle; the arbiter counts, verifies the accounting, and
derives identity (§6.1) — `id` is a proposal, `file`+`cat` are what the
arbiter checks it against. `RESOLVED` always carries an evidence object. The
arbiter checks that every evidence file is changed in the current head and
that the verification reference is non-empty. This is a bounded consistency
check, not semantic proof: a P1 resolution therefore becomes
`pending-human` and can never produce `MERGE-CLEAN` by itself. A maintainer
decides whether the cited evidence actually closes a P1 while reviewing the
same head.

## 6. The arbiter

New: `scripts/codex_arbiter.py`. **Deterministic Python — no model.** The
component whose job is to terminate arguments must not be arguable-with. Per
decision §2.2 it runs locally first and moves into CI after agreeing with the
human outcome on two consecutive PRs (decision §2.7 defines agreement).

Three parts with hard seams, because "a pure function" and "a CLI that takes
a PR number" are different interfaces and conflating them would make the
tests lie:

- **Collector** — GitHub API → validated history JSON (canonical comments,
  trailers parsed, schema-checked). The only part that touches the network.
- **Core** — `(history JSON, contract) → (recommendation, cited rule,
  proposed gaps)`. Pure; every fixture in §6.3 tests this and only this.
- **Poster** — recommendation → PR comment and `proposed-gap` issues. The
  only part that writes.

`codex_arbiter.py <pr>` composes collector and core and prints a recommendation;
`--history <file>` runs core alone, which is how CI and local runs stay
byte-identical with the tests. Posting is an explicit `--post` operation owned
by the CI job; local runs are read-only by default and refuse `--post` unless
the caller opts into a separate, best-effort operator mode.

### 6.0 Canonical history input

The collector emits a versioned JSON document. The core accepts only this
shape, so the network-facing collector and the pure decision function cannot
silently drift:

```json
{
  "schema": 1,
  "repo": "owner/name",
  "pr": 24,
  "current_head_sha": "40-hex-head-sha",
  "current_diff_files": ["app/models.py"],
  "comments": [
    {
      "comment_id": 12345,
      "created_at": "2026-08-17T09:00:00Z",
      "author_login": "github-actions[bot]",
      "head_sha": "40-hex-head-sha",
      "marker": "codex-pr-review:24:40-hex-head-sha",
      "body": "sanitized comment body",
      "trailer": {"schema": 2, "verdict": "BLOCK", "findings": []}
    }
  ]
}
```

The collector requires a valid PR number, repository, SHA, marker, author,
RFC-3339 timestamp, and zero or one trailer per canonical comment; zero is
retained as an invalid round and more than one is malformed. It sorts by
`created_at`, then `comment_id` as a stable tie-breaker. Two bot comments for
the same PR head SHA are an ambiguous history and make the whole disposition
`needs-human`; the collector never silently chooses one. A comment with no
valid trailer remains in history as an invalid round, counts toward the hard
cap, and prevents merge recommendations until a later valid round is
available. `current_diff_files` is the sanitized path set used for the bounded
`RESOLVED` evidence check above; it is not treated as proof of semantic
correctness.

### 6.1 What the arbiter trusts, and what it derives

Model-authored state is input, never authority:

- **Rounds are counted, not read.** A round = one canonical review comment:
  author is `CODEX_BOT_LOGIN` (the identity check shipped in PR 15), body
  carries the `codex-pr-review:<pr>:<sha>` marker, ordered by `created_at`.
  The reviewer has no way to claim a round happened.
- **Repetition is derived, not read.** The arbiter parses every trailer in
  its collected history and counts consecutive appearances of each finding
  itself. The reviewer cannot inflate or reset a counter.
- **Identity is validated, not read.** A model-chosen slug is a resettable
  counter: rename `published-self-assert` to `published-forgeable` and
  STUCK-P1 never fires. So the slug is a proposal and `(file, cat)` is the
  check: a finding marked `NEW` whose normalized `(file, cat)` matches a
  still-open finding is **ambiguous identity** → `needs-human`, no merge
  recommendation. A finding marked `OPEN`/`RESOLVED` whose `id` matches no
  open finding → same. The arbiter's own open-set is keyed by
  `(first-round id, file, cat)`; the reviewer can neither fork a finding by
  renaming it nor bury one by merging it into another.
- **Accounting is enforced.** Before any merge rule runs, the arbiter checks
  the latest trailer against its own open-set: every open finding must
  appear as `OPEN` or `RESOLVED`. Any omission → `CONTINUE` +
  `needs-human`. A dropped finding is a question, never a resolution — this
  is the precondition that stops a model that simply forgets (or is induced
  to forget) a P1 from producing MERGE-CLEAN.
- **Malformed input fails closed.** A missing, unparseable, or
  unknown-schema trailer makes the round's disposition `CONTINUE` with a
  `needs-human` flag printed and, in CI, a warning annotation. No merge
  recommendation is ever produced from a round the arbiter could not parse.
- **Resolution is bounded and risk-weighted.** A P2/P3 `RESOLVED` entry must
  reference a changed file from `current_diff_files` and include a non-empty
  verification reference. A P1 `RESOLVED` entry becomes `pending-human`; it
  remains outside the closed set until a maintainer reviews the current head.
  `CLEAN` is impossible while any P1 resolution is pending.
- Head-SHA gaps (force-pushes, skipped rounds) are fine: rounds are the
  comments that exist, in creation order.

### 6.2 Rules — first match wins

Severity vocabulary, to remove the ambiguity that broke revision 1: **P1** is
the highest severity; "minor" below means **P2 or P3, never P1**.

Precondition for every rule below: the §6.1 accounting check passed. If it
did not — an open finding unaccounted for, identity ambiguous, trailer
malformed — the disposition is already `CONTINUE` + `needs-human` and no rule
is consulted. "Findings" in the rules means the arbiter's **open-set** after
applying the latest round, not whatever the latest comment happens to
mention.

1. **CLEAN.** The open-set and pending-human set are empty (everything ever
   raised is `RESOLVED` with bounded evidence) → recommend **MERGE-CLEAN**.
2. **STUCK-P1.** Any P1 whose canonical identity (§6.1) has been open for
   ≥ 3 consecutive rounds (arbiter-counted, rename-proof), with at least
   one fixer push between appearances →
   recommend **ESCALATE-TO-SCOPING**, naming the finding. Three
   correct-but-unresolved rounds means the disagreement is about what the
   change *can* do, not what it does. Evaluated before any merge rule so a
   persistent P1 can never ride out under novelty exhaustion. (Fires on
   PR 24 at ~round 5, saving 16 rounds.)
3. **EXHAUSTED-NOVELTY.** No P1s open, and every open finding is minor
   *and* repeated (seen in an earlier round) → recommend
   **MERGE-WITH-GAPS**. Minor repeats the fixer has already answered are
   scope positions, not new information. This stops the fixer loop; it is
   not merge authorization while the proposed gaps await human acceptance.
4. **SOFT GATE, round ≥ 5** (locked). No P1s open; only minor findings
   remain, new or repeated → recommend **MERGE-WITH-GAPS**. PR 22 reached
   clean in 4; PR 24 was pure repetition by 5.
5. **HARD CAP, round ≥ 10.** Whatever remains → **ESCALATE-TO-SCOPING**
   with the full residual list. A loop this long is evidence the contract is
   wrong, whatever the severities say. Never merge at the cap, so a
   late-arriving stream of real P1s cannot be waved through. (`≥`, not `=`:
   a round must not slip past the cap because a comment failed to parse and
   the counter skipped.)
6. Otherwise → **CONTINUE**.

The bot's own BLOCK/NEEDS-FOLLOW-UP verdict is advisory input only (decision
§2.3); recommendations are computed from findings, states, and severities.

`MERGE-WITH-GAPS` is therefore a terminal recommendation for the automated
fixer loop, not a merge-ready status. The poster creates `proposed-gap`
issues; a maintainer must relabel every proposal to `accepted-gap` (or make a
human-approved contract decision that supersedes it) before merging. Any
unaccepted proposal keeps the final human disposition at `needs-human`.

### 6.3 Test fixtures (written with the arbiter, not after)

The arbiter is a pure function from (comment history, contract) to
(recommendation, cited rule), which makes it exhaustively testable:

- **Replay traces of PRs 21, 22, and 24** — the real comment histories.
  Two outcomes are predictable now and asserted as such: 22 → MERGE-CLEAN at
  round 4; 24 → ESCALATE at ~round 5 citing STUCK-P1. PR 21's history mixes
  recurring P1s with minors, so its expected outcome (most plausibly a
  STUCK-P1 escalation) is pinned when the fixture is first computed, then
  locked as a regression — asserting it here without running the trace would
  repeat the exact mistake this plan exists to stop.
- Malformed trailer → CONTINUE + `needs-human`, never a merge.
- Missing trailer on one round mid-history → that round counts toward the
  cap but contributes no finding states.
- Out-of-order `created_at`, duplicate comments for one SHA, force-push
  SHA gaps; duplicate same-head bot comments resolve to `needs-human` rather
  than an arbitrary winner.
- **A dropped finding**: open P1 simply absent from the latest trailer →
  `needs-human`, never MERGE-CLEAN (the omission attack from review
  round 2).
- **A renamed slug**: same `(file, cat)` reappears as `NEW` under a fresh
  `id` → ambiguous identity → `needs-human`; and the STUCK-P1 counter is
  not reset by the rename.
- An `OPEN`/`RESOLVED` mark whose `id` matches nothing open →
  `needs-human`.
- P1 repeated 3 rounds *alongside* minor repeats → STUCK-P1 wins (the rule-
  ordering regression that review round 1 of this plan caught).
- Poster idempotency (§6.4): re-run after a crash and a force-push between runs
  produce exactly one issue per gap. CI concurrency is tested separately: the
  arbiter job serializes one PR's posters with `cancel-in-progress: false`.
  Local runs do not post by default, so an uncoordinated local process cannot
  race the CI writer. A local operator who explicitly enables posting accepts
  best-effort marker dedupe rather than an exactly-once guarantee.

### 6.4 MERGE-WITH-GAPS mechanics — durable, and human-ratified

The gap record must survive branch deletion and must not depend on write
access the workflow does not have (the review workflow holds `issues: write`
but not `contents: write` — issues are the durable store *and* the writable
one):

- **The `accepted-gap` issue is the canonical ledger.** One issue per gap:
  the finding **sanitized, not verbatim** — the body passes through
  `codex_sanitize.py` and a size bound before posting, because findings
  quote diff content and the repository's data policy
  (`review-policy.md`, "Data handling") forbids storing secrets, IBANs,
  payment payloads, or learner text anywhere, issues included. Plus the
  review-comment permalink (the full context stays where it already is),
  the contract section it falls under, and closing criteria. Issues outlive
  branches and need no push rights.
- **Issue creation is idempotent.** Each gap issue carries a marker,
  `<!-- codex-gap:<pr>:<canonical-finding-id> -->`, and the poster searches
  for the marker before creating. Keyed on the finding, not the head SHA —
  the same gap re-proposed at a later head must land on the same issue, not
  a twin. The CI arbiter job uses a per-PR concurrency group with
  `cancel-in-progress: false`, so the search/create sequence is serialized for
  authoritative runs. Crash-retry and force-pushes are §6.3 fixtures; local
  posting is explicitly best-effort as stated above.
- **A gap is "accepted" only when a maintainer says so.** The arbiter (or
  fixer session) opens the issue as `proposed-gap`; a maintainer relabels to
  `accepted-gap`. The arbiter's MERGE-WITH-GAPS recommendation lists the
  proposals, but it is not merge-ready until every proposal is accepted (or
  superseded by a human-approved contract decision). The human merge decision
  is what ratifies the final set. No model accepts a gap.
- **Contract updates ride the follow-up.** Appending accepted limits to the
  contract on `main` happens in the next maintainer-merged commit (often the
  contract PR for the follow-up work), linking the issues. The issue ledger
  is authoritative in the meantime — a contract that lags is stale, not
  wrong.
- A P1 gap is *proposed* only under STUCK-P1 / HARD-CAP escalation or the
  pending-human hold — never under a MERGE-family recommendation — and
  reaches `accepted-gap` only with an explicit human line in the contract
  (§11).

## 7. Research agents (the ESCALATE path lands here)

Four research types plus one executor. Each is a `.claude/agents/*.md`
definition; each produces the same memo, filed under `docs/research/`
(decision §2.4) and linked from the triggering issue:

```markdown
# Memo: <question>
## Question          — one sentence, decidable
## Evidence          — what was read/run/measured, with file:line / URLs / output
## Verdict           — ANSWERED / ACHIEVABLE / UNACHIEVABLE-HERE / NEEDS-HUMAN
## Recommended scope — what the contract should say as a result
## Confidence        — and what would change it
```

### 7.1 Dispatch protocol (the handoff that revision 1 left implicit)

1. **Trigger.** An ESCALATE recommendation (or a human) opens/uses an issue
   labeled `needs-research`, whose body contains the finding and the
   question in the memo's "Question" shape.
2. **Dispatch.** A human or the fixer session invokes the named agent via
   the Agent tool with a templated prompt: the question, the issue link, the
   finding text, and the output path `docs/research/<date>-<slug>.md`.
   Agents do not self-dispatch.
3. **Return.** The agent writes the memo file; the dispatcher links it in
   the issue and applies `research-done`. Research agents never write
   contracts, close issues, or open PRs — their output is the memo, full
   stop.
4. **Consumption.** A human reads the memo and either writes/amends a
   contract PR (memo verdict `UNACHIEVABLE-HERE` → accepted limit or
   relocation of the goal) or re-enters BUILD (`ACHIEVABLE` → the memo's
   recommended scope becomes contract text).

**Feasibility researcher** — *the one PR 24 needed.*
Trigger: STUCK-P1 escalation. Question shape: "can finding X be satisfied in
layer Y at all?" Method: read the layer's real capabilities, attempt a minimal
spike in a scratch worktree, produce the counterexample or the proof. The memo
PR 24 should have had by round 5: "No — caller identity is not knowable at the
data layer. `verified_by` is attribution. Enforcement belongs in an
authenticated service layer. Contract should say 'attribution, not
authorization'; separate design PR for the service."

**Impact researcher** — *formalizes the check that answered "is SSIRecord ever
input?"* Trigger: before accepting a gap, or before a scope expansion.
Question shape: "who actually calls / consumes X? Is the risk reachable?"
Method: exhaustive caller/consumer trace with file:line evidence, under the
repo's verification discipline (a grep hit is not proof the code is live).
Read-only. Its memo is what lets a maintainer accept a theoretical P1 as a
gap with evidence attached.

**Domain researcher** — *already exists informally inside ssi-autopilot.*
Trigger: the contract needs external facts (payment rails, BIC directories,
SSI publications, API retention policies). Method: web research where every
claim carries a source URL and an as-of date — the same provenance rules the
SSI data enforces.

**Precedent researcher.** Trigger: STUCK-P1 or a design fork during scoping.
Question shape: "how do systems that solved X structure it?" Method: read real
implementations, extract the pattern and its preconditions. Prevents the
failure mode where the fixer invents a mechanism (the promotion marker) whose
known-good shape exists elsewhere (service-layer authorization with derived
identity).

**Verifying executor** — not research; the loop's missing hygiene. Trigger:
any diff containing operator instructions (migration remediation, runbooks,
README commands). Method: execute the instructions **verbatim** in a scratch
environment and report the transcript. Three remediations shipped un-executed
in one session; a rule that "remediation must be run, not read" only holds if
something runs it.

## 8. Producer loops (the autopilot pattern, generalized)

### 8.1 The reference implementation: ssi-autopilot

`scripts/ssi-autopilot/` is the one producer loop that exists, and its shape
is the template. Five parts:

1. **Manifest** (`regions.json`) — what is wanted and what constrains it:
   9 regions, each with target banks, allowed countries and currencies, a
   reserved `ACCT-` masked account block, and a `forbidden_bics` list for
   known mislabels. Global defaults: charge codes, value dates, minimum
   records per bank.
2. **Research protocol** (SKILL.md) — dispatched agents may use only
   bank-published sources (live pages or Internet Archive), must verify BICs
   against the country listing, must flag OCR-corrupted codes, and must
   report NOT SEEDABLE rather than invent. The prompt is pasted verbatim so
   every wave runs under identical rules.
3. **Mechanical validator** (`autopilot.py validate`) — the safety is here,
   not in the model: BIC structure + schwifty, country/currency against the
   manifest, `ACCT-` mask inside the region's block, charge code and value
   date allowlists, source URL shape, ISO past `as_of`, duplicate tuples,
   payload completeness. Research output touches `seed.py` only after an
   empty problem list.
4. **Test-gated fold + commit** (`autopilot.py commit`) — scaffolds the
   region's coverage test, runs the SSI test files, refuses a dirty index,
   commits path-limited (`--only`), one region per commit with a standard
   message.
5. **Cadence** (`autopilot.py maybe-pr`) — a state counter opens a PR every
   N commits (default 10), which then enters the review loop like any other
   PR.

The lesson it encodes: **put the intelligence in research and the safety in a
deterministic gate.** That is why its research tier runs on a mid-tier model
(§9).

### 8.2 Deterministic fold — the gap in step 4, specified

Today the fold is the model hand-editing `seed.py`; the reviewer's standing
finding is correct that nothing binds validated JSON to committed rows. The
fix is a new subcommand with an executable spec:

- **Input:** `autopilot.py fold --results <region>.json` — the same file
  `validate` passed; `fold` re-runs validation first and refuses on any
  problem.
- **Placement:** rows are written into the region's marked section of
  `SSI_RECORDS` (`# ---- <region> (autopilot) ----`), created at the end of
  the list if absent.
- **Canonical order:** within a region, rows sort by
  `(beneficiary_bic, currency, intermediary_bic)` — the natural key.
- **Update rule:** an incoming row whose natural key matches an existing
  autopilot-section row **replaces** it; keys are never duplicated
  (`verify` already enforces this globally).
- **Delete rule:** none. `fold` never removes a row; retiring a record is a
  human edit with its own review.
- **Idempotence:** folding the same JSON twice produces a zero diff — and a
  test asserts exactly that, plus byte-identity of everything outside the
  region's section.
- `BANKS` entries for new beneficiary BICs are folded under the same rules
  (natural key: BIC).

### 8.3 New producers of the same type

Each instantiates the same five parts. Ordered by how much they reuse what
already exists:

**Corridor & scenario expander.** Deepens the simulation's data surface the
way ssi-autopilot deepens SSI: researches real corridor behavior
(correspondent chains, cutoffs, holiday calendars, fee patterns) and folds
corridor rules, fee scenarios, and screening cases. Manifest: corridor list
with per-corridor constraints. Validator: routing invariants, fee arithmetic,
watchlist stays fictional. Nearly a clone of the reference implementation,
different tables.

**Curriculum autopilot.** Deepens Learn: takes a topic the curriculum is thin
on (a rail, a failure mode, a corridor quirk), researches it with citations,
drafts module/lab/case content in the `curriculum.ts` structure. Manifest:
topic backlog with prerequisites and target depth. Validator: content rules
(SIMULATION disclaimers present, `ACCT-` placeholders only, citation per
factual claim, structure matches the frontend's schema) plus the frontend
test suite. Human reviews pedagogy; the gate reviews correctness.

**Proposal agent** — *the "fresh ideas" one.* Where the others deepen, this
originates. On demand (decision §2.5): reads the roadmaps, the `accepted-gap`
ledger, recent review history, and telemetry docs; proposes 3–5 scoped
improvements **as draft contracts** (§4 format), each with a feasibility
sketch and an effort estimate. It builds nothing. Its output is the input to
SCOPE, so the pipeline stops depending on a human noticing what to do next.
Ideas are cheap to reject at contract stage — that is the point of producing
them there.

**Gap miner.** Reads the `accepted-gap` ledger against the current tree and
answers "which accepted gaps have become cheap?" Gaps are accepted under the
conditions of one moment; refactors quietly invalidate those conditions (the
service-layer gap becomes cheap the day a service layer exists). Output:
draft contract per now-cheap gap, linked to the original issue. This is what
keeps MERGE-WITH-GAPS honest over time — accepted never comes to mean
forgotten.

### 8.4 Producer rules

- A producer without a mechanical validator does not ship. The validator is
  written first, TDD-style, before the first research wave.
- Producers open PRs into the same review loop as everything else; no
  producer merges its own work.
- Each producer's manifest is human-owned. Agents propose manifest additions;
  humans commit them.

## 9. Model assignments

Principle: **spend model capability where judgment is the output; spend
determinism where safety is the requirement.** The autopilot proves the
pattern — mid-tier research behind an unpersuadable gate beats frontier
research behind none.

| Component | Model | Effort | Why |
|---|---|---|---|
| Arbiter | **none — deterministic Python** | — | termination logic must not be persuadable |
| Producer validators / fold | **none — deterministic Python** | — | same reason; the gate is the safety |
| Reviewer (critic) | `gpt-5.3-codex` (OpenAI, via `CODEX_MODEL`) | medium | **cross-vendor on purpose**: a different model family has different blind spots than the fixer |
| Fixer (main loop) | Fable 5 / Opus 5 (session model) | high | carries the full change context |
| Feasibility researcher | Opus 5 | high | architecture judgment + a working spike; wrong verdicts cost weeks |
| Precedent researcher | Opus 5 | high | pattern extraction from unfamiliar systems is judgment-dense |
| Proposal agent | Fable 5 | high | origination quality is the entire value; frontier model, low volume |
| Impact researcher | Sonnet 5 | medium | exhaustive tracing rewards breadth and patience over depth |
| Domain researcher | Sonnet 5 | medium | citation volume work; escalate a conflicting-sources case to Opus |
| Producer research waves | Sonnet 5 | medium | volume; the validator carries the safety |
| Gap miner | Sonnet 5 | medium | mechanical cross-reference with light judgment |
| Verifying executor | Haiku 4.5 | low | verbatim execution; judgment is *excluded by design* — a smarter model "fixing" the instructions while running them would defeat the purpose |

Cost shape: expensive models run rarely (escalations, proposals), mid-tier
models do the volume, free deterministic components sit at every safety
boundary. Claude agents bill to the operator's subscription (they run inside
Claude Code sessions); the only API key in the system remains the reviewer's
`OPENAI_API_KEY`.

### 9.1 Model changeability — swapping any model must never require a refactor

The table above is an assignment, not a binding. Three rules keep every slot
swappable, each already proven somewhere in the repo:

1. **Tier aliases, never versioned IDs.** Claude agents declare `model: opus`
   / `sonnet` / `haiku` / `fable` in their frontmatter — one line, one file
   per agent. An alias tracks its family, so a model upgrade changes behavior
   without touching any file, and a *tier* change is a one-line edit.
   Versioned IDs (`claude-opus-5-2026…`) are banned from agent definitions,
   scripts, and workflows.

2. **External models bind through variables, not code.** The reviewer already
   works this way: `CODEX_MODEL` is a repository Actions variable with a
   workflow fallback, so swapping the critic — even cross-vendor — is a
   GitHub settings change, no commit. `CODEX_REASONING_EFFORT` does the same
   for effort. Every future externally-hosted slot copies this shape.

3. **The §9 table is the single registry.** A slot's model is stated in
   exactly two places: this table (intent) and the one config point above
   (binding). Nothing else may name a model. A drift test in the automation
   suite enforces the ban mechanically: scan `.claude/agents/*.md`,
   `scripts/`, and workflows for versioned model-ID patterns and fail on any
   hit.

One exception rule: the executor's frontmatter carries a comment that Haiku
is a *design* choice, not a budget choice, so a well-meaning "upgrade
everything" pass doesn't quietly give the instruction-runner the judgment it
must not have. Deterministic slots are exempt by nature — nothing to swap,
which is precisely their value.

## 10. Build order

Revised to fix the dependency inversion the plan review found (the arbiter
consumed contracts introduced two steps later). Foundations first, consumers
after; each increment still independently useful.

| # | Change | Size | Payoff |
|---|--------|------|--------|
| T1 | Contract convention (`docs/contracts/`, §4 format, §4.1 trust rule) + round/trailer schema (§5) — documents only | docs | everything downstream has a defined input |
| T2 | Reviewer structured output: NEW/OPEN/RESOLVED lifecycle with full accounting, structured trailer (`file`, `cat`, `id`); prior review sanitized then into the **untrusted** channel | prompt + ~30 lines shell | loop gains memory, safely |
| T3 | Arbiter as collector / pure core / poster (§6), `--history` mode, + §6.3 fixture suite (replay PRs 21/22/24; omission, rename, malformed, out-of-order) + no-contract mode | ~250 lines + tests | loop gains termination, proven against history before it judges anything live |
| T4 | Durable gap ledger: sanitized, size-bounded `proposed-gap` issues with idempotency markers; maintainer relabel to `accepted-gap` | ~80 lines | gaps survive branch deletion; acceptance is human; no data-policy leak |
| T5 | Contract injection into review instructions, read from the default-branch checkout | ~10 lines shell | scope decisions reach the reviewer, tamper-proof by construction |
| T6 | Research dispatch protocol (§7.1) + five agent definitions + model-drift test (§9.1) | 5 markdown files + ~30 lines | escalation lands somewhere; models stay swappable |
| T7 | ssi-autopilot deterministic fold per §8.2 spec, with idempotence tests | medium | validated JSON = committed rows |
| T8 | Arbiter into CI (after two PRs of agreement per §2.2 + §2.7) | ~15 lines workflow | every PR gets it |
| T9 | First new producer (corridor expander) + proposal agent + gap miner | medium | pattern generalizes; origination side online |

Sequencing note: T2+T3 deliver the termination behavior on their own — the
no-contract mode means an empty contract merely disables gap-scoping, not the
stopping rules. On the PR 24 history that pair recommends ESCALATE at ~round
5 (rule 2), which the fixture suite in T3 asserts.

## 11. What stays human, permanently

- **Merge.** The arbiter recommends; the maintainer checklist governs.
- **Contract sign-off.** A contract binds only once merged to `main` (§4.1).
  Memos inform it; they do not make it.
- **Gap acceptance.** The loop proposes (`proposed-gap`); only a maintainer
  relabel makes it `accepted-gap`. A P1 gap additionally requires an explicit
  human line in the contract.
- **New scope.** ESCALATE and the proposal agent produce draft contracts; a
  human approves before the loop enters BUILD.
- **Producer manifests.** Agents propose additions; humans commit them.

## 12. Review log

- **2026-08-17, revision 1 review (DONE_WITH_CONCERNS, 7 findings)** — all
  seven applied in revision 2: STUCK-P1 reordered above novelty exhaustion
  and "minor" defined to exclude P1 (§6.2); contracts bind only from the
  default-branch checkout and prior reviews moved to the untrusted channel
  (§4.1); the arbiter now derives rounds and repetition from canonical bot
  comments and fails closed on malformed trailers (§6.1); gap ledger moved to
  issues — durable and within the workflow's `issues: write` — with human
  ratification via relabel (§6.4); build order re-sequenced foundations-first
  (§10); hard cap is `round ≥ 10` with round counting defined (§6.2 rule 5);
  research dispatch and deterministic fold given executable specs (§7.1,
  §8.2).

- **2026-08-17, revision 2 review (6 findings)** — all six applied in
  revision 3: findings gained an OPEN/RESOLVED lifecycle with enforced full
  accounting, so a dropped P1 is `needs-human`, never a merge (§5, §6.1,
  §6.2 precondition); identity is arbiter-validated against `(file, cat)` —
  a renamed slug is ambiguous identity, fail closed, and cannot reset the
  STUCK-P1 counter (§6.1); gap-issue bodies are sanitized and size-bounded
  per the repository data policy, with the full finding left at its
  review-comment permalink (§6.4); the arbiter is split
  collector / pure core / poster with a `--history` mode so fixtures test
  the core exactly as CI runs it (§6); previous review comments pass
  `codex_sanitize.py` before `codex_untrusted.py`, which defangs but does
  not redact (§4.1); gap-issue creation is idempotent on
  `(pr, canonical finding id)` with crash/concurrency/force-push fixtures
  (§6.4, §6.3).

- **2026-08-17, revision 3 review (2 findings)** — both applied in revision 4:
  `RESOLVED` now requires structured evidence tied to the current head, with
  P1 resolutions held in `pending-human` so model claims cannot yield
  `MERGE-CLEAN` (§5, §6.1); collector/core/poster boundaries and a canonical
  history JSON schema make the input deterministic, while duplicate bot
  comments fail closed (§6); CI posting is serialized per PR and local runs
  are read-only by default, so the exactly-once claim is limited to the
  authoritative CI writer (§6.3, §6.4); `MERGE-WITH-GAPS` is explicitly a
  fixer-loop stop, with merge blocked until a maintainer accepts every gap
  (§3, §6.2, §6.4).
