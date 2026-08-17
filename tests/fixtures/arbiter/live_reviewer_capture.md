<!-- LIVE CAPTURE — real gpt-5.6-luna reviewer output, 2026-08-17, via
     codex_responses.py against this branch's diff. NOT a reconstruction.
     Saved to validate the reviewer->collector emit/parse seam. The two
     findings are known false positives (P1: the diff sanitizer mangled
     _norm_key into [SECRET]; P2: hard_cap/stuck_p1 are fixed by design) —
     finding CORRECTNESS is not what this fixture tests; trailer PARSING is. -->

# BLOCK

## Findings

### P1 — NEW — `_apply_round` uses an undefined key and cannot process findings
- File: scripts/codex_arbiter.py, `_apply_round`
- Evidence: loop contains `[SECRET](finding["file"], finding["cat"])` with no assignment to `key`.

### P2 — NEW — Environment configuration does not populate all documented contract controls
- File: scripts/codex_arbiter.py, `Contract.from_env`
- Evidence: from_env reads only CODEX_BOT_LOGIN and ARBITER_SOFT_GATE.

<!-- codex-verdict: {"schema":2,"verdict":"BLOCK","findings":[{"sev":"P1","state":"NEW","file":"scripts/codex_arbiter.py","cat":"runtime-correctness","id":"undefined-round-key"},{"sev":"P2","state":"NEW","file":"scripts/codex_arbiter.py","cat":"configuration","id":"ignored-contract-environment-controls"}]} -->
