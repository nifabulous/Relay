# Loop schemas

This is the normative reference for the two JSON shapes the review loop
passes between its components. The reviewer prompt (structured trailer
output) and the arbiter (collector output, and the trailer it parses) both
cite this document rather than restating the shapes; if the two ever drift,
this file is the tiebreaker.

There are two schemas:

- **Schema 2 — the trailer.** Emitted by the reviewer at the end of each
  review comment. Carries the findings for that round.
- **Schema 1 — canonical history.** Emitted by the arbiter's collector.
  Carries the full, validated comment history for a PR, including every
  parsed trailer.

Both are versioned by an explicit `schema` field so a consumer can refuse
input it does not understand rather than guess.

## Schema 2: the trailer

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
derives identity — `id` is a proposal, `file`+`cat` are what the arbiter
checks it against. `RESOLVED` always carries an evidence object. The arbiter
checks that every evidence file is changed in the current head and that the
verification reference is non-empty. This is a bounded consistency check,
not semantic proof: a P1 resolution therefore becomes `pending-human` and
can never produce `MERGE-CLEAN` by itself. A maintainer decides whether the
cited evidence actually closes a P1 while reviewing the same head.

### Finding lifecycle states

Every finding the reviewer has previously raised on a PR must appear in the
new trailer with a lifecycle state — a full accounting. Silence is not
resolution: a finding the model simply stops mentioning must never read as
fixed.

```
NEW        first appearance
OPEN       previously raised, still present (with one line on whether the
           last fix attempt changed anything)
RESOLVED   previously raised, verified fixed in this diff (with the evidence)
```

## Schema 1: canonical history

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
available. `current_diff_files` is the sanitized path set used for the
bounded `RESOLVED` evidence check above; it is not treated as proof of
semantic correctness.
