# MT103 → ISO 20022 Reframe — Design

**Date:** 2026-07-18
**Status:** Approved (design), pending implementation plan
**Author:** Relay team

## Problem

Relay's entire straight-through-processing (STP) lesson teaches the SWIFT **MT103**
message as *the* correspondent-banking payment instruction. As of **22 November 2025**
the SWIFT CBPR+ cross-border coexistence period ended: MT103 / MT202(COV) were retired
for cross-border payment instructions and replaced by their ISO 20022 equivalents
(`pacs.008.001.xx` / `pacs.009`) on the FINplus service. An MT→MX conversion service
exists only as a temporary fallback.

Consequence: Relay currently teaches a legacy standard as if it were current, with no
mention of ISO 20022. This is both a correctness gap and a missed opportunity — the
migration itself is the single most current, real-world-relevant lesson a learner will
hit at any bank today.

Two adjacent facts make this timely:

- **Nov 2026 structured-address mandate:** SWIFT will accept only fully structured or
  hybrid postal addresses in payment messages. This directly connects to the existing
  Travel-Rule / data-completeness teaching (a country-only address like "USA" passes
  "field not empty" but fails the real intent and triggers a request-for-information).
- The existing STP checker overstates itself ("the 12 validation rules a correspondent
  bank applies"). This work folds in `IMPLEMENTATION_PLAN.md` item 3.4 (relabel +
  expand + add the missing REPAIRABLE-path tests).

## Non-goals

- Not producing schema-validated pacs.008 (no official XSD conformance). Output is
  **illustrative structured XML** — real element hierarchy and namespaces, honest
  "primer" framing consistent with the existing 12-rule STP checker.
- Not removing MT103. The lesson is the *migration*; MT103 stays as the "before".
- Not building `pacs.009` (COV / bank-to-bank). Scope is `pacs.008` (customer credit
  transfer), the MT103 analogue.
- No unrelated refactor of `stp_checker.py` beyond the docstring relabel and the
  new tests it already needs.

## Governing invariant

Existing MT103 STP behavior is unchanged byte-for-byte. `check_stp` keeps its 12 rules,
its verdict logic, and its response shape. All ISO 20022 capability is **additive** —
new service, new endpoints, new lab, new tool toggle. No existing endpoint changes its
contract.

## Architecture

Router → Service → (no DB) layering, matching the codebase. New logic is a pure,
DB-free service module tested without a database, like the other `services/*`.

```
frontend (Lab 8 + StpPage toggle)
   │  apiPost, Zod-validated
   ▼
app/routers/analytics.py
   POST /api/message/translate       → iso20022.translate_mt103_to_pacs008
   POST /api/message/pacs008-check    → iso20022.validate_pacs008
   ▼
app/services/iso20022.py  (pure functions, no Session needed)
   ▲
   reuses app/services/validator.validate_bic
```

## Backend

### New service: `app/services/iso20022.py`

Honest primer framing in the module docstring: illustrative, not XSD-validated; names
the 22 Nov 2025 coexistence end and the Nov 2026 structured-address milestone.

**`translate_mt103_to_pacs008(message: dict) -> Pacs008Result`**

- Input: the **same MT103 dict shape** `stp_checker.check_stp` already consumes
  (`tx_ref`, `value_date`/`currency`/`amount` for 32A, `ordering`, `beneficiary`,
  `charge_code`, `uetr`, `instructed_currency`, `remittance`, ...). No new input contract
  for callers who already build MT103 dicts.
- Output object with two parts:
  1. `mapping`: ordered list of entries
     `{ mt_tag, mt_label, iso_path, iso_label, value }`. Baseline mapping set:

     | MT tag | ISO 20022 path | Note |
     |---|---|---|
     | 20 (Sender's Ref) | `PmtId/InstrId` (+ `EndToEndId`) | |
     | 121 (UETR) | `PmtId/UETR` | UUID travels unchanged |
     | 23B (Bank Op Code) | `PmtTpInf` / (no direct 1:1) | note: concept re-expressed, not a field copy |
     | 32A (Val date/ccy/amt) | `IntrBkSttlmDt` + `IntrBkSttlmAmt @Ccy` | |
     | 33B (Instructed amt) | `InstdAmt @Ccy` | |
     | 50K/A/F (Ordering) | `Dbtr` (+ `DbtrAcct`, `DbtrAgt`) | structured `PstlAdr` |
     | 59/59A/59F (Beneficiary) | `Cdtr` (+ `CdtrAcct`, `CdtrAgt`) | structured `PstlAdr` |
     | 71A (Charges) | `ChrgBr` (DEBT/CRED/SHAR) | OUR→DEBT, BEN→CRED, SHA→SHAR |
     | 71F/71G | `ChrgsInf` | sender/receiver charges |
     | 70 (Remittance) | `RmtInf/Ustrd` | |
     | 72 (Sender→Receiver) | `InstrForNxtAgt` / `InstrForCdtrAgt` | |

  2. `xml`: illustrative well-formed pacs.008 string —
     `Document/FIToFICstmrCdtTrf/{GrpHdr, CdtTrfTxInf/{PmtId, IntrBkSttlmAmt, ChrgBr,
     Dbtr/PstlAdr, DbtrAcct, DbtrAgt, Cdtr/PstlAdr, CdtrAcct, CdtrAgt, RmtInf}}` with the
     `urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08` namespace. Escaped values.

**`validate_pacs008(document: dict) -> Pacs008Result`**

Same severity/finding shape as `STPResult` (`findings[] {rule, tag, severity, message,
repair}`, `passes`, verdict CLEAN/REPAIRABLE/REJECTED). Rules (tight, current):

1. **Structured `PstlAdr` completeness** — reject a country-only address (no
   `StrtNm`/`TwnNm`). Severity **warning → REPAIRABLE**. Teaches the Nov-2026 mandate +
   the Travel-Rule data-completeness intent. Repair text explains the request-for-information.
2. **`BICFI` agent** present and valid (reuse `validator.validate_bic`; 8-char accepted).
   Severity error.
3. **`IntrBkSttlmAmt`** currency present, amount > 0, and (if `InstdAmt` present) currency
   consistency. Severity error on missing/zero; warning on instructed/settled ccy mismatch.
4. **`Dbtr` / `Cdtr` name** present. Severity error.

Docstring states this is a primer (production ISO 20022 validation is far larger).

### Schemas: `app/schemas.py`

- `TranslateRequest` (reuses the MT103-shaped payload the STP endpoint already accepts).
- `Pacs008MappingEntry`, `TranslateResponse { mapping[], xml, disclaimer }`.
- `Pacs008CheckRequest`, `Pacs008CheckResponse { verdict, passes, findings[], disclaimer }`.
- SIMULATION disclaimer string present on both payment-shaped responses (project rule).

### Router: `app/routers/analytics.py`

Add next to `/message/stp-check`:

- `POST /api/message/translate` → `TranslateResponse`
- `POST /api/message/pacs008-check` → `Pacs008CheckResponse`

Thin: validation + error mapping only; logic in the service.

### Relabel (folds in item 3.4.3)

`stp_checker.py` module + `check_stp` docstrings: change "the 12 validation rules a
correspondent bank applies" → "a 12-rule STP primer (production engines run 40–80+).
MT103 was retired for cross-border on 22 Nov 2025; see the ISO 20022 pacs.008 lesson."

## Frontend

### Curriculum: `frontend/src/features/learn/curriculum.ts`

New `lab-8`:

- id `lab-8`, title **"Message Standards: MT103 → ISO 20022"**,
  subtitle "How the correspondent-banking message changed in 2025."
- `prerequisites: ["lab-7"]`. Slots after Lab 7, before capstone. Capstone prerequisites
  unchanged (lab-8 is not required to reach the capstone; it is a standards deep-dive).
- Outcomes: read an MT103; map its fields to pacs.008; explain why the switch happened
  and when; identify a structured-address failure.

### `Lab8Content.tsx` + registration in `labRegistry.tsx`

Lazy-loaded (existing pattern). Checkpoint-gated completion via `useLabCompletion` +
`CORE_LAB_PARITY` checkpoint set. Sections, reusing existing `learn/components`:

1. **Decompose** a sample MT103 message (existing `Decompose`).
2. **Field-mapping exercise** — match MT tag → ISO element via `MultipleChoice`
   (e.g. "Where does field 59 go in pacs.008?" → `Cdtr`). Fires checkpoint.
3. **Side-by-side** MT103 text vs pacs.008 XML — new small mono code-view component,
   `AsyncRegion`-wrapped, calls `POST /message/translate`. Shows the mapping table too.
4. **Timeline callout** — Mar 2023 coexistence start · **22 Nov 2025 cross-border MT
   retired** · Nov 2026 structured-address mandate. Static, dated.
5. **Structured-address fat-finger** — learner enters a country-only address, submits to
   `POST /message/pacs008-check`, watches it return REPAIRABLE with the request-for-
   information explanation. The lesson's "aha". Fires completion checkpoint.

### Operate: `frontend/src/features/operate/tools/StpPage.tsx`

Add a **"View as pacs.008"** toggle. When on, calls `/message/translate` with the same
form payload the STP check uses and renders the mapping table + illustrative XML in the
shared code-view component. No change to the existing STP-check flow when the toggle is off.

### API layer: `frontend/src/api/`

Zod schemas for `TranslateResponse` and `Pacs008CheckResponse`; query keys; `apiPost`
wrappers. Match existing typed-client conventions.

## Data flow

Lab 8 / StpPage → `apiPost` → analytics router → `iso20022` service (pure) → Zod-validated
response → `AsyncRegion`-rendered UI. No new persistence. Progress via the existing
checkpoint/localStorage system.

## Error handling

- Malformed MT103 dict → 422 with field detail (FastAPI/Pydantic), surfaced by
  `AsyncRegion` error state.
- `validate_pacs008` never throws on business-rule failure — failures are findings, same
  as `stp_checker`. Verdict downgrades CLEAN→REPAIRABLE→REJECTED.
- Frontend: `AsyncRegion` handles idle/loading/error/empty/success; network error shows
  retry.

## Testing

**Backend (pytest, in-memory, no DB needed for the service):**

- `translate_mt103_to_pacs008`: every mapping row produced; XML well-formed and escaped;
  charge-code translation OUR→DEBT / BEN→CRED / SHA→SHAR; UETR carried to `PmtId/UETR`.
- `validate_pacs008`: each rule pass + fail; country-only address → REPAIRABLE with
  repair text; missing BIC → REJECTED; zero amount → REJECTED; instructed/settled ccy
  mismatch → warning.
- Endpoint tests for `/message/translate` and `/message/pacs008-check` incl. disclaimer
  present and SIMULATION framing.
- **Missing STP tests (item 3.4.4):** add REPAIRABLE-verdict assertions and rules 10–12
  coverage to the existing STP checker suite (currently only CLEAN and REJECTED asserted).

**Frontend (Vitest + RTL + MSW):**

- MSW handlers for both new endpoints.
- Lab 8: mapping exercise checkpoint fires; structured-address failure path renders the
  hold; completion marks only when all checkpoints fire.
- StpPage: toggle on renders mapping + XML; toggle off leaves STP flow unchanged.

**E2E (Playwright + axe):** lab-8 smoke (navigate, complete a checkpoint) + axe pass.

**Bundle:** Lab 8 lazy-loaded; `scripts/check:bundle` stays green.

## Rollout / sequencing

One commit per item, `type(scope): description` messages:

1. `feat(iso20022): MT103→pacs.008 translator service + tests`
2. `feat(iso20022): pacs.008 structured-field validator + tests`
3. `feat(api): /message/translate + /message/pacs008-check endpoints + schemas`
4. `test(stp): add REPAIRABLE-path + rules 10-12 coverage; relabel docstring (3.4)`
5. `feat(learn): Lab 8 Message Standards MT103→ISO 20022`
6. `feat(operate): pacs.008 view toggle on STP tool`
7. `test(e2e): lab-8 smoke + axe`

TDD per repo convention: failing test first for each service function.

## Open questions

None blocking. Validator rule set is intentionally tight (4 rules) and can grow later
without contract change.
