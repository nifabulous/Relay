# Relay AI Tutor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a grounded, source-citing AI tutor that explains Relay’s lessons and simulated payment results, gives hints and quizzes, and remains isolated from payment-mutating operations.

**Also in this plan:** Phase 7 adds dark mode across the whole app. It is unrelated to the tutor and shares no code with it. The two workstreams are bundled by author decision, not by dependency, and either can ship without the other. Phases 0-6 and 8 are the tutor; Phase 7 is dark mode. They are tracked as two independently shippable workstreams.

**Architecture:** Build a stateless FastAPI tutor endpoint backed by a provider adapter, a small deterministic Relay knowledge catalogue, read-only domain tools, and a strict citation/policy validator. The first release uses lexical retrieval so local development needs no vector database; pgvector is a measured Phase 6 upgrade only if the catalogue or retrieval metrics justify it. The React frontend owns the short conversation history and renders the tutor as a reusable panel that can receive lesson, scheme, tracking-summary, or tool context.

**Tech Stack:** FastAPI, Pydantic v2, PydanticAI provider adapter, React 19, TypeScript, TanStack Query client utilities, Zod, Vitest, React Testing Library, MSW, pytest, Ruff, optional Langfuse tracing, optional Ragas evaluation, optional Presidio redaction, PostgreSQL/pgvector only after the retrieval gate is met.

## Global Constraints

- `TUTOR_ENABLED` defaults to `false`; the application must boot and all existing routes/tests must pass without an AI provider key or AI dependencies installed.
- The tutor may explain, compare, quiz, coach, and summarize. It must never initiate, modify, advance, complete, import, or approve a payment.
- Tutor tools are read-only wrappers around existing Relay data and services. They must not call `POST /api/prepare-payment`, tracking mutation endpoints, admin/import endpoints, or any real payment provider.
- Every factual tutor answer must cite one or more retrieved Relay/official source records. If the system cannot ground an answer, it must say so and ask a clarifying question rather than inventing a payment rule. Case tutoring and live tracking lookup are explicitly deferred from the MVP.
- Payment status, limits, fees, routing recommendations, and settlement facts remain deterministic backend data. The model is an explanation layer, not the source of truth.
- Redact IBANs, account numbers, BICs, UETRs, emails, phone numbers, and secrets before external model calls. Do not persist raw tutor transcripts in the MVP.
- The frontend sends at most eight prior turns and a bounded, explicitly constructed context summary; never serialize the DOM, full API responses, form state, or local-storage export into a prompt.
- No unrestricted live web search in learner-facing tutor responses. Source refresh is an internal/admin workflow and must write verified source metadata back into Relay data before the tutor can use it.
- The project Python floor is `>=3.10`, documented in `pyproject.toml` and CI. The tutor dependencies are not compatible with the existing 3.9 matrix.
- AI evaluation tests that call a paid model are opt-in and never part of the ordinary backend/frontend test commands.
- Production enablement is blocked until a rate limit, provider spend budget, and provider-health fallback are configured; the default-disabled flag is not a substitute for these controls.
- Preserve all unrelated working-tree changes. Each phase must end with a focused test run and a small commit.
- Dark mode (Phase 7) must not change any rendered color when the resolved theme is light. The light palette is the current shipped palette, byte-for-byte. Adding the dark palette must not alter a single light-mode value, and the existing contrast assertions must pass unchanged. Documented non-text boundary exceptions remain explicit rather than being falsely described as AA-compliant.
- Dark mode is a token-layer change. No feature component may branch on theme in TypeScript; if a component needs a different color in dark, that belongs in `tokens.css`, not in a conditional.

## Deployment constraints

- Local and ordinary CI installs use the base dependency set with `TUTOR_ENABLED=false`; importing the app must not require provider packages.
- The Vercel deployment profile installs the optional AI extra during the Python function build via `vercel.json` and `pip install '.[ai]'`. A missing provider key still leaves the tutor unavailable; it never silently falls back to a fake provider in production.
- Vercel production uses an external Redis-compatible rate-limit adapter because in-process buckets reset across instances and cold starts. The adapter receives `TUTOR_RATE_LIMIT_REDIS_URL` and `TUTOR_RATE_LIMIT_REDIS_TOKEN`; local tests inject an in-memory fake.
- The tutor engine timeout is 20 seconds, below the current 30-second Vercel function limit. The route returns a stable provider-unavailable response before the platform timeout.
- Live tracking lookup, case tutoring, and durable vector indexing are not enabled by this deployment profile. Tracking is summary-only and pgvector requires a separate durable Postgres deployment decision.

---

## Research decisions

- PydanticAI is the primary provider-adapter choice because its structured outputs and tool schemas map directly to the existing Pydantic/FastAPI backend: [PydanticAI output types](https://pydantic.dev/docs/ai/core-concepts/output/).
- The OpenAI Agents SDK is the documented alternative if the product deliberately chooses an OpenAI-only runtime with built-in sessions, guardrails, tools, and tracing: [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/).
- LangGraph is deferred until Relay needs durable multi-step workflows, human handoffs, or checkpointed case coaching: [LangGraph persistence](https://langchain-ai.github.io/langgraph/concepts/time-travel/).
- pgvector is the measured retrieval upgrade because it keeps vectors with relational Relay data and supports hybrid PostgreSQL search: [pgvector](https://github.com/pgvector/pgvector). Qdrant remains an alternative, not a second vector dependency: [Qdrant](https://github.com/qdrant/qdrant).
- Langfuse is the optional tracing/prompt/evaluation layer: [Langfuse](https://langfuse.com/docs). Ragas is the opt-in retrieval/faithfulness evaluation layer: [Ragas metrics](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/).
- Presidio is the optional PII enhancement after deterministic Relay redaction works: [Microsoft Presidio](https://github.com/microsoft/presidio).
- MCP is deferred to a later integration surface for exposing stable Relay read-only tools to multiple clients: [official MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk).

## File and responsibility map

The implementation is deliberately split into independently testable workstreams:

- `app/tutor/` — tutor-only contracts, policy, retrieval, tools, and model orchestration.
- `app/routers/tutor.py` — learner-facing HTTP boundary; no prompt construction in the router.
- `app/tutor/telemetry.py` — redacted tracing and cost/latency events; no raw prompt storage.
- `app/data/tutor_knowledge.py` — curated concept cards and source references; payment-scheme facts continue to come from `app/data/payment_schemes.py`.
- `frontend/src/features/tutor/` — reusable panel, message rendering, context builder, and accessibility tests.
- `frontend/src/api/schemas.ts` and `frontend/src/api/queryKeys.ts` — typed transport contract.
- `tests/tutor/` — deterministic contract, policy, retrieval, tool, and evaluation fixtures.

Do not add tutor logic to `ExplorePage.tsx`, `TrackingPage.tsx`, or lesson content files beyond passing a typed context object and rendering the reusable launcher/panel.

## Phase 0: Lock the product and API contract

### Task 0.1: Add the tutor request/response schemas

**Files:**
- Create: `app/tutor/__init__.py`
- Create: `app/tutor/schemas.py`
- Test: `tests/tutor/test_schemas.py`
- Modify: `frontend/src/api/schemas.ts`
- Modify: `frontend/src/api/schemas.test.ts`

**Interfaces:**

```python
from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

class TutorMode(str, Enum):
    CHAT = "chat"
    EXPLAIN = "explain"
    HINT = "hint"
    QUIZ = "quiz"

class TutorContext(BaseModel):
    surface: Literal["global", "lesson", "scheme", "tracking", "tool"]
    module_id: Optional[str] = Field(default=None, max_length=100)
    module_title: Optional[str] = Field(default=None, max_length=200)
    topic: Optional[str] = Field(default=None, max_length=120)
    currency: Optional[str] = Field(default=None, max_length=20)
    rail_name: Optional[str] = Field(default=None, max_length=120)
    tool_name: Optional[str] = Field(default=None, max_length=120)
    result_summary: Optional[str] = Field(default=None, max_length=4000)

class TutorTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=3000)

class TutorRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    mode: TutorMode = TutorMode.CHAT
    context: TutorContext
    history: List[TutorTurn] = Field(default_factory=list, max_length=8)

class TutorCitation(BaseModel):
    source_id: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=240)
    url: Optional[str] = Field(default=None, max_length=500)
    evidence: str = Field(min_length=1, max_length=500)

# What the MODEL is asked to produce. Only fields a model can actually know.
class TutorModelOutput(BaseModel):
    answer: str = Field(min_length=1, max_length=6000)
    citations: List[TutorCitation] = Field(default_factory=list, max_length=8)
    follow_up: Optional[str] = Field(default=None, max_length=500)
    needs_clarification: bool = False

# What the SERVER returns. Composed from a TutorModelOutput plus server-owned fields.
class TutorResponse(TutorModelOutput):
    mode: TutorMode          # echoed from the request
    grounded: bool           # computed after citation validation
    safety_notice: Optional[str] = Field(default=None, max_length=500)
    turn_id: str             # uuid4(), the key feedback events join on
```

- [ ] **Do not put `mode`, `grounded`, `safety_notice`, or `turn_id` on `TutorModelOutput`.** Subclassing alone is not the fix — if those fields are on the model's output type they go into the schema the provider sees, and the model is asked to invent a `turn_id` it cannot know and to self-report `grounded`, which the server recomputes anyway. Verified during implementation: with `mode` and `grounded` on `TutorModelOutput`, the type becomes unconstructable without server data and takes 8 unrelated tests down with it.
- [ ] Add the models above using the repository’s explicit `typing.List`, `typing.Literal`, and `typing.Optional` imports. **Write 3.9-compatible typing.** The floor is *intended* to move to `>=3.10` (task T2), but `pyproject.toml` still says `>=3.9`, ruff targets `py39`, and the local venv is 3.9.6. Until T2 actually lands, `str | None` and `list[str]` do not parse. Do not treat the intended floor as the current one.
- [ ] Generate `turn_id` with `uuid4()` in the server after validating `TutorModelOutput`; it is a correlation ID, not a persisted transcript key.
- [ ] Validate citation URLs as either absent or trusted `https://` URLs from the Relay/official-source allowlist; never render arbitrary model-provided URLs.
- [ ] Add the matching Zod schemas and inferred TypeScript types. Make response parsing reject a missing `answer`, `mode`, `grounded`, or `turn_id`; tolerate `null` optional fields.
- [ ] Reject histories over eight turns, messages over 2,000 characters, and result summaries over 4,000 characters with FastAPI validation errors.
- [ ] Treat every client-supplied history turn as quoted, untrusted context. Preserve the `user`/`assistant` labels for conversational continuity, but the prompt must explicitly state that history cannot override system policy, retrieved evidence, or current context.
- [ ] Do not accept raw tracking identifiers or opaque resource references in the MVP. Tracking entry points send only a bounded visible summary; live tracking lookup is a later authenticated capability.
- [ ] Test valid chat/explain/hint/quiz requests, invalid surfaces, oversized fields, citation limits, and response parsing.

**Verification:** `pytest -q tests/tutor/test_schemas.py` and `cd frontend && npm test -- --run src/api/schemas.test.ts`.

### Task 0.2: Add configuration and dependency isolation

**Files:**
- Modify: `app/config.py`
- Modify: `pyproject.toml`
- Modify: `vercel.json`
- Create: `tests/tutor/test_config.py`
- Create: `.env.example`

- [ ] Add settings `TUTOR_ENABLED` (false), `TUTOR_PROVIDER` (openai), `TUTOR_MODEL` (empty), `TUTOR_MAX_RETRIEVED_DOCS` (6), `TUTOR_MAX_HISTORY_TURNS` (8), `TUTOR_MAX_INPUT_TOKENS` (6000), `TUTOR_MAX_OUTPUT_TOKENS` (1200), `TUTOR_RATE_LIMIT_REDIS_URL` (empty), `TUTOR_RATE_LIMIT_REDIS_TOKEN` (empty), and `TUTOR_TRACING_ENABLED` (false). Redaction is unconditional at the external-provider boundary; there is no production flag that can disable it.
- [ ] Add `pydantic-ai` and the selected provider client under an optional `ai` dependency group; add Langfuse, Presidio, and evaluation packages under separate optional extras. The local/base installation remains unchanged, while the Vercel function build explicitly installs `.[ai]`.
- [ ] Define the provider contract explicitly: `TUTOR_PROVIDER`, `TUTOR_MODEL`, and the provider key environment variable (for the first adapter, `OPENAI_API_KEY`) are server-only settings and must never be returned by `/health`, OpenAPI examples, telemetry, or frontend bundles.
- [ ] Verify the selected PydanticAI version in the project’s Python 3.10+ environment and update `pyproject.toml`/CI together. Do not retain a 3.9 CI job for a dependency set that cannot install there.
- [ ] The app must return a clear 503 “Tutor is not enabled” response when the feature flag is false and a clear 503 “Tutor provider is not configured” response when enabled without a model/key.
- [ ] Keep evaluation dependencies separate from runtime dependencies; Ragas must never be imported by the request path.
- [ ] Configure `vercel.json` with a Python `installCommand` that installs `.[ai]` for the function build, move frontend `npm ci` there, keep the frontend build command focused on `npm run build`, and exclude `scripts/**` from the function bundle.
- [ ] Test defaults, enabled-without-key behavior, and disabled behavior without importing the provider SDK.

**Verification:** `pytest -q tests/tutor/test_config.py tests/test_frontdoor.py` and `ruff check app tests`.

## Phase 1: Build the grounded Relay knowledge layer

### Task 1.1: Create curated concept cards and source references

**Files:**
- Create: `app/data/tutor_knowledge.py`
- Create: `app/data/tutor_lesson_cards.py`
- Modify: `app/data/payment_schemes.py` only to expose existing source metadata through a stable helper
- Create: `tests/tutor/test_knowledge_catalog.py`

**Interfaces:**

```python
from typing import List, Literal, Optional, Set

from pydantic import BaseModel, Field

class TutorDocument(BaseModel):
    source_id: str
    title: str
    text: str
    topics: List[str]
    module_ids: List[str]
    currencies: List[str] = Field(default_factory=list)
    source_url: Optional[str] = None
    verified_as_of: Optional[str] = None
    source_kind: Literal["relay", "official"]

def build_tutor_catalog() -> List[TutorDocument]: ...
def trusted_source_urls() -> Set[str]: ...
```

- [ ] Add concept cards for BIC, IBAN, UETR, correspondent banking, SWIFT gpi, RTGS, ACH, VoP, fees/charge codes, payment tracking, ISO 20022, and the difference between payment rails and message formats.
- [ ] Add one compact backend lesson card for every module in `frontend/src/features/learn/curriculum.ts`, preserving the module ID, title, learning outcomes, and a Relay source ID. This is the authoritative backend grounding layer; never import TypeScript content into Python at runtime.
- [ ] Add a generated/normalized document for every supported payment-scheme currency and the International / SWIFT catalogue, mapping the existing `verifiedAsof` field to `verified_as_of` and preserving official source URLs.
- [ ] Give each document a stable `source_id`; changing prose must not silently change an existing source ID.
- [ ] Derive the citation URL allowlist from the catalog’s official/Relay source records via `trusted_source_urls()`; the model may select a known URL but may not invent one.
- [ ] Keep the cards concise and educational. Do not copy entire lesson files or include account-number examples that resemble real credentials.
- [ ] Test unique IDs, non-empty text/topics, valid source kinds, source URLs for official claims, inclusion of all curriculum module IDs, and inclusion of all ten domestic currencies plus International / SWIFT.

**Verification:** `pytest -q tests/tutor/test_knowledge_catalog.py tests/test_schemes.py`.

### Task 1.2: Implement deterministic retrieval before adding a vector database

**Files:**
- Create: `app/tutor/retrieval.py`
- Create: `tests/tutor/test_retrieval.py`

**Interfaces:**

```python
class RetrievedDocument(BaseModel):
    document: TutorDocument
    score: float

def retrieve_documents(
    query: str,
    *,
    context: TutorContext,
    limit: int = 6,
) -> List[RetrievedDocument]: ...
```

- [ ] Normalize text into lowercase alphanumeric tokens, add exact boosts for currency/rail/topic tokens, and score title/topics before body overlap.
- [ ] Filter by `module_ids`, `topics`, and currency when the context provides them; retain a small global fallback for glossary questions.
- [ ] Return deterministic ordering: score descending, then `source_id` ascending. Never return documents below zero score unless the query has no lexical match; in that case resolve one canonical document from the context’s `module_id`, `currency`, and `rail_name`, or return an empty result that forces clarification.
- [ ] Test exact UETR/tracking, currency rail, glossary, module-filtered, no-match, tie-break, and result-limit behavior.
- [ ] Keep retrieval pure and in-process. It must not perform network calls, database writes, or model calls.

**Verification:** `pytest -q tests/tutor/test_retrieval.py`; the benchmark in Task 1.3 records retrieval quality against the labeled fixture before considering embeddings.

### Task 1.3: Add the measured pgvector upgrade gate

**Files:**
- Create: `docs/superpowers/specs/2026-08-13-relay-ai-tutor-retrieval.md`
- Create: `scripts/evaluate_tutor_retrieval.py`
- Create: `tests/tutor/retrieval_questions.json`
- Add only if the gate is met: `app/tutor/vector_retrieval.py`, `alembic/versions/20260813_add_tutor_documents.py`

- [ ] Add at least 30 labeled retrieval questions before running the benchmark, covering glossary, lessons, schemes, tracking-summary, tools, and out-of-scope questions. Each item must declare expected source IDs and whether no result is expected.
- [ ] Measure lexical retrieval against this fixture and record top-1/top-3 recall, no-match precision, p50, and p95 latency. The fixture is the input to the later tutor golden set, not a result generated after the gate.
- [ ] Adopt pgvector only if the catalogue exceeds 10,000 documents, top-3 retrieval recall falls below 85%, or p95 retrieval exceeds 100 ms in the measured deployment environment.
- [ ] If adopted, store embeddings and metadata in PostgreSQL with pgvector, retain the lexical fallback, and test that source IDs/citations remain identical across retrieval implementations.
- [ ] Do not add Qdrant and pgvector together. Qdrant is an alternative deployment decision, not a second dependency.

**Verification:** Run `python scripts/evaluate_tutor_retrieval.py --format json`; store aggregate benchmark output in the retrieval spec without committing user data or model transcripts. The checked-in questions are authored test fixtures, not learner data.

## Phase 2: Add policy, privacy, read-only tools, and the model adapter

### Task 2.1: Implement request redaction and tutor policy checks

**Files:**
- Create: `app/tutor/policy.py`
- Create: `app/tutor/redaction.py`
- Create: `tests/tutor/test_policy.py`
- Create: `tests/tutor/test_redaction.py`

**Interfaces:**

```python
from typing import Dict, List, Optional

class PolicyDecision(BaseModel):
    allowed: bool
    reason: Optional[str] = None
    response: Optional[str] = None

def redact_sensitive_text(value: str) -> str: ...
def evaluate_tutor_request(request: TutorRequest) -> PolicyDecision: ...
```

- [x] Redact IBAN-like values, 8/11-character BICs, UUID-shaped UETRs, long account numbers, email addresses, phone numbers, and API-key-shaped secrets with typed placeholders. **DONE 2026-08-14** — `app/tutor/redaction.py`, 100 tests across redaction + policy.

> **Known, measured gap: a bare 8-letter BIC with no cue word is NOT redacted.**
> `send to DEUTDEFF` passes through; `BIC DEUTDEFF`, `CITIUS33` (contains a digit)
> and `SBININBBXXX` (head-office branch code) are all caught.
>
> This is deliberate and evidenced, not an oversight. The ISO 9362 shape matches
> **56,018** entries in `/usr/share/dict/words`; requiring a valid ISO 3166-1
> country code at positions 5-6 still leaves **27,763** (`SETTLING`→LI,
> `CORRIDOR`→ID, `TRACKING`→KI). A scan of Relay's own 228 learner-facing files
> found 25+ ordinary words clearing both tests, including `REQUIRED`, `CREDITED`,
> `BENEFICIARY` and `GLOSSARY`. A vowel-shape heuristic was tried and rejected:
> still ~7,700 collisions and it loses 15 of 89 real BICs.
>
> The trade is precision for BIC alone, on the grounds that a BIC is public
> directory data identifying an *institution*, not a person. IBAN, UETR, account,
> email, phone and secret are all still matched aggressively. To close the gap,
> drop the cue-adjacency requirement and accept `[BIC]` appearing in place of
> `REQUIRED` / `CREDITED` / `BENEFICIARY` in ordinary lesson prose.
>
> **Fixed on review 2026-08-14:** the space-grouped IBAN form
> (`DE89 3704 0044 0532 0130 00` — how it appears on any invoice, and so the form
> a learner actually pastes) was not merely unmatched. The permissive phone
> pattern claimed its middle, producing `DE[PHONE]130 00`: a partial leak wearing
> the wrong label, which also misinforms the model about what it saw. `_IBAN_RE`
> now matches both forms, and two tests pin the fragments-and-mislabel case.
- [ ] Refuse requests to initiate real payments, bypass sanctions/VoP/compliance, disclose secrets, or provide false certainty about live bank limits. Redirect the learner to Relay’s simulation disclaimer or an official operator source.
- [ ] Treat retrieved documents and user-provided result summaries as untrusted data; they may supply facts but never override policy instructions.
- [ ] Make policy decisions deterministic and test them without a model call.
- [ ] Keep Presidio as an optional Phase 2 enhancement after the deterministic redactor is working; if added, run it before the local redactor and keep the local tests as the fail-safe boundary.

**Verification:** `pytest -q tests/tutor/test_policy.py tests/tutor/test_redaction.py`.

### Task 2.2: Expose read-only Relay tutor tools

**Files:**
- Create: `app/tutor/tools.py`
- Create: `tests/tutor/test_tools.py`

**Interfaces:**

```python
from typing import List, Optional, Protocol

def get_lesson_reference(module_id: str) -> Optional[TutorDocument]: ...
def get_glossary_reference(term: str) -> Optional[TutorDocument]: ...
def get_scheme_reference(currency: str, rail_name: Optional[str] = None) -> List[TutorDocument]: ...

class TutorToolRegistry(Protocol):
    def get_lesson_reference(self, module_id: str) -> Optional[TutorDocument]: ...
    def get_glossary_reference(self, term: str) -> Optional[TutorDocument]: ...
    def get_scheme_reference(self, currency: str, rail_name: Optional[str] = None) -> List[TutorDocument]: ...
```

- [ ] Validate all identifiers against known Relay catalogues before lookup. No tutor tool accepts a raw tracking identifier, URL, SQL fragment, or arbitrary user-supplied resource reference.
- [ ] Return sanitized, explanatory lesson, glossary, scheme, and tool data only. Tracking remains summary-only in the MVP; scheme results must preserve source metadata.
- [ ] Do not expose SQL, arbitrary endpoint URLs, filesystem access, network access, or mutation functions through the tutor tool registry.
- [ ] Test valid lookups, unknown identifiers, bounded lesson/tool data, and proof that the registry contains no mutating operation.

**Verification:** `pytest -q tests/tutor/test_tools.py tests/test_tracking.py tests/test_schemes.py`.

### Task 2.3: Implement the provider adapter and structured tutor engine

**Files:**
- Create: `app/tutor/engine.py`
- Create: `app/tutor/prompts.py`
- Create: `tests/tutor/test_engine.py`
- Modify: `pyproject.toml` optional AI dependencies

**Interfaces:**

```python
class TutorEngine(Protocol):
    async def answer(
        self,
        request: TutorRequest,
        documents: Sequence[RetrievedDocument],
        tools: TutorToolRegistry,
    ) -> TutorResponse: ...

def build_tutor_engine() -> TutorEngine: ...
```

- [ ] Build a provider adapter behind `TutorEngine`; the request path must not import provider-specific types outside `app/tutor/engine.py`. Provider imports must be lazy inside `build_tutor_engine()` or its provider factory so the base install boots without the `ai` extra.
- [ ] Configure a PydanticAI agent with `TutorModelOutput` as the output type and the read-only tool registry. The engine adds the server-generated `turn_id` and persistent simulation disclaimer chrome after model validation.
- [ ] Pass a typed `TutorToolRegistry` into the engine rather than letting the provider import or discover application services. The fake engine must receive the same registry interface.
- [ ] Include only redacted user text, bounded history, typed context, and retrieved evidence in the model input.
- [ ] Validate returned citations against the retrieved `source_id` set and require each citation’s `evidence` to be a verbatim substring of its cited document text. Remove unknown or false-evidence citations, set `grounded=false`, and replace an uncited factual answer with a safe clarification response.
- [ ] Apply an input-token budget after redaction and history formatting, before the provider call. Truncate oldest history turns first, then evidence, and return a clarification response if the current message alone exceeds the budget.
- [ ] Use `mode="hint"` to explain the next reasoning step without giving the final answer; use `mode="quiz"` to return one question and not its answer unless the learner asks to reveal it.
- [ ] Add a fake engine for deterministic tests. Tests must cover grounded output, unknown citation rejection, provider errors, policy refusal, and model-disabled behavior.

**Verification:** `pytest -q tests/tutor/test_engine.py`; run `ruff check app tests`.

## Phase 3: Expose the tutor API and telemetry

### Task 3.1: Add the learner-facing tutor endpoint

**Files:**
- Create: `app/routers/tutor.py`
- Create: `app/tutor/limits.py`
- Modify: `app/main.py`
- Create: `tests/test_tutor_api.py`
- Create: `tests/tutor/test_limits.py`

- [ ] Add `POST /api/tutor/chat` with `response_model=TutorResponse`.
- [ ] Flow: validate request → policy decision → retrieve locally from raw request text → redact and bound history/context for the model boundary → construct a read-only tool registry → run engine under a 20-second timeout → validate citations → emit redacted telemetry → return response.
- [ ] Enforce a configurable per-IP/session limit before provider work. Use an injectable limiter so tests are deterministic; the in-process limiter is a local/single-worker fallback and the deployment edge must enforce the limit for multi-worker production.
- [ ] Use the external Redis-compatible limiter in production, with an in-memory implementation only for local/tests. Derive the limiter key from the authenticated learner ID when available, otherwise from a trusted proxy address. Do not trust an arbitrary client-supplied `X-Forwarded-For` value.
- [ ] Return 503 when disabled/unconfigured or when production safeguards are missing, 422 for schema violations, 429 when the configured limit is exceeded, and 200 for policy refusals represented as a safe `TutorResponse`.
- [ ] Enforce a per-request output/token budget in the engine before production enablement; provider errors must not retry automatically in a way that bypasses the request limit.
- [ ] Convert timeout/provider failures into a stable tutor-unavailable response before Vercel’s 30-second function limit; never expose a raw platform 504 or return an ungrounded partial answer.
- [ ] Add request-size and history limits at the Pydantic boundary; do not add server-side transcript persistence.
- [ ] Register the router after the existing learner-facing routes and ensure OpenAPI describes the safety disclaimer.
- [ ] Test disabled, unconfigured, successful grounded response, refusal, unknown-source rejection, malformed provider response, and API response shape.

**Verification:** `pytest -q tests/test_tutor_api.py tests/test_disclaimers.py tests/test_frontdoor.py`.

### Task 3.2: Add privacy-safe tracing and feedback hooks

**Files:**
- Create: `app/tutor/telemetry.py`
- Create: `tests/tutor/test_telemetry.py`
- Modify: `app/config.py`
- Modify: `frontend/src/lib/analytics/analytics.ts` only for bounded event names, not message content

- [ ] Define `TutorTelemetry.record_run` with model name, mode, surface, source IDs, retrieval count, latency, token/cost fields when available, grounded flag, and error class.
- [ ] Exclude user message, assistant answer, result summary, account identifiers, and full retrieved text by default. Allow content capture only under an explicit local-development flag.
- [ ] Integrate Langfuse behind `TUTOR_TRACING_ENABLED`; provide a no-op implementation when the package/key is absent.
- [ ] Send the frontend feedback event through the existing `POST /api/telemetry` contract using the bounded event name `tutor_feedback` and only `turn_id`, `rating`, `surface`, and a bounded reason enum. Do not create a second feedback endpoint or send message text in analytics.
- [ ] **The no-free-text rule is already enforced structurally — rely on it, do not re-implement it.** `frontend/src/lib/analytics/analytics.ts` validates every identifier value against an allowlist (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), drops the entire event on violation, fails closed when a declared key is absent, and rejects non-object or prototype-inherited payloads. Verified 2026-08-14 against the real implementation: an actual `turn_id` (`str(uuid4())`, e.g. `b7a66317-f6ea-4d22-adec-b0600d67c148`), `surface`, `rating` and a kebab-case reason all pass; free text, `<script>` payloads and path traversal are all blocked. Message text cannot reach telemetry even if a caller casts around the types.
- [ ] **Constraint that follows: `turn_id` must stay lowercase.** The allowlist rejects uppercase, so an uppercased UUID would make the feedback event vanish silently rather than error. `uuid4()` stringifies lowercase today — pin that with a test rather than relying on it.
- [ ] Test that telemetry payloads contain source IDs but no redaction-sensitive strings.

**Verification:** `pytest -q tests/tutor/test_telemetry.py` and `cd frontend && npm test -- --run src/lib/analytics/analytics.test.ts`.

## Phase 4: Build the React tutor experience

### Task 4.1: Add the reusable tutor panel

**Files:**
- Create: `frontend/src/features/tutor/TutorPanel.tsx`
- Create: `frontend/src/features/tutor/TutorPanel.css`
- Create: `frontend/src/features/tutor/tutorContext.ts`
- Create: `frontend/src/features/tutor/TutorPanel.test.tsx`
- Modify: `frontend/src/api/schemas.ts`
- Modify: `frontend/src/api/queryKeys.ts` only if a query key is needed for feedback

- [ ] Implement `TutorPanel` props as:

```ts
type TutorPanelProps = {
  context: TutorContext;
  initialMode?: TutorMode;
  compact?: boolean;
};
```

- [ ] Keep messages in component state, cap submitted history at eight turns, and retain history only when `surface` and the primary resource identity are unchanged. Clear it when the learner switches module, currency/rail, tracking summary, or tool.
- [ ] Use `apiPost<TutorResponse, TutorRequest>` and the Zod response schema; show loading, provider-disabled, error, refusal, empty-citation, and grounded-answer states.
- [ ] Render citations as accessible links with source title and evidence; visually distinguish Relay-authored educational content from official sources.
- [ ] Provide buttons for Explain, Hint, Quiz, and Ask; keyboard focus must remain usable after responses arrive.
- [ ] Add thumbs-up/down feedback without sending message text.
- [ ] Test MSW success/error/refusal states, mode selection, bounded history, citations, keyboard interaction, and feedback payload.

#### Design specification (added by the 2026-08-14 design review)

Calibrated against `DESIGN.md`. Approved placement mockups live in
`~/.gstack/projects/swift-routing/designs/tutor-panel-placement-20260814/`.

- [ ] **Placement — approved hybrid.** Right-docked drawer at `≥1024px`, 380px wide, full height below the top bar, separated by a single 1px `--color-border`. Below `1024px`, render the same component inline in document flow. Reuse the existing `1024px` breakpoint where `AppShell` already swaps the rail for the bottom nav; do not introduce a second boundary.
- [ ] **Mobile.** Inline only. No overlay, no scroll lock, no focus trap, no z-index. `main` already carries `padding-bottom: 76px`, which clears the 64px fixed bottom nav, so the panel needs no bottom-nav handling of its own.
- [ ] **No streaming — this is a constraint, not a preference.** Task 2.3 validates citations *after* the model returns and may replace an uncited factual answer with a clarification. Text that streams cannot be retracted, so streaming would show the learner an answer the validator then withdraws. Render the full validated response in one commit. Show a determinate `Thinking…` state in the conversation area while waiting.
- [ ] **Reuse `AsyncRegion`** (`design-system/AsyncRegion.tsx`) for loading, empty, error, and partial rather than re-implementing them. `partialNote` carries the empty-citation case; `emptyMessage` plus `emptyActionLabel` carry first open.
- [ ] **First-open empty state.** The six listed states omit "panel opened, nothing asked yet." Specify: one line of context naming what the tutor can explain on this surface, plus the Explain button as the single primary action. No welcome copy (`DESIGN.md` content rules).
- [ ] **Focus.** Opening moves focus to the panel heading; closing restores focus to the launcher that opened it. Neither mode traps focus — the drawer is non-modal and the page behind stays operable. `Escape` closes the drawer only; inline mode has nothing to close.
- [ ] **Motion.** Drawer entry animates `transform` and `opacity` only, 160ms ease-out. Under `prefers-reduced-motion: reduce` the drawer appears without travel, matching the existing handling in `global.css`, `tokens.css`, `Button.css`, and `PaymentRoute.css`. Never `transition: all`.
- [ ] **Simulation disclaimer is chrome, not model output.** Plan line 317 asks the system prompt to include it, which makes a standing product disclaimer contingent on model compliance. Render it as persistent panel chrome instead, matching the existing app banner.
- [ ] **History truncation is visible.** Submitted history caps at eight turns. When turn nine evicts turn one, show a single muted line at the top of the conversation stating that earlier turns are no longer being sent. Silent truncation misrepresents what the tutor can still see.
- [ ] **Tokens only.** `TutorPanel.css` consumes `design-system/tokens.css` variables. No new hex values. Citations render as links, never as cards (`DESIGN.md` card rule). Identifiers use IBM Plex Mono; prose uses Instrument Sans.
- [ ] Test both placements at 1024px and 375px, focus restoration to the launcher, the reduced-motion path, the first-open empty state, and the truncation notice.

**Verification:** `cd frontend && npm test -- --run src/features/tutor/TutorPanel.test.tsx`.

### Task 4.2: Integrate contextual tutor entry points

**Files:**
- Modify: `frontend/src/features/learn/LearnModulePage.tsx`
- Modify: `frontend/src/features/operate/tracking/TrackingPage.tsx`
- Modify: `frontend/src/features/explore/ExplorePage.tsx` only through the existing schemes page boundary
- Modify: `frontend/src/features/tutor/tutorContext.ts`
- Create: `frontend/src/features/tutor/TutorLauncher.tsx`
- Create: `frontend/src/features/tutor/TutorLauncher.test.tsx`

- [ ] Add a tutor launcher to lesson pages with module ID/title/topic context and no raw DOM content.
- [ ] Add “Explain this timeline” to TrackingPage with a summary containing only current visible status, event names, currency, and non-sensitive amounts; never include the full raw response, hidden events, or a tracking identifier. The MVP explains the visible summary and does not perform a live tracking lookup.
- [ ] Add “Explain this rail” to the scheme detail surface with the schema’s `currency` and `rail_name`, a bounded summary, and source IDs; preserve existing tab behavior.
- [ ] Keep tutor panels lazy-loaded so the existing initial bundle does not load AI UI on unrelated routes.
- [ ] Test context builders directly: exact allowed fields, bounded lengths, redaction, and correct surface/module IDs.
- [ ] Test the three entry points and verify existing lesson/tracking/scheme tests remain unchanged.

**Verification:** `cd frontend && npm test -- --run src/features/tutor src/features/learn/LearnModulePage.test.tsx src/features/operate/tracking/TrackingPage.test.tsx src/features/explore/ExplorePage.test.tsx`.

## Phase 5: Adaptive learning and evaluation

### Task 5.1: Add learner-aware hints without storing transcripts

**Files:**
- Modify: `frontend/src/features/learn/practice/practiceStore.ts` only to expose a bounded summary helper
- Create: `frontend/src/features/tutor/tutorLearnerContext.ts`
- Create: `frontend/src/features/tutor/tutorLearnerContext.test.ts`
- Modify: `frontend/src/features/tutor/TutorPanel.tsx`

- [ ] Build a bounded learner summary from completed modules, recent practice misses, and current module; never send the full practice history.
- [ ] Add a “recommended next concept” response path driven by deterministic progress data plus retrieved lesson cards.
- [ ] Recommend the next concept from deterministic progress data. Do not claim to explain why an answer is incomplete unless the product later records the learner’s answer and rubric.
- [ ] Test that sensitive/local-only state is excluded and that the same progress state produces stable context.

**Verification:** `cd frontend && npm test -- --run src/features/tutor/tutorLearnerContext.test.ts src/features/learn/practice/practiceStore.test.ts`.

### Task 5.2: Add a deterministic tutor golden set

**Files:**
- Modify: `tests/tutor/retrieval_questions.json`
- Create: `tests/tutor/test_tutor_golden.py`
- Create: `scripts/run_tutor_eval.py`
- Modify: `pyproject.toml` to add the opt-in `eval` extra

- [ ] Add at least 30 questions across glossary, rail comparison, tracking-summary explanation, VoP, fees, ISO 20022, hints, quizzes, refusal/safety, and out-of-scope live-payment requests.
- [ ] Extend the single `tests/tutor/retrieval_questions.json` fixture with expected answer concepts and mode-specific assertions; do not create a second question inventory.
- [ ] Each item must declare expected source IDs, required concepts, forbidden claims, mode, and whether a refusal/clarification is expected.
- [ ] Run the fake engine in ordinary CI to validate contract, citation, refusal, and required-concept logic without a model call.
- [ ] Add an opt-in model evaluation command that reports citation validity, groundedness, answer relevance, and refusal correctness. Use Ragas metrics for retrieval/faithfulness evaluation; never fail the normal unit suite because a provider is unavailable.
- [ ] Store aggregate scores only; never commit real learner prompts, API keys, or model transcripts. Authored evaluation questions are permitted as fixtures.

**Verification:** `pytest -q tests/tutor/test_tutor_golden.py`; optionally run `python scripts/run_tutor_eval.py --provider live --output /tmp/relay-tutor-eval.json` when credentials are configured.

### Task 5.3: Add model/provider regression checks

**Files:**
- Create: `tests/tutor/test_provider_contract.py`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] Add a fake-provider contract test that every provider adapter returns `TutorResponse` and cannot execute a mutating tool.
- [ ] Add an optional CI job guarded by a secret/environment flag for live evaluation; default CI must run only deterministic tests.
- [ ] Document the selected provider, environment variables, optional dependencies, redaction behavior, citation contract, and how to run the live evaluation.

**Verification:** Run the full backend and frontend suites, plus the optional job only when explicitly enabled.

## Phase 6: Production hardening and measured retrieval upgrade

### Task 6.1: Finalize provider health, spend, and deployment controls

**Files:**
- Modify: `app/config.py`
- Modify: `app/tutor/limits.py`
- Modify: `app/tutor/engine.py`
- Create: `tests/tutor/test_provider_health.py`
- Modify: `README.md` to document the deployment rate-limit requirement

- [ ] Configure the production edge limit and verify that it agrees with the application fallback; use authenticated learner identity when available and a trusted proxy IP otherwise.
- [ ] Refuse production tutor enablement when either Redis limiter credentials or the provider spend ceiling is missing; local/test mode may use injected fakes.
- [ ] Add provider timeout, bounded retry policy, and a circuit-breaker/health fallback. When the provider is unavailable, return a safe disabled/unavailable response and never answer from an ungrounded model output.
- [ ] Configure a per-request output/token budget and a deployment-level spend alert or hard ceiling; record model, token, latency, and error metrics without content.
- [ ] Add LiteLLM only if the project needs multiple model providers, fallback routing, or spend controls; do not add it to the MVP by default.

**Verification:** `pytest -q tests/tutor/test_limits.py tests/tutor/test_provider_health.py tests/test_tutor_api.py` and verify the configured edge limit with a staging smoke test.

### Task 6.2: Adopt pgvector only when the retrieval gate passes

**Files:**
- Modify: `app/models.py`
- Add: `alembic/versions/20260813_add_tutor_documents.py`
- Create: `app/tutor/vector_retrieval.py`
- Create: `scripts/index_tutor_knowledge.py`
- Create: `tests/tutor/test_vector_retrieval.py`

- [ ] Add a `tutor_documents` table with stable source ID, text, metadata JSON, embedding, and verification timestamp only after Phase 1 measurements meet the adoption gate.
- [ ] Keep source metadata and lexical fallback available so an embedding outage does not make the tutor fabricate answers.
- [ ] Add metadata filters for module, topic, currency, source kind, and verified date.
- [ ] Compare lexical and vector top-k results against the golden set before switching production traffic.

**Verification:** Run the migration smoke test, indexing script against a disposable database, vector retrieval tests, and the retrieval benchmark. Do not add this phase merely because a vector database is fashionable.

## Phase 7: Dark mode across the app

> **Scope note.** Dark mode has no dependency on the tutor and no tutor task depends on
> it. It is bundled here at the author's request. Phases 0-6 remain shippable without
> Phase 7, and Phase 7 is shippable without Phases 0-6. If the tutor slips, cut this
> phase rather than blocking on it.

Measured readiness (verified 2026-08-14 against `613ae6e`): `frontend/src/design-system/tokens.css`
is a single `:root` block (lines 9-93). Across 25 CSS files there is exactly **one**
hardcoded color outside that file, and it is a variable fallback
(`OperateTools.css:323`, `var(--color-border, #d8d8d8)`). There are **zero** hardcoded
colors in TSX. `PaymentRoute.css` — the design system's stated visual signature — uses 48
token references and no literals. The app is already fully tokenized, so dark mode is a
token exercise, not a repaint.

### Task 7.1: Add the dark palette and theme plumbing

**Files:**
- Modify: `frontend/src/design-system/tokens.css`
- Modify: `frontend/src/design-system/global.css`
- Modify: `frontend/src/design-system/types.ts`
- Modify: `frontend/src/lib/persistence/storage.ts`
- Create: `frontend/src/design-system/theme.ts`
- Create: `frontend/src/design-system/theme.test.ts`

- [ ] Add a `RelayTheme = "system" | "light" | "dark"` type. Three states, not a boolean: "system" must remain distinguishable from an explicit choice, because only "system" follows `prefers-color-scheme` when the OS flips.
- [ ] Resolve theme onto `<html>` as `data-theme="light" | "dark"`, and stamp nothing for "system". Define the complete light palette on bare `:root`; redefine only the changed tokens under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`; redefine them again under `:root[data-theme="dark"]` so an explicit choice wins in both directions. A token whose only definition lives inside a media query breaks the toggle.
- [ ] Set the CSS `color-scheme` property per theme so native scrollbars, form controls, and the browser's own canvas follow. Without it, native widgets stay light on a dark page.
- [ ] **Derive dark semantic colors independently — do not invert.** The current `--color-success` `#0e5c44`, `--color-warning` `#9a5a0c`, and `--color-danger` `#9e2b34` were deliberately *darkened* to clear AA against light tinted backgrounds. On a dark surface those same values fail. Each needs a lighter dark-mode counterpart with its own measured ratio against its dark `-bg`.
- [ ] Dark surfaces express depth through elevation steps (`--color-surface`, `-2`, `-3` getting progressively lighter), not by inverting lightness. Body text is off-white (around `#E4E7EC`), never pure white. Desaturate `--color-action` 10-20% for dark so `#3157D5` does not vibrate against a dark canvas.
- [ ] Replace the `var(--color-border, #d8d8d8)` fallback at `OperateTools.css:323` with the bare token. A light-gray fallback is wrong in dark mode on the one path where it fires.
- [ ] Give the skeleton shimmer at `global.css:106` a dark variant. It is a `linear-gradient` of literal stops and will glow against a dark canvas otherwise.

**Verification:** `cd frontend && npm test -- --run src/design-system/theme.test.ts`.

#### Measured palette and the border decision (added by the 2026-08-14 design review)

This palette was built and measured against WCAG 2.2, then rendered on the running app.
19 of 23 pairings pass. Use it as the starting point rather than deriving a new one.

| Token | Dark value | Measured |
|---|---|---|
| `--color-canvas` | `#0f1420` | base |
| `--color-surface` | `#161d2b` | elevation step vs canvas is only **1.09** — widen it, see below |
| `--color-surface-2` | `#1e2635` | 1.11 vs surface |
| `--color-surface-3` | `#273040` | 1.14 vs surface-2 |
| `--color-border` | `#2f3a4d` | 1.61 on canvas |
| `--color-border-strong` | `#445266` | 2.32 on canvas |
| `--color-ink-strong` | `#e8ebf0` | 15.40 on canvas |
| `--color-ink` | `#d2d8e2` | 12.85 on canvas |
| `--color-ink-muted` | `#98a3b5` | 7.22 on canvas, 5.21 on surface-3 |
| `--color-action` | `#7b9bf0` | 6.83 on canvas, 6.26 on surface |
| `--color-action-surface` | `#1c2740` | action on it: 5.51 |
| `--color-on-action` | `#0f1420` | 6.83 on action |
| `--color-success` / `-bg` | `#4ec99a` / `#10261f` | 7.69 |
| `--color-warning` / `-bg` | `#e0a54a` / `#2a1f0e` | 7.42 |
| `--color-danger` / `-bg` | `#f0808c` / `#2c1418` | 6.70 |

- [ ] **Borders match the light palette's perceptual weight — decided, do not re-litigate.** WCAG 1.4.11 wants 3:1 for boundaries that identify a control. Clearing that in dark needs roughly `#5d636a` or lighter, which is visibly heavier than the hairline `DESIGN.md` prescribes. The shipped light palette measures **1.23:1** (`--color-border`) and **1.51:1** (`--color-border-strong`), so it has never met that bar either. The dark values above (1.61 and 2.32) are already better than what ships today. Keeping the two themes at matching weight preserves one product; raising only dark would split them.
- [ ] **Correct the claim in `DESIGN.md` rather than leaving it false.** It currently says "All text and interactive boundaries meet WCAG 2.2 AA contrast." Text does, in both themes, with room to spare. Boundaries do not, in either theme. Restate it accurately and record the boundary gap as known and tracked. An unverified compliance claim is worse than a documented gap.
- [ ] **Widen the canvas-to-surface elevation step.** At 1.09 the first elevation level is essentially imperceptible, which matters more in dark than light because elevation is doing the work shadows would otherwise do — and `DESIGN.md` bans shadows. Darken canvas or lighten surface until the step clears 1.15.
- [ ] Keep the contrast suite honest: assert the boundary ratios at their **actual** values with a comment explaining they are intentionally below 3:1, so a future change cannot quietly make them worse without failing a test.

#### Theme-change behavior (added by the 2026-08-14 design review)

- [ ] **OS theme change while the app is open.** In System mode the UI follows the OS live via a `matchMedia` change listener, not only on reload. A learner who flips their OS to dark at dusk should not have to reload Relay. In Light or Dark mode the listener is ignored.
- [ ] **Theme transition.** Switching themes crossfades `background-color` and `color` over 120ms so a dense data screen does not flash. Under `prefers-reduced-motion: reduce` the swap is instant. Never `transition: all` — name the two properties, per the existing rule.
- [ ] Test both: a simulated `matchMedia` change updates the UI in System mode and does not in an explicit mode; the transition is suppressed under reduced motion.

### Task 7.2: Persist the preference without resetting existing users

**Files:**
- Modify: `frontend/src/lib/persistence/storage.ts`
- Modify: `frontend/src/lib/persistence/persistence.test.ts`
- Modify: `index.html` (pre-paint theme script)

- [ ] Add `theme: RelayTheme` to `RelayPreferences` (`design-system/types.ts:75`) and to `defaultPreferences` as `"system"`.
- [ ] **Keep `schemaVersion: 1`.** `loadVersioned` (`storage.ts:254`) rejects anything whose `schemaVersion !== 1` and returns the fallback wholesale, so bumping to 2 would silently reset every existing user's `reducedMotion`, `navigationDensity`, and `firstRunGuidanceSeen` — and re-trigger first-run guidance for everyone.
- [ ] **Read `theme` defensively.** `loadVersioned` does a blind `return parsed as T` with no merge against defaults, so every user with preferences stored before this change loads `theme === undefined` while the type claims otherwise. Coerce an unrecognized or missing value to `"system"` at the read boundary. Test this exact case with a pre-existing preferences object that has no `theme` key.
- [ ] Apply the resolved theme in a small inline script in `index.html` before first paint. Applying it from React means a flash of light theme on every load for dark-mode users.
- [ ] Test: default is `"system"`; an explicit choice survives reload; a corrupt or unknown theme value falls back to `"system"`; a legacy preferences object without `theme` loads without resetting its other fields.

**Verification:** `cd frontend && npm test -- --run src/lib/persistence/persistence.test.ts`.

### Task 7.3: Expose the control

**Files:**
- Modify: `frontend/src/app-shell/AppShell.tsx`
- Modify: `frontend/src/app-shell/AppShell.css`
- Modify: `frontend/src/app-shell/AppShell.test.tsx`

> **SUPERSEDED 2026-08-14, later the same day.** A prior pass recorded "segmented control in
> the top bar, chosen over a preferences menu and a full Settings route." The author has since
> directed the opposite: build **both** the quick menu and the Settings route. If you authored
> the superseded decision, reconcile with the author before reverting — do not silently
> restore it. The reasoning for the change is the four-homeless-things table below, which the
> superseded version acknowledged and accepted as a known cost.

**DECIDED 2026-08-14: quick menu AND settings route, composed.** They are not alternatives.
The menu is the one-click path for the preference people actually change; the route is the
durable home that scales. The menu ends in "All settings →" which opens the route. Wireframe:
`~/.gstack/projects/swift-routing/designs/theme-control-20260814/theme-control.html`.

- [ ] **Desktop (`≥1024px`): a three-segment control in the top bar** — `System | Light | Dark`, each segment carrying both an icon and a text label. The active segment uses `--color-action-surface` with `--color-action` text, matching how the nav rail marks selection. Roughly 190px of top-bar width.
- [ ] **Mobile (`<1024px`): the labels do not fit.** A 375px top bar holds the brand and little else, so the segmented control degrades to a single button showing the current state as icon plus short label (e.g. `◐ System`), opening a small popover with the three labelled options. Two controls, one behavior — test both.
- [ ] **Show what System resolved to.** When System is active, surface the resolved value (`System — Dark right now`) in the desktop control's accessible name and in the mobile popover. A bare "System" label cannot answer the question a user actually has, which is why the app is currently dark.
- [ ] Never an unlabelled icon that cycles. `DESIGN.md` requires status be carried by text, icon, and color together, and a cycling icon cannot express which of three states is active or what tapping will do next.
- [ ] Meet the 44×44px target rule on the mobile surface, matching the existing bottom nav.
- [ ] Announce the change to assistive technology and keep focus on the control after switching.

#### Why both surfaces, not one

Four things need a home and only one of them is new. This is what changed the decision:

| Thing | State today |
|---|---|
| `theme` | new in Task 7.2 |
| `reducedMotion` | persisted in `RelayPreferences`, rendered in no `.tsx` |
| `navigationDensity` | persisted in `RelayPreferences`, rendered in no `.tsx` |
| `LearnerDataPanel` | **finished component, commented out** at `OverviewPage.tsx:146` |

`CLAUDE.md` records the consequence of the last one: the learner-state round trip skips in
*every* Playwright project because the backup panel is hidden. Giving it a home un-skips a
test that today cannot run, and lowers the intentional-skip total `CLAUDE.md` warns against
quoting as a bare number. That payoff is concrete, not speculative.

- [ ] **One source of truth.** Both surfaces read and write the same `RelayPreferences`
      through the same store. Neither holds its own copy. A change in one is visible in the
      other without a reload.
- [ ] **Settings is NOT a nav item.** `DESIGN.md` defines the shell as four workspaces
      (Overview, Learn, Explore, Operate) and mobile as a four-item bottom bar. A fifth entry
      breaks that structure. The route is reachable from the preferences button only, via the
      menu's "All settings" item, with a breadcrumb back to Overview.

#### Quick menu (`PreferencesMenu.tsx`)

- [ ] One component, identical on every breakpoint — no breakpoint-specific variant, unlike
      the superseded segmented-control design which needed two.
- [ ] Contains the three-state appearance group, `Reduce motion`, and "All settings →".
      `navigationDensity` and learner data live in the route only; the menu stays short.
- [ ] Menu semantics: focus moves into the menu on open, `Escape` closes and restores focus
      to the trigger, outside-click closes, and the trigger reports its expanded state.
- [ ] 44×44px minimum on the trigger and every item, matching the bottom nav.

#### Settings route (`/app/settings`)

- [ ] **Appearance**: theme, reduce motion, compact navigation, each with a one-line
      explanation of what it actually changes.
- [ ] **Learner data**: the existing `LearnerDataPanel`, uncommented and moved here. State
      the storage boundary plainly — preferences and progress live in this browser only.
      That framing is what makes an export control legible.
- [ ] Lazy-load the route so it stays out of the eager shell, matching every other route in
      `App.tsx`, then re-run `npm run check:bundle`. Note: the name denylist in
      `frontend/scripts/check-bundle.mjs` is **inert** — Vite emits no `index.html` refs for
      dynamic chunks, so that list filters nothing (see the withdrawn T8). The gate still
      works correctly on the true eager set; do not rely on the filter.

#### Tests

- [ ] All three appearance states select, persist, and round-trip through both surfaces.
- [ ] Changing theme in the menu is reflected in the route without a reload, and vice versa.
- [ ] Menu keyboard path: open, arrow through, select, `Escape` restores focus to the trigger.
- [ ] The active state is programmatically determinable, not conveyed by color alone.
- [ ] The settings route renders `LearnerDataPanel` and its export/import still works.
- [ ] **Un-skip the learner-state E2E round trip** and confirm it passes now the panel has a
      home. Update the skip-count guidance in `CLAUDE.md`.
- [ ] Existing `AppShell` and `OverviewPage` tests pass unchanged.

**Verification:** `cd frontend && npm test -- --run src/app-shell src/features/settings src/features/overview && npm run build && npm run check:bundle`.

### Task 7.4: Prove it, and stop the palette from drifting again

**Files:**
- Modify: `frontend/src/design-system/contrast.test.ts`
- Modify: `DESIGN.md`
- Modify: `frontend/e2e` (theme coverage)

- [ ] Extend `contrast.test.ts` to assert every dark pairing at WCAG 2.2 AA. Note the existing drift risk: that file mirrors token values as a TypeScript literal with a "must match tokens.css" comment. Doubling the palette doubles the mirror. Prefer parsing `tokens.css` directly so the test cannot silently disagree with the shipped values, which is the same failure the light palette already had against `DESIGN.md`.
- [ ] Add a dark-mode section to `DESIGN.md` documenting both palettes, the three-state model, and the elevation-not-inversion rule. `DESIGN.md` currently says nothing about dark mode.
- [ ] Fix `learn-practice-strip`: it carries `border-left: 3px solid var(--color-action)`, which `DESIGN.md:112` bans ("no colored card edges"). Pre-existing in light, more prominent against a dark canvas. The 2px left edges on `app-shell__nav-link` are the active-selection indicator and are correct — leave those.
- [ ] Walk every surface in dark: Overview, Learn module, Learn practice, Case Desk, Explore search, bank detail, schemes, Prepare, the four Operate tools, and Tracking. Capture the `PaymentRoute` component specifically — it is the visual signature and carries the most color logic.
- [ ] Add E2E coverage for one dark-mode journey. Note this raises the intentional-skip total that `CLAUDE.md` warns about quoting as a bare number.
- [ ] Confirm the eager shell stays within the 200KB gzip budget; a second palette is additional CSS.

**Verification:** `cd frontend && npm test -- --run src/design-system/contrast.test.ts && npm run build && npm run check:bundle`.

## Phase 8: Final documentation and acceptance

### Task 8.1: Document the feature and run the full verification matrix

**Files:**
- Modify: `README.md`
- Modify: `docs/PROJECT_OVERVIEW.md`
- Create: `docs/superpowers/specs/2026-08-13-relay-ai-tutor.md`

- [ ] Document the tutor’s supported modes, API contract, context boundaries, citations, safety refusals, optional dependencies, and disabled-by-default behavior.
- [ ] Document the selected adoption decisions: PydanticAI provider adapter, lexical retrieval first, pgvector gate, Langfuse optional, Ragas opt-in, Presidio optional.
- [ ] Explain that the 500 AI Agents repository supplied patterns only; Relay’s production implementation remains native to the existing FastAPI/React architecture.
- [ ] Document dark mode: both palettes, the three-state System/Light/Dark model, where the control lives, and the elevation-not-inversion rule.
- [ ] Run `source .venv/bin/activate && pytest -q`.
- [ ] Run `source .venv/bin/activate && ruff check app tests`.
- [ ] Run `cd frontend && npm test -- --run`.
- [ ] Run `cd frontend && npm run build`.
- [ ] Run `cd frontend && npm run check:bundle`.
- [ ] Confirm the light palette is unchanged: `git diff main -- frontend/src/design-system/tokens.css` must show only additions under the dark selectors, with no edits to any bare `:root` value.
- [ ] Run `git diff --check` and inspect that no raw prompt, secret, or unrelated working-tree edit was added.

## Definition of Done

- Tutor is disabled by default and does not affect non-AI environments.
- Learners can ask for explanations, hints, quizzes, and contextual help from lessons, schemes, and tracking.
- Responses are structured, source-cited, bounded, and validated before delivery.
- The model can call only read-only Relay tools.
- Sensitive identifiers are redacted before external calls, and raw transcripts are not persisted.
- Retrieval is deterministic and measurable before any vector database is introduced.
- Ragas/Langfuse/Presidio are optional operational enhancements, not hidden runtime requirements.
- Existing backend/frontend tests and bundle budgets pass.
- The tutor never claims to authorize or execute a real payment.
- Every Relay surface renders correctly in dark mode, and the `PaymentRoute` signature is verified specifically.
- Theme is a three-state preference (System / Light / Dark) that survives reload, follows the OS only in System, and applies before first paint with no flash.
- Adding dark mode changed no light-mode color and reset no existing user's stored preferences.
- Text and semantic foreground/background pairings meet WCAG 2.2 AA, asserted by the same contrast suite that covers light. Non-text boundary ratios remain documented exceptions because the existing light palette also stays below 3:1.

## Implementation Tasks

Synthesized from the 2026-08-14 eng review. Each task derives from a specific
finding. Run with Claude Code or Codex; checkbox as you ship.

**Decisions locked for execution:** the plan contains two independently shippable
workstreams (tutor phases 0-6 and 8; dark-mode phase 7); Python is `>=3.10`;
`TutorModelOutput` splits from `TutorResponse`; the MVP is lesson/scheme/tool and
tracking-summary only; case tutoring and live tracking lookup are deferred; one
retrieval/evaluation fixture is used; provider imports are lazy; Vercel installs
`.[ai]`; and production rate limiting uses an external Redis-compatible adapter.

- [ ] **T1 (P1, human: ~2h / CC: ~10min)** — `app/tutor/schemas.py` — Split `TutorModelOutput` from `TutorResponse`
  - Surfaced by: Architecture issue 1 — line 317 makes `TutorResponse` the PydanticAI output type while line 117 requires a server-generated `turn_id`; the model would invent the UUID that feedback keys on.
  - Files: `app/tutor/schemas.py`, `app/tutor/engine.py`, `frontend/src/api/schemas.ts`
  - Verify: `pytest -q tests/tutor/test_schemas.py tests/tutor/test_engine.py`
- [x] **T2 (P1, human: ~4h / CC: ~20min)** — `pyproject.toml` — Raise the Python floor to `>=3.10` — **DONE 2026-08-14.** `requires-python = ">=3.10"`, ruff `target-version = "py310"`, CI matrix now `["3.10","3.11","3.12"]`, local venv rebuilt on 3.12.13. 736 backend tests pass, ruff clean. Verified `pydantic-ai 2.30.0` and `openai 3.0.0` now resolve.
  - Surfaced by: Step 0 dependency verification — `pydantic-ai` 2.29, `openai` 3.x, `langfuse`, `presidio-analyzer` and `pgvector` all require `>=3.10`; the plan's own fallback (direct provider client) also fails 3.9.
  - Files: `pyproject.toml` (`requires-python`, ruff `target-version`), `.github/workflows/ci.yml` (drop 3.9 from the matrix)
  - Verify: `ruff check app tests && pytest -q`
- [ ] **T3 (P1, human: ~3h / CC: ~15min)** — `app/tutor/engine.py` — Bound the engine timeout under the 30s Vercel cap
  - Surfaced by: Failure modes — the only critical gap with no test, no error handling, and a raw platform 504 shown to the learner. `vercel.json` sets `maxDuration: 30`.
  - Files: `app/tutor/engine.py`, `app/routers/tutor.py`, `tests/tutor/test_provider_health.py`
  - Verify: `pytest -q tests/tutor/test_provider_health.py`
- [x] **T4 (closed by scope decision)** — No MVP tracking lookup tool. Tracking entry points send only a bounded visible summary; revisit an authenticated opaque-reference design in a separate plan.
- [ ] **T5 (P1, human: ~2h / CC: ~10min)** — `app/tutor/engine.py` — Require citation `evidence` to be a verbatim substring
  - Surfaced by: Architecture issue 5 — line 320 validates `source_id` only, so a fabricated quote on a valid source renders to the learner as grounded via line 389.
  - Files: `app/tutor/engine.py`, `tests/tutor/test_engine.py`
  - Verify: `pytest -q tests/tutor/test_engine.py`
- [ ] **T6 (P1, human: ~2h / CC: ~10min)** — `app/routers/tutor.py` — Retrieve on raw text, redact at the model boundary
  - Surfaced by: Architecture issue 4 — line 338 orders redact before retrieve, so the BIC or UETR a learner asks about is a placeholder by the time retrieval runs; line 208 unit-tests raw text and diverges from runtime.
  - Files: `app/routers/tutor.py`, `app/tutor/retrieval.py`, `tests/test_tutor_api.py`
  - Verify: `pytest -q tests/test_tutor_api.py tests/tutor/test_retrieval.py`
- [x] **T7 (closed)** — Deployment constraints are now explicit above: Vercel uses the 20-second engine timeout, an external Redis-compatible limiter, and a separate durable-Postgres decision for pgvector.
- [x] ~~**T8 (P2)** — add the Tutor chunk to the eager-asset exclusion~~ **WITHDRAWN 2026-08-14: this finding was wrong.**
  - Originally surfaced by Code quality 2.1 as "`check-bundle.mjs:26` filters by a hardcoded chunk-name denylist, and no task edits the script." Measured against a real build, that premise is false.
  - `check-bundle.mjs` reads asset refs only from the built `index.html`, and Vite never emits refs there for dynamically imported chunks. A real build produces **46 chunks on disk** but exactly **3 refs in `index.html`** (eager entry JS, jsx-runtime, eager CSS). The `Settings` chunk appears **0 times**.
  - So the denylist (`Explore`, `Prepare`, `Fee`, `Screen`, `ValueDate`, `Stp`, `Track`, `Learn`) filters a 3-element list that never contains any of those names. **It has always been inert.** Adding `Tutor` would have been a no-op.
  - The gate itself is correct and worth keeping: it sums whatever `index.html` actually references, which is the true eager set. Only the name filter is vestigial. Do not treat that filter as a guard.
  - Verify: `cd frontend && npm run build && npm run check:bundle`
- [x] **T9 (closed)** — Task 1.3 creates the single retrieval fixture; Task 5.2 extends it with answer and mode assertions.
- [ ] **T10 (P2, human: ~1h / CC: ~5min)** — `app/config.py` — Name the module-attribute config pattern in Task 0.2
  - Surfaced by: Code quality 2.3 — `config.py` is bare module constants; `app/auth.py:21` documents that tests patch the module attribute, not `os.environ`. Unstated, so a `monkeypatch.setenv` test would pass for the wrong reason.
  - Files: `app/config.py`, `tests/tutor/test_config.py`
  - Verify: `pytest -q tests/tutor/test_config.py`
- [x] **T11 (closed)** — Tutor feedback uses the existing `POST /api/telemetry` contract with the bounded `tutor_feedback` event.
- [ ] **T12 (P2, human: ~1h / CC: ~5min)** — plan — Embed the request-pipeline and grounding state-machine diagrams
  - Surfaced by: Code quality 2.5 — the plan has 14 code fences and zero ASCII diagrams despite a 7-step pipeline and a 4-mode state model.
  - Files: this plan; mirror the pipeline diagram as a comment in `app/routers/tutor.py` and the state machine in `app/tutor/engine.py`
  - Verify: manual review
- [ ] **T13 (P2, human: ~15min / CC: ~2min)** — `vercel.json` — Exclude `scripts/**` from the function bundle
  - Surfaced by: Code quality 2.6 — `excludeFiles` omits `scripts/`, so the three new eval scripts ship to production.
  - Files: `vercel.json`
  - Verify: inspect the Vercel build output file list
- [ ] **T14 (P2, human: ~1h / CC: ~5min)** — `tests/tutor/test_limits.py` — Test that a spoofed `X-Forwarded-For` cannot reset the bucket
  - Surfaced by: Test review gap — line 340 states the rule but Task 3.1 lists no test proving it.
  - Files: `tests/tutor/test_limits.py`, `app/tutor/limits.py`
  - Verify: `pytest -q tests/tutor/test_limits.py`
- [ ] **T15 (P2, human: ~3h / CC: ~15min)** — `app/tutor/engine.py` — Add a response cache keyed on redacted message, context, and mode
  - Surfaced by: Performance 4.2 — no caching anywhere; a cohort working one module asks the same questions and each repeat is a full provider call.
  - Constraint: include catalogue revision and retrieved source IDs in the key; do not cache quiz responses or turns with non-empty history, and never cache raw prompts/transcripts.
  - Files: `app/tutor/engine.py`, `app/routers/tutor.py`
  - Verify: `pytest -q tests/tutor/test_engine.py`
- [ ] **T16 (P2, human: ~1h / CC: ~5min)** — `app/routers/tutor.py` — Add a per-request input token budget
  - Surfaced by: Performance 4.3 — line 342 bounds output only; input is 8 turns x 3,000 chars plus a 4,000-char summary plus 6 documents.
  - Files: `app/routers/tutor.py`, `app/tutor/engine.py`
  - Verify: `pytest -q tests/test_tutor_api.py`
- [ ] **T17 (P2, human: ~30min / CC: ~5min)** — `app/data/tutor_knowledge.py` — Build the catalogue once at import
  - Surfaced by: Performance 4.4 — `build_tutor_catalog()` returns `List[TutorDocument]`; per-request calls revalidate ~23 Pydantic models each time.
  - Files: `app/data/tutor_knowledge.py`, `app/tutor/retrieval.py`
  - Verify: `pytest -q tests/tutor/test_knowledge_catalog.py`
- [x] **T18 (closed by scope decision)** — The pgvector gate is intentionally dormant for the small MVP catalogue. It can trigger only after lesson-card growth or measured deployment latency justifies a durable Postgres migration.
- [ ] **T19 (P2, human: ~1h / CC: ~5min)** — `frontend/src/features/tutor/TutorPanel.tsx` — Guard double-submit
  - Surfaced by: Test review gap — Task 4.1 lists no double-click case; two provider calls double spend and race the panel.
  - Files: `frontend/src/features/tutor/TutorPanel.tsx`, `frontend/src/features/tutor/TutorPanel.test.tsx`
  - Verify: `cd frontend && npm test -- --run src/features/tutor/TutorPanel.test.tsx`
- [ ] **T20 (P2, human: ~3h / CC: ~20min)** — `frontend/e2e` — Add an E2E for lesson to ask to grounded citation
  - Surfaced by: Test review — user-flow coverage is 4/8; the core journey spans lesson page, panel, API, and citation render with no integration test.
  - Files: `frontend/e2e`
  - Verify: `cd frontend && npm run test:e2e`

### From the Codex outside voice (all verified against the repo)

- [ ] **T21 (P1, human: ~1d / CC: ~45min)** — `app/data/tutor_lesson_cards.py` — Ingest real lesson content into the catalogue
  - Surfaced by: Outside voice — lesson content is frontend-only (`frontend/src/features/learn/curriculum.ts`), so generic concept cards cannot ground "explain this lesson".
  - Files: `app/data/tutor_lesson_cards.py`, `app/data/tutor_knowledge.py`, `frontend/src/features/learn/curriculum.ts`
  - Verify: `pytest -q tests/tutor/test_knowledge_catalog.py`
- [ ] **T23 (P1, human: ~2h / CC: ~10min)** — `app/tutor/engine.py` — Lazy-import the provider so a base install still boots
  - Surfaced by: Outside voice — `app/main.py` includes the router at import and the router imports `engine.py`; line 316 restricts where provider types are imported, not when. A base install raises ImportError at startup, violating Global Constraint line 13.
  - Files: `app/tutor/engine.py`, `app/routers/tutor.py`, `app/main.py`, `tests/test_frontdoor.py`
  - Verify: install without the `ai` extra, then `pytest -q tests/test_frontdoor.py`
- [ ] **T24 (P1, human: ~2h / CC: ~10min)** — `vercel.json` — Give Vercel an install path for the optional `ai` extra
  - Surfaced by: Outside voice — the original `vercel.json` had no Python install command, so the `[ai]` extra could not install. The amended plan now requires `pip install '.[ai]'` in the Vercel function build.
  - Files: `vercel.json`, `pyproject.toml`
  - Verify: preview deployment with the flag enabled
- [ ] **T25 (P1, human: ~2h / CC: ~10min)** — `app/tutor/policy.py` — Treat client-supplied assistant history as untrusted
  - Surfaced by: Outside voice — `TutorTurn.role` is `Literal["user", "assistant"]` inside a client-supplied `history` list (lines 89-97). A caller can forge authoritative prior assistant turns. Line 255 marks retrieved documents and summaries untrusted but never history.
  - Files: `app/tutor/policy.py`, `app/tutor/prompts.py`, `tests/tutor/test_policy.py`
  - Verify: `pytest -q tests/tutor/test_policy.py`
- [x] **T28 (closed by scope decision)** — Task 5.1 recommends the next concept from progress metadata only; it does not explain an unseen learner answer or require changes to `practiceStore`.
- [ ] **T29 (P3, human: ~2h / CC: ~10min)** — `app/data/tutor_knowledge.py` — Give `verified_as_of` expiry behavior
  - Surfaced by: Outside voice — `verified_as_of` is metadata with no staleness enforcement, so stale payment-scheme claims could remain eligible for citations.
  - Files: `app/data/tutor_knowledge.py`, `app/data/payment_schemes.py`
  - Verify: `pytest -q tests/tutor/test_knowledge_catalog.py`

## Review closure

The amended plan is cleared for implementation with these decisions locked:

- Python is `>=3.10`; CI and packaging change together.
- `TutorModelOutput` is the provider contract; the server adds `turn_id` and persistent disclaimer chrome.
- The MVP grounds lessons, schemes, tools, and bounded tracking summaries. Live tracking lookup and case tutoring are deferred.
- Lesson cards are added to the backend catalogue before the tutor endpoint ships.
- Retrieval runs locally on the raw request, then redaction and input budgeting happen at the provider boundary.
- Provider imports are lazy, Vercel installs `.[ai]`, and production rate limiting is external Redis-compatible infrastructure.
- Client history is quoted untrusted context; citation evidence must be a verbatim document substring.
- Tutor feedback uses the existing telemetry endpoint, and one shared retrieval/evaluation fixture is used.
- Dark mode is independently shippable. Text and semantic pairings must meet WCAG AA; non-text boundary exceptions are documented and tested at their actual ratios.

**VERDICT: READY FOR IMPLEMENTATION.** Execute the phases in order, keeping Phase 7
independent from the tutor workstream. Do not enable the tutor in production until the
provider key, external rate limiter, 20-second timeout, spend ceiling, and Vercel build
profile have all been verified in staging.
