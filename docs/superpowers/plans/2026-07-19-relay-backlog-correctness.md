# Relay Backlog — Correctness & Education Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the ready, well-specified backlog items — VoP legal-basis correction, MT103 field-23B + amount-divergence STP rules, BIC 8-vs-11 confirmation, Kenya KEPSS + corrected M-Pesa limits, per-scheme date-stamps, and the MOD-97 visual step-through — each as an independently shippable, tested change.

**Architecture:** Additive changes across the existing Router→Service→Model backend and the React/TS frontend. No new dependencies. Each task is one commit with its own test cycle. Docstring-only tasks carry a guard test so the corrected copy cannot silently regress.

**Tech Stack:** Python 3.9+, FastAPI, Pydantic v2, pytest; React 19, TypeScript 7 strict, Vitest 4, Zod 4.

## Global Constraints

- **Python 3.9+ syntax** — `Optional[...]`, `List[...]` from `typing`; never `X | None`.
- **TDD** — failing test first, watch it fail, then minimal code.
- **No new dependencies** (backend or frontend).
- **One commit per task**, `type(scope): description`; end every commit body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Backend lint-clean** — `ruff check app/ tests/` (run in the project `.venv`: `source .venv/bin/activate`).
- **Additive/invariant** — no existing endpoint contract or rule verdict changes except where a task explicitly adds a new rule; existing tests must stay green.
- **SIMULATION/primer framing** — do not remove disclaimers; keep the "educational, not production" tone in any new copy.
- **Verified facts (July 2026 research):** MT103 field 23B production values are `CRED, SPAY, SPRI, SSTD`. Kenya M-Pesa CBK-approved limits (in force through 2026): **KES 250,000 per transaction, KES 500,000 per day, KES 500,000 wallet cap**. KEPSS is Kenya's CBK-operated RTGS. VoP legal mandate = EU Instant Payments Regulation (2024); EPC VoP Scheme Rulebook v1.0 = the operational standard (not an algorithm/threshold mandate); UK CoP is a separate PSR-directed scheme.

---

## Task 1: Correct the VoP legal-basis docstrings (item 3.1)

**Files:**
- Modify: `app/services/name_matcher.py:1-13` (module docstring) and `:36` (threshold comment)
- Modify: `app/services/vop.py:1-16` (module docstring)
- Test: `tests/test_vop_docstrings.py` (new — guard test)

**Interfaces:**
- Consumes: nothing. Produces: nothing (docstring text only). The guard test pins the corrected copy so it cannot silently regress.

Why a test for a docstring: this is a compliance-training product; the false claim ("EPC recommends 90%", "Implements the EPC103-24 VoP scheme contract") teaches a wrong standard. The guard test asserts the misleading phrases are gone and the corrected framing is present.

- [ ] **Step 1: Write the failing test**

Create `tests/test_vop_docstrings.py`:

```python
"""Guard tests: VoP docstrings must not teach a false legal standard (item 3.1)."""
import app.services.name_matcher as nm
import app.services.vop as vop


def test_name_matcher_does_not_claim_epc_mandates_a_threshold():
    # The offending phrasings must be gone.
    assert "EPC recommends" not in nm.__doc__
    # The corrected framing must be present somewhere in the module docstring.
    assert "commonly tuned" in nm.__doc__
    assert "SequenceMatcher" in nm.__doc__


def test_name_matcher_threshold_comment_is_softened():
    import inspect
    src = inspect.getsource(nm)
    assert "EPC recommends" not in src
    assert "commonly tuned around" in src


def test_vop_docstring_distinguishes_ipr_from_cop():
    doc = vop.__doc__ or ""
    assert "Instant Payments Regulation" in doc
    assert "Confirmation of Payee" in doc  # UK CoP named as distinct
    # Must not assert it *implements* the scheme contract.
    assert "Implements the EPC103-24 VoP scheme contract" not in doc
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_vop_docstrings.py -q`
Expected: FAIL (current docstrings contain "EPC recommends" and "Implements the EPC103-24 VoP scheme contract").

- [ ] **Step 3: Edit `name_matcher.py`**

Replace the module docstring (lines 1-13) with:

```python
"""
Name-matching engine for Verification of Payee (VoP).

Produces MATCH / CLOSE_MATCH / NO_MATCH by normalizing both names and comparing
them with difflib.SequenceMatcher. This is a TEACHING APPROXIMATION: the EU
Instant Payments Regulation mandates that a VoP check happen, but it does NOT
mandate a matching algorithm or a numeric threshold. The 0.90 / 0.75 values
below are illustrative, commonly tuned around these levels by banks, not a
standard.

Thresholds (illustrative, commonly tuned around these levels):
  - ratio >= MATCH_THRESHOLD      → MATCH
  - CLOSE_THRESHOLD <= ratio < MATCH_THRESHOLD → CLOSE_MATCH
                                      (return the actual name for payer review)
  - ratio < CLOSE_THRESHOLD       → NO_MATCH
"""
```

Replace the line-36 comment:

```python
# Illustrative thresholds — commonly tuned around these levels. The EPC/IPR
# do NOT mandate an algorithm or a numeric threshold; banks tune their own.
MATCH_THRESHOLD = 0.90
CLOSE_MATCH_THRESHOLD = 0.75
```

- [ ] **Step 4: Edit `vop.py`**

Replace the module docstring (lines 1-16) with:

```python
"""
Verification of Payee (VoP) service.

Given an IBAN + a payer-submitted name, checks the name against the
account-holder name on record and returns MATCH / CLOSE_MATCH / NO_MATCH /
NOT_CHECKED.

LEGAL BASIS (teaching note): VoP for SEPA transfers is a legal requirement
under the EU Instant Payments Regulation (IPR, 2024), implemented operationally
via the EPC's VoP Scheme Rulebook (v1.0, effective October 2025). This is
distinct from the UK's Confirmation of Payee, which runs under separate PSR
direction. A CLOSE_MATCH or NO_MATCH requires the payer to be warned before the
payment proceeds; proceeding anyway can shift misdirected-payment liability to
the payer. This module is a simulation of that check, not a certified gateway.

ARCHITECTURE:
  - VoPVerifier is the entry point. It resolves the account, runs the name
    matcher, and returns the result.
  - A real deployment would call the scheme's VoP gateway (SurePay, Tink,
    TrueLayer) or the receiving bank's core system. Here we resolve against the
    local Account table (seeded synthetic records).
  - The VoPBackend protocol defines the adapter interface so a real gateway
    can be dropped in without changing the endpoint.
"""
```

- [ ] **Step 5: Run tests + ruff**

Run: `python -m pytest tests/test_vop_docstrings.py tests/ -q && ruff check app/ tests/`
Expected: PASS (new guard tests + full suite); ruff clean.

- [ ] **Step 6: Commit**

```bash
git add app/services/name_matcher.py app/services/vop.py tests/test_vop_docstrings.py
git commit -m "fix(vop): correct VoP legal-basis docstrings (IPR vs EPC vs CoP) (3.1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: STP field-23B validation + 32A-vs-33B amount divergence (item 3.4 remainder)

**Files:**
- Modify: `app/schemas.py` (`STPCheckRequest`, ~line 360 — add optional `instructed_amount`)
- Modify: `app/services/stp_checker.py` (add two rules + a constant; update the 23B summary row)
- Test: `tests/test_stp.py` (append)

**Interfaces:**
- Consumes: the existing `check_stp(message: dict) -> STPResult` and its `Finding` dataclass.
- Produces: two new finding codes — `STP-BANK-OP-CODE-INVALID` (error), `STP-AMOUNT-DIVERGENCE` (warning) — and reads a new optional dict key `instructed_amount`. The MT103 field 23B valid set is `{"CRED", "SPAY", "SPRI", "SSTD"}`.

Rationale: field 23B (`bank_op_code`) is currently surfaced in the summary but never validated; and only currency (33B vs 32A) is checked, never the amount. Amount divergence ("beneficiary received less than instructed") is the single most common real support ticket, so flag it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_stp.py`:

```python
def test_invalid_bank_op_code_is_rejected():
    from app.services.stp_checker import check_stp
    result = check_stp({
        "transaction_reference": "REF1",
        "bank_op_code": "XXXX",  # not a valid 23B code
        "value_date": "2026-07-20", "currency": "USD", "interbank_amount": 1000.0,
        "charge_code": "SHA",
        "ordering": {"name": "Acme", "bic": "CHASUS33"},
        "beneficiary": {"name": "Beta", "account": "ACCT-1", "bic": "BARCGB22"},
        "uetr": "97ed4827-7b6f-4491-a06f-b548d5a7512d",
    })
    assert result.verdict == "REJECTED"
    assert any(f.code == "STP-BANK-OP-CODE-INVALID" for f in result.findings)


def test_valid_bank_op_code_cred_passes():
    from app.services.stp_checker import check_stp
    result = check_stp({
        "transaction_reference": "REF1", "bank_op_code": "CRED",
        "value_date": "2026-07-20", "currency": "USD", "interbank_amount": 1000.0,
        "charge_code": "SHA",
        "ordering": {"name": "Acme", "bic": "CHASUS33"},
        "beneficiary": {"name": "Beta", "account": "ACCT-1", "bic": "BARCGB22"},
        "uetr": "97ed4827-7b6f-4491-a06f-b548d5a7512d",
    })
    assert not any(f.code == "STP-BANK-OP-CODE-INVALID" for f in result.findings)


def test_amount_divergence_is_warning():
    # 33B instructed 1000 vs 32A settled 950 -> beneficiary got less.
    from app.services.stp_checker import check_stp
    result = check_stp({
        "transaction_reference": "REF1", "bank_op_code": "CRED",
        "value_date": "2026-07-20", "currency": "USD",
        "interbank_amount": 950.0, "instructed_amount": 1000.0,
        "charge_code": "SHA",
        "ordering": {"name": "Acme", "bic": "CHASUS33"},
        "beneficiary": {"name": "Beta", "account": "ACCT-1", "bic": "BARCGB22"},
        "uetr": "97ed4827-7b6f-4491-a06f-b548d5a7512d",
    })
    assert result.verdict == "REPAIRABLE"
    assert any(f.code == "STP-AMOUNT-DIVERGENCE" for f in result.findings)


def test_matching_amounts_no_divergence():
    from app.services.stp_checker import check_stp
    result = check_stp({
        "transaction_reference": "REF1", "bank_op_code": "CRED",
        "value_date": "2026-07-20", "currency": "USD",
        "interbank_amount": 1000.0, "instructed_amount": 1000.0,
        "charge_code": "SHA",
        "ordering": {"name": "Acme", "bic": "CHASUS33"},
        "beneficiary": {"name": "Beta", "account": "ACCT-1", "bic": "BARCGB22"},
        "uetr": "97ed4827-7b6f-4491-a06f-b548d5a7512d",
    })
    assert not any(f.code == "STP-AMOUNT-DIVERGENCE" for f in result.findings)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_stp.py -k "bank_op_code or amount_divergence or matching_amounts" -q`
Expected: FAIL (no such rules yet — invalid code not rejected; divergence not flagged).

- [ ] **Step 3: Add the constant in `stp_checker.py`**

After `_VALID_CHARGE_CODES` (line 35) add:

```python
# MT field 23B (Bank Operation Code) production values.
_VALID_BANK_OP_CODES = ("CRED", "SPAY", "SPRI", "SSTD")
```

- [ ] **Step 4: Add the two rules in `stp_checker.py`**

Immediately after Rule 12 (the duplicate-BIC block ends at line 322), before the `# ---- Build the per-field summary` comment (line 324), insert:

```python
    # ---- Rule 13: bank operation code valid (23B) -------------------------
    bank_op_code = message.get("bank_op_code")
    if _truthy(bank_op_code) and str(bank_op_code).strip().upper() not in _VALID_BANK_OP_CODES:
        findings.append(Finding(
            field="23B", field_name=_FIELD_NAMES["23B"],
            severity="error", code="STP-BANK-OP-CODE-INVALID",
            message=(
                f"Bank operation code {bank_op_code!r} is not one of "
                f"{', '.join(_VALID_BANK_OP_CODES)}."
            ),
            repair="Use CRED (normal credit transfer) or another valid 23B code.",
        ))

    # ---- Rule 14: instructed (33B) vs settled (32A) amount divergence -----
    instructed_amount = message.get("instructed_amount")
    if (
        isinstance(instructed_amount, (int, float))
        and isinstance(amount, (int, float))
        and instructed_amount > 0
        and amount != instructed_amount
    ):
        findings.append(Finding(
            field="33B", field_name=_FIELD_NAMES["33B"],
            severity="warning", code="STP-AMOUNT-DIVERGENCE",
            message=(
                f"Settled amount (32A) {amount} differs from instructed amount "
                f"(33B) {instructed_amount}; the beneficiary receives a different "
                "sum than instructed — typically charges deducted along the chain."
            ),
            repair="Confirm the difference matches disclosed 71F/71G charges.",
        ))
```

- [ ] **Step 5: Tighten the 23B summary row**

In the summary loop, replace the `elif tag == "23B":` branch (lines 338-340):

```python
        elif tag == "23B":
            present = _truthy(message.get("bank_op_code"))
            valid = present and str(message.get("bank_op_code")).strip().upper() in _VALID_BANK_OP_CODES
```

- [ ] **Step 6: Add the optional request field**

In `app/schemas.py`, in `STPCheckRequest` (after `uetr`, line 369), add:

```python
    instructed_amount: Optional[float] = Field(None, description="MT field 33B instructed amount, before charges")
```

- [ ] **Step 7: Run tests + ruff**

Run: `python -m pytest tests/test_stp.py tests/ -q && ruff check app/ tests/`
Expected: PASS (new + full suite); ruff clean. Note: the STP endpoint response is unchanged in shape; the two new findings flow through the existing `findings` list.

- [ ] **Step 8: Commit**

```bash
git add app/services/stp_checker.py app/schemas.py tests/test_stp.py
git commit -m "feat(stp): validate field 23B + flag 32A/33B amount divergence (3.4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Confirm BIC 8-vs-11 handling (item #9)

**Files:**
- Test: `tests/test_bic_normalization.py` (new)

**Interfaces:**
- Consumes: `validate_bic(bic_str) -> Tuple[bool, Optional[str], Optional[str], list[str]]` (already appends `XXX` to 8-char BICs — see `app/services/validator.py:97,116`) and `check_stp`.
- Produces: nothing. This task is a confirmation-by-test: an 8-char BIC is valid and normalized to 11 with `XXX`, and the STP checker does NOT false-fail an 8-char BIC. If any assertion fails, STOP and report — that would be a real defect requiring a code fix, and the plan should be revised.

- [ ] **Step 1: Write the test**

Create `tests/test_bic_normalization.py`:

```python
"""An 8-char BIC must be accepted and padded to 11 with 'XXX' (item #9)."""
from app.services.stp_checker import check_stp
from app.services.validator import validate_bic


def test_eight_char_bic_valid_and_padded():
    valid, normalized, country, errors = validate_bic("CHASUS33")
    assert valid is True
    assert normalized == "CHASUS33XXX"
    assert country == "US"
    assert errors == []


def test_eleven_char_head_office_bic_valid():
    valid, normalized, _c, errors = validate_bic("CHASUS33XXX")
    assert valid is True
    assert normalized == "CHASUS33XXX"
    assert errors == []


def test_stp_does_not_false_fail_eight_char_bic():
    result = check_stp({
        "transaction_reference": "REF1", "bank_op_code": "CRED",
        "value_date": "2026-07-20", "currency": "USD", "interbank_amount": 1000.0,
        "charge_code": "SHA",
        "ordering": {"name": "Acme", "bic": "CHASUS33"},        # 8-char
        "beneficiary": {"name": "Beta", "account": "ACCT-1", "bic": "BARCGB22"},  # 8-char
        "uetr": "97ed4827-7b6f-4491-a06f-b548d5a7512d",
    })
    assert not any(f.code == "STP-BIC-INVALID" for f in result.findings)
```

- [ ] **Step 2: Run the test**

Run: `python -m pytest tests/test_bic_normalization.py -q`
Expected: PASS (behavior already correct — this pins it). If it FAILS, STOP and report; do not paper over it.

- [ ] **Step 3: Commit**

```bash
git add tests/test_bic_normalization.py
git commit -m "test(validator): pin 8-char BIC accepted and padded to XXX (#9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Kenya — add KEPSS (RTGS) + correct M-Pesa limits (item #10)

**Files:**
- Modify: `app/data/payment_schemes.py:65-74` (the `KES` block)
- Test: `tests/test_payment_schemes.py` (append; if the file doesn't exist, create it)

**Interfaces:**
- Consumes: `get_schemes_for_currency("KES")` from `app/data/payment_schemes.py`.
- Produces: the `KES` scheme list gains a KEPSS entry and corrected M-Pesa limits. Completes the Kenya three-layer story (RTGS / instant-interbank / wallet) that mirrors Nigeria and the UK.

- [ ] **Step 1: Write the failing test**

Append to (or create) `tests/test_payment_schemes.py`:

```python
from app.data.payment_schemes import get_schemes_for_currency


def test_kes_has_kepss_rtgs():
    data = get_schemes_for_currency("KES")
    names = [s["name"] for s in data["schemes"]]
    assert any("KEPSS" in n for n in names)
    kepss = next(s for s in data["schemes"] if "KEPSS" in s["name"])
    assert "RTGS" in kepss["speed"]
    assert kepss["operator"] == "Central Bank of Kenya"


def test_kes_mpesa_limits_are_cbk_approved():
    data = get_schemes_for_currency("KES")
    mpesa = next(s for s in data["schemes"] if s["name"] == "M-Pesa")
    # CBK-approved figures in force through 2026.
    assert "250,000" in mpesa["limit"]  # per-transaction
    assert "500,000" in mpesa["limit"]  # daily / wallet cap
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_payment_schemes.py -q`
Expected: FAIL (no KEPSS; M-Pesa limit currently "KES 300,000/day").

- [ ] **Step 3: Edit the KES block**

Replace the `KES` block (lines 65-74) with:

```python
    "KES": {
        "currency": "KES", "country": "Kenya", "countryCode": "KE",
        "iban": False,
        "localIdentifier": "Bank Account Number (per bank)",
        "schemes": [
            {"name": "KEPSS", "speed": "Real-time (RTGS)", "limit": "No limit", "cost": "Bank-set", "useCase": "High-value, interbank, government", "operator": "Central Bank of Kenya"},
            {"name": "PesaLink", "speed": "Instant (seconds)", "limit": "~KES 1,000,000 (bank-set)", "cost": "KES 0-150", "useCase": "Bank-to-bank, alias-capable", "operator": "IPSL (Kenya Bankers Assoc.)"},
            {"name": "M-Pesa", "speed": "Instant (seconds)", "limit": "KES 250,000/txn, 500,000/day, 500,000 wallet cap", "cost": "Tiered tariff", "useCase": "Mobile wallet, P2P, merchant", "operator": "Safaricom"},
            {"name": "EFT", "speed": "1-2 business days", "limit": "No limit", "cost": "Minimal", "useCase": "Payroll, bulk", "operator": "Kenya Bankers Assoc."},
        ],
    },
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_payment_schemes.py tests/ -q`
Expected: PASS. (If a broader test asserts a fixed scheme count for KES, update it to the new count — 4 schemes — as part of this task.)

- [ ] **Step 5: Commit**

```bash
git add app/data/payment_schemes.py tests/test_payment_schemes.py
git commit -m "feat(schemes): add KEPSS RTGS + correct M-Pesa limits for Kenya (#10)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Per-scheme-set date-stamps (item #12)

**Files:**
- Modify: `app/data/payment_schemes.py` (add `"verifiedAsof": "2026-07"` to every currency block)
- Modify: `frontend/src/api/schemas.ts:533-544` (`SchemesResponseSchema` — add optional `verifiedAsof`)
- Modify: `frontend/src/features/learn/labs/Lab7Content.tsx` (render the date-stamp when present)
- Test: `tests/test_payment_schemes.py` (append) and `frontend/src/api/schemas.test.ts` (append)

**Interfaces:**
- Consumes: `get_schemes_for_currency(...)`, `SchemesResponseSchema`.
- Produces: each `/api/schemes?currency=X` response carries a `verifiedAsof` string (YYYY-MM). Frontend surfaces it so staleness is visible, not silent. Because the backend returns raw dicts and the frontend Zod schema uses `.passthrough()`/`.catch()`, adding the field is non-breaking.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_payment_schemes.py`:

```python
def test_every_currency_block_has_verified_asof():
    import re
    from app.data.payment_schemes import list_currencies_with_schemes, get_schemes_for_currency
    for ccy in list_currencies_with_schemes():
        data = get_schemes_for_currency(ccy)
        assert "verifiedAsof" in data, f"{ccy} missing verifiedAsof"
        assert re.match(r"^\d{4}-\d{2}$", data["verifiedAsof"]), data["verifiedAsof"]
```

Append to `frontend/src/api/schemas.test.ts`:

```ts
it("SchemesResponseSchema keeps verifiedAsof when present", () => {
  const r = SchemesResponseSchema.parse({
    currency: "KES", country: "Kenya", countryCode: "KE",
    iban: false, localIdentifier: "x", schemes: [], verifiedAsof: "2026-07",
  });
  expect(r.verifiedAsof).toBe("2026-07");
});
```

(Ensure `SchemesResponseSchema` is imported at the top of `schemas.test.ts`.)

- [ ] **Step 2: Run tests to verify they fail**

Run backend: `python -m pytest tests/test_payment_schemes.py::test_every_currency_block_has_verified_asof -q` → FAIL (field absent).
Run frontend (from `frontend/`): `npm test -- --run src/api/schemas.test.ts` → FAIL if the Zod schema strips unknown keys, or the field is undefined.

- [ ] **Step 3: Add `verifiedAsof` to every currency block**

In `app/data/payment_schemes.py`, add `"verifiedAsof": "2026-07",` immediately after the `"localIdentifier": ...` line of EACH currency dict (GBP, CAD, USD, EUR, NGN, KES, INR, AUD, JPY, AED). Example for GBP:

```python
    "GBP": {
        "currency": "GBP", "country": "United Kingdom", "countryCode": "GB",
        "iban": True,
        "localIdentifier": "Sort Code (6 digits) + Account Number (8 digits)",
        "verifiedAsof": "2026-07",
        "schemes": [
            ...
        ],
    },
```

Do the same for all ten blocks.

- [ ] **Step 4: Add the optional Zod field**

In `frontend/src/api/schemas.ts`, inside the `SchemesResponseSchema` object (around line 533-544), add before the closing `.passthrough()`:

```ts
    verifiedAsof: z.string().nullish().catch(null),
```

- [ ] **Step 5: Render the date-stamp in Lab 7**

In `frontend/src/features/learn/labs/Lab7Content.tsx`, where the scheme results render (after the currency's scheme cards), add a small caption when `data.verifiedAsof` is present:

```tsx
{data.verifiedAsof && (
  <p className="lab-caption">Rail data verified as of {data.verifiedAsof}. Always check the operator's current rules.</p>
)}
```

(Adapt `data` to the actual variable name holding the parsed `SchemesResponse` in that file; read the file first to confirm.)

- [ ] **Step 6: Run tests**

Backend: `python -m pytest tests/ -q && ruff check app/`.
Frontend (from `frontend/`): `npm test -- --run src/api src/features/learn/labs/Lab7Content.test.tsx && npx tsc --noEmit`.
Expected: all PASS. If `Lab7Content.test.tsx`'s `SCHEMES_FIXTURE` lacks `verifiedAsof`, that's fine (optional field, renders nothing).

- [ ] **Step 7: Commit**

```bash
git add app/data/payment_schemes.py frontend/src/api/schemas.ts frontend/src/api/schemas.test.ts frontend/src/features/learn/labs/Lab7Content.tsx tests/test_payment_schemes.py
git commit -m "feat(schemes): date-stamp rail data with verifiedAsof (#12)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: MOD-97 visual step-through (item 3.7)

**Files:**
- Modify: `frontend/src/features/learn/labs/mod97.ts` (add `mod97Steps`)
- Create: `frontend/src/features/learn/labs/mod97.test.ts` additions (append if it exists) for `mod97Steps`
- Modify: `frontend/src/features/learn/labs/Lab2Content.tsx` (render the step-through + a digit-flip)
- Modify: `frontend/src/features/learn/labs/Lab2Content.test.tsx` (append a test)

**Interfaces:**
- Consumes: existing `normalizeIban`, `ibanToNumericString`, `mod97Remainder` in `mod97.ts`.
- Produces: `mod97Steps(iban: string): Mod97Steps` returning the intermediate artifacts for display —
  ```ts
  export interface Mod97Steps {
    normalized: string;
    rearranged: string;      // first 4 chars moved to the end
    numeric: string;         // letters expanded to numbers
    chunks: { chunk: string; remainderAfter: number }[]; // chunked mod trace
    remainder: number;       // final; 1 === valid
    valid: boolean;
  }
  ```
  Lab 2 renders these as a sequential reveal and lets the learner flip a digit and watch the remainder change. This is the "second aha moment" (ROADMAP 1.3 / item 3.7).

- [ ] **Step 1: Write the failing test for `mod97Steps`**

Append to `frontend/src/features/learn/labs/mod97.test.ts` (create it if absent, importing from `./mod97`):

```ts
import { mod97Steps } from "./mod97";

describe("mod97Steps", () => {
  it("traces the rearrange → convert → divide steps for a valid IBAN", () => {
    const s = mod97Steps("GB29NWBK60161331926819");
    expect(s.normalized).toBe("GB29NWBK60161331926819");
    // First 4 chars (GB29) moved to the end.
    expect(s.rearranged).toBe("NWBK60161331926819GB29");
    // N=23, W=32, B=11, K=20 → starts "23321120..."
    expect(s.numeric.startsWith("23321120")).toBe(true);
    expect(s.remainder).toBe(1);
    expect(s.valid).toBe(true);
    expect(s.chunks.length).toBeGreaterThan(0);
    // The last chunk's remainderAfter is the final remainder.
    expect(s.chunks[s.chunks.length - 1].remainderAfter).toBe(1);
  });

  it("shows a non-1 remainder for a single-digit typo", () => {
    const s = mod97Steps("GB29NWBK60161331926818"); // last digit 9→8
    expect(s.remainder).not.toBe(1);
    expect(s.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npm test -- --run src/features/learn/labs/mod97.test.ts`
Expected: FAIL — `mod97Steps` not exported.

- [ ] **Step 3: Implement `mod97Steps` in `mod97.ts`**

Append to `frontend/src/features/learn/labs/mod97.ts`:

```ts
export interface Mod97Steps {
  normalized: string;
  rearranged: string;
  numeric: string;
  chunks: { chunk: string; remainderAfter: number }[];
  remainder: number;
  valid: boolean;
}

/**
 * Produce the intermediate artifacts of the MOD-97 computation for teaching:
 * the rearrangement, the letter-to-number expansion, and the chunked-modulo
 * trace. Mirrors mod97Remainder's chunking exactly so the displayed remainder
 * matches the validator.
 */
export function mod97Steps(iban: string): Mod97Steps {
  const normalized = normalizeIban(iban);
  const rearranged = normalized.length >= 5
    ? normalized.slice(4) + normalized.slice(0, 4)
    : "";
  const numeric = ibanToNumericString(normalized);

  const chunks: { chunk: string; remainderAfter: number }[] = [];
  let remainder = 0;
  let position = 0;
  while (position < numeric.length) {
    const chunkSize = Math.min(9 - remainder.toString().length, numeric.length - position);
    const chunk = remainder.toString() + numeric.slice(position, position + chunkSize);
    remainder = Number(chunk) % 97;
    chunks.push({ chunk, remainderAfter: remainder });
    position += chunkSize;
  }

  return { normalized, rearranged, numeric, chunks, remainder, valid: remainder === 1 };
}
```

- [ ] **Step 4: Run the `mod97Steps` test**

Run (from `frontend/`): `npm test -- --run src/features/learn/labs/mod97.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the step-through in `Lab2Content.tsx`**

Add near the top of `Lab2Content.tsx`:

```tsx
import { mod97Steps } from "./mod97";
```

Inside the component, derive the steps from the existing `breakInput` state (already the editable IBAN):

```tsx
  const steps = mod97Steps(breakInput);
```

Add a new `<section>` after the "Break it!" section (after line 170), rendering the sequence:

```tsx
      {/* Step-through: rearrange → convert → divide */}
      <section className="lab-section">
        <h2>Watch the checksum work, step by step</h2>
        <p className="measure">
          Edit the IBAN above and watch each stage update. A valid IBAN always
          leaves a remainder of exactly 1.
        </p>
        <ol className="mod97-steps">
          <li><strong>1. Move the first 4 characters to the end:</strong>{" "}
            <span className="mono">{steps.rearranged || "—"}</span></li>
          <li><strong>2. Convert letters to numbers (A=10 … Z=35):</strong>{" "}
            <span className="mono mod97-numeric">{steps.numeric || "—"}</span></li>
          <li><strong>3. Divide by 97 (processed in chunks):</strong>
            <ol className="mod97-chunks">
              {steps.chunks.map((c, i) => (
                <li key={i} className="mono">{c.chunk} mod 97 = {c.remainderAfter}</li>
              ))}
            </ol>
          </li>
          <li><strong>4. Remainder:</strong>{" "}
            <span className="mono">{steps.numeric ? steps.remainder : "—"}</span>{" "}
            {steps.numeric && (
              steps.valid
                ? <span className="lab-valid">= 1 → valid ✓</span>
                : <span className="lab-invalid">≠ 1 → invalid ✗</span>
            )}
          </li>
        </ol>
      </section>
```

Add minimal CSS to `frontend/src/features/learn/labs/LabContent.css`:

```css
.mod97-steps { display: flex; flex-direction: column; gap: var(--space-2, 8px); }
.mod97-numeric { word-break: break-all; }
.mod97-chunks { margin-top: var(--space-1, 4px); padding-left: var(--space-4, 16px); }
```

- [ ] **Step 6: Append a Lab 2 test**

Append to `frontend/src/features/learn/labs/Lab2Content.test.tsx`:

```tsx
it("renders the MOD-97 step-through and updates on edit", async () => {
  const { user } = renderLab();
  // The rearranged form of the default valid IBAN appears.
  expect(screen.getByText(/DE0532013000/)).toBeInTheDocument(); // DE89… rearranged tail
  // Remainder line shows the valid marker for the default IBAN.
  expect(screen.getByText(/valid/i)).toBeInTheDocument();
});
```

(Adjust the substring to the actual rearranged tail of the file's `VALID_IBAN` constant `DE89370400440532013000` → rearranged `370400440532013000DE89`; assert on `/370400440532013000DE89/` instead if clearer. Read the constant and pick a stable substring.)

- [ ] **Step 7: Run tests + typecheck**

Run (from `frontend/`): `npm test -- --run src/features/learn/labs/Lab2Content.test.tsx src/features/learn/labs/mod97.test.ts && npx tsc --noEmit`
Expected: PASS; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/learn/labs/mod97.ts frontend/src/features/learn/labs/mod97.test.ts frontend/src/features/learn/labs/Lab2Content.tsx frontend/src/features/learn/labs/Lab2Content.test.tsx frontend/src/features/learn/labs/LabContent.css
git commit -m "feat(learn): MOD-97 visual step-through with live digit-flip (3.7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Deferred — need a decision before they can be planned without guesswork

These backlog items are real but each hinges on a design/product decision. Planning them now would mean inventing an unreviewed design (placeholder tasks), which this plan deliberately avoids. Each is listed with the single blocking question; answer it (a short brainstorming pass) and it converts to a concrete task set.

- **3.6 — Sanctions vs Travel-Rule split.** The low-risk half is already done (the `/api/screen` response carries `SCREENING_DISCLAIMER_TEXT`; the threshold-drift comment at `screening.py:155` already reads "each hop slightly stricter"). The valuable half — modeling sanctions screening and the Travel Rule as **two independent pass/fail outcomes** (all four combinations) — is a new feature. **Blocking question:** what does the Travel-Rule check consume (which originator/beneficiary fields, what completeness rule — e.g. country-only address fails), and is it a new endpoint or an addition to `/api/screen`'s response? Also: confirm whether the screening threshold-drift sign (`- i*0.01`) is intended (stricter deep) before any change — do not flip it blind (per IMPLEMENTATION_PLAN 3.6).
- **#6 — First-run onboarding.** `firstRunGuidanceSeen` is scaffolded in storage but no UI reads it; DESIGN.md principle 5 ("guidance at the moment of use") is unfulfilled. **Blocking question:** what is the onboarding surface — a dismissible Overview banner, a short coach-mark tour, or an interstitial first-visit panel — and what does it say/point to?
- **#7 — Overview "recent activity" + Explore→Schemes stub.** The Schemes stub is buildable now (render a comparison matrix from the existing `/api/schemes` data) and could be a standalone task once a layout is chosen. "Recent activity" needs a data source. **Blocking question:** is there an activity/event log to back "recent activity," or should it be derived from local progress + last-used tools? And: is the Schemes matrix a table or card grid?
- **#8 — Progress source reconciliation.** Device-local `relay:progress` (`completedModuleIds`) and server `/api/progress` can drift. **Blocking question:** which is authoritative — server, local, or a merge — and on conflict, union or server-wins?
- **#11 — ETB / Ethiopia.** Net-new and fast-moving (birr floated 2024; EthioPay-IPS launched 9 Dec 2025; Telebirr). **Recommendation: defer**, per the research doc's own guidance to re-check in 2–3 months rather than encode data that will be stale. Revisit after the next research round; if built, it mirrors Task 4's shape (a new `ETB` block + corridor/SSI/fee entries).

---

## Self-Review Notes (for the executor)

- **Coverage:** ready items 3.1 (T1), 3.4-remainder (T2), #9 (T3), #10 (T4), #12 (T5), 3.7 (T6). Deferred items are enumerated with their blocking questions rather than half-planned.
- **Verify-before-code anchors:** three spots infer a name to confirm against the repo before editing — the exact variable holding the parsed `SchemesResponse` in `Lab7Content.tsx` (T5 step 5), the `VALID_IBAN` rearranged-tail substring in `Lab2Content.test.tsx` (T6 step 6), and whether `tests/test_payment_schemes.py` already exists (T4/T5). Every backend name (`_VALID_CHARGE_CODES`, `Finding`, `check_stp` summary branches, `validate_bic` return shape, `STPCheckRequest` fields, `get_schemes_for_currency`, `SchemesResponseSchema`) was read from source.
- **Type consistency:** new finding codes (`STP-BANK-OP-CODE-INVALID`, `STP-AMOUNT-DIVERGENCE`) reuse the existing `Finding` shape and verdict semantics (error→REJECTED, warning→REPAIRABLE). `mod97Steps` reuses the exact chunking of `mod97Remainder` so displayed and validated remainders agree.
- **Invariant:** T1/T3 add no behavior (docstrings + guard tests). T2 adds two findings via the existing list — response shape unchanged. T4/T5 add data/fields the frontend already parses leniently. T6 is additive frontend.
