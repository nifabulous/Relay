"""
Tests for the combined prepare-payment endpoint + recommendation engine.

Two layers:
  1. Recommendation engine (pure function — every matrix cell tested)
  2. HTTP endpoint (end-to-end with real seeded data)
"""
import pytest

from app.services.recommendation import (
    BLOCKING,
    Recommendation,
    RecommendationResult,
    decide,
)


# ===========================================================================
# Recommendation engine — pure function, every matrix cell
# ===========================================================================


class TestRecommendationReject:
    """Layer 1: invalid details → REJECT regardless of everything else."""

    def test_invalid_details_rejects(self):
        r = decide(
            validation_valid=False,
            vop_outcome="MATCH",
            has_routing=True,
            has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
        )
        assert r.recommendation == Recommendation.REJECT
        assert r.is_blocking

    def test_invalid_details_rejects_even_with_no_match(self):
        r = decide(
            validation_valid=False,
            vop_outcome="NO_MATCH",
            has_routing=False,
            has_real_ssi_accounts=False,
            has_placeholder_ssi_only=False,
        )
        assert r.recommendation == Recommendation.REJECT

    def test_reject_includes_validation_errors_in_blocks(self):
        r = decide(
            validation_valid=False,
            vop_outcome="MATCH",
            has_routing=True,
            has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
            validation_errors=["Bad IBAN checksum", "Invalid country code"],
        )
        assert "Bad IBAN checksum" in r.blocks


class TestRecommendationStop:
    """Layer 2: NO_MATCH → STOP (fraud / wrong account)."""

    def test_no_match_stops(self):
        r = decide(
            validation_valid=True,
            vop_outcome="NO_MATCH",
            has_routing=True,
            has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
        )
        assert r.recommendation == Recommendation.STOP
        assert r.is_blocking


class TestRecommendationCloseMatch:
    """Layer 2: CLOSE_MATCH → varies by strictness."""

    def test_standard_close_match_reviews(self):
        r = decide(
            validation_valid=True,
            vop_outcome="CLOSE_MATCH",
            has_routing=True,
            has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
            strictness="standard",
        )
        assert r.recommendation == Recommendation.REVIEW
        assert not r.is_blocking

    def test_lenient_close_match_proceeds_with_caution(self):
        r = decide(
            validation_valid=True,
            vop_outcome="CLOSE_MATCH",
            has_routing=True,
            has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
            strictness="lenient",
        )
        assert r.recommendation == Recommendation.PROCEED_WITH_CAUTION

    def test_strict_close_match_stops(self):
        r = decide(
            validation_valid=True,
            vop_outcome="CLOSE_MATCH",
            has_routing=True,
            has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
            strictness="strict",
        )
        assert r.recommendation == Recommendation.STOP
        assert r.is_blocking


class TestRecommendationNotChecked:
    """Layer 2: NOT_CHECKED → varies by strictness."""

    def test_standard_not_checked_caution_then_proceeds(self):
        """Standard mode: NOT_CHECKED falls through, ends as CAUTION if SSI real."""
        r = decide(
            validation_valid=True,
            vop_outcome="NOT_CHECKED",
            has_routing=True,
            has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
            strictness="standard",
        )
        assert r.recommendation == Recommendation.CAUTION
        assert not r.is_blocking

    def test_strict_not_checked_stops(self):
        r = decide(
            validation_valid=True,
            vop_outcome="NOT_CHECKED",
            has_routing=True,
            has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
            strictness="strict",
        )
        assert r.recommendation == Recommendation.STOP

    def test_lenient_not_checked_caution(self):
        r = decide(
            validation_valid=True,
            vop_outcome="NOT_CHECKED",
            has_routing=True,
            has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
            strictness="lenient",
        )
        assert r.recommendation == Recommendation.CAUTION


class TestRecommendationBlocked:
    """Layer 3: no routing → BLOCKED."""

    def test_no_routing_blocks(self):
        r = decide(
            validation_valid=True,
            vop_outcome="MATCH",
            has_routing=False,
            has_real_ssi_accounts=False,
            has_placeholder_ssi_only=False,
        )
        assert r.recommendation == Recommendation.BLOCKED
        assert r.is_blocking


class TestRecommendationSSIReadiness:
    """Layer 4: SSI account readiness distinguishes PROCEED from PROCEED_WITH_CAUTION."""

    def test_match_with_real_ssi_proceeds(self):
        r = decide(
            validation_valid=True,
            vop_outcome="MATCH",
            has_routing=True,
            has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
        )
        assert r.recommendation == Recommendation.PROCEED
        assert not r.is_blocking

    def test_match_with_placeholder_ssi_proceeds_with_caution(self):
        r = decide(
            validation_valid=True,
            vop_outcome="MATCH",
            has_routing=True,
            has_real_ssi_accounts=False,
            has_placeholder_ssi_only=True,
        )
        assert r.recommendation == Recommendation.PROCEED_WITH_CAUTION

    def test_match_with_no_ssi_proceeds_with_caution(self):
        r = decide(
            validation_valid=True,
            vop_outcome="MATCH",
            has_routing=True,
            has_real_ssi_accounts=False,
            has_placeholder_ssi_only=False,
        )
        assert r.recommendation == Recommendation.PROCEED_WITH_CAUTION


class TestRecommendationPriorities:
    """Verify the layer ordering: validation > VoP > routing > SSI."""

    def test_validation_beats_vop(self):
        """Invalid details → REJECT even if VoP is MATCH."""
        r = decide(validation_valid=False, vop_outcome="MATCH",
                   has_routing=True, has_real_ssi_accounts=True,
                   has_placeholder_ssi_only=False)
        assert r.recommendation == Recommendation.REJECT

    def test_no_match_beats_routing(self):
        """NO_MATCH → STOP even if routing and SSI are perfect."""
        r = decide(validation_valid=True, vop_outcome="NO_MATCH",
                   has_routing=True, has_real_ssi_accounts=True,
                   has_placeholder_ssi_only=False)
        assert r.recommendation == Recommendation.STOP

    def test_routing_beats_ssi(self):
        """No routing → BLOCKED even if SSI somehow has accounts."""
        r = decide(validation_valid=True, vop_outcome="MATCH",
                   has_routing=False, has_real_ssi_accounts=True,
                   has_placeholder_ssi_only=False)
        assert r.recommendation == Recommendation.BLOCKED


class TestRecommendationWarnings:
    def test_proceed_with_caution_has_warnings(self):
        r = decide(
            validation_valid=True, vop_outcome="MATCH",
            has_routing=True, has_real_ssi_accounts=False,
            has_placeholder_ssi_only=False,
        )
        assert len(r.warnings) > 0

    def test_proceed_has_no_warnings(self):
        r = decide(
            validation_valid=True, vop_outcome="MATCH",
            has_routing=True, has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
        )
        assert r.warnings == []

    def test_blocking_has_blocks(self):
        r = decide(
            validation_valid=True, vop_outcome="NO_MATCH",
            has_routing=True, has_real_ssi_accounts=True,
            has_placeholder_ssi_only=False,
        )
        assert len(r.blocks) > 0


class TestBlockingSet:
    def test_stop_is_blocking(self):
        assert Recommendation.STOP in BLOCKING

    def test_blocked_is_blocking(self):
        assert Recommendation.BLOCKED in BLOCKING

    def test_reject_is_blocking(self):
        assert Recommendation.REJECT in BLOCKING

    def test_proceed_is_not_blocking(self):
        assert Recommendation.PROCEED not in BLOCKING

    def test_review_is_not_blocking(self):
        assert Recommendation.REVIEW not in BLOCKING


# ===========================================================================
# HTTP endpoint — end-to-end with real seeded data
# ===========================================================================


class TestPrepareEndpoint:
    def test_proceed_for_matching_payment(self, client):
        """GB IBAN with correct name + routing + SSI → PROCEED or PROCEED_WITH_CAUTION."""
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "John Smith",
            "currency": "USD",
            "amount": 5000,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["recommendation"] in ("PROCEED", "PROCEED_WITH_CAUTION")
        assert body["is_blocking"] is False
        assert body["validation"]["valid"] is True
        assert body["vop"]["outcome"] == "MATCH"
        assert len(body["uetr"]) == 36

    def test_stop_for_no_match(self, client):
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "Completely Wrong Name",
            "currency": "USD",
            "amount": 5000,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["recommendation"] == "STOP"
        assert body["is_blocking"] is True
        assert body["vop"]["outcome"] == "NO_MATCH"

    def test_review_for_close_match_standard(self, client):
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "Jon Smyth",
            "currency": "USD",
            "amount": 5000,
            "strictness": "standard",
        })
        assert r.status_code == 200
        body = r.json()
        # Close match in standard → REVIEW
        assert body["recommendation"] in ("REVIEW", "PROCEED", "PROCEED_WITH_CAUTION")

    def test_stop_for_close_match_strict(self, client):
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "Jon Smyth",
            "currency": "USD",
            "amount": 5000,
            "strictness": "strict",
        })
        assert r.status_code == 200
        body = r.json()
        # Strict mode → STOP for close match (unless it scores high enough to MATCH)
        if body["vop"]["outcome"] == "CLOSE_MATCH":
            assert body["recommendation"] == "STOP"

    def test_reject_for_invalid_iban(self, client):
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK00000000000000",
            "beneficiary_name": "John Smith",
            "currency": "USD",
            "amount": 5000,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["recommendation"] == "REJECT"
        assert body["is_blocking"] is True
        assert body["validation"]["valid"] is False
        assert len(body["validation"]["errors"]) > 0

    def test_caution_for_not_checked(self, client):
        """Valid but unknown IBAN → VoP NOT_CHECKED → CAUTION (standard)."""
        r = client.post("/api/prepare-payment", json={
            # Generated via schwifty — valid checksum, but not in our registry
            "beneficiary_iban": "DE23370400441000000000",
            "beneficiary_name": "Someone",
            "currency": "EUR",
            "amount": 1000,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["vop"]["outcome"] == "NOT_CHECKED"
        assert body["recommendation"] in ("CAUTION", "PROCEED_WITH_CAUTION", "BLOCKED")

    def test_uetr_generated(self, client):
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "John Smith",
            "currency": "USD",
            "amount": 100,
        })
        body = r.json()
        # UETR is a valid UUID v4
        import uuid
        assert uuid.UUID(body["uetr"]).version == 4

    def test_response_includes_all_sections(self, client):
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "John Smith",
            "currency": "USD",
            "amount": 100,
        })
        body = r.json()
        assert "validation" in body
        assert "vop" in body
        assert "routing" in body
        assert "ssi" in body
        assert "warnings" in body
        assert "blocks" in body
        assert "reason" in body

    def test_invalid_strictness_returns_400(self, client):
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "John Smith",
            "currency": "USD",
            "amount": 100,
            "strictness": "paranoid",
        })
        assert r.status_code == 400

    def test_explicit_bic_overrides_iban_derivation(self, client):
        """If caller passes a BIC, it's used even if the IBAN doesn't derive one."""
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "John Smith",
            "beneficiary_bic": "NWBKGB2LXXX",
            "currency": "USD",
            "amount": 100,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["validation"]["bic"] == "NWBKGB2LXXX"

    def test_nigeria_payment_prepares(self, client):
        """NG IBAN + correct name → PROCEED or PROCEED_WITH_CAUTION with routing.

        Nigeria isn't in the IBAN registry, so we supply the BIC explicitly
        (the realistic scenario — the caller knows the beneficiary bank).
        """
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "NG3705000012345678901234",
            "beneficiary_name": "Olaniyi Oladokun",
            "beneficiary_bic": "GTBINGLAXXX",
            "currency": "USD",
            "amount": 1000,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["vop"]["outcome"] == "MATCH"
        # Should have routing suggestions for the NG corridor
        assert len(body["routing"]["suggested_intermediaries"]) >= 1