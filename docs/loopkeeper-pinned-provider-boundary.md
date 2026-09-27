# Loopkeeper pinned provider boundary

Relay's review workflow pins Loopkeeper at commit
`ff1dbeb4f3eee1a45dc34ad1e02c062b93d26231`. The exact external files that
define the producer and publisher boundary are reviewable at these immutable
URLs:

- [`pr-review.yml`](https://github.com/nifabulous/loopkeeper/blob/ff1dbeb4f3eee1a45dc34ad1e02c062b93d26231/.github/workflows/pr-review.yml), SHA-256 `a4d8d1cc4496e75bee5b28362e9c2b5321c8744c9f6ccf9f2b2c0a207d382ca1`
- [`review_pr.sh`](https://github.com/nifabulous/loopkeeper/blob/ff1dbeb4f3eee1a45dc34ad1e02c062b93d26231/adapters/github/review_pr.sh), SHA-256 `78361fd302f530fae2daa1574ff8b2a953661fa91434b2d938ce999275c32636`

The contract test clones that exact commit, verifies both complete-file
digests, inspects the producer artifact contract, and executes the real
publisher adapter with a supplied review artifact. Its Python shim fails if
`loopkeeper.transport` is invoked, proving the artifact path does not make a
model request. The fake GitHub publisher also proves that the adapter reaches
only the expected PR-comment operation.

The same pinned adapter explicitly implements the immediate fallback used by
the caller: when the reserved `LoopkeeperImmediate` identity cannot resolve to
an active workflow, it logs `using the no-CI fallback review`, sets
`CI_PRODUCED_NO_RUN=1`, and records `EVIDENCE_STATE="fallback"`. The pinned
producer always uploads `loopkeeper-review-${{ github.run_id }}` from
`loopkeeper-artifacts`, so the caller's artifact-required rebind is the
verification boundary for that fallback. The network contract test asserts
these exact source strings in addition to the immutable file digests.

For reviewers who cannot inspect the external checkout during a review, the
load-bearing source excerpts are reproduced here from those immutable files:

```yaml
# .github/workflows/pr-review.yml (lines 312-317)
- name: Upload immutable review artifacts
  uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
  with:
    name: loopkeeper-review-${{ github.run_id }}
    path: ${{ github.workspace }}/loopkeeper-artifacts
```

```bash
# adapters/github/review_pr.sh (lines 394-401)
if [[ "${LOOPKEEPER_EVENT_NAME:-}" == "pull_request_target" && "${LOOPKEEPER_PR_ACTION:-}" =~ ^(opened|synchronize)$ ]]; then
  CI_WORKFLOW_ID="$(resolve_ci_workflow_id || true)"
  if [[ ! "$CI_WORKFLOW_ID" =~ ^[0-9]+$ ]]; then
    echo "Could not resolve an active ${LOOPKEEPER_CI_WORKFLOW_NAME} workflow at ${LOOPKEEPER_CI_WORKFLOW_FILE}; using the no-CI fallback review." >&2
    CI_PRODUCED_NO_RUN=1
    EVIDENCE_STATE="fallback"
  fi
fi
```

```yaml
# .github/workflows/pr-review.yml (lines 166-170, 276-317)
review:
  needs: [resolve, eligibility]
  if: ${{ needs.eligibility.outputs.eligible == 'true' }}

- name: Record whether review artifacts exist
  if: always()

- name: Upload immutable review artifacts
  with:
    name: loopkeeper-review-${{ github.run_id }}
    if-no-files-found: ignore
```

These pinned producer facts are also asserted after cloning the exact commit by
`tests/test_loopkeeper_writer_contract.sh`: an ineligible decision skips the
model job, while an eligible job is the only path that can create the
run-scoped artifact. The caller therefore treats a successful direct run with
that exact skipped-review signature as an ineligible no-op, and treats every
other artifact absence as a publication failure.

The excerpts are covered by the same SHA-256 checks and source assertions in
`tests/test_loopkeeper_writer_contract.sh`; they are documentation of the
immutable provider boundary, not a second implementation of the provider.

## Captured pull-request-target run evidence

On 2026-09-27, the consumer repository returned this real run shape for Relay
PR 166 (run `36342202398`, head `60bc529ac019109b146bb87bc377a28b0b215c9f`):

```json
{
  "id": 36342202398,
  "event": "pull_request_target",
  "status": "completed",
  "conclusion": "success",
  "head_sha": "60bc529ac019109b146bb87bc377a28b0b215c9f",
  "head_branch": "codex/loopkeeper-immediate-review",
  "pull_requests": [{"number": 166, "head": {"sha": "60bc529ac019109b146bb87bc377a28b0b215c9f"}}],
  "path": ".github/workflows/loopkeeper-pr-review.yml"
}
```

The selector tests also include the conservative base-side shape (`head_sha`
does not match, `pull_requests` is empty): it is classified as unresolved and
skips the callback rather than re-entering review. An associated-but-non-exact
run remains on the existing exact-head recovery path.

The pinned adapter requires a model-shaped identifier before it reaches the
artifact branch, so the privileged publication job supplies the deliberately
non-routable sentinel `artifact-only-no-transport`. The adapter also validates
reasoning, input-budget, and output-token fields before branching, so Relay
uses fixed compatibility values (`none`, `600000`, and `1`) rather than
operator-configurable model settings. It omits API style, API base URL, and
request-timeout settings. It also fails closed if any of `OPENAI_API_KEY`,
`LOOPKEEPER_MODEL_API_KEY`, or `LOOPKEEPER_API_KEY` is present, then removes
all three names from the adapter environment. Only the verified artifact path
and its revalidated digest cross the publication boundary.
