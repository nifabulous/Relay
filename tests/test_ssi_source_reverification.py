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
3. a committed digest being accompanied by a re-verification record, so a
   silent edit fails offline — repository consistency, not proof the tool
   ran; see TestRepositoryConsistencyBetweenDigestAndRecord for what that does
   and does not establish.
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
        # This fixture carries a placeholder digest, so the assertion is about
        # routes and accounts. `match` additionally requires the digest, and
        # TestCompareMatchAccountsForTheDigest covers that.
        assert report["routes_and_accounts_match"] is True

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

    def test_evidence_recording_no_routes_refuses_instead_of_verifying_nothing(self):
        """
        `ssi-wave18-bbdebrsp` pins a digest and records no routes at all.
        Comparing it would report a clean match over an empty set — the most
        misleading answer the tool could give.
        """
        attestation = _module()

        with pytest.raises(SystemExit) as excinfo:
            attestation.compare(
                {
                    "source_sha256": "x",
                    "routes": [],
                    "source_snapshot": {"bic_aliases": {}},
                },
                b"%PDF-1.7",
            )

        assert "no routes" in str(excinfo.value).lower()

    def test_the_same_refusal_covers_an_evidence_file_missing_the_key_entirely(self):
        attestation = _module()

        with pytest.raises(SystemExit):
            attestation.compare(
                {"source_sha256": "x", "source_snapshot": {"bic_aliases": {}}},
                b"%PDF-1.7",
            )

    def test_compare_never_returns_a_raw_account(self):
        attestation = _module()
        evidence = self._evidence(attestation.account_fingerprint("890-0045-140"))
        source = _html([["Bank of Example", "USD", "111-9999-222", "IRVTUS3N"]])

        blob = json.dumps(attestation.compare(evidence, source))

        assert "111-9999-222" not in blob
        assert "1119999222" not in blob


class TestRepositoryConsistencyBetweenDigestAndRecord:
    """
    Repository consistency, and only that.

    These assert that a committed digest is accompanied by a record claiming
    the checks were run against it — so a digest edited silently, with no
    record, fails offline with no network needed.

    What they do not establish: that the tool produced either file. A record
    is ordinary repository content, so a hand can edit the digest to one an
    existing record already names, or write a matching record outright. There
    is no signature and no append-only chain here.

    The authority on what the source says today is the live check CI runs on
    every pull request. The record's value is that it makes a falsifiable,
    reproducible claim — re-run the tool and find out — where previously a
    refreshed digest carried no claim at all.
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
            f"{evidence['source_sha256'][:12]}. Refresh it by running "
            "verify_source_attestation.py --refresh --record, which re-derives "
            "every route fingerprint from the live page first. This check "
            "enforces that a digest change is accompanied by its record; the "
            "live check CI runs is what establishes the source content itself."
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


class TestDuplicateRouteKeys:
    """
    Route keys live in a set and fingerprints in a dict, so a source listing
    one currency/BIC twice silently collapses to whichever row came last. An
    evidence file holding that last account then verifies clean while the
    source carries a second, conflicting settlement instruction.
    """

    def test_two_rows_with_the_same_key_and_different_accounts_are_refused(self):
        attestation = _module()
        html = _html(
            [
                ["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"],
                ["Bank of Example", "USD", "111-9999-222", "IRVTUS3N"],
            ]
        )

        with pytest.raises(attestation.DuplicateRouteKey) as excinfo:
            attestation.route_fingerprints(html, {})

        assert "USD" in str(excinfo.value)
        assert "IRVTUS3N" in str(excinfo.value)

    def test_an_exactly_repeated_row_carries_no_ambiguity_and_is_allowed(self):
        """
        A page rendering one instruction twice says the same thing twice.
        Refusing it would be a false alarm; only a conflict is a conflict.
        """
        attestation = _module()
        html = _html(
            [
                ["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"],
                ["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"],
            ]
        )

        assert attestation.route_fingerprints(html, {}) == {
            ("USD", "IRVTUS3N"): attestation.account_fingerprint("890-0045-140"),
        }

    def test_the_conflict_is_caught_through_compare_too(self):
        attestation = _module()
        fingerprint = attestation.account_fingerprint("890-0045-140")
        evidence = {
            "source": "https://example.invalid/nostro",
            "source_sha256": "unused",
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
        html = _html(
            [
                ["Bank of Example", "USD", "111-9999-222", "IRVTUS3N"],
                ["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"],
            ]
        )

        with pytest.raises(attestation.DuplicateRouteKey):
            attestation.compare(evidence, html)


class TestMissingRoutesAreNotAccountMoves:
    """
    An absent route key has no live fingerprint to compare. Counting it as an
    account move reports one defect twice and inflates the account-change
    count the sweep summarises.
    """

    def test_an_absent_route_is_a_route_mismatch_only(self):
        attestation = _module()
        fingerprint = attestation.account_fingerprint("890-0045-140")
        evidence = {
            "source": "https://example.invalid/nostro",
            "source_sha256": "unused",
            "source_snapshot": {"bic_aliases": {}},
            "routes": [
                {
                    "currency": "USD",
                    "int_bic": "IRVTUS3N",
                    "nostro_fingerprint": fingerprint,
                    "with_an_fingerprint": fingerprint,
                },
                {
                    "currency": "EUR",
                    "int_bic": "CHASDEFX",
                    "nostro_fingerprint": fingerprint,
                    "with_an_fingerprint": fingerprint,
                },
            ],
        }
        source = _html([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])

        report = attestation.compare(evidence, source)

        assert report["route_keys"]["missing"] == [("EUR", "CHASDEFX")]
        assert report["fingerprints"]["changed"] == []
        assert report["fingerprints"]["checked"] == 1
        assert report["match"] is False

    def test_a_present_route_whose_account_moved_is_still_an_account_change(self):
        attestation = _module()
        evidence = {
            "source": "https://example.invalid/nostro",
            "source_sha256": "unused",
            "source_snapshot": {"bic_aliases": {}},
            "routes": [
                {
                    "currency": "USD",
                    "int_bic": "IRVTUS3N",
                    "nostro_fingerprint": attestation.account_fingerprint("890-0045-140"),
                    "with_an_fingerprint": attestation.account_fingerprint("890-0045-140"),
                }
            ],
        }
        source = _html([["Bank of Example", "USD", "111-9999-222", "IRVTUS3N"]])

        report = attestation.compare(evidence, source)

        assert report["fingerprints"]["changed"] == [
            {"currency": "USD", "int_bic": "IRVTUS3N"}
        ]


class TestAnEmptyCellIsNotAnAccount:
    """
    `account_fingerprint("")` is a perfectly valid SHA-256. So is the
    fingerprint of a cell holding only punctuation, or a correspondent's name.
    Nothing downstream can tell those apart from a real account, so an
    accepted change could commit the hash of a missing account and every
    later comparison would agree with it.
    """

    def test_an_empty_account_cell_is_refused(self):
        attestation = _module()
        source = _html([["Bank of Example", "USD", "", "IRVTUS3N"]])

        with pytest.raises(attestation.UnreadableSource):
            attestation.route_fingerprints(source, {})

    def test_a_punctuation_only_cell_is_refused(self):
        attestation = _module()
        source = _html([["Bank of Example", "USD", "-- / --", "IRVTUS3N"]])

        with pytest.raises(attestation.UnreadableSource):
            attestation.route_fingerprints(source, {})

    def test_a_cell_with_no_digits_is_refused(self):
        """A correspondent name where the account should be."""
        attestation = _module()
        source = _html([["Bank of Example", "USD", "Head Office", "IRVTUS3N"]])

        with pytest.raises(attestation.UnreadableSource):
            attestation.route_fingerprints(source, {})

    def test_a_real_account_still_reads(self):
        attestation = _module()
        source = _html([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])

        assert attestation.route_fingerprints(source, {}) == {
            ("USD", "IRVTUS3N"): attestation.account_fingerprint("890-0045-140"),
        }

    def test_accepting_a_change_cannot_commit_an_empty_account(self):
        attestation = _module()
        fingerprint = attestation.account_fingerprint("890-0045-140")
        evidence = {
            "source": "https://example.invalid/nostro",
            "source_sha256": "unused",
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
        source = _html([["Bank of Example", "USD", "", "IRVTUS3N"]])

        with pytest.raises(attestation.UnreadableSource):
            attestation._apply_accepted_changes(
                evidence, source, {("USD", "IRVTUS3N")}
            )

        assert evidence["routes"][0]["nostro_fingerprint"] == fingerprint


class TestFetchesAreBounded:
    """
    The sweep points this fetcher at 60 third-party URLs. A timeout bounds how
    long a server may take, not how much it may send, so one source streaming
    without end could exhaust the worker and take the whole sweep with it.
    """

    def test_a_response_over_the_limit_is_refused(self):
        import io

        attestation = _module()

        with pytest.raises(attestation.SourceTooLarge):
            attestation._read_bounded(io.BytesIO(b"x" * 5000), limit=1000)

    def test_a_response_under_the_limit_is_returned_whole(self):
        import io

        attestation = _module()

        assert attestation._read_bounded(io.BytesIO(b"x" * 900), limit=1000) == b"x" * 900

    def test_the_limit_is_exact_rather_than_approximate(self):
        import io

        attestation = _module()

        assert len(attestation._read_bounded(io.BytesIO(b"x" * 1000), limit=1000)) == 1000

    def test_a_non_http_scheme_is_refused_before_any_request(self):
        attestation = _module()

        with pytest.raises(attestation.UnsupportedSourceScheme):
            attestation._fetch("file:///etc/passwd")

    def test_the_default_limit_is_declared_rather_than_implicit(self):
        attestation = _module()

        assert attestation.MAX_SOURCE_BYTES > 0


class TestARouteKeyWithoutAnExtractableAccount:
    """
    The two extractors can disagree. `_route_keys` accepts any row carrying a
    currency and a BIC; `route_fingerprints` needs a cell *before* the BIC to
    read the account from, so a row whose BIC sits first yields a route key
    and no fingerprint.

    Skipping such a route — which is what the missing-route fix did — lets the
    route-key check pass while that route's account goes unchecked. Silence
    about an account is the one thing this tool must never do.
    """

    def _evidence(self, attestation):
        fingerprint = attestation.account_fingerprint("890-0045-140")
        return {
            "source": "https://example.invalid/nostro",
            "source_sha256": "unused",
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

    def test_a_present_route_with_no_readable_account_is_refused(self):
        attestation = _module()
        # BIC first, so there is no cell before it to read an account from.
        source = _html([["IRVTUS3N", "USD", "890-0045-140"]])

        assert ("USD", "IRVTUS3N") in attestation._route_keys(source)
        assert ("USD", "IRVTUS3N") not in attestation.route_fingerprints(source, {})

        with pytest.raises(attestation.UnreadableSource) as excinfo:
            attestation.compare(self._evidence(attestation), source)

        assert "IRVTUS3N" in str(excinfo.value)

    def test_a_genuinely_absent_route_is_still_only_a_route_mismatch(self):
        """The missing-route fix has to survive: absent is not unreadable."""
        attestation = _module()
        evidence = self._evidence(attestation)
        evidence["routes"].append(
            {
                "currency": "EUR",
                "int_bic": "CHASDEFX",
                "nostro_fingerprint": attestation.account_fingerprint("890-0045-140"),
                "with_an_fingerprint": attestation.account_fingerprint("890-0045-140"),
            }
        )
        source = _html([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])

        report = attestation.compare(evidence, source)

        assert report["route_keys"]["missing"] == [("EUR", "CHASDEFX")]
        assert report["fingerprints"]["changed"] == []


class TestCompareMatchAccountsForTheDigest:
    """
    `match` is the public answer to "did this verify". Returning true while
    the digest differs contradicts the three-check contract in the one field
    a future caller is most likely to read on its own.
    """

    def _evidence(self, attestation, source, digest=None):
        import hashlib

        fingerprint = attestation.account_fingerprint("890-0045-140")
        return {
            "source": "https://example.invalid/nostro",
            "source_sha256": digest
            or hashlib.sha256(
                attestation._canonical_source_bytes(source)
            ).hexdigest(),
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

    def test_match_is_true_only_when_all_three_checks_pass(self):
        attestation = _module()
        source = _html([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])

        report = attestation.compare(self._evidence(attestation, source), source)

        assert report["digest_matches"] is True
        assert report["routes_and_accounts_match"] is True
        assert report["match"] is True

    def test_a_changed_digest_makes_match_false_even_with_intact_routes(self):
        attestation = _module()
        source = _html([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])
        evidence = self._evidence(attestation, source, digest="0" * 64)

        report = attestation.compare(evidence, source)

        assert report["digest_matches"] is False
        assert report["routes_and_accounts_match"] is True, (
            "the refresh path needs this narrower answer, which is why it is "
            "reported separately rather than folded into match"
        )
        assert report["match"] is False


class TestEveryCommittedFingerprintIsChecked:
    """
    A route carries its fingerprint twice — once in `routes`, once in
    `source_snapshot.routes` — and each entry carries a nostro and a with_an
    value. Checking one of the four and reporting "verified" leaves three
    fields a hand can edit freely.
    """

    def _evidence(self, attestation, **tamper):
        fingerprint = attestation.account_fingerprint("890-0045-140")
        outer = {
            "currency": "USD",
            "int_bic": "IRVTUS3N",
            "nostro_fingerprint": fingerprint,
            "with_an_fingerprint": fingerprint,
            "nostro_mask": "ACCT-91001029",
            "with_an_mask": "ACCT-91001029",
        }
        inner = dict(outer)
        outer.update(tamper.get("outer", {}))
        inner.update(tamper.get("inner", {}))
        return {
            "source": "https://example.invalid/nostro",
            "source_sha256": "unused",
            "source_snapshot": {"bic_aliases": {}, "routes": [inner]},
            "routes": [outer],
        }

    def _source(self):
        return _html([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])

    def test_an_untampered_file_still_verifies(self):
        attestation = _module()

        report = attestation.compare(self._evidence(attestation), self._source())

        assert report["routes_and_accounts_match"] is True

    def test_a_tampered_with_an_fingerprint_is_caught(self):
        attestation = _module()
        evidence = self._evidence(attestation, outer={"with_an_fingerprint": "de" * 32})

        report = attestation.compare(evidence, self._source())

        assert report["match"] is False
        assert report["fingerprints"]["changed"]

    def test_a_tampered_snapshot_copy_is_caught(self):
        attestation = _module()
        evidence = self._evidence(attestation, inner={"nostro_fingerprint": "ad" * 32})

        report = attestation.compare(evidence, self._source())

        assert report["match"] is False

    def test_route_keys_only_evidence_cannot_claim_a_verified_comparison(self):
        """
        The legacy shape carries route keys and no fingerprints at all. It
        used to compare clean with zero fingerprints checked, which is the
        three-check contract quietly reduced to two.
        """
        attestation = _module()
        evidence = {
            "source": "https://example.invalid/nostro",
            "source_sha256": "unused",
            "bic_aliases": {},
            "route_keys": [["USD", "IRVTUS3N"]],
        }

        with pytest.raises(attestation.EvidenceWithoutFingerprints):
            attestation.compare(evidence, self._source())

    def test_partially_fingerprinted_evidence_is_refused_too(self):
        attestation = _module()
        evidence = self._evidence(attestation)
        evidence["routes"].append({"currency": "EUR", "int_bic": "CHASDEFX"})

        with pytest.raises(attestation.EvidenceWithoutFingerprints):
            attestation.compare(evidence, self._source())


class TestMaskEqualitySurvivesAnAcceptedChange:
    """
    Masks encode account equality in both directions. The first version of
    this guard only caught a route *joining* another route's account; a route
    *leaving* a shared account left the masks claiming an equality the
    fingerprints no longer had.
    """

    def _evidence(self, attestation, shared="111-111"):
        shared_fp = attestation.account_fingerprint(shared)
        routes = [
            {
                "currency": "AUD",
                "int_bic": "CHASGB2L",
                "nostro_fingerprint": shared_fp,
                "with_an_fingerprint": shared_fp,
                "nostro_mask": "ACCT-91001005",
                "with_an_mask": "ACCT-91001005",
            },
            {
                "currency": "USD",
                "int_bic": "IRVTUS3N",
                "nostro_fingerprint": shared_fp,
                "with_an_fingerprint": shared_fp,
                "nostro_mask": "ACCT-91001005",
                "with_an_mask": "ACCT-91001005",
            },
        ]
        return {
            "source": "https://example.invalid/nostro",
            "source_sha256": "unused",
            "source_snapshot": {"bic_aliases": {}, "routes": [dict(r) for r in routes]},
            "routes": routes,
        }

    def test_a_route_leaving_a_shared_account_is_refused(self):
        """AUD moves off the account it shared with USD. The mask must split."""
        attestation = _module()
        evidence = self._evidence(attestation)
        source = _html(
            [
                ["JPMorgan", "AUD", "999-999", "CHASGB2L"],
                ["BNY Mellon", "USD", "111-111", "IRVTUS3N"],
            ]
        )

        with pytest.raises(attestation.MaskEqualityBroken) as excinfo:
            attestation._apply_accepted_changes(
                evidence, source, {("AUD", "CHASGB2L")}
            )

        assert "mask" in str(excinfo.value).lower()

    def test_a_route_joining_another_account_is_still_refused(self):
        attestation = _module()
        evidence = self._evidence(attestation)
        evidence["routes"][1]["nostro_fingerprint"] = attestation.account_fingerprint("222-222")
        evidence["routes"][1]["with_an_fingerprint"] = evidence["routes"][1]["nostro_fingerprint"]
        evidence["routes"][1]["nostro_mask"] = "ACCT-91001029"
        evidence["routes"][1]["with_an_mask"] = "ACCT-91001029"
        source = _html(
            [
                ["JPMorgan", "AUD", "222-222", "CHASGB2L"],
                ["BNY Mellon", "USD", "222-222", "IRVTUS3N"],
            ]
        )

        with pytest.raises(attestation.MaskEqualityBroken):
            attestation._apply_accepted_changes(
                evidence, source, {("AUD", "CHASGB2L")}
            )

    def test_a_singleton_moving_to_another_unique_account_is_allowed(self):
        attestation = _module()
        evidence = self._evidence(attestation)
        evidence["routes"][1]["nostro_fingerprint"] = attestation.account_fingerprint("222-222")
        evidence["routes"][1]["with_an_fingerprint"] = evidence["routes"][1]["nostro_fingerprint"]
        evidence["routes"][1]["nostro_mask"] = "ACCT-91001029"
        evidence["routes"][1]["with_an_mask"] = "ACCT-91001029"
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


class TestRefreshLeavesNoUnrecordedState:
    """
    The whole point is that a changed digest carries its justification. If the
    evidence is written and the record then fails, the repository holds
    exactly the unrecorded refresh this tooling exists to prevent.
    """

    def test_a_failing_record_write_leaves_the_evidence_untouched(
        self, tmp_path, monkeypatch
    ):
        attestation = _module()
        source = _html([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])
        fingerprint = attestation.account_fingerprint("890-0045-140")
        evidence = {
            "source": "https://example.invalid/nostro",
            "source_sha256": "stale-digest",
            "source_snapshot": {"bic_aliases": {}, "captured_at": "2020-01-01"},
            "routes": [
                {
                    "currency": "USD",
                    "int_bic": "IRVTUS3N",
                    "nostro_fingerprint": fingerprint,
                    "with_an_fingerprint": fingerprint,
                    "nostro_mask": "ACCT-91001029",
                    "with_an_mask": "ACCT-91001029",
                }
            ],
        }
        path = tmp_path / "evidence.json"
        path.write_text(json.dumps(evidence), encoding="utf-8")
        before = path.read_text(encoding="utf-8")

        monkeypatch.setattr(attestation, "_fetch", lambda url: source)

        def explode(*args, **kwargs):
            raise OSError("disk full")

        monkeypatch.setattr(attestation, "_write_record", explode)

        with pytest.raises(OSError):
            attestation.reverify(path, tmp_path / "records", [])

        assert path.read_text(encoding="utf-8") == before, (
            "the digest was rewritten even though its record could not be written"
        )


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
