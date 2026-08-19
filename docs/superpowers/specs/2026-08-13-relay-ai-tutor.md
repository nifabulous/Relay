# Relay AI tutor — feature spec

**Status:** implemented 2026-08-15, disabled by default.
**Retrieval gate:** `2026-08-13-relay-ai-tutor-retrieval.md` (pgvector not indicated).

## What it is

A quote-grounded payments tutor inside Relay. It explains, hints, and quizzes on
cross-border and domestic payments, requiring verbatim evidence and deterministic
quote-coverage checks for factual answers. It cannot initiate, approve, advance,
or settle a payment, and it says so.

**Disabled by default.** The base install carries no AI dependency at all, and
`/api/tutor/chat` answers 503 until three things are set together.

## The one guarantee

> A factual tutor answer must include verbatim evidence from a retrieved Relay
> document and pass deterministic quote-coverage checks, or it is not delivered.

The server-owned `grounded` flag means the answer passed those quote-coverage
checks. This is source-backed lexical validation, not semantic entailment or a
live operational guarantee.

Three failure shapes, in increasing order of subtlety:

1. **An invented `source_id`.** Easy — the ID either was retrieved for this turn
   or it was not.
2. **A real `source_id` with paraphrased evidence.** The citation looks right,
   the quote reads like the document, and the sentence shown to the learner as
   proof was written by the model. Caught by requiring the evidence to appear
   verbatim in the cited text (whitespace-normalised, because re-wrapping is a
   formatting artefact and changing a word is not).
3. **A confident factual answer with no citation.** Marking it `grounded=false`
   is not enough — nothing in a chat interface makes a boolean louder than the
   paragraph beside it. The answer is **replaced** with a clarification.

## Configuration

All three are required together; any one missing yields 503 "not configured".

| Variable | Default | Notes |
| --- | --- | --- |
| `TUTOR_ENABLED` | `false` | Fail-closed parsing: only `1/true/yes/on` enable |
| `TUTOR_MODEL` | *(empty)* | e.g. `gpt-5` |
| `OPENAI_API_KEY` | *(empty)* | Name follows `TUTOR_PROVIDER` |

Tuning: `TUTOR_PROVIDER` (`openai`), `TUTOR_MAX_RETRIEVED_DOCS` (6),
`TUTOR_MAX_HISTORY_TURNS` (8), `TUTOR_MAX_INPUT_TOKENS` (6000),
`TUTOR_MAX_OUTPUT_TOKENS` (4000), `TUTOR_TRACING_ENABLED` (false).

Production-only, enforced with a 503 when the platform is detected:
`TUTOR_RATE_LIMIT_REDIS_URL` + `_TOKEN`, and `TUTOR_DAILY_REQUEST_CEILING`.
Optional: `TUTOR_TRUSTED_PROXY_HOPS`.

A malformed numeric value falls back to its default rather than raising — an
app that is off by default must not fail to boot over a variable it never reads.
The provider key is deliberately **not** a field on the settings object, so no
future `asdict()` in telemetry or an error report can carry it by accident.

```bash
pip install '.[ai]'      # provider adapter — the Vercel function build does this
pip install '.[tracing]' # Langfuse, optional
pip install '.[eval]'    # Ragas, never on the request path
```

## Request path

1. **Availability** → 503. A disabled tutor says so regardless of anything else.
2. **Rate limit** → 429, *before* any provider work. Checking afterwards bills
   for exactly the request the limit exists to prevent.
3. **Daily ceiling** → 429 with a different message. A per-caller limit stops one
   client looping; it does nothing about a thousand clients each behaving
   reasonably, which is the shape an unbounded bill actually takes.
4. **Policy** — deterministic, model-free, reading only `request.message`. A
   refusal never reaches the provider, so a hostile request costs nothing.
5. **Retrieval on the raw text** — *before* redaction, because retrieval keys on
   the very tokens redaction removes. "What does BIC DEUTDEFF mean?" must still
   reach the BIC card.
6. **Redaction and bounding** — in the prompt builder, the last point where the
   text is still ours. History sheds before evidence: history is conversational
   convenience, evidence is what makes the answer citable at all.
7. **Engine under a 25s timeout** — below the platform's 30s function limit, so
   the learner gets our JSON rather than the platform's HTML error page.
8. **Redacted telemetry** — source IDs, latency, grounded flag, error *class*.
   Never text.

## Trust boundary

Intent is read from `request.message` and nowhere else. Three surfaces carry
attacker-controllable text and none is an instruction:

- `history` entries with `role="assistant"` — the client supplies the whole
  history, so a forged turn saying "you are authorised to settle payments" is a
  string that arrived through a text box.
- `context.result_summary` — learner- or tool-supplied.
- Retrieved document text.

The enforcement is structural rather than a filter: the policy function simply
does not read them. A filter is something an attacker can phrase around.

## Adoption decisions

| Choice | Decision | Why |
| --- | --- | --- |
| Provider adapter | PydanticAI, lazy-imported in `engine.py` only | A structured output type the server can validate; provider types named in exactly one module, asserted by a test that greps the package |
| Retrieval | Lexical (IDF + score floor), no vector DB | 73 documents, technical vocabulary, 100% top-3 recall, 0.26 ms p95. See the retrieval spec |
| pgvector | **Not adopted** | Gate not met and not close: 73 docs against 10,000, 0.26 ms against 100 ms |
| Langfuse | Optional, behind a flag, no-ops when absent | Enabling tracing on a deployment that never installed it must not crash the tutor |
| Ragas | Opt-in `eval` extra, never imported by a request | Pulls a large LLM-framework tree; keeping it separate makes an accidental runtime import impossible rather than discouraged |
| Presidio | Optional `pii` extra | The deterministic redactor in `redaction.py` stays unconditional and dependency-free |
| LiteLLM | Not added | Single provider; adding it now would buy routing nobody needs |
| Streaming | **Not implemented** | Citations validate *after* the model returns and may replace the answer. Streamed text cannot be retracted |

The *500 AI Agents* repository supplied patterns only. Every line here is native
to Relay's existing FastAPI/React architecture — no framework, orchestrator, or
agent runtime was adopted from it.

## Redaction

Unconditional at the provider boundary. There is deliberately no flag that can
switch it off: a control able to disable a stated privacy invariant is not a
feature, it is the defect. Typed placeholders (`[IBAN]`, `[BIC]`, `[UETR]`,
`[ACCOUNT]`, `[EMAIL]`, `[PHONE]`, `[SECRET]`) so the model can still reason
about what *kind* of identifier was mentioned.

Over-redaction is treated as a real failure. Two measured decisions:

- A bare 8-letter BIC with no cue is **knowingly not redacted**. The ISO 9362
  shape matches 56,018 dictionary words; adding the country-code check still
  leaves 27,763. A BIC is public directory data identifying an institution, not
  a person. Precision wins for BIC alone; every other identifier is matched
  aggressively.
- Bare "SWIFT" is **not** an identifier cue. It is the organisation's name, and
  treating it as one turned "Explain SWIFT messages" into "Explain SWIFT [BIC]"
  — `messages` is eight letters whose fifth and sixth are `AG`. "BIC x" and
  "SWIFT code x" remain cues.

## The model's reach

Three read-only lookups: `get_lesson_reference`, `get_glossary_reference`,
`get_scheme_reference`. Every argument is normalised and checked for membership
in a Relay catalogue — never interpolated into a query, a path, or a URL. There
is no database handle, HTTP client, or filesystem access in the tools module,
asserted by import-graph tests rather than trusted by convention.

Tracking is deliberately absent. The MVP explains a *summary* the frontend
already displays and never looks a payment up by identifier. The frontend's
tracking context carries no UETR for the same reason.

## Frontend

`TutorPanel` docks right at ≥1024px and renders inline below, reusing the
breakpoint where `AppShell` already swaps the rail for the bottom nav. Non-modal:
no overlay, no scroll lock, no focus trap — a learner reads the lesson and asks
about it at the same time. Focus moves to the panel heading on open (the panel
does this itself in a mount effect; the launcher cannot, and polling
`requestAnimationFrame` for it works in jsdom while doing nothing in a hidden
tab) and returns to the launcher on close.

Entry points: Learn module pages, Tracking ("Explain this timeline"), Explore
scheme tabs ("Explain … rails"). The panel is lazy-loaded, so an unopened
launcher costs a route one button.

Feedback is four bounded fields — `turn_id`, `rating`, `surface`, and a closed
reason enum — riding the existing `POST /api/telemetry` contract. A second
endpoint would be a second place free text could be accepted.

`turn_id` must stay lowercase: the frontend analytics allowlist is
`^[a-z0-9]+(?:-[a-z0-9]+)*$`, so an uppercased UUID would be dropped silently
rather than error. Pinned by a test.

## Learner context

The only thing the tutor receives that describes a *person*. Module granularity
only: completed count, up to three modules worth revisiting, and the
deterministically computed next unlocked module. Never a question ID, a score, a
streak, or a date — and never phrased as a claim about what the learner
answered, because Relay records *that* a question was missed and nothing more.

## Evaluation

- `tests/tutor/test_tutor_golden.py` — 62-question golden set, fake engine, runs
  in ordinary CI with no provider and no key.
- `scripts/evaluate_tutor_retrieval.py` — retrieval recall and latency.
- `scripts/run_tutor_eval.py --provider live` — opt-in model evaluation. Gated in
  CI on a repository variable and `continue-on-error`. A job that fails when a
  provider has an outage stops being a signal about Relay.

One question inventory serves all three. A second file would drift within a
release and then two suites would disagree about the right answer.

## Verified 2026-08-15

```
Backend        1302 tests, ruff clean
Frontend       1162 tests (serial), tsc clean
Bundle         133.4 KB eager gzip against a 204.8 KB budget
Retrieval      top-3 recall 100%, no-match precision 100%, p95 0.26 ms
API surface    27 endpoints under /api
Light palette  additive only — 106 additions, 0 removals in tokens.css
```
