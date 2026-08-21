# Contracts

A contract fixes the loop's input. It is the scope decision the reviewer
holds a diff to, and the record the arbiter reads when it decides whether an
open finding is a gap the loop may merge with, or a limitation to escalate.

PR 24's reviewer kept re-raising the same P1 partly because the PR
description *claimed* enforcement the code could not provide. The reviewer
was holding the diff to its stated contract, and the stated contract was
wrong. A contract file exists so the scope statement a review is judged
against is written down, versioned, and — per the trust rule below — not
something the branch under review can edit unilaterally.

## Where contracts live

Every loop-managed PR gets a contract file at
`docs/contracts/<slug>-<hash>.md`, where `<slug>` is the branch name with
every `/` replaced by `-` and `<hash>` is the first 12 hex chars of
`sha256(branch)`. The hash makes the mapping collision-resistant: two branches whose
slugs collide (`feature/a-b` vs `feature-a/b`) hash differently, so one
branch's contract cannot silently bind another, and no branch name
resolves onto this README. For example, branch `feat/loop-arbiter` has
contract `docs/contracts/docs/contracts/feat-loop-arbiter-564bdc00f842.md`.

The same derivation is implemented exactly twice — `_contract_relative_path`
in `scripts/codex_arbiter.py` and the `CONTRACT_PATH` block in
`scripts/codex_review_pr.sh` — and nowhere else.

## Format

```markdown
# Contract: <branch>
## Goal            — one sentence
## Invariants      — what must remain true (flag-off behavior, retry safety…)
## In scope        — the deliverable
## Out of scope    — with the DECISION that put it there, and where it went
                     (issue link, follow-up plan)
## Accepted limits — residual risks the owner has signed off on
```

Each `Out of scope` item names the decision that put it there and where the
work went (an issue link or a follow-up plan reference) — not just that it
was deferred. `Accepted limits` are risks the owner has already signed off
on; they are not the same as `Out of scope` items awaiting a decision.

## 4.1 Trust rule: a contract binds only from `main`

A contract that rode in on the PR branch is PR-controlled text; letting it
into the reviewer's trusted channel would let any branch declare its own
findings out of scope. The fix is already built: **the review workflow
checks out only the trusted default branch** (that is how PR 15 shipped it),
so the contract read from that checkout is `main`'s version *by
construction*. A new or amended contract therefore lands first as its own
small, maintainer-merged PR — which is exactly the "human signs the scope
decision" step this convention requires, now enforced by plumbing rather
than convention.

What goes where:

| Content | Channel |
|---|---|
| Repository review policy (`.github/codex/review-policy.md`) | trusted `instructions` |
| Contract, as read from the default-branch checkout | trusted `instructions` |
| PR diff, PR body, branch copy of the contract (if it differs) | untrusted `input`: `codex_sanitize.py` → `codex_untrusted.py` |
| Previous review comment (for repeat-marking) | untrusted `input`: `codex_sanitize.py` → `codex_untrusted.py` |

The prior review comment is bot-authored, but its findings quote
PR-controlled text verbatim, so it goes in the untrusted channel like
everything else that can carry attacker bytes — and it passes through
**both** filters in order: `codex_sanitize.py` redacts (the untrusted
wrapper only defangs delimiters; it performs no redaction), then
`codex_untrusted.py` fences. The instructions tell the reviewer: a
divergence between the branch's contract copy and the bound one is itself a
finding.

## Rollout compatibility

No contract on `main` = an empty contract. Nothing is out of scope, no
limits are accepted, and every arbiter rule still functions — the arbiter
depends on contracts only for gap acceptance, not for termination. A branch
with no contract file is not blocked; it simply gets no scope carve-outs
until one is merged.

## Who may merge one

A contract only binds once it is merged to `main`. Because the review
workflow reads the contract from the default-branch checkout, a contract
cannot bind itself into existence from its own PR branch — it must land as
its own small, maintainer-merged PR, same as any other change to `main`.
This is the "human signs the scope decision" step: contract sign-off, gap
acceptance, and any new-scope decision stay human, permanently. A contract
PR is reviewed and merged like any other change to `main`; nothing in this
convention grants an automated reviewer, the arbiter, or any agent the
authority to merge a contract on its own.
