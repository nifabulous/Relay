# Relay AI tutor — retrieval spec and pgvector gate

**Status:** measured 2026-08-15. Gate **not met** — lexical retrieval stays.
**Implementation:** `app/tutor/retrieval.py`
**Benchmark:** `scripts/evaluate_tutor_retrieval.py`
**Fixture:** `tests/tutor/retrieval_questions.json` (42 labelled questions)

## Why this document exists

"Should the tutor use a vector database?" is normally answered by preference.
This makes it an answered question with numbers behind it, and states in advance
what result would change the answer.

## The gate

Adopt pgvector only if **any one** of these holds:

| Condition | Threshold | Measured 2026-08-15 | Met? |
| --- | --- | --- | --- |
| Catalogue size | > 10,000 documents | 73 | no |
| Top-3 retrieval recall | < 85% | 100.0% | no |
| p95 retrieval latency | > 100 ms | 0.24 ms | no |

**Verdict: pgvector is not indicated.** Nothing is close to a threshold —
latency has roughly 400x of headroom and the catalogue would need to grow by two
orders of magnitude. Revisit when the catalogue passes a few thousand documents
or when recall on a *grown* fixture drops.

## Measured results

```
questions            42 (37 graded, 5 expected-no-result)
catalogue documents  73
top-1 recall         83.8%
top-3 recall         100.0%
no-match precision   100.0%
latency p50 / p95    0.13 ms / 0.24 ms
```

Reproduce with:

```bash
python scripts/evaluate_tutor_retrieval.py
```

### Reading these numbers

**Top-3, not top-1, is the gate metric.** The engine receives up to six
documents (`TUTOR_MAX_RETRIEVED_DOCS`), so a document ranked second still grounds
the answer. Top-1 recall of 83.8% means six questions retrieve the labelled
document below first place; in each the top result is a related document that
also supports an answer, not a wrong one.

**No-match precision is the metric that catches a flattering retriever.** A
retriever that always returns *something* scores well on recall and is dangerous:
every out-of-scope question comes back with a citation attached. Five questions
in the fixture must retrieve nothing, and all five do.

## What the measurement changed

The first run scored **91.9% top-3 and 60% no-match precision**. Two defects,
both found by the benchmark rather than by inspection:

1. **No term-rarity weighting.** Raw overlap counts treat every word as equally
   informative. "payment" appears in nearly every document and "serial" in one,
   so a *title* hit on "payment" outranked *body* hits on "serial" and "cover" —
   and "what is the difference between a serial and a cover payment?" was
   answered out of the tracking card. Fixed by weighting each term by
   `log((N+1)/(df+1))`, which drives a near-universal term to approximately zero.
   This alone took top-3 recall to 97.3%.

2. **No score floor.** One incidental word in common was enough to return a
   document. "Recommend a good restaurant in Lagos" matched on "good" — the
   catalogue says "the funds are good" and "good only when the cycle settles" —
   and "who won the football last night?" matched a rail named "MORE Time".
   Fixed with a minimum lexical score, taking no-match precision to 100%.

A third change came from the last remaining miss. "Why has my payment been
sitting at the same bank for two days?" is a tracking question containing no
distinctive tracking word, so lexical scoring alone cannot place it. The
`surface` field already said *tracking*; it simply was not being used. Surfaces
whose subject is carried by a typed field (`lesson`/`module_id`,
`scheme`/`currency`, `tool`/`tool_name`) need no such anchor.

## Design decisions

**Lexical, not embeddings, as the first implementation.** The corpus is bounded,
curated, and technical: "CHAPS", "UETR", "pacs.008" each mean one thing. Term
overlap suits that shape. A vector store would add a service, a migration, an
embedding call on the request path, and non-determinism, in exchange for
semantic matching this corpus barely needs.

**Determinism is a feature, not a side effect.** Ordering is score descending
then `source_id` ascending. Without the second key, ties resolve to the
catalogue's build order, so reordering the concept-card list would silently
change which evidence the model receives — and a tutor answer in a bug report
would not reproduce.

**Empty is a correct result.** The engine converts an empty retrieval into a
clarification. The alternative — always returning the least-bad document —
dresses an ungrounded answer in a citation, which is worse than saying nothing.

**Context anchors are bounded to at most four documents** (surface, rail,
currency, module). Admitting the whole neighbourhood around the learner's
position means a question the retriever could not parse gets answered from
whatever evidence was nearby, which reads exactly like a grounded answer.

## If the gate is later met

- Store embeddings and metadata in PostgreSQL with pgvector; keep the lexical
  retriever as a fallback rather than replacing it.
- Assert that `source_id` values and resulting citations are identical across
  both implementations — the citation contract must not depend on which
  retriever ran.
- Do not add Qdrant alongside pgvector. Qdrant is an alternative deployment
  decision, not a second dependency.

## Fixture integrity

The 42 questions were authored as a learner would phrase them and labelled with
the document that *should* ground the answer, **before** any measurement ran.
Nothing writes back into the fixture. Adjusting a question because the retriever
missed it would make the benchmark measure itself; the two defects above were
fixed in the retriever, and the questions are unchanged.

The fixture is also the input to the Task 5.2 tutor golden set, so its labels
have to survive being read as ground truth by a second consumer.
