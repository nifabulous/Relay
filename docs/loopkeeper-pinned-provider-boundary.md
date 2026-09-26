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

The pinned adapter requires a model-shaped identifier before it reaches the
artifact branch, so the privileged publication job supplies the deliberately
non-routable sentinel `artifact-only-no-transport`. It omits API style, API
base URL, reasoning, input-budget, and request-timeout settings. It also fails
closed if any of `OPENAI_API_KEY`, `LOOPKEEPER_MODEL_API_KEY`, or
`LOOPKEEPER_API_KEY` is present, then removes all three names from the adapter
environment. Only the verified artifact path and its revalidated digest cross
the publication boundary.
