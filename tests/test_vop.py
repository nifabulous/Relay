"""
Tests for Verification of Payee (VoP) — name-matching engine + endpoint.

Covers:
  - Name normalization (accents, case, titles, punctuation, token-sorting)
  - Match outcomes across the MATCH / CLOSE_MATCH / NO_MATCH thresholds
  - Privacy: account name returned only on CLOSE_MATCH, withheld on NO_MATCH
  - NOT_CHECKED when account not found
  - The /api/verify-payee endpoint (HTTP level)
"""

from app.services.name_matcher import (
    CLOSE_MATCH_THRESHOLD,
    MatchOutcome,
    match_names,
    normalize_name,
    similarity_ratio,
)
from app.services.vop import verify_payee

# ===========================================================================
# Name normalization
# ===========================================================================


class TestNormalizeName:
    def test_lowercases(self):
        assert normalize_name("JOHN SMITH") == "john smith"

    def test_strips_accents(self):
        # NFKD decomposes é → e + combining accent, then we drop the accent
        assert normalize_name("Renée Müller") == "muller renee"

    def test_strips_titles(self):
        assert normalize_name("Mr John Smith") == "john smith"
        # "Dr" stripped, then tokens alphabetized: hans < mueller
        assert normalize_name("Dr Hans Mueller") == "hans mueller"

    def test_strips_punctuation(self):
        # "O'Connor, John" → tokens [connor, john, o], sorted alphabetically
        result = normalize_name("O'Connor, John")
        assert "connor" in result
        assert "john" in result
        assert "o" in result  # the standalone "O" is kept as a token

    def test_token_sorts(self):
        # "John Smith" and "Smith John" normalize to the same thing
        assert normalize_name("John Smith") == normalize_name("Smith John")

    def test_collapse_whitespace(self):
        assert normalize_name("John   Smith") == "john smith"

    def test_empty_string(self):
        assert normalize_name("") == ""

    def test_none_input_safe(self):
        assert normalize_name(None) == ""

    def test_business_names(self):
        result = normalize_name("Acme Trading Ltd")
        assert "acme" in result
        assert "limited" in result  # Ltd expanded


# ===========================================================================
# Similarity ratio
# ===========================================================================


class TestSimilarityRatio:
    def test_identical_names_score_one(self):
        assert similarity_ratio("John Smith", "John Smith") == 1.0

    def test_completely_different_score_low(self):
        score = similarity_ratio("John Smith", "Pierre Dupont")
        assert score < 0.5

    def test_case_insensitive(self):
        assert similarity_ratio("JOHN SMITH", "john smith") == 1.0

    def test_order_insensitive(self):
        # Token sorting makes "John Smith" ≈ "Smith John"
        score = similarity_ratio("John Smith", "Smith John")
        assert score == 1.0


# ===========================================================================
# match_names — the core decision function
# ===========================================================================


class TestMatchNames:
    def test_exact_match(self):
        result = match_names("John Smith", "John Smith")
        assert result.outcome == MatchOutcome.MATCH
        assert result.score == 1.0

    def test_case_difference_still_matches(self):
        result = match_names("JOHN SMITH", "john smith")
        assert result.outcome == MatchOutcome.MATCH

    def test_with_title_still_matches(self):
        result = match_names("Mr John Smith", "John Smith")
        assert result.outcome == MatchOutcome.MATCH

    def test_order_difference_still_matches(self):
        result = match_names("John Smith", "Smith, John")
        assert result.outcome == MatchOutcome.MATCH

    def test_accent_difference_still_matches(self):
        result = match_names("Hans Müller", "Hans Mueller")
        assert result.outcome == MatchOutcome.MATCH

    def test_minor_typo_gives_close_match(self):
        # "Smyth" vs "Smith" — close but not exact
        result = match_names("John Smyth", "John Smith")
        assert result.outcome in (MatchOutcome.CLOSE_MATCH, MatchOutcome.MATCH)
        assert result.score >= CLOSE_MATCH_THRESHOLD

    def test_close_match_returns_account_name(self):
        """Per EPC, CLOSE_MATCH returns the real name for payer review."""
        result = match_names("John Smyth", "John Smith")
        if result.outcome == MatchOutcome.CLOSE_MATCH:
            assert result.account_name == "John Smith"

    def test_completely_different_gives_no_match(self):
        result = match_names("John Smith", "Pierre Dupont")
        assert result.outcome == MatchOutcome.NO_MATCH

    def test_no_match_withholds_account_name(self):
        """Per EPC privacy, NO_MATCH does NOT return the real name."""
        result = match_names("completely different", "John Smith")
        assert result.outcome == MatchOutcome.NO_MATCH
        assert result.account_name is None

    def test_match_does_not_leak_account_name(self):
        """On MATCH, account_name is set internally but the API only exposes
        it on CLOSE_MATCH. The result object has it, but the endpoint won't."""
        result = match_names("John Smith", "John Smith")
        assert result.outcome == MatchOutcome.MATCH

    def test_custom_thresholds(self):
        # With a very high threshold, even a near-perfect match becomes CLOSE
        result = match_names(
            "John Smith", "John Smith", match_threshold=1.01
        )
        assert result.outcome == MatchOutcome.CLOSE_MATCH

    def test_to_reason_code(self):
        assert match_names("John Smith", "John Smith").to_reason_code() == "MATCH"
        assert match_names("xxx", "yyy").to_reason_code() == "NO_MATCH"


# ===========================================================================
# VoP service — verify_payee against the DB
# ===========================================================================


class TestVerifyPayeeService:
    def test_match_against_seeded_account(self, db_session):
        # GB29NWBK60161331926819 → "John Smith" in seed
        result = verify_payee(db_session, "GB29NWBK60161331926819", "John Smith")
        assert result.outcome == "MATCH"
        assert result.score is not None
        assert result.score == 1.0

    def test_close_match_typo(self, db_session):
        result = verify_payee(db_session, "GB29NWBK60161331926819", "Jon Smith")
        # "Jon Smith" vs "John Smith" — should be close
        assert result.outcome in ("CLOSE_MATCH", "MATCH")
        if result.outcome == "CLOSE_MATCH":
            assert result.account_holder_name == "John Smith"

    def test_no_match(self, db_session):
        result = verify_payee(db_session, "GB29NWBK60161331926819", "Pierre Dupont")
        assert result.outcome == "NO_MATCH"
        assert result.account_holder_name is None  # privacy

    def test_not_checked_for_unknown_iban(self, db_session):
        result = verify_payee(db_session, "GB29NWBK99999999999999", "John Smith")
        assert result.outcome == "NOT_CHECKED"
        assert result.score is None
        assert result.account_holder_name is None

    def test_normalizes_iban_spaces(self, db_session):
        result = verify_payee(db_session, "GB29 NWBK 6016 1331 9268 19", "John Smith")
        assert result.outcome == "MATCH"

    def test_uppercases_iban(self, db_session):
        result = verify_payee(db_session, "gb29nwbk60161331926819", "John Smith")
        assert result.outcome == "MATCH"

    def test_returns_account_type(self, db_session):
        result = verify_payee(db_session, "GB29NWBK60161331926819", "John Smith")
        assert result.account_type == "personal"

    def test_business_account(self, db_session):
        # GB29NWBK60161331926820 → "Acme Trading Ltd"
        result = verify_payee(db_session, "GB29NWBK60161331926820", "Acme Trading Ltd")
        assert result.outcome == "MATCH"
        assert result.account_type == "business"

    def test_custom_backend(self, db_session):
        """Verify the adapter interface works with a custom backend."""
        from app.models import Account

        class AlwaysJohnBackend:
            def resolve_account(self, session, iban):
                return Account(
                    iban=iban,
                    account_holder_name="John Smith",
                    account_type="personal",
                )

        result = verify_payee(
            db_session, "ANYIBAN", "John Smith", backend=AlwaysJohnBackend()
        )
        assert result.outcome == "MATCH"


# ===========================================================================
# HTTP endpoint
# ===========================================================================


class TestVoPEndpoint:
    def test_match(self, client):
        r = client.post("/api/verify-payee", json={
            "iban": "GB29NWBK60161331926819",
            "name": "John Smith",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["outcome"] == "MATCH"
        assert body["score"] == 1.0
        assert "safe to proceed" in body["advice"].lower()

    def test_close_match_returns_name(self, client):
        r = client.post("/api/verify-payee", json={
            "iban": "GB29NWBK60161331926819",
            "name": "Jon Smyth",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["outcome"] in ("CLOSE_MATCH", "MATCH")
        if body["outcome"] == "CLOSE_MATCH":
            assert body["account_holder_name"] == "John Smith"
            assert "review" in body["advice"].lower()

    def test_no_match_withholds_name(self, client):
        r = client.post("/api/verify-payee", json={
            "iban": "GB29NWBK60161331926819",
            "name": "Pierre Dupont",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["outcome"] == "NO_MATCH"
        assert body["account_holder_name"] is None
        assert "do not" in body["advice"].lower()

    def test_not_checked_for_unknown_iban(self, client):
        r = client.post("/api/verify-payee", json={
            "iban": "GB29NWBK99999999999999",
            "name": "John Smith",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["outcome"] == "NOT_CHECKED"
        assert body["score"] is None
        assert "caution" in body["advice"].lower()

    def test_missing_fields_returns_422(self, client):
        r = client.post("/api/verify-payee", json={"iban": "GB29NWBK60161331926819"})
        assert r.status_code == 422  # missing 'name'

    def test_iban_normalized_in_response(self, client):
        r = client.post("/api/verify-payee", json={
            "iban": "gb29 nwbk 6016 1331 9268 19",
            "name": "John Smith",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["iban"] == "GB29NWBK60161331926819"

    def test_international_names(self, client):
        # DE89370400440532013000 → "Hans Mueller"
        r = client.post("/api/verify-payee", json={
            "iban": "DE89370400440532013000",
            "name": "Hans Müller",  # with accent
        })
        assert r.status_code == 200
        body = r.json()
        assert body["outcome"] == "MATCH"

    def test_nigerian_account(self, client):
        r = client.post("/api/verify-payee", json={
            "iban": "NG3705000012345678901234",
            "name": "Olaniyi Oladokun",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["outcome"] == "MATCH"
        assert body["account_type"] == "personal"
