"""
Tests for SSI source re-verification.

A committed source digest is a trust anchor: every downstream check treats
the cited page as unchanged because the digest says so. Replacing that digest
by hand defeats the anchor, and nothing in the previous design could tell the
difference — the offline tests compare an evidence file against a fixture,
and a single edit can move both.

Wave 21 proved the gap is real rather than theoretical. The source page's
`AUD` / `CHASGB2L` account changed, the digest changed with it, and the
digest was re-recorded as a refresh. Currency and BIC were untouched, so the
route-key check passed throughout: route keys cannot see an account move.

These tests pin the three things that close that hole:

1. the account fingerprint derivation, so a fingerprint is reproducible by
   anyone holding the page rather than being an unexplained committed string;
2. a comparison that fails on a changed account even when route keys match;
3. a committed digest being reachable only through a re-verification record.
"""

import importlib.util
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "scripts/ssi-autopilot/evidence/ssi-wave21-fnnbtris-2026-09-08.json"
RECORDS = ROOT / "scripts/ssi-autopilot/evidence/reverification"


def _module():
    path = ROOT / "scripts/ssi-autopilot/verify_source_attestation.py"
    spec = importlib.util.spec_from_file_location("ssi_source_attestation", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _html(rows):
    """Build a source page shaped like the real one: account before the BIC."""
    cells = "".join(
        "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in rows
    )
    return f"<table>{cells}</table>".encode()


class TestAccountFingerprint:
    """The derivation itself, pinned so it cannot drift silently."""

    def test_strips_punctuation_and_uppercases_before_hashing(self):
        attestation = _module()

        # Recovered from the wave-21 page: SHA-256 over the account with every
        # non-alphanumeric character removed and the rest upper-cased.
        assert attestation.account_fingerprint("890-0045-140") == (
            attestation.account_fingerprint("8900045140")
        )
        assert attestation.account_fingerprint("400 886 3169 01 eur") == (
            attestation.account_fingerprint("400886316901EUR")
        )

    def test_is_a_stable_sha256_over_the_normalized_value(self):
        """A golden vector. Changing the derivation invalidates every record."""
        import hashlib

        attestation = _module()

        assert attestation.account_fingerprint("5201-85 650 44") == (
            hashlib.sha256(b"52018565044").hexdigest()
        )

    def test_distinct_accounts_never_share_a_fingerprint(self):
        attestation = _module()

        assert attestation.account_fingerprint("111-222") != (
            attestation.account_fingerprint("111-223")
        )


class TestRouteFingerprintExtraction:
    """Pairing a route key with the account that sits beside it."""

    def test_takes_the_cell_immediately_before_the_intermediary_bic(self):
        attestation = _module()
        html = _html([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N", "SEC. *"]])

        assert attestation.route_fingerprints(html, {}) == {
            ("USD", "IRVTUS3N"): attestation.account_fingerprint("890-0045-140"),
        }

    def test_applies_bic_aliases_so_the_key_matches_committed_evidence(self):
        attestation = _module()
        html = _html([["Standard Chartered", "EUR", "18001801", "SCBLDEFX"]])

        assert attestation.route_fingerprints(html, {"SCBLDEFX": "SCBLDEFFXXX"}) == {
            ("EUR", "SCBLDEFFXXX"): attestation.account_fingerprint("18001801"),
        }

    def test_tolerates_a_bic_rendered_with_internal_spaces(self):
        """The live page renders CITIUS33 as `CITI US 33`."""
        attestation = _module()
        html = _html([["Citibank NA", "USD", "36119062", "CITI US 33"]])

        assert attestation.route_fingerprints(html, {}) == {
            ("USD", "CITIUS33"): attestation.account_fingerprint("36119062"),
        }


class TestComparisonFailsClosed:
    """The check that route keys alone could not make."""

    def _evidence(self, fingerprint):
        return {
            "source": "https://example.invalid/nostro",
            "source_sha256": "unused-by-compare",
            "source_snapshot": {"bic_aliases": {}},
            "routes": [
                {
                    "currency": "USD",
                    "int_bic": "IRVTUS3N",
                    "nostro_fingerprint": fingerprint,
                    "with_an_fingerprint": fingerprint,
                }
            ],
        }

    def test_a_changed_account_is_reported_even_though_route_keys_match(self):
        """
        The wave-21 defect exactly: same currency, same BIC, new account.
        A route-key comparison sees nothing wrong here.
        """
        attestation = _module()
        committed = attestation.account_fingerprint("890-0045-140")
        evidence = self._evidence(committed)
        source = _html([["Bank of Example", "USD", "111-9999-222", "IRVTUS3N"]])

        report = attestation.compare(evidence, source)

        assert report["route_keys"]["match"] is True
        assert report["fingerprints"]["matched"] == 0
        assert report["fingerprints"]["changed"] == [
            {"currency": "USD", "int_bic": "IRVTUS3N"}
        ]
        assert report["match"] is False

    def test_an_unchanged_page_compares_clean(self):
        attestation = _module()
        committed = attestation.account_fingerprint("890-0045-140")
        evidence = self._evidence(committed)
        source = _html([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])

        report = attestation.compare(evidence, source)

        assert report["route_keys"]["match"] is True
        assert report["fingerprints"]["changed"] == []
        assert report["match"] is True

    def test_a_partially_changed_page_is_reported_route_by_route(self):
        """One route gone, others intact: a report, not a refusal."""
        attestation = _module()
        fingerprint = attestation.account_fingerprint("890-0045-140")
        evidence = self._evidence(fingerprint)
        evidence["routes"].append(
            {
                "currency": "EUR",
                "int_bic": "CHASDEFX",
                "nostro_fingerprint": fingerprint,
                "with_an_fingerprint": fingerprint,
            }
        )
        source = _html([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])

        report = attestation.compare(evidence, source)

        assert report["route_keys"]["missing"] == [("EUR", "CHASDEFX")]
        assert report["match"] is False

    def test_a_source_the_extractor_cannot_read_refuses_rather_than_reports(self):
        """
        Extracting nothing from a page that should hold routes means the
        extractor did not understand the format — waves 22-28 cite PDFs, not
        HTML tables. Reporting that as "every route changed" would be a
        confident lie, and would send someone hunting for drift that is not
        there.
        """
        attestation = _module()
        evidence = self._evidence(attestation.account_fingerprint("890-0045-140"))

        with pytest.raises(SystemExit) as excinfo:
            attestation.compare(evidence, b"%PDF-1.7 binary bytes, no table here")

        message = str(excinfo.value).lower()
        assert "extract" in message
        assert "0" in message or "no route" in message

    def test_an_evidence_file_with_no_routes_does_not_trip_the_guard(self):
        attestation = _module()

        report = attestation.compare(
            {"source_sha256": "x", "routes": [], "source_snapshot": {"bic_aliases": {}}},
            b"%PDF-1.7",
        )

        assert report["fingerprints"]["checked"] == 0

    def test_compare_never_returns_a_raw_account(self):
        attestation = _module()
        evidence = self._evidence(attestation.account_fingerprint("890-0045-140"))
        source = _html([["Bank of Example", "USD", "111-9999-222", "IRVTUS3N"]])

        blob = json.dumps(attestation.compare(evidence, source))

        assert "111-9999-222" not in blob
        assert "1119999222" not in blob


class TestCommittedDigestIsCoveredByARecord:
    """
    The anchor. A digest may only be the one some re-verification record
    reports having seen on the live page.
    """

    def _records(self):
        if not RECORDS.is_dir():
            return []
        return [json.loads(path.read_text()) for path in sorted(RECORDS.glob("*.json"))]

    def test_the_wave21_digest_is_named_by_a_reverification_record(self):
        evidence = json.loads(EVIDENCE.read_text())
        relative = EVIDENCE.relative_to(ROOT).as_posix()

        covering = [
            record
            for record in self._records()
            if record["evidence"] == relative
            and record["source_sha256"] == evidence["source_sha256"]
        ]

        assert covering, (
            "No re-verification record names the committed source digest "
            f"{evidence['source_sha256'][:12]}. A digest may only be changed by "
            "running verify_source_attestation.py --refresh --record, which "
            "re-derives every route fingerprint from the live page first."
        )

    def test_the_covering_record_reports_a_clean_comparison(self):
        evidence = json.loads(EVIDENCE.read_text())
        relative = EVIDENCE.relative_to(ROOT).as_posix()
        record = next(
            record
            for record in self._records()
            if record["evidence"] == relative
            and record["source_sha256"] == evidence["source_sha256"]
        )

        assert record["route_keys"]["match"] is True
        assert record["fingerprints"]["changed"] == []
        assert record["fingerprints"]["matched"] == len(evidence["routes"])

    def test_records_commit_no_raw_account_values(self):
        for record in self._records():
            assert record["raw_accounts_committed"] is False
            blob = json.dumps(record)
            # An account-shaped run of digits would mean the tool leaked one.
            assert not re.search(r"\b\d{6,}\b", blob), record["evidence"]

    def test_every_record_carries_the_fields_the_schema_promises(self):
        required = {
            "schema",
            "evidence",
            "source",
            "verified_at",
            "previous_source_sha256",
            "source_sha256",
            "digest_changed",
            "route_keys",
            "fingerprints",
            "raw_accounts_committed",
            "tool",
        }
        records = self._records()
        assert records, "expected at least one re-verification record"
        for record in records:
            assert required <= set(record), required - set(record)
            assert record["schema"] == 1


class TestWave21AccountDriftIsRecorded:
    """
    The AUD/CHASGB2L account moved at the source. The committed fingerprint
    has to be the one the page actually serves, not the pre-drift value.
    """

    def test_no_committed_fingerprint_is_the_stale_pre_drift_value(self):
        stale = "a0dd86fff2fd6e5b3d5debc8ae45ed0d0a7f1440ac1ae9a1748c958f9b17462b"
        evidence = json.loads(EVIDENCE.read_text())

        committed = {route["nostro_fingerprint"] for route in evidence["routes"]} | {
            route["with_an_fingerprint"] for route in evidence["routes"]
        }

        assert stale not in committed

    def test_the_two_evidence_blocks_agree_on_every_fingerprint(self):
        """`routes` and `source_snapshot.routes` carry the same values twice."""
        evidence = json.loads(EVIDENCE.read_text())
        outer = {
            (route["currency"], route["int_bic"]): route["nostro_fingerprint"]
            for route in evidence["routes"]
        }
        inner = {
            (route["currency"], route["int_bic"]): route["nostro_fingerprint"]
            for route in evidence["source_snapshot"]["routes"]
        }

        assert outer == inner


class TestAcceptingAChangeCannotBreakMaskEquality:
    """
    Masks encode account equality: two routes share a token exactly when they
    share an account. If an accepted change lands on an account another route
    already uses, replacing the fingerprint alone leaves the mask saying the
    accounts differ while the fingerprint says they match.
    """

    def _evidence(self, attestation):
        moving = attestation.account_fingerprint("111-111")
        settled = attestation.account_fingerprint("222-222")
        routes = [
            {
                "currency": "AUD",
                "int_bic": "CHASGB2L",
                "nostro_fingerprint": moving,
                "with_an_fingerprint": moving,
                "nostro_mask": "ACCT-91001005",
                "with_an_mask": "ACCT-91001005",
            },
            {
                "currency": "USD",
                "int_bic": "IRVTUS3N",
                "nostro_fingerprint": settled,
                "with_an_fingerprint": settled,
                "nostro_mask": "ACCT-91001029",
                "with_an_mask": "ACCT-91001029",
            },
        ]
        return {
            "source": "https://example.invalid/nostro",
            "source_sha256": "unused",
            "source_snapshot": {"bic_aliases": {}, "routes": routes},
            "routes": routes,
        }

    def test_refuses_when_the_new_account_collides_with_another_route(self):
        attestation = _module()
        evidence = self._evidence(attestation)
        # AUD's account moves onto the value USD already uses.
        source = _html(
            [
                ["JPMorgan", "AUD", "222-222", "CHASGB2L"],
                ["BNY Mellon", "USD", "222-222", "IRVTUS3N"],
            ]
        )

        with pytest.raises(SystemExit) as excinfo:
            attestation._apply_accepted_changes(
                evidence, source, {("AUD", "CHASGB2L")}
            )

        assert "mask" in str(excinfo.value).lower()

    def test_allows_a_move_to_an_account_no_other_route_uses(self):
        attestation = _module()
        evidence = self._evidence(attestation)
        source = _html(
            [
                ["JPMorgan", "AUD", "333-333", "CHASGB2L"],
                ["BNY Mellon", "USD", "222-222", "IRVTUS3N"],
            ]
        )

        applied = attestation._apply_accepted_changes(
            evidence, source, {("AUD", "CHASGB2L")}
        )

        assert applied == [{"currency": "AUD", "int_bic": "CHASGB2L"}]
        assert evidence["routes"][0]["nostro_fingerprint"] == (
            attestation.account_fingerprint("333-333")
        )
        # The mask stays put: the route is still a singleton.
        assert evidence["routes"][0]["nostro_mask"] == "ACCT-91001005"


class TestArgumentGuards:
    """A refresh that leaves no record is the defect this change exists to fix."""

    def test_refresh_requires_a_record_destination(self):
        attestation = _module()

        with pytest.raises(SystemExit):
            attestation.parse_args([str(EVIDENCE), "--refresh"])

    def test_accepting_an_account_change_requires_a_refresh(self):
        attestation = _module()

        with pytest.raises(SystemExit):
            attestation.parse_args([str(EVIDENCE), "--accept-account-change", "AUD:CHASGB2L"])

    def test_a_refresh_with_a_record_destination_is_allowed(self, tmp_path):
        attestation = _module()

        args = attestation.parse_args(
            [str(EVIDENCE), "--refresh", "--record", str(tmp_path)]
        )

        assert args.refresh is True
        assert args.record == tmp_path

    def test_plain_verification_needs_no_flags(self):
        attestation = _module()

        args = attestation.parse_args([str(EVIDENCE)])

        assert args.refresh is False
        assert args.record is None
