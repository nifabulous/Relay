# Operator-approved SSI identity registry

`trusted_identities.json` is the admission trust boundary. Candidate JSON cannot add
or modify identities in it. To enroll a newly researched bank:

1. Independently verify the canonical 8-character BIC, legal bank name, country,
   and every bank-owned source hostname.
2. Have an SSI/data owner review the evidence and approve the tuple.
3. Add the approved tuple to `trusted_identities.json` in the same reviewed change.
4. Add a positive production-path admission test using the new identity.
5. Run the SSI regression suite and `autopilot.py verify` before pushing.

Do not use candidate-supplied `source_domains` to establish trust. Test identities
belong in test fixtures and are rejected when the real production manifest is the
target.
