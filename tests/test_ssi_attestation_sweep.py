"""
Tests for the evidence-wide attestation sweep.

The sweep exists because the per-file verifier only runs against wave 21 in
CI. Every other evidence file cites a source nobody re-checks, so a cited
page can move — or stop existing — without anything going red.

The fetcher is injected so these run offline. Network behaviour belongs to
the operator running the sweep, not to the test suite.
"""

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _module():
    path = ROOT / "scripts/ssi-autopilot/sweep_source_attestations.py"
    spec = importlib.util.spec_from_file_location("ssi_attestation_sweep", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _table(rows):
    cells = "".join(
        "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in rows
    )
    return f"<table>{cells}</table>".encode()


def _write(tmp_path, name, evidence):
    path = tmp_path / name
    path.write_text(json.dumps(evidence), encoding="utf-8")
    return path


def _evidence(sweep, source_bytes, **overrides):
    import hashlib

    attestation = sweep.attestation
    fingerprint = attestation.account_fingerprint("890-0045-140")
    evidence = {
        "source": "https://example.invalid/nostro",
        "source_sha256": hashlib.sha256(
            attestation._canonical_source_bytes(source_bytes)
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
    evidence.update(overrides)
    return evidence


class TestSweepClassification:
    def test_an_unchanged_html_source_is_fully_verified(self, tmp_path):
        sweep = _module()
        source = _table([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])
        path = _write(tmp_path, "ok.json", _evidence(sweep, source))

        (result,) = sweep.sweep([path], fetch=lambda url: source)

        assert result["digest"] == "match"
        assert result["status"] == "verified"
        assert result["routes_checked"] is True

    def test_a_changed_digest_is_reported_without_claiming_to_know_why(self, tmp_path):
        sweep = _module()
        source = _table([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])
        path = _write(tmp_path, "moved.json", _evidence(sweep, source))
        moved = _table([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"], ["x"]])

        (result,) = sweep.sweep([path], fetch=lambda url: moved)

        assert result["digest"] == "changed"

    def test_a_pdf_source_is_unreadable_not_drifted(self, tmp_path):
        """
        The distinction the first sweep got wrong: a source the extractor
        cannot parse is not a source whose every route changed.
        """
        sweep = _module()
        pdf = b"%PDF-1.7 not a table"
        path = _write(tmp_path, "pdf.json", _evidence(sweep, pdf))

        (result,) = sweep.sweep([path], fetch=lambda url: pdf)

        assert result["digest"] == "match"
        assert result["status"] == "unreadable"
        assert result["routes_checked"] is False

    def test_evidence_without_routes_is_called_out_separately(self, tmp_path):
        sweep = _module()
        pdf = b"%PDF-1.7"
        evidence = _evidence(sweep, pdf)
        evidence.pop("routes")
        path = _write(tmp_path, "bare.json", evidence)

        (result,) = sweep.sweep([path], fetch=lambda url: pdf)

        assert result["status"] == "no-routes"

    def test_a_dead_source_is_reported_rather_than_raising(self, tmp_path):
        sweep = _module()
        source = _table([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])
        path = _write(tmp_path, "gone.json", _evidence(sweep, source))

        def fetch(url):
            raise OSError("HTTP Error 404: Not Found")

        (result,) = sweep.sweep([path], fetch=fetch)

        assert result["status"] == "fetch-failed"
        assert "404" in result["detail"]
        assert result["digest"] == "unknown"

    def test_one_dead_source_does_not_end_the_sweep(self, tmp_path):
        sweep = _module()
        source = _table([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])
        dead = _write(tmp_path, "a-gone.json", _evidence(sweep, source))
        alive = _write(tmp_path, "b-ok.json", _evidence(sweep, source))

        calls = []

        def fetch(url):
            calls.append(url)
            if len(calls) == 1:
                raise OSError("boom")
            return source

        results = sweep.sweep([dead, alive], fetch=fetch)

        assert len(results) == 2
        assert results[0]["status"] == "fetch-failed"
        assert results[1]["status"] == "verified"

    def test_files_without_a_digest_are_skipped_as_unattested(self, tmp_path):
        sweep = _module()
        source = _table([["Bank of Example", "USD", "890-0045-140", "IRVTUS3N"]])
        evidence = _evidence(sweep, source)
        evidence.pop("source_sha256")
        path = _write(tmp_path, "nodigest.json", evidence)

        (result,) = sweep.sweep([path], fetch=lambda url: source)

        assert result["status"] == "unattested"
        assert result["digest"] == "absent"


class TestSweepNeverLeaksAccounts:
    def test_results_carry_no_raw_account_value(self, tmp_path):
        sweep = _module()
        source = _table([["Bank of Example", "USD", "111-9999-222", "IRVTUS3N"]])
        path = _write(tmp_path, "changed.json", _evidence(sweep, source))

        blob = json.dumps(sweep.sweep([path], fetch=lambda url: source))

        assert "111-9999-222" not in blob
        assert "1119999222" not in blob
